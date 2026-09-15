"""Offline auth/initialization checks. Test credentials are generated at runtime."""
from test_seed_account_settings import SeedAccountSettingsTests, server
import httpx
import secrets
import os
from unittest.mock import patch


class StandardInitializationTests(SeedAccountSettingsTests):
    async def test_startup_preserves_all_operational_collections(self):
        kinds = ['clients', 'reviews', 'findings', 'tasks', 'risks', 'policies',
                 'vendors', 'evidence', 'contacts', 'requirements', 'assessments',
                 'assets', 'exceptions', 'comments']
        before = {}
        for kind in kinds:
            self.assertEqual(await server.db[kind].count_documents({}), 0)
            await server.db[kind].insert_one({
                '_id': 'existing-' + kind, 'client_id': 'existing-client',
                'status': 'existing-status', 'notes': 'Preserve customer content',
            })
            before[kind] = await server.db[kind].find({}).to_list(None)
        await server.seed()
        for kind in kinds:
            self.assertEqual(await server.db[kind].find({}).to_list(None), before[kind])

    async def test_disabled_bootstrap_does_not_recreate_removed_account(self):
        await server.db.users.delete_one({'email': 'seed-admin@example.com'})
        with patch.dict(os.environ, {'ADMIN_EMAIL': '', 'ADMIN_PASSWORD_HASH': ''}):
            await server.seed()
        self.assertEqual(await server.db.users.count_documents({}), 0)
        self.assertEqual(await server.db.clients.count_documents({}), 0)

    async def test_authentication_and_empty_workspace(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://auth.test") as client:
            for email, password, expected in [
                ("SEED-ADMIN@EXAMPLE.COM", self.seed_password, 200),
                ("seed-admin@example.com", secrets.token_urlsafe(24), 401),
                ("unknown@example.com", self.seed_password, 401),
                ("", "", 422),
            ]:
                result = await client.post("/api/auth/login", json={"email": email, "password": password})
                self.assertEqual(result.status_code, expected)
                if expected == 200:
                    token = result.json()["access_token"]
                    self.assertNotIn("password_hash", result.json()["user"])
                    self.assertEqual(result.json()["user"]["workspace_mode"], "standard")
            client.headers["Authorization"] = "Bearer " + token
            self.assertEqual((await client.get("/api/clients")).json(), [])

    async def test_initialization_preserves_records_and_disabled_account(self):
        await server.db.clients.insert_one({"client_id": "real-client", "name": "Existing Customer", "status": "custom"})
        await server.db.reviews.insert_one({"review_id": "existing-review", "client_id": "real-client", "status": "planned"})
        await server.db.users.update_one({"email": "seed-admin@example.com"}, {"$set": {"status": "disabled", "role": "client_readonly", "client_ids": ["real-client"]}})
        await server.seed()
        self.assertEqual(await server.db.clients.count_documents({}), 1)
        self.assertEqual((await server.db.reviews.find_one({}))["status"], "planned")
        user = await server.db.users.find_one({"email": "seed-admin@example.com"})
        self.assertEqual(user["status"], "disabled")
        self.assertEqual(user["role"], "client_readonly")
        self.assertEqual(user["client_ids"], ["real-client"])
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://auth.test") as client:
            result = await client.post("/api/auth/login", json={"email": user["email"], "password": self.seed_password})
            self.assertEqual(result.status_code, 403)
