"""Exercise catalog decoration through the tenant-authorized native record routes."""
import unittest
from contextlib import asynccontextmanager
from unittest.mock import patch

import test_client_dashboard_sources as harness
import ai_governance
import create_requests

server = harness.server
AI_METADATA = {'environment': 'Business workspace — 合成 QA', 'restrictions': 'Human review before publication',
               'data_settings': 'Synthetic examples only; provider training disabled',
               'permitted_data_types': ['Public', 'Internal']}
EMPTY_AI_METADATA = {'environment': '', 'restrictions': '', 'data_settings': '', 'permitted_data_types': []}


class RegisterCatalogIdentityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def create_catalog_record(self, kind, catalog_key, **extra):
        body = {'client_id': 'a', 'name': 'Synthetic catalog record', 'catalog_key': catalog_key,
                **({'service': 'Synthetic service'} if kind == 'vendors' else {}), **extra}
        response = await self.client.post('/api/' + kind, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def configure_cis_metadata(self, client_id='a', group=1):
        await server.db.clients.update_one({'client_id': client_id}, {'$set': {
            'framework_settings': {'cis-ig1': {'implementation_group': group}}}})
        await server.db.requirements.update_one({'client_id': client_id, 'baseline_key': 'cis-ig1'}, {'$set': {
            'requirement_id': 'synthetic-cis-' + client_id, 'baseline_response': 'applies'}}, upsert=True)

    async def persist_ai_create_receipt(self, key, state, *, catalog_field=False, catalog_key=None, metadata_fields=False,
                                      primary_exists=True):
        body = {'client_id': 'a', 'name': 'Synthetic historical AI create ' + key}
        if catalog_key is not None:
            body['catalog_key'] = catalog_key
        # This is the deployed pre-catalog AIInput normalization, deliberately
        # independent of the current model so another default cannot hide drift.
        normalized = {**body, 'description': '', 'owner_id': None, 'technical_owner_id': None,
                      'provider': '', 'vendor_id': None, 'product_model': '', 'status': 'draft',
                      'purposes': [], 'data_types': [], 'access': [], 'roles': [], 'risk_topics': [],
                      'screening': {}, 'human_review_required': None, 'human_approval_required': None,
                      'oversight_owner_id': None, 'oversight_notes': '', 'governance_notes': ''}
        if catalog_field:
            normalized['catalog_key'] = catalog_key
        if metadata_fields:
            normalized.update(EMPTY_AI_METADATA)
        identity = create_requests.digest(['admin', 'a', 'ai_systems', key])
        primary = {'_id': 'create:' + identity, **normalized, 'ai_system_id': 'ai_' + key,
                   'display_id': 'AI-099', 'created_at': '2026-10-22T00:00:00+00:00',
                   'updated_at': '2026-10-22T00:00:00+00:00', 'created_by': 'admin', 'related_links': []}
        if not primary_exists:
            self.assertEqual(state, 'pending')
            receipt = {'_id': identity, 'fingerprint': create_requests.digest(normalized),
                       'created_at': primary['created_at'], 'state': state}
            await server.db.create_requests.insert_one(receipt)
            return body, None, receipt, None
        await server.db.ai_systems.insert_one(primary)
        loaded = await self.client.get('/api/ai_systems', params={'client_id': 'a'})
        self.assertEqual(loaded.status_code, 200, loaded.text)
        result = next(row for row in loaded.json() if row['ai_system_id'] == primary['ai_system_id'])
        receipt = {'_id': identity, 'fingerprint': create_requests.digest(normalized),
                   'created_at': primary['created_at'], 'state': state, 'primary_started': True}
        if state == 'complete':
            receipt['result'] = result
        await server.db.create_requests.insert_one(receipt)
        return body, primary, receipt, result

    async def test_pre_catalog_ai_create_receipts_replay_without_duplicates_or_backfill(self):
        self.sign_in('admin')
        await server.db.business_counters.insert_one({'_id': 'ai-display:a', 'sequence': 99})
        for state in ('pending', 'complete'):
            for explicit_null in (False, True):
                with self.subTest(state=state, explicit_null=explicit_null):
                    key = f'legacy-ai-{state}-{explicit_null}'
                    body, primary, receipt, result = await self.persist_ai_create_receipt(key, state)
                    if explicit_null:
                        body['catalog_key'] = None
                    count = await server.db.ai_systems.count_documents({})
                    response = await self.client.post('/api/ai_systems', json=body,
                                                      headers={'Idempotency-Key': key})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), result)
                    self.assertEqual(await server.db.ai_systems.count_documents({}), count)
                    self.assertEqual(await server.db.ai_systems.find_one({'_id': primary['_id']}), primary)
                    recovered = await server.db.create_requests.find_one({'_id': receipt['_id']})
                    self.assertEqual(recovered['state'], 'complete')
                    self.assertEqual(recovered['fingerprint'], receipt['fingerprint'])
                    self.assertEqual(recovered['result'], result)
        self.assertEqual((await server.db.business_counters.find_one({'_id': 'ai-display:a'}))['sequence'], 99)

    async def test_pre_catalog_ai_create_receipts_still_reject_changed_payload(self):
        self.sign_in('admin')
        for state in ('pending', 'complete'):
            with self.subTest(state=state):
                key = 'legacy-ai-changes-' + state
                body, primary, receipt, _ = await self.persist_ai_create_receipt(key, state)
                for change in ({'name': 'A different create'}, {'catalog_key': 'chatgpt'}):
                    response = await self.client.post('/api/ai_systems', json={**body, **change},
                                                      headers={'Idempotency-Key': key})
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertEqual(await server.db.ai_systems.find_one({'_id': primary['_id']}), primary)
                    self.assertEqual(await server.db.create_requests.find_one({'_id': receipt['_id']}), receipt)

    async def test_null_catalog_ai_receipts_keep_the_current_replay_contract(self):
        self.sign_in('admin')
        for state in ('pending', 'complete'):
            with self.subTest(state=state):
                key = 'null-catalog-ai-' + state
                body, primary, receipt, result = await self.persist_ai_create_receipt(key, state, catalog_field=True)
                for request in (body, {**body, 'catalog_key': None}):
                    response = await self.client.post('/api/ai_systems', json=request,
                                                      headers={'Idempotency-Key': key})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), result)
                    self.assertEqual(await server.db.ai_systems.find_one({'_id': primary['_id']}), primary)
                self.assertEqual((await server.db.create_requests.find_one({'_id': receipt['_id']}))['fingerprint'],
                                 receipt['fingerprint'])

    async def test_catalog_ai_create_replay_keeps_real_association_payload_sensitive(self):
        self.sign_in('admin')
        body = {'client_id': 'a', 'name': 'Synthetic catalog replay', 'catalog_key': 'chatgpt'}
        headers = {'Idempotency-Key': 'catalog-ai-create-replay'}
        first = await self.client.post('/api/ai_systems', json=body, headers=headers)
        self.assertEqual(first.status_code, 200, first.text)
        replay = await self.client.post('/api/ai_systems', json=body, headers=headers)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), first.json())
        for change in ({'catalog_key': None}, {'catalog_key': 'claude'}, {'name': 'Different name'}):
            changed = await self.client.post('/api/ai_systems', json={**body, **change}, headers=headers)
            self.assertEqual(changed.status_code, 409, changed.text)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 1)
        self.assertEqual((await server.db.ai_systems.find_one({}))['catalog_key'], 'chatgpt')

    async def test_configured_cis_ai_metadata_round_trips_and_existing_fields_can_clear(self):
        self.sign_in('admin')
        for group in (1, 2, 3):
            with self.subTest(group=group):
                await self.configure_cis_metadata(group=group)
                row = await self.create_catalog_record('ai_systems', 'chatgpt', **AI_METADATA)
                self.assertEqual({key: row[key] for key in AI_METADATA}, AI_METADATA)
                renamed = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'name': 'Renamed metadata fixture', **AI_METADATA, 'expected_updated_at': row['updated_at']})
                self.assertEqual(renamed.status_code, 200, renamed.text)
                loaded = (await self.client.get('/api/ai_systems', params={'client_id': 'a'})).json()
                saved = next(item for item in loaded if item['ai_system_id'] == row['ai_system_id'])
                self.assertEqual({key: saved[key] for key in AI_METADATA}, AI_METADATA)
                self.assertEqual(saved['created_at'], row['created_at'])
                self.assertNotIn('approval_status', saved)
                cleared = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    **EMPTY_AI_METADATA, 'expected_updated_at': saved['updated_at']})
                self.assertEqual(cleared.status_code, 200, cleared.text)
                self.assertEqual({key: cleared.json()[key] for key in AI_METADATA}, EMPTY_AI_METADATA)

    async def test_ai_metadata_rejects_invalid_types_lengths_and_classifications_atomically(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        row = await self.create_catalog_record('ai_systems', 'chatgpt', **AI_METADATA)
        original = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        invalid = [(key, value) for key in ('environment', 'restrictions', 'data_settings')
                   for value in (None, True, 17, [], {}, 'x' * 10001)]
        invalid += [('permitted_data_types', value) for value in
                    (None, 'Public', {}, [None], [True], [17], [{}], ['Unsupported classification'])]
        for key, value in invalid:
            with self.subTest(field=key, invalid_type=type(value).__name__):
                create = await self.client.post('/api/ai_systems', json={
                    'client_id': 'a', 'name': 'Rejected metadata create', **AI_METADATA, key: value})
                self.assertEqual(create.status_code, 422, create.text)
                patch = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'name': 'Rejected ordinary edit', key: value, 'expected_updated_at': row['updated_at']})
                self.assertEqual(patch.status_code, 422, patch.text)
                self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), original)
                self.assertEqual(await server.db.ai_systems.count_documents({}), 1)
        limit = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'environment': '界' * 10000, 'expected_updated_at': row['updated_at']})
        self.assertEqual(limit.status_code, 200, limit.text)
        self.assertEqual(limit.json()['environment'], '界' * 10000)

    async def test_ai_permitted_data_is_bounded_without_reordering_or_deduplicating(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        choices = list(reversed(ai_governance.CATALOG['data_types']))
        row = await self.create_catalog_record('ai_systems', 'chatgpt', permitted_data_types=choices)
        self.assertEqual(row['permitted_data_types'], choices)
        original = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        oversized = [choices[0]] * (len(choices) + 1)
        create = await self.client.post('/api/ai_systems', json={
            'client_id': 'a', 'name': 'Rejected oversized data list', 'permitted_data_types': oversized})
        self.assertEqual(create.status_code, 422, create.text)
        update = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'name': 'Rejected mixed rename', 'permitted_data_types': oversized,
            'expected_updated_at': row['updated_at']})
        self.assertEqual(update.status_code, 422, update.text)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 1)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), original)
        duplicates = [choices[0], choices[0]]
        retained = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'permitted_data_types': duplicates, 'expected_updated_at': row['updated_at']})
        self.assertEqual(retained.status_code, 200, retained.text)
        self.assertEqual(retained.json()['permitted_data_types'], duplicates)

    async def test_ai_metadata_rechecks_scope_at_execution_and_inside_the_native_lease(self):
        self.sign_in('admin')
        original_run, original_lease = create_requests.run, ai_governance.lease
        for boundary in ('create', 'update'):
            for revoked in ('enrollment', 'archived'):
                with self.subTest(boundary=boundary, revoked=revoked):
                    await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'status': 'active'}})
                    await self.configure_cis_metadata()
                    body = {'client_id': 'a', 'name': 'Synthetic interleaving', **AI_METADATA}
                    row = None
                    if boundary == 'update':
                        row = await self.create_catalog_record('ai_systems', 'chatgpt', **AI_METADATA)
                    before = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}) if row else None
                    count = await server.db.ai_systems.count_documents({})
                    interleaved = []

                    async def revoke_scope():
                        if revoked == 'archived':
                            await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'status': 'archived'}})
                        else:
                            await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'cis-ig1'},
                                                                   {'$set': {'baseline_response': 'does_not_apply'}})
                        interleaved.append(True)

                    async def interleaved_run(db, key, actor, client_id, route, payload, execute):
                        async def after_acquisition(identity):
                            await revoke_scope()
                            return await execute(identity)
                        return await original_run(db, key, actor, client_id, route, payload, after_acquisition)

                    @asynccontextmanager
                    async def interleaved_lease(db, identity):
                        async with original_lease(db, identity):
                            await revoke_scope()
                            yield

                    if boundary == 'create':
                        # The real durable create coordinator still acquires and releases its lease.
                        with patch.object(create_requests, 'run', interleaved_run):
                            response = await self.client.post('/api/ai_systems', json=body)
                    else:
                        # Revocation occurs after the real AI lease, before the refreshed-row write.
                        with patch.object(ai_governance, 'lease', interleaved_lease):
                            response = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                                'environment': 'Blocked stale capability', 'expected_updated_at': row['updated_at']})
                    self.assertEqual(interleaved, [True])
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertEqual(await server.db.ai_systems.count_documents({}), count)
                    if row:
                        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), before)

    async def test_ai_metadata_capability_requires_committed_cis_enrollment_and_valid_client(self):
        self.sign_in('admin')
        # Editable setup and a projected-looking DTO cannot substitute for the saved requirement.
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'onboarding_baseline': {'completed': True, 'requirements': {'cis-ig1': 'applies'}},
            'cis_program': {'selected': True, 'implementation_group': 3}}})
        denied = await self.client.post('/api/ai_systems', json={'client_id': 'a', 'name': 'No enrollment', **AI_METADATA})
        self.assertEqual(denied.status_code, 422, denied.text)
        await self.configure_cis_metadata()
        for value in (None, 0, 4, True, '2'):
            with self.subTest(group=value):
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
                    'framework_settings': {'cis-ig1': {'implementation_group': value}}}})
                response = await self.client.post('/api/ai_systems', json={'client_id': 'a', 'name': 'Invalid scope', **AI_METADATA})
                self.assertEqual(response.status_code, 422, response.text)
        await self.configure_cis_metadata()
        for field, value in (('status', 'archived'), ('archived', True), ('archived_at', '2026-10-22')):
            with self.subTest(client_state=field):
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': {field: value}})
                response = await self.client.post('/api/ai_systems', json={'client_id': 'a', 'name': 'Inactive scope', **AI_METADATA})
                self.assertEqual(response.status_code, 422, response.text)
                await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'status': 'active'}, '$unset': {'archived': '', 'archived_at': ''}})
        self.assertEqual(await server.db.ai_systems.count_documents({}), 0)

    async def test_non_cis_ai_contract_and_retained_absence_do_not_gain_metadata_defaults(self):
        self.sign_in('admin')
        row = await self.create_catalog_record('ai_systems', None)
        self.assertFalse(set(AI_METADATA).intersection(row))
        renamed = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={'name': 'Ordinary legacy rename'})
        self.assertEqual(renamed.status_code, 200, renamed.text)
        self.assertFalse(set(AI_METADATA).intersection(renamed.json()))
        original = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        rejected = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            'name': 'Rejected non-CIS rename', 'environment': '', 'expected_updated_at': original['updated_at']})
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), original)
        await self.configure_cis_metadata()
        retained = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
            **EMPTY_AI_METADATA, 'catalog_key': 'chatgpt', 'expected_updated_at': original['updated_at']})
        self.assertEqual(retained.status_code, 200, retained.text)
        self.assertFalse(set(AI_METADATA).intersection(retained.json()))
        stored = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
        self.assertFalse(set(AI_METADATA).intersection(stored))
        self.assertEqual(stored['created_at'], original['created_at'])
        self.assertNotIn('approval_status', stored)

    async def test_ai_metadata_keeps_tenant_readonly_and_stale_write_denials(self):
        self.sign_in('admin')
        await self.configure_cis_metadata('a')
        await self.configure_cis_metadata('b')
        own = await self.create_catalog_record('ai_systems', 'chatgpt', **AI_METADATA)
        foreign = await self.create_catalog_record('ai_systems', 'chatgpt', client_id='b', **AI_METADATA)
        stored_foreign = await server.db.ai_systems.find_one({'ai_system_id': foreign['ai_system_id']})
        self.sign_in('member')
        response = await self.client.patch('/api/ai_systems/' + foreign['ai_system_id'], json={
            'environment': 'Denied foreign workspace', 'expected_updated_at': foreign['updated_at']})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': foreign['ai_system_id']}), stored_foreign)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        stored_own = await server.db.ai_systems.find_one({'ai_system_id': own['ai_system_id']})
        response = await self.client.patch('/api/ai_systems/' + own['ai_system_id'], json={
            'environment': 'Denied readonly workspace', 'expected_updated_at': own['updated_at']})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': own['ai_system_id']}), stored_own)
        self.sign_in('admin')
        saved = await self.client.patch('/api/ai_systems/' + own['ai_system_id'], json={
            'environment': 'Current workspace', 'expected_updated_at': own['updated_at']})
        self.assertEqual(saved.status_code, 200, saved.text)
        current = await server.db.ai_systems.find_one({'ai_system_id': own['ai_system_id']})
        stale = await self.client.patch('/api/ai_systems/' + own['ai_system_id'], json={
            'restrictions': 'Stale restriction', 'expected_updated_at': own['updated_at']})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': own['ai_system_id']}), current)

    async def test_recorded_ai_approval_scope_is_preserved_or_safely_rejected(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        for status in ('approved', 'approved_with_conditions'):
            with self.subTest(approval=status):
                row = await self.create_catalog_record('ai_systems', 'chatgpt', **AI_METADATA)
                decision = {'status': status, 'at': '2026-10-21T12:00:00Z', 'by': 'original-synthetic-approver',
                            'by_name': 'Original synthetic approver', 'note': 'Retained synthetic decision',
                            'scope': {**AI_METADATA, 'name': row['name']}}
                approval = {'approval_status': status, 'approval_history': [decision],
                            'approved_at': decision['at'], 'approved_by': decision['by']}
                await server.db.ai_systems.update_one({'ai_system_id': row['ai_system_id']}, {'$set': approval})
                before = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
                decoration = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'catalog_key': 'claude', **AI_METADATA, 'expected_updated_at': before['updated_at']})
                self.assertEqual(decoration.status_code, 200, decoration.text)
                # Existing name/provider edits remain the native contract; this
                # storage approval adds no new reassessment rules for those fields.
                ordinary = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'name': 'Native approved-row rename', 'provider': 'Native provider edit',
                    'expected_updated_at': decoration.json()['updated_at']})
                self.assertEqual(ordinary.status_code, 200, ordinary.text)
                unchanged_scope = await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']})
                for key, value in approval.items():
                    self.assertEqual(unchanged_scope[key], value)
                for change in ({'environment': 'Different workspace'}, {'restrictions': ''},
                               {'data_settings': 'Changed retention'}, {'permitted_data_types': ['Public']}):
                    response = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                        **change, 'expected_updated_at': unchanged_scope['updated_at']})
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertIn('authenticated reassessment is not supported', response.json()['detail'])
                    self.assertEqual(await server.db.ai_systems.find_one({'ai_system_id': row['ai_system_id']}), unchanged_scope)
                forged = await self.client.patch('/api/ai_systems/' + row['ai_system_id'], json={
                    'approval_status': 'approved', 'expected_updated_at': unchanged_scope['updated_at']})
                self.assertEqual(forged.status_code, 422, forged.text)

    async def test_ai_metadata_replay_recovers_each_retained_schema_without_ignoring_real_edits(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        for state in ('pending', 'complete'):
            for schema, catalog_field, catalog_key in (('pre-logo', False, None), ('logo-null', True, None), ('logo-key', True, 'chatgpt')):
                with self.subTest(state=state, schema=schema):
                    key = f'metadata-replay-{schema}-{state}'
                    body, primary, receipt, result = await self.persist_ai_create_receipt(
                        key, state, catalog_field=catalog_field, catalog_key=catalog_key)
                    count = await server.db.ai_systems.count_documents({})
                    replay = await self.client.post('/api/ai_systems', json={**body, **EMPTY_AI_METADATA},
                                                    headers={'Idempotency-Key': key})
                    self.assertEqual(replay.status_code, 200, replay.text)
                    self.assertEqual(replay.json(), result)
                    self.assertEqual(await server.db.ai_systems.count_documents({}), count)
                    self.assertEqual(await server.db.ai_systems.find_one({'_id': primary['_id']}), primary)
                    recovered = await server.db.create_requests.find_one({'_id': receipt['_id']})
                    self.assertEqual(recovered['fingerprint'], receipt['fingerprint'])
                    for change in ({'environment': 'A real new workspace'}, {'permitted_data_types': ['Public']}):
                        altered = await self.client.post('/api/ai_systems', json={**body, **EMPTY_AI_METADATA, **change},
                                                        headers={'Idempotency-Key': key})
                        self.assertEqual(altered.status_code, 409, altered.text)
                        self.assertEqual(await server.db.create_requests.find_one({'_id': receipt['_id']}), recovered)
            key = 'metadata-current-empty-' + state
            body, primary, receipt, result = await self.persist_ai_create_receipt(
                key, state, catalog_field=True, metadata_fields=True)
            for request in (body, {**body, **EMPTY_AI_METADATA}):
                replay = await self.client.post('/api/ai_systems', json=request, headers={'Idempotency-Key': key})
                self.assertEqual(replay.status_code, 200, replay.text)
                self.assertEqual(replay.json(), result)
                self.assertEqual(await server.db.ai_systems.find_one({'_id': primary['_id']}), primary)

    async def test_new_nonempty_ai_metadata_remains_part_of_the_create_fingerprint(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        body = {'client_id': 'a', 'name': 'Synthetic full-metadata replay', 'catalog_key': 'chatgpt', **AI_METADATA}
        headers = {'Idempotency-Key': 'full-metadata-ai-replay'}
        created = await self.client.post('/api/ai_systems', json=body, headers=headers)
        self.assertEqual(created.status_code, 200, created.text)
        original = await server.db.ai_systems.find_one({'ai_system_id': created.json()['ai_system_id']})
        replay = await self.client.post('/api/ai_systems', json=body, headers=headers)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), created.json())
        for change in ({'environment': ''}, {'restrictions': ''}, {'data_settings': ''}, {'permitted_data_types': []}):
            changed = await self.client.post('/api/ai_systems', json={**body, **change}, headers=headers)
            self.assertEqual(changed.status_code, 409, changed.text)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 1)
        self.assertEqual(await server.db.ai_systems.find_one({'_id': original['_id']}), original)

    async def test_pending_historical_ai_receipt_recovers_once_before_any_primary_exists(self):
        self.sign_in('admin')
        await self.configure_cis_metadata()
        for schema, catalog_field, catalog_key in (
                ('pre-logo', False, None), ('logo-null', True, None), ('logo-key', True, 'chatgpt')):
            with self.subTest(schema=schema):
                key = 'pre-primary-ai-' + schema
                body, _, receipt, _ = await self.persist_ai_create_receipt(
                    key, 'pending', catalog_field=catalog_field, catalog_key=catalog_key, primary_exists=False)
                headers = {'Idempotency-Key': key}
                count = await server.db.ai_systems.count_documents({})
                counter_before = await server.db.business_counters.find_one({'_id': 'ai-display:a'})
                self.assertIsNone(await server.db.ai_systems.find_one({'_id': 'create:' + receipt['_id']}))
                for change in ({'environment': 'Changed before recovery'},
                               {'catalog_key': 'claude' if catalog_key else 'chatgpt'}):
                    rejected = await self.client.post('/api/ai_systems', json={**body, **EMPTY_AI_METADATA, **change},
                                                     headers=headers)
                    self.assertEqual(rejected.status_code, 409, rejected.text)
                    self.assertEqual(await server.db.create_requests.find_one({'_id': receipt['_id']}), receipt)
                    self.assertEqual(await server.db.ai_systems.count_documents({}), count)
                    self.assertEqual(await server.db.business_counters.find_one({'_id': 'ai-display:a'}), counter_before)
                recovered = await self.client.post('/api/ai_systems', json={**body, **EMPTY_AI_METADATA}, headers=headers)
                self.assertEqual(recovered.status_code, 200, recovered.text)
                stored = await server.db.ai_systems.find_one({'_id': 'create:' + receipt['_id']})
                self.assertEqual(stored['ai_system_id'], recovered.json()['ai_system_id'])
                self.assertEqual(stored['created_by'], 'admin')
                self.assertEqual(await server.db.ai_systems.count_documents({}), count + 1)
                counter_after = await server.db.business_counters.find_one({'_id': 'ai-display:a'})
                self.assertEqual(counter_after['sequence'], (counter_before or {}).get('sequence', 0) + 1)
                completed = await server.db.create_requests.find_one({'_id': receipt['_id']})
                self.assertEqual(completed['state'], 'complete')
                self.assertEqual(completed['fingerprint'], receipt['fingerprint'])
                self.assertEqual(completed['result'], recovered.json())
                replay = await self.client.post('/api/ai_systems', json={**body, **EMPTY_AI_METADATA}, headers=headers)
                self.assertEqual(replay.status_code, 200, replay.text)
                self.assertEqual(replay.json(), recovered.json())
                self.assertEqual(await server.db.ai_systems.count_documents({}), count + 1)
                self.assertEqual(await server.db.ai_systems.find_one({'_id': stored['_id']}), stored)
                self.assertEqual(await server.db.business_counters.find_one({'_id': 'ai-display:a'}), counter_after)
                self.assertEqual(await server.db.create_requests.find_one({'_id': receipt['_id']}), completed)

    async def test_create_read_and_rename_keep_the_exact_catalog_identity(self):
        self.sign_in('admin')
        for kind, key, id_field in (
            ('vendors', 'iventure-solutions', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                route = '/api/' + kind + '/' + row[id_field]
                self.assertEqual(row['catalog_key'], key)
                renamed = await self.client.patch(route, json={'name': 'Renamed synthetic record'})
                self.assertEqual(renamed.status_code, 200, renamed.text)
                # A fresh API read and the stored document retain identity without title matching.
                rows = await self.client.get('/api/' + kind, params={'client_id': 'a'})
                loaded = next(item for item in rows.json() if item[id_field] == row[id_field])
                self.assertEqual(loaded['catalog_key'], key)
                self.assertEqual(loaded['name'], 'Renamed synthetic record')
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                self.assertEqual(stored['catalog_key'], key)
                self.assertEqual(stored['status'], 'onboarding' if kind == 'vendors' else 'draft')
        self.assertEqual(await server.db.risks.count_documents({}), 0)
        self.assertEqual(await server.db.reviews.count_documents({}), 0)

    async def test_distinct_products_and_new_clients_use_exact_keys(self):
        self.sign_in('admin')
        for key in ('m365', 'cstudio', 'ghcopilot'):
            row = await self.create_catalog_record('ai_systems', key, client_id='b', provider='Microsoft')
            self.assertEqual(row['catalog_key'], key)
        rows = (await self.client.get('/api/ai_systems', params={'client_id': 'b'})).json()
        self.assertEqual({row['catalog_key'] for row in rows}, {'m365', 'cstudio', 'ghcopilot'})
        self.assertEqual(len({row['ai_system_id'] for row in rows}), 3)

    async def test_custom_and_legacy_names_never_infer_a_brand(self):
        self.sign_in('admin')
        for kind, name, id_field in (
            ('vendors', 'iVenture Solutions', 'vendor_id'),
            ('ai_systems', 'ChatGPT', 'ai_system_id'),
        ):
            row = await self.create_catalog_record(kind, None, name=name)
            self.assertIsNone(row['catalog_key'])
            # Model the historical absence of this optional field, then save another field.
            await server.db[kind].update_one({id_field: row[id_field]}, {'$unset': {'catalog_key': ''}})
            legacy = await server.db[kind].find_one({id_field: row[id_field]})
            blank = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'catalog_key': ''})
            self.assertEqual(blank.status_code, 422, blank.text)
            self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), legacy)
            response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'name': name + ' custom'})
            self.assertEqual(response.status_code, 200, response.text)
            stored = await server.db[kind].find_one({id_field: row[id_field]})
            self.assertIsNone(stored.get('catalog_key'))

    async def test_invalid_and_cross_module_keys_do_not_create_or_modify_records(self):
        self.sign_in('admin')
        invalid = ('', 'CHATGPT', 'chatgpt ', 'https://example.test/logo.svg', '<svg/>', {}, [], True, 12)
        for kind, key, foreign, id_field in (
            ('vendors', 'iventure-solutions', 'chatgpt', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'iventure-solutions', 'ai_system_id'),
        ):
            row = await self.create_catalog_record(kind, key)
            stored = await server.db[kind].find_one({id_field: row[id_field]})
            for bad in (*invalid, foreign):
                with self.subTest(kind=kind, catalog_key=bad):
                    create = await self.client.post('/api/' + kind, json={'client_id': 'a', 'name': 'Invalid key', 'catalog_key': bad,
                        **({'service': 'Synthetic service'} if kind == 'vendors' else {})})
                    self.assertEqual(create.status_code, 422, create.text)
                    update = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'catalog_key': bad})
                    self.assertEqual(update.status_code, 422, update.text)
                    self.assertEqual(await server.db[kind].count_documents({}), 1)
                    self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)

    async def test_vendor_bulk_updates_validate_the_same_catalog_allowlist(self):
        self.sign_in('admin')
        row = await self.create_catalog_record('vendors', 'salesforce')
        stored = await server.db.vendors.find_one({'vendor_id': row['vendor_id']})
        response = await self.client.post('/api/bulk', json={
            'kind': 'vendors', 'ids': [row['vendor_id']], 'action': 'update', 'payload': {'catalog_key': 'chatgpt'},
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(await server.db.vendors.find_one({'vendor_id': row['vendor_id']}), stored)

    async def test_catalog_decoration_does_not_grant_tenant_or_write_access(self):
        self.sign_in('admin')
        vendor = await self.create_catalog_record('vendors', 'salesforce', client_id='b')
        ai = await self.create_catalog_record('ai_systems', 'chatgpt', client_id='b')
        self.sign_in('member')
        for kind, identity in (('vendors', vendor['vendor_id']), ('ai_systems', ai['ai_system_id'])):
            response = await self.client.patch('/api/' + kind + '/' + identity, json={'name': 'Denied rename'})
            self.assertEqual(response.status_code, 403, response.text)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        for kind, key in (('vendors', 'salesforce'), ('ai_systems', 'chatgpt')):
            response = await self.client.post('/api/' + kind, json={'client_id': 'a', 'name': 'Denied create', 'catalog_key': key,
                **({'service': 'Synthetic service'} if kind == 'vendors' else {})})
            self.assertEqual(response.status_code, 403, response.text)

    async def test_valid_catalog_key_patch_retains_tenant_and_readonly_boundaries(self):
        self.sign_in('admin')
        records = []
        for kind, initial_key, replacement_key, id_field in (
            ('vendors', 'salesforce', 'microsoft-365', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'claude', 'ai_system_id'),
        ):
            for client_id in ('a', 'b'):
                row = await self.create_catalog_record(kind, initial_key, client_id=client_id)
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                records.append((kind, replacement_key, id_field, row, stored))
        self.sign_in('member')
        for kind, key, id_field, row, stored in records:
            if row['client_id'] != 'b':
                continue
            with self.subTest(kind=kind, boundary='foreign tenant'):
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        for kind, key, id_field, row, stored in records:
            if row['client_id'] != 'a':
                continue
            with self.subTest(kind=kind, boundary='same tenant read only'):
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)

    async def test_invalid_catalog_key_cannot_partially_save_an_ordinary_field(self):
        self.sign_in('admin')
        for kind, key, invalid_key, id_field in (
            ('vendors', 'salesforce', 'chatgpt', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'salesforce', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'name': 'This ordinary edit must not be saved', 'catalog_key': invalid_key,
                    'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 422, response.text)
                # Equality includes native timestamps, identity and governance fields, not only the key.
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
                self.assertEqual(await server.db[kind].count_documents({}), 1)

    async def test_invalid_vendor_bulk_catalog_key_leaves_every_selected_record_unchanged(self):
        self.sign_in('admin')
        first = await self.create_catalog_record('vendors', 'salesforce', name='First synthetic vendor')
        second = await self.create_catalog_record('vendors', 'zoom', name='Second synthetic vendor')
        ids = [first['vendor_id'], second['vendor_id']]
        stored = {identity: await server.db.vendors.find_one({'vendor_id': identity}) for identity in ids}
        response = await self.client.post('/api/bulk', json={
            'kind': 'vendors', 'ids': ids, 'action': 'update',
            'expected_versions': {row['vendor_id']: row['updated_at'] for row in (first, second)},
            'payload': {'name': 'Rejected bulk rename', 'catalog_key': 'chatgpt'},
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(await server.db.vendors.count_documents({}), 2)
        for identity in ids:
            self.assertEqual(await server.db.vendors.find_one({'vendor_id': identity}), stored[identity])

    async def test_nullable_catalog_clear_preserves_record_and_rejects_stale_restore(self):
        self.sign_in('admin')
        for kind, key, id_field in (
            ('vendors', 'salesforce', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                route = '/api/' + kind + '/' + row[id_field]
                cleared = await self.client.patch(route, json={
                    'catalog_key': None, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(cleared.status_code, 200, cleared.text)
                self.assertIsNone(cleared.json()['catalog_key'])
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                for field in (id_field, 'client_id', 'name', 'status', 'created_at', 'created_by'):
                    self.assertEqual(stored[field], row[field])
                self.assertNotEqual(stored['updated_at'], row['updated_at'])
                # Retain the original editor token: the fixture must not refresh it before this retry.
                stale = await self.client.patch(route, json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(stale.status_code, 409, stale.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
