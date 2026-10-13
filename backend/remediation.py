"""Synchronize remediation readiness without performing validation or closure."""
from fastapi import HTTPException
import create_requests


async def synchronize(db, task, user, now, audit):
    from server import _portfolio_event_patch

    finding_id = task.get("finding_id")
    if not finding_id:
        return
    scope = {"finding_id": finding_id, "client_id": task["client_id"]}
    # Existence query avoids a capped list incorrectly ignoring later open tasks.
    outstanding = await db.tasks.find_one({**scope, "status": {"$nin": ["done", "cancelled"]}})
    status = "in_remediation" if outstanding else "remediated"
    action = "Related Finding moved to Pending Validation" if status == "remediated" else "Related Finding moved to In Remediation"
    intent = create_requests.current.get()
    old = await db.findings.find_one(scope)
    portfolio_event, transitioned = None, False
    if old and old.get('status') in ('open', 'in_remediation', 'remediated') and old['status'] != status:
        at = now()
        changes = {'status': status, 'updated_at': at}
        portfolio_patch, portfolio_event = _portfolio_event_patch(
            'finding', finding_id, task['client_id'], user, old, {**old, **changes}, at)
        changes.update(portfolio_patch)
        # Keep the original audit action and its capture identity with the same
        # transition; retries may observe a newer independent Finding change.
        if intent:
            changes['_pending_remediation_audits.' + intent] = action
            if portfolio_event:
                changes['_pending_remediation_activity_event_ids.' + intent] = portfolio_event['event_id']
        changed = await db.findings.update_one(
            {**scope, 'status': old['status'], 'updated_at': old.get('updated_at')}, {'$set': changes})
        if not changed.matched_count:
            raise HTTPException(409, 'Finding changed while updating remediation readiness; retry the operation')
        transitioned = bool(changed.modified_count)
    if intent:
        row = await db.findings.find_one(scope)
        pending = (row or {}).get("_pending_remediation_audits", {}).get(intent)
        if pending:
            event_id = (row or {}).get('_pending_remediation_activity_event_ids', {}).get(intent)
            await audit(user, pending, "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
            await audit(user, finding_event(pending), "finding", finding_id, task["client_id"], meta={
                'task_id': task['task_id'], '_portfolio_activity_event_id': event_id})
            await db.findings.update_one(scope, {'$unset': {
                '_pending_remediation_audits.' + intent: '', '_pending_remediation_activity_event_ids.' + intent: ''}})
            await db.findings.update_one({**scope, "_pending_remediation_audits": {}}, {"$unset": {"_pending_remediation_audits": ""}})
            await db.findings.update_one({**scope, '_pending_remediation_activity_event_ids': {}},
                                        {'$unset': {'_pending_remediation_activity_event_ids': ''}})
    elif transitioned:
        await audit(user, action, "task", task["task_id"], task["client_id"], meta={"finding_id": finding_id})
        await audit(user, finding_event(action), "finding", finding_id, task["client_id"], meta={
            'task_id': task['task_id'], '_portfolio_activity_event_id': portfolio_event['event_id'] if portfolio_event else None,
            '_portfolio_activity_noop': portfolio_event is None})


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
    old = await db.findings.find_one(scope)
    if not old or old.get('status') not in ('in_remediation', 'remediated'):
        return
    from server import _portfolio_event_patch

    at = now()
    changes = {'status': 'open', 'updated_at': at}
    portfolio_patch, portfolio_event = _portfolio_event_patch(
        'finding', finding_id, task['client_id'], user, old, {**old, **changes}, at)
    changed = await db.findings.update_one({**scope, 'status': old['status'], 'updated_at': old.get('updated_at')},
                                         {'$set': {**changes, **portfolio_patch}})
    if not changed.matched_count:
        raise HTTPException(409, 'Finding changed while updating remediation readiness; retry the operation')
    if changed.modified_count:
        await audit(user, "Finding returned to Open; its remediation Action Item was deleted", "finding", finding_id,
                    task["client_id"], meta={'task_id': task['task_id'],
                        '_portfolio_activity_event_id': portfolio_event['event_id'] if portfolio_event else None,
                        '_portfolio_activity_noop': portfolio_event is None})
