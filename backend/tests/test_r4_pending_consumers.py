"""Mounted onboarding and assignment readers reject partial shared-context facts."""
import copy
import unittest
from unittest.mock import patch

import test_client_dashboard_sources as fixture
from routes.onboarding import BASELINE_CATALOG

server = fixture.server
PENDING = 'd' * 64
IDENTITIES = {'reviews': 'review_id', 'framework_assessments': 'framework_assessment_id'}


class R4PendingConsumerTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def records(self, client_id='a', owner='member'):
        review = {'review_id': client_id + '-reader-review', 'client_id': client_id,
                  'title': 'Synthetic owned Review', 'review_type': 'access', 'status': 'upcoming',
                  'baseline_key': BASELINE_CATALOG['reviews'][0]['key'], 'owner_id': owner,
                  'recurrence': 'annual', 'due_date': '2099-01-31', 'updated_at': 'review-version'}
        assessment = {'framework_assessment_id': client_id + '-reader-assessment', 'client_id': client_id,
                      'framework_key': 'cis-ig1', 'definition_id': '1.1', 'status': 'not_assessed',
                      'title': 'Synthetic owned assessment', 'owner_id': owner,
                      'implementation': 'Explicit synthetic saved arrangement', 'updated_at': 'assessment-version'}
        await server.db.reviews.insert_one(copy.deepcopy(review))
        await server.db.framework_assessments.insert_one(copy.deepcopy(assessment))
        return {'reviews': review, 'framework_assessments': assessment}

    async def snapshot(self):
        names = ('clients', 'users', 'reviews', 'framework_assessments', 'policies', 'requirements',
                 'tasks', 'findings', 'audit_logs', 'create_requests', 'portfolio_events')
        return {name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in names}

    async def assert_read_denied_without_writes(self, path, params=None):
        before = await self.snapshot()
        response = await self.client.get(path, params=params)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn('needs recovery', response.text)
        self.assertNotIn(PENDING, response.text)
        self.assertEqual(await self.snapshot(), before)

    async def assert_only_denial_audits_added(self, before, routes):
        after = await self.snapshot()
        previous_logs = after.pop('audit_logs')
        self.assertEqual(previous_logs[:len(before['audit_logs'])], before['audit_logs'])
        added = previous_logs[len(before['audit_logs']):]
        self.assertEqual(len(added), len(routes))
        for entry, route in zip(added, routes):
            self.assertTrue(entry['log_id'])
            self.assertTrue(entry['at'])
            self.assertEqual({key: entry[key] for key in (
                'user_id', 'user_email', 'user_name', 'action', 'entity_type', 'entity_id', 'client_id', 'outcome', 'meta')},
                {'user_id': 'member', 'user_email': 'member@example.test', 'user_name': 'member',
                 'action': 'access-denied', 'entity_type': 'security', 'entity_id': None, 'client_id': None,
                 'outcome': 'denied', 'meta': {'outcome': 'denied', 'method': 'GET', 'route': route, 'status': 403}})
        self.assertEqual(after, {name: rows for name, rows in before.items() if name != 'audit_logs'})

    async def test_handoff_and_version_capture_refuse_review_or_assessment_only_claims(self):
        rows = await self.records()
        self.sign_in('member')
        for kind, row in rows.items():
            with self.subTest(claimed=kind):
                field = IDENTITIES[kind]
                await server.db[kind].update_one({field: row[field]}, {'$set': {'_r4_context_pending': PENDING}})
                self.assertFalse((await server.db.clients.find_one({'client_id': 'a'})).get('_r4_context_pending'))
                for path in ('/api/onboarding/handoff', '/api/onboarding/baseline'):
                    await self.assert_read_denied_without_writes(path, {'client_id': 'a'})
                await server.db[kind].update_one({field: row[field]}, {'$unset': {'_r4_context_pending': ''}})

    async def claim_at_projected_read(self, kind, row, path, params):
        """Land after the full pending preflight, immediately before the projected read."""
        collection = server.db[kind]
        collection_type = type(collection)
        original_find = collection_type.find
        field = IDENTITIES[kind]
        injected = False

        class ClaimedCursor:
            def __init__(self, cursor):
                self.cursor = cursor

            def sort(self, *args, **kwargs):
                self.cursor = self.cursor.sort(*args, **kwargs)
                return self

            async def to_list(self, length=None):
                nonlocal injected
                if not injected:
                    injected = True
                    await collection.update_one({field: row[field]}, {'$set': {'_r4_context_pending': PENDING}})
                return await self.cursor.to_list(length)

        def find_with_claim(target, *args, **kwargs):
            cursor = original_find(target, *args, **kwargs)
            projection = args[1] if len(args) > 1 else kwargs.get('projection', {})
            if (not injected and target.full_name == collection.full_name
                    and isinstance(projection, dict) and projection.get(field) == 1):
                return ClaimedCursor(cursor)
            return cursor

        before = await self.snapshot()
        with patch.object(collection_type, 'find', find_with_claim):
            response = await self.client.get(path, params=params)
        self.assertTrue(injected, 'Claim must land at the actual projected consumer read')
        self.assertEqual(response.status_code, 409, response.text)
        after = await self.snapshot()
        changed = next(value for value in after[kind] if value[field] == row[field])
        self.assertEqual(changed.pop('_r4_context_pending'), PENDING)
        self.assertEqual(after, before)
        await collection.update_one({field: row[field]}, {'$unset': {'_r4_context_pending': ''}})

    async def test_handoff_and_version_projection_keep_claims_that_arrive_after_preflight(self):
        rows = await self.records()
        self.sign_in('member')
        for kind in ('reviews', 'framework_assessments'):
            with self.subTest(consumer='handoff', claimed=kind):
                await self.claim_at_projected_read(kind, rows[kind], '/api/onboarding/handoff', {'client_id': 'a'})
        # Baseline's public version DTO covers Reviews, not assessment records.
        await self.claim_at_projected_read('reviews', rows['reviews'], '/api/onboarding/baseline', {'client_id': 'a'})

    async def test_settled_onboarding_reads_ignore_foreign_claims_and_preserve_public_version_shape(self):
        rows = await self.records()
        foreign = await self.records('b')
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': PENDING}})
        for kind, row in foreign.items():
            field = IDENTITIES[kind]
            await server.db[kind].update_one({field: row[field]}, {'$set': {'_r4_context_pending': PENDING}})
        self.sign_in('member')
        before = await self.snapshot()
        handoff = await self.client.get('/api/onboarding/handoff', params={'client_id': 'a'})
        self.assertEqual(handoff.status_code, 200, handoff.text)
        for kind, field in IDENTITIES.items():
            self.assertEqual([item[field] for item in handoff.json()['records'][kind]], [rows[kind][field]])
        self.assertNotIn('_r4_context_', handoff.text)
        baseline = await self.client.get('/api/onboarding/baseline', params={'client_id': 'a'})
        self.assertEqual(baseline.status_code, 200, baseline.text)
        versions = baseline.json()['record_versions']
        self.assertEqual({key.split(':')[0] for key in versions}, {'policies', 'requirements', 'reviews'})
        self.assertEqual(versions['reviews:' + rows['reviews']['baseline_key']],
                         {'review_id': rows['reviews']['review_id'], 'updated_at': 'review-version'})
        self.assertNotIn('_r4_context_', baseline.text)
        self.assertEqual((await self.client.get('/api/onboarding/handoff', params={'client_id': 'b'})).status_code, 403)
        await self.assert_only_denial_audits_added(before, ['/api/onboarding/handoff'])

    async def test_open_assignments_rejects_review_and_assessment_only_claims_without_client_claim(self):
        rows = await self.records()
        self.sign_in('member')
        for kind, row in rows.items():
            with self.subTest(claimed=kind):
                field = IDENTITIES[kind]
                await server.db[kind].update_one({field: row[field]}, {'$set': {'_r4_context_pending': PENDING}})
                await self.assert_read_denied_without_writes('/api/users/member/open_assignments')
                await server.db[kind].update_one({field: row[field]}, {'$unset': {'_r4_context_pending': ''}})

    async def test_open_assignment_projection_rechecks_a_claim_after_count_preflight(self):
        rows = await self.records()
        self.sign_in('member')
        for kind, row in rows.items():
            with self.subTest(claimed=kind):
                await self.claim_at_projected_read(kind, row, '/api/users/member/open_assignments', None)

    async def test_open_assignments_checks_pending_rows_beyond_the_public_item_cap(self):
        self.sign_in('member')
        reviews = [{'review_id': 'clean-%03d' % index, 'client_id': 'a', 'owner_id': 'member',
                    'title': 'Synthetic settled Review', 'status': 'upcoming'} for index in range(100)]
        reviews.append({'review_id': 'zz-pending-outside-item-cap', 'client_id': 'a', 'owner_id': 'member',
                        'title': 'Synthetic pending Review beyond cap', 'status': 'upcoming',
                        '_r4_context_pending': PENDING})
        await server.db.reviews.insert_many(reviews)
        await self.assert_read_denied_without_writes('/api/users/member/open_assignments')

    async def test_open_assignments_preserves_foreign_unrelated_and_terminal_scope(self):
        rows = await self.records()
        await self.records('b')
        await server.db.clients.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': PENDING}})
        await server.db.reviews.update_one({'client_id': 'b'}, {'$set': {'_r4_context_pending': PENDING}})
        await server.db.reviews.insert_many([
            {'review_id': 'other-owner-pending', 'client_id': 'a', 'owner_id': 'admin',
             'title': 'Unrelated owner', 'status': 'upcoming', '_r4_context_pending': PENDING},
            {'review_id': 'terminal-pending', 'client_id': 'a', 'owner_id': 'member',
             'title': 'Terminal work', 'status': 'completed', '_r4_context_pending': PENDING},
        ])
        self.sign_in('member')
        before = await self.snapshot()
        response = await self.client.get('/api/users/member/open_assignments')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 2)
        self.assertEqual({item['id'] for item in response.json()['items']},
                         {rows['reviews']['review_id'], rows['framework_assessments']['framework_assessment_id']})
        self.assertNotIn('_r4_context_', response.text)
        self.assertEqual((await self.client.get('/api/users/admin/open_assignments')).status_code, 403)
        self.assertEqual((await self.client.get('/api/users/member/open_assignments', params={'client_id': 'b'})).status_code, 403)
        await self.assert_only_denial_audits_added(before, ['/api/users/{user_id}/open_assignments'] * 2)
