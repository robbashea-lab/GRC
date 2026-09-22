"""Real authorization and aggregation against isolated Mongo fixtures, no live data."""
import copy
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from test_management_obligations import FIXTURE, FixedDatetime
from routes import portfolio
from portfolio_overview import attention_order


class PortfolioOverviewTests(ClientDashboardSourcesTests):
    async def directory(self, archived=False):
        with patch.object(portfolio, 'db', server.db), patch.object(portfolio, 'datetime', FixedDatetime):
            result = await self.client.get('/api/clients/directory', params={'include_archived': str(archived).lower()})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    async def test_exact_populations_frameworks_and_read_only(self):
        self.sign_in('admin')
        for kind, rows in FIXTURE['records'].items():
            if rows:
                await server.db[kind].insert_many(copy.deepcopy(rows))
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'onboarding_baseline': {'completed': True}, 'assigned_owner_id': 'admin'}})
        await server.db.requirements.insert_many([
            {'requirement_id': 'cmmc-a', 'client_id': 'a', 'baseline_key': 'cmmc', 'baseline_response': 'applies'},
            {'requirement_id': 'hipaa-a', 'client_id': 'a', 'baseline_key': 'hipaa', 'baseline_response': 'does_not_apply'},
            {'requirement_id': 'soc-b', 'client_id': 'b', 'baseline_key': 'soc-2', 'baseline_response': 'applies'}])
        before = {kind: await server.db[kind].find({}, {'_id': 0}).to_list(None) for kind in ['clients', *FIXTURE['records']]}
        result = await self.directory()
        row = next(r for r in result['clients'] if r['client_id'] == 'a')
        for key in ('past_due', 'due_30d', 'unassigned'):
            self.assertEqual(sorted(r['key'] for r in row['metric_items'][key]), sorted(FIXTURE['expected'][key]))
        issues, risks = row['metric_items']['critical_high_issues'], row['metric_items']['significant_risks']
        self.assertEqual(row['critical_high_issues'], len(issues))
        self.assertEqual(row['significant_risks'], len(risks))
        self.assertTrue(all(r['entity_type'] != 'risk' for r in issues))
        self.assertTrue(all(r['entity_type'] == 'risk' and r['severity'] in ('high', 'critical') for r in risks))
        self.assertEqual(len(issues)+len(risks), row['critical_high_open'])
        self.assertEqual([f['key'] for f in row['frameworks']], ['cmmc'])
        self.assertEqual(row['grc_lead_id'], 'admin')
        self.assertEqual(next(r for r in result['clients'] if r['client_id']=='b')['frameworks'], [])
        after = {kind: await server.db[kind].find({}, {'_id': 0}).to_list(None) for kind in before}
        self.assertEqual(before, after)
        await server.db.requirements.update_one({'requirement_id': 'cmmc-a'}, {'$set': {'baseline_response': 'does_not_apply'}})
        self.assertEqual(next(r for r in (await self.directory())['clients'] if r['client_id']=='a')['frameworks'], [])

    async def test_meaningful_activity_ignores_newer_noise_and_other_clients(self):
        self.sign_in('admin')
        await server.db.audit_logs.insert_many([
            {'client_id':'a','action':'Review completed','entity_type':'review','at':'2026-09-10T12:00:00+00:00'},
            {'client_id':'a','action':'update','entity_type':'review','at':'2026-09-14T12:00:00+00:00'},
            {'client_id':'a','action':'login','entity_type':'user','at':'2026-09-15T11:00:00+00:00'},
            {'client_id':'a','action':'upload','entity_type':'evidence','at':'2026-09-12T12:00:00+00:00'},
            {'client_id':'b','action':'Review started','entity_type':'review','at':'2026-09-13T12:00:00+00:00'},
            {'client_id':'a','action':'Review completed','entity_type':'review','at':'2027-01-01T12:00:00+00:00'},
        ])
        rows = {r['client_id']:r for r in (await self.directory())['clients']}
        self.assertEqual(rows['a']['last_activity'], {'at':'2026-09-12T12:00:00+00:00', 'label':'Evidence added'})
        self.assertEqual(rows['b']['last_activity']['label'], 'Review started')

    async def test_authorized_scope_is_not_inferred_from_lead_and_url_tampering_fails(self):
        await server.db.users.insert_one({'user_id':'limited','email':'limited@example.test','role':'platform_admin','client_ids':['a'],'status':'active'})
        await server.db.clients.update_one({'client_id':'b'},{'$set':{'assigned_owner_id':'limited'}})
        await server.db.risks.insert_one({'risk_id':'secret-b','client_id':'b','title':'Not authorized','status':'accepted','likelihood_score':5,'impact_score':5})
        self.sign_in('limited')
        result = await self.directory(True)
        self.assertEqual([r['client_id'] for r in result['clients']], ['a'])
        self.assertNotIn('Not authorized',str(result))
        for path in ['/api/risks/secret-b','/api/risks?client_id=b','/api/clients/b/members','/api/frameworks/cmmc?client_id=b','/api/dashboard?client_id=b']:
            self.assertEqual((await self.client.get(path)).status_code,403,path)
        self.sign_in('admin')
        self.assertEqual(len((await self.directory())['clients']),2)
        self.sign_in('member')
        with patch.object(portfolio,'db',server.db):
            self.assertEqual((await self.client.get('/api/clients/directory')).status_code,403)

    async def test_archive_onboarding_and_significant_risks(self):
        self.sign_in('admin')
        await server.db.clients.update_one({'client_id':'b'},{'$set':{'status':'archived'}})
        await server.db.clients.update_one({'client_id':'a'},{'$set':{'status':'onboarding'}})
        await server.db.risks.insert_many([
            {'risk_id':key,'client_id':cid,'title':key,'status':status,'likelihood_score':4,'impact_score':4,**extra}
            for key,cid,status,extra in [('accepted','a','accepted',{}),('closed','a','closed',{}),('hidden','a','assessed',{'archived':True}),('other','b','assessed',{})]])
        result=await self.directory()
        self.assertEqual(len(result['clients']),1)
        self.assertEqual(result['clients'][0]['significant_risks'],1)
        self.assertEqual(result['clients'][0]['metric_items']['significant_risks'][0]['id'],'accepted')
        self.assertEqual(result['clients'][0]['critical_high_issues'],0)
        self.assertEqual(len((await self.directory(True))['clients']),2)

    def test_explainable_stable_default_order(self):
        base={'critical_high_issues':0,'past_due':0,'significant_risks':0,'unassigned':0,'due_30d':0}
        rows=[{**base,'name':str(i),'client_id':str(i),key:1} for i,key in enumerate(['due_30d','unassigned','significant_risks','past_due','critical_high_issues'])]
        self.assertEqual([r['client_id'] for r in sorted(rows,key=attention_order)],['4','3','2','1','0'])

    async def test_authoritative_drill_record_reads_are_scoped_read_only_and_uncapped(self):
        for kind,key in [('reviews','review_id'),('findings','finding_id'),('tasks','task_id'),('risks','risk_id'),('vendors','vendor_id'),('policies','policy_id'),('exceptions','exception_id'),('requirements','requirement_id')]:
            for cid in ('a','b'):
                await server.db[kind].insert_one({key:kind+cid,'client_id':cid,'title':kind,'name':kind,'status':'open','_governance_lock':'private'})
        self.sign_in('member')
        for kind in ('reviews','findings','tasks','risks','vendors','policies','exceptions','requirements'):
            result=await self.client.get('/api/'+kind+'/'+kind+'a')
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['client_id'],'a')
            self.assertNotIn('_governance_lock',result.json())
            self.assertEqual((await self.client.get('/api/'+kind+'/'+kind+'b')).status_code,403)
            self.assertEqual((await self.client.get('/api/'+kind+'/missing')).status_code,404)
            self.assertEqual(await server.db[kind].count_documents({}),2)
        self.client.headers.clear()
        self.assertEqual((await self.client.get('/api/risks/risksa')).status_code,401)

    async def test_significant_risk_drill_exceeds_register_cap_without_mutating_legacy_ids(self):
        await server.db.risks.insert_many([{'risk_id':str(i),'client_id':'a','title':'Exposure '+str(i),'status':'accepted','likelihood_score':4,'impact_score':4} for i in range(1005)])
        await server.db.risks.insert_one({'risk_id':'closed','client_id':'a','status':'closed','likelihood_score':5,'impact_score':5})
        self.sign_in('member')
        result=await self.client.get('/api/risks?client_id=a&portfolio_significant=true')
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(len(result.json()),1005)
        self.assertTrue(all(r['status']=='accepted' for r in result.json()))
        self.assertEqual(await server.db.risks.count_documents({'display_id':{'$exists':True}}),0)
        self.assertEqual((await self.client.get('/api/risks?client_id=b&portfolio_significant=true')).status_code,403)
