"""Operational assignment candidates, separate from history and account management.

Caller authorization stays with each route. Eligibility never grants permissions.
Approval designations, Contact linking and client leads are deliberately excluded.
"""
import re

from fastapi import HTTPException


FIELDS = {
    "reviews": ("owner_id", "reviewer_id"),
    "tasks": ("assignee_id",),
    "findings": ("owner_id",),
    "risks": ("owner_id",),
    "vendors": ("business_owner_id",),
    "policies": ("owner_id",),
    "assets": ("owner_id",),
    "requirements": ("owner_id",),
    "exceptions": ("owner_id",),
    "framework_assessments": ("owner_id",),
    "ai_systems": ("owner_id", "technical_owner_id", "oversight_owner_id"),
}


async def eligible(db, ident, client_id, can_access):
    """An active User with access to the client may receive new work."""
    account = await db.users.find_one({"user_id": ident}, {
        "_id": 0, "user_id": 1, "status": 1, "role": 1, "client_ids": 1,
    })
    return bool(account) and account.get("status") == "active" and can_access(account, client_id)


async def validate(db, kind, row, can_access, previous=None):
    """Validate changed/new references; preserve the exact persisted old value."""
    for field in FIELDS.get(kind, ()):
        ident = row.get(field)
        old_ident = (previous or {}).get(field)
        if kind == "tasks" and field == "assignee_id" and previous:
            old_ident = old_ident or previous.get("owner_id")
        if not ident or (previous is not None and ident == old_ident):
            continue
        if not await eligible(db, ident, row["client_id"], can_access):
            raise HTTPException(422, "Choose an active platform user with access to this client")


async def candidates(db, client_id, search="", offset=0, limit=50):
    # Only Platform Owners have global scope; provider assignments are explicit.
    scope = {"$or": [
        {"client_ids": client_id},
        {"role": "super_admin"},
    ]}
    from authorization import ROLES
    query = {"$and": [{"status": "active", "role": {"$in": list(ROLES)}}, scope]}
    if search.strip():
        pattern = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$and"].append({"$or": [{"name": pattern}, {"email": pattern}]})
    rows = await db.users.find(query, {
        "_id": 0, "user_id": 1, "name": 1, "email": 1,
    }).sort([("name", 1), ("user_id", 1)]).skip(offset).to_list(limit + 1)
    return {"items": rows[:limit], "has_more": len(rows) > limit}
