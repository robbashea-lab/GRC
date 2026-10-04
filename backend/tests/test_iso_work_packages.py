"""ISO discovery changes preserve existing authorized records; isolated Mongo mock."""
import base64
import unittest
from test_iso_framework import IsoTests
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server

class IsoWorkPackageTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=Harness.asyncSetUp
    sign_in=Harness.sign_in
    configure=IsoTests.configure

    async def call(self,method,path,body=None,status=200):
        response=await self.client.request(method,'/api/'+path,json=body)
        self.assertEqual(response.status_code,status,response.text)
        return response.json()

    async def test_existing_information_is_not_an_implementation_conclusion_or_schedule_change(self):
        workspace=await self.configure()
        reviews=await self.call('GET','reviews?client_id=a')
        untouched=await self.call('GET','onboarding/handoff?client_id=a')
        self.assertTrue(all(not r['iso_establishment_information_recorded'] for r in untouched['records']['framework_assessments']))
        row=next(a for a in workspace['assessments'] if a['definition_id']=='6.2')
        saved=await self.call('PATCH','framework_assessments/'+row['framework_assessment_id'],{'notes':'Controlled objective register v1 https://records.example/objectives; target RTO <=4h; owner CTO; measurement quarterly'})
        self.assertEqual(saved['status'],'not_assessed')
        self.assertIsNone(saved.get('verification'))
        handoff=await self.call('GET','onboarding/handoff?client_id=a')
        projected=next(a for a in handoff['records']['framework_assessments'] if a['definition_id']=='6.2')
        self.assertTrue(projected['iso_establishment_information_recorded'])
        self.assertEqual(projected['status'],'not_assessed')
        self.assertFalse({'notes','implementation','related_links'} & projected.keys())
        self.assertEqual(await self.call('GET','reviews?client_id=a'),reviews)
        await self.configure()
        self.assertEqual(await self.call('GET','reviews?client_id=a'),reviews)
        self.assertEqual((await self.call('GET','framework_assessments/'+row['framework_assessment_id']))['notes'],saved['notes'])
        self.sign_in('member')
        await self.call('GET','frameworks/iso-27001?client_id=b',status=403)
        await server.db.users.insert_one({'user_id':'reader','email':'reader@example.test','role':'client_readonly','status':'active','client_ids':['a']})
        self.sign_in('reader')
        await self.call('PATCH','framework_assessments/'+row['framework_assessment_id'],{'notes':'not allowed'},status=403)

    async def test_custom_risk_control_changes_preserve_annex_snapshot_and_retained_complete_soa_support(self):
        workspace=await self.configure();aids={a['definition_id']:a['framework_assessment_id'] for a in workspace['assessments']}
        risk=await self.call('POST','risks',{'client_id':'a','title':'Synthetic export risk','owner_id':'admin','treatment':'mitigate'})
        control=await self.call('POST','organizational-controls',{'client_id':'a','request_id':'iso-necessary-export','name':'Necessary export authorization','description':'Necessary for export risk; justification and current implementation v1','frequency':'Client-selected, each sensitive export','design':'not_assessed','owner_id':'admin','assessment_ids':[aids['6.1.3']],'related_links':[{'kind':'risks','id':risk['risk_id']}]})
        self.assertEqual((await self.call('GET','organizational-controls/'+control['control_id']))['linked_records']['risks'][0]['risk_id'],risk['risk_id'])
        reviews=await self.call('GET','reviews?client_id=a');soa=next(r for r in reviews if r.get('framework_plan_key')=='iso-soa-review')
        soa=await self.call('PATCH','reviews/'+soa['review_id'],{'due_date':'2030-10-31','owner_id':'admin','expected_occurrence_id':soa['current_occurrence_id']})
        text='Synthetic complete SoA supplement v1: necessary export control, risk justification and implementation v1; Annex decisions separately recorded.'
        evidence=await self.call('POST','evidence',{'client_id':'a','filename':'controlled-SoA-v1.txt','mime_type':'text/plain','content_base64':base64.b64encode(text.encode()).decode(),'linked_type':'review','linked_id':soa['review_id'],'occurrence_id':soa['current_occurrence_id']})
        complete=await self.call('POST','reviews/'+soa['review_id']+'/complete',{'occurrence_id':soa['current_occurrence_id'],'conclusion':'Practitioner conclusion references controlled complete SoA v1','completion_notes':evidence['evidence_id']})
        frozen=complete['occurrence']['iso_soa_snapshot'];self.assertEqual(len(frozen['assessments']),93)
        self.assertNotIn(control['control_id'],str(frozen))
        design={k:control.get(k) for k in ('name','description','frequency','design','owner_id','assessment_ids','related_links')}
        changed=await self.call('PATCH','organizational-controls/'+control['control_id'],{**design,'description':'Necessary export authorization design v2','assessment_ids':[aids['A.8.12']],'related_links':[],'expected_updated_at':control['updated_at']})
        self.assertTrue(changed['history'])
        await self.call('PATCH','framework_assessments/'+aids['A.8.30'],{'soa_applicability':'excluded','soa_justification':'Synthetic in-house development decision'})
        history=await self.call('GET','reviews/'+soa['review_id']+'/history');self.assertEqual(history[0]['iso_soa_snapshot'],frozen)
        download=await self.call('GET','evidence/'+evidence['evidence_id']+'/download');self.assertEqual(base64.b64decode(download['content_base64']).decode(),text)
        self.sign_in('member')
        await self.call('PATCH','organizational-controls/'+control['control_id'],{**design,'expected_updated_at':changed['updated_at']},status=403)
        await self.call('POST','risks/'+risk['risk_id']+'/accept',{'rationale':'Not authorized','expiry_date':'2031-10-31'},status=403)

    async def test_management_review_retains_substance_actions_and_original_occurrence_after_next_cycle_edits(self):
        await self.configure();reviews=await self.call('GET','reviews?client_id=a')
        review=next(r for r in reviews if r.get('framework_plan_key')=='iso-management-review')
        notes='Leadership: CEO and ISMS owner; prior Actions, changed context/feedback, risk, objectives, audit and performance inputs; controlled minutes https://records.example/minutes-v1'
        review=await self.call('PATCH','reviews/'+review['review_id'],{'due_date':'2030-10-31','owner_id':'admin','notes':notes,'expected_occurrence_id':review['current_occurrence_id']})
        action=await self.call('POST','tasks',{'client_id':'a','title':'Approve recovery improvement resources','assignee_id':'admin','review_id':review['review_id']})
        done=await self.call('POST','reviews/'+review['review_id']+'/complete',{'occurrence_id':review['current_occurrence_id'],'conclusion':'Leadership evaluated suitability/effectiveness; fund recovery improvement; retain action','tested_scope':'Scoped ISMS','tested_period':'2030','completion_notes':notes})
        self.assertTrue(done['review']['due_date'].startswith('2031-10-31'))
        original=(await self.call('GET','reviews/'+review['review_id']+'/history'))[0]
        self.assertEqual(original['notes'],notes);self.assertEqual(original['conclusion'],done['occurrence']['conclusion'])
        await self.call('PATCH','reviews/'+review['review_id'],{'notes':'Next-cycle agenda v2','expected_occurrence_id':done['review']['current_occurrence_id']})
        self.assertEqual((await self.call('GET','reviews/'+review['review_id']+'/history'))[0],original)
        self.assertEqual((await self.call('GET','tasks/'+action['task_id']))['review_id'],review['review_id'])

if __name__=='__main__':unittest.main()
