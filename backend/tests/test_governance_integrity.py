from unittest.mock import AsyncMock, patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server

OUTCOME = {"conclusion": "Practice operated as expected", "tested_period": "Q3 2026", "tested_scope": "Access sample", "checklist_confirmed": True, "no_evidence_reason": "Interview only; rationale recorded"}

class GovernanceIntegrityTests(ClientDashboardSourcesTests):
    async def test_existing_sources_reject_other_tenants(self):
        await server.db.reviews.delete_many({})
        await super().test_existing_sources_reject_other_tenants()

    async def asyncSetUp(self):
        await super().asyncSetUp()
        await server.db.reviews.insert_many([
            {"review_id": "ra", "client_id": "a", "title": "A review", "review_type": "access", "status": "in_progress", "recurrence": "annual", "due_date": "2026-09-09"},
            {"review_id": "rb", "client_id": "b", "title": "B private", "review_type": "access", "status": "in_progress"}])
        await server.db.users.insert_one({"user_id":"scoped", "role":"platform_admin", "client_ids":["a"], "status":"active", "email":"scoped@example.test"})

    async def test_parent_authorization_and_revoked_notifications(self):
        await server.db.comments.insert_one({"entity_type":"reviews", "entity_id":"rb", "body":"private"})
        self.sign_in("member")
        self.assertEqual((await self.client.get('/api/comments?entity_type=reviews&entity_id=rb')).status_code,403)
        self.assertEqual((await self.client.post('/api/comments',json={"entity_type":"reviews","entity_id":"rb","body":"x"})).status_code,403)
        self.assertEqual((await self.client.post('/api/comments',json={"entity_type":"reviews","entity_id":"ra","occurrence_id":"occ_ra","body":"allowed"})).status_code,200)
        result = await self.client.post('/api/evidence',json={"client_id":"a","filename":"x.txt","content_base64":"eA==","linked_type":"review","linked_id":"rb"})
        self.assertEqual(result.status_code,403)
        await server.create_notification(user_id='member',client_id='b',title='Private',kind='assignment')
        self.assertEqual(await server.db.notifications.count_documents({}),0)
        self.sign_in('scoped')
        self.assertEqual((await self.client.delete('/api/reviews/rb')).status_code,403)
        self.assertEqual((await self.client.get('/api/reviews?client_id=b')).status_code,403)
        await server.db.risks.insert_one({'risk_id':'private-risk','client_id':'b','title':'Private'})
        result = await self.client.post('/api/vendors',json={'client_id':'a','name':'Vendor','related_risk_ids':['private-risk']})
        self.assertEqual(result.status_code,422,result.text)

    async def test_generic_create_patch_bulk_cannot_forge_decisions(self):
        self.sign_in('member')
        policy = (await self.client.post('/api/policies',json={"client_id":"a","title":"Policy"})).json()
        pid = policy['policy_id']
        for change in [{"status":"approved"},{"approved_at":"2026-01-01"},{"approval_history":[{"by":"admin"}]},{"unexpected":True}]:
            result = await self.client.patch('/api/policies/'+pid,json=change)
            self.assertEqual(result.status_code,422,result.text)
        self.assertEqual((await self.client.post('/api/policies',json={"client_id":"a","title":"Forged","status":"approved"})).status_code,422)
        await self.client.post('/api/bulk',json={"kind":"policies","ids":[pid],"action":"set-status","payload":{"status":"approved"}})
        self.assertEqual((await server.db.policies.find_one({'policy_id':pid}))['status'],'draft')
        self.assertEqual((await self.client.post('/api/policies/'+pid+'/approve',json={})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.post('/api/policies/'+pid+'/approve',json={})).status_code,200)

    async def test_completion_snapshot_retry_and_evidence_retention(self):
        self.sign_in('member')
        self.assertEqual((await self.client.post('/api/reviews/ra/complete',json={})).status_code,422)
        action = {"occurrence_id":"occ_ra"}
        ev = (await self.client.post('/api/evidence',json={**action,"client_id":"a","filename":"access.txt","content_base64":"eA==","linked_type":"review","linked_id":"ra"})).json()
        completed = await self.client.post('/api/reviews/ra/complete',json=action)
        self.assertEqual(completed.status_code,200,completed.text)
        snapshot = completed.json()['occurrence']
        self.assertEqual(snapshot['completed_by'],'member')
        self.assertEqual(snapshot['evidence'][0]['evidence_id'],ev['evidence_id'])
        self.assertEqual(len(snapshot['evidence'][0]['sha256']),64)
        repeated = await self.client.post('/api/reviews/ra/complete',json=action)
        self.assertEqual(repeated.status_code,200,repeated.text)
        self.assertEqual(repeated.json()['occurrence'],snapshot)
        self.assertEqual(await server.db.reviews.count_documents({'parent_review_id':'ra'}),0)
        self.assertEqual((await self.client.patch('/api/reviews/ra',json={'notes':'rewrite history','expected_occurrence_id':'occ_ra'})).status_code,409)
        self.sign_in('admin')
        self.assertEqual((await self.client.delete('/api/evidence/'+ev['evidence_id'])).status_code,409)
        self.assertEqual((await self.client.delete('/api/reviews/ra')).status_code,409)

    async def test_risk_scoring_and_acceptance_expiry(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks',json={'client_id':'a','title':'Risk','likelihood_score':5,'impact_score':4})).json()
        rid = risk['risk_id']
        self.assertEqual(risk['risk_level'],'critical')
        self.assertEqual((await self.client.patch('/api/risks/'+rid,json={'likelihood_score':6})).status_code,422)
        self.assertEqual((await self.client.post('/api/risks/'+rid+'/accept',json={'rationale':'Decision','expiry_date':'2099-01-01','approver_id':'member'})).status_code,422)
        result = await self.client.post('/api/risks/'+rid+'/accept',json={'rationale':'Decision','expiry_date':'2099-01-01'})
        self.assertEqual(result.status_code,200,result.text)
        await self.client.post('/api/risks/'+rid+'/mark-reviewed')
        self.assertEqual((await server.db.risks.find_one({'risk_id':rid}))['acceptance_expires_at'],'2099-01-01')
        result = await self.client.patch('/api/risks/'+rid,json={'likelihood_score':None})
        self.assertIsNone(result.json()['risk_level'])

    async def test_digests_do_not_email_revoked_client_work(self):
        await server.db.reviews.update_many({}, {'$set':{'owner_id':'member','due_date':'2020-01-01'}})
        await server.db.users.update_one({'user_id':'member'}, {'$set':{'client_ids':[]}})
        with patch.object(server,'send_email',new_callable=AsyncMock) as email:
            await server._send_weekly_digest()
            await server._send_overdue_digest()
            email.assert_not_called()

    async def test_operational_work_preserves_validation_and_distinct_task_dates(self):
        import routes.portfolio as portfolio
        await server.db.reviews.delete_many({})
        await server.db.findings.insert_many([
            {'finding_id':'f','client_id':'a','title':'Issue','status':'in_remediation','severity':'high','due_date':'2020-01-01','owner_id':'member'},
            {'finding_id':'validation','client_id':'a','title':'Validate','status':'remediated','severity':'medium','owner_id':'member'}])
        await server.db.tasks.insert_many([
            {'task_id':'same','client_id':'a','title':'Remediate','status':'open','finding_id':'f','due_date':'2020-01-01','assignee_id':'member'},
            {'task_id':'distinct','client_id':'a','title':'Other deadline','status':'open','finding_id':'f','due_date':'2020-01-02','assignee_id':'member'}])
        self.sign_in('admin')
        metrics = (await self.client.get('/api/dashboard?client_id=a')).json()['kpis']
        self.assertEqual(metrics['overdue_actions'],2)
        self.assertEqual(metrics['open_findings'],2)
        admin = await server.db.users.find_one({'user_id':'admin'})
        with patch.object(portfolio,'db',server.db):
            result = await portfolio.clients_directory(False,admin)
        client = next(c for c in result['clients'] if c['client_id']=='a')
        self.assertEqual(client['past_due'],2)
        self.assertIn('validation',[r['entity_id'] for r in result['attention_queue']])
        response = await self.client.post('/api/bulk',json={'kind':'tasks','ids':['same','distinct'],'action':'close'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual((await server.db.findings.find_one({'finding_id':'f'}))['status'],'remediated')
