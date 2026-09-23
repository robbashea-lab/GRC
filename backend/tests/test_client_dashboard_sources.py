"""Exercise real tenant-authorized routes against an isolated in-memory database."""
import os
import json
from pathlib import Path
import secrets
import sys
import unittest
import uuid
from unittest.mock import patch

import httpx
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
with patch("dotenv.load_dotenv", return_value=False), \
     patch("motor.motor_asyncio.AsyncIOMotorClient", AsyncMongoMockClient), \
     patch.dict(os.environ, {"MONGO_URL": "mongodb://unused", "DB_NAME": "dashboard_test"}):
    import server


class ClientDashboardSourcesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.database = patch.object(server, "db", AsyncMongoMockClient()["dashboard_sources"])
        self.database.start()
        self.addCleanup(self.database.stop)
        self.env = patch.dict(os.environ, {"JWT_SECRET": secrets.token_urlsafe(48)})
        self.env.start()
        self.addCleanup(self.env.stop)
        for uid, role, clients in [("admin", "super_admin", ["a", "b"]), ("member", "client_contributor", ["a"])]:
            await server.db.users.insert_one({"user_id": uid, "email": uid + "@example.test", "name": uid, "role": role, "client_ids": clients, "status": "active"})
        await server.db.clients.insert_many([{"client_id": "a", "name": "Populated", "status": "active"}, {"client_id": "b", "name": "Minimal", "status": "active"}])
        async def identify_create(request):
            # Each test POST is a distinct intent unless the scenario explicitly
            # supplies a repeated key. Match the frontend transport contract.
            if request.method == "POST" and request.url.path.removeprefix('/api/') in {*server.ENTITY_MAP, 'clients', 'evidence', 'ai_systems'}:
                request.headers.setdefault('Idempotency-Key', uuid.uuid4().hex)
            # Existing workflow tests represent fresh editors. Conflict tests
            # explicitly retain an older token; missing-token tests disable this
            # fixture hook. Never do this read-before-write substitution in UI.
            parts=request.url.path.removeprefix('/api/').split('/')
            if request.method=='POST' and (parts==['ai-intake'] or len(parts)==3 and parts[0]=='contacts' and parts[2]=='account-link'):
                data=json.loads(request.content)
                field='updated_at' if parts==['ai-intake'] else 'linked_user_id'
                row=await server.db.ai_intake.find_one({'client_id':data.get('client_id')}) if parts==['ai-intake'] else await server.db.contacts.find_one({'contact_id':parts[1]})
                data.setdefault('expected_'+field,(row or {}).get(field))
                request._content=json.dumps(data).encode()
                request.stream=httpx.ByteStream(request._content)
                request.headers['Content-Length']=str(len(request._content))
                request.headers['Content-Type']='application/json'
            if (request.method=='PATCH' and (len(parts)==2 or len(parts)==3 and parts[0]=='users' and parts[2]=='client-memberships') and parts[0] in {*server.ENTITY_MAP,'clients','ai_systems','framework_assessments','users'}) or (request.method=='DELETE' and len(parts)==2 and parts[0] in server.ENTITY_MAP):
                kind,identity=parts[:2]
                id_field=server.ENTITY_MAP[kind][2] if kind in server.ENTITY_MAP else {'clients':'client_id','ai_systems':'ai_system_id','framework_assessments':'framework_assessment_id','users':'user_id'}[kind]
                row=await server.db[kind].find_one({id_field:identity}) or {}
                field='last_assessed' if kind=='framework_assessments' else 'updated_at'
                data=json.loads(request.content or b'{}')
                data.setdefault('expected_'+field,row.get(field))
                request._content=json.dumps(data).encode()
                request.stream=httpx.ByteStream(request._content)
                request.headers['Content-Length']=str(len(request._content))
                request.headers['Content-Type']='application/json'
            if request.method=='POST' and request.url.path=='/api/bulk':
                data=json.loads(request.content)
                if data.get('kind') in server.ENTITY_MAP and 'expected_versions' not in data:
                    key=server.ENTITY_MAP[data['kind']][2]
                    rows=await server.db[data['kind']].find({key:{'$in':data.get('ids',[])}}).to_list(None)
                    data['expected_versions']={row[key]:row.get('updated_at') for row in rows}
                    request._content=json.dumps(data).encode()
                    request.stream=httpx.ByteStream(request._content)
                    request.headers['Content-Length']=str(len(request._content))
                    request.headers['Content-Type']='application/json'
            if request.method=='POST' and len(parts)==3 and (parts[0],parts[2]) in {('risks','accept'),('risks','close'),('vendors','schedule-review'),('policies','verify'),('policies','approval-subject'),('policies','approval-authority'),('policies','submit-review'),('findings','accept'),('exceptions','approve')}:
                data=json.loads(request.content or b'{}')
                key=server.ENTITY_MAP[parts[0]][2]
                row=await server.db[parts[0]].find_one({key:parts[1]}) or {}
                data.setdefault('expected_updated_at',row.get('updated_at'))
                request._content=json.dumps(data).encode()
                request.stream=httpx.ByteStream(request._content)
                request.headers['Content-Length']=str(len(request._content))
                request.headers['Content-Type']='application/json'
            if request.url.path in ('/api/onboarding/baseline','/api/frameworks/soc-2/configuration') and request.method in ('POST','PATCH') or request.url.path.startswith('/api/onboarding/programs/') and request.method=='PATCH':
                data=json.loads(request.content)
                cid=data.get('client_id')
                client=await server.db.clients.find_one({'client_id':cid}) or {}
                if request.url.path=='/api/onboarding/baseline':
                    row=client.get('onboarding_baseline') or {}
                    if data.get('finalize') and 'expected_records' not in data:
                        from routes.onboarding import baseline_record_versions
                        data['expected_records']=await baseline_record_versions(cid)
                elif request.url.path=='/api/frameworks/soc-2/configuration':
                    row={'updated_at':client.get('soc_configuration_updated_at')}
                else:
                    row=await server.db.requirements.find_one({'client_id':cid,'baseline_key':parts[-1]}) or {}
                data.setdefault('expected_updated_at',row.get('updated_at'))
                request._content=json.dumps(data).encode()
                request.stream=httpx.ByteStream(request._content)
                request.headers['Content-Length']=str(len(request._content))
                request.headers['Content-Type']='application/json'
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://isolated.example.test", event_hooks={"request": [identify_create]})
        self.addAsyncCleanup(self.client.aclose)

    def sign_in(self, uid):
        self.client.headers["Authorization"] = "Bearer " + server.create_access_token(uid, uid + "@example.test")

    async def test_existing_sources_reject_other_tenants(self):
        kinds = {"reviews": "review_id", "findings": "finding_id", "tasks": "task_id", "risks": "risk_id", "policies": "policy_id", "vendors": "vendor_id", "exceptions": "exception_id", "requirements": "requirement_id"}
        for kind, key in kinds.items():
            for cid in ["a", "b"]:
                await server.db[kind].insert_one({key: kind + cid, "client_id": cid, "title": kind, "name": kind, "status": "open", "created_at": "2026-01-01"})
        self.sign_in("member")
        for kind in kinds:
            r = await self.client.get("/api/" + kind, params={"client_id": "a"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual([x["client_id"] for x in r.json()], ["a"])
            denied = await self.client.get("/api/" + kind, params={"client_id": "b"})
            self.assertEqual(denied.status_code, 403)
        for path in ["/api/dashboard?client_id=b", "/api/clients/b/members"]:
            self.assertEqual((await self.client.get(path)).status_code, 403)

    async def test_new_client_has_zero_metrics_and_records_appear_without_setup(self):
        self.sign_in("admin")
        created = await self.client.post("/api/clients", json={"name": "New dashboard test client"})
        self.assertEqual(created.status_code, 200)
        cid = created.json()["client_id"]
        dashboard = await self.client.get("/api/dashboard", params={"client_id": cid})
        self.assertEqual(dashboard.status_code, 200)
        for key in ["overdue_actions", "critical_high_findings", "significant_risks", "due_next_30"]:
            self.assertEqual(dashboard.json()["kpis"][key], 0)
        for kind in ["reviews", "findings", "tasks", "risks", "policies", "vendors", "exceptions", "requirements"]:
            r = await self.client.get("/api/" + kind, params={"client_id": cid})
            self.assertEqual(r.json(), [])
        task = await self.client.post("/api/tasks", json={"client_id": cid, "title": "First obligation", "due_date": "2026-09-20", "priority": "high"})
        self.assertEqual(task.status_code, 200)
        rows = await self.client.get("/api/tasks", params={"client_id": cid})
        self.assertEqual([r["task_id"] for r in rows.json()], [task.json()["task_id"]])


if __name__ == "__main__":
    unittest.main()
