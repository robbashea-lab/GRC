"""36-month programs through API commands; isolated Mongo mock, never inserted history."""
import copy
import json
import os
import secrets
from pathlib import Path
import unittest
from unittest.mock import patch
from datetime import datetime as RealDatetime, time, timezone, timedelta

import test_client_dashboard_sources as harness
import test_ten_year_operation as clocks
import iso_audit, onboarding_recovery, policy_reviews, review_commands, risk_lifecycle
from framework_catalog import CATALOGS, FRAMEWORKS
from routes.onboarding import BASELINE_CATALOG

server=harness.server
TIMELINE=json.loads((Path(__file__).resolve().parents[2]/'shared/contracts/program-lifecycle.json').read_text())


class FrameworkThreeYearTests(unittest.IsolatedAsyncioTestCase):
    sign_in=clocks.TenYearOperationTests.sign_in

    async def asyncSetUp(self):
        clock_state=patch.object(clocks.Clock,'now',RealDatetime.combine(clocks.START,time(14),tzinfo=timezone.utc))
        clock_state.start();self.addCleanup(clock_state.stop)
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        for module in [*clocks.CLOCKED,iso_audit,onboarding_recovery,policy_reviews,review_commands,risk_lifecycle]:
            for name,fake in [('datetime',clocks.SimDatetime),('date',clocks.SimDate)]:
                if getattr(module,name,None) in (clocks.REAL_DATETIME,clocks.REAL_DATE):
                    clock=patch.object(module,name,fake);clock.start();self.addCleanup(clock.stop)
        self.sign_in('admin')

    def clock(self,day):
        clocks.Clock.now=RealDatetime.combine(clocks.REAL_DATE.fromisoformat(day[:10]),time(14),tzinfo=timezone.utc)

    async def call(self,method,path,**kwargs):
        response=await self.client.request(method,'/api'+path,**kwargs)
        self.assertEqual(response.status_code,200,(method,path,response.text))
        return response.json()

    async def get(self,path,**params):return await self.call('GET',path,params=params)
    async def post(self,path,body=None,**kwargs):return await self.call('POST',path,json=body or {},**kwargs)
    async def edit(self,path,body):return await self.call('PATCH',path,json=body)

    async def test_sequential_cis_soc_iso_programs(self):
        reports=[]
        for framework in TIMELINE['frameworks']:
            with self.subTest(framework):
                self.clock('2027-01-01')
                client=await self.post('/clients',{'name':framework+' Three-year Validation — disposable'})
                cid=client['client_id']
                state={'version':3,'step':3,'policies':{p['key']:'unsure' for p in BASELINE_CATALOG['policies']},
                    'requirements':{f['key']:'applies' if f['key']==framework else 'does_not_apply' for f in FRAMEWORKS},
                    'reviews':[],'framework_reviews':{p['key']:{'enabled':True,'recurrence':p['default_cadence'],'due_date':'2027-03-31'} for p in CATALOGS[framework]['review_plans']}}
                await self.post('/onboarding/baseline',{'client_id':cid,'state':state,'finalize':True})
                workspace=await self.get('/frameworks/'+framework,client_id=cid)
                self.assertEqual(len(workspace['assessments']),TIMELINE['assessment_counts'][framework])
                self.assertEqual({a['framework_key'] for a in workspace['assessments']},{framework})
                if framework=='cis-ig1':
                    self.assertEqual({a['definition_id'] for a in workspace['assessments']},{d['id'] for d in CATALOGS[framework]['requirements']})
                reviews=await self.get('/reviews',client_id=cid)
                self.assertTrue(all(r['due_date']=='2027-03-31' for r in reviews))
                ids={r['review_id'] for r in reviews}
                await self.post('/onboarding/baseline',{'client_id':cid,'state':state,'finalize':True})
                self.assertEqual({r['review_id'] for r in await self.get('/reviews',client_id=cid)},ids)
                for review in reviews:
                    await self.edit('/reviews/'+review['review_id'],{'owner_id':'admin','expected_occurrence_id':review['current_occurrence_id']})
                departing=(await self.post('/users',{'name':'Synthetic departing owner','email':framework+'-departure@example.com','role':'client_contributor','client_ids':[cid],'password':secrets.token_urlsafe(24)}))['user']
                probe=await self.post('/reviews',{'client_id':cid,'title':TIMELINE['month_end_probe']['title'],'review_type':'governance','recurrence':'monthly','due_date':'2027-01-31','owner_id':departing['user_id']})
                handoff=await self.post('/tasks',{'client_id':cid,'title':'Synthetic owner departure handoff','assignee_id':departing['user_id']})
                if framework=='iso-27001':
                    activated=await self.post('/iso-audit/activate',{'client_id':cid,'start_date':'2027-01-01','first_package':'governance-risk','auditor_id':'admin','scope':'Synthetic scoped service','independence':'Independent reviewer does not assess their own operation'})
                    self.assertEqual(len(activated['reviews']),4)
                definition={'cis-ig1':'1.1','soc-2':'CC6.1','iso-27001':'A.8.30'}[framework]
                assessment=next(a for a in workspace['assessments'] if a['definition_id']==definition)
                ap='/framework_assessments/'+assessment['framework_assessment_id']
                risk=await self.post('/risks',{'client_id':cid,'title':'Synthetic supplier exposure','owner_id':'admin','likelihood_score':3,'impact_score':4,'treatment':'mitigate','next_review':'2027-06-30','review_cadence':'annual'})
                vendor=await self.post('/vendors',{'client_id':cid,'name':'Synthetic supplier','service':'Scoped service support','business_owner_id':'admin','next_review':'2027-06-30','review_frequency':'annual','contract_renewal':'2028-03-31','contract_review_enabled':True})
                policy=(await self.get('/policies',client_id=cid))[0]
                pp='/policies/'+policy['policy_id']
                manual=await self.post('/findings',{'client_id':cid,'title':'Synthetic observation without an Action','severity':'low'})
                self.assertEqual(await server.db.tasks.count_documents({'finding_id':manual['finding_id']}),0)
                snapshots={};checkpoints=[];events=[];first_assessment=None;first_finding=None;first_closed=None;original_action=None;reopened_action=None
                for year in range(2027,2030):
                    self.clock(str(year)+'-01-15')
                    changes={'status':'in_progress' if year==2027 else 'addressed','implementation':f'Synthetic {year} implementation reassessment','owner_id':'admin'}
                    if framework=='iso-27001':changes.update(status='in_progress',soa_applicability='excluded' if year==2027 else 'included',soa_justification='No outsourced development' if year==2027 else 'Supplier entered the scope')
                    if framework=='soc-2':changes.update(verification='needs_validation',soc_assessment_checks=[])
                    if framework=='cis-ig1':changes.update(verification='needs_validation',cis_assessment_criteria=[])
                    saved=await self.edit(ap,changes)
                    first_assessment=first_assessment or copy.deepcopy(saved['assessment_history'][0])
                    self.assertEqual(saved['assessment_history'][0],first_assessment)
                    await self.post(pp+'/approval-subject',{'version':str(year-2026),'external_reference':'https://documents.example.test/synthetic-policy','external_version':f'demo-v{year-2026}'})
                    request=await self.post(pp+'/submit-review')
                    await self.post(pp+'/approve',{'approval_request_id':request['approval_request_id']})
                    if year==2029:
                        self.assertEqual(first_closed['status'],'closed')
                        reopened=await self.edit('/findings/'+first_finding['finding_id'],{'status':'open','expected_updated_at':first_closed['updated_at']})
                        self.assertEqual(reopened['status'],'open')
                        self.assertEqual(reopened['decision_history'],first_closed['decision_history'])
                        reopened_action=await self.post('/tasks',{'client_id':cid,'title':'Revalidate changed supplier operation','source_type':'finding','source_id':first_finding['finding_id'],'assignee_id':'admin'})
                        self.assertNotEqual(reopened_action['task_id'],original_action['task_id'])
                        for field in ('review_id','occurrence_id'):
                            self.assertEqual(reopened_action[field],first_closed[field])
                        self.assertEqual((await self.get('/findings/'+first_finding['finding_id']))['status'],'in_remediation')
                        events.append({'at':'2029-01-15','event':'finding_reopened','finding_id':first_finding['finding_id'],'new_action_id':reopened_action['task_id'],'original_action_id':original_action['task_id']})
                    executions=0
                    while True:
                        due=sorted([r for r in await self.get('/reviews',client_id=cid) if r.get('due_date') and r['due_date'][:10]<=f'{year}-12-31' and r.get('status') not in ('completed','cancelled')],key=lambda r:r['due_date'])
                        if not due:break
                        review=due[0];executions+=1;self.assertLess(executions,120)
                        scheduled=review['due_date'][:10];completion=scheduled
                        if review['review_id']==probe['review_id']:
                            if scheduled=='2027-01-31':completion=TIMELINE['month_end_probe']['early_completion']
                            elif scheduled=='2027-03-31':completion=TIMELINE['month_end_probe']['late_completion']
                            elif scheduled in TIMELINE['month_end_probe']['missed_due_dates']:completion=TIMELINE['month_end_probe']['catch_up']
                        elif year==2029 and scheduled[5:7]!='12':completion=(clocks.REAL_DATE.fromisoformat(scheduled)+timedelta(days=8)).isoformat()
                        self.clock(max(clocks.Clock.now.date().isoformat(),completion))
                        path='/reviews/'+review['review_id']
                        await self.post(path+'/start',{'occurrence_id':review['current_occurrence_id']})
                        evidence=await self.post('/evidence',{'client_id':cid,'linked_type':'review','linked_id':review['review_id'],'occurrence_id':review['current_occurrence_id'],'filename':framework+'-'+scheduled+'.txt','content_base64':'U1lOVEhFVElD'})
                        if not first_finding and definition in review.get('framework_safeguards',[]):
                            intent={'occurrence_id':review['current_occurrence_id'],'request_id':'three-year-'+framework,'title':'Synthetic operating gap','remediation_title':'Correct and independently verify the gap'}
                            first_finding=await self.post(path+'/create-finding',intent)
                            self.assertEqual((await self.post(path+'/create-finding',intent))['finding_id'],first_finding['finding_id'])
                            self.assertEqual(await server.db.tasks.count_documents({'finding_id':first_finding['finding_id']}),1)
                        if review.get('iso_audit'):
                            review=await self.get(path)
                            for item in iso_audit.PACKAGES[review['iso_audit']['package_key']]['items']:
                                review=await self.edit(path+'/iso-audit/'+item['key'],{'status':'reviewed','result':'conforming','notes':'Synthetic walkthrough executed','na_rationale':'','evidence_ids':[evidence['evidence_id']],'finding_ids':[],'occurrence_id':review['current_occurrence_id'],'expected_updated_at':review.get('updated_at')})
                            review=await self.edit(path+'/iso-audit',{'report_evidence_id':evidence['evidence_id'],'occurrence_id':review['current_occurrence_id'],'expected_updated_at':review.get('updated_at')})
                        command={'occurrence_id':review['current_occurrence_id']}
                        result=await self.post(path+'/complete',command)
                        self.assertEqual((await self.post(path+'/complete',command))['occurrence'],result['occurrence'])
                        self.assertEqual(result['occurrence']['due_date'][:10],scheduled)
                        self.assertIn(evidence['evidence_id'],[e['evidence_id'] for e in result['occurrence']['evidence']])
                        snapshots[result['occurrence']['occurrence_id']]=copy.deepcopy(result['occurrence'])
                    self.clock(f'{year}-12-31')
                    if year==2027:await self.post('/risks/'+risk['risk_id']+'/accept',{'rationale':'Synthetic controlled residual exposure','expiry_date':'2028-06-30'})
                    if year==2028:
                        expired=await self.get('/risks/'+risk['risk_id'])
                        self.assertEqual(expired['acceptance_expires_at'][:10],'2028-06-30')
                        task=(await self.get('/tasks',client_id=cid))
                        task=next(t for t in task if t.get('finding_id')==first_finding['finding_id'])
                        original_action=await self.edit('/tasks/'+task['task_id'],{'status':'done'})
                        self.assertEqual((await self.get('/findings/'+first_finding['finding_id']))['status'],'remediated')
                        first_closed=await self.post('/findings/'+first_finding['finding_id']+'/validate',{'rationale':'Synthetic independent effectiveness check'})
                        current=await self.get('/reviews/'+probe['review_id'])
                        self.assertTrue(any(o['due_date'][:10]=='2028-02-29' for o in current['occurrences']))
                        pending=await self.get('/tasks/'+handoff['task_id'])
                        disabled=await self.edit('/users/'+departing['user_id'],{'status':'disabled'})
                        self.assertEqual(disabled['status'],'disabled')
                        self.assertEqual(await self.get('/reviews/'+probe['review_id']),current)
                        self.assertEqual(await self.get('/tasks/'+handoff['task_id']),pending)
                        self.assertNotIn(departing['user_id'],[u['user_id'] for u in (await self.get('/clients/'+cid+'/assignees'))['items']])
                        unassigned=await self.edit('/tasks/'+handoff['task_id'],{'assignee_id':None})
                        self.assertIsNone(unassigned['assignee_id'])
                        self.assertEqual(unassigned['status'],'open')
                        await self.edit('/reviews/'+probe['review_id'],{'title':'Organization-selected quarterly governance checkpoint','owner_id':None,'recurrence':'quarterly','expected_occurrence_id':current['current_occurrence_id']})
                        self.assertEqual((await self.get('/reviews/'+probe['review_id']))['occurrences'],current['occurrences'])
                        self.assertIsNone((await self.get('/reviews/'+probe['review_id']))['owner_id'])
                        events.append({'at':'2028-12-31','event':'owner_departed','user_id':departing['user_id'],'review_id':probe['review_id'],'unassigned_action_id':handoff['task_id'],'preserved_occurrences':len(current['occurrences'])})
                    if year==2029:
                        await self.edit('/tasks/'+reopened_action['task_id'],{'status':'in_progress'})
                        await self.edit('/tasks/'+reopened_action['task_id'],{'status':'done'})
                        pending_validation=await self.get('/findings/'+first_finding['finding_id'])
                        self.assertEqual(pending_validation['status'],'remediated')
                        self.assertEqual(pending_validation['decision_history'],first_closed['decision_history'])
                        closed=await self.post('/findings/'+first_finding['finding_id']+'/validate',{'rationale':'Synthetic second independent effectiveness check after reopening'})
                        self.assertEqual(closed['status'],'closed')
                        self.assertEqual(closed['decision_history'][:len(first_closed['decision_history'])],first_closed['decision_history'])
                        self.assertEqual(len([h for h in closed['decision_history'] if h['action']=='validated']),2)
                        self.assertGreater(closed['closed_at'],first_closed['closed_at'])
                        self.assertEqual(await self.get('/tasks/'+original_action['task_id']),original_action)
                        self.assertIsNone((await self.get('/tasks/'+handoff['task_id']))['assignee_id'])
                        events.append({'at':'2029-12-31','event':'reopened_finding_validated','finding_id':closed['finding_id'],'validations':2,'pending_validation_observed':True,'first_decision_preserved':True})
                    live=await self.get('/reviews',client_id=cid)
                    for review in live:
                        for occurrence in review.get('occurrences',[]):self.assertEqual(occurrence,snapshots[occurrence['occurrence_id']])
                    today=f'{year}-12-31';calendar=await self.get('/calendar',client_id=cid,start=f'{year}-12-01',end=today,scope='all')
                    in_window=lambda row:bool(row.get('due_date')) and f'{year}-12-01'<=row['due_date'][:10]<=today
                    expected=set()
                    for review in live:
                        if in_window(review):expected.add('review:'+review['review_id']+':'+review['current_occurrence_id'])
                        expected.update('review:'+review['review_id']+':'+o['occurrence_id'] for o in review.get('occurrences',[]) if in_window(o))
                    entries=[item for items in calendar['reviews'].values() for item in items]
                    self.assertEqual({entry['key'] for entry in entries},expected)
                    self.assertTrue(all(entry['client_id']==cid for entry in entries))
                    dash=await self.get('/dashboard',client_id=cid)
                    findings=await self.get('/findings',client_id=cid);tasks=await self.get('/tasks',client_id=cid)
                    self.assertEqual(dash['kpis']['overdue_reviews'],sum(r.get('status') not in ('completed','cancelled') and bool(r.get('due_date')) and r['due_date'][:10]<today for r in live))
                    self.assertEqual(dash['kpis']['overdue_actions'],sum(t.get('status') not in ('done','cancelled') and bool(t.get('due_date')) and t['due_date'][:10]<today for t in tasks))
                    self.assertEqual(dash['kpis']['open_findings'],sum(f.get('status') not in ('closed','accepted','cancelled') for f in findings))
                    checkpoints.append({'at':today,'reviews':len(live),'occurrences':len(snapshots),'calendar_review_entries':len(entries),'kpis':dash['kpis'],'events':copy.deepcopy(events)})
                final_probe=await self.get('/reviews/'+probe['review_id'])
                self.assertEqual(final_probe['due_date'][:10],'2030-01-31')
                self.assertEqual(final_probe['occurrences'][0]['completed_at'][:10],'2027-01-24')
                self.assertEqual([o['completed_at'][:10] for o in final_probe['occurrences'] if o['due_date'][:10] in TIMELINE['month_end_probe']['missed_due_dates']],['2027-06-30']*2)
                await self.post('/risks/'+risk['risk_id']+'/close',{'reason':'remediated'})
                for status in ('offboarding','inactive'):await self.edit('/vendors/'+vendor['vendor_id'],{'status':status})
                self.assertEqual((await self.get('/findings/'+first_finding['finding_id']))['status'],'closed')
                self.assertTrue((await self.get('/risks/'+risk['risk_id']+'/review-history')))
                history=(await self.get(pp+'/approval-context'))['history']
                self.assertEqual(len([h for h in history if h['action']=='approved']),3)
                self.assertEqual((await self.get(ap))['assessment_history'][0],first_assessment)
                self.sign_in('member')
                denied=await self.client.get('/api/frameworks/'+framework,params={'client_id':cid})
                self.assertEqual(denied.status_code,403)
                self.sign_in('admin')
                reports.append({'framework':framework,'client_id':cid,'months':36,'checkpoints':checkpoints,'events':events,'occurrences':len(snapshots),'database':'isolated Mongo mock','completed_by':'API commands only'})
        if os.environ.get('FRAMEWORK_LIFECYCLE_EXPORT_DIR'):
            destination=Path(os.environ['FRAMEWORK_LIFECYCLE_EXPORT_DIR']);destination.mkdir(parents=True,exist_ok=True)
            (destination/'backend-three-year-report.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
