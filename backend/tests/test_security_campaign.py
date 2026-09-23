"""Hostile direct requests: real auth/routes, synthetic Mongo, no auth overrides."""
import unittest
import httpx
import os
import secrets
import uuid
from unittest.mock import patch, AsyncMock
import test_client_dashboard_sources as harness


class SecurityCampaign(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        self.raw = httpx.AsyncClient(transport=httpx.ASGITransport(app=harness.server.app), base_url='https://security.test')
        self.addAsyncCleanup(self.raw.aclose)
        mail=patch.object(harness.server,'send_email',new=AsyncMock(return_value=None))
        mail.start();self.addCleanup(mail.stop)
        for uid, role, clients in [('grace','platform_admin',['a']), ('empty','platform_admin',[]),
                                   ('manager','client_grc_manager',['a']), ('reader','client_readonly',['a']),
                                   ('unknown','external_auditor',['a'])]:
            await harness.server.db.users.insert_one({'user_id':uid,'name':uid,'email':uid+'@example.test','role':role,'client_ids':clients,'status':'active'})
        for kind,(_,_,field,_) in harness.server.ENTITY_MAP.items():
            for cid in ['a','b']:
                await harness.server.db[kind].insert_one({field:kind+'-'+cid,'client_id':cid,'title':'Synthetic '+kind,
                    'name':'Synthetic '+kind,'status':'open','owner_id':'member' if cid=='a' else 'other',
                    'assignee_id':'member' if cid=='a' else 'other','updated_at':None})
        for cid in ['a','b']:
            await harness.server.db.evidence.insert_one({'evidence_id':'ev-'+cid,'client_id':cid,'filename':'synthetic.txt','content_base64':'ZGVtbw==','mime_type':'text/plain'})

    def token(self, uid):
        return {'Authorization':'Bearer '+harness.server.create_access_token(uid, uid+'@example.test')}

    async def test_empty_provider_scope_is_not_global(self):
        response=await self.raw.get('/api/clients',headers=self.token('empty'))
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json(),[])
        response=await self.raw.get('/api/users',headers=self.token('empty'))
        self.assertEqual(response.json(),[])

    async def test_provider_cannot_create_internal_personnel(self):
        response=await self.raw.post('/api/users',headers=self.token('grace'),json={
            'name':'Escalation','email':'attack@example.com','role':'platform_admin','client_ids':['a']})
        self.assertEqual(response.status_code,403,response.text)
        self.assertIsNone(await harness.server.db.users.find_one({'email':'attack@example.com'}))

    async def test_unknown_role_denied_even_with_membership(self):
        response=await self.raw.get('/api/clients',headers=self.token('unknown'))
        self.assertEqual(response.status_code,403,response.text)

    async def test_logout_revokes_replayed_token(self):
        headers=self.token('member')
        self.assertEqual((await self.raw.post('/api/auth/logout',headers=headers)).status_code,200)
        self.assertEqual((await self.raw.get('/api/auth/me',headers=headers)).status_code,401)

    async def test_contributor_cannot_mutate_program_configuration(self):
        response=await self.raw.post('/api/onboarding/baseline',headers=self.token('member'),json={
            'client_id':'a','expected_updated_at':None,'state':{}})
        self.assertEqual(response.status_code,403,response.text)

    async def test_cookie_write_requires_trusted_origin(self):
        self.raw.cookies.set('access_token',harness.server.create_access_token('member','member@example.test'))
        response=await self.raw.patch('/api/me',headers={'Origin':'https://hostile.example'},json={'name':'forged','expected_updated_at':None})
        self.assertEqual(response.status_code,403,response.text)

    async def test_cross_tenant_resource_campaign(self):
        for actor in ['member','manager','reader','grace','empty']:
            for kind in harness.server.ENTITY_MAP:
                for method,path,body in [('GET',f'/api/{kind}/{kind}-b',None),('GET',f'/api/{kind}?client_id=b',None),
                    ('PATCH',f'/api/{kind}/{kind}-b',{'notes':'attack','expected_updated_at':None}),
                    ('DELETE',f'/api/{kind}/{kind}-b',{'expected_updated_at':None})]:
                    with self.subTest(actor=actor,method=method,path=path):
                        response=await self.raw.request(method,path,headers=self.token(actor),json=body)
                        self.assertIn(response.status_code,[403,404],response.text)

    async def test_cross_tenant_aggregate_file_and_search_campaign(self):
        paths=['/api/evidence/ev-b/download','/api/evidence?client_id=b','/api/evidence/catalog?client_id=b',
               '/api/dashboard?client_id=b','/api/calendar?client_id=b','/api/reports/board?client_id=b',
               '/api/export/tasks?client_id=b','/api/clients/b/profile','/api/frameworks/cis-ig1?client_id=b',
               '/api/clients/b/assignees','/api/audit-logs?client_id=b',
               '/api/comments?entity_type=tasks&entity_id=tasks-b',
               '/api/evidence-library/items/ev-b','/api/evidence-library/sources?client_id=b&kind=reviews']
        for actor in ['member','manager','reader','grace','empty']:
            for path in paths:
                with self.subTest(actor=actor,path=path):
                    response=await self.raw.get(path,headers=self.token(actor))
                    self.assertIn(response.status_code,[403,404],response.text)

    async def test_unknown_and_unauthenticated_demo_credentials(self):
        for token in ['', 'Bearer demo', 'Bearer user_demo_owner', 'Bearer undefined']:
            for path in ['/api/clients','/api/tasks/tasks-a','/api/evidence/ev-a/download','/api/users']:
                with self.subTest(token=token,path=path):
                    response=await self.raw.get(path,headers={'Authorization':token} if token else {})
                    self.assertEqual(response.status_code,401,response.text)
        for path in ['/api/demo/reset','/api/demo/enter','/api/demo/clear-evidence-files']:
            self.assertEqual((await self.raw.post(path,headers=self.token('admin'))).status_code,404)

    async def test_current_identity_revokes_stale_authority(self):
        headers=self.token('grace')
        self.assertEqual((await self.raw.get('/api/tasks/tasks-a',headers=headers)).status_code,200)
        await harness.server.db.users.update_one({'user_id':'grace'},{'$set':{'client_ids':[]}})
        self.assertEqual((await self.raw.get('/api/tasks/tasks-a',headers=headers)).status_code,403)
        await harness.server.db.users.update_one({'user_id':'grace'},{'$set':{'client_ids':['a'],'role':'client_readonly'}})
        self.assertEqual((await self.raw.patch('/api/tasks/tasks-a',headers=headers,json={'notes':'attack'})).status_code,403)
        await harness.server.db.users.update_one({'user_id':'grace'},{'$set':{'status':'disabled'}})
        self.assertEqual((await self.raw.get('/api/tasks/tasks-a',headers=headers)).status_code,401)

    async def test_mass_assignment_and_vertical_escalation(self):
        for actor in ['member','manager','reader','grace']:
            for role in ['super_admin','platform_admin']:
                with self.subTest(actor=actor,role=role):
                    response=await self.raw.patch('/api/users/member',headers=self.token(actor),json={'role':role,'expected_updated_at':None})
                    self.assertEqual(response.status_code,403,response.text)
        for payload in [{'role':'super_admin'},{'client_id':'b'},{'created_by':'admin'},
                        {'approved':True},{'assignee_id':'unknown'},{'securitySetting':False}]:
            with self.subTest(payload=payload):
                response=await self.raw.patch('/api/tasks/tasks-a',headers=self.token('member'),json={**payload,'expected_updated_at':None})
                self.assertIn(response.status_code,[403,422],response.text)

    async def test_matrix_positive_and_assignment_negative(self):
        for actor in ['admin','grace','manager','member','reader']:
            self.assertEqual((await self.raw.get('/api/tasks/tasks-a',headers=self.token(actor))).status_code,200)
        for actor in ['admin','grace','manager','member']:
            row=await harness.server.db.tasks.find_one({'task_id':'tasks-a'})
            response=await self.raw.patch('/api/tasks/tasks-a',headers=self.token(actor),json={'description':'authorized','expected_updated_at':row.get('updated_at')})
            self.assertEqual(response.status_code,200,response.text)
        await harness.server.db.tasks.update_one({'task_id':'tasks-a'},{'$set':{'assignee_id':'other','owner_id':'other'}})
        response=await self.raw.patch('/api/tasks/tasks-a',headers=self.token('member'),json={'notes':'not assigned','expected_updated_at':None})
        self.assertEqual(response.status_code,403,response.text)

    async def test_upload_active_content_and_path_rejected(self):
        for filename,mime in [('../x.txt','text/plain'),('x.svg','image/svg+xml'),('x.html','text/html'),('x.js','application/javascript')]:
            response=await self.raw.post('/api/evidence',headers={**self.token('admin'),'Idempotency-Key':uuid.uuid4().hex},json={
                'client_id':'a','filename':filename,'mime_type':mime,'content_base64':'ZGVtbw=='})
            self.assertEqual(response.status_code,422,response.text)
        response=await self.raw.get('/api/evidence/ev-a/download',headers=self.token('member'))
        self.assertEqual(response.json()['mime_type'],'application/octet-stream')
        self.assertEqual(response.headers['cache-control'],'no-store')
        self.assertEqual(response.headers['x-content-type-options'],'nosniff')

    async def test_environment_token_and_configuration_isolation(self):
        token=self.token('admin')
        with patch.dict(os.environ,{'APP_ENV':'staging'}):
            self.assertEqual((await self.raw.get('/api/auth/me',headers=token)).status_code,401)
            self.assertEqual((await self.raw.post('/api/auth/google/session',json={'session_id':'demo-session'})).status_code,503)
            self.assertEqual((await self.raw.post('/api/auth/register',json={'name':'Synthetic','email':'new@example.com','password':secrets.token_urlsafe(16)})).status_code,403)

    async def test_bad_bearer_cannot_fall_back_to_cookie(self):
        self.raw.cookies.set('access_token',harness.server.create_access_token('admin','admin@example.test'))
        response=await self.raw.patch('/api/me',headers={'Authorization':'Bearer demo','Origin':'https://hostile.example'},json={'name':'forged'})
        self.assertEqual(response.status_code,401)

    async def test_bounded_request_and_csv_cells(self):
        from security_runtime import MAX_BODY, csv_cell
        response=await self.raw.post('/api/evidence',headers=self.token('admin'),content=b'x'*(MAX_BODY+1))
        self.assertEqual(response.status_code,413)
        self.assertEqual(await harness.server.db.evidence.count_documents({}),2)
        for cell in ['=1+1',' +SUM(1,2)','@SUM(1,2)','-1+1','\tformula']:
            self.assertTrue(csv_cell(cell).startswith("'"))
        self.assertEqual(csv_cell('Normal description'),'Normal description')

    async def test_http_route_authentication_inventory(self):
        public={'/api/','/api/auth/login','/api/auth/register','/api/auth/forgot-password',
                '/api/auth/reset-password','/api/auth/google/session',
                '/api/cron/overdue-reminders','/api/cron/weekly-my-work'}
        pending=list(harness.server.app.routes)
        observed=set()
        while pending:
            route=pending.pop()
            if hasattr(route,'original_router'):
                pending.extend(route.original_router.routes)
            elif hasattr(route,'dependant') and not route.dependant.dependencies:
                observed.add(route.path)
        self.assertEqual(observed,public)
        for route in ['/api/cron/overdue-reminders','/api/cron/weekly-my-work']:
            self.assertIn((await self.raw.post(route)).status_code,[401,403,503])
            with patch.dict(os.environ,{'WEBHOOK_CRON_SECRET':''}):
                self.assertEqual((await self.raw.post(route,headers={'Authorization':'Bearer '})).status_code,401)

    async def test_manager_assignment_cannot_delegate_to_internal_user(self):
        response=await self.raw.post('/api/tasks',headers={**self.token('manager'),'Idempotency-Key':uuid.uuid4().hex},
            json={'client_id':'a','title':'Delegation attempt','assignee_id':'admin'})
        self.assertEqual(response.status_code,403)

    async def test_unknown_account_state_and_corrupt_session_fail_closed(self):
        await harness.server.db.users.update_one({'user_id':'member'},{'$unset':{'status':''}})
        self.assertEqual((await self.raw.get('/api/auth/me',headers=self.token('member'))).status_code,401)
        await harness.server.db.sessions.insert_one({'session_token':'corrupt','environment':'development','expires_at':None,'user_id':'admin'})
        self.assertEqual((await self.raw.get('/api/auth/me',headers={'Authorization':'Bearer corrupt'})).status_code,401)

    async def test_malformed_client_mutations_are_validation_errors(self):
        for payload in [[], 'not an object', None]:
            response=await self.raw.post('/api/tasks',headers=self.token('member'),json=payload)
            self.assertEqual(response.status_code,422,response.text)

    async def test_staging_configuration_fails_closed(self):
        from security_runtime import validate_environment
        configured={'APP_ENV':'staging','DB_NAME':'staging_synthetic','JWT_SECRET':secrets.token_urlsafe(48),
            'APP_BASE_URL':'https://security.example.test','CORS_ORIGINS':'https://security.example.test',
            'DEMO_MODE':'false','REACT_APP_PREVIEW':'false','RUN_LEGACY_MIGRATIONS':'false'}
        with patch.dict(os.environ,configured):
            validate_environment()
            for invalid in [{'APP_ENV':'demo'},{'DB_NAME':'production_clients'},{'JWT_SECRET':'short'},
                            {'CORS_ORIGINS':'*'},{'APP_BASE_URL':'http://insecure.example.test'},
                            {'DEMO_MODE':'true'},{'RUN_LEGACY_MIGRATIONS':'true'}]:
                with self.subTest(configuration=list(invalid)):
                    with patch.dict(os.environ,invalid), self.assertRaises(ValueError):
                        validate_environment()

    async def test_provider_can_invite_client_manager_in_assigned_client(self):
        response=await self.raw.post('/api/users',headers=self.token('grace'),json={
            'name':'Synthetic coordinator','email':'coordinator@example.com',
            'role':'client_grc_manager','client_ids':['a']})
        self.assertEqual(response.status_code,200,response.text)
        account=await harness.server.db.users.find_one({'email':'coordinator@example.com'})
        self.assertEqual(account['role'],'client_grc_manager')
        self.assertEqual(account['status'],'invited')
        self.assertEqual(account['client_ids'],['a'])
