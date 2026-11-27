"""Native R4 preservation/recovery cases; real storage requires the owned Mongo runner.

Run only through verify_r4_mongo.py. Unwrapped discovery fails explicitly so an
in-memory pass cannot be mistaken for durable-storage proof.
"""
import base64
import hashlib
import uuid
import unittest
from unittest.mock import patch

from motor.motor_asyncio import AsyncIOMotorClient

from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from initialization import ensure_indexes
import r4_preservation_checks as preservation


class R4PreservationTests(unittest.IsolatedAsyncioTestCase):
    sign_in = Harness.sign_in

    async def asyncSetUp(self):
        await Harness.asyncSetUp(self)
        # MongoStorage rebinds self.db and the native server after this setup.
        self.db = server.db

    def real_storage(self):
        if not hasattr(self, 'mongo') or not isinstance(self.mongo, AsyncIOMotorClient):
            raise AssertionError('Requires the explicit loopback MongoStorage wrapper; no mock qualification')
        preservation.require_disposable(self.db)
        host, port = self.mongo.address
        self.assertEqual(host, '127.0.0.1')
        self.assertIsInstance(port, int)
        return 'mongodb://127.0.0.1:' + str(port)

    async def native_review(self):
        self.sign_in('admin')
        response = await self.client.post('/api/reviews', json={
            'client_id': 'a', 'title': 'Synthetic R4 preservation Review', 'review_type': 'access',
            'recurrence': 'monthly', 'due_date': '2026-01-31'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def upload(self, content, filename, cid='a', review=None):
        body = {'client_id': cid, 'filename': filename, 'content_base64': base64.b64encode(content).decode('ascii'),
                'mime_type': 'application/octet-stream', 'evidence_type': 'Test Result',
                'notes': 'Explicit synthetic R4 preservation fixture; no genuine client data.'}
        if review:
            body.update(linked_type='review', linked_id=review['review_id'], occurrence_id=review['current_occurrence_id'])
        response = await self.client.post('/api/evidence', json=body, headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def assert_download(self, eid, expected, filename):
        response = await self.client.get('/api/evidence/' + eid + '/download')
        self.assertEqual(response.status_code, 200, response.text)
        downloaded = response.json()
        self.assertEqual(downloaded['filename'], filename)
        self.assertEqual(base64.b64decode(downloaded['content_base64'], validate=True), expected)

    async def test_service_interruption_pending_writer_denial_and_new_connection_same_intent_recovery(self):
        origin = self.real_storage()
        self.sign_in('admin')
        client_before = await self.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
        body = {'expected_updated_at': client_before.get('updated_at'),
                'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': ['ninjaone']}}, 'custom_tools': [], 'preset': None}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        collection_type = type(self.db.clients)
        original_update = collection_type.update_one
        interrupted = False

        async def interrupt_after_first_business_write(collection, query, update, *args, **kwargs):
            nonlocal interrupted
            if collection.name == 'clients' and '_r4_context_applied' in update.get('$set', {}) and not interrupted:
                interrupted = True
                raise RuntimeError('Synthetic interruption after the provider document was durably written')
            return await original_update(collection, query, update, *args, **kwargs)

        with patch.object(collection_type, 'update_one', interrupt_after_first_business_write):
            failed = await self.client.post('/api/clients/a/services', json=body, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertTrue(interrupted)
        partial = await self.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
        self.assertTrue(partial.get('_r4_context_pending'))
        self.assertNotIn('services', (partial.get('profile') or {}))
        self.assertEqual(await self.db.vendors.count_documents({'client_id': 'a', 'source_services': {'$exists': True}}), 1)

        # Reconnect to the same owned database; no process-local plan survives.
        database_name = self.db.name
        self.mongo.close()
        fresh = AsyncIOMotorClient(origin, serverSelectionTimeoutMS=3000)
        self.mongo = fresh
        self.db = fresh[database_name]
        await fresh.admin.command('ping')
        with patch.object(server, 'db', self.db):
            pending_before = await self.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
            denied = await self.client.patch('/api/clients/a', json={'name': 'Synthetic forbidden intervening edit',
                'expected_updated_at': pending_before.get('updated_at')})
            self.assertEqual(denied.status_code, 409, denied.text)
            self.assertEqual((await self.db.clients.find_one({'client_id': 'a'}))['name'], client_before['name'])
            recovered = await self.client.post('/api/clients/a/services', json=body, headers=headers)
            self.assertEqual(recovered.status_code, 200, recovered.text)
            saved = await self.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
            self.assertNotIn('_r4_context_pending', saved)
            self.assertEqual(saved['profile']['services']['areas']['endpoint']['tool_ids'], ['ninjaone'])
            provider_id = saved['profile']['services']['provider_vendor_id']
            provider = await self.db.vendors.find_one({'vendor_id': provider_id}, {'_id': 0})
            self.assertTrue(provider['criticality_provisional'])
            self.assertEqual(provider['data_relationship'], [])
            self.assertIsNone(provider['business_owner_id'])
            self.assertFalse(provider['assurance_required'])
            self.assertEqual(await self.db.vendors.count_documents({'client_id': 'a'}), 1)
            counts = {kind: await self.db[kind].count_documents({}) for kind in ('clients', 'vendors', 'audit_logs', 'create_requests')}
            replay = await self.client.post('/api/clients/a/services', json=body, headers=headers)
            self.assertEqual(replay.status_code, 200, replay.text)
            self.assertEqual(replay.json(), recovered.json())
            self.assertEqual(await self.db.clients.find_one({'client_id': 'a'}, {'_id': 0}), saved)
            self.assertEqual(counts, {kind: await self.db[kind].count_documents({}) for kind in counts})

    async def test_actual_binary_unicode_links_and_legacy_history_survive_bson_restore_with_indexes(self):
        self.real_storage()
        self.sign_in('admin')
        legacy = {'review_id': 'synthetic_legacy_r4_preservation', 'client_id': 'a', 'title': 'Explicit synthetic pre-R4 completion fixture',
                  'review_type': 'access', 'status': 'completed', 'due_date': '2025-01-31', 'completion_date': '2025-02-02',
                  'recurrence': 'none', 'completion_snapshot': {'at': '2025-02-02', 'by': None,
                    'notes': 'Synthetic legacy shape; actor/support not recorded and must remain unknown.'}}
        await self.db.reviews.insert_one(legacy.copy())
        legacy_before = await self.db.reviews.find_one({'review_id': legacy['review_id']})
        grants_before = preservation.canonical(await self.db.users.find({}).sort('user_id').to_list(None))
        await self.db.clients.update_one({'client_id': 'a'}, {'$set': {'profile.organization': {'employees': 0, 'country': 'Fixture only'},
            'profile.services': {'areas': {}, 'custom_tools': [{'tool_id': 'retained_custom_fixture', 'name': 'Synthetic retained custom tool résumé',
                'category': 'custom', 'area_ids': ['endpoint'], 'description': 'Explicit prior custom definition'}], 'preset': None}}})
        profile = (await self.client.get('/api/clients/a/services')).json()
        saved_services = await self.client.post('/api/clients/a/services', json={
            'expected_updated_at': profile['updated_at'], 'areas': {'endpoint': {'responsibility': 'cl', 'tool_ids': ['retained_custom_fixture']}},
            'custom_tools': [], 'preset': None}, headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(saved_services.status_code, 200, saved_services.text)
        retained = await self.db.clients.find_one({'client_id': 'a'})
        self.assertEqual(retained['profile']['organization']['employees'], 0)
        self.assertEqual(retained['profile']['services']['custom_tools'][0]['tool_id'], 'retained_custom_fixture')

        review = await self.native_review()
        filename = 'Synthetic résumé 🔒.bin'
        first_bytes = bytes(range(256)) + 'Synthetic Unicode record résumé 🔒'.encode('utf-8')
        second_bytes = bytes(reversed(range(256))) + b'Synthetic distinct same-name content'
        first = await self.upload(first_bytes, filename, review=review)
        second = await self.upload(second_bytes, filename, review=review)
        self.assertNotEqual(first['evidence_id'], second['evidence_id'])
        for item, content in ((first, first_bytes), (second, second_bytes)):
            self.assertEqual(item['version'], 1)
            self.assertEqual(item['sha256'], hashlib.sha256(content).hexdigest())
            await self.assert_download(item['evidence_id'], content, filename)

        risk_response = await self.client.post('/api/risks', json={'client_id': 'a', 'title': 'Synthetic shared evidence Risk'})
        self.assertEqual(risk_response.status_code, 200, risk_response.text)
        risk_id = risk_response.json()['risk_id']
        link = await self.client.post('/api/evidence-library/items/' + first['evidence_id'] + '/relationships', json={
            'linked_type': 'risk', 'linked_id': risk_id, 'expected_updated_at': first.get('updated_at')})
        self.assertEqual(link.status_code, 200, link.text)
        metadata = await self.client.get('/api/evidence-library/items/' + first['evidence_id'])
        self.assertEqual(metadata.status_code, 200, metadata.text)
        self.assertIn(risk_id, preservation.canonical(metadata.json()))
        await self.assert_download(first['evidence_id'], first_bytes, filename)

        current = (await self.client.get('/api/reviews/' + review['review_id'])).json()
        completed = await self.client.post('/api/reviews/' + review['review_id'] + '/complete', json={
            'occurrence_id': current['current_occurrence_id'], 'expected_updated_at': current.get('updated_at'),
            'outcome': 'No exceptions noted', 'completion_notes': 'Explicit synthetic Review performance with actual uploaded fixture bytes.'})
        self.assertEqual(completed.status_code, 200, completed.text)
        recorded = completed.json()['occurrence']
        self.assertEqual({e['evidence_id'] for e in recorded['evidence']}, {first['evidence_id'], second['evidence_id']})
        self.assertEqual((await self.client.get('/api/reviews/' + legacy['review_id'] + '/history')).status_code, 200)
        self.assertEqual(await self.db.reviews.find_one({'review_id': legacy['review_id']}), legacy_before)
        self.assertEqual(preservation.canonical(await self.db.users.find({}).sort('user_id').to_list(None)), grants_before)

        other = await self.upload(b'Synthetic other-client bytes', 'Synthetic other-client.bin', cid='b')
        self.sign_in('member')
        denied = await self.client.get('/api/evidence/' + other['evidence_id'] + '/download')
        self.assertEqual(denied.status_code, 403, denied.text)
        self.sign_in('admin')

        original = await preservation.capture(self.db)
        restored_name = 'test_grc_quality_' + uuid.uuid4().hex
        self.assertNotIn(restored_name, await self.mongo.list_database_names())
        restored = self.mongo[restored_name]
        preservation.require_disposable(restored)
        async def remove_owned_restore():
            preservation.require_disposable(restored)
            await self.mongo.drop_database(restored_name)
            self.assertNotIn(restored_name, await self.mongo.list_database_names())
        self.addAsyncCleanup(remove_owned_restore)
        await preservation.restore(restored, original, ensure_indexes)
        self.assertEqual(preservation.comparable(await preservation.capture(restored)), preservation.comparable(original))
        self.assertEqual(await restored.reviews.find_one({'review_id': legacy['review_id']}), legacy_before)
        self.assertEqual(preservation.canonical(await restored.users.find({}).sort('user_id').to_list(None)), grants_before)
        with patch.object(server, 'db', restored):
            for item, content in ((first, first_bytes), (second, second_bytes)):
                await self.assert_download(item['evidence_id'], content, filename)
            historical = await self.client.get('/api/reviews/' + review['review_id'] + '/history')
            self.assertEqual(historical.status_code, 200, historical.text)
            self.assertTrue(any(o['occurrence_id'] == recorded['occurrence_id'] and
                                {e['evidence_id'] for e in o['evidence']} == {first['evidence_id'], second['evidence_id']}
                                for o in historical.json()))
