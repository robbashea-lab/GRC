"""Pending native context must not become public Evidence metadata or facets."""
import base64
from copy import deepcopy
import hashlib
import json
import unittest
import uuid
from unittest.mock import patch

from framework_catalog import active_plans
import r4_services as services
import review_occurrences
import test_client_dashboard_sources as fixture

server = fixture.server
CONTENT = 'Owned synthetic Evidence — 合成 QA\n'.encode('utf-8')
REVIEW_ID = 'r4-evidence-context-review'
ASSESSMENT_ID = 'r4-evidence-context-assessment'


class R4PendingEvidenceContextTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in
    r4_valid_completion_fixture = True

    async def prepare_context(self):
        self.sign_in('admin')
        plan = active_plans('cis-ig1')[0]
        activity = 'review:' + REVIEW_ID
        area = services.TOPICS[services.template_id({
            'framework_key': 'cis-ig1', 'framework_plan_key': plan['key']})]['areas'][0]
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {
            'updated_at': '2026-11-19T00:00:00+00:00',
            'framework_settings': {'cis-ig1': {'implementation_group': 1}},
            'profile.services': {'areas': {area: {'responsibility': 'iv', 'tool_ids': []}},
                'custom_tools': [], 'exclusions': {}, 'provider_vendor_id': 'r4-evidence-provider',
                'assessment_activities': {'setup:' + activity: activity}}}})
        await server.db.vendors.insert_one({'vendor_id': 'r4-evidence-provider', 'client_id': 'a',
            'name': 'Owned synthetic provider', 'status': 'active'})
        await server.db.requirements.insert_one({'requirement_id': 'r4-evidence-program', 'client_id': 'a',
            'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        review = {'review_id': REVIEW_ID, 'client_id': 'a', 'title': 'Owned recurring Evidence Review',
            'review_type': plan['review_type'], 'framework_key': 'cis-ig1', 'framework_plan_key': plan['key'],
            'framework_safeguards': plan['safeguards'], 'baseline_key': plan.get('baseline_key'),
            'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2098-12-01',
            'owner_id': 'member', 'current_occurrence_id': 'r4-evidence-current-occurrence',
            'updated_at': '2026-11-19T00:00:01+00:00', 'occurrences': [],
            'activity_setup': {'recurring_ticket_number': '318', 'notes': 'Retained setup notes'}}
        review.update(review_occurrences.schedule(review))
        await server.db.reviews.insert_one(review)
        await server.db.framework_assessments.insert_one({
            'framework_assessment_id': ASSESSMENT_ID, 'client_id': 'a', 'framework_key': 'cis-ig1',
            'framework_version': '8.1', 'definition_id': '1.1', 'status': 'not_assessed',
            'implementation': '', 'technology': '', 'notes': '', 'na_rationale': '',
            'verification': 'not_verified', 'owner_id': 'member',
            'related_links': [], 'assessment_history': []})
        return activity

    async def upload(self, filename, kind=None, ident=None, occurrence=None):
        body = {'client_id': 'a', 'filename': filename, 'mime_type': 'text/plain',
                'content_base64': base64.b64encode(CONTENT).decode('ascii')}
        if kind:
            body.update(linked_type=kind, linked_id=ident)
        if occurrence:
            body['occurrence_id'] = occurrence
        response = await self.client.post('/api/evidence', json=body,
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        saved = await server.db.evidence.find_one({'evidence_id': response.json()['evidence_id']})
        self.assertEqual(saved['version'], 1)
        self.assertEqual(saved['sha256'], hashlib.sha256(CONTENT).hexdigest())
        return saved

    async def snapshot(self):
        return {kind: await server.db[kind].find({}).to_list(None) for kind in
                ('clients', 'reviews', 'framework_assessments', 'vendors', 'evidence',
                 'audit_logs', 'create_requests')}

    async def assert_file_retained(self, saved):
        current = await server.db.evidence.find_one({'evidence_id': saved['evidence_id']})
        self.assertEqual(current, saved)
        downloaded = await self.client.get('/api/evidence/' + saved['evidence_id'] + '/download')
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        payload = downloaded.json()
        self.assertEqual(payload['filename'], saved['filename'])
        self.assertEqual(payload['mime_type'], 'application/octet-stream')
        file_bytes = base64.b64decode(payload['content_base64'], validate=True)
        self.assertEqual(file_bytes, CONTENT)
        self.assertEqual(hashlib.sha256(file_bytes).hexdigest(), saved['sha256'])

    async def fail_after_business_write(self, action, invoke):
        native_audit = server.audit
        reached = False

        async def interrupt(user, event, *args, **kwargs):
            nonlocal reached
            if event == action:
                reached = True
                raise RuntimeError('Owned synthetic failure after accepted context writes')
            return await native_audit(user, event, *args, **kwargs)

        with patch.object(server, 'audit', interrupt):
            response = await invoke()
        self.assertTrue(reached, 'The actual post-business-write audit boundary must be reached: '
                        f'HTTP {response.status_code} {response.text}')
        self.assertEqual(response.status_code, 503, response.text)

    async def review_intent(self):
        review = await server.db.reviews.find_one({'review_id': REVIEW_ID})
        client = await server.db.clients.find_one({'client_id': 'a'})
        return {'activity_id': 'review:' + REVIEW_ID, 'review_id': REVIEW_ID,
            'expected_updated_at': review['updated_at'], 'expected_client_updated_at': client['updated_at'],
            'first_next_due': '2099-12-01', 'cadence': 'annual'}

    async def test_review_only_pending_context_blocks_all_catalog_inputs_and_detail_until_exact_recovery(self):
        await self.prepare_context()
        evidence = await self.upload('linked-review.txt', 'review', REVIEW_ID, 'r4-evidence-current-occurrence')
        visible = await self.upload('aaa-visible-first-page.txt')
        first_page = {'client_id': 'a', 'page_size': 1,
                      'state': json.dumps({'sort': {'key': 'filename', 'dir': 'asc'}})}
        first = await self.client.get('/api/evidence/catalog', params=first_page)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['items'][0]['evidence_id'], visible['evidence_id'])
        client_before = await server.db.clients.find_one({'client_id': 'a'})
        body, headers = await self.review_intent(), {'Idempotency-Key': uuid.uuid4().hex}
        await self.fail_after_business_write('Services and tools updated',
            lambda: self.client.post('/api/clients/a/iv-setup', json=body, headers=headers))
        pending = await server.db.reviews.find_one({'review_id': REVIEW_ID})
        self.assertTrue(pending.get('_r4_context_pending'))
        self.assertEqual(pending['due_date'][:10], '2099-12-01')
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
        receipt = await server.db.create_requests.find_one({'_id': pending['_r4_context_pending']})
        frozen = deepcopy(receipt['r4_write_plan'])
        self.assertEqual([(row['collection'], row['id']) for row in frozen], [('reviews', REVIEW_ID)])
        before = await self.snapshot()
        for path, params in [('/api/evidence/catalog', first_page),
                             ('/api/evidence/catalog', {'client_id': 'a', 'q': 'visible-first-page'}),
                             ('/api/evidence-library/items/' + evidence['evidence_id'], {})]:
            refused = await self.client.get(path, params=params)
            self.assertEqual(refused.status_code, 409, refused.text)
            self.assertNotIn('items', refused.json())
            self.assertEqual(await self.snapshot(), before)
        recovered = await self.client.post('/api/clients/a/iv-setup', json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual((await server.db.create_requests.find_one({'_id': receipt['_id']}))['r4_write_plan'], frozen)
        catalog = await self.client.get('/api/evidence/catalog', params={'client_id': 'a'})
        self.assertEqual(catalog.status_code, 200, catalog.text)
        item = next(row for row in catalog.json()['items'] if row['evidence_id'] == evidence['evidence_id'])
        self.assertEqual(item['context']['source']['status'], 'upcoming')
        self.assertEqual(item['years'], ['2099'])
        self.assertNotIn('_r4_context_', catalog.text)
        await self.assert_file_retained(evidence)
        await self.assert_file_retained(visible)

    async def test_assessment_only_pending_reverse_relationship_blocks_status_and_facets_until_recovery(self):
        await self.prepare_context()
        evidence = await self.upload('assessment-support.txt')
        path = '/api/framework_assessments/' + ASSESSMENT_ID
        linked = await self.client.post(path + '/links', json={'kind': 'evidence', 'id': evidence['evidence_id']})
        self.assertEqual(linked.status_code, 200, linked.text)
        client_before = await server.db.clients.find_one({'client_id': 'a'})
        body = {'implementation': 'Explicit owned synthetic assessment change', 'status': 'in_progress',
            'expected_last_assessed': None,
            'coordination': {'expected_client_updated_at': client_before['updated_at']}}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        await self.fail_after_business_write('Shared assessment context saved',
            lambda: self.client.patch(path, json=body, headers=headers))
        pending = await server.db.framework_assessments.find_one({'framework_assessment_id': ASSESSMENT_ID})
        self.assertTrue(pending.get('_r4_context_pending'))
        self.assertEqual(pending['status'], 'in_progress')
        self.assertEqual(await server.db.clients.find_one({'client_id': 'a'}), client_before)
        receipt = await server.db.create_requests.find_one({'_id': pending['_r4_context_pending']})
        self.assertEqual([row['collection'] for row in receipt['r4_write_plan']], ['framework_assessments'])
        before = await self.snapshot()
        for route in ('/api/evidence/catalog?client_id=a', '/api/evidence-library/items/' + evidence['evidence_id']):
            refused = await self.client.get(route)
            self.assertEqual(refused.status_code, 409, refused.text)
            self.assertEqual(await self.snapshot(), before)
        recovered = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        catalog = await self.client.get('/api/evidence/catalog', params={'client_id': 'a'})
        self.assertEqual(catalog.status_code, 200, catalog.text)
        reference = next(ref for ref in catalog.json()['items'][0]['references'] if ref['id'] == ASSESSMENT_ID)
        self.assertEqual(reference['status'], 'in_progress')
        self.assertEqual(reference['framework_key'], 'cis-ig1')
        self.assertEqual(catalog.json()['items'][0]['frameworks'], ['cis-ig1'])
        await self.assert_file_retained(evidence)

    async def test_pending_client_refuses_empty_catalog_and_existing_detail_until_recovery(self):
        self.sign_in('admin')
        evidence = await self.upload('archived-inventory.txt')
        archived = await self.client.delete('/api/evidence/' + evidence['evidence_id'])
        self.assertEqual(archived.status_code, 200, archived.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        payload = {'expected_updated_at': client.get('updated_at'), 'areas': {'endpoint': {'responsibility': 'iv', 'tool_ids': []}},
                   'custom_tools': [], 'preset': None}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        await self.fail_after_business_write('Services and tools updated',
            lambda: self.client.post('/api/clients/a/services', json=payload, headers=headers))
        self.assertTrue((await server.db.clients.find_one({'client_id': 'a'})).get('_r4_context_pending'))
        before = await self.snapshot()
        for route in ('/api/evidence/catalog?client_id=a', '/api/evidence-library/items/' + evidence['evidence_id']):
            refused = await self.client.get(route)
            self.assertEqual(refused.status_code, 409, refused.text)
            self.assertEqual(await self.snapshot(), before)
        recovered = await self.client.post('/api/clients/a/services', json=payload, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        empty = await self.client.get('/api/evidence/catalog', params={'client_id': 'a'})
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()['total'], 0)
        included = await self.client.get('/api/evidence/catalog', params={'client_id': 'a',
            'state': json.dumps({'include_archived': True})})
        self.assertEqual(included.status_code, 200, included.text)
        self.assertEqual(included.json()['items'][0]['evidence_id'], evidence['evidence_id'])

    async def test_picker_checks_pending_matching_sources_outside_its_first_page_without_blocking_other_searches(self):
        await self.prepare_context()
        for number in range(25):
            await server.db.reviews.insert_one({'review_id': 'aaa-settled-' + str(number).zfill(2),
                'client_id': 'a', 'title': 'Settled unrelated picker option', 'status': 'upcoming',
                'due_date': '2098-12-01', 'recurrence': 'annual'})
        params = {'client_id': 'a', 'kind': 'reviews'}
        baseline = await self.client.get('/api/evidence-library/sources', params=params)
        self.assertEqual(baseline.status_code, 200, baseline.text)
        self.assertEqual(baseline.json()['total'], 26)
        self.assertEqual(len(baseline.json()['items']), 25)
        self.assertNotIn(REVIEW_ID, [row['id'] for row in baseline.json()['items']])
        body, headers = await self.review_intent(), {'Idempotency-Key': uuid.uuid4().hex}
        await self.fail_after_business_write('Services and tools updated',
            lambda: self.client.post('/api/clients/a/iv-setup', json=body, headers=headers))
        before = await self.snapshot()
        refused = await self.client.get('/api/evidence-library/sources', params=params)
        self.assertEqual(refused.status_code, 409, refused.text)
        matching = await self.client.get('/api/evidence-library/sources', params={**params, 'q': 'Settled unrelated'})
        self.assertEqual(matching.status_code, 200, matching.text)
        self.assertEqual(matching.json()['total'], 25)
        self.assertEqual(len(matching.json()['items']), 25)
        self.assertEqual(await self.snapshot(), before)
        recovered = await self.client.post('/api/clients/a/iv-setup', json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        current = await self.client.get('/api/evidence-library/sources', params=params)
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(current.json(), baseline.json())

    async def test_foreign_pending_parent_and_retained_dangling_reference_do_not_leak_or_block_scoped_reads(self):
        await self.prepare_context()
        evidence = await self.upload('owned-legacy-reference.txt')
        await server.db.reviews.insert_one({'review_id': 'foreign-evidence-parent', 'client_id': 'b',
            'title': 'Foreign confidential Review title', 'status': 'upcoming', 'due_date': '2099-12-01',
            '_r4_context_pending': 'foreign-pending-command'})
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': 'foreign-client-command'}})
        # A retained legacy association is not authority to join another tenant.
        await server.db.evidence.update_one({'evidence_id': evidence['evidence_id']}, {'$set': {
            'linked_type': 'review', 'linked_id': 'foreign-evidence-parent'}})
        self.sign_in('member')
        before = await self.snapshot()
        response = await self.client.get('/api/evidence/catalog', params={'client_id': 'a'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()['items'][0]['context']['source']['available'])
        self.assertNotIn('Foreign confidential Review title', response.text)
        self.assertNotIn('foreign-pending-command', response.text)
        self.assertEqual(await self.snapshot(), before)
        denied = await self.client.get('/api/evidence/catalog', params={'client_id': 'b'})
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertNotIn('items', denied.json())
        self.assertEqual((await server.db.evidence.find_one({'evidence_id': evidence['evidence_id']}))['version'], 1)

    async def test_completed_archived_and_deleted_source_history_keeps_its_existing_metadata_and_file_versions(self):
        await self.prepare_context()
        historical = await self.upload('historical-review.txt', 'review', REVIEW_ID, 'r4-evidence-current-occurrence')
        completed = await self.client.post('/api/reviews/' + REVIEW_ID + '/complete',
            json={'occurrence_id': 'r4-evidence-current-occurrence'})
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()['occurrence']['period'], '2098')
        archived = await self.upload('archived-synthetic.txt')
        response = await self.client.delete('/api/evidence/' + archived['evidence_id'])
        self.assertEqual(response.status_code, 200, response.text)
        archived = await server.db.evidence.find_one({'evidence_id': archived['evidence_id']})
        contact = await self.client.post('/api/contacts', json={'client_id': 'a',
            'name': 'Owned deleted source', 'email': 'deleted-source@example.test'})
        self.assertEqual(contact.status_code, 200, contact.text)
        deleted = await self.upload('deleted-source.txt', 'contact', contact.json()['contact_id'])
        removed = await self.client.request('DELETE', '/api/contacts/' + contact.json()['contact_id'],
            json={'expected_updated_at': contact.json().get('updated_at')})
        self.assertEqual(removed.status_code, 200, removed.text)
        before = await self.snapshot()
        catalog = await self.client.get('/api/evidence/catalog', params={'client_id': 'a',
            'state': json.dumps({'include_archived': True})})
        self.assertEqual(catalog.status_code, 200, catalog.text)
        rows = {row['evidence_id']: row for row in catalog.json()['items']}
        self.assertEqual(set(rows), {historical['evidence_id'], archived['evidence_id'], deleted['evidence_id']})
        self.assertEqual(rows[historical['evidence_id']]['context']['source']['period'], '2098')
        self.assertEqual(rows[historical['evidence_id']]['years'], ['2098'])
        self.assertIsNotNone(rows[archived['evidence_id']]['archived_at'])
        self.assertFalse(rows[deleted['evidence_id']]['context']['source']['available'])
        self.assertEqual(await self.snapshot(), before)
        for saved in (historical, archived, deleted):
            await self.assert_file_retained(saved)
