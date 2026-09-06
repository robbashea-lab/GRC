"""Iteration 18 — Quick Client Access / Favorites endpoints."""
import os
import requests
import pytest
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def super_session():
    return _login(os.environ.get("GRC_TEST_ADMIN_EMAIL", "admin@example.test"), os.environ.get("GRC_TEST_ADMIN_PASSWORD", "TEST_ONLY_ADMIN_PASSWORD"))


@pytest.fixture(scope="module")
def contributor_session():
    return _login(os.environ.get("GRC_TEST_GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


@pytest.fixture(scope="module")
def globex_client_id(super_session):
    r = super_session.get(f"{API}/clients", timeout=30)
    assert r.status_code == 200
    clients = r.json()
    # Filter to non-archived
    g = next((c for c in clients if "globex" in (c.get("name") or "").lower()
              and c.get("status") != "archived"), None)
    assert g, f"Globex client not found. clients={[c.get('name') for c in clients]}"
    return g["client_id"]


class TestFavoritesSuperAdmin:
    def test_add_favorite(self, super_session, globex_client_id):
        r = super_session.post(f"{API}/me/favorites/{globex_client_id}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert globex_client_id in data["favorite_client_ids"]

    def test_add_favorite_idempotent(self, super_session, globex_client_id):
        r = super_session.post(f"{API}/me/favorites/{globex_client_id}", timeout=30)
        assert r.status_code == 200
        favs = r.json()["favorite_client_ids"]
        assert favs.count(globex_client_id) == 1, f"Not idempotent: {favs}"

    def test_auth_me_reflects_favorite(self, super_session, globex_client_id):
        r = super_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        user = r.json()
        assert globex_client_id in (user.get("favorite_client_ids") or [])

    def test_delete_favorite(self, super_session, globex_client_id):
        r = super_session.delete(f"{API}/me/favorites/{globex_client_id}", timeout=30)
        assert r.status_code == 200
        assert globex_client_id not in r.json()["favorite_client_ids"]

    def test_auth_me_reflects_deletion(self, super_session, globex_client_id):
        r = super_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert globex_client_id not in (r.json().get("favorite_client_ids") or [])


class TestFavoritesAuthorization:
    def test_bogus_client_id_returns_403(self, super_session):
        r = super_session.post(f"{API}/me/favorites/nonexistent-client-xyz", timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_contributor_cannot_favorite_bogus(self, contributor_session):
        r = contributor_session.post(f"{API}/me/favorites/nonexistent-client-xyz", timeout=30)
        assert r.status_code == 403
        # Verify not persisted
        me = contributor_session.get(f"{API}/auth/me", timeout=30).json()
        assert "nonexistent-client-xyz" not in (me.get("favorite_client_ids") or [])

    def test_contributor_can_favorite_own_tenant(self, contributor_session, super_session, globex_client_id):
        # contributor@globex should be authorized for globex
        r = contributor_session.post(f"{API}/me/favorites/{globex_client_id}", timeout=30)
        assert r.status_code == 200, r.text
        assert globex_client_id in r.json()["favorite_client_ids"]
        # cleanup
        contributor_session.delete(f"{API}/me/favorites/{globex_client_id}", timeout=30)


class TestPreferencesFilter:
    def test_patch_preferences_filters_unauthorized(self, super_session, globex_client_id):
        payload = {"favorite_client_ids": [globex_client_id, "bogus-xyz-123"]}
        r = super_session.patch(f"{API}/me/preferences", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        favs = data["user"]["favorite_client_ids"]
        assert globex_client_id in favs
        assert "bogus-xyz-123" not in favs

    def test_auth_me_after_patch(self, super_session, globex_client_id):
        r = super_session.get(f"{API}/auth/me", timeout=30)
        favs = r.json().get("favorite_client_ids") or []
        assert globex_client_id in favs
        assert "bogus-xyz-123" not in favs

    def test_cleanup(self, super_session):
        # Clear favorites
        r = super_session.patch(f"{API}/me/preferences", json={"favorite_client_ids": []}, timeout=30)
        assert r.status_code == 200


class TestAuthMeShape:
    def test_auth_me_has_favorite_field_or_empty(self, super_session):
        r = super_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        user = r.json()
        favs = user.get("favorite_client_ids")
        assert favs is None or isinstance(favs, list)
