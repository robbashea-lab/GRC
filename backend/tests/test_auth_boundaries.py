import secrets
import unittest
import test_client_dashboard_sources as harness


class AuthBoundaryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp

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
