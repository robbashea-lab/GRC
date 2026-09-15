"""Synchronize remediation readiness without performing validation or closure."""
async def synchronize(db, task, user, now, audit):
    finding_id = task.get("finding_id")
    if not finding_id:
        return
    scope = {"finding_id": finding_id, "client_id": task["client_id"]}
    # Existence query avoids a capped list incorrectly ignoring later open tasks.
    outstanding = await db.tasks.find_one({**scope, "status": {"$nin": ["done", "cancelled"]}})
    status = "in_remediation" if outstanding else "remediated"
    changed = await db.findings.update_one({**scope, "status": {"$in": ["open", "in_remediation", "remediated"], "$ne": status}}, {"$set": {"status": status, "updated_at": now()}})
    if changed.modified_count:
        await audit(user, "Related Finding moved to Pending Validation" if status == "remediated" else "Related Finding moved to In Remediation", "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
