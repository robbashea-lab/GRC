"""Synchronize remediation readiness without performing validation or closure."""
import create_requests


async def synchronize(db, task, user, now, audit):
    finding_id = task.get("finding_id")
    if not finding_id:
        return
    scope = {"finding_id": finding_id, "client_id": task["client_id"]}
    # Existence query avoids a capped list incorrectly ignoring later open tasks.
    outstanding = await db.tasks.find_one({**scope, "status": {"$nin": ["done", "cancelled"]}})
    status = "in_remediation" if outstanding else "remediated"
    action = "Related Finding moved to Pending Validation" if status == "remediated" else "Related Finding moved to In Remediation"
    changes = {"status": status, "updated_at": now()}
    intent = create_requests.current.get()
    # Keep the required event with the conditional business transition itself.
    # A receipt/audit storage outage after that write must not lose the event.
    if intent:
        changes["_pending_remediation_audits." + intent] = action
    changed = await db.findings.update_one({**scope, "status": {"$in": ["open", "in_remediation", "remediated"], "$ne": status}}, {"$set": changes})
    if intent:
        row = await db.findings.find_one(scope)
        pending = (row or {}).get("_pending_remediation_audits", {}).get(intent)
        if pending:
            await audit(user, pending, "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
            await db.findings.update_one(scope, {"$unset": {"_pending_remediation_audits." + intent: ""}})
            await db.findings.update_one({**scope, "_pending_remediation_audits": {}}, {"$unset": {"_pending_remediation_audits": ""}})
    elif changed.modified_count:
        await audit(user, action, "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
