"""Iteration 10 - Vendor Schedule Review + Assurance Alerts + Weekly Digest vendor bucket."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta


def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip().rstrip("/")
    return ""


BASE = _load_base()
API = f"{BASE}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, data.get("user") or data


@pytest.fixture(scope="module")
def admin():
    s, me = _login(os.environ.get("GRC_TEST_PLATFORM_EMAIL", "platform-admin@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
    return {"s": s, "me": me}


@pytest.fixture(scope="module")
def acme_client_id(admin):
    r = admin["s"].get(f"{API}/clients", timeout=20)
    assert r.status_code == 200
    for c in r.json():
        if "acme" in (c.get("name") or "").lower():
            return c["client_id"]
    return r.json()[0]["client_id"]


@pytest.fixture(scope="module")
def test_vendor(admin, acme_client_id):
    s = admin["s"]
    payload = {
        "name": "TEST_iter10 Vendor Assurance",
        "client_id": acme_client_id,
        "criticality": "high",
        "assurance_status": "current",
        "review_frequency": "annual",
        "data_types": ["pii"],
    }
    r = s.post(f"{API}/vendors", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"vendor create failed: {r.status_code} {r.text}"
    v = r.json()
    vendor_id = v.get("vendor_id") or v.get("id")
    assert vendor_id
    yield {"vendor_id": vendor_id, "client_id": acme_client_id, "doc": v}
    # cleanup
    try:
        s.delete(f"{API}/vendors/{vendor_id}", timeout=20)
    except Exception:
        pass


# --- Vendor Schedule Review ---
class TestVendorScheduleReview:
    def test_schedule_review_creates_review_and_updates_vendor(self, admin, test_vendor):
        s = admin["s"]
        vid = test_vendor["vendor_id"]
        due = (datetime.now(timezone.utc) + timedelta(days=45)).date().isoformat()
        r = s.post(f"{API}/vendors/{vid}/schedule-review", json={"due_date": due}, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        # Response may be the doc or an ok wrapper — check either
        review_id = None
        if isinstance(data, dict):
            review_id = data.get("review_id") or (data.get("review") or {}).get("review_id")
            rtype = data.get("review_type") or (data.get("review") or {}).get("review_type")
            if rtype:
                assert rtype == "vendor"
        # Confirm review is in /reviews
        rlist = s.get(f"{API}/reviews", params={"client_id": test_vendor["client_id"]}, timeout=20)
        assert rlist.status_code == 200
        reviews = rlist.json()
        vendor_reviews = [rv for rv in reviews if rv.get("vendor_id") == vid]
        assert len(vendor_reviews) >= 1, "No vendor review found in /reviews"
        rv = vendor_reviews[0]
        assert rv.get("review_type") == "vendor"
        assert rv.get("client_id") == test_vendor["client_id"]
        assert rv.get("status") == "upcoming"

        # Verify vendor.next_review updated (via list endpoint)
        vl = s.get(f"{API}/vendors", params={"client_id": test_vendor["client_id"]}, timeout=20)
        assert vl.status_code == 200
        vdoc = next((v for v in vl.json() if v.get("vendor_id") == vid), None)
        assert vdoc, "vendor not in list"
        assert vdoc.get("next_review"), "vendor.next_review not set"
        assert due in vdoc.get("next_review")

    def test_schedule_review_404_for_unknown_vendor(self, admin):
        r = admin["s"].post(f"{API}/vendors/does-not-exist/schedule-review", json={}, timeout=20)
        assert r.status_code == 404


# --- Dashboard assurance_alerts ---
class TestDashboardAssuranceAlerts:
    def test_dashboard_returns_assurance_alerts_when_vendor_flagged(self, admin, test_vendor, acme_client_id):
        s = admin["s"]
        vid = test_vendor["vendor_id"]
        # Flag as expiring
        pr = s.patch(f"{API}/vendors/{vid}", json={"assurance_status": "expiring",
                                                    "assurance_expires_at": (datetime.now(timezone.utc) + timedelta(days=15)).date().isoformat()},
                     timeout=20)
        assert pr.status_code == 200, f"patch failed {pr.status_code} {pr.text}"

        r = s.get(f"{API}/dashboard", params={"client_id": acme_client_id}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "assurance_alerts" in data, "dashboard missing assurance_alerts key"
        alerts = data["assurance_alerts"]
        assert isinstance(alerts, list)
        assert any(a.get("vendor_id") == vid for a in alerts), f"flagged vendor {vid} not in assurance_alerts"


# --- Weekly digest ---
class TestWeeklyDigest:
    def test_send_weekly_now_ok(self, admin):
        r = admin["s"].post(f"{API}/reminders/send-weekly-now", timeout=45)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        stats = data.get("stats") or {}
        assert stats.get("emails_sent", -1) >= 0


# --- Regression: risk create computes score+level; vendor create persists data_types ---
class TestRegressionCreate:
    def test_risk_create_computes_score_and_level(self, admin, acme_client_id):
        s = admin["s"]
        payload = {
            "title": "TEST_iter10 risk",
            "client_id": acme_client_id,
            "likelihood_score": 4,
            "impact_score": 5,
            "category": "operational",
        }
        r = s.post(f"{API}/risks", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        d = r.json()
        rid = d.get("risk_id") or d.get("id")
        assert rid
        # Score should be 4*5=20 and level high/critical
        score = d.get("risk_score")
        level = d.get("risk_level")
        assert score == 20, f"expected 20 got {score}"
        assert level in ("critical", "high"), f"unexpected level {level}"
        s.delete(f"{API}/risks/{rid}", timeout=20)

    def test_vendor_create_persists_data_types(self, admin, acme_client_id):
        s = admin["s"]
        payload = {
            "name": "TEST_iter10 vendor dt",
            "client_id": acme_client_id,
            "data_types": ["pii", "phi"],
        }
        r = s.post(f"{API}/vendors", json=payload, timeout=20)
        assert r.status_code in (200, 201)
        d = r.json()
        vid = d.get("vendor_id") or d.get("id")
        assert set(d.get("data_types") or []) >= {"pii", "phi"}
        vl = s.get(f"{API}/vendors", params={"client_id": acme_client_id}, timeout=20)
        assert vl.status_code == 200
        gv = next((x for x in vl.json() if x.get("vendor_id") == vid), None)
        assert gv and set(gv.get("data_types") or []) >= {"pii", "phi"}
        s.delete(f"{API}/vendors/{vid}", timeout=20)
