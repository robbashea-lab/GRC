"""Tenant-authorized portfolio projection; full metrics precede the Top 15 queue."""
from datetime import datetime, timezone
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from management_obligations import METRICS, calendar_day, load_records, management_model, owner_ids, portfolio_item, program_status
from grc_rules import represented_finding
from client_relationships import project
import portfolio_overview
from server import db, get_current_user

router = APIRouter(prefix="/api", tags=["portfolio"])

@router.get("/clients/directory")
async def clients_directory(include_archived: bool = Query(False), user: Dict = Depends(get_current_user)):
    role = user.get("role")
    if role not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Client directory is restricted to internal admins")
    query = {} if include_archived else {"status": {"$ne": "archived"}}
    if role == "platform_admin" and user.get("client_ids"):
        query["client_id"] = {"$in": user["client_ids"]}
    clients = await db.clients.find(query, {"_id": 0}).to_list(None)
    clients = await project(db, clients)
    client_ids = [c["client_id"] for c in clients]
    now = datetime.now(timezone.utc).isoformat()
    today, day = now[:10], calendar_day(now)
    source = await load_records(db, {"client_id": {"$in": client_ids}})
    referenced_users = {uid for kind, records in source.items() for record in records for uid in owner_ids(record, kind)}
    referenced_users.update(c['assigned_owner_id'] for c in clients if c.get('assigned_owner_id'))
    members = await db.users.find({'user_id': {'$in': list(referenced_users)}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}).to_list(None)
    names = {u["user_id"]: u for u in members}
    latest = await portfolio_overview.latest_activity(db, client_ids, now)
    grouped = {cid: {kind: [] for kind in source} for cid in client_ids}
    for kind, values in source.items():
        for record in values:
            grouped[record['client_id']][kind].append(record)
    metric_items = {k: [] for k in METRICS}
    attention, rows, workloads = [], [], {}
    for c in clients:
        cid = c["client_id"]
        records = grouped[cid]
        m = management_model(records, cid, today=today, members=members)
        items = {k: [portfolio_item(r, c, today) for r in m["metrics"][k]] for k in METRICS}
        extra = portfolio_overview.populations(m)
        items.update({k: [portfolio_item(r, c, today) for r in values] for k, values in extra.items()})
        active = c.get("status") not in ("archived", "inactive")
        if active:
            for key in METRICS:
                metric_items[key].extend(items[key])
            current = [r for r in m["work"] if r["day"] is not None and r["day"] <= day+30 or r["unassigned"] or r["status"] == "remediated" or r["kind"] == "reviews" and r["day"] is None]
            issues = [r for r in m['metrics']['critical_high_open'] if r['kind'] != 'findings' or not represented_finding(r['record'], m['activeRecords']['tasks'])]
            current += issues + m["metrics"]["unassigned"] + [r for r in m["risks"] if r["status"] != "accepted" and not r["severity"]]
            attention.extend({(r["kind"], r["id"]): portfolio_item(r, c, today) for r in current}.values())
            def workload(uid):
                return workloads.setdefault(uid, {"user_id": uid, "client_ids": set(), "past_due": 0, "due_30d": 0, "critical_high": 0, "open_actions": 0})
            if c.get("assigned_owner_id"):
                workload(c["assigned_owner_id"])["client_ids"].add(cid)
            for key, target in [("past_due", "past_due"), ("due_30d", "due_30d"), ("critical_high_open", "critical_high")]:
                for item in m["metrics"][key]:
                    if item["owner_id"]:
                        w = workload(item["owner_id"])
                        w[target] += 1
                        w["client_ids"].add(cid)
            for t in m["activeRecords"]["tasks"]:
                uid = t.get("assignee_id") or t.get("owner_id")
                if uid and not t.get("finding_id"):
                    workload(uid)["open_actions"] += 1
                    workload(uid)["client_ids"].add(cid)
        major = sorted([r for r in m["work"] if r["kind"] == "reviews" and r["day"] is not None and r["day"] >= day and r["record"].get("review_type") in ("risk", "risk_assessment", "vendor", "policy", "access", "penetration_test", "bcp_dr", "incident_response", "awareness")], key=lambda r: r["day"])
        activity = latest.get(cid)
        rows.append({**c, "client_status": c.get("status", "active"), "program_status": program_status(c, m),
            "grc_lead_id": c.get("assigned_owner_id"),
            **m["counts"], "metric_items": items, "critical_high_issues": len(extra['critical_high_issues']),
            "frameworks": portfolio_overview.frameworks(c, records['requirements']),
            "next_major_item": {**portfolio_item(major[0], c, today), "review_id": major[0]["id"], "review_type": major[0]["record"].get("review_type")} if major else None,
            "open_actions": m["counts"]["past_due"] + m["counts"]["due_30d"],
            "open_findings": len(m["activeRecords"]["findings"]), "significant_risks": len(m["significantRisks"]),
            "critical_high_findings": len(m["materialFindings"]),
            "overdue_reviews": sum(r["kind"] == "reviews" for r in m["metrics"]["past_due"]),
            "upcoming_reviews": sum(r["kind"] == "reviews" for r in m["metrics"]["due_30d"]),
            "last_activity": activity})
    active = [r for r in rows if r["client_status"] not in ("archived", "inactive")]
    action = sum(r["program_status"] == "action_required" for r in active)
    needs = sum(r["program_status"] == "needs_attention" for r in active)
    rows.sort(key=portfolio_overview.attention_order)
    def rank(r):
        return (0 if r["overdue"] else 1) if r["priority"] == "critical" else 2 if r["priority"] == "high" and r["overdue"] else 3 if r["overdue"] else 4 if r["priority"] == "high" else 5
    attention.sort(key=lambda r: (rank(r), r["due_date"] or "9999", r["key"]))
    team = []
    for uid, w in workloads.items():
        u = names.get(uid, {})
        if u.get("role") in ("super_admin", "platform_admin"):
            team.append({**w, "client_ids": sorted(w["client_ids"]), "clients": len(w["client_ids"]),
                         "name": u.get("name") or u.get("email") or uid, "email": u.get("email"), "role": u["role"]})
    team.sort(key=lambda w: (-w["past_due"], -w["critical_high"], -w["due_30d"]))
    return {"clients": rows, "metric_items": metric_items, "attention_queue": attention[:15], "team_workload": team,
            "portfolio": {**{k: len(metric_items[k]) for k in METRICS}, "total_clients": len(rows),
                "clients_requiring_attention": action+needs, "action_required": action, "needs_attention": needs,
                "total_overdue_reviews": sum(r["overdue_reviews"] for r in active),
                "total_critical_high": sum(r["critical_high_findings"] for r in active),
                "total_significant_risks": sum(r["significant_risks"] for r in active),
                "upcoming_reviews_30d": sum(r["upcoming_reviews"] for r in active),
                "generated_at": now, "as_of": today}}
