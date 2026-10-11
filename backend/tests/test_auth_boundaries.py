import base64
import secrets
import unittest
from datetime import datetime, timedelta, timezone
import test_client_dashboard_sources as harness


class OpaqueSessionFenceTests(unittest.TestCase):
    """Pure timestamp decisions: no requests, credentials, recovery or database."""

    def test_older_and_equal_session_rows_are_denied_for_each_account_fence(self):
        fence = datetime(2026, 10, 11, 12, tzinfo=timezone.utc)
        for field in ('password_changed_at', 'sessions_revoked_at'):
            for offset in (-1, 0, 1):
                with self.subTest(field=field, offset=offset):
                    session = {'created_at': (fence + timedelta(seconds=offset)).isoformat()}
                    self.assertEqual(harness.server._opaque_session_is_current(
                        session, {field: fence.isoformat()}), offset > 0)

    def test_existing_sessions_without_account_revocation_remain_compatible(self):
        self.assertTrue(harness.server._opaque_session_is_current({}, {}))
        self.assertTrue(harness.server._opaque_session_is_current(
            {'created_at': '2026-10-11T12:00:00+00:00'},
            {'password_changed_at': None, 'sessions_revoked_at': None}))

    def test_both_fences_and_timezone_representations_are_respected(self):
        account = {'password_changed_at': '2026-10-11T12:00:00+00:00',
                   'sessions_revoked_at': datetime(2026, 10, 11, 12, 1)}
        self.assertFalse(harness.server._opaque_session_is_current(
            {'created_at': '2026-10-11T08:00:30-04:00'}, account))
        self.assertTrue(harness.server._opaque_session_is_current(
            {'created_at': datetime(2026, 10, 11, 12, 2, tzinfo=timezone.utc)}, account))

    def test_unverifiable_timestamp_cannot_cross_an_existing_fence(self):
        for field in ('password_changed_at', 'sessions_revoked_at'):
            for value in (None, '', 'invalid', 42, [], {}):
                with self.subTest(field=field, created=value):
                    self.assertFalse(harness.server._opaque_session_is_current(
                        {'created_at': value}, {field: '2026-10-11T12:00:00+00:00'}))
                if value is not None:
                    with self.subTest(field=field, fence=value):
                        self.assertFalse(harness.server._opaque_session_is_current(
                            {'created_at': '2026-10-11T12:00:01+00:00'}, {field: value}))


class AuthBoundaryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp

    async def test_deeply_nested_unsigned_header_is_rejected_as_unauthenticated(self):
        header = base64.urlsafe_b64encode(b'[' * 1200).rstrip(b'=').decode()
        response = await self.client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + header + '.e30.eA'})
        self.assertEqual(response.status_code, 401, response.text)

    async def test_registration_rejects_empty_short_and_bcrypt_overflow_without_creating_account(self):
        for value in ["", "x"*7, "é"*7, "x"*73, "é"*37]:
            response=await self.client.post("/api/auth/register",json={
                "email":"boundary@example.com","name":"Boundary QA","password":value})
            self.assertEqual(response.status_code,422,response.text)
        self.assertIsNone(await harness.server.db.users.find_one({"email":"boundary@example.com"}))

    async def test_generated_credential_uses_normal_auth_and_has_no_client_access(self):
        password=secrets.token_urlsafe(24)
        result=await self.client.post("/api/auth/register",json={"email":"QA-BOUNDARY@example.com","name":"Boundary QA","password":password})
        self.assertEqual(result.status_code,200,result.text)
        self.assertNotIn("password_hash",result.json()["user"])
        self.assertEqual(result.json()["user"]["role"],"client_readonly")
        self.client.cookies.clear()
        login=await self.client.post("/api/auth/login",json={"email":"QA-BOUNDARY@EXAMPLE.COM","password":password})
        self.assertEqual(login.status_code,200,login.text)
        self.client.headers["Authorization"]="Bearer "+login.json()["access_token"]
        self.assertEqual((await self.client.get("/api/clients")).json(),[])
        self.assertEqual((await self.client.post("/api/clients",json={"name":"Not permitted"})).status_code,403)
        for bad in ["",secrets.token_urlsafe(24),"x"*73]:
            self.assertEqual((await self.client.post("/api/auth/login",json={"email":"qa-boundary@example.com","password":bad})).status_code,401)
