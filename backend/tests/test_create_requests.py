"""Real API retry boundary with isolated persistence, not durable Mongo proof."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness
server = harness.server


class CreateRequestTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def create(self, key="synthetic-intent-0001", body=None):
        return await self.client.post("/api/findings", headers={"Idempotency-Key": key},
                                      json=body or {"client_id": "a", "title": "Same legitimate title"})

    async def test_normal_lost_response_and_distinct_intents(self):
        self.sign_in("admin")
        first = await self.create()
        self.assertEqual(first.status_code, 200, first.text)
        retry = await self.create()
        self.assertEqual(retry.json(), first.json())
        distinct = await self.create("synthetic-intent-0002")
        self.assertEqual(distinct.status_code, 200, distinct.text)
        self.assertNotEqual(first.json()["finding_id"], distinct.json()["finding_id"])
        self.assertEqual(await server.db.findings.count_documents({}), 2)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "create"}), 2)

    async def test_audit_failure_recovers_original_primary(self):
        self.sign_in("admin")
        with patch.object(server, "audit", AsyncMock(side_effect=RuntimeError("injected audit outage"))):
            failed = await self.create()
            self.assertEqual(failed.status_code, 503)
            self.assertIn("same request", failed.json()["detail"])
        self.assertEqual(await server.db.findings.count_documents({}), 1)
        original = await server.db.findings.find_one({})
        retry = await self.create()
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["finding_id"], original["finding_id"])
        self.assertEqual(await server.db.findings.count_documents({}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "create"}), 1)

    async def test_parallel_replays(self):
        self.sign_in("admin")
        for concurrency in (5, 10, 50):
            key = f"synthetic-parallel-{concurrency}"
            responses = await asyncio.gather(*(self.create(key) for _ in range(concurrency)))
            self.assertTrue(all(r.status_code in (200, 409) for r in responses))
            resolved = await self.create(key)
            self.assertEqual(resolved.status_code, 200, resolved.text)
            for response in responses:
                if response.status_code == 200:
                    self.assertEqual(response.json(), resolved.json())
        self.assertEqual(await server.db.findings.count_documents({}), 3)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "create"}), 3)

    async def test_invalid_reuse_and_authorization(self):
        self.sign_in("member")
        self.assertEqual((await self.create()).status_code, 200)
        self.assertEqual((await self.create(body={"client_id": "a", "title": "Changed payload"})).status_code, 409)
        self.assertEqual((await self.create(body={"client_id": "b", "title": "Wrong tenant"})).status_code, 403)
        for key in ("short", "invalid key with spaces", "x" * 129):
            self.assertEqual((await self.create(key)).status_code, 422)
        await server.db.users.update_one({"user_id": "member"}, {"$set": {"role": "client_viewer"}})
        self.assertEqual((await self.create()).status_code, 403)
        self.assertEqual(await server.db.findings.count_documents({}), 1)

    async def test_missing_key_rejected_without_a_write(self):
        self.sign_in("admin")
        self.client.event_hooks["request"] = []
        response = await self.client.post('/api/findings', json={"client_id":"a", "title":"No identity"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(await server.db.findings.count_documents({}), 0)

    async def test_inflight_duplicate_does_not_run_second_completion(self):
        self.sign_in("admin")
        entered, release = asyncio.Event(), asyncio.Event()
        original = server.audit
        async def delayed(*args, **kwargs):
            entered.set()
            await release.wait()
            return await original(*args, **kwargs)
        with patch.object(server, 'audit', delayed):
            task = asyncio.create_task(self.create())
            await asyncio.wait_for(entered.wait(), 2)
            try:
                duplicates = await asyncio.gather(*(self.create() for _ in range(50)))
                self.assertTrue(all(r.status_code == 409 for r in duplicates))
                self.assertEqual(await server.db.findings.count_documents({}), 1)
            finally:
                release.set()
                finished = await task
        self.assertEqual(finished.status_code, 200)
        self.assertEqual((await self.create()).json(), finished.json())

    async def test_completed_retry_does_not_revert_later_edit(self):
        self.sign_in("admin")
        first = (await self.create()).json()
        await server.db.findings.update_one({"finding_id": first["finding_id"]}, {"$set": {"title": "Later edit"}})
        self.assertEqual((await self.create()).json(), first)
        self.assertEqual((await server.db.findings.find_one({}))["title"], "Later edit")

    async def test_each_generic_register_and_separate_create_route(self):
        self.sign_in("admin")
        bodies = {
            "reviews": {"title": "Review", "review_type": "access"},
            "findings": {"title": "Finding"}, "tasks": {"title": "Action"},
            "risks": {"title": "Risk"}, "policies": {"title": "Policy"},
            "vendors": {"name": "Vendor", "service": "Synthetic service"}, "contacts": {"name": "Contact"},
            "assets": {"name": "Asset"}, "exceptions": {"title": "Exception"},
            "requirements": {"title": "Requirement"},
            "evidence": {"filename": "synthetic.txt", "content_base64": "c3ludGhldGlj"},
        }
        for route, fields in bodies.items():
            with self.subTest(route=route):
                body = {"client_id": "a", **fields}
                headers = {"Idempotency-Key": "synthetic-route-" + route}
                first = await self.client.post("/api/" + route, json=body, headers=headers)
                self.assertEqual(first.status_code, 200, first.text)
                retry = await self.client.post("/api/" + route, json=body, headers=headers)
                self.assertEqual(retry.json(), first.json())
                self.assertEqual(await server.db[route].count_documents({}), 1)
        body = {"name": "Synthetic", "primary_contact_details": {"name": "Synthetic Contact"}}
        headers = {"Idempotency-Key": "synthetic-client-create"}
        first = await self.client.post("/api/clients", json=body, headers=headers)
        retry = await self.client.post("/api/clients", json=body, headers=headers)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(await server.db.contacts.count_documents({"client_id": first.json()["client_id"]}), 1)

    async def test_audit_storage_failure_repairs_conditional_side_effect_audit(self):
        self.sign_in("admin")
        await server.db.findings.insert_one({"finding_id":"source", "client_id":"a", "title":"Source", "status":"open"})
        body = {"client_id":"a", "title":"Remediate", "finding_id":"source"}
        headers = {"Idempotency-Key":"synthetic-related-action"}
        collection_type = type(server.db.audit_logs)
        original = collection_type.update_one
        async def fail_audit(collection, *args, **kwargs):
            if collection.name == "audit_logs":
                raise RuntimeError("injected audit storage failure")
            return await original(collection, *args, **kwargs)
        with patch.object(collection_type, "update_one", fail_audit):
            failed = await self.client.post('/api/tasks', json=body, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual((await server.db.findings.find_one({"finding_id":"source"}))["status"], "in_remediation")
        retry = await self.client.post('/api/tasks', json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({"action":"Related Finding moved to In Remediation"}), 1)

    async def test_transition_survives_failure_before_audit_intent_receipt(self):
        self.sign_in('admin')
        await server.db.findings.insert_one({'finding_id':'source','client_id':'a','title':'Source','status':'open'})
        body={'client_id':'a','title':'Action','finding_id':'source'}
        headers={'Idempotency-Key':'transition-before-audit'}
        with patch.object(server,'audit',AsyncMock(side_effect=RuntimeError('before audit journal'))):
            failed=await self.client.post('/api/tasks',json=body,headers=headers)
        self.assertEqual(failed.status_code,503)
        self.assertTrue((await server.db.findings.find_one({'finding_id':'source'}))['_pending_remediation_audits'])
        retry=await self.client.post('/api/tasks',json=body,headers=headers)
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(await server.db.tasks.count_documents({}),1)
        self.assertEqual(await server.db.audit_logs.count_documents({'action':'Related Finding moved to In Remediation'}),1)
        self.assertNotIn('_pending_remediation_audits',await server.db.findings.find_one({'finding_id':'source'}))
