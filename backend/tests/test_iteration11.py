"""Iteration 11 backend tests: Policies & Governance Documents onboarding flow."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN = {"email": "platform.admin@grc.demo", "password": "Demo@2026"}
ACME_CONTRIB = {"email": "contributor@acme.demo", "password": "Demo@2026"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json()["user"]


@pytest.fixture(scope="module")
def admin_ctx():
    s, u = _login(ADMIN)
    # find Globex/Acme client_ids — platform admin's /api/clients may be scoped;
    # fall back to Acme via contributor user.client_ids if needed.
    r = s.get(f"{BASE_URL}/api/clients", timeout=30)
    clients = r.json() if r.status_code == 200 else []
    if isinstance(clients, dict):
        clients = clients.get("items", [])
    globex = next((c["client_id"] for c in clients if "globex" in (c.get("name") or "").lower()), None)
    acme = next((c["client_id"] for c in clients if "acme" in (c.get("name") or "").lower()), None)
    if not acme:
        # pull from contributor session
        sc, uc = _login(ACME_CONTRIB)
        acme = (uc.get("client_ids") or [None])[0]
    assert globex and acme, f"need Globex+Acme, globex={globex} acme={acme}"
    return {"session": s, "user": u, "globex": globex, "acme": acme}


@pytest.fixture(scope="module")
def contrib_ctx():
    s, u = _login(ACME_CONTRIB)
    return {"session": s, "user": u}


# ---- Policy library ----
def test_policy_library_5_categories_24_items(admin_ctx):
    s = admin_ctx["session"]
    r = s.get(f"{BASE_URL}/api/onboarding/policy-library",
              params={"client_id": admin_ctx["globex"]}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    cats = data["categories"]
    assert len(cats) == 5, f"expected 5 categories, got {len(cats)}: {[c['name'] for c in cats]}"
    names = {c["name"]: len(c["items"]) for c in cats}
    total = sum(names.values())
    assert total == 24, f"expected 24 items, got {total}: {names}"
    # verify each item has category + applicability
    for c in cats:
        for it in c["items"]:
            assert "category" in it and "applicability" in it and "name" in it


# ---- YES / NO / UNSURE / NA ----
def _cleanup_policy(s, client_id, title):
    r = s.get(f"{BASE_URL}/api/policies", params={"client_id": client_id}, timeout=30)
    if r.status_code == 200:
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        for p in items:
            if (p.get("title") or "").strip().lower() == title.strip().lower():
                s.delete(f"{BASE_URL}/api/policies/{p['policy_id']}", timeout=30)
    # cleanup any linked tasks
    r = s.get(f"{BASE_URL}/api/tasks", params={"client_id": client_id}, timeout=30)
    if r.status_code == 200:
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        for t in items:
            if t.get("source") == "GRC Program Onboarding" and t.get("title", "").endswith(title):
                s.delete(f"{BASE_URL}/api/tasks/{t['task_id']}", timeout=30)


def test_response_yes_no_unsure_na_and_metadata_safety(admin_ctx):
    s = admin_ctx["session"]
    cid = admin_ctx["globex"]
    unique = "TEST_iter11 "
    names = {
        "yes":    unique + "YesPolicy",
        "no":     unique + "NoPolicy",
        "unsure": unique + "UnsurePolicy",
        "na":     unique + "NAPolicy",
    }
    # cleanup pre
    for n in names.values():
        _cleanup_policy(s, cid, n)

    # NA WITHOUT rationale should 400
    r = s.post(f"{BASE_URL}/api/onboarding/policy-responses", json={
        "client_id": cid,
        "responses": [{"name": names["na"], "category": "Core Governance", "response": "na"}],
    }, timeout=30)
    assert r.status_code == 400
    assert "rationale" in r.text.lower()

    # submit yes/no/unsure/na(with rationale)
    payload = {
        "client_id": cid,
        "responses": [
            {"name": names["yes"], "category": "Core Governance", "response": "yes", "note": "n"},
            {"name": names["no"], "category": "Core Governance", "response": "no"},
            {"name": names["unsure"], "category": "Core Governance", "response": "unsure"},
            {"name": names["na"], "category": "Core Governance", "response": "na",
             "applicability_rationale": "Not in scope."},
        ],
    }
    r = s.post(f"{BASE_URL}/api/onboarding/policy-responses", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    by_name = {x["name"]: x for x in data["results"]}

    # yes
    y = by_name[names["yes"]]
    assert y["presence"] == "reported_existing"
    assert y["status"] == "needs_verification"
    assert y["task_created"] is None
    # no
    n = by_name[names["no"]]
    assert n["presence"] == "reported_missing"
    assert n["status"] == "needs_creation"
    assert n["task_created"] is not None
    # unsure
    u = by_name[names["unsure"]]
    assert u["presence"] == "needs_confirmation"
    assert u["task_created"] is not None
    # na
    a = by_name[names["na"]]
    assert a["presence"] == "not_applicable"
    assert a["status"] == "not_applicable"
    assert a["task_created"] is None

    # GET policies to verify metadata safety (no version/owner_id/approver_id/approved_at/next_review_date)
    r = s.get(f"{BASE_URL}/api/policies", params={"client_id": cid}, timeout=30)
    pol_list = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    pol_map = {p["title"]: p for p in pol_list}
    for key in ("yes", "no", "unsure", "na"):
        p = pol_map.get(names[key])
        assert p, f"policy {names[key]} not found"
        for forbidden in ("version", "owner_id", "approver_id", "approved_at", "next_review_date"):
            assert p.get(forbidden) in (None, ""), f"{names[key]}.{forbidden}={p.get(forbidden)} must be absent"

    # Verify task titles
    r = s.get(f"{BASE_URL}/api/tasks", params={"client_id": cid}, timeout=30)
    tasks = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    # find tasks linked to no & unsure policies
    no_pol_id = by_name[names["no"]]["policy_id"]
    unsure_pol_id = by_name[names["unsure"]]["policy_id"]
    no_task = next((t for t in tasks if t.get("policy_id") == no_pol_id), None)
    uns_task = next((t for t in tasks if t.get("policy_id") == unsure_pol_id), None)
    assert no_task and no_task["title"].startswith("Develop and approve")
    assert no_task["source"] == "GRC Program Onboarding"
    assert uns_task and uns_task["title"].startswith("Confirm whether")

    # ---- Idempotence: resubmit the same responses ----
    r2 = s.post(f"{BASE_URL}/api/onboarding/policy-responses", json=payload, timeout=30)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["counters"]["policies_created"] == 0, f"expected 0 created, got {d2['counters']}"
    assert d2["counters"]["policies_updated"] == 4
    assert d2["counters"]["tasks_created"] == 0, f"expected 0 new tasks on resubmit, got {d2['counters']}"

    # policies still unique
    r = s.get(f"{BASE_URL}/api/policies", params={"client_id": cid}, timeout=30)
    pol_list = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for key in ("yes", "no", "unsure", "na"):
        matches = [p for p in pol_list if p["title"] == names[key]]
        assert len(matches) == 1, f"duplicate policy for {names[key]}"

    # ---- Verify endpoint (platform admin) ----
    yes_pol_id = by_name[names["yes"]]["policy_id"]
    r = s.post(f"{BASE_URL}/api/policies/{yes_pol_id}/verify",
               json={"version": "1.0", "status": "approved",
                     "approved_at": "2026-01-01T00:00:00+00:00"}, timeout=30)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["presence"] == "verified_existing"
    assert v.get("version") == "1.0"
    assert v.get("verified_by")
    assert v.get("verified_at")

    # cleanup
    for n in names.values():
        _cleanup_policy(s, cid, n)


# ---- Tenant isolation: Acme contributor cannot post responses for Globex ----
def test_tenant_isolation_contributor_cannot_touch_globex(admin_ctx, contrib_ctx):
    s = contrib_ctx["session"]
    globex_id = admin_ctx["globex"]
    r = s.post(f"{BASE_URL}/api/onboarding/policy-responses", json={
        "client_id": globex_id,
        "responses": [{"name": "TEST_iter11 Isolation", "category": "Core Governance",
                       "response": "yes"}],
    }, timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_contributor_cannot_verify(admin_ctx, contrib_ctx):
    # First create a policy under Acme via admin
    s_a = admin_ctx["session"]
    acme = admin_ctx["acme"]
    title = "TEST_iter11 VerifyRBAC Policy"
    _cleanup_policy(s_a, acme, title)
    r = s_a.post(f"{BASE_URL}/api/onboarding/policy-responses", json={
        "client_id": acme,
        "responses": [{"name": title, "category": "Core Governance", "response": "yes"}],
    }, timeout=30)
    assert r.status_code == 200
    pol_id = r.json()["results"][0]["policy_id"]

    # Contributor tries to verify -> 403
    s_c = contrib_ctx["session"]
    r = s_c.post(f"{BASE_URL}/api/policies/{pol_id}/verify", json={"version": "9.9"}, timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    _cleanup_policy(s_a, acme, title)


# ---- Weekly digest regression ----
def test_weekly_digest_regression(admin_ctx):
    r = admin_ctx["session"].post(f"{BASE_URL}/api/reminders/send-weekly-now", timeout=60)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
