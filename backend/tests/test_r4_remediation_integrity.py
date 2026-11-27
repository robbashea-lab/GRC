"""R4 work identity, independent decisions and retained native rework."""
from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException

import action_items
import create_requests
import remediation_commands
import test_client_dashboard_sources as dashboard_fixture

server = dashboard_fixture.server


class R4RemediationIntegrityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = dashboard_fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = dashboard_fixture.ClientDashboardSourcesTests.sign_in

    async def seed_workers(self):
        for uid in ('worker-one', 'worker-two', 'prior-worker', 'current-owner'):
            await server.db.users.insert_one({'user_id': uid, 'name': 'Renamed ' + uid,
                                             'email': uid + '@example.test', 'role': 'platform_admin',
                                             'client_ids': ['a'], 'status': 'active'})

    async def pending(self, *, history=None, worker='worker-one'):
        await self.seed_workers()
        finding = {'finding_id': 'r4-finding', 'client_id': 'a', 'title': 'Synthetic observed gap',
                   'status': 'remediated', 'primary_task_id': 'r4-first',
                   'updated_at': '2026-11-19T00:00:00+00:00'}
        task = {'task_id': 'r4-first', 'client_id': 'a', 'finding_id': finding['finding_id'],
                'title': 'Synthetic correction', 'source_type': 'finding', 'source_id': finding['finding_id'],
                'status': 'done', 'priority': 'medium', 'assignee_id': 'current-owner',
                'completed_at': '2026-11-18T23:59:00+00:00', 'updated_at': finding['updated_at']}
        if worker is not None:
            task['completed_by'] = worker
        if history is not None:
            task['submission_history'] = deepcopy(history)
        await server.db.findings.insert_one(deepcopy(finding))
        await server.db.tasks.insert_one(deepcopy(task))
        return finding, task

    def decision(self, finding, request_id='r4-validation-intent'):
        return {'rationale': 'Independently checked the saved correction',
                'expected_updated_at': finding['updated_at'], 'request_id': request_id}

    async def test_each_related_submitter_prior_worker_and_current_owner_is_excluded(self):
        finding, _ = await self.pending(history=[{'by': 'prior-worker', 'at': '2026-10-01'}])
        await server.db.tasks.insert_one({'task_id': 'r4-second', 'client_id': 'a',
                                         'finding_id': finding['finding_id'], 'status': 'done',
                                         'completed_by': 'worker-two'})
        for uid in ('worker-one', 'worker-two', 'prior-worker', 'current-owner'):
            with self.subTest(uid=uid):
                self.sign_in(uid)
                response = await self.client.post('/api/findings/r4-finding/validate',
                                                  json=self.decision(finding, 'r4-deny-' + uid))
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual((await server.db.findings.find_one({'finding_id': 'r4-finding'}))['status'], 'remediated')
        self.sign_in('admin')
        response = await self.client.post('/api/findings/r4-finding/validate', json=self.decision(finding))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['validated_by'], 'admin')
        self.assertEqual(response.json()['decision_history'][0]['by'], 'admin')

    async def test_unknown_legacy_worker_is_not_inferred_from_owner_or_name(self):
        finding, task = await self.pending(worker=None)
        self.sign_in('admin')
        response = await self.client.post('/api/findings/r4-finding/validate', json=self.decision(finding))
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn('unknown legacy', response.text)
        saved = await server.db.tasks.find_one({'task_id': task['task_id']}, {'_id': 0})
        self.assertEqual(saved, task)
        self.assertNotIn('decision_history', await server.db.findings.find_one({'finding_id': 'r4-finding'}))

    async def test_unknown_earlier_submission_blocks_even_with_known_latest_worker(self):
        finding, _ = await self.pending(history=[{'by': None, 'at': '2026-10-01'},
                                                {'by': 'worker-one', 'at': '2026-11-18'}])
        self.sign_in('admin')
        response = await self.client.post('/api/findings/r4-finding/validate', json=self.decision(finding))
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 1)

    async def test_cancelled_record_keeps_its_actual_historical_worker_excluded(self):
        finding, _ = await self.pending()
        await server.db.tasks.insert_one({'task_id': 'retained-cancelled', 'client_id': 'a',
                                         'finding_id': finding['finding_id'], 'status': 'cancelled',
                                         'submission_history': [{'by': 'prior-worker', 'at': '2026-10-01'}]})
        self.sign_in('prior-worker')
        response = await self.client.post('/api/findings/r4-finding/validate', json=self.decision(finding))
        self.assertEqual(response.status_code, 403, response.text)

    async def test_all_actions_must_be_submitted_and_stale_decision_writes_nothing(self):
        finding, _ = await self.pending()
        await server.db.tasks.insert_one({'task_id': 'outstanding', 'client_id': 'a',
                                         'finding_id': finding['finding_id'], 'status': 'open'})
        self.sign_in('admin')
        path = '/api/findings/r4-finding/validate'
        response = await self.client.post(path, json=self.decision(finding, 'r4-incomplete-work'))
        self.assertEqual(response.status_code, 409, response.text)
        await server.db.tasks.update_one({'task_id': 'outstanding'}, {'$set': {
            'status': 'done', 'completed_by': 'worker-two', 'completed_at': '2026-11-19T00:01:00+00:00'}})
        self.assertIsNone(await server.db.tasks.find_one({'finding_id': finding['finding_id'],
                                                        'status': {'$nin': ['done', 'cancelled']}}))
        before_finding = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        before_tasks = await server.db.tasks.find({'finding_id': finding['finding_id']}).sort('task_id', 1).to_list(None)
        stale = {**self.decision(finding, 'r4-stale-validation'), 'expected_updated_at': 'obsolete'}
        response = await self.client.post(path, json=stale)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn('changed', response.text.lower())
        self.assertEqual(await server.db.findings.find_one({'finding_id': finding['finding_id']}), before_finding)
        self.assertEqual(await server.db.tasks.find({'finding_id': finding['finding_id']}).sort('task_id', 1).to_list(None), before_tasks)
        self.assertNotIn('decision_history', await server.db.findings.find_one({'finding_id': 'r4-finding'}))

    async def test_validator_cannot_be_selected_or_spoofed_in_the_request(self):
        finding, _ = await self.pending()
        self.sign_in('admin')
        for field in ('validator_id', 'validator', 'validated_by'):
            with self.subTest(field=field):
                response = await self.client.post('/api/findings/r4-finding/validate',
                                                  json={**self.decision(finding, 'r4-spoof-' + field), field: 'worker-two'})
                self.assertEqual(response.status_code, 422, response.text)
        self.assertNotIn('decision_history', await server.db.findings.find_one({'finding_id': 'r4-finding'}))

    async def test_native_submission_uses_authenticated_worker_and_cannot_be_replaced(self):
        await self.seed_workers()
        await server.db.tasks.insert_one({'task_id': 'fresh-action', 'client_id': 'a', 'status': 'open',
                                         'title': 'Synthetic work', 'priority': 'medium',
                                         'assignee_id': 'current-owner', 'updated_at': '2026-11-19T00:00:00+00:00'})
        self.sign_in('worker-one')
        response = await self.client.patch('/api/tasks/fresh-action', json={'status': 'done'})
        self.assertEqual(response.status_code, 200, response.text)
        done = response.json()
        self.assertEqual(done['completed_by'], 'worker-one')
        self.assertEqual(done['submission_history'], [{'by': 'worker-one', 'at': done['completed_at']}])
        before = await server.db.tasks.find_one({'task_id': 'fresh-action'})
        self.sign_in('worker-two')
        response = await self.client.patch('/api/tasks/fresh-action', json={'status': 'done'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.tasks.find_one({'task_id': 'fresh-action'}), before)
        forged = await self.client.patch('/api/tasks/fresh-action', json={'submission_history': [{'by': 'admin'}]})
        self.assertEqual(forged.status_code, 422, forged.text)
        self.assertEqual(await server.db.tasks.find_one({'task_id': 'fresh-action'}), before)

    async def test_wrong_client_role_and_disabled_validator_are_denied(self):
        finding, _ = await self.pending()
        await server.db.users.insert_one({'user_id': 'outside-validator', 'email': 'outside-validator@example.test', 'role': 'platform_admin',
                                         'client_ids': ['b'], 'status': 'active'})
        await server.db.users.insert_one({'user_id': 'disabled-validator', 'email': 'disabled-validator@example.test', 'role': 'super_admin',
                                         'client_ids': ['a'], 'status': 'disabled'})
        for uid, status in (('outside-validator', 403), ('member', 403), ('disabled-validator', 401)):
            with self.subTest(uid=uid):
                self.sign_in(uid)
                response = await self.client.post('/api/findings/r4-finding/validate',
                                                  json=self.decision(finding, 'r4-identity-' + uid))
                self.assertEqual(response.status_code, status, response.text)
        self.assertNotIn('decision_history', await server.db.findings.find_one({'finding_id': 'r4-finding'}))

    async def test_completed_task_is_immutable_in_single_and_bulk_edits(self):
        _, task = await self.pending()
        self.sign_in('admin')
        before = await server.db.tasks.find_one({'task_id': task['task_id']})
        unchanged = await self.client.patch('/api/tasks/' + task['task_id'], json={'status': 'done'})
        self.assertEqual(unchanged.status_code, 200, unchanged.text)
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before)
        for change in ({'title': 'Altered history'}, {'resolution': 'Rewritten result'},
                       {'assignee_id': 'admin'}, {'status': 'open'}, {'due_date': '2027-01-01'}):
            with self.subTest(change=change):
                response = await self.client.patch('/api/tasks/' + task['task_id'], json=change)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before)
        response = await self.client.post('/api/bulk', json={'kind': 'tasks', 'ids': [task['task_id']],
                                                            'action': 'assign', 'payload': {'assignee_id': 'admin'}})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before)

    async def test_submission_capture_preserves_known_and_unknown_prior_work(self):
        previous = {'status': 'open', 'completed_by': None, 'completed_at': '2026-10-01',
                    'submission_history': [{'by': 'prior-worker', 'at': '2026-09-01'}]}
        before = deepcopy(previous)
        captured = action_items.submission_patch(previous, {'status': 'done'}, {'user_id': 'worker-two'}, '2026-11-19')
        self.assertEqual(previous, before)
        self.assertEqual(captured['submission_history'], [{'by': 'prior-worker', 'at': '2026-09-01'},
                                                        {'by': None, 'at': '2026-10-01'},
                                                        {'by': 'worker-two', 'at': '2026-11-19'}])
        done = {**previous, **captured, 'status': 'done'}
        self.assertEqual(action_items.submission_patch(done, {'status': 'done'}, {'user_id': 'admin'}, 'later'), {})
        self.assertIn(None, action_items.work_submitters(done))

    async def test_rejection_preserves_done_work_and_recovers_one_replacement(self):
        finding, task = await self.pending()
        original_task = await server.db.tasks.find_one({'task_id': task['task_id']})
        user = await server.db.users.find_one({'user_id': 'admin'})
        body = server.DecisionIn(**self.decision(finding, 'r4-rejected-correction'))
        audit = server.audit

        async def fail_decision_audit(actor, action, *args, **kwargs):
            if action == 'reject':
                raise RuntimeError('Synthetic decision audit interruption')
            return await audit(actor, action, *args, **kwargs)

        with patch.object(server, 'audit', fail_decision_audit):
            with self.assertRaises(HTTPException) as failed:
                await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(failed.exception.status_code, 503)
        recovered = await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(recovered['status'], 'in_remediation')
        self.assertEqual(recovered['decision_history'][0]['action'], 'rejected')
        self.assertEqual(recovered['decision_history'][0]['by'], 'admin')
        self.assertNotEqual(recovered['primary_task_id'], task['task_id'])
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), original_task)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 2)
        self.assertEqual(await remediation_commands.validate(server, finding, body, user, action='reject'), recovered)
        self.assertEqual(await server.db.notifications.count_documents({'entity_id': recovered['primary_task_id']}), 1)
        self.sign_in('worker-two')
        submitted = await self.client.patch('/api/tasks/' + recovered['primary_task_id'], json={'status': 'done'})
        self.assertEqual(submitted.status_code, 200, submitted.text)
        current = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        self.sign_in('worker-one')
        denied = await self.client.post('/api/findings/r4-finding/validate', json=self.decision(current, 'r4-old-worker-rework'))
        self.assertEqual(denied.status_code, 403, denied.text)

    async def test_rejection_insert_failure_repairs_after_the_finding_decision(self):
        finding, task = await self.pending()
        user = await server.db.users.find_one({'user_id': 'admin'})
        body = server.DecisionIn(**self.decision(finding, 'r4-rework-insert-recovery'))
        with patch.object(create_requests, 'insert_primary', side_effect=RuntimeError('Synthetic insert failure')):
            with self.assertRaises(HTTPException) as failed:
                await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(failed.exception.status_code, 503)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        saved = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        self.assertEqual(saved['decision_history'][0]['action'], 'rejected')
        await server.db.users.update_one({'user_id': 'current-owner'}, {'$set': {'status': 'disabled'}})
        recovered = await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 2)
        self.assertEqual(len(recovered['decision_history']), 1)
        self.assertEqual((await server.db.tasks.find_one({'task_id': task['task_id']}))['completed_by'], 'worker-one')
        replacement = await server.db.tasks.find_one({'task_id': recovered['primary_task_id']})
        self.assertEqual(replacement['assignee_id'], 'current-owner')

    async def test_pre_primary_retry_rechecks_retained_assignee_without_replanning_work(self):
        finding, task = await self.pending()
        original_finding = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        original_task = await server.db.tasks.find_one({'task_id': task['task_id']})
        user = await server.db.users.find_one({'user_id': 'admin'})
        body = server.DecisionIn(**self.decision(finding, 'r4-pre-primary-owner-change'))
        with patch.object(remediation_commands, 'capture_finding', side_effect=RuntimeError('Synthetic pre-primary failure')):
            with self.assertRaises(HTTPException) as failed:
                await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(failed.exception.status_code, 503)
        self.assertEqual(await server.db.findings.find_one({'finding_id': finding['finding_id']}), original_finding)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        receipt = await server.db.create_requests.find_one({'rework_task': {'$exists': True}})
        retained_plan = deepcopy(receipt['rework_task'])
        self.assertEqual(retained_plan['assignee_id'], 'current-owner')
        await server.db.users.update_one({'user_id': 'current-owner'}, {'$set': {'status': 'disabled'}})
        recovered = await remediation_commands.validate(server, finding, body, user, action='reject')
        replacement = await server.db.tasks.find_one({'task_id': recovered['primary_task_id']}, {'_id': 0})
        self.assertEqual(replacement, {**retained_plan, 'assignee_id': None})
        saved_receipt = await server.db.create_requests.find_one({'_id': receipt['_id']})
        self.assertEqual(saved_receipt['rework_task'], replacement)
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), original_task)

    async def test_rejected_finding_compare_and_swap_creates_no_orphan_task(self):
        finding, _ = await self.pending()
        user = await server.db.users.find_one({'user_id': 'admin'})
        body = server.DecisionIn(**self.decision(finding, 'r4-rework-cas-denial'))
        collection_type = type(server.db.findings)
        original = collection_type.update_one

        async def fail_finding_cas(collection, query, update, *args, **kwargs):
            decision = update.get('$push', {}).get('decision_history', {})
            if query.get('finding_id') == finding['finding_id'] and decision.get('action') == 'rejected':
                return SimpleNamespace(modified_count=0)
            return await original(collection, query, update, *args, **kwargs)

        with patch.object(collection_type, 'update_one', fail_finding_cas):
            with self.assertRaises(HTTPException) as failed:
                await remediation_commands.validate(server, finding, body, user, action='reject')
        self.assertEqual(failed.exception.status_code, 409)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        self.assertNotIn('decision_history', await server.db.findings.find_one({'finding_id': finding['finding_id']}))

    async def test_rejection_route_enforces_identity_snapshot_and_exact_replay(self):
        finding, task = await self.pending()
        path = '/api/findings/' + finding['finding_id'] + '/reject'
        body = self.decision(finding, 'r4-route-rejection-contract')
        before_finding = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        before_task = await server.db.tasks.find_one({'task_id': task['task_id']})
        self.client.headers.pop('Authorization', None)
        self.assertEqual((await self.client.post(path, json=body)).status_code, 401)
        await server.db.users.insert_one({'user_id': 'outside-validator', 'email': 'outside-validator@example.test', 'role': 'platform_admin',
                                         'client_ids': ['b'], 'status': 'active'})
        for uid in ('outside-validator', 'member', 'worker-one', 'current-owner'):
            with self.subTest(actor=uid):
                self.sign_in(uid)
                response = await self.client.post(path, json=body)
                self.assertEqual(response.status_code, 403, response.text)
        self.sign_in('admin')
        invalid_requests = [
            ({**body, 'request_id': 'r4-route-spoof-validator', 'validator_id': 'worker-two'}, 422),
            ({**body, 'request_id': 'r4-route-spoof-recorder', 'validated_by': 'worker-two'}, 422),
            ({'rationale': body['rationale'], 'request_id': 'r4-route-missing-snapshot'}, 428),
            ({**body, 'request_id': 'r4-route-stale-snapshot', 'expected_updated_at': 'obsolete'}, 409),
        ]
        for invalid, status in invalid_requests:
            with self.subTest(request=invalid['request_id']):
                response = await self.client.post(path, json=invalid)
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(await server.db.findings.find_one({'finding_id': finding['finding_id']}), before_finding)
                self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before_task)
                self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        response = await self.client.post(path, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        rejected = response.json()
        self.assertEqual(rejected['status'], 'in_remediation')
        self.assertEqual(rejected['decision_history'][0]['action'], 'rejected')
        self.assertEqual(rejected['decision_history'][0]['by'], 'admin')
        replacement = await server.db.tasks.find_one({'task_id': rejected['primary_task_id']})
        self.assertNotEqual(replacement['task_id'], task['task_id'])
        self.assertEqual((replacement['client_id'], replacement['finding_id'], replacement['status']),
                         ('a', finding['finding_id'], 'open'))
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before_task)
        replay = await self.client.post(path, json=body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), rejected)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 2)
        self.assertEqual(await server.db.tasks.find_one({'task_id': replacement['task_id']}), replacement)
        self.assertEqual(len((await server.db.findings.find_one({'finding_id': finding['finding_id']}))['decision_history']), 1)

    async def test_rejection_route_rechecks_revoked_actor_before_pending_repair(self):
        finding, task = await self.pending()
        self.sign_in('admin')
        path = '/api/findings/' + finding['finding_id'] + '/reject'
        body = self.decision(finding, 'r4-route-revoked-repair')
        before_task = await server.db.tasks.find_one({'task_id': task['task_id']})
        with patch.object(create_requests, 'insert_primary', side_effect=RuntimeError('Synthetic route insert interruption')):
            interrupted = await self.client.post(path, json=body)
        self.assertEqual(interrupted.status_code, 503, interrupted.text)
        pending_finding = await server.db.findings.find_one({'finding_id': finding['finding_id']})
        self.assertEqual(pending_finding['decision_history'][0]['by'], 'admin')
        receipt = await server.db.create_requests.find_one({'rework_task': {'$exists': True}})
        self.assertEqual(receipt['state'], 'pending')
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_readonly'}})
        denied = await self.client.post(path, json=body)
        self.assertEqual(denied.status_code, 403, denied.text)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin', 'status': 'disabled'}})
        denied = await self.client.post(path, json=body)
        self.assertEqual(denied.status_code, 401, denied.text)
        self.assertEqual(await server.db.findings.find_one({'finding_id': finding['finding_id']}), pending_finding)
        self.assertEqual(await server.db.tasks.find_one({'task_id': task['task_id']}), before_task)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': finding['finding_id']}), 1)
        self.assertEqual(await server.db.create_requests.find_one({'_id': receipt['_id']}), receipt)
