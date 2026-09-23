import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from routes import portfolio
from management_obligations import management_model, calendar_day, program_status

FIXTURE=json.loads((Path(__file__).resolve().parents[2]/'frontend/src/lib/managementScenarios.json').read_text())

class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026,9,15,12,tzinfo=timezone.utc)

class ManagementObligationTests(ClientDashboardSourcesTests):
    async def seed_scenario(self):
        for kind, rows in FIXTURE['records'].items():
            if rows:
                await server.db[kind].insert_many(copy.deepcopy(rows))

    def test_exact_shared_fixture_identities_and_no_mutation(self):
        records=copy.deepcopy(FIXTURE['records'])
        m=management_model(records,'a',today=FIXTURE['today'])
        for key, expected in FIXTURE['expected'].items():
            self.assertEqual(sorted(r['key'] for r in m['metrics'][key]),sorted(expected),key)
        self.assertEqual(m['counts'],{'past_due':10,'due_30d':11,'due_31_90d':7,'critical_high_open':6,'unassigned':2})
        self.assertEqual(records,FIXTURE['records'])
        self.assertIsNone(calendar_day('2026-02-30'))
        self.assertEqual(calendar_day('2026-09-15T23:30:00-04:00'),calendar_day('2026-09-15'))
        self.assertEqual(program_status({'status':'onboarding'},m),'onboarding')
        with self.assertRaises(ValueError): management_model(records,'b',today=FIXTURE['today'])

    async def test_real_routes_share_exact_sets_and_scope(self):
        await self.seed_scenario();self.sign_in('admin')
        with patch.object(portfolio,'db',server.db),patch.object(portfolio,'datetime',FixedDatetime),patch.object(server,'_now',lambda:'2026-09-15T12:00:00Z'):
            p=await self.client.get('/api/clients/directory')
            d=await self.client.get('/api/dashboard?client_id=a')
        self.assertEqual(p.status_code,200,p.text);self.assertEqual(d.status_code,200,d.text)
        self.assertEqual(len(p.json()['attention_queue']),15)
        self.assertFalse(any(r['entity_type']=='finding' and r['entity_id']=='represented' for r in p.json()['attention_queue']))
        for key, expected in FIXTURE['expected'].items():
            self.assertEqual(p.json()['portfolio'][key],len(expected),key)
            self.assertEqual(sorted(r['key'] for r in p.json()['metric_items'][key]),sorted(expected))
            self.assertEqual(sorted(r['key'] for r in d.json()['management']['metric_items'][key]),sorted(expected))
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/dashboard?client_id=b')).status_code,403)
        self.assertEqual((await self.client.get('/api/clients/directory')).status_code,403)
        await server.db.users.insert_one({'user_id':'scoped','email':'scoped@example.test','role':'platform_admin','client_ids':['b'],'status':'active'})
        self.sign_in('scoped')
        with patch.object(portfolio,'db',server.db): result=await self.client.get('/api/clients/directory')
        self.assertEqual([c['client_id'] for c in result.json()['clients']],['b'])
        self.assertEqual(result.json()['metric_items']['past_due'],[])

    async def test_complete_populations_are_not_register_or_queue_capped(self):
        await server.db.tasks.insert_many([{'task_id':str(i),'client_id':'a','title':'Past action '+str(i),'due_date':'2000-01-01','status':'open'} for i in range(1105)])
        self.sign_in('admin')
        with patch.object(portfolio,'db',server.db): p=await self.client.get('/api/clients/directory')
        d=await self.client.get('/api/dashboard?client_id=a')
        self.assertEqual(p.json()['portfolio']['past_due'],1105)
        self.assertEqual(len(p.json()['metric_items']['past_due']),1105)
        self.assertEqual(len(p.json()['attention_queue']),15)
        self.assertEqual(d.json()['kpis']['past_due'],1105)
        self.assertEqual(len(d.json()['management']['metric_items']['past_due']),25)
        self.assertEqual(d.json()['posture']['totals']['pastDue'],1105)
        self.assertNotIn('records',d.json()['management'])
        identities=[]
        for offset in range(0,1105,100):
            page=await self.client.get(f'/api/dashboard?client_id=a&detail=pastDue&offset={offset}&limit=100')
            self.assertEqual(page.status_code,200,page.text)
            self.assertEqual(page.json()['total'],1105)
            self.assertLessEqual(len(page.json()['items']),100)
            identities.extend(r['id'] for r in page.json()['items'])
        self.assertEqual(len(set(identities)),1105)

    async def test_report_uses_review_subset_of_shared_model_without_due_today_overdue(self):
        await self.seed_scenario()
        with patch.object(server,'_now',lambda:'2026-09-15T12:00:00Z'),patch.object(server,'Table',wraps=server.Table) as tables:
            pdf=await server._build_board_report('a',{'name':'Scenario reviewer'})
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertEqual(tables.call_args_list[0].args[0][1],['3','4','3','2'])
        overdue=tables.call_args_list[1].args[0]
        self.assertNotIn('today',[r[0] for r in overdue[1:]])
        self.assertEqual(len(overdue)-1,3)

    def test_person_scope_does_not_recreate_represented_acceptance(self):
        records=copy.deepcopy(FIXTURE['records'])
        records['exceptions'][0]['owner_id']='someone-else'
        m=management_model(records,'a',today=FIXTURE['today'],scope='user',user_id='u')
        self.assertFalse(any(r['key']=='risks:accepted:acceptance' for r in m['work']))
