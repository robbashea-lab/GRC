"""Real client-management routes, isolated database, real role enforcement."""
import unittest
from backend.tests.test_client_dashboard_sources import ClientDashboardSourcesTests, server


class ClientManagementTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = ClientDashboardSourcesTests.asyncSetUp
    sign_in = ClientDashboardSourcesTests.sign_in

    async def test_internal_roles_can_create_edit_archive_restore(self):
        await server.db.users.insert_one({"user_id": "platform", "email": "platform@example.test", "role": "platform_admin", "client_ids": []})
        for uid in ["admin", "platform"]:
            self.sign_in(uid)
            created = await self.client.post("/api/clients", json={"name": "Management fixture", "industry": "Technology", "assigned_owner_id": uid})
            self.assertEqual(created.status_code, 200)
            cid = created.json()["client_id"]
            edited = await self.client.patch(f"/api/clients/{cid}", json={"name": "Renamed fixture", "assigned_owner_id": "", "status": "active"})
            self.assertEqual(edited.status_code, 200)
            self.assertEqual(edited.json()["assigned_owner_id"], "")
            self.assertEqual(edited.json()["name"], "Renamed fixture")
            self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json={"status": "archived"})).status_code, 200)
            self.assertNotIn(cid, [c["client_id"] for c in (await self.client.get("/api/clients")).json()])
            self.assertIn(cid, [c["client_id"] for c in (await self.client.get("/api/clients?include_archived=true")).json()])
            self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json={"status": "active"})).status_code, 200)

    async def test_client_roles_cannot_manage_any_client(self):
        for role in ["client_contributor", "client_readonly"]:
            await server.db.users.update_one({"user_id": "member"}, {"$set": {"role": role}})
            self.sign_in("member")
            self.assertEqual((await self.client.post("/api/clients", json={"name": "Denied"})).status_code, 403)
            for cid in ["a", "b"]:
                for body in [{"name": "Denied"}, {"status": "archived"}]:
                    self.assertEqual((await self.client.patch(f"/api/clients/{cid}", json=body)).status_code, 403)
            self.assertEqual((await self.client.get("/api/clients/directory")).status_code, 403)


if __name__ == "__main__":
    unittest.main()
