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
            await audit(user, finding_event(pending), "finding", finding_id, task["client_id"], meta={"task_id": task["task_id"]})
            await db.findings.update_one(scope, {"$unset": {"_pending_remediation_audits." + intent: ""}})
            await db.findings.update_one({**scope, "_pending_remediation_audits": {}}, {"$unset": {"_pending_remediation_audits": ""}})
    elif changed.modified_count:
        await audit(user, action, "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
        await audit(user, finding_event(action), "finding", finding_id, task["client_id"], meta={"task_id": task["task_id"]})


def finding_event(task_event):
    """The Finding's own history records the same transition its remediation work caused."""
    return task_event.replace("Related Finding", "Finding", 1)


async def after_delete(db, task, user, now, audit):
    """Recompute remediation after an open Action Item is deleted.

    With other Action Items left, readiness follows them. With none left, the Finding
    returns to Open: it has no remediation, so it cannot be pending validation.
    """
    finding_id = task.get("finding_id")
    if not finding_id:
        return
    scope = {"finding_id": finding_id, "client_id": task["client_id"]}
    remaining = await db.tasks.find_one(scope, {"_id": 0})
    if remaining:
        return await synchronize(db, remaining, user, now, audit)
    changed = await db.findings.update_one({**scope, "status": {"$in": ["in_remediation", "remediated"]}},
                                           {"$set": {"status": "open", "updated_at": now()}})
    if changed.modified_count:
        await audit(user, "Finding returned to Open; its remediation Action Item was deleted", "finding", finding_id,
                    task["client_id"], meta={"task_id": task["task_id"]})
