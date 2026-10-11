"""Truthful bulk receipts preserve native conditional writes and recovery."""
import unittest
import asyncio
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness

server = harness.server


class BulkOutcomeTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        self.sign_in('admin')
        self.client._transport.raise_app_exceptions = False
        await server.db.findings.insert_many([{'finding_id': 'one', 'client_id': 'a',
            **server.FindingIn(client_id='a', title='Synthetic first').model_dump(), 'updated_at': None},
            {'finding_id': 'two', 'client_id': 'b',
             **server.FindingIn(client_id='b', title='Synthetic second').model_dump(), 'updated_at': None}])
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Synthetic risk'})
        self.body = {'kind': 'findings', 'ids': ['one', 'two'], 'action': 'update',
                     'payload': {'risk_id': 'risk-a'}, 'expected_versions': {'one': None, 'two': None}}
        self.headers = {'Idempotency-Key': 'synthetic-bulk-operation-0001'}

    async def submit(self):
        return await self.client.post('/api/bulk', json=self.body, headers=self.headers)

    async def test_nested_rejection_reports_applied_and_rejected_in_both_orders(self):
        for order in [['one', 'two'], ['two', 'one']]:
            with self.subTest(order=order):
                await server.db.findings.update_many({}, {'$set': {'risk_id': None, 'updated_at': None}})
                self.body['ids'] = order
                self.headers['Idempotency-Key'] += 'x'
                result = await self.submit()
                self.assertEqual(result.status_code, 200, result.text)
                receipt = result.json()
                self.assertFalse(receipt['ok'])
                self.assertEqual(receipt['count'], 1)
                self.assertEqual({row['id']: row['outcome'] for row in receipt['results']},
                                 {'one': 'applied', 'two': 'rejected'})
                self.assertEqual((await server.db.findings.find_one({'finding_id': 'one'}))['risk_id'], 'risk-a')
                self.assertIsNone((await server.db.findings.find_one({'finding_id': 'two'})).get('risk_id'))

    async def test_completed_replay_does_not_repeat_history_or_overwrite_a_newer_edit(self):
        self.body['payload'] = {'remediation_plan': 'Synthetic updated'}
        result = await self.submit()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['ok'])
        await server.db.findings.update_one({'finding_id': 'one'}, {'$set': {
            'remediation_plan': 'Newer manual edit', 'updated_at': '2026-10-11T20:00:00+00:00'}})
        before = await server.db.audit_logs.count_documents({})
        replay = await self.submit()
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()['ok'])
        self.assertEqual(await server.db.audit_logs.count_documents({}), before)
        self.assertEqual((await server.db.findings.find_one({'finding_id': 'one'}))['remediation_plan'], 'Newer manual edit')

    async def test_failed_required_audit_is_uncertain_then_original_request_recovers_once(self):
        self.body['payload'] = {'remediation_plan': 'Synthetic audit recovery'}
        audit = server.audit
        async def fail_first(*args, **kwargs):
            if len(args) > 3 and args[3] == 'one':
                raise RuntimeError('synthetic audit outage')
            return await audit(*args, **kwargs)
        with patch.object(server, 'audit', fail_first):
            result = await self.submit()
        self.assertEqual(result.status_code, 503, result.text)
        self.assertEqual([row['outcome'] for row in result.json()['detail']['bulk_receipt']['results']], ['uncertain', 'not_attempted'])
        self.assertNotEqual(result.headers.get('X-Create-Rejected'), 'true')
        first = await server.db.findings.find_one({'finding_id': 'one'})
        self.assertEqual(first['remediation_plan'], 'Synthetic audit recovery')
        self.assertIsNone((await server.db.findings.find_one({'finding_id': 'two'})).get('remediation_plan'))
        recovered = await self.submit()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertTrue(recovered.json()['ok'])
        self.assertEqual((await server.db.findings.find_one({'finding_id': 'one'}))['updated_at'], first['updated_at'])
        events = await server.db.audit_logs.find({'entity_id': 'one', 'action': 'update'}).to_list(None)
        self.assertEqual(len(events), 1)

    async def test_fresh_stale_selection_rejects_before_any_write(self):
        self.body['payload'] = {'remediation_plan': 'Conditional save'}
        newer = '2026-10-11T17:00:00+00:00'
        await server.db.findings.update_one({'finding_id': 'two'}, {'$set': {'updated_at': newer}})
        result = await self.submit()
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual(result.headers.get('X-Create-Rejected'), 'true')
        self.assertIsNone((await server.db.findings.find_one({'finding_id': 'one'})).get('remediation_plan'))
        self.assertEqual(await server.db.create_requests.count_documents({'primary_started': True}), 0)
        self.body['expected_versions']['two'] = newer
        self.headers['Idempotency-Key'] += '-refreshed'
        refreshed = await self.submit()
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertTrue(refreshed.json()['ok'])

    async def test_post_preflight_conflict_reports_applied_and_rejected(self):
        self.body['payload'] = {'remediation_plan': 'Conditional save'}
        writer = server.update_entity
        async def concurrent_writer(kind, item_id, body, user, request=None):
            if item_id == 'two':
                await server.db.findings.update_one({'finding_id': 'two'}, {'$set': {'updated_at': 'newer'}})
            return await writer(kind, item_id, body, user, request)
        with patch.object(server, 'update_entity', concurrent_writer):
            result = await self.submit()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual([row['outcome'] for row in result.json()['results']], ['applied', 'rejected'])
        self.assertEqual(result.json()['results'][1]['status'], 409)
        self.assertEqual((await server.db.findings.find_one({'finding_id': 'two'}))['updated_at'], 'newer')

    async def test_foreign_and_readonly_preflight_has_no_mutation_or_receipt_leak(self):
        before = await server.db.findings.find({}).to_list(None)
        self.sign_in('member')
        self.assertEqual((await self.submit()).status_code, 403)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        self.body['ids'] = ['one']
        self.assertEqual((await self.submit()).status_code, 403)
        self.assertEqual(await server.db.findings.find({}).to_list(None), before)

    async def test_delete_audit_failure_is_explicitly_uncertain_and_stops_remaining_deletes(self):
        self.body.update(kind='assets', action='delete', payload=None)
        await server.db.assets.insert_many([{'asset_id': 'one', 'client_id': 'a', 'name': 'First', 'updated_at': None},
                                           {'asset_id': 'two', 'client_id': 'a', 'name': 'Second', 'updated_at': None}])
        audit = server.audit
        async def fail_completion(*args, **kwargs):
            if args[1:4] == ('delete', 'asset', 'one'):
                raise RuntimeError('synthetic lost completion')
            return await audit(*args, **kwargs)
        with patch.object(server, 'audit', fail_completion):
            result = await self.submit()
        self.assertEqual(result.status_code, 503, result.text)
        self.assertEqual([row['outcome'] for row in result.json()['detail']['bulk_receipt']['results']], ['uncertain', 'not_attempted'])
        self.assertNotEqual(result.headers.get('X-Create-Rejected'), 'true')
        self.assertIsNone(await server.db.assets.find_one({'asset_id': 'one'}))
        self.assertIsNotNone(await server.db.assets.find_one({'asset_id': 'two'}))

    async def test_duplicate_inflight_parent_is_retained_not_declared_no_effect(self):
        self.body['payload'] = {'remediation_plan': 'Synthetic duplicate protection'}
        entered, release = asyncio.Event(), asyncio.Event()
        validate = server.assignment_eligibility.validate
        async def blocked(*args, **kwargs):
            entered.set()
            await release.wait()
            return await validate(*args, **kwargs)
        with patch.object(server.assignment_eligibility, 'validate', blocked):
            first = asyncio.create_task(self.submit())
            await asyncio.wait_for(entered.wait(), 10)
            duplicate = await self.submit()
            self.assertEqual(duplicate.status_code, 409, duplicate.text)
            self.assertNotEqual(duplicate.headers.get('X-Create-Rejected'), 'true')
            release.set()
            self.assertTrue((await first).json()['ok'])
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'update'}), 2)

    async def test_parent_fingerprint_rejects_changed_original_payload(self):
        self.body['payload'] = {'remediation_plan': 'Original synthetic request'}
        self.assertTrue((await self.submit()).json()['ok'])
        before = await server.db.findings.find({}).to_list(None)
        self.body['payload']['remediation_plan'] = 'Different request with same key'
        changed = await self.submit()
        self.assertEqual(changed.status_code, 409, changed.text)
        self.assertNotEqual(changed.headers.get('X-Create-Rejected'), 'true')
        self.assertEqual(await server.db.findings.find({}).to_list(None), before)

    async def test_lost_parent_completion_ack_replays_without_repeating_effects(self):
        self.body['payload'] = {'remediation_plan': 'Lost parent acknowledgment'}
        cls = type(server.db.create_requests)
        update = cls.update_one
        async def lose_parent_ack(instance, query, change, *args, **kwargs):
            result = await update(instance, query, change, *args, **kwargs)
            if instance.name == 'create_requests' and change.get('$set', {}).get('result', {}).get('operation_key'):
                raise RuntimeError('Synthetic lost parent acknowledgment')
            return result
        with patch.object(cls, 'update_one', lose_parent_ack):
            lost = await self.submit()
        self.assertEqual(lost.status_code, 503, lost.text)
        before = await server.db.findings.find({}).to_list(None)
        events = await server.db.audit_logs.count_documents({})
        replay = await self.submit()
        self.assertTrue(replay.json()['ok'], replay.text)
        self.assertEqual(await server.db.findings.find({}).to_list(None), before)
        self.assertEqual(await server.db.audit_logs.count_documents({}), events)
