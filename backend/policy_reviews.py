"""Project policy dates from their existing authoritative Review obligations."""
import portfolio_activity
from fastapi import HTTPException


async def sync(db, review, user=None):
    policy_id = review.get("policy_id")
    if not policy_id:
        return
    scope = {"policy_id": policy_id, "client_id": review["client_id"]}
    policy = await db.policies.find_one(scope, {"_id": 0})
    if not policy:
        return
    reviews = await db.reviews.find(scope, {"_id": 0}).to_list(None)
    due = sorted(r["due_date"] for r in reviews if r.get("due_date") and r.get("status") not in ("completed", "cancelled"))
    completed = [o["completed_at"] for r in reviews for o in r.get("occurrences", []) if o.get("completed_at")]
    completed += [r["completion_date"] for r in reviews if r.get("status") == "completed" and r.get("completion_date")]
    fields = {"next_review_date": due[0] if due else None, "schedule_from_reviews": True}
    if completed:
        fields["last_reviewed_at"] = max(completed)
    if all(policy.get(key) == value for key, value in fields.items()):
        return
    latest = next((o for o in reversed(review.get('occurrences', [])) if o.get('completed_at')), None)
    at = review.get('updated_at') or (latest or {}).get('completed_at') or review.get('created_at')
    actor = ({'user_id': latest.get('completed_by'), 'name': latest.get('completed_by_name')}
             if latest and latest.get('completed_at') == at else user or {})
    schedule_changed = str(policy.get('next_review_date') or '')[:10] != str(fields['next_review_date'] or '')[:10]
    event = portfolio_activity.project_committed_change('policies', policy_id, review['client_id'],
        actor, policy, {**policy, **fields}, at, 'review_schedule_projection') if at and schedule_changed else None
    if event:
        fields.update({'_portfolio_activity_pending.' + event['event_id']: event,
                       '_portfolio_activity_last_event_id': event['event_id']})
    # A replay sees the already-projected date and emits no second event.
    result = await db.policies.update_one({**scope, 'next_review_date': policy.get('next_review_date')}, {"$set": fields})
    if not result.matched_count:
        raise HTTPException(409, 'Policy schedule changed; retry the Review completion to reconcile it')
