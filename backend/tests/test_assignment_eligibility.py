"""Real authorization routes with isolated storage; no persistent database writes."""
import unittest

from fastapi import HTTPException
import test_client_dashboard_sources as harness
from assignment_eligibility import FIELDS, validate

server = harness.server


class AssignmentEligibilityTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        users = [
            ('alex', 'client_contributor', ['a'], 'active'),
            ('internal', 'platform_admin', ['a', 'b'], 'active'),
            ('global', 'platform_admin', [], 'active'),
            ('foreign', 'client_contributor', ['b'], 'active'),
            ('foreign_internal', 'platform_admin', ['b'], 'active'),
            ('former', 'client_contributor', ['a'], 'disabled'),
            ('invited', 'client_contributor', ['a'], 'invited'),
            ('unknown', 'client_contributor', ['a'], None),
        ]
        await server.db.users.insert_many([
            {'user_id': uid, 'name': 'Same Name', 'email': uid+'@example.test',
             'role': role, 'client_ids': clients, 'status': status, 'private_field': 'excluded'}
            for uid, role, clients, status in users
        ])
        await server.db.contacts.insert_one({'contact_id': 'maya', 'client_id': 'a', 'name': 'Maya Chen', 'status': 'active'})
        self.sign_in('member')

    async def test_candidates_authorized_minimal_and_same_name_isolated(self):
        response = await self.client.get('/api/clients/a/assignees')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({u['user_id'] for u in response.json()['items']}, {'admin', 'member', 'alex', 'internal'})
        for row in response.json()['items']:
            self.assertEqual(set(row), {'user_id', 'name', 'email'})
        self.assertFalse(response.json()['has_more'])
        self.assertEqual((await self.client.get('/api/clients/b/assignees')).status_code, 403)
        self.client.headers.clear()
        self.assertIn((await self.client.get('/api/clients/a/assignees')).status_code, (401, 403))

    async def test_search_paging_and_bounds(self):
        result = (await self.client.get('/api/clients/a/assignees', params={'search': 'alex@'})).json()
        self.assertEqual([u['user_id'] for u in result['items']], ['alex'])
        self.assertEqual((await self.client.get('/api/clients/a/assignees', params={'search': '.*'})).json()['items'], [])
        first = (await self.client.get('/api/clients/a/assignees', params={'limit': 2})).json()
        second = (await self.client.get('/api/clients/a/assignees', params={'limit': 2, 'offset': 2})).json()
        self.assertTrue(first['has_more'])
        self.assertFalse({u['user_id'] for u in first['items']} & {u['user_id'] for u in second['items']})
        for params in ({'limit': 101}, {'offset': -1}, {'search': 'x'*101}):
            self.assertEqual((await self.client.get('/api/clients/a/assignees', params=params)).status_code, 422)

    async def test_all_operational_fields_share_contract(self):
        for kind, fields in FIELDS.items():
            for field in fields:
                for uid in ('alex', 'internal', 'admin', None):
                    with self.subTest(kind=kind, field=field, eligible=uid):
                        await validate(server.db, kind, {'client_id': 'a', field: uid}, server._can_access_client)
                for uid in ('global', 'maya', 'foreign', 'foreign_internal', 'former', 'invited', 'unknown', 'missing'):
                    with self.subTest(kind=kind, field=field, excluded=uid):
                        with self.assertRaises(HTTPException) as error:
                            await validate(server.db, kind, {'client_id': 'a', field: uid}, server._can_access_client)
                        self.assertEqual(error.exception.status_code, 422)

    async def test_existing_assignment_retained_but_not_copied(self):
        for kind, fields in FIELDS.items():
            for field in fields:
                previous = {'client_id': 'a', field: 'former'}
                await validate(server.db, kind, previous, server._can_access_client, previous)
                await validate(server.db, kind, {**previous, field: None}, server._can_access_client, previous)
                with self.assertRaises(HTTPException):
                    await validate(server.db, kind, previous, server._can_access_client)
        await validate(server.db, 'tasks', {'client_id': 'a', 'assignee_id': 'former'}, server._can_access_client,
                       {'client_id': 'a', 'owner_id': 'former'})

    async def test_review_and_action_write_routes_enforce_and_preserve(self):
        self.sign_in('admin')
        for kind, field, key in [('reviews', 'owner_id', 'review_id'), ('tasks', 'assignee_id', 'task_id')]:
            base = {'client_id': 'a', 'title': 'Work', **({'review_type': 'access'} if kind == 'reviews' else {})}
            for uid in ('maya', 'foreign', 'former'):
                result = await self.client.post('/api/'+kind, json={**base, field: uid})
                self.assertEqual(result.status_code, 422, result.text)
                self.assertIn('active platform user', result.text)
            created = await self.client.post('/api/'+kind, json={**base, field: 'alex'})
            self.assertEqual(created.status_code, 200, created.text)
            row = created.json()
            await server.db.users.update_one({'user_id': 'alex'}, {'$set': {'status': 'disabled'}})
            result = await self.client.patch('/api/'+kind+'/'+row[key], json={'title': 'Still assigned', field: 'alex'})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()[field], 'alex')
            result = await self.client.patch('/api/'+kind+'/'+row[key], json={field: 'former'})
            self.assertEqual(result.status_code, 422, result.text)
            await server.db.users.update_one({'user_id': 'alex'}, {'$set': {'status': 'active'}})

    async def test_approval_and_business_contact_exceptions_not_redefined(self):
        self.assertNotIn('approver_id', FIELDS['policies'])
        self.assertNotIn('approver_id', FIELDS['exceptions'])
        self.assertNotIn('process_owner_id', FIELDS['framework_assessments'])
        self.assertNotIn('contacts', FIELDS)
        self.assertNotIn('clients', FIELDS)

    async def test_other_generic_owner_routes_and_disabled_retention(self):
        self.sign_in('admin')
        for kind in ('findings', 'risks', 'policies', 'vendors', 'assets', 'requirements', 'exceptions'):
            field = FIELDS[kind][0]
            key = server.ENTITY_MAP[kind][2]
            base = {'client_id': 'a', **({'name':'Owned record'} if kind in ('vendors','assets') else {'title':'Owned record'})}
            if kind == 'vendors': base['service'] = 'Hosted service'
            denied = await self.client.post('/api/'+kind, json={**base, field:'foreign'})
            self.assertEqual(denied.status_code, 422, (kind,denied.text))
            self.assertIn('active platform user',denied.text)
            created = await self.client.post('/api/'+kind, json={**base,field:'internal'})
            self.assertEqual(created.status_code,200,(kind,created.text))
            await server.db.users.update_one({'user_id':'internal'},{'$set':{'status':'disabled'}})
            saved = await self.client.patch('/api/'+kind+'/'+created.json()[key],json={field:'internal'})
            self.assertEqual(saved.status_code,200,(kind,saved.text))
            self.assertEqual(saved.json()[field],'internal')
            await server.db.users.update_one({'user_id':'internal'},{'$set':{'status':'active'}})

    async def test_finding_remediation_can_explicitly_remain_unassigned(self):
        self.sign_in('admin')
        await server.db.findings.insert_one({'finding_id':'historical-owner','client_id':'a','title':'Finding',
            'owner_id':'former','status':'open','severity':'medium'})
        denied = await self.client.post('/api/findings/historical-owner/create-task',json={'title':'Corrective work'})
        self.assertEqual(denied.status_code,422,denied.text)
        self.assertEqual(await server.db.tasks.count_documents({}),0)
        saved = await self.client.post('/api/findings/historical-owner/create-task',json={'title':'Corrective work','assignee_id':None})
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertIsNone(saved.json()['assignee_id'])
        finding = await server.db.findings.find_one({'finding_id':'historical-owner'})
        self.assertEqual(finding['owner_id'],'former')

    async def test_super_admin_query_is_still_client_scoped(self):
        self.sign_in('admin')
        result = (await self.client.get('/api/clients/a/assignees')).json()
        self.assertNotIn('foreign',{u['user_id'] for u in result['items']})
        self.sign_in('foreign_internal')
        self.assertEqual((await self.client.get('/api/clients/a/assignees')).status_code,403)

    async def test_bulk_assignment_preflights_every_record(self):
        self.sign_in('admin')
        await server.db.reviews.insert_many([
            {'review_id':'bulk-a','client_id':'a','title':'A','review_type':'access','status':'upcoming','owner_id':None},
            {'review_id':'bulk-b','client_id':'b','title':'B','review_type':'access','status':'upcoming','owner_id':None},
        ])
        response = await self.client.post('/api/bulk',json={'kind':'reviews','ids':['bulk-a','bulk-b'],'action':'set-owner','payload':{'owner_id':'alex'}})
        self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(await server.db.reviews.count_documents({'owner_id':None}),2)
