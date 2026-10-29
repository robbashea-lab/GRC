"""Real client-management routes, isolated database, real role enforcement."""
import unittest
from unittest.mock import AsyncMock, patch

from backend.tests.test_client_dashboard_sources import ClientDashboardSourcesTests, server


class ClientManagementTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = ClientDashboardSourcesTests.asyncSetUp
    sign_in = ClientDashboardSourcesTests.sign_in

    async def test_owner_can_create_replay_edit_archive_restore(self):
        self.sign_in("admin")
        body = {
            "name": "Management fixture",
            "industry": "Technology",
            "assigned_owner_id": "admin",
            "primary_contact_details": {"name": "Fixture Contact", "email": "contact@example.com"},
        }
        headers = {"Idempotency-Key": "owner-client-management-create"}
        created = await self.client.post("/api/clients", json=body, headers=headers)
        self.assertEqual(created.status_code, 200, created.text)
        retry = await self.client.post("/api/clients", json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), created.json())
        cid = created.json()["client_id"]
        self.assertEqual(await server.db.clients.count_documents({"name": body["name"]}), 1)
        contacts = await server.db.contacts.find({"client_id": cid}, {"_id": 0}).to_list(None)
        self.assertEqual(len(contacts), 1)
        self.assertEqual(contacts[0]["contact_id"], created.json()["primary_contact_id"])
        self.assertEqual(contacts[0]["name"], body["primary_contact_details"]["name"])
        self.assertEqual(contacts[0]["email"], body["primary_contact_details"]["email"])
        self.assertEqual(await server.db.contacts.count_documents({"email": contacts[0]["email"]}), 1)
        self.assertEqual(await server.db.create_requests.count_documents({"state": "complete"}), 1)
        for entity_type, entity_id in [("client", cid), ("contact", contacts[0]["contact_id"])]:
            self.assertEqual(await server.db.audit_logs.count_documents({
                "action": "create", "entity_type": entity_type, "entity_id": entity_id,
            }), 1)

        edited = await self.client.patch(f"/api/clients/{cid}", json={"name": "Renamed fixture", "assigned_owner_id": "", "status": "active"})
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["assigned_owner_id"], "")
        self.assertEqual(edited.json()["name"], "Renamed fixture")
        self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json={"status": "archived"})).status_code, 200)
        self.assertNotIn(cid, [c["client_id"] for c in (await self.client.get("/api/clients")).json()])
        self.assertIn(cid, [c["client_id"] for c in (await self.client.get("/api/clients?include_archived=true")).json()])
        self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json={"status": "active"})).status_code, 200)

    async def test_provider_cannot_create_client_in_any_scope_without_business_side_effects(self):
        for scope, client_ids, all_clients in [("assigned", ["a"], False), ("empty", [], False), ("all", [], True)]:
            with self.subTest(scope=scope):
                uid = "provider-" + scope
                await server.db.users.insert_one({
                    "user_id": uid, "email": uid + "@example.test", "role": "platform_admin",
                    "client_ids": client_ids, "all_clients": all_clients, "status": "active",
                })
                self.sign_in(uid)
                before = {
                    name: await server.db[name].find({}).to_list(None)
                    for name in ["clients", "contacts", "users", "create_requests"]
                }
                # Security-denial audits are legitimate; business audits must stay unchanged.
                business_audits = await server.db.audit_logs.find({"entity_type": {"$ne": "security"}}).to_list(None)

                denied = await self.client.post("/api/clients", json={
                    "name": "Denied " + scope,
                    "primary_contact_details": {"name": "Denied Contact", "email": "denied@example.com"},
                }, headers={"Idempotency-Key": "denied-client-create-" + scope})

                self.assertEqual(denied.status_code, 403, denied.text)
                self.assertEqual(denied.json()["detail"], "Platform Owner required")
                for name, documents in before.items():
                    self.assertEqual(await server.db[name].find({}).to_list(None), documents, name)
                self.assertEqual(
                    await server.db.audit_logs.find({"entity_type": {"$ne": "security"}}).to_list(None),
                    business_audits,
                )
                if scope == "empty":
                    self.assertEqual((await self.client.get("/api/clients")).json(), [])

    async def test_endpoint_guard_denies_provider_before_create_request_runs(self):
        provider = {"user_id": "platform", "role": "platform_admin", "client_ids": ["a"]}
        with patch.object(server.create_requests, "run", new_callable=AsyncMock) as create_request:
            with self.assertRaises(server.HTTPException) as denied:
                await server.create_client(
                    server.ClientIn(name="Denied", primary_contact_details={"name": "Denied Contact"}),
                    user=provider,
                    idempotency_key="denied-client-create-direct",
                )
            self.assertEqual(denied.exception.status_code, 403)
            self.assertEqual(denied.exception.detail, "Platform Owner required")
            create_request.assert_not_called()

    async def test_provider_can_edit_assigned_active_client_but_not_foreign_client(self):
        await server.db.users.insert_one({
            "user_id": "platform", "email": "platform@example.test", "role": "platform_admin",
            "client_ids": ["a"], "status": "active",
        })
        self.sign_in("platform")
        foreign_before = await server.db.clients.find_one({"client_id": "b"})

        edited = await self.client.patch("/api/clients/a", json={"name": "Provider edited fixture"})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["name"], "Provider edited fixture")
        self.assertEqual((await server.db.clients.find_one({"client_id": "a"}))["name"], "Provider edited fixture")
        self.assertEqual((await self.client.patch("/api/clients/b", json={"name": "Denied"})).status_code, 403)
        self.assertEqual(await server.db.clients.find_one({"client_id": "b"}), foreign_before)

    async def test_client_roles_cannot_manage_any_client(self):
        for role in ["client_grc_manager", "client_contributor", "client_readonly"]:
            await server.db.users.update_one({"user_id": "member"}, {"$set": {"role": role}})
            self.sign_in("member")
            self.assertEqual((await self.client.post("/api/clients", json={"name": "Denied"})).status_code, 403)
            for cid in ["a", "b"]:
                for body in [{"name": "Denied"}, {"status": "archived"}]:
                    self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json=body)).status_code, 403)
            self.assertEqual((await self.client.get("/api/clients/directory")).status_code, 403)


if __name__ == "__main__":
    unittest.main()
