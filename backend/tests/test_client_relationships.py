"""Real HTTP routes; isolated database, no external accounts or invitations."""
from unittest.mock import AsyncMock, patch
import test_client_dashboard_sources as harness

server = harness.server


class ClientRelationshipsTests(harness.ClientDashboardSourcesTests):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.sign_in('admin')

    async def test_shared_programs_follow_finalized_enrollment_without_read_writes_or_foreign_data(self):
        from framework_catalog import CATALOGS
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'onboarding_baseline': {
            'completed': True, 'requirements': {'cis-ig1': 'applies', 'soc-2': 'does_not_apply'}}}})
        rows = [
            {'requirement_id': ident, 'client_id': cid, 'baseline_key': key, 'baseline_response': response}
            for ident, cid, key, response in [
                ('a-iso', 'a', 'iso-27001', 'applies'), ('a-iso-duplicate', 'a', 'iso-27001', 'applies'),
                ('a-soc', 'a', 'soc-2', 'applies'), ('b-cis', 'b', 'cis-ig1', 'applies'),
                ('a-hipaa', 'a', 'hipaa', 'applies')]]
        await server.db.requirements.delete_many({})
        await server.db.requirements.insert_many(rows)
        before = {name: await server.db[name].find({}, {'_id': 0}).to_list(None)
                  for name in ('clients', 'requirements', 'framework_assessments', 'audit_logs')}
        self.sign_in('member')
        response = await self.client.get('/api/clients')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('b', [row['client_id'] for row in response.json()])
        client = next(row for row in response.json() if row['client_id'] == 'a')
        self.assertFalse(client['cis_program']['selected'])
        self.assertEqual(client['shared_programs'], [{
            'client_id': 'a', 'program_id': f'a:{key}', 'framework_key': key,
            'version': CATALOGS[key]['version'], 'selected': True,
        } for key in ('iso-27001', 'soc-2')])
        after = {name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in before}
        self.assertEqual(after, before)
        await server.db.requirements.delete_many({'client_id': 'a'})
        client = next(row for row in (await self.client.get('/api/clients')).json() if row['client_id'] == 'a')
        self.assertEqual(client['shared_programs'], [])

    async def test_new_client_contact_once_without_account_or_membership_changes(self):
        before = await server.db.users.find({}, {'_id': 0}).to_list(None)
        with patch.object(server, 'send_email', new_callable=AsyncMock) as send:
            result = await self.client.post('/api/clients', json={'name': 'Northstar Manufacturing',
                'primary_contact_details': {'name': 'Maya Chen', 'email': 'maya@northstar.example', 'title': 'IT Director'},
                'assigned_owner_id': 'admin'})
            send.assert_not_awaited()
        self.assertEqual(result.status_code, 200, result.text)
        client = result.json()
        contacts = await server.db.contacts.find({'client_id': client['client_id']}, {'_id': 0}).to_list(None)
        self.assertEqual(len(contacts), 1)
        self.assertEqual(client['primary_contact_id'], contacts[0]['contact_id'])
        self.assertEqual(client['primary_contact_record']['title'], 'IT Director')
        self.assertFalse(contacts[0].get('linked_user_id'))
        self.assertEqual(await server.db.users.find({}, {'_id': 0}).to_list(None), before)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': {'$in': ['invite', 'invite-contact']}}), 0)
        reload = next(c for c in (await self.client.get('/api/clients')).json() if c['client_id'] == client['client_id'])
        self.assertEqual(reload, client)

    async def test_existing_contact_selection_replacement_legacy_archive_and_clear(self):
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'primary_contact': 'Legacy Maya — details retained'}})
        for ident, name in [('maya', 'Maya'), ('jordan', 'Jordan')]:
            await server.db.contacts.insert_one({'contact_id': ident, 'client_id': 'a', 'name': name, 'status': 'active'})
        for ident in ['maya', 'jordan', 'jordan']:
            response = await self.client.patch('/api/clients/a', json={'primary_contact_id': ident})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['primary_contact_record']['contact_id'], ident)
        self.assertEqual(await server.db.contacts.count_documents({'client_id': 'a'}), 2)
        self.assertEqual((await self.client.delete('/api/contacts/jordan')).status_code, 409)
        self.assertEqual((await self.client.post('/api/bulk', json={'kind': 'contacts', 'action': 'delete', 'ids': ['maya', 'jordan']})).status_code, 409)
        self.assertEqual(await server.db.contacts.count_documents({'client_id': 'a'}), 2)
        await server.db.contacts.update_one({'contact_id': 'jordan'}, {'$set': {'name': 'Jordan Lee', 'status': 'inactive'}})
        result = (await self.client.patch('/api/clients/a', json={'industry': 'Manufacturing'})).json()
        self.assertEqual(result['primary_contact_record']['name'], 'Jordan Lee')
        self.assertEqual(result['primary_contact_record']['status'], 'inactive')
        self.assertEqual(result['primary_contact'], 'Legacy Maya — details retained')
        cleared = (await self.client.patch('/api/clients/a', json={'primary_contact_id': ''})).json()
        self.assertIsNone(cleared['primary_contact_record'])
        self.assertEqual(await server.db.contacts.count_documents({'client_id': 'a'}), 2)
        self.assertEqual((await self.client.patch('/api/clients/a', json={'primary_contact_id': 'jordan'})).status_code, 422)

    async def test_tenant_checks_apply_even_to_superadmin_and_minimal_projection(self):
        await server.db.contacts.insert_one({'contact_id': 'foreign', 'client_id': 'b', 'name': 'Maya', 'status': 'active', 'notes': 'private'})
        self.assertEqual((await self.client.patch('/api/clients/a', json={'primary_contact_id': 'foreign'})).status_code, 422)
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'primary_contact_id': 'foreign'}})
        a = next(c for c in (await self.client.get('/api/clients')).json() if c['client_id'] == 'a')
        self.assertIsNone(a['primary_contact_record'])
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/clients/grc-leads?client_id=a')).status_code, 403)
        self.assertEqual((await self.client.patch('/api/clients/a', json={'assigned_owner_id': 'member'})).status_code, 403)
        self.assertEqual((await self.client.patch('/api/clients/b', json={'primary_contact_id': 'foreign'})).status_code, 403)

    async def test_lead_scope_status_and_retained_assignment(self):
        for ident, clients, status in [('internal', ['a', 'b'], 'active'), ('foreign', ['b'], 'active'), ('former', ['a'], 'disabled')]:
            await server.db.users.insert_one({'user_id': ident, 'name': ident, 'role': 'platform_admin', 'client_ids': clients, 'status': status})
        candidates = (await self.client.get('/api/clients/grc-leads?client_id=a')).json()
        self.assertEqual({c['user_id'] for c in candidates}, {'admin', 'internal'})
        for candidate in candidates:
            self.assertLessEqual(set(candidate), {'user_id', 'name', 'email'})
        self.assertEqual({c['user_id'] for c in (await self.client.get('/api/clients/grc-leads')).json()}, {'admin'})
        for ident in ['member', 'foreign', 'former', 'missing']:
            self.assertEqual((await self.client.patch('/api/clients/a', json={'assigned_owner_id': ident})).status_code, 422)
        self.assertEqual((await self.client.patch('/api/clients/a', json={'assigned_owner_id': 'internal'})).status_code, 200)
        await server.db.users.update_one({'user_id': 'internal'}, {'$set': {'status': 'disabled'}})
        result = (await self.client.patch('/api/clients/a', json={'assigned_owner_id': 'internal', 'name': 'Updated'})).json()
        self.assertEqual(result['grc_lead']['status'], 'disabled')
        self.assertEqual(result['assigned_owner_id'], 'internal')
        # Scoped admin cannot enumerate another client's internal candidates.
        self.sign_in('foreign')
        self.assertEqual((await self.client.get('/api/clients/grc-leads?client_id=a')).status_code, 403)

    async def test_invalid_new_contact_has_no_side_effects(self):
        for details in [{'name': ' '}, {'name': 'Maya', 'email': 'not-email'}]:
            result = await self.client.post('/api/clients', json={'name': 'Invalid', 'primary_contact_details': details})
            self.assertEqual(result.status_code, 422)
        self.assertEqual(await server.db.clients.count_documents({}), 2)
        self.assertEqual(await server.db.contacts.count_documents({}), 0)

    async def test_failed_client_insert_retains_and_recovers_only_this_requests_new_contact(self):
        await server.db.contacts.insert_one({'contact_id': 'existing', 'client_id': 'a', 'name': 'Keep'})
        collection_type = type(server.db.clients)
        original = collection_type.insert_one
        async def fail_client(collection, *args, **kwargs):
            if collection.name == 'clients':
                raise RuntimeError('simulated insert failure')
            return await original(collection, *args, **kwargs)
        with patch.object(collection_type, 'insert_one', fail_client):
            # Keyed creates use an atomic upsert, not insert_one; inject that
            # boundary as well so the test still fails after Contact persistence.
            original_update = collection_type.update_one
            async def fail_client_update(collection, *args, **kwargs):
                if collection.name == 'clients':
                    raise RuntimeError('simulated insert failure')
                return await original_update(collection, *args, **kwargs)
            with patch.object(collection_type, 'update_one', fail_client_update):
                failed = await self.client.post('/api/clients', headers={'Idempotency-Key':'client-contact-failure'}, json={'name': 'Failed', 'primary_contact_details': {'name': 'Maya'}})
                self.assertEqual(failed.status_code, 503)
        retry = await self.client.post('/api/clients', headers={'Idempotency-Key':'client-contact-failure'}, json={'name': 'Failed', 'primary_contact_details': {'name': 'Maya'}})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(await server.db.contacts.count_documents({}), 2)
        self.assertIsNotNone(await server.db.contacts.find_one({'contact_id':'existing','name':'Keep'}))
        self.assertEqual(await server.db.contacts.count_documents({'client_id':retry.json()['client_id']}), 1)

    async def test_display_parity_no_read_migration_or_historical_rewrite(self):
        import routes.portfolio as portfolio
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'assigned_owner_id': 'member', 'primary_contact': 'Unlinked legacy'}})
        await server.db.audit_logs.insert_one({'action': 'complete', 'entity_type': 'review', 'client_id': 'a', 'user_name': 'Historical actor', 'at': '2026-01-01'})
        before = await server.db.audit_logs.find({}, {'_id': 0}).to_list(None)
        with patch.object(portfolio, 'db', server.db):
            directory = (await self.client.get('/api/clients/directory')).json()['clients']
        clients = (await self.client.get('/api/clients')).json()
        self.assertEqual(next(c for c in directory if c['client_id'] == 'a')['grc_lead'], next(c for c in clients if c['client_id'] == 'a')['grc_lead'])
        self.assertEqual(await server.db.audit_logs.find({}, {'_id': 0}).to_list(None), before)
        stored = await server.db.clients.find_one({'client_id': 'a'})
        self.assertNotIn('grc_lead', stored)
        self.assertNotIn('primary_contact_id', stored)
