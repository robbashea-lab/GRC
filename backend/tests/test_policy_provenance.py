import unittest
import test_policy_approval as approval_tests
server = approval_tests.server


class PolicyProvenanceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = approval_tests.PolicyApprovalTests.asyncSetUp
    sign_in = approval_tests.PolicyApprovalTests.sign_in
    submit = approval_tests.PolicyApprovalTests.submit

    async def source(self, version="1", **basis):
        return await self.client.post("/api/policies/p/approval-subject",json={
            "version":version, **(basis or {"external_reference":"https://documents.example.test/policy","external_version":"doc-v"+version})})

    async def approve(self):
        return await self.client.post("/api/policies/p/approve",json={**await self.submit(),"comment":"Version checked"})

    async def test_two_versions_preserve_subject_and_actor(self):
        first=(await self.approve()).json()
        old=first["approval_history"][-1]
        self.assertEqual(old["subject"]["version"],"1")
        changed=await self.client.patch("/api/policies/p",json={"title":"Renamed","version":"2","summary":"Changed content"})
        self.assertEqual(changed.json()["status"],"draft")
        self.assertIsNone(changed.json()["approved_at"])
        self.assertEqual((await self.client.post("/api/policies/p/submit-review")).status_code,422)
        await self.source("2")
        second=(await self.approve()).json()
        history=[h for h in second["approval_history"] if h["action"]=="approved"]
        self.assertEqual(history[0],old)
        self.assertEqual([h["subject"]["version"] for h in history],["1","2"])
        await server.db.users.update_one({"user_id":"admin"},{"$set":{"name":"Changed name"}})
        await self.client.patch("/api/policies/p",json={"owner_id":"member"})
        fresh=(await self.client.get("/api/policies/p/approval-context")).json()
        self.assertEqual(fresh["history"][-1],history[-1])
        self.assertEqual(fresh["subject"]["title"],"Renamed")
        self.assertEqual((await self.client.delete("/api/policies/p")).status_code,409)
        self.assertEqual((await self.client.post("/api/bulk",json={"kind":"policies","ids":["p"],"action":"delete"})).status_code,409)

    async def test_uploaded_subject_hash_archival_retention_and_cross_client(self):
        e=await self.client.post("/api/evidence",json={"client_id":"a","linked_type":"policy","linked_id":"p","filename":"policy.txt","content_base64":"cG9saWN5IHYx"})
        self.assertEqual(e.status_code,200,e.text)
        eid=e.json()["evidence_id"]
        self.assertEqual((await self.source(evidence_id=eid)).status_code,200)
        approved=(await self.approve()).json()
        subject=approved["approval_history"][-1]["subject"]
        self.assertEqual(subject["basis"]["sha256"],e.json()["sha256"])
        self.assertEqual((await self.client.delete("/api/evidence/"+eid)).status_code,200)
        self.assertEqual((await self.client.get("/api/evidence/"+eid+"/download")).status_code,200)
        self.assertEqual((await self.client.get("/api/policies/p/approval-context")).json()["history"][-1]["subject"],subject)
        await self.client.patch("/api/policies/p",json={"version":"2"})
        self.assertEqual((await self.source("2",evidence_id=eid)).status_code,422)
        self.sign_in("foreign")
        self.assertEqual((await self.client.get("/api/policies/p/approval-context")).status_code,403)
        self.assertEqual((await self.source("2")).status_code,403)

    async def test_missing_invalid_basis_rejection_and_legacy_withdrawal(self):
        await server.db.policies.update_one({"policy_id":"p"},{"$unset":{"approval_source":""}})
        self.assertEqual((await self.client.post("/api/policies/p/submit-review")).status_code,422)
        for body in [{"version":""},{"version":"2","external_reference":"ref"},
                     {"version":"2","external_reference":"ref","external_version":"v","evidence_id":"x"}]:
            self.assertEqual((await self.client.post("/api/policies/p/approval-subject",json=body)).status_code,422)
        await self.source("2")
        decision=await self.submit()
        returned=(await self.client.post("/api/policies/p/reject",json={**decision,"comment":"Needs change"})).json()
        self.assertEqual(returned["approval_history"][-1]["subject"]["version"],"2")
        await server.db.policies.update_one({"policy_id":"p"},{"$set":{"status":"in_review"},"$unset":{"approval_subject":"","approval_request_id":""}})
        response=await self.client.post("/api/policies/p/return-draft",json={"approval_request_id":"legacy"})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()["status"],"draft")

    async def test_external_recording_distinct_and_bound(self):
        response=await self.client.post("/api/policies/p/verify",json={"status":"approved","version":"1","approver_id":"member","approved_at":"2026-09-01"})
        self.assertEqual(response.status_code,200,response.text)
        old=response.json()["decision_history"][-1]
        self.assertEqual(old["subject"]["basis"]["type"],"external")
        self.assertIn("not an in-app approval",old["provenance"])
        changed=await self.client.post("/api/policies/p/verify",json={"version":"2"})
        self.assertEqual(changed.json()["status"],"draft")
        self.assertEqual(changed.json()["decision_history"][-1],old)

    async def test_subject_and_history_cannot_be_forged_or_pending_modified(self):
        await self.approve()
        for body in [{"approval_subject":{"version":"forged"}},{"approval_source":{"version":"forged"}},{"approval_history":[]}]:
            self.assertEqual((await self.client.patch("/api/policies/p",json=body)).status_code,422)
        await self.submit()
        self.assertEqual((await self.source("2")).status_code,409)
