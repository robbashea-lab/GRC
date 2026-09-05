"""GRC Portfolio / Client Directory endpoints — extracted from server.py.

Contains:
- GET /clients/directory — internal-admin portfolio operations dashboard.

Circular-import note: same pattern as `routes/onboarding.py`. `server.py`
imports this module at the very bottom (after all helpers are defined), so the
late-binding imports resolve cleanly.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query

from server import (  # noqa: E402
    db, get_current_user,
)

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.get("/clients/directory")
async def clients_directory(
    include_archived: bool = Query(False),
    user: Dict = Depends(get_current_user),
):
    """Portfolio operations dashboard endpoint.

    Returns:
    - `clients`: per-tenant row with GRC lead, program status, non-overlapping due-window
      counts, critical/high open, unassigned, next major item.
    - `portfolio`: aggregate cards — past_due / due_30d / due_31_90d / critical_high /
      unassigned / clients_requiring_attention.
    - `attention_queue`: top ~15 prioritized items across the portfolio.
    - `team_workload`: per GRC-lead operational load.

    Non-overlap: an item counted in Past Due is never in Due 30d; Due 30d never in 31–90.
    De-duplication: a Task whose `finding_id` links to a Finding is not counted separately
    for critical/high or past-due purposes — the underlying Finding is the source of truth.
    """
    role = user.get("role")
    if role not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Client directory is restricted to internal admins")

    q: Dict = {}
    if not include_archived:
        q["status"] = {"$ne": "archived"}
    # Restrict Platform Admins to the clients they're explicitly authorized for
    # when their user record has a client_ids scope. Super admins always see all.
    if role == "platform_admin" and user.get("client_ids"):
        q["client_id"] = {"$in": user["client_ids"]}
    clients = await db.clients.find(q, {"_id": 0}).to_list(500)
    client_ids = [c["client_id"] for c in clients]
    empty_portfolio = {
        "total_clients": 0, "clients_requiring_attention": 0,
        "past_due": 0, "due_30d": 0, "due_31_90d": 0,
        "critical_high_open": 0, "unassigned": 0,
        # Legacy keys kept so existing UI callers don't crash mid-deploy.
        "action_required": 0, "needs_attention": 0,
        "total_overdue_reviews": 0, "total_critical_high": 0,
        "total_significant_risks": 0, "upcoming_reviews_30d": 0,
    }
    if not client_ids:
        return {"clients": [], "portfolio": empty_portfolio, "attention_queue": [], "team_workload": []}

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    horizon_30 = (now_dt + timedelta(days=30)).isoformat()
    horizon_90 = (now_dt + timedelta(days=90)).isoformat()

    # Bulk fetch — one query per collection, then bucket by client_id.
    reviews = await db.reviews.find({"client_id": {"$in": client_ids}}, {"_id": 0}).to_list(10000)
    findings = await db.findings.find({"client_id": {"$in": client_ids}}, {"_id": 0}).to_list(10000)
    risks = await db.risks.find({"client_id": {"$in": client_ids}}, {"_id": 0}).to_list(10000)
    tasks = await db.tasks.find({"client_id": {"$in": client_ids}}, {"_id": 0}).to_list(10000)
    activity_logs = await db.audit_logs.find(
        {"client_id": {"$in": client_ids},
         "action": {"$nin": ["login", "logout", "view", "list"]}},
        {"_id": 0, "client_id": 1, "at": 1, "action": 1, "entity_type": 1, "user_email": 1, "user_name": 1}
    ).sort("at", -1).to_list(50000)

    users_for_names = await db.users.find(
        {}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(500)
    user_by_id = {u["user_id"]: u for u in users_for_names}
    client_by_id = {c["client_id"]: c for c in clients}  # noqa: F841 (kept for parity)

    by_client_last_activity: Dict[str, Dict] = {}
    for log in activity_logs:
        cid = log.get("client_id")
        if cid and cid not in by_client_last_activity:
            by_client_last_activity[cid] = log

    CLOSED_REVIEW = ("completed", "cancelled")
    CLOSED_FINDING = ("closed", "remediated")
    CLOSED_TASK = ("done", "cancelled")
    CLOSED_RISK = ("closed", "retired")
    HIGH_TASK_PRIORITY = ("immediate", "critical", "high")
    SIG_REVIEW_TYPES = ("risk", "risk_assessment", "vendor", "policy", "access", "penetration_test",
                        "bcp_dr", "incident_response", "awareness")

    def by_cid(items):
        d: Dict[str, List] = {cid: [] for cid in client_ids}
        for x in items:
            cid = x.get("client_id")
            if cid in d:
                d[cid].append(x)
        return d
    reviews_by = by_cid(reviews)
    findings_by = by_cid(findings)
    risks_by = by_cid(risks)
    tasks_by = by_cid(tasks)

    def _due_bucket(due: Optional[str]) -> Optional[str]:
        if not due:
            return None
        if due < now_iso:
            return "past_due"
        if due <= horizon_30:
            return "due_30d"
        if due <= horizon_90:
            return "due_31_90d"
        return None

    def _priority_rank(row: Dict[str, Any]) -> int:
        """Lower = higher priority."""
        sev = (row.get("severity") or row.get("risk_level") or row.get("priority") or "").lower()
        overdue = row.get("due_date") and row["due_date"] < now_iso
        crit = sev in ("critical", "immediate")
        high = sev in ("high",)
        if crit and overdue: return 0
        if crit:              return 1
        if high and overdue: return 2
        if overdue:           return 3
        if crit or high:      return 4
        due = row.get("due_date")
        if due and due <= (now_dt + timedelta(days=7)).isoformat(): return 5
        if due and due <= horizon_30: return 6
        return 9

    all_attention: List[Dict[str, Any]] = []
    rows: List[Dict] = []
    port_pd = port_30 = port_3190 = port_crit = port_unassigned = 0
    port_action = port_attn = 0
    workload_map: Dict[str, Dict[str, int]] = {}

    def _bump_workload(uid: Optional[str], key: str, delta: int = 1, client_id: Optional[str] = None):
        if not uid:
            return
        w = workload_map.setdefault(uid, {
            "user_id": uid, "clients": set(), "past_due": 0, "due_30d": 0,
            "critical_high": 0, "open_actions": 0,
        })
        w[key] += delta
        if client_id:
            w["clients"].add(client_id)

    for c in clients:
        cid = c["client_id"]
        client_status = (c.get("status") or "active").lower()
        is_archived_or_inactive = client_status in ("archived", "inactive")
        rs = reviews_by.get(cid, [])
        fs = findings_by.get(cid, [])
        ks = risks_by.get(cid, [])
        ts = tasks_by.get(cid, [])

        pd: List[Dict] = []
        d30: List[Dict] = []
        d3190: List[Dict] = []

        def _push(entity_type: str, r: Dict, closed_set: Tuple[str, ...], due_field: str = "due_date"):
            if r.get("status") in closed_set:
                return
            due = r.get(due_field)
            bucket = _due_bucket(due)
            if bucket is None:
                return
            row = {
                "entity_type": entity_type,
                "client_id": cid,
                "client_name": c.get("name"),
                "id": r.get("review_id") or r.get("finding_id") or r.get("risk_id") or r.get("task_id"),
                "title": r.get("title"),
                "due_date": due,
                "owner_id": r.get("owner_id") or r.get("assignee_id"),
                "status": r.get("status"),
                "severity": r.get("severity"),
                "risk_level": r.get("risk_level"),
                "priority": r.get("priority"),
                "review_type": r.get("review_type"),
                "raw": r,
            }
            if bucket == "past_due":   pd.append(row)
            elif bucket == "due_30d":  d30.append(row)
            else:                       d3190.append(row)

        for r in rs: _push("review",  r, CLOSED_REVIEW)
        for f in fs: _push("finding", f, CLOSED_FINDING)
        for r in ks: _push("risk",   r, CLOSED_RISK, due_field="next_review")
        for t in ts:
            if t.get("finding_id"):
                continue
            _push("task", t, CLOSED_TASK)

        crit_high_findings = [
            f for f in fs
            if f.get("status") not in CLOSED_FINDING and (f.get("severity") or "").lower() in ("critical", "high")
        ]
        crit_high_risks = [
            r for r in ks
            if r.get("status") not in CLOSED_RISK and (r.get("risk_level") or "").lower() in ("critical", "high")
        ]
        crit_high_tasks = [
            t for t in ts
            if not t.get("finding_id") and t.get("status") not in CLOSED_TASK
            and (t.get("priority") or "").lower() in HIGH_TASK_PRIORITY
        ]
        crit_high_open = len(crit_high_findings) + len(crit_high_risks) + len(crit_high_tasks)

        unassigned_items: List[Dict] = []
        for r in rs:
            if r.get("status") not in CLOSED_REVIEW and not r.get("owner_id"):
                unassigned_items.append({"entity_type": "review", "id": r.get("review_id"),
                                          "title": r.get("title"), "due_date": r.get("due_date")})
        for t in ts:
            if t.get("finding_id"):  continue
            if t.get("status") not in CLOSED_TASK and not (t.get("assignee_id") or t.get("owner_id")):
                unassigned_items.append({"entity_type": "task", "id": t.get("task_id"),
                                          "title": t.get("title"), "due_date": t.get("due_date")})
        for f in fs:
            if f.get("status") not in CLOSED_FINDING and not f.get("owner_id"):
                unassigned_items.append({"entity_type": "finding", "id": f.get("finding_id"),
                                          "title": f.get("title"), "due_date": f.get("due_date")})
        for k in ks:
            if k.get("status") not in CLOSED_RISK and not k.get("owner_id"):
                unassigned_items.append({"entity_type": "risk", "id": k.get("risk_id"),
                                          "title": k.get("title"), "due_date": k.get("next_review")})

        upcoming_major = [
            r for r in rs
            if r.get("status") not in CLOSED_REVIEW and r.get("due_date")
            and r["due_date"] >= now_iso
            and (r.get("review_type") or "").lower() in SIG_REVIEW_TYPES
        ]
        upcoming_major.sort(key=lambda r: r["due_date"])
        next_major = None
        if upcoming_major:
            top = upcoming_major[0]
            next_major = {"title": top.get("title"), "due_date": top.get("due_date"),
                          "review_type": top.get("review_type"), "review_id": top.get("review_id")}

        overdue_reviews = [r for r in pd if r["entity_type"] == "review"]
        critical_overdue = any(
            (b.get("severity") == "critical" or b.get("risk_level") == "critical" or b.get("priority") == "immediate")
            for b in pd
        )
        if is_archived_or_inactive:
            program_status = client_status
        elif client_status == "onboarding":
            program_status = "onboarding"
        elif critical_overdue or len(pd) >= 3 or crit_high_open >= 3:
            program_status = "action_required"
        elif pd or crit_high_open or d30 or len(unassigned_items):
            program_status = "needs_attention"
        else:
            program_status = "healthy"

        contributes = not is_archived_or_inactive
        if contributes:
            port_pd += len(pd)
            port_30 += len(d30)
            port_3190 += len(d3190)
            port_crit += crit_high_open
            port_unassigned += len(unassigned_items)
            if program_status == "action_required": port_action += 1
            elif program_status == "needs_attention": port_attn += 1

            grc_lead = c.get("assigned_owner_id")
            if grc_lead:
                workload_map.setdefault(grc_lead, {
                    "user_id": grc_lead, "clients": set(), "past_due": 0, "due_30d": 0,
                    "critical_high": 0, "open_actions": 0,
                })["clients"].add(cid)
            for b in pd:
                _bump_workload(b.get("owner_id"), "past_due", 1, cid)
            for b in d30:
                _bump_workload(b.get("owner_id"), "due_30d", 1, cid)
            for f in crit_high_findings:
                _bump_workload(f.get("owner_id"), "critical_high", 1, cid)
            for r in crit_high_risks:
                _bump_workload(r.get("owner_id"), "critical_high", 1, cid)
            for t in ts:
                if t.get("finding_id"):  continue
                if t.get("status") not in CLOSED_TASK:
                    _bump_workload(t.get("assignee_id") or t.get("owner_id"), "open_actions", 1, cid)

            for b in pd + d30:
                all_attention.append({**b, "rank": _priority_rank(b)})
            for f in crit_high_findings:
                if _due_bucket(f.get("due_date")) is None:
                    all_attention.append({
                        "entity_type": "finding", "client_id": cid, "client_name": c.get("name"),
                        "id": f.get("finding_id"), "title": f.get("title"),
                        "due_date": f.get("due_date"), "owner_id": f.get("owner_id"),
                        "status": f.get("status"), "severity": f.get("severity"),
                        "rank": _priority_rank(f),
                    })
            for r in crit_high_risks:
                if _due_bucket(r.get("next_review")) is None:
                    all_attention.append({
                        "entity_type": "risk", "client_id": cid, "client_name": c.get("name"),
                        "id": r.get("risk_id"), "title": r.get("title"),
                        "due_date": r.get("next_review"), "owner_id": r.get("owner_id"),
                        "status": r.get("status"), "risk_level": r.get("risk_level"),
                        "rank": _priority_rank(r),
                    })

        last = by_client_last_activity.get(cid)
        rows.append({
            "client_id": cid,
            "name": c["name"],
            "industry": c.get("industry"),
            "environment": c.get("environment"),
            "logo_url": c.get("logo_url"),
            "primary_contact": c.get("primary_contact"),
            "grc_lead_id": c.get("assigned_owner_id"),
            "grc_lead": (
                {"user_id": c["assigned_owner_id"],
                 "name": user_by_id.get(c["assigned_owner_id"], {}).get("name"),
                 "email": user_by_id.get(c["assigned_owner_id"], {}).get("email")}
                if c.get("assigned_owner_id") else None
            ),
            "assigned_owner_id": c.get("assigned_owner_id"),
            "client_status": client_status,
            "program_status": program_status,
            "past_due": len(pd),
            "due_30d": len(d30),
            "due_31_90d": len(d3190),
            "critical_high_open": crit_high_open,
            "unassigned": len(unassigned_items),
            "next_major_item": next_major,
            "open_actions": len(pd) + len(d30),
            "open_findings": len([f for f in fs if f.get("status") in ("open", "in_remediation")]),
            "significant_risks": len(crit_high_risks),
            "upcoming_reviews": len([r for r in rs if r.get("status") not in CLOSED_REVIEW
                                     and r.get("due_date") and now_iso <= r["due_date"] <= horizon_30]),
            "overdue_reviews": len(overdue_reviews),
            "critical_high_findings": len(crit_high_findings),
            "last_activity": (
                {"at": last.get("at"), "action": last.get("action"),
                 "entity_type": last.get("entity_type"),
                 "actor": last.get("user_name") or last.get("user_email")}
                if last else None
            ),
            "created_at": c.get("created_at"),
        })

    order = {"action_required": 0, "needs_attention": 1, "onboarding": 2, "healthy": 3, "inactive": 4, "archived": 5}
    rows.sort(key=lambda r: (order.get(r["program_status"], 9), (r["name"] or "").lower()))

    all_attention.sort(key=lambda x: (x["rank"], x.get("due_date") or "9999"))
    attention_queue: List[Dict] = []
    for a in all_attention[:15]:
        owner = user_by_id.get(a.get("owner_id"))
        overdue = bool(a.get("due_date") and a["due_date"] < now_iso)
        sev = (a.get("severity") or a.get("risk_level") or a.get("priority") or "").lower()
        priority_bucket = ("critical" if sev in ("critical", "immediate")
                           else "high" if sev == "high"
                           else "overdue" if overdue else "due_soon")
        attention_queue.append({
            "priority": priority_bucket,
            "client_id": a.get("client_id"),
            "client_name": a.get("client_name"),
            "entity_type": a.get("entity_type"),
            "entity_id": a.get("id"),
            "title": a.get("title"),
            "owner_id": a.get("owner_id"),
            "owner_name": (owner.get("name") or owner.get("email")) if owner else None,
            "due_date": a.get("due_date"),
            "status": a.get("status"),
            "overdue": overdue,
        })

    team_workload: List[Dict] = []
    for uid, w in workload_map.items():
        u = user_by_id.get(uid) or {}
        if u.get("role") not in ("super_admin", "platform_admin"):
            continue
        client_ids_owned = sorted(w.get("clients") or [])
        team_workload.append({
            "user_id": uid,
            "name": u.get("name") or u.get("email") or uid,
            "email": u.get("email"),
            "role": u.get("role"),
            "clients": len(client_ids_owned),
            "client_ids": client_ids_owned,
            "past_due": w.get("past_due", 0),
            "due_30d": w.get("due_30d", 0),
            "critical_high": w.get("critical_high", 0),
            "open_actions": w.get("open_actions", 0),
        })
    team_workload.sort(key=lambda t: (-t["past_due"], -t["critical_high"], -t["due_30d"]))

    portfolio = {
        "total_clients": len(rows),
        "clients_requiring_attention": port_action + port_attn,
        "past_due": port_pd,
        "due_30d": port_30,
        "due_31_90d": port_3190,
        "critical_high_open": port_crit,
        "unassigned": port_unassigned,
        "action_required": port_action,
        "needs_attention": port_attn,
        "total_overdue_reviews": sum(r["overdue_reviews"] for r in rows),
        "total_critical_high": sum(r["critical_high_findings"] for r in rows),
        "total_significant_risks": sum(r["significant_risks"] for r in rows),
        "upcoming_reviews_30d": sum(r["upcoming_reviews"] for r in rows),
        "generated_at": now_iso,
    }

    return {
        "clients": rows,
        "portfolio": portfolio,
        "attention_queue": attention_queue,
        "team_workload": team_workload,
    }
