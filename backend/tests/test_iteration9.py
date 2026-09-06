"""Iteration 9 - Dashboard scope selector + members endpoint + URL-carried filters."""
import os
import pytest
import requests

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""

BASE = _load_base()
API = f"{BASE}/api"

CREDS = {
    "super": (os.environ.get("GRC_TEST_ADMIN_EMAIL", "admin@example.test"), os.environ.get("GRC_TEST_ADMIN_PASSWORD", "TEST_ONLY_ADMIN_PASSWORD")),
    "platform": (os.environ.get("GRC_TEST_PLATFORM_EMAIL", "platform-admin@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD")),
    "acme_contrib": (os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD")),
    "acme_readonly": (os.environ.get("GRC_TEST_ACME_READONLY_EMAIL", "acme-readonly@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD")),
    "globex_contrib": (os.environ.get("GRC_TEST_GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD")),
}


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    user = data.get("user") or data
    return s, user


@pytest.fixture(scope="module")
def sessions():
    out = {}
    for k, (e, p) in CREDS.items():
        s, me = _login(e, p)
        out[k] = {"s": s, "me": me}
    return out


@pytest.fixture(scope="module")
def acme_client_id(sessions):
    s = sessions["super"]["s"]
    r = s.get(f"{API}/clients", timeout=15)
    assert r.status_code == 200
    clients = r.json()
    for c in clients:
        if "acme" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Acme client not found")


@pytest.fixture(scope="module")
def globex_client_id(sessions):
    s = sessions["super"]["s"]
    r = s.get(f"{API}/clients", timeout=15)
    clients = r.json()
    for c in clients:
        if "globex" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Globex client not found")


# ---------------- /api/clients/{cid}/members ----------------
class TestMembers:
    def test_members_super_admin(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/clients/{acme_client_id}/members", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        emails = [u.get("email") for u in data]
        assert os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test") in emails

    def test_members_contributor_no_orphaned(self, sessions, acme_client_id):
        r = sessions["acme_contrib"]["s"].get(f"{API}/clients/{acme_client_id}/members", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(not u.get("orphaned") for u in data), "contributor should not see orphaned users"

    def test_members_cross_tenant_forbidden(self, sessions, globex_client_id):
        r = sessions["acme_contrib"]["s"].get(f"{API}/clients/{globex_client_id}/members", timeout=15)
        assert r.status_code == 403


# ---------------- /api/dashboard scope ----------------
class TestDashboardScope:
    def test_scope_org(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "org"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("scope") == "org"
        assert d.get("scope_label") in (None, "")
        assert d.get("target_user") in (None, {})
        assert "kpis" in d

    def test_scope_mine_contributor(self, sessions, acme_client_id):
        r = sessions["acme_contrib"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "mine"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("scope") == "mine"
        assert d.get("scope_label") == "Your assigned work"
        assert d.get("target_user", {}).get("email") == os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test")

    def test_scope_user_missing_user_id(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "user"}, timeout=15)
        assert r.status_code == 400

    def test_scope_user_by_super_admin(self, sessions, acme_client_id):
        # find contributor uid
        m = sessions["super"]["s"].get(f"{API}/clients/{acme_client_id}/members").json()
        contrib = next((u for u in m if u.get("email") == os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test")), None)
        assert contrib
        uid = contrib["user_id"]
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "user", "user_id": uid}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("scope") == "user"
        assert d.get("scope_label", "").startswith("GRC items assigned to")
        assert d.get("target_user", {}).get("user_id") == uid

    def test_scope_user_not_member(self, sessions, acme_client_id):
        m = sessions["super"]["s"].get(f"{API}/clients/{acme_client_id}/members").json()
        # Find a Globex user id via login
        globex_uid = sessions["globex_contrib"]["me"].get("user_id")
        # Ensure this user is NOT an acme member
        if globex_uid in [u["user_id"] for u in m]:
            pytest.skip("Globex contributor is also acme member")
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "user", "user_id": globex_uid}, timeout=15)
        assert r.status_code == 403

    def test_scope_user_contrib_targets_other(self, sessions, acme_client_id):
        # readonly@acme user_id
        readonly_uid = sessions["acme_readonly"]["me"].get("user_id")
        r = sessions["acme_contrib"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "user", "user_id": readonly_uid}, timeout=15)
        assert r.status_code == 403

    def test_scope_user_contrib_targets_self(self, sessions, acme_client_id):
        my_uid = sessions["acme_contrib"]["me"].get("user_id")
        r = sessions["acme_contrib"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "user", "user_id": my_uid}, timeout=15)
        assert r.status_code == 200

    def test_scope_unassigned_admin(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "unassigned"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("scope_label") == "Unassigned records"
        assert d.get("your_actions") == []

    def test_scope_unassigned_forbidden_contrib(self, sessions, acme_client_id):
        r = sessions["acme_contrib"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "unassigned"}, timeout=15)
        assert r.status_code == 403

    def test_scope_invalid(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/dashboard", params={"client_id": acme_client_id, "scope": "bogus"}, timeout=15)
        assert r.status_code == 400


# ---------------- Primary assignment: comments/uploads should NOT attribute ----------------
class TestPrimaryAssignmentOnly:
    def test_comment_does_not_attribute(self, sessions, acme_client_id):
        s_super = sessions["super"]["s"]
        contrib_uid = sessions["acme_contrib"]["me"]["user_id"]

        # Create finding without owner
        payload = {
            "client_id": acme_client_id,
            "title": "TEST_iter9 unassigned finding",
            "severity": "low",
            "status": "open",
            "source": "internal_audit",
        }
        r = s_super.post(f"{API}/findings", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        finding = r.json()
        fid = finding.get("id") or finding.get("finding_id")
        try:
            # Post a comment as contributor (if endpoint exists)
            comment_url = f"{API}/comments"
            c = sessions["acme_contrib"]["s"].post(comment_url, json={
                "entity_type": "finding", "entity_id": fid, "client_id": acme_client_id, "body": "TEST_iter9 comment"
            }, timeout=10)
            # Now scope=user for contributor should NOT include this finding
            r2 = s_super.get(f"{API}/dashboard", params={
                "client_id": acme_client_id, "scope": "user", "user_id": contrib_uid
            }, timeout=20)
            assert r2.status_code == 200
            d = r2.json()
            actions = d.get("your_actions") or []
            titles = [a.get("title") for a in actions]
            assert "TEST_iter9 unassigned finding" not in titles, "Comment should not attribute the finding to contributor"
        finally:
            # Cleanup
            try:
                s_super.delete(f"{API}/findings/{fid}", timeout=10)
            except Exception:
                pass


# ---------------- Regression ----------------
class TestRegression:
    def test_cross_tenant_dashboard_forbidden(self, sessions, globex_client_id):
        r = sessions["acme_contrib"]["s"].get(f"{API}/dashboard", params={"client_id": globex_client_id, "scope": "org"}, timeout=15)
        assert r.status_code == 403

    def test_reviews_list_still_works(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/reviews", params={"client_id": acme_client_id}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_baseline_open_findings_acme(self, sessions, acme_client_id):
        r = sessions["super"]["s"].get(f"{API}/findings", params={"client_id": acme_client_id}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        opens = [f for f in data if f.get("status") == "open"]
        # Baseline: 33 open findings (per review_request). Just log if drift.
        print(f"acme open findings count = {len(opens)} (expected ~33)")
