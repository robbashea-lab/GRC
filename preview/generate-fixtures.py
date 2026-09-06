"""Build an offline UI snapshot from the application's own demo seed and GET routes.

This script never connects to MongoDB or starts an HTTP server. Its mock database
and dependency override exist only in this process, not in the application code.
Install preview/requirements.txt, then run this file from the repository root.
"""
import asyncio
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import dotenv
import motor.motor_asyncio
from mongomock_motor import AsyncMongoMockClient
import httpx

dotenv.load_dotenv = lambda *args, **kwargs: False
motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient
os.environ.update({
    "MONGO_URL": "mongodb://localhost",
    "DB_NAME": "isolated_visual_preview",
    "JWT_SECRET": secrets.token_urlsafe(48),
    "ADMIN_EMAIL": "preview@example.invalid",
    "ADMIN_PASSWORD": secrets.token_urlsafe(32),
})
import server


def key(path, params=None):
    return path + ("?" + urlencode(sorted(params.items())) if params else "")


async def main():
    await server.seed()
    await server.db.users.update_one(
        {"email": "preview@example.invalid"},
        {"$set": {"name": "Preview Admin", "favorite_client_ids": []}},
    )
    user = await server.db.users.find_one(
        {"email": "preview@example.invalid"}, {"_id": 0, "password_hash": 0}
    )
    await server.db.clients.update_many({}, {"$set": {"assigned_owner_id": user["user_id"]}})
    server.app.dependency_overrides[server.get_current_user] = lambda: user
    responses = {}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://offline-preview.test"
    ) as client:
        async def capture(path, params=None):
            response = await client.get("/api" + path, params=params)
            if response.status_code != 200:
                raise RuntimeError(f"{path}: {response.status_code}: {response.text[:300]}")
            data = response.json()
            responses[key(path, params)] = data
            return data

        for path in ["/auth/me", "/clients", "/users", "/clients/directory", "/notifications",
                     "/baseline/templates", "/audit-logs", "/audit-logs/facets"]:
            await capture(path)
        await capture("/audit-logs", {"page": 1, "page_size": 50})
        users = responses["/users"]
        for tenant in responses["/clients"]:
            cid = tenant["client_id"]
            p = {"client_id": cid}
            await capture(f"/clients/{cid}/members")
            for path in ["/reviews", "/findings", "/risks", "/policies", "/requirements",
                         "/vendors", "/tasks", "/contacts", "/evidence",
                         "/onboarding/policy-library", "/onboarding/requirements-library",
                         "/onboarding/state"]:
                await capture(path, p)
            await capture("/calendar", {**p, "start": "2000-01-01", "end": "2100-01-01"})
            for scope in ["org", "mine", "unassigned"]:
                await capture("/dashboard", {**p, "scope": scope})
            for u in users:
                if cid in u.get("client_ids", []) or u["role"] == "super_admin":
                    await capture("/dashboard", {**p, "scope": "user", "user_id": u["user_id"]})
            for kind, id_field in [("reviews", "review_id"), ("findings", "finding_id"),
                                   ("risks", "risk_id"), ("policies", "policy_id"),
                                   ("vendors", "vendor_id"), ("tasks", "task_id")]:
                for row in responses[key("/" + kind, p)]:
                    params = {"entity_type": kind, "entity_id": row[id_field]}
                    await capture("/comments", params)
                    await capture("/related", params)
        for u in users:
            await capture(f"/users/{u['user_id']}/open_assignments")

    serialized = json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Original backend seed; isolated in-memory database; sample records only.",
        "responses": responses,
    }, indent=2)
    for forbidden in ['"password_hash"', '"session_token"', '"access_token"']:
        if forbidden in serialized:
            raise RuntimeError("Unexpected authentication material in fixture data")
    dest = ROOT / "frontend/src/preview/fixtures.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(serialized + "\n")
    print(f"Captured {len(responses)} successful GET responses from the isolated demo backend.")


if __name__ == "__main__":
    asyncio.run(main())
