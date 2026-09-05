"""Baseline assessment templates + seeding — extracted from server.py.

Contains:
- BASELINE_TEMPLATES constant (policies / risks / recurring review templates).
- BaselineIn Pydantic model.
- GET  /baseline/templates
- POST /baseline

Circular-import note: same pattern as `routes/onboarding.py`. `server.py`
imports this module at the very bottom (after all helpers are defined).
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import (  # noqa: E402
    db, _uid, _now, _writable, _can_access_client, audit, get_current_user,
)

router = APIRouter(prefix="/api", tags=["baseline"])


class BaselineIn(BaseModel):
    client_id: str
    policies: List[str] = []      # list of policy titles to seed
    risks: List[str] = []         # list of risk titles to seed
    reviews: List[Dict[str, Any]] = []  # [{title, review_type, recurrence, due_days}]


BASELINE_TEMPLATES: Dict[str, Any] = {
    "policies": [
        "Information Security Policy", "Access Control Policy", "Acceptable Use Policy",
        "Incident Response Plan", "Business Continuity Plan", "Vendor Management Policy",
        "Data Classification & Handling Policy", "Change Management Policy",
    ],
    "risks": [
        "Ransomware disruption to core systems", "Phishing leading to account compromise",
        "Third-party vendor outage", "Insider misuse of privileged access",
        "Data loss due to unencrypted device", "Regulatory non-compliance",
    ],
    "review_templates": [
        {"title": "Annual Risk Assessment", "review_type": "risk_assessment", "recurrence": "annual", "due_days": 60},
        {"title": "Quarterly Access Review", "review_type": "access", "recurrence": "quarterly", "due_days": 30},
        {"title": "Vendor Risk Review", "review_type": "vendor", "recurrence": "annual", "due_days": 45},
        {"title": "Patch & Vulnerability Review", "review_type": "vulnerability", "recurrence": "monthly", "due_days": 15},
        {"title": "Policy Review — Information Security Policy", "review_type": "policy", "recurrence": "annual", "due_days": 60},
        {"title": "BCP / DR Tabletop Exercise", "review_type": "bcp_dr", "recurrence": "semiannual", "due_days": 90},
        {"title": "Incident Response Tabletop", "review_type": "incident_response", "recurrence": "annual", "due_days": 90},
        {"title": "Security Awareness Training Review", "review_type": "awareness", "recurrence": "quarterly", "due_days": 30},
        {"title": "Legal, Regulatory & Contractual Requirements Review", "review_type": "requirements", "recurrence": "annual", "due_days": 90},
        {"title": "External Penetration Test", "review_type": "penetration_test", "recurrence": "annual", "due_days": 120},
    ],
}


@router.get("/baseline/templates")
async def baseline_templates(user: Dict = Depends(get_current_user)):
    return BASELINE_TEMPLATES


@router.post("/baseline")
async def create_baseline(body: BaselineIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden for this client")
    created = {"policies": 0, "risks": 0, "reviews": 0}
    # NOTE: The Policies list is retained here for legacy callers only. The new
    # "Policies & Governance Documents" onboarding step writes via
    # POST /api/onboarding/policy-responses which distinguishes reported vs verified.
    for title in body.policies:
        doc = {"policy_id": _uid("pol"), "title": title, "client_id": body.client_id,
               "status": "draft", "owner_id": user["user_id"],
               "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"]}
        await db.policies.insert_one(doc)
        created["policies"] += 1
    for title in body.risks:
        doc = {"risk_id": _uid("rsk"), "title": title, "client_id": body.client_id,
               "category": "operational", "likelihood": "medium", "impact": "medium",
               "status": "identified", "owner_id": user["user_id"],
               "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"]}
        await db.risks.insert_one(doc)
        created["risks"] += 1
    for rv in body.reviews:
        due_days = int(rv.get("due_days", 30))
        doc = {
            "review_id": _uid("rev"),
            "title": rv.get("title") or "Review",
            "review_type": rv.get("review_type") or "asset",
            "client_id": body.client_id,
            "status": "upcoming",
            "recurrence": rv.get("recurrence") or "quarterly",
            "owner_id": user["user_id"],
            "due_date": (datetime.now(timezone.utc) + timedelta(days=due_days)).isoformat(),
            "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
        }
        await db.reviews.insert_one(doc)
        created["reviews"] += 1
    await audit(user, "baseline", "client", body.client_id, body.client_id, meta=created)
    return {"ok": True, "created": created}
