import asyncio
import unittest
import test_client_dashboard_sources as harness

server = harness.server


class PolicyApprovalTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        await server.db.users.insert_many([
            {"user_id": uid, "name": uid, "email": uid+"@example.test", "role": role, "status": status, "client_ids": clients}
            for uid, role, status, clients in [
                ("executive", "client_readonly", "active", ["a"]),
                ("foreign", "client_contributor", "active", ["b"]),
                ("disabled", "client_contributor", "disabled", ["a"]),
                ("internal", "platform_admin", "active", ["a"]),
                ("foreign-admin", "platform_admin", "active", ["b"]),
            ]])
        await server.db.contacts.insert_many([
            {"contact_id": "contact", "client_id": "a", "name": "Business Approver"},
            {"contact_id": "linked", "client_id": "a", "name": "Executive", "linked_user_id": "executive"},
            {"contact_id": "other", "client_id": "b", "name": "Private Contact"},
        ])
        await server.db.policies.insert_one({"policy_id": "p", "client_id": "a", "title": "Policy", "status": "draft", "approver_id": "legacy",
            "version":"1","approval_source":{"version":"1","external_reference":"https://documents.example.test/policy","external_version":"doc-v1"}})
        self.sign_in("admin")

    async def authority(self, account=None, contact="contact"):
        return await self.client.post("/api/policies/p/approval-authority", json={"approval_account_id": account, "approver_contact_id": contact})

    async def submit(self):
        result=await self.client.post("/api/policies/p/submit-review")
        self.assertEqual(result.status_code,200,result.text)
        return {"approval_request_id":result.json()["approval_request_id"]}

    async def test_business_identity_never_grants_permission(self):
        await self.authority(contact="linked")
        self.sign_in("executive")
        context=(await self.client.get("/api/policies/p/approval-context")).json()
        self.assertTrue(context["linked_account"]["eligible"])
        self.assertFalse(context["can_decide"])
        self.assertEqual((await self.authority("executive")).status_code,403)
        self.sign_in("admin");decision=await self.submit()
        self.sign_in("executive")
        self.assertEqual((await self.client.post("/api/policies/p/approve",json=decision)).status_code,403)
        self.assertEqual((await self.client.get("/api/policies/pending-decisions?client_id=a")).json(),[])

    async def test_delegated_readonly_decision_does_not_grant_write_and_preserves_designation(self):
        self.assertEqual((await self.authority("executive","linked")).status_code,200)
        decision=await self.submit()
        before_history=(await server.db.policies.find_one({'policy_id':'p'}))['approval_history']
        self.sign_in("executive")
        self.assertEqual((await self.client.patch("/api/policies/p",json={"title":"Changed"})).status_code,403)
        self.assertEqual((await self.client.get("/api/policies/pending-decisions?client_id=a")).json(),[])
        result=await self.client.post("/api/policies/p/approve",json={**decision,"comment":"Reviewed"})
        self.assertEqual(result.status_code,403,result.text)
        unchanged=await server.db.policies.find_one({'policy_id':'p'})
        self.assertEqual(unchanged['status'],'in_review')
        self.assertEqual(unchanged['approver_id'],'legacy')
        self.assertEqual(unchanged['approval_account_id'],'executive')
        self.assertEqual(unchanged['approval_history'],before_history)
        self.assertEqual((await self.client.post("/api/policies/p/approve",json=decision)).status_code,403)
        self.assertEqual((await self.client.get("/api/policies/pending-decisions?client_id=a")).json(),[])

    async def test_scope_disabled_contact_and_generic_escalation_rejected(self):
        for account,contact in [("foreign","contact"),("disabled","contact"),("contact","contact"),("executive","other")]:
            self.assertEqual((await self.authority(account,contact)).status_code,422)
        for body in [{"approval_account_id":"member"},{"approver_contact_id":"contact"},{"status":"in_review"}]:
            self.assertEqual((await self.client.patch("/api/policies/p",json=body)).status_code,422)
        await self.authority("executive")
        decision=await self.submit()
        for uid in ["foreign","foreign-admin","member"]:
            self.sign_in(uid)
            self.assertEqual((await self.client.post("/api/policies/p/approve",json=decision)).status_code,403)
        self.sign_in("foreign")
        self.assertEqual((await self.client.get("/api/policies/p/approval-context")).status_code,403)
        self.assertEqual((await self.client.get("/api/policies/pending-decisions?client_id=a")).status_code,403)
        await server.db.users.update_one({"user_id":"executive"},{"$set":{"status":"disabled"}})
        self.sign_in("executive")
        self.assertIn((await self.client.post("/api/policies/p/approve",json=decision)).status_code,(401,403))

    async def test_internal_authority_return_stale_and_concurrent_decisions(self):
        decision=await self.submit()
        self.assertEqual((await self.client.patch("/api/policies/p",json={"title":"Race"})).status_code,409)
        self.assertEqual((await self.authority("member")).status_code,409)
        self.assertEqual((await self.client.post("/api/policies/p/verify",json={"status":"approved"})).status_code,409)
        self.sign_in("internal")
        self.assertEqual((await self.client.post("/api/policies/p/reject",json=decision)).status_code,422)
        returned=await self.client.post("/api/policies/p/reject",json={**decision,"comment":"Clarify scope"})
        self.assertEqual(returned.json()["status"],"draft")
        next_decision=await self.submit()
        self.assertEqual((await self.client.post("/api/policies/p/approve",json=decision)).status_code,409)
        results=await asyncio.gather(*[self.client.post("/api/policies/p/approve",json=next_decision) for _ in range(2)])
        self.assertEqual(sorted(r.status_code for r in results),[200,409])
        history=(await self.client.get("/api/policies/p/approval-context")).json()["history"]
        self.assertEqual(len([h for h in history if h["action"]=="approved"]),1)
        self.assertEqual(history[-1]["authority"],"internal_administrative")
        await server.db.users.update_one({"user_id":"internal"},{"$set":{"status":"disabled","name":"Renamed"}})
        self.sign_in("admin")
        self.assertEqual((await self.client.get("/api/policies/p/approval-context")).json()["history"][-1]["by_name"],"internal")

    async def test_legacy_submission_requires_explicit_confirmation(self):
        await server.db.policies.update_one({"policy_id":"p"},{"$set":{"status":"in_review"}})
        self.assertEqual((await self.client.post("/api/policies/p/approve",json={"approval_request_id":"made-up"})).status_code,409)
        decision=await self.submit()
        self.assertEqual((await self.client.post("/api/policies/p/approve",json=decision)).status_code,200)
