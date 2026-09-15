"""Non-destructive standard-workspace initialization; no sample-data seeding."""
import os
import re


async def ensure_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("client_id", unique=True)
    for name in ["reviews", "findings", "risks", "policies", "vendors", "assets", "tasks", "evidence"]:
        await db[name].create_index("client_id")
    await db.password_resets.create_index("token_hash", unique=True)
    await db.sessions.create_index("session_token", unique=True)


async def migrate_legacy_records(db):
    """Preserved legacy normalizations, explicitly opt-in for existing databases."""
    await db.clients.update_many({"status": {"$in": [None, ""]}}, {"$set": {"status": "active"}})
    await db.clients.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})
    await db.reviews.update_many(
        {"status": {"$in": ["planned", "blocked", "overdue"]}},
        {"$set": {"status": "upcoming"}},
    )


async def initialize_standard(db, uid, now):
    await ensure_indexes(db)
    if os.environ.get("RUN_LEGACY_MIGRATIONS") == "true":
        await migrate_legacy_records(db)
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password_hash = os.environ.get("ADMIN_PASSWORD_HASH", "")
    if not email or not password_hash:
        return
    if not re.fullmatch(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}", password_hash):
        raise ValueError("ADMIN_PASSWORD_HASH must be a bcrypt hash")
    # Existing users, names, credentials, permissions and client assignments
    # are never overwritten by bootstrap. Disabling/removing bootstrap needs
    # only a service-variable change, not a different authentication path.
    await db.users.update_one({"email": email}, {"$setOnInsert": {
        "user_id": uid("user"), "email": email,
        "name": os.environ.get("ADMIN_NAME", "Development Administrator"),
        "role": "super_admin", "client_ids": [], "status": "active",
        "workspace_mode": "standard", "auth_provider": "password",
        "password_hash": password_hash, "created_at": now(),
    }}, upsert=True)
