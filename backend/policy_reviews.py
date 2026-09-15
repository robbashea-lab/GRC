"""Project policy dates from their existing authoritative Review obligations."""
async def sync(db, review):
    policy_id = review.get("policy_id")
    if not policy_id:
        return
    scope = {"policy_id": policy_id, "client_id": review["client_id"]}
    reviews = await db.reviews.find(scope, {"_id": 0}).to_list(None)
    due = sorted(r["due_date"] for r in reviews if r.get("due_date") and r.get("status") not in ("completed", "cancelled"))
    completed = [o["completed_at"] for r in reviews for o in r.get("occurrences", []) if o.get("completed_at")]
    completed += [r["completion_date"] for r in reviews if r.get("status") == "completed" and r.get("completion_date")]
    fields = {"next_review_date": due[0] if due else None, "schedule_from_reviews": True}
    if completed:
        fields["last_reviewed_at"] = max(completed)
    await db.policies.update_one(scope, {"$set": fields})
