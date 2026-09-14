"""Tenant business identifiers; UUID relationships are never changed.

The counter's atomic initialization reserves every legacy assignment before any
new allocation. A persisted plan makes interrupted backfills safe to resume.
Counters must be retained even when a client has no remaining risks.
"""
import re
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

PATTERN = re.compile(r"^RISK-([0-9]{3,})$")


async def initialize(db, client_id):
    key = "risk-display:" + client_id
    counter = await db.business_counters.find_one({"_id": key})
    if not counter:
        rows = await db.risks.find({"client_id": client_id}).sort([
            ("created_at", 1), ("risk_id", 1)]).to_list(None)
        used, pending = set(), []
        for row in rows:
            match = PATTERN.fullmatch(row.get("display_id") or "")
            if match:
                number = int(match.group(1))
                if number in used:
                    raise ValueError("Duplicate Risk display IDs require reconciliation")
                used.add(number)
            else:
                pending.append(row)
        number = max(used, default=0)
        plan = []
        for row in pending:
            number += 1
            plan.append({"risk_id": row["risk_id"], "display_id": f"RISK-{number:03d}",
                         "legacy_display_id": row.get("display_id") or row["risk_id"][-6:].upper()})
        try:
            counter = await db.business_counters.find_one_and_update({"_id": key},
                {"$setOnInsert": {"sequence": number, "backfill": plan}},
                upsert=True, return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            counter = await db.business_counters.find_one({"_id": key})
    for assignment in counter.get("backfill", []):
        await db.risks.update_one({"client_id": client_id, "risk_id": assignment["risk_id"],
            "display_id": {"$not": {"$regex": PATTERN.pattern}}}, {"$set": {
                "display_id": assignment["display_id"], "legacy_display_id": assignment["legacy_display_id"]}})
    return key


async def allocate(db, client_id):
    key = await initialize(db, client_id)
    counter = await db.business_counters.find_one_and_update({"_id": key},
        {"$inc": {"sequence": 1}}, return_document=ReturnDocument.AFTER)
    return f"RISK-{counter['sequence']:03d}"
