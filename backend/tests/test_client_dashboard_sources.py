"""Exercise real tenant-authorized routes against an isolated in-memory database."""
import os
from pathlib import Path
import secrets
import sys
import unittest
from unittest.mock import patch

import httpx
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
with patch("dotenv.load_dotenv", return_value=False), \
     patch("motor.motor_asyncio.AsyncIOMotorClient", AsyncMongoMockClient), \
     patch.dict(os.environ, {"MONGO_URL": "mongodb://unused", "DB_NAME": "dashboard_test"}):
    import server


class ClientDashboardSourcesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.database = patch.object(server, "db", AsyncMongoMockClient()["dashboard_sources"])
        self.database.start()
        self.addCleanup(self.database.stop)
        self.env = patch.dict(os.environ, {"JWT_SECRET": secrets.token_urlsafe(48)})
        self.env.start()
        self.addCleanup(self.env.stop)
        for uid, role, clients in [("admin", "super_admin", ["a", "b"]), ("member", "client_contributor", ["a"])]:
            await server.db.users.insert_one({"user_id": uid, "email": uid + "@example.test", "name": uid, "role": role, "client_ids": clients, "status": "active"})
        await server.db.clients.insert_many([{"client_id": "a", "name": "Populated", "status": "active"}, {"client_id": "b", "name": "Minimal", "status": "active"}])
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://isolated.example.test")
        self.addAsyncCleanup(self.client.aclose)

    def sign_in(self, uid):
        self.client.headers["Authorization"] = "Bearer " + server.create_access_token(uid, uid + "@example.test")

    async def test_existing_sources_reject_other_tenants(self):
        kinds = {"reviews": "review_id", "findings": "finding_id", "tasks": "task_id", "risks": "risk_id", "policies": "policy_id", "vendors": "vendor_id", "exceptions": "exception_id", "requirements": "requirement_id"}
        for kind, key in kinds.items():
            for cid in ["a", "b"]:
                await server.db[kind].insert_one({key: kind + cid, "client_id": cid, "title": kind, "name": kind, "status": "open", "created_at": "2026-01-01"})
        self.sign_in("member")
        for kind in kinds:
            r = await self.client.get("/api/" + kind, params={"client_id": "a"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual([x["client_id"] for x in r.json()], ["a"])
            denied = await self.client.get("/api/" + kind, params={"client_id": "b"})
            self.assertEqual(denied.status_code, 403)
        for path in ["/api/dashboard?client_id=b", "/api/clients/b/members"]:
            self.assertEqual((await self.client.get(path)).status_code, 403)

    async def test_new_client_has_zero_metrics_and_records_appear_without_setup(self):
        self.sign_in("admin")
        created = await self.client.post("/api/clients", json={"name": "New dashboard test client"})
        self.assertEqual(created.status_code, 200)
        cid = created.json()["client_id"]
        dashboard = await self.client.get("/api/dashboard", params={"client_id": cid})
        self.assertEqual(dashboard.status_code, 200)
        for key in ["overdue_actions", "critical_high_findings", "significant_risks", "due_next_30"]:
            self.assertEqual(dashboard.json()["kpis"][key], 0)
        for kind in ["reviews", "findings", "tasks", "risks", "policies", "vendors", "exceptions", "requirements"]:
            r = await self.client.get("/api/" + kind, params={"client_id": cid})
            self.assertEqual(r.json(), [])
        task = await self.client.post("/api/tasks", json={"client_id": cid, "title": "First obligation", "due_date": "2026-09-20", "priority": "high"})
        self.assertEqual(task.status_code, 200)
        rows = await self.client.get("/api/tasks", params={"client_id": cid})
        self.assertEqual([r["task_id"] for r in rows.json()], [task.json()["task_id"]])


if __name__ == "__main__":
    unittest.main()
