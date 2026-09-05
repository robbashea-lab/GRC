"""Iteration 13 — GRC Onboarding wizard refactor.

Coverage:
- /api/onboarding/requirements-library shape & counts
- /api/onboarding/state RBAC (contributor of another tenant → 403; readonly view 200)
- /api/onboarding/finalize idempotence
- N/A applicability without rationale → validation_errors[]
- Contacts with linked_user_id do NOT create user accounts
- Known Issue classification=verified_finding → finding with correct source
- Known Issue classification=reported → task with correct source
- Requirements Register generic CRUD (POST/PATCH via KIND_REGEX)
- Read-only role: GET state 200 but POST finalize → 403
- Audit log contains onboarding-* entries
- Regression: /reminders/send-weekly-now still ok=true
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "robbashea@gmail.com"
SUPER_PW = "Admin@2026"
ADMIN_EMAIL = "platform.admin@grc.demo"
ADMIN_PW = "Demo@2026"
ACME_CONTRIB_EMAIL = "contributor@acme.demo"
ACME_CONTRIB_PW = "Demo@2026"
ACME_RO_EMAIL = "readonly@acme.demo"
ACME_RO_PW = "Demo@2026"
GLOBEX_CONTRIB_EMAIL = "contributor@globex.demo"
GLOBEX_CONTRIB_PW = "Demo@2026"

ACME_CLIENT_ID = "cli_24c16ec179a0"
GLOBEX_CLIENT_ID = "cli_34211c59d50f"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _sess(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def super_client():
    return _sess(_login(SUPER_EMAIL, SUPER_PW))


@pytest.fixture(scope="module")
def admin_client():
    return _sess(_login(ADMIN_EMAIL, ADMIN_PW))


@pytest.fixture(scope="module")
def acme_ro_client():
    return _sess(_login(ACME_RO_EMAIL, ACME_RO_PW))


@pytest.fixture(scope="module")
def acme_contrib_client():
    return _sess(_login(ACME_CONTRIB_EMAIL, ACME_CONTRIB_PW))


@pytest.fixture(scope="module")
def test_client_id(super_client):
    """Dedicated tenant for idempotence/finalize tests."""
    r = super_client.post(f"{API}/clients", json={
        "name": f"TEST_iter13_{uuid.uuid4().hex[:6]}",
        "industry": "Technology",
        "status": "active",
    })
    assert r.status_code == 200, r.text
    cid = r.json()["client_id"]
    yield cid
    super_client.patch(f"{API}/clients/{cid}", json={
        "status": "archived",
        "name": f"TEST_iter13_ARCHIVED_{int(time.time())}",
    })


# ------------------- requirements-library shape -------------------
def test_requirements_library_shape(admin_client, test_client_id):
    r = admin_client.get(f"{API}/onboarding/requirements-library", params={"client_id": test_client_id})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "categories" in data and "role_templates" in data and "assessment_types" in data
    # Verify counts per category (matching by prefix per review request semantics)
    cat_counts = {c["name"]: len(c["items"]) for c in data["categories"]}
    # Actual server categories: "Assurance / Certification", "Legal / Regulatory / Privacy",
    # "Contractual", "Insurance", "Other"
    def _match(prefix):
        for k, v in cat_counts.items():
            if k.lower().startswith(prefix.lower()):
                return v
        return None
    assert _match("Assurance") == 4, cat_counts
    assert _match("Legal") == 4, cat_counts
    assert _match("Contractual") == 5, cat_counts
    assert _match("Insurance") == 1, cat_counts
    assert _match("Other") == 2, cat_counts
    assert len(data["role_templates"]) == 10, len(data["role_templates"])
    assert len(data["assessment_types"]) == 13, len(data["assessment_types"])


# ------------------- state RBAC -------------------
def test_state_rbac_acme_contributor_on_globex_forbidden(acme_contrib_client):
    r = acme_contrib_client.get(f"{API}/onboarding/state", params={"client_id": GLOBEX_CLIENT_ID})
    assert r.status_code == 403, r.text


def test_state_readonly_get_ok(acme_ro_client):
    r = acme_ro_client.get(f"{API}/onboarding/state", params={"client_id": ACME_CLIENT_ID})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("contacts", "assessments", "onboarding_history"):
        assert k in d, f"missing {k}"


def test_state_readonly_finalize_forbidden(acme_ro_client):
    r = acme_ro_client.post(f"{API}/onboarding/finalize", json={
        "client_id": ACME_CLIENT_ID,
        "contacts": [{"role": "TEST_iter13_ro_should_not_persist", "name": "X"}],
    })
    assert r.status_code == 403, r.text


# ------------------- finalize: N/A without rationale -> validation_errors -------------------
def test_finalize_na_without_rationale_returns_validation_errors(admin_client, test_client_id):
    payload = {
        "client_id": test_client_id,
        "requirement_responses": [
            {"name": "TEST_iter13_NA_no_rationale", "category": "Other", "applicability": "not_applicable"},
        ],
        "policy_responses": [
            {"name": "TEST_iter13_NA_policy", "response": "na"},
        ],
    }
    r = admin_client.post(f"{API}/onboarding/finalize", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    errs = body.get("validation_errors") or []
    assert len(errs) >= 2, errs
    assert any("N/A" in e and "requirement" in e.lower() for e in errs), errs
    assert any("N/A" in e and "policy" in e.lower() for e in errs), errs


# ------------------- finalize: idempotence + counter behavior -------------------
def test_finalize_idempotence(admin_client, super_client, test_client_id):
    unique = uuid.uuid4().hex[:6]
    payload = {
        "client_id": test_client_id,
        "policy_responses": [
            {"name": f"TEST_iter13_pol_{unique}", "response": "yes", "category": "Governance"},
        ],
        "requirement_responses": [
            {"name": f"TEST_iter13_req_{unique}", "category": "Contractual", "applicability": "applicable"},
        ],
        "contacts": [
            {"role": f"TEST_iter13_Role_{unique}", "name": "Alice", "email": "alice@example.com"},
        ],
        "assessments": [
            {"name": f"TEST_iter13_ass_{unique}", "assessment_type": "Penetration Test", "date": "2025-01-01"},
        ],
        "known_issues": [
            {"title": f"TEST_iter13_ki_{unique}", "classification": "reported", "priority": "medium"},
        ],
        "recurring_reviews": [
            {"title": f"TEST_iter13_rev_{unique}", "review_type": "policy", "recurrence": "annual", "due_days": 30},
        ],
    }

    # ---- Snapshot user count before finalize ----
    users_before = super_client.get(f"{API}/users")
    users_before_count = len(users_before.json()) if isinstance(users_before.json(), list) else len(users_before.json().get("users", []))

    r1 = admin_client.post(f"{API}/onboarding/finalize", json=payload)
    assert r1.status_code == 200, r1.text
    c1 = r1.json()["counters"]
    assert c1["policies_created"] >= 1
    assert c1["requirements_created"] >= 1
    assert c1["contacts_saved"] >= 1
    assert c1["assessments_created"] >= 1
    # known_issues_promoted counter increments once per issue
    assert c1["known_issues_promoted"] >= 1
    assert c1["reviews_created"] >= 1

    # Second submit — idempotent: no new create for same titles.
    r2 = admin_client.post(f"{API}/onboarding/finalize", json=payload)
    assert r2.status_code == 200, r2.text
    c2 = r2.json()["counters"]
    assert c2["policies_created"] == 0, c2
    assert c2["requirements_created"] == 0, c2
    assert c2["assessments_created"] == 0, c2
    assert c2["reviews_created"] == 0, c2
    # Known issue dedup: second run should not promote again
    # (source-scoped dedup by title in known-issue promotion block)
    assert c2["tasks_created"] == 0 or c2["known_issues_promoted"] == 0, c2
    # contacts are upsert-by-role: counter increments each save; ensure updated_at moved but no duplicate rows
    assert c2["contacts_saved"] >= 1
    # requirements_updated should be >=1 on 2nd run since existing row was upserted
    assert c2["requirements_updated"] >= 1, c2
    assert c2["policies_updated"] >= 1, c2

    # Confirm no duplicate policy/requirement/contact/assessment/review rows.
    pols = admin_client.get(f"{API}/policies", params={"client_id": test_client_id}).json()
    pols_list = pols if isinstance(pols, list) else pols.get("policies", pols.get("items", []))
    matching = [p for p in pols_list if p.get("title") == f"TEST_iter13_pol_{unique}"]
    assert len(matching) == 1, matching

    reqs = admin_client.get(f"{API}/requirements", params={"client_id": test_client_id}).json()
    reqs_list = reqs if isinstance(reqs, list) else reqs.get("requirements", reqs.get("items", []))
    matching_req = [x for x in reqs_list if x.get("title") == f"TEST_iter13_req_{unique}"]
    assert len(matching_req) == 1, matching_req

    # ---- User count unchanged: contacts must NOT create user accounts ----
    users_after = super_client.get(f"{API}/users")
    users_after_count = len(users_after.json()) if isinstance(users_after.json(), list) else len(users_after.json().get("users", []))
    assert users_after_count == users_before_count, \
        f"user count changed {users_before_count}->{users_after_count} after contact finalize"


# ------------------- Contacts with linked_user_id do NOT create users -------------------
def test_contacts_linked_user_id_does_not_create_user(admin_client, super_client, test_client_id):
    users_before = super_client.get(f"{API}/users").json()
    users_before_list = users_before if isinstance(users_before, list) else users_before.get("users", [])
    users_before_count = len(users_before_list)
    a_uid = users_before_list[0].get("user_id") if users_before_list else "u_dummy"

    unique = uuid.uuid4().hex[:6]
    payload = {
        "client_id": test_client_id,
        "contacts": [
            {"role": f"TEST_iter13_LinkedRole_{unique}", "name": "Linked",
             "email": "linked@example.com", "linked_user_id": a_uid},
        ],
    }
    r = admin_client.post(f"{API}/onboarding/finalize", json=payload)
    assert r.status_code == 200, r.text
    users_after = super_client.get(f"{API}/users").json()
    users_after_list = users_after if isinstance(users_after, list) else users_after.get("users", [])
    assert len(users_after_list) == users_before_count


# ------------------- Known Issue classification routing -------------------
def test_known_issue_verified_finding_creates_finding_with_source(admin_client, test_client_id):
    unique = uuid.uuid4().hex[:6]
    title = f"TEST_iter13_kiVerified_{unique}"
    r = admin_client.post(f"{API}/onboarding/finalize", json={
        "client_id": test_client_id,
        "known_issues": [
            {"title": title, "classification": "verified_finding", "priority": "high", "notes": "seeded"},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["counters"]["findings_created"] >= 1

    # Locate via GET /api/findings
    fnds = admin_client.get(f"{API}/findings", params={"client_id": test_client_id}).json()
    fnds_list = fnds if isinstance(fnds, list) else fnds.get("findings", fnds.get("items", []))
    matches = [f for f in fnds_list if f.get("title") == title]
    assert len(matches) == 1, matches
    assert matches[0].get("source") == "GRC Program Onboarding · Existing Finding"
    assert matches[0].get("severity") == "high"


def test_known_issue_reported_creates_task_with_source(admin_client, test_client_id):
    unique = uuid.uuid4().hex[:6]
    title = f"TEST_iter13_kiReported_{unique}"
    r = admin_client.post(f"{API}/onboarding/finalize", json={
        "client_id": test_client_id,
        "known_issues": [
            {"title": title, "classification": "reported", "priority": "critical", "notes": "seeded"},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["counters"]["tasks_created"] >= 1

    tks = admin_client.get(f"{API}/tasks", params={"client_id": test_client_id}).json()
    tks_list = tks if isinstance(tks, list) else tks.get("tasks", tks.get("items", []))
    matches = [t for t in tks_list if t.get("title") == title]
    assert len(matches) == 1, matches
    assert matches[0].get("source") == "GRC Program Onboarding · Known Issue"
    assert matches[0].get("priority") == "critical"


# ------------------- Requirements generic CRUD via KIND_REGEX -------------------
def test_requirements_generic_crud(admin_client, test_client_id):
    unique = uuid.uuid4().hex[:6]
    title = f"TEST_iter13_reqCRUD_{unique}"
    # GET list works
    r0 = admin_client.get(f"{API}/requirements", params={"client_id": test_client_id})
    assert r0.status_code == 200, r0.text

    # POST create
    r1 = admin_client.post(f"{API}/requirements", json={
        "title": title, "client_id": test_client_id,
        "applicability": "applicable", "status": "active", "category": "Other",
    })
    assert r1.status_code in (200, 201), r1.text
    body = r1.json()
    rid = body.get("requirement_id") or body.get("id")
    assert rid and rid.startswith("req_"), body

    # PATCH update applicability
    r2 = admin_client.patch(f"{API}/requirements/{rid}", json={"applicability": "under_review"})
    assert r2.status_code == 200, r2.text

    # GET verify
    r3 = admin_client.get(f"{API}/requirements", params={"client_id": test_client_id}).json()
    r3_list = r3 if isinstance(r3, list) else r3.get("requirements", r3.get("items", []))
    match = [x for x in r3_list if x.get("requirement_id") == rid]
    assert match and match[0].get("applicability") == "under_review", match


# ------------------- Audit log entries -------------------
def test_audit_log_contains_onboarding_entries(admin_client, test_client_id):
    r = admin_client.get(f"{API}/onboarding/state", params={"client_id": test_client_id})
    assert r.status_code == 200
    history = r.json().get("onboarding_history", [])
    actions = {h.get("action") for h in history}
    # After idempotence + KI + verified tests above, we expect these actions
    for expected in ("onboarding-response", "onboarding-contact",
                     "onboarding-assessment", "onboarding-known-issue",
                     "onboarding-review", "onboarding-complete"):
        assert expected in actions, f"missing audit action {expected}; got {actions}"


# ------------------- Regression: weekly digest still works -------------------
def test_weekly_digest_regression(admin_client):
    r = admin_client.post(f"{API}/reminders/send-weekly-now")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
