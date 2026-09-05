"""GRC Program Onboarding endpoints — extracted from server.py.

Contains:
- REQUIREMENTS_LIBRARY, KEY_ROLE_TEMPLATES, ASSESSMENT_TYPES (constants used by /requirements-library).
- Pydantic models for each onboarding section.
- GET  /onboarding/requirements-library
- GET  /onboarding/state
- POST /onboarding/finalize (idempotent orchestrator for the 6-step wizard).

Circular-import note: this module imports helpers from `server` at module load
time. `server.py` imports this file at the very bottom (after all helpers are
defined), so the imports resolve cleanly.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

# Late-binding imports from the main server module. Safe because server.py
# imports this module at the bottom, after all these names are defined.
from server import (  # noqa: E402
    db, _uid, _now, audit, _writable, _can_access_client,
    _next_due_for_recurrence, get_current_user,
    _presence_for_response, _lifecycle_for_response,
    OnboardingPolicyResponse,
)

router = APIRouter(prefix="/api", tags=["onboarding"])


REQUIREMENTS_LIBRARY: List[Dict[str, Any]] = [
    {"category": "Assurance / Certification", "name": "SOC 2", "applicability_hint": "consider"},
    {"category": "Assurance / Certification", "name": "ISO/IEC 27001", "applicability_hint": "consider"},
    {"category": "Assurance / Certification", "name": "CMMC", "applicability_hint": "consider"},
    {"category": "Assurance / Certification", "name": "PCI DSS", "applicability_hint": "consider"},
    {"category": "Legal / Regulatory / Privacy", "name": "HIPAA / HITECH", "applicability_hint": "consider"},
    {"category": "Legal / Regulatory / Privacy", "name": "State Privacy / Breach Notification Requirements", "applicability_hint": "consider"},
    {"category": "Legal / Regulatory / Privacy", "name": "GDPR", "applicability_hint": "consider"},
    {"category": "Legal / Regulatory / Privacy", "name": "Other privacy / data-protection requirements", "applicability_hint": "consider"},
    {"category": "Contractual", "name": "Customer security requirements", "applicability_hint": "common"},
    {"category": "Contractual", "name": "Customer security addendums", "applicability_hint": "common"},
    {"category": "Contractual", "name": "Contractual penetration-testing requirements", "applicability_hint": "consider"},
    {"category": "Contractual", "name": "Contractual BCP/DR requirements", "applicability_hint": "consider"},
    {"category": "Contractual", "name": "Contractual security-assessment requirements", "applicability_hint": "consider"},
    {"category": "Insurance", "name": "Cyber Insurance requirements", "applicability_hint": "common"},
    {"category": "Other", "name": "Industry-specific requirements", "applicability_hint": "consider"},
    {"category": "Other", "name": "Internal governance requirements", "applicability_hint": "common"},
]

KEY_ROLE_TEMPLATES: List[Dict[str, str]] = [
    {"role": "Primary GRC / Security Contact", "hint": "Day-to-day contact for the GRC program."},
    {"role": "Executive Sponsor", "hint": "Senior leader overseeing the program."},
    {"role": "IT Lead", "hint": "Primary IT / technology contact."},
    {"role": "Information Security Lead", "hint": "If different from IT."},
    {"role": "Risk Management Contact", "hint": "Coordinates organizational risk management."},
    {"role": "Vendor / Third-Party Contact", "hint": "Owns vendor relationships or vendor risk."},
    {"role": "Business Continuity / Disaster Recovery Lead", "hint": "Continuity & resilience lead."},
    {"role": "Incident Response Lead", "hint": "Client-side incident response lead."},
    {"role": "HR Contact", "hint": "Workforce / security process coordination."},
    {"role": "Legal / Privacy Contact", "hint": "Legal, privacy, or compliance counsel."},
]

ASSESSMENT_TYPES: List[str] = [
    "Penetration Test", "Risk Assessment", "SOC 2 Assessment / Audit",
    "ISO Audit / Assessment", "CMMC Assessment", "Vulnerability Assessment",
    "Internal Audit", "Customer Security Assessment", "Vendor Assessment",
    "Compliance Assessment", "BCP/DR Exercise", "Incident Response Exercise", "Other",
]


class OnboardingContact(BaseModel):
    role: str
    name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linked_user_id: Optional[str] = None
    notes: Optional[str] = None
    not_applicable: Optional[bool] = False


class OnboardingAssessment(BaseModel):
    name: str
    assessment_type: Optional[str] = None
    date: Optional[str] = None
    conducted_by: Optional[str] = None
    status: Optional[str] = None
    document_available: Optional[bool] = None
    open_findings: Optional[str] = None
    notes: Optional[str] = None
    evidence_ids: Optional[List[str]] = None


class OnboardingKnownIssue(BaseModel):
    title: str
    source: Optional[str] = None
    priority: Optional[str] = None
    owner_id: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    classification: str = "reported"


class OnboardingRequirementResponse(BaseModel):
    name: str
    category: Optional[str] = None
    applicability: str
    note: Optional[str] = None
    rationale: Optional[str] = None


class OnboardingRecurringReview(BaseModel):
    title: str
    review_type: str
    recurrence: Optional[str] = "annual"
    due_days: Optional[int] = 30
    owner_id: Optional[str] = None
    due_date: Optional[str] = None


class OnboardingFinalizeIn(BaseModel):
    client_id: str
    policy_responses: Optional[List[OnboardingPolicyResponse]] = None
    requirement_responses: Optional[List[OnboardingRequirementResponse]] = None
    contacts: Optional[List[OnboardingContact]] = None
    assessments: Optional[List[OnboardingAssessment]] = None
    known_issues: Optional[List[OnboardingKnownIssue]] = None
    recurring_reviews: Optional[List[OnboardingRecurringReview]] = None


_APPLICABILITY_MAP = {
    "applicable": ("active", "applicable"),
    "potentially_applicable": ("under_review", "potentially_applicable"),
    "needs_review": ("under_review", "needs_review"),
    "not_applicable": ("retired", "not_applicable"),
}


@router.get("/onboarding/requirements-library")
async def onboarding_requirements_library(
    client_id: str = Query(...),
    user: Dict = Depends(get_current_user),
):
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    existing = await db.requirements.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    by_name = {(r.get("title") or "").strip().lower(): r for r in existing}
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in REQUIREMENTS_LIBRARY:
        row = {**item}
        match = by_name.get(item["name"].strip().lower())
        if match:
            row["existing_requirement_id"] = match.get("requirement_id")
            row["current_applicability"] = match.get("applicability")
            row["current_note"] = match.get("note")
            row["current_rationale"] = match.get("rationale")
        grouped.setdefault(item["category"], []).append(row)
    return {
        "categories": [{"name": name, "items": items} for name, items in grouped.items()],
        "role_templates": KEY_ROLE_TEMPLATES,
        "assessment_types": ASSESSMENT_TYPES,
    }


@router.get("/onboarding/state")
async def onboarding_state(
    client_id: str = Query(...),
    user: Dict = Depends(get_current_user),
):
    """Return everything the wizard needs to preload when a user revisits onboarding."""
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    contacts = await db.contacts.find({"client_id": client_id}, {"_id": 0}).to_list(200)
    assessments = await db.assessments.find({"client_id": client_id}, {"_id": 0}).to_list(200)
    history = await db.audit_logs.find(
        {"client_id": client_id, "action": {"$regex": "onboarding"}},
        {"_id": 0, "action": 1, "entity_type": 1, "entity_id": 1, "at": 1,
         "user_email": 1, "user_name": 1, "meta": 1}
    ).sort("at", -1).to_list(200)
    return {"contacts": contacts, "assessments": assessments, "onboarding_history": history}


@router.post("/onboarding/finalize")
async def onboarding_finalize(body: OnboardingFinalizeIn, user: Dict = Depends(get_current_user)):
    """Idempotent orchestrator for the six-step onboarding wizard.
    Never fabricates verified metadata. Never duplicates by (client_id + title).
    """
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden for this client")

    cid = body.client_id
    now = _now()
    counters = {
        "policies_created": 0, "policies_updated": 0,
        "requirements_created": 0, "requirements_updated": 0,
        "contacts_saved": 0, "assessments_created": 0,
        "known_issues_promoted": 0, "reviews_created": 0,
        "tasks_created": 0, "findings_created": 0,
    }
    validation_errors: List[str] = []

    # ---------- 1) Policy responses ----------
    if body.policy_responses:
        existing_pols = await db.policies.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        by_title = {(p.get("title") or "").strip().lower(): p for p in existing_pols}
        open_pol_tasks = await db.tasks.find(
            {"client_id": cid, "source": "GRC Program Onboarding",
             "status": {"$nin": ["done"]}, "policy_id": {"$exists": True}},
            {"_id": 0}
        ).to_list(2000)
        task_by_policy = {t.get("policy_id"): t for t in open_pol_tasks}

        for r in body.policy_responses:
            resp = (r.response or "").lower().strip()
            if resp not in ("yes", "no", "unsure", "na"): continue
            if resp == "na" and not (r.applicability_rationale or "").strip():
                validation_errors.append(f"Rationale required for N/A policy '{r.name}'"); continue
            presence = _presence_for_response(resp)
            lifecycle = _lifecycle_for_response(resp)
            existing = by_title.get(r.name.strip().lower())
            if existing:
                update = {
                    "presence": presence, "onboarding_note": r.note or existing.get("onboarding_note"),
                    "applicability_rationale": (r.applicability_rationale or existing.get("applicability_rationale")) if resp == "na" else existing.get("applicability_rationale"),
                    "category": r.category or existing.get("category"),
                    "is_client_reported": True, "updated_at": now,
                }
                if existing.get("status") in (None, "", "draft", "needs_verification", "needs_creation", "not_applicable"):
                    update["status"] = lifecycle
                await db.policies.update_one({"policy_id": existing["policy_id"]}, {"$set": update})
                counters["policies_updated"] += 1
                pol_id = existing["policy_id"]
            else:
                pol_id = _uid("pol")
                await db.policies.insert_one({
                    "policy_id": pol_id, "title": r.name, "client_id": cid,
                    "category": r.category, "presence": presence, "status": lifecycle,
                    "onboarding_note": r.note or None,
                    "applicability_rationale": (r.applicability_rationale or None) if resp == "na" else None,
                    "is_client_reported": True,
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["policies_created"] += 1
            await audit(user, "onboarding-response", "policy", pol_id, cid,
                        meta={"response": resp, "presence": presence})
            if resp in ("no", "unsure") and pol_id not in task_by_policy:
                task_title = f"Develop and approve {r.name}" if resp == "no" else f"Confirm whether {r.name} exists"
                tid = _uid("tsk")
                await db.tasks.insert_one({
                    "task_id": tid, "title": task_title, "client_id": cid,
                    "status": "open", "priority": "medium",
                    "policy_id": pol_id, "source": "GRC Program Onboarding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["tasks_created"] += 1

    # ---------- 2) Requirements ----------
    if body.requirement_responses:
        existing_reqs = await db.requirements.find({"client_id": cid}, {"_id": 0}).to_list(500)
        req_by_name = {(r.get("title") or "").strip().lower(): r for r in existing_reqs}
        for r in body.requirement_responses:
            app = (r.applicability or "").lower()
            if app not in _APPLICABILITY_MAP:
                validation_errors.append(f"Unknown applicability for '{r.name}'"); continue
            if app == "not_applicable" and not (r.rationale or "").strip():
                validation_errors.append(f"Rationale required for N/A requirement '{r.name}'"); continue
            status_val, app_val = _APPLICABILITY_MAP[app]
            existing = req_by_name.get(r.name.strip().lower())
            if existing:
                await db.requirements.update_one(
                    {"requirement_id": existing["requirement_id"]},
                    {"$set": {
                        "applicability": app_val, "status": status_val,
                        "category": r.category or existing.get("category"),
                        "note": r.note or existing.get("note"),
                        "rationale": r.rationale if app == "not_applicable" else existing.get("rationale"),
                        "is_client_reported": True, "updated_at": now,
                    }})
                counters["requirements_updated"] += 1
                req_id = existing["requirement_id"]
            else:
                req_id = _uid("req")
                await db.requirements.insert_one({
                    "requirement_id": req_id, "title": r.name, "client_id": cid,
                    "category": r.category, "applicability": app_val, "status": status_val,
                    "note": r.note or None,
                    "rationale": r.rationale if app == "not_applicable" else None,
                    "source": "GRC Program Onboarding", "is_client_reported": True,
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["requirements_created"] += 1
            await audit(user, "onboarding-response", "requirement", req_id, cid,
                        meta={"applicability": app_val})

    # ---------- 3) Key Roles & Contacts ----------
    if body.contacts:
        existing_contacts = await db.contacts.find({"client_id": cid}, {"_id": 0}).to_list(200)
        by_role = {(c.get("role") or "").strip().lower(): c for c in existing_contacts}
        for c in body.contacts:
            role_key = (c.role or "").strip().lower()
            if not role_key: continue
            if c.not_applicable:
                doc_upsert = {
                    "role": c.role, "client_id": cid,
                    "not_applicable": True, "name": None, "email": None,
                    "notes": c.notes or None, "updated_at": now,
                }
            else:
                doc_upsert = {
                    "role": c.role, "client_id": cid,
                    "name": (c.name or None), "title": (c.title or None),
                    "email": (c.email or None), "phone": (c.phone or None),
                    "linked_user_id": (c.linked_user_id or None),
                    "notes": (c.notes or None),
                    "not_applicable": False,
                    "updated_at": now,
                }
            existing = by_role.get(role_key)
            if existing:
                await db.contacts.update_one({"contact_id": existing["contact_id"]}, {"$set": doc_upsert})
                contact_id = existing["contact_id"]
            else:
                contact_id = _uid("cnt")
                doc_upsert.update({
                    "contact_id": contact_id, "created_at": now, "created_by": user["user_id"],
                })
                await db.contacts.insert_one(doc_upsert)
            counters["contacts_saved"] += 1
            await audit(user, "onboarding-contact", "contact", contact_id, cid,
                        meta={"role": c.role, "not_applicable": bool(c.not_applicable)})

    # ---------- 4) Existing Assessments ----------
    if body.assessments:
        existing_ass = await db.assessments.find({"client_id": cid}, {"_id": 0}).to_list(500)
        seen_key = {((a.get("name") or "").strip().lower(), a.get("date") or ""): a for a in existing_ass}
        for a in body.assessments:
            key = (a.name.strip().lower(), a.date or "")
            if key in seen_key:
                await db.assessments.update_one(
                    {"assessment_id": seen_key[key]["assessment_id"]},
                    {"$set": {
                        "assessment_type": a.assessment_type,
                        "conducted_by": a.conducted_by,
                        "status": a.status or "reported",
                        "document_available": bool(a.document_available),
                        "open_findings": a.open_findings,
                        "notes": a.notes,
                        "evidence_ids": a.evidence_ids or [],
                        "updated_at": now,
                    }},
                )
                assessment_id = seen_key[key]["assessment_id"]
            else:
                assessment_id = _uid("ass")
                await db.assessments.insert_one({
                    "assessment_id": assessment_id, "name": a.name, "client_id": cid,
                    "assessment_type": a.assessment_type, "date": a.date,
                    "conducted_by": a.conducted_by, "status": a.status or "reported",
                    "document_available": bool(a.document_available),
                    "open_findings": a.open_findings, "notes": a.notes,
                    "evidence_ids": a.evidence_ids or [],
                    "source": "GRC Program Onboarding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["assessments_created"] += 1
            await audit(user, "onboarding-assessment", "assessment", assessment_id, cid,
                        meta={"type": a.assessment_type})

    # ---------- 5) Known Issues → promote ----------
    if body.known_issues:
        existing_tasks = await db.tasks.find(
            {"client_id": cid, "source": "GRC Program Onboarding · Known Issue"},
            {"_id": 0, "task_id": 1, "title": 1}
        ).to_list(500)
        existing_findings = await db.findings.find(
            {"client_id": cid, "source": "GRC Program Onboarding · Existing Finding"},
            {"_id": 0, "finding_id": 1, "title": 1}
        ).to_list(500)
        task_titles = {(t.get("title") or "").strip().lower() for t in existing_tasks}
        finding_titles = {(f.get("title") or "").strip().lower() for f in existing_findings}
        for issue in body.known_issues:
            title_key = issue.title.strip().lower()
            if issue.classification == "verified_finding":
                if title_key in finding_titles: continue
                fid = _uid("fnd")
                sev = (issue.priority or "medium").lower()
                await db.findings.insert_one({
                    "finding_id": fid, "title": issue.title, "client_id": cid,
                    "severity": sev if sev in ("critical", "high", "medium", "low", "info") else "medium",
                    "status": "open",
                    "owner_id": issue.owner_id, "due_date": issue.due_date,
                    "description": issue.notes,
                    "source": "GRC Program Onboarding · Existing Finding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["findings_created"] += 1
                counters["known_issues_promoted"] += 1
                await audit(user, "onboarding-known-issue", "finding", fid, cid,
                            meta={"classification": "verified_finding"})
            else:
                if title_key in task_titles: continue
                tid = _uid("tsk")
                prio = (issue.priority or "medium").lower()
                await db.tasks.insert_one({
                    "task_id": tid, "title": issue.title, "client_id": cid,
                    "status": "open",
                    "priority": prio if prio in ("critical", "high", "medium", "low") else "medium",
                    "assignee_id": issue.owner_id, "due_date": issue.due_date,
                    "description": issue.notes,
                    "source": "GRC Program Onboarding · Known Issue",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["tasks_created"] += 1
                counters["known_issues_promoted"] += 1
                await audit(user, "onboarding-known-issue", "task", tid, cid,
                            meta={"classification": issue.classification})

    # ---------- 6) Recurring Reviews (dedup by title) ----------
    if body.recurring_reviews:
        existing_rev = await db.reviews.find(
            {"client_id": cid, "status": {"$nin": ["completed", "cancelled"]}},
            {"_id": 0, "title": 1}
        ).to_list(1000)
        seen_rev = {(r.get("title") or "").strip().lower() for r in existing_rev}
        for rv in body.recurring_reviews:
            if rv.title.strip().lower() in seen_rev: continue
            due_iso = rv.due_date or (datetime.now(timezone.utc) + timedelta(days=int(rv.due_days or 30))).isoformat()
            rid = _uid("rev")
            await db.reviews.insert_one({
                "review_id": rid, "title": rv.title, "review_type": rv.review_type,
                "client_id": cid, "status": "upcoming",
                "recurrence": rv.recurrence or "annual",
                "owner_id": rv.owner_id or user["user_id"],
                "due_date": due_iso,
                "next_review_date": _next_due_for_recurrence(due_iso, rv.recurrence or "annual", None),
                "source": "GRC Program Onboarding",
                "created_at": now, "updated_at": now, "created_by": user["user_id"],
            })
            counters["reviews_created"] += 1
            seen_rev.add(rv.title.strip().lower())
            await audit(user, "onboarding-review", "review", rid, cid,
                        meta={"review_type": rv.review_type})

    await audit(user, "onboarding-complete", "client", cid, cid, meta=counters)

    return {"ok": True, "counters": counters, "validation_errors": validation_errors}
