"""Small Task provenance contract; no new entity or shadow task store."""
from fastapi import HTTPException

SOURCES = {"review": ("reviews", "review_id"), "finding": ("findings", "finding_id"),
           "risk": ("risks", "risk_id"), "vendor": ("vendors", "vendor_id"), "policy": ("policies", "policy_id"), "audit": ("assessments", "assessment_id")}
LINKS = {"source_type", "source_id", "review_id", "finding_id", "risk_id", "vendor_id", "policy_id", "assessment_id"}

async def prepare(db, row, can_access, previous=None):
    cid = row["client_id"]
    if row.get("priority") not in ("critical", "high", "medium", "low") and not (previous and row.get("priority") == previous.get("priority")):
        raise HTTPException(422, "Invalid Action Item priority")
    owner_id = row.get("assignee_id")
    if owner_id:
        owner = await db.users.find_one({"user_id": owner_id}, {"_id": 0})
        if not owner or not can_access(owner, cid):
            raise HTTPException(422, "Assignee must have access to this client")
    if previous:
        if any(row.get(k) != previous.get(k) for k in LINKS):
            raise HTTPException(422, "The originating source and relationships must be retained")
        if previous.get("status") == "done" and row.get("status") != "done":
            raise HTTPException(409, "Completed Action Items remain historical evidence")
        return row
    if row.get("status", "open") != "open":
        raise HTTPException(422, "New Action Items start Open")
    source_type = row.get("source_type") or next((t for t, (_, key) in SOURCES.items() if row.get(key)), "manual")
    if source_type not in {*SOURCES, "manual", "audit"}:
        raise HTTPException(422, "Invalid source")
    row["source_type"] = source_type
    if source_type == "audit" and not row.get("source_id") and not row.get("assessment_id"):
        if any(row.get(key) for typ, (_, key) in SOURCES.items() if typ != "audit"):
            raise HTTPException(422, "Select the linked record as the source")
        return row
    if source_type in SOURCES:
        kind, key = SOURCES[source_type]
        ident = row.get("source_id") or row.get(key)
        source = await db[kind].find_one({key: ident, "client_id": cid}, {"_id": 0}) if ident else None
        if not source:
            raise HTTPException(422, "Select a source record from this client")
        if row.get(key) and row[key] != ident:
            raise HTTPException(422, "Conflicting source relationship")
        row.update({key: ident, "source_id": ident})
        if row.get("finding_id"):
            source_finding = await db.findings.find_one({"finding_id": row["finding_id"], "client_id": cid}, {"_id": 0})
            if not source_finding:
                raise HTTPException(422, "Finding must belong to this client")
            for field in ("review_id", "occurrence_id", "vendor_id"):
                if source_finding.get(field):
                    if row.get(field) and row[field] != source_finding[field]:
                        raise HTTPException(422, "Conflicting Finding provenance")
                    row[field] = source_finding[field]
        if row.get("review_id"):
            review = await db.reviews.find_one({"review_id": row["review_id"], "client_id": cid}, {"_id": 0})
            if not review:
                raise HTTPException(422, "Review must belong to this client")
            if review.get("vendor_id"):
                if row.get("vendor_id") and row["vendor_id"] != review["vendor_id"]:
                    raise HTTPException(422, "Conflicting Vendor provenance")
                row["vendor_id"] = review["vendor_id"]
            # A Finding's historical execution wins over the Review's current execution.
            row["occurrence_id"] = row.get("occurrence_id") or review.get("current_occurrence_id") or "occ_" + review["review_id"]
    elif row.get("source_id") or any(row.get(key) for _,key in SOURCES.values()):
        raise HTTPException(422, "Select the linked record as the source")
    return row
