"""CIS-only additive setup, real authenticated routes with isolated Mongo mock."""
import unittest
from test_framework_governance import FrameworkTests as Base
from test_client_dashboard_sources import server

class CisOperationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=Base.asyncSetUp
    sign_in=Base.sign_in
    body=Base.body
    configure=Base.configure

    async def test_four_operating_patterns_preserve_independent_conclusions_and_history(self):
        workspace=await self.configure()
        for sid,method in [('1.2','Provider weekly unauthorized-device quarantine; ticket reference'),('6.2','HR termination triggers immediate IT revocation; event ticket'),('4.1','Significant network change triggers process reassessment'),('11.2','Provider weekly backups; failed job requires corrective work')]:
            row=next(r for r in workspace['assessments'] if r['definition_id']==sid)
            path='/api/framework_assessments/'+row['framework_assessment_id']
            response=await self.client.patch(path,json={'owner_id':'member','implementation':method,'cis_operation':{'provider':'Synthetic MSP and internal oversight','confirmed':True}})
            self.assertEqual(response.status_code,200,response.text)
            saved=response.json();self.assertEqual(saved['status'],'not_assessed');self.assertIsNone(saved.get('verification'))
            self.assertTrue(saved['cis_operation']['confirmed'])
            history=saved['assessment_history'][0]
            saved=(await self.client.get(path)).json();self.assertEqual(saved['implementation'],method)
            response=await self.client.patch(path,json={'implementation':method+' — scope changed'})
            self.assertEqual(response.status_code,200,response.text)
            self.assertFalse(response.json()['cis_operation']['confirmed'])
            self.assertEqual(response.json()['assessment_history'][0],history)
            if sid=='11.2':
                gap={'title':'Synthetic failed backup check','remediation_title':'Correct failed job and validate the next result','request_id':'synthetic-failed-check'}
                for _ in range(2):
                    finding=await self.client.post(path+'/findings',json=gap)
                    self.assertEqual(finding.status_code,200,finding.text)
                self.assertEqual(await server.db.tasks.count_documents({'finding_id':finding.json()['finding_id']}),1)
                result=await self.client.patch(path,json={'status':'needs_attention','verification':'gap_identified'})
                self.assertEqual(result.status_code,200,result.text)
                self.assertEqual(result.json()['verification'],'gap_identified')
                linked=(await self.client.get(path+'/related')).json()
                self.assertEqual(len(linked['findings']),1);self.assertEqual(len(linked['tasks']),1)
        reviews=await server.db.reviews.find({'client_id':'a'}).to_list(None)
        old=[(r['review_id'],r['due_date'],r['recurrence']) for r in reviews]
        await self.configure()
        after=await server.db.reviews.find({'client_id':'a'}).to_list(None)
        self.assertEqual([(r['review_id'],r['due_date'],r['recurrence']) for r in after],old)

    async def test_confirmation_validation_role_scope_and_framework_boundary(self):
        workspace=await self.configure();row=workspace['assessments'][0];path='/api/framework_assessments/'+row['framework_assessment_id']
        for op in ({'confirmed':True},{'confirmed':'true'},{'provider':'x'*2001},{'isAdmin':True}):
            response=await self.client.patch(path,json={'cis_operation':op})
            self.assertEqual(response.status_code,422,response.text)
        response=await self.client.patch(path,json={'owner_id':'admin','implementation':None,'cis_operation':{'confirmed':True}})
        self.assertEqual(response.status_code,422,response.text)
        await server.db.users.insert_one({'user_id':'reader','email':'reader@example.test','name':'Reader','role':'client_readonly','client_ids':['a'],'status':'active'})
        self.sign_in('reader');self.assertEqual((await self.client.patch(path,json={'cis_operation':{'confirmed':False}})).status_code,403)
        self.sign_in('member')
        await server.db.framework_assessments.insert_one({'framework_assessment_id':'foreign','client_id':'b','framework_key':'cis-ig1','definition_id':'1.1'})
        self.assertEqual((await self.client.patch('/api/framework_assessments/foreign',json={'cis_operation':{'confirmed':False}})).status_code,403)
        self.sign_in('admin')
        await self.client.post('/api/onboarding/baseline',json=self.body(programs=('iso-27001',)))
        iso=await server.db.framework_assessments.find_one({'client_id':'a','framework_key':'iso-27001'})
        response=await self.client.patch('/api/framework_assessments/'+iso['framework_assessment_id'],json={'cis_operation':{'confirmed':False}})
        self.assertEqual(response.status_code,422,response.text)

    async def test_shared_library_evidence_is_scoped_deduplicated_and_excludes_archived(self):
        workspace=await self.configure();row=workspace['assessments'][0]
        aid=row['framework_assessment_id'];rid=row['related_links'][0]['id']
        for eid,cid,archived in [('support','a',False),('archived','a',True),('foreign','b',False)]:
            await server.db.evidence.insert_one({'evidence_id':eid,'client_id':cid,'filename':eid+'.txt','linked_type':'vendors','linked_id':'unused','relationships':[{'kind':'reviews','id':rid,'occurrence_id':'historic'}],**({'archived_at':'2026-01-01'} if archived else {})})
        await server.db.framework_assessments.update_one({'framework_assessment_id':aid},{'$addToSet':{'related_links':{'kind':'evidence','id':'support'}}})
        response=await self.client.get('/api/framework_assessments/'+aid+'/related')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([e['evidence_id'] for e in response.json()['evidence']],['support'])

if __name__=='__main__':unittest.main()
