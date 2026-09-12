"""Calendar scheduling and immutable occurrence projections (no database writes)."""
from calendar import monthrange
from datetime import datetime, timedelta

MONTHS = {"monthly": 1, "quarterly": 3, "semiannual": 6, "annual": 12}


def scheduled_date(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def occurrence_id(review):
    return review.get("current_occurrence_id") or "occ_" + review["review_id"]


def schedule(review, reset_anchor=False):
    date = scheduled_date(review.get("due_date"))
    recurrence = review.get("recurrence") or "none"
    anchor = None if reset_anchor else review.get("schedule_anchor")
    anchor = anchor or ({"day": date.day, "month_end": date.day == monthrange(date.year, date.month)[1]} if date else None)
    next_date = None
    label = "Needs Scheduling"
    if date:
        label = str(date.year) if recurrence == "annual" else (
            f"Q{(date.month - 1) // 3 + 1} {date.year}" if recurrence == "quarterly" else
            f"H{(date.month - 1) // 6 + 1} {date.year}" if recurrence == "semiannual" else
            date.strftime("%B %Y") if recurrence == "monthly" else date.date().isoformat())
        if recurrence in MONTHS:
            month0 = date.month - 1 + MONTHS[recurrence]
            year, month = date.year + month0 // 12, month0 % 12 + 1
            last = monthrange(year, month)[1]
            next_date = date.replace(year=year, month=month, day=last if anchor["month_end"] else min(anchor["day"], last)).isoformat()
        elif recurrence == "custom" and isinstance(review.get("custom_recurrence_days"), int) and review["custom_recurrence_days"] > 0:
            next_date = (date + timedelta(days=review["custom_recurrence_days"])).isoformat()
    return {"period": label, "next_review_date": next_date, "schedule_anchor": anchor}


def view(review):
    result = {**review, **schedule(review), "current_occurrence_id": occurrence_id(review)}
    result.pop("_execution_lock", None)
    if review.get("status") not in ("completed", "cancelled"):
        unscheduled = not scheduled_date(review.get("due_date")) or ("recurrence" in review and review["recurrence"] in (None, "")) or (
            review.get("recurrence") not in (None, "", "none") and not result["next_review_date"])
        if unscheduled:
            result["status"] = "needs_scheduling"
        elif review.get("status") == "needs_scheduling":
            result["status"] = "upcoming"
    return result


def occurrence_query(review, selected=None, field="occurrence_id"):
    """Legacy untagged records belong ONLY to the first recorded execution."""
    selected = selected or occurrence_id(review)
    initial = "occ_" + review["review_id"]
    return {field: {"$in": [selected, None]}} if selected == initial else {field: selected}


def snapshot(review, evidence, finding_count, user, at):
    fields = ("review_id", "client_id", "title", "review_type", "due_date", "owner_id", "reviewer_id",
              "recurrence", "custom_recurrence_days", "notes", "scope", "follow_up", "policy_id", "vendor_id",
              "source", "started_by", "started_at")
    return {**{k: review.get(k) for k in fields}, **schedule(review),
            "occurrence_id": occurrence_id(review), "status": "completed", "completion_date": at,
            "completed_at": at, "completed_by": user["user_id"], "completed_by_name": user.get("name") or user.get("email"),
            "outcome": "findings_raised" if finding_count else "no_findings", "finding_count": finding_count,
            "evidence": [{k: e.get(k) for k in ("evidence_id", "filename", "version", "sha256")} for e in evidence]}
