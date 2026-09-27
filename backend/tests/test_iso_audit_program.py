"""Prospective audit packages use normal authorization, Evidence and Review history."""
from datetime import date, timedelta
import test_iso_framework
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
import unittest
import iso_audit
from framework_catalog import ISO


class IsoAuditTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in
    configure = test_iso_framework.IsoTests.configure

    async def activate(self, **overrides):
        await self.configure()
        body = {'client_id':'a','start_date':(date.today()+timedelta(days=10)).isoformat(),
                'first_package':'governance-risk','auditor_id':'admin','scope':'Synthetic ISMS scope',
                'independence':'Independent auditor; another auditor reviews the program itself',**overrides}
        response = await self.client.post('/api/iso-audit/activate',json=body)
        self.assertEqual(response.status_code,200,response.text)
        return response.json(),body

    async def item(self,review,key,**fields):
        return await self.client.patch('/api/reviews/'+review['review_id']+'/iso-audit/'+key,json={
            'occurrence_id':review['current_occurrence_id'],'expected_updated_at':review.get('updated_at'),
            'status':'reviewed','result':'conforming','notes':'Synthetic walkthrough verified',
            'na_rationale':'','evidence_ids':[],'finding_ids':[],**fields})

    def test_workbook_population_and_identifiers(self):
        items=[i for p in iso_audit.PACKAGES.values() for i in p['items']]
        self.assertEqual([len(p['items']) for p in iso_audit.PACKAGES.values()],[28,28,40,28])
        self.assertEqual(len(items),124)
        self.assertEqual({i['definition_id'] for i in items},{i['id'] for i in ISO['requirements']})
        self.assertTrue(all(i['guidance'] and i['verify'] and i['questions'] for i in items))
        body=iso_audit.Activation(client_id='a',start_date='2030-10-01',first_package='physical-technology',auditor_id='admin',scope='Scope',independence='Independent')
        self.assertEqual([p['due_date'] for p in iso_audit.activation_plan(body)],['2030-12-31','2031-03-31','2031-06-30','2031-09-30'])
        self.assertEqual(iso_audit.activation_plan(body)[0]['package_key'],'physical-technology')

    async def test_explicit_prospective_idempotent_activation_preserves_existing_reviews(self):
        await self.configure()
        existing=await server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        self.assertIsNone((await self.client.get('/api/iso-audit',params={'client_id':'a'})).json()['program'])
        data,body=await self.activate()
        self.assertEqual(len(data['reviews']),4)
        self.assertEqual((await self.client.post('/api/iso-audit/activate',json=body)).status_code,200)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),14)
        for old in existing:
            self.assertEqual(await server.db.reviews.find_one({'review_id':old['review_id']},{'_id':0}),old)
        self.assertTrue(all(r['due_date']>=body['start_date'] for r in data['reviews']))
        altered=await self.client.post('/api/iso-audit/activate',json={**body,'auditor_id':'member'})
        self.assertEqual(altered.status_code,409)
        await self.configure(cid='b')
        past=await self.client.post('/api/iso-audit/activate',json={**body,'client_id':'b','start_date':'2020-01-01'})
        self.assertEqual(past.status_code,422)

    async def test_assignment_isolation_mass_assignment_and_stale_write(self):
        data,body=await self.activate()
        review=data['reviews'][0];key=iso_audit.PACKAGES[review['iso_audit']['package_key']]['items'][0]['key']
        self.sign_in('member')
        denied=await self.item(review,key)
        self.assertEqual(denied.status_code,403,denied.text)
        self.assertEqual((await self.client.post('/api/iso-audit/activate',json=body)).status_code,403)
        self.assertEqual((await self.client.get('/api/iso-audit',params={'client_id':'b'})).status_code,403)
        self.sign_in('admin')
        result=await self.item(review,key,client_id='b')
        self.assertEqual(result.status_code,422)
        await server.db.evidence.insert_one({'evidence_id':'foreign','client_id':'b','filename':'Synthetic.txt'})
        result=await self.item(review,key,evidence_ids=['foreign'])
        self.assertEqual(result.status_code,422)
        result=await self.item(review,key)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual((await self.item(review,key,notes='stale overwrite')).status_code,409)
        self.assertEqual(result.json()['iso_audit']['items'][key]['notes'],'Synthetic walkthrough verified')
        await server.db.reviews.update_one({'review_id':review['review_id']},{'$set':{'owner_id':'member'}})
        self.sign_in('member')
        current=(await self.client.get('/api/reviews/'+review['review_id'])).json()
        self.assertEqual((await self.item(current,key,notes='Assigned auditor update')).status_code,200)

    async def test_closure_results_findings_evidence_and_five_year_history(self):
        data,_=await self.activate()
        review=data['reviews'][0];rid=review['review_id'];package=iso_audit.PACKAGES[review['iso_audit']['package_key']]
        await server.db.evidence.insert_one({'evidence_id':'report','client_id':'a','filename':'DEMO audit report.txt','version':1,'sha256':'synthetic','created_at':server._now()})
        initial_oid=review['current_occurrence_id']
        for cycle in range(1,6):
            denied=await self.client.post('/api/reviews/'+rid+'/complete',json={'occurrence_id':review['current_occurrence_id']})
            self.assertEqual(denied.status_code,422)
            for n,item in enumerate(package['items']):
                result=await self.item(review,item['key'],result='' if n==0 else 'conforming',evidence_ids=['report'])
                self.assertEqual(result.status_code,200,result.text);review=result.json()
            self.assertEqual(iso_audit.progress(review['iso_audit'])['complete'],len(package['items'])-1)
            first=package['items'][0]['key']
            result=await self.item(review,first,result='nonconformity',evidence_ids=['report']);review=result.json()
            report=await self.client.patch('/api/reviews/'+rid+'/iso-audit',json={'occurrence_id':review['current_occurrence_id'],'expected_updated_at':review['updated_at'],'report_evidence_id':'report'})
            self.assertEqual(report.status_code,200,report.text);review=report.json()
            self.assertEqual((await self.client.post('/api/reviews/'+rid+'/complete',json={'occurrence_id':review['current_occurrence_id']})).status_code,422)
            finding=await self.client.post('/api/reviews/'+rid+'/create-finding',json={'occurrence_id':review['current_occurrence_id'],'request_id':'item-'+first,'title':'Synthetic audit gap','remediation_title':'Resolve synthetic audit gap'})
            self.assertEqual(finding.status_code,200,finding.text)
            # Fetch latest Review token, as normal callers must after another workflow writes.
            review=(await self.client.get('/api/reviews/'+rid)).json()
            result=await self.item(review,first,result='nonconformity',evidence_ids=['report'],finding_ids=[finding.json()['finding_id']])
            self.assertEqual(result.status_code,200,result.text);review=result.json()
            closed=await self.client.post('/api/reviews/'+rid+'/complete',json={'occurrence_id':review['current_occurrence_id']})
            self.assertEqual(closed.status_code,200,closed.text)
            snap=closed.json()['occurrence'];review=closed.json()['review']
            self.assertEqual(snap['iso_audit']['cycle'],cycle)
            self.assertEqual(snap['iso_audit']['progress']['complete'],len(package['items']))
            self.assertEqual(review['iso_audit']['items'],{})
            self.assertEqual(review['iso_audit']['cycle'],cycle+1)
            self.assertEqual((await server.db.findings.find_one({'finding_id':finding.json()['finding_id']}))['status'],'in_remediation')
        self.assertEqual(len(review['occurrences']),5)
        self.assertEqual(review['occurrences'][0]['occurrence_id'],initial_oid)
        self.assertEqual(review['occurrences'][0]['iso_audit']['items'][first]['result'],'nonconformity')
        catalog=await self.client.get('/api/evidence/catalog',params={'client_id':'a','entity_type':'reviews','entity_id':rid,'occurrence_id':initial_oid})
        self.assertEqual(catalog.status_code,200,catalog.text)
        self.assertEqual(catalog.json()['total'],1)
        current=await self.client.get('/api/evidence/catalog',params={'client_id':'a','entity_type':'reviews','entity_id':rid,'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(current.json()['total'],0)

    async def test_soa_review_snapshots_do_not_follow_later_applicability_changes(self):
        await self.configure()
        a=await server.db.framework_assessments.find_one({'client_id':'a','definition_id':'A.8.30'})
        path='/api/framework_assessments/'+a['framework_assessment_id']
        result=await self.client.patch(path,json={'status':'in_progress','soa_applicability':'excluded','soa_justification':'Synthetic scope has no outsourced development'})
        self.assertEqual(result.status_code,200,result.text)
        reviews=(await self.client.get('/api/reviews',params={'client_id':'a'})).json()
        review=next(r for r in reviews if any(d.get('framework_plan_key')=='iso-soa-review' for d in r.get('framework_drivers',[])))
        review=(await self.client.patch('/api/reviews/'+review['review_id'],json={'due_date':date.today().isoformat(),'expected_occurrence_id':review['current_occurrence_id']})).json()
        closed=await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(closed.status_code,200,closed.text)
        snapshot=closed.json()['occurrence']['iso_soa_snapshot']
        self.assertEqual(len(snapshot['assessments']),93)
        await self.client.patch(path,json={'soa_applicability':'included','soa_justification':'Synthetic supplier entered scope'})
        history=(await self.client.get('/api/reviews/'+review['review_id']+'/history')).json()
        self.assertEqual(history[0]['iso_soa_snapshot'],snapshot)
        old=next(r for r in snapshot['assessments'] if r['definition_id']=='A.8.30')
        self.assertEqual((old['soa_applicability'],old['status']),('excluded','in_progress'))
        self.assertNotIn('assessment_history',old)
