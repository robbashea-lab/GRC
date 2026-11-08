"""Existing raise-risk command contract; isolated ASGI/in-memory database only."""
import asyncio
import copy
import unittest
from unittest.mock import patch
import test_client_dashboard_sources as fixtures


server = fixtures.server


class FindingRiskNativeCommandTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixtures.ClientDashboardSourcesTests.sign_in

    async def fixture(self, status='closed'):
        finding = {
            'finding_id': 'qa-finding',
            'client_id': 'a',
            'title': 'Synthetic native exposure',
            'description': 'Retained source detail',
            'owner_id': 'member',
            'severity': 'critical',
            'status': status,
            'decision_history': [{'action': 'validated', 'at': '2026-01-02T00:00:00Z'}],
            'created_at': '2026-01-01T00:00:00Z',
        }
        await server.db.findings.insert_one(copy.deepcopy(finding))
        await server.db.tasks.insert_one({
            'task_id': 'qa-work',
            'client_id': 'a',
            'finding_id': 'qa-finding',
            'title': 'Retained linked work',
            'status': 'done',
        })
        await server.db.evidence.insert_one({
            'evidence_id': 'qa-evidence',
            'client_id': 'a',
            'linked_type': 'finding',
            'linked_id': 'qa-finding',
            'content_base64': 'eA==',
        })
        return finding

    async def actor(self, role, clients=('a',)):
        uid = 'qa-' + role
        await server.db.users.insert_one({
            'user_id': uid,
            'email': uid + '@example.test',
            'name': 'Synthetic actor',
            'role': role,
            'client_ids': list(clients),
            'status': 'active',
        })
        self.sign_in(uid)

    async def test_both_administrators_create_unassessed_risk_preserving_native_records(self):
        for role in ('super_admin', 'platform_admin'):
            with self.subTest(role=role):
                await server.db.findings.delete_many({})
                await server.db.tasks.delete_many({})
                await server.db.evidence.delete_many({})
                original = await self.fixture()
                await self.actor(role)
                work = await server.db.tasks.find_one({'task_id': 'qa-work'})
                evidence = await server.db.evidence.find_one({'evidence_id': 'qa-evidence'})
                response = await self.client.post('/api/findings/qa-finding/raise-risk')
                self.assertEqual(response.status_code, 200, response.text)
                risk = response.json()['risk']
                for field in ('likelihood_score', 'impact_score', 'risk_score', 'risk_level'):
                    self.assertIsNone(risk[field])
                self.assertEqual({
                    k: risk[k] for k in (
                        'client_id', 'owner_id', 'category', 'status', 'treatment',
                        'description', 'source_type', 'source_id', 'finding_id',
                        'related_finding_ids'
                    )
                }, {
                    'client_id': 'a',
                    'owner_id': 'member',
                    'category': 'compliance',
                    'status': 'identified',
                    'treatment': 'mitigate',
                    'description': 'Retained source detail',
                    'source_type': 'finding',
                    'source_id': 'qa-finding',
                    'finding_id': 'qa-finding',
                    'related_finding_ids': ['qa-finding'],
                })
                self.assertTrue(risk['display_id'])
                self.assertTrue(risk['risk_id'].startswith('rsk_'))
                finding = await server.db.findings.find_one({'finding_id': 'qa-finding'})
                self.assertEqual(finding['risk_id'], risk['risk_id'])
                for key, value in original.items():
                    self.assertEqual(finding[key], value)
                self.assertEqual(await server.db.tasks.find_one({'task_id': 'qa-work'}), work)
                self.assertEqual(await server.db.evidence.find_one({
                    'evidence_id': 'qa-evidence',
                }), evidence)
                audit = await server.db.audit_logs.find_one({
                    'action': 'raise-risk',
                    'entity_id': risk['risk_id'],
                })
                self.assertEqual(audit['client_id'], 'a')
                self.assertEqual(audit['meta']['from_finding'], 'qa-finding')

    async def test_readonly_manager_contributor_denials_have_no_effect(self):
        await self.fixture()
        for role in ('client_readonly', 'client_grc_manager', 'client_contributor'):
            with self.subTest(role=role):
                await self.actor(role)
                before = await server.db.findings.find_one({'finding_id': 'qa-finding'})
                response = await self.client.post('/api/findings/qa-finding/raise-risk')
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(await server.db.risks.count_documents({}), 0)
                self.assertEqual(await server.db.findings.find_one({'finding_id': 'qa-finding'}), before)

    async def test_provider_wrong_tenant_and_missing_finding_cannot_create(self):
        await self.fixture()
        await self.actor('platform_admin', ('b',))
        response = await self.client.post('/api/findings/qa-finding/raise-risk')
        self.assertEqual(response.status_code, 403, response.text)
        self.sign_in('admin')
        response = await self.client.post('/api/findings/qa-missing/raise-risk')
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(await server.db.risks.count_documents({}), 0)

    async def test_concurrent_lease_and_linked_retry_do_not_duplicate(self):
        await self.fixture()
        self.sign_in('admin')
        entered = asyncio.Event()
        release = asyncio.Event()
        original = server.audit

        async def pause_audit(*args, **kwargs):
            if args[1] == 'raise-risk':
                entered.set()
                await release.wait()
            return await original(*args, **kwargs)
        with patch.object(server, 'audit', side_effect=pause_audit):
            first = asyncio.create_task(self.client.post('/api/findings/qa-finding/raise-risk'))
            try:
                await asyncio.wait_for(entered.wait(), 2)
                second = await self.client.post('/api/findings/qa-finding/raise-risk')
                self.assertEqual(second.status_code, 409, second.text)
            finally:
                release.set()
            self.assertEqual((await first).status_code, 200)
        retry = await self.client.post('/api/findings/qa-finding/raise-risk')
        self.assertEqual(retry.status_code, 400, retry.text)
        self.assertEqual(await server.db.risks.count_documents({'finding_id': 'qa-finding'}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'raise-risk'}), 1)
        self.assertNotIn('_remediation_lock', await server.db.findings.find_one({
            'finding_id': 'qa-finding',
        }))

    async def test_failed_risk_insert_leaves_link_absent_and_releases_lease(self):
        original = await self.fixture()
        self.sign_in('admin')
        collection_type = type(server.db.risks)
        insert_one = collection_type.insert_one

        async def fail_risk_insert(collection, *args, **kwargs):
            if collection.name == 'risks':
                raise RuntimeError('synthetic insert failure')
            return await insert_one(collection, *args, **kwargs)
        with patch.object(collection_type, 'insert_one', new=fail_risk_insert):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/findings/qa-finding/raise-risk')
        finding = await server.db.findings.find_one({'finding_id': 'qa-finding'})
        self.assertNotIn('risk_id', finding)
        self.assertNotIn('_remediation_lock', finding)
        for key, value in original.items():
            self.assertEqual(finding[key], value)
        self.assertEqual(await server.db.risks.count_documents({}), 0)

    async def test_assigned_contributor_still_cannot_raise_risk(self):
        await self.fixture()
        await self.actor('client_contributor')
        await server.db.findings.update_one({
            'finding_id': 'qa-finding',
        }, {
            '$set': {'owner_id': 'qa-client_contributor'},
        })
        before = await server.db.findings.find_one({'finding_id': 'qa-finding'})
        self.assertEqual(before['owner_id'], 'qa-client_contributor')
        response = await self.client.post('/api/findings/qa-finding/raise-risk')
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(await server.db.findings.find_one({'finding_id': 'qa-finding'}), before)
        self.assertEqual(await server.db.risks.count_documents({}), 0)

    async def test_failed_finding_link_after_insert_documents_partial_commit_without_retry(self):
        original = await self.fixture()
        self.sign_in('admin')
        work = await server.db.tasks.find_one({'task_id': 'qa-work'})
        evidence = await server.db.evidence.find_one({'evidence_id': 'qa-evidence'})
        collection_type = type(server.db.findings)
        update_one = collection_type.update_one

        async def fail_finding_link(collection, query, update, *args, **kwargs):
            if collection.name == 'findings' and query.get('finding_id') == 'qa-finding' and ('risk_id' in update.get('$set', {})):
                raise RuntimeError('synthetic Finding link failure after Risk insertion')
            return await update_one(collection, query, update, *args, **kwargs)
        # Observe the public 500 instead of propagating the injected exception.
        import httpx
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app, raise_app_exceptions=False),
            base_url='https://isolated.example.test',
            headers=dict(self.client.headers),
        ) as client:
            with patch.object(collection_type, 'update_one', new=fail_finding_link):
                response = await client.post('/api/findings/qa-finding/raise-risk')
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('synthetic Finding link failure', response.text)
        risks = await server.db.risks.find({'finding_id': 'qa-finding'}).to_list(None)
        self.assertEqual(len(risks), 1)
        risk = risks[0]
        self.assertEqual(risk['client_id'], 'a')
        self.assertEqual(risk['source_type'], 'finding')
        self.assertEqual(risk['source_id'], 'qa-finding')
        self.assertEqual(risk['related_finding_ids'], ['qa-finding'])
        for field in ('likelihood_score', 'impact_score', 'risk_score', 'risk_level'):
            self.assertIsNone(risk[field])
        finding = await server.db.findings.find_one({'finding_id': 'qa-finding'})
        self.assertNotIn('risk_id', finding)
        self.assertNotIn('_remediation_lock', finding)
        for key, value in original.items():
            self.assertEqual(finding[key], value)
        self.assertEqual(await server.db.tasks.find_one({'task_id': 'qa-work'}), work)
        self.assertEqual(await server.db.evidence.find_one({'evidence_id': 'qa-evidence'}), evidence)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'raise-risk'}), 0)
        # No retry or orphan repair: a missing parent link makes another create unsafe.
