"""Offline regression tests; never connects to the deployed test environment.

Uses the dependencies listed in preview/requirements.txt. Run from the repo root:
python -m unittest backend.tests.test_seed_account_settings
"""
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
     patch.dict(os.environ, {"MONGO_URL": "mongodb://unused", "DB_NAME": "auth_regression"}):
    import server


class SeedAccountSettingsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.seed_password = secrets.token_urlsafe(24)
        self.environment = patch.dict(os.environ, {
            "ADMIN_EMAIL": "seed-admin@example.com",
            "ADMIN_NAME": "Seed Admin",
            "ADMIN_PASSWORD": self.seed_password,
            "DEMO_USER_PASSWORD": secrets.token_urlsafe(24),
            "JWT_SECRET": secrets.token_urlsafe(48),
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.database = patch.object(server, "db", AsyncMongoMockClient()["auth_regression"])
        self.database.start()
        self.addCleanup(self.database.stop)
        await server.seed()

    async def test_seed_creates_configured_super_admin(self):
        user = await server.db.users.find_one({"email": "seed-admin@example.com"})
        self.assertEqual(user["name"], "Seed Admin")
        self.assertEqual(user["role"], "super_admin")
        self.assertEqual(len(user["client_ids"]), 2)
        self.assertTrue(server.verify_password(self.seed_password, user["password_hash"]))

    async def test_restart_preserves_self_service_name_and_password(self):
        new_password = secrets.token_urlsafe(24)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app),
            base_url="https://isolated-auth.example.com",
        ) as client:
            login = await client.post("/api/auth/login", json={
                "email": "seed-admin@example.com", "password": self.seed_password,
            })
            self.assertEqual(login.status_code, 200)
            client.headers["Authorization"] = "Bearer " + login.json()["access_token"]
            profile = await client.patch("/api/me", json={"name": "Updated Test Admin"})
            self.assertEqual(profile.status_code, 200)
            changed = await client.patch("/api/me/password", json={
                "current_password": self.seed_password, "new_password": new_password,
            })
            self.assertEqual(changed.status_code, 200)

        await server.seed()
        user = await server.db.users.find_one({"email": "seed-admin@example.com"})
        self.assertEqual(user["name"], "Updated Test Admin")
        self.assertEqual(user["role"], "super_admin")
        self.assertTrue(server.verify_password(new_password, user["password_hash"]))
        self.assertFalse(server.verify_password(self.seed_password, user["password_hash"]))


if __name__ == "__main__":
    unittest.main()
