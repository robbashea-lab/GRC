"""Actual mounted directory reads project recorded onboarding, without GET writes."""
import unittest
import uuid
from unittest.mock import patch

import test_client_portfolio_dashboard as portfolio_harness
from routes import onboarding, portfolio

server = portfolio_harness.server


class PortfolioOnboardingStateTests(unittest.IsolatedAsyncioTestCase):
    sign_in = portfolio_harness.ClientPortfolioDashboardTests.sign_in
    configure = portfolio_harness.ClientPortfolioDashboardTests.configure
    body = portfolio_harness.ClientPortfolioDashboardTests.body
    get_json = portfolio_harness.ClientPortfolioDashboardTests.get_json

    async def asyncSetUp(self):
        await portfolio_harness.ClientPortfolioDashboardTests.asyncSetUp(self)
        self.client.event_hooks['request'].clear()
        # Legacy onboarding binds its DB on import; keep its durable receipt and
        # server.audit in the same isolated store as the mounted directory read.
        for module in (portfolio, onboarding):
            scoped_db = patch.object(module, 'db', server.db)
            scoped_db.start()
            self.addCleanup(scoped_db.stop)
        self.sign_in('admin')

    async def snapshot(self):
        return {kind: await server.db[kind].find({}, {'_id': 0}).to_list(None)
                for kind in ('clients', 'requirements', 'policies', 'reviews', 'audit_logs', 'create_requests')}

    async def directory(self):
        before = await self.snapshot()
        rows = (await self.get_json('clients/directory'))['clients']
        self.assertEqual(await self.snapshot(), before, 'Directory projection must not write or backfill onboarding')
        return {row['client_id']: row for row in rows}

    async def test_finalized_general_and_saved_draft_use_actual_native_state(self):
        await self.configure('a', programs=())
        baseline = await self.get_json('onboarding/baseline', client_id='b')
        draft = self.body(programs=(), cid='b')
        draft.update(finalize=False, expected_updated_at=baseline['state'].get('updated_at'),
                     expected_records=baseline['record_versions'])
        response = await self.client.post('/api/onboarding/baseline', json=draft,
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        rows = await self.directory()
        self.assertEqual(rows['a']['onboarding_state'], 'complete')
        self.assertEqual(rows['b']['onboarding_state'], 'in_progress')
        self.assertEqual(rows['a']['shared_programs'], [])

    async def test_legacy_native_completion_event_is_used_only_for_its_client(self):
        response = await self.client.post('/api/onboarding/finalize', json={'client_id': 'a'},
            headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 200, response.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertFalse(client.get('onboarding_baseline'))
        self.assertFalse(client.get('initial_program_baseline'))
        rows = await self.directory()
        self.assertEqual(rows['a']['onboarding_state'], 'complete')
        self.assertEqual(rows['b']['onboarding_state'], 'unknown')

    async def test_absent_or_invalid_proof_remains_unknown_and_role_scope_is_preserved(self):
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'onboarding_baseline': {'completed': 'false'}}})
        rows = await self.directory()
        self.assertEqual(rows['a']['onboarding_state'], 'unknown')
        self.assertEqual(rows['b']['onboarding_state'], 'unknown')
        await server.db.audit_logs.insert_one({'client_id': 'b', 'action': 'onboarding-complete', 'at': '2026-11-19T00:00:00Z'})
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'platform_admin', 'client_ids': ['a'], 'all_clients': False}})
        self.sign_in('admin')
        scoped = await self.directory()
        self.assertEqual(set(scoped), {'a'})
        self.assertEqual(scoped['a']['onboarding_state'], 'unknown')
        self.sign_in('member')
        response = await self.client.get('/api/clients/directory')
        self.assertEqual(response.status_code, 403)

    async def test_pending_native_configuration_does_not_become_completed_from_partial_audit(self):
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'_configuration_lock': 'synthetic-unfinished-plan'}})
        await server.db.audit_logs.insert_one({'client_id': 'a', 'action': 'onboarding-complete', 'at': '2026-11-19T00:00:00Z'})
        self.assertEqual((await self.directory())['a']['onboarding_state'], 'unknown')
