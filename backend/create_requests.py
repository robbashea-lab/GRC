"""Durable create intent identity; no business-content deduplication.

The Mongo _id index is the uniqueness boundary, including before startup indexes
run. Receipts are retained: expiring them would allow old retries to create again.
"""
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import re
import uuid

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError


current = ContextVar("create_request", default=None)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


async def run(db, key, actor, client_id, route, payload, execute):
    if key is None:
        raise HTTPException(422, "Idempotency-Key is required for creation", headers={"X-Create-Rejected": "true"})
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", key):
        raise HTTPException(422, "Invalid Idempotency-Key")
    identity = digest([actor, client_id, route, key])
    fingerprint = digest(payload)
    now = datetime.now(timezone.utc)
    try:
        await db.create_requests.insert_one({"_id": identity, "fingerprint": fingerprint,
                                            "created_at": now.isoformat(), "state": "pending"})
    except DuplicateKeyError:
        pass
    receipt = await db.create_requests.find_one({"_id": identity})
    if receipt["fingerprint"] != fingerprint:
        raise HTTPException(409, "This create request has different data; restore the original request before retrying")
    if receipt["state"] == "complete":
        return receipt["result"]
    token = uuid.uuid4().hex
    acquired = await db.create_requests.update_one(
        {"_id": identity, "state": "pending", "$or": [
            {"lease": None}, {"lease.until": {"$lt": now.isoformat()}}]},
        {"$set": {"lease": {"token": token, "until": (now + timedelta(seconds=120)).isoformat()}}})
    if not acquired.modified_count:
        raise HTTPException(409, "This create request is still being processed; retry the same request", headers={"Retry-After": "2"})
    context = current.set(identity)
    try:
        # A conditional relationship transition may already be applied. Repair
        # its recorded audit intent even if the transition will now be a no-op.
        for audit_id, document in receipt.get("pending_audits", {}).items():
            await db.audit_logs.update_one({"_id": "create:" + audit_id}, {"$setOnInsert": document}, upsert=True)
        # Bound execution below the lease lifetime, as existing mutation leases do.
        import asyncio
        result = await asyncio.wait_for(execute(identity), timeout=90)
        saved = await db.create_requests.update_one(
            {"_id": identity, "lease.token": token},
            {"$set": {"state": "complete", "result": result}, "$unset": {"lease": ""}})
        if not saved.matched_count:
            raise HTTPException(409, "Create request ownership changed; retry the same request")
        return result
    except HTTPException as exc:
        latest = await db.create_requests.find_one({"_id": identity})
        if exc.status_code in (403, 422) and not latest.get("primary_started"):
            exc.headers = {**(exc.headers or {}), "X-Create-Rejected": "true"}
        raise
    except Exception as exc:
        logging.getLogger(__name__).error("Create recovery pending: %s (%s)", identity, type(exc).__name__)
        raise HTTPException(503, "Create could not finish. Retry the same request with its Idempotency-Key; do not start a new create.") from exc
    finally:
        current.reset(context)
        await db.create_requests.update_one({"_id": identity, "lease.token": token}, {"$unset": {"lease": ""}})


async def insert_primary(db, collection, document, identity):
    await db.create_requests.update_one({"_id": identity}, {"$set": {"primary_started": True}})
    await db[collection].update_one({"_id": "create:" + identity}, {"$setOnInsert": document}, upsert=True)
    document = await db[collection].find_one({"_id": "create:" + identity})
    document.pop("_id", None)
    return document
