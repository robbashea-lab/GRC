from datetime import datetime, timezone
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from routes import portfolio


class CoreAuditTests(ClientDashboardSourcesTests):
    async def test_policy_occurrences_update_dates_without_changing_document_status(self):
        self.sign_in('admin')
        await server.db.policies.insert_one({'policy_id':'policy-a','client_id':'a','title':'Information Security','status':'approved'})
        await server.db.policies.insert_one({'policy_id':'policy-b','client_id':'b','title':'Other tenant','status':'draft'})
        response = await self.client.post('/api/reviews', json={'client_id':'a','title':'Policy Review','review_type':'policy','policy_id':'policy-a','due_date':'2026-09-30','recurrence':'annual'})
        self.assertEqual(response.status_code,200,response.text)
        review = response.json()
        for expected_due in ['2027-09-30','2028-09-30']:
            response = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
            self.assertEqual(response.status_code,200,response.text)
            result=response.json()
            review=result['review']
            policy=await server.db.policies.find_one({'policy_id':'policy-a'})
            self.assertEqual(policy['status'],'approved')
            self.assertEqual(policy['next_review_date'][:10],expected_due)
            self.assertEqual(policy['last_reviewed_at'],result['occurrence']['completed_at'])
        self.assertEqual(len(review['occurrences']),2)
        other=await server.db.policies.find_one({'policy_id':'policy-b'})
        self.assertNotIn('last_reviewed_at',other)
        self.assertEqual(await server.db.reviews.count_documents({'policy_id':'policy-a'}),1)
        denied=await self.client.patch('/api/policies/policy-a',json={'last_reviewed_at':'2000-01-01'})
        self.assertEqual(denied.status_code,422)

    async def test_dashboard_counts_today_once_and_excludes_cancelled_actions(self):
        self.sign_in('admin')
        today=datetime.now(timezone.utc).date().isoformat()
        await server.db.reviews.insert_one({'review_id':'r','client_id':'a','title':'Policy review','policy_id':'p','status':'upcoming','due_date':today})
        await server.db.policies.insert_one({'policy_id':'p','client_id':'a','title':'Policy','status':'approved','next_review_date':today})
        await server.db.tasks.insert_many([{'task_id':'open','client_id':'a','title':'Due today','status':'open','due_date':today},{'task_id':'cancelled','client_id':'a','title':'Cancelled','status':'cancelled','due_date':today}])
        result=await self.client.get('/api/dashboard?client_id=a')
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['kpis']['due_next_30'],2)

    async def test_portfolio_counts_linked_risk_deadline_once(self):
        self.sign_in('admin')
        await server.db.reviews.insert_one({'review_id':'r','client_id':'a','title':'Risk review','risk_id':'risk','status':'upcoming','due_date':'2000-01-01'})
        await server.db.risks.insert_one({'risk_id':'risk','client_id':'a','title':'Exposure','status':'assessed','next_review':'2000-01-01'})
        with patch.object(portfolio,'db',server.db):
            result=await self.client.get('/api/clients/directory')
        self.assertEqual(result.status_code,200,result.text)
        client=next(c for c in result.json()['clients'] if c['client_id']=='a')
        self.assertEqual(client['past_due'],1)
