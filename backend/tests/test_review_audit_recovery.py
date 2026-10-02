"""Create-event history must retain its first metadata across late retries."""
import unittest
from unittest.mock import AsyncMock, patch

import test_review_recovery as recovery

server = recovery.server


class ReviewAuditRecoveryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = recovery.ReviewRecoveryTests.asyncSetUp
    sign_in = recovery.ReviewRecoveryTests.sign_in
    prepare = recovery.ReviewRecoveryTests.prepare
    create = recovery.ReviewRecoveryTests.create

    async def test_late_retry_retains_original_audit_despite_later_record_and_actor_edits(self):
        body = await self.prepare()
        with patch.object(server, 'create_notification', AsyncMock(side_effect=RuntimeError('notification outage'))):
            failed = await self.create(body)
        self.assertEqual(failed.status_code, 503, failed.text)
        original = await server.db.audit_logs.find_one({'action': 'Action Item created'})
        self.assertIsNotNone(original)
        task = await server.db.tasks.find_one({})
        await server.db.tasks.update_one({'task_id': task['task_id']}, {'$set': {'title': 'Later operator edit'}})
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'name': 'Renamed operator'}})
        result = await self.create(body)
        self.assertEqual(result.status_code, 200, result.text)
        events = await server.db.audit_logs.find({'action': 'Action Item created'}).to_list(None)
        self.assertEqual(events, [original])
        self.assertEqual((await server.db.tasks.find_one({}))['title'], 'Later operator edit')

    async def test_legacy_event_identity_is_retained_and_distinct_linked_actions_do_not_collapse(self):
        await self.prepare()
        intent = 'synthetic-event-identity'
        old = {'log_id': 'prior-log', 'at': '2027-01-01', 'user_id': 'admin', 'user_email': 'old@example.test',
               'action': 'Action Item created', 'entity_type': 'review', 'entity_id': 'recovery', 'client_id': 'a',
               'meta': {'occurrence_id': 'occ_recovery', 'task_id': 'first-task', 'title': 'Original title'}}
        await server.db.create_requests.insert_one({'_id': intent, 'pending_audits': {'legacy-key': old}})
        token = server.create_requests.current.set(intent)
        try:
            actor = {'user_id': 'admin', 'email': 'new@example.test'}
            await server.audit(actor, 'Action Item created', 'review', 'recovery', 'a',
                               {'occurrence_id': 'occ_recovery', 'task_id': 'first-task', 'title': 'New title'})
            await server.audit(actor, 'Action Item created', 'review', 'recovery', 'a',
                               {'occurrence_id': 'occ_recovery', 'task_id': 'second-task', 'title': 'Other task'})
        finally:
            server.create_requests.current.reset(token)
        self.assertEqual(await server.db.audit_logs.count_documents({}), 2)
        self.assertEqual(await server.db.audit_logs.find_one({'_id': 'create:legacy-key'}), {'_id': 'create:legacy-key', **old})
