"""Final five-framework program lifecycle against real FastAPI and isolated Mongo."""
import unittest
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from test_soc_framework import SocTests


class FrameworkProgramTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def ok(self, method, path, **kwargs):
        r=await self.client.request(method,'/api'+path,**kwargs)
        self.assertEqual(r.status_code,200,r.text)
        return r.json()

    async def test_five_framework_lifecycle_and_authoritative_history(self):
        await SocTests.configure(self,('cis-ig1','hipaa','iso-27001','soc-2','nist-csf-2'))
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),394)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),23)
        contact=await self.ok('POST','/contacts',json={'client_id':'a','name':'Synthetic Business Owner','title':'IT Director'})
        vendor=await self.ok('POST','/vendors',json={'client_id':'a','name':'Synthetic Identity Provider','service':'Identity service','criticality':'high','business_owner_id':'member'})
        risk=await self.ok('POST','/risks',json={'client_id':'a','title':'Excessive access exposure','owner_id':'member','likelihood_score':3,'impact_score':4,'treatment':'mitigate'})
        refs={'cis-ig1':'6.1','hipaa':'164.308(a)(4)(ii)(B)','iso-27001':'A.5.18','soc-2':'CC6.2','nist-csf-2':'PR.AA-05'}
        assessments={k:await server.db.framework_assessments.find_one({'client_id':'a','framework_key':k,'definition_id':v}) for k,v in refs.items()}
        for key,a in assessments.items():
            path='/framework_assessments/'+a['framework_assessment_id']
            changes={'implementation':'Access grants documented; review evidence being validated','status':'in_progress','owner_id':'member','process_owner_id':contact['contact_id']}
            if key=='iso-27001':changes.update(soa_applicability='included',soa_justification='Identity risk treatment')
            if key=='nist-csf-2':changes['csf_profile']={'target_selected':True,'target_outcome':'Validated least privilege','priority':'high','gap_state':'gap','gap_notes':'Review evidence incomplete'}
            await self.ok('PATCH',path,json=changes)
            for kind,record_id in [('vendors',vendor['vendor_id']),('risks',risk['risk_id'])]:await self.ok('POST',path+'/links',json={'kind':kind,'id':record_id})
        review=await server.db.reviews.find_one({'client_id':'a','framework_plan_key':'account-authorization'})
        rid=review['review_id'];current=await self.ok('GET','/reviews/'+rid)
        current=await self.ok('PATCH','/reviews/'+rid,json={'owner_id':'member','due_date':'2026-09-30','recurrence':'quarterly','expected_occurrence_id':current['current_occurrence_id']})
        oid=current['current_occurrence_id']
        await self.ok('POST','/reviews/'+rid+'/start',json={'occurrence_id':oid})
        evidence=await self.ok('POST','/evidence',json={'client_id':'a','linked_type':'review','linked_id':rid,'occurrence_id':oid,'filename':'synthetic-access-review.txt','content_base64':'c3ludGhldGlj'})
        for a in assessments.values():await self.ok('POST','/framework_assessments/'+a['framework_assessment_id']+'/links',json={'kind':'evidence','id':evidence['evidence_id']})
        finding=await self.ok('POST','/reviews/'+rid+'/create-finding',json={'occurrence_id':oid,'title':'Access review validation incomplete','remediation_title':'Validate access exceptions','severity':'high'})
        action=await server.db.tasks.find_one({'finding_id':finding['finding_id']})
        with patch.object(server,'_now',return_value='2026-10-01T12:00:00+00:00'):
            completed=await self.ok('POST','/reviews/'+rid+'/complete',json={'occurrence_id':oid})
        second=completed['review'];self.assertEqual(second['due_date'][:10],'2026-12-31')
        await self.ok('PATCH','/tasks/'+action['task_id'],json={'status':'done'})
        await self.ok('POST','/findings/'+finding['finding_id']+'/validate',json={'rationale':'Access exceptions validated against supporting records'})
        with patch.object(server,'_now',return_value='2027-01-01T12:00:00+00:00'):
            completed=await self.ok('POST','/reviews/'+rid+'/complete',json={'occurrence_id':second['current_occurrence_id']})
        self.assertEqual(completed['review']['due_date'][:10],'2027-03-31')
        self.assertEqual(len(await self.ok('GET','/reviews/'+rid+'/history')),2)
        self.assertEqual(await server.db.reviews.count_documents({'client_id':'a'}),23)
        self.assertEqual(await server.db.evidence.count_documents({'client_id':'a'}),1)
        for a in assessments.values():
            path='/framework_assessments/'+a['framework_assessment_id'];saved=await self.ok('GET',path)
            self.assertEqual(saved['status'],'in_progress');self.assertEqual(len(saved['assessment_history']),1)
            related=await self.ok('GET',path+'/related')
            self.assertIn(evidence['evidence_id'],[e['evidence_id'] for e in related['evidence']])
        self.assertEqual((await server.db.evidence.find_one({'evidence_id':evidence['evidence_id']}))['occurrence_id'],oid)
        policy=await server.db.policies.find_one({'client_id':'a','baseline_key':'policy-access-control-identity-management-policy'})
        pp='/policies/'+policy['policy_id']
        await self.ok('POST',pp+'/verify',json={'status':'draft','version':'1'})
        for version in ['1','2']:
            if version=='2':await self.ok('PATCH',pp,json={'version':'2'})
            await self.ok('POST',pp+'/approval-subject',json={'version':version,'external_reference':'https://documents.example.test/access-policy','external_version':'fixture-'+version})
            submitted=await self.ok('POST',pp+'/submit-review')
            await self.ok('POST',pp+'/approve',json={'approval_request_id':submitted['approval_request_id'],'comment':'Synthetic policy version reviewed'})
        history=(await self.ok('GET',pp+'/approval-context'))['history']
        self.assertEqual([h['subject']['version'] for h in history if h['action']=='approved'],['1','2'])
        summary=await self.ok('GET','/frameworks/summary',params={'client_id':'a'})
        self.assertEqual(len(summary['items']),5)
        self.assertTrue(all(p['status_counts']['in_progress']==1 for p in summary['items']))
        await self.ok('GET','/dashboard',params={'client_id':'a'})
        calendar=await self.ok('GET','/calendar',params={'client_id':'a','start':'2027-03-01','end':'2027-03-31'})
        self.assertIn(rid,str(calendar))
        before=await server.db.framework_assessments.count_documents({'client_id':'a'})
        for key in refs:
            for applicability in ['does_not_apply','applies']:
                await self.ok('PATCH','/onboarding/programs/'+key,json={'client_id':'a','applicability':applicability})
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id':'a'}),before)
        self.assertEqual(len(await self.ok('GET','/reviews/'+rid+'/history')),2)
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/frameworks/summary?client_id=b')).status_code,403)
