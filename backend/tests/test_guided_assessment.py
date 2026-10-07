"""Pilot routes against the existing isolated authorization harness."""
import unittest
import test_framework_governance as harness
from guided_assessment import CATALOG, CONTROL1, LEGACY, PROGRAM, current_version, validate_answers
from fastapi import HTTPException
server=harness.server

class GuidedTests(unittest.IsolatedAsyncioTestCase):
    sign_in=harness.FrameworkTests.sign_in
    configure=harness.FrameworkTests.configure
    body=harness.FrameworkTests.body
    async def asyncSetUp(self):
        await harness.FrameworkTests.asyncSetUp(self)
        workspace=await self.configure()
        self.row=next(a for a in workspace['assessments'] if a['definition_id']=='1.1')
        self.foreign=self.row['framework_assessment_id']
        self.aid='pilot-1.1'
        await server.db.clients.insert_one({'client_id':'demo_brawndo','name':'Brawndo','status':'active'})
        await server.db.framework_assessments.insert_one({**self.row,'_id':self.aid,'framework_assessment_id':self.aid,'client_id':'demo_brawndo','owner_id':'member'})
        self.path='/api/framework_assessments/'+self.aid+'/guided-assessment'
        self.pilot_body={'version':current_version('1.1'),'answers':{'inventory':'No','existing':'Manual records'},'step':1,'completed':False,'expected_revision':0}

    async def test_pilot_save_resume_is_separate_and_conflict_safe(self):
        before=await server.db.framework_assessments.find_one({'framework_assessment_id':self.aid})
        first=await self.client.put(self.path,json=self.pilot_body)
        self.assertEqual(first.status_code,200,first.text)
        resumed=await self.client.get(self.path)
        self.assertEqual(resumed.json()['answers'],self.pilot_body['answers'])
        stale=await self.client.put(self.path,json=self.pilot_body)
        self.assertEqual(stale.status_code,409,stale.text)
        after=await server.db.framework_assessments.find_one({'framework_assessment_id':self.aid})
        self.assertEqual(before,after)

    async def test_authorization_scope_user_isolation_and_answer_validation(self):
        self.sign_in('member')
        self.assertEqual((await self.client.get(self.path)).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$addToSet':{'client_ids':'demo_brawndo'}})
        self.assertEqual((await self.client.put(self.path,json=self.pilot_body)).status_code,200)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.get(self.path)).status_code,200)
        self.assertEqual((await self.client.put(self.path,json={**self.pilot_body,'expected_revision':1})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.get(self.path)).json()['answers'],{})
        inherited='/api/framework_assessments/'+self.foreign+'/guided-assessment'
        self.assertEqual((await self.client.get(inherited)).status_code,200)
        for bad in [{'foreign':'secret'},{'coverage':{'Foreign':'Yes'}},{'owner':'x'*2001}]:
            self.assertEqual((await self.client.put(self.path,json={**self.pilot_body,'answers':bad})).status_code,422)
        await server.db.clients.update_one({'client_id':'demo_brawndo'},{'$set':{'framework_settings':{'cis-ig1':{'implementation_group':2}}}})
        self.assertEqual((await self.client.get(self.path)).status_code,200)

    async def test_apply_source_snapshot_native_save_and_manual_edit(self):
        draft=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        source={k:draft[k] for k in ('version','revision','generated_at')}
        saved=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Brawndo reports no inventory.','status':'needs_attention','guided_assessment_source':source})
        self.assertEqual(saved.status_code,200,saved.text)
        row=saved.json()
        self.assertTrue(row['last_assessed'])
        self.assertEqual(row['guided_assessment_source']['answers'],self.pilot_body['answers'])
        self.assertEqual(row['assessment_history'][-1]['guided_assessment_source']['origin'],'guided-assessment-pilot')
        self.assertNotEqual(row.get('verification'),'verified')
        edited=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Manually revised'})
        self.assertEqual(edited.status_code,200,edited.text)
        self.assertIsNone(edited.json()['guided_assessment_source'])
        self.assertEqual(edited.json()['assessment_history'][-2]['guided_assessment_source']['version'],CONTROL1['version'])

    async def test_version_transition_archives_exact_old_answers_and_narrative(self):
        identity=self.aid+':admin'
        old={'version':LEGACY['version'],'answers':{'inventory':'No'},'step':0,'completed':True,'revision':4,'narrative':'Original client-written summary','client_id':'demo_brawndo','generated_at':'2026-09-01T12:00:00Z'}
        await server.db.guided_assessment_pilot.insert_one({'_id':identity,**old})
        self.assertEqual((await self.client.get(self.path)).json(),old)
        started=await self.client.put(self.path,json={**self.pilot_body,'answers':{},'step':0,'expected_revision':4})
        self.assertEqual(started.status_code,200,started.text)
        archived=await server.db.guided_assessment_history.find_one({'_id':identity+':4'})
        self.assertEqual(archived['answers'],old['answers'])
        self.assertEqual(archived['narrative'],old['narrative'])
        self.assertEqual(archived['version'],LEGACY['version'])
        self.assertEqual(started.json()['revision'],5)

    async def test_program_applicability_tracks_groups_without_copying_answers(self):
        for group in (1,2,3):
            allowed={id for id,d in CATALOG['definitions'].items() if group in d['groups']}
            self.assertEqual(len(allowed), {1:56,2:130,3:153}[group])
            await server.db.clients.update_one({'client_id':'demo_brawndo'},{'$set':{'framework_settings':{'cis-ig1':{'implementation_group':group}}}})
            for definition in CATALOG['definitions']:
                aid='scope-'+definition
                await server.db.framework_assessments.update_one({'framework_assessment_id':aid},{'$set':{**self.row,'_id':aid,'framework_assessment_id':aid,'client_id':'demo_brawndo','definition_id':definition}},upsert=True)
                response=await self.client.get('/api/framework_assessments/'+aid+'/guided-assessment')
                self.assertEqual(response.status_code,200 if definition in allowed else 404,response.text)
                if definition in allowed:self.assertEqual(response.json()['answers'],{})

    async def test_expanded_interview_persistence_authorization_and_workspace_summary(self):
        aid='expanded-2.1'
        await server.db.framework_assessments.insert_one({**self.row,'_id':aid,'framework_assessment_id':aid,'client_id':'demo_brawndo','definition_id':'2.1'})
        path='/api/framework_assessments/'+aid+'/guided-assessment'
        body={**self.pilot_body,'version':current_version('2.1'),'answers':{'practice':'Partially','operation':'Synthetic software inventory process'},'narrative':'Original operator narrative'}
        first=await self.client.put(path,json=body)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual((await self.client.get(path)).json()['answers'],body['answers'])
        workspace=await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'demo_brawndo'})
        self.assertEqual(workspace.status_code,200,workspace.text)
        self.assertEqual(workspace.json()['guided_assessment_drafts']['2.1'],{'revision':1,'completed':False})
        self.sign_in('member')
        self.assertEqual((await self.client.get(path)).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$addToSet':{'client_ids':'demo_brawndo'}})
        self.assertEqual((await self.client.get(path)).json()['answers'],{})
        workspace=await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'demo_brawndo'})
        self.assertNotIn('2.1',workspace.json()['guided_assessment_drafts'])
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.client.put(path,json=body)).status_code,403)
        self.client.cookies.clear()
        self.client.headers.pop('Authorization',None)
        self.assertEqual((await self.client.get(path)).status_code,401)
        self.assertEqual((await self.client.put(path,json=body)).status_code,401)

    async def test_all_expanded_question_sets_validate_only_their_own_bounded_answers(self):
        for definition in PROGRAM['definitions']:
            questions=CATALOG['safeguards'][definition]
            answers={q['id']:{row:'Yes' for row in q['rows']} if q['type']=='matrix' else '' if q['type']=='text' else 'Yes' for q in questions}
            validate_answers(definition,answers,current_version(definition))
            for choice in ('Partially','No','Not sure'):
                validate_answers(definition,{**answers,'practice':choice},current_version(definition))
            with self.assertRaises(HTTPException) as error:
                validate_answers(definition,{**answers,'role':'super_admin'})
            self.assertEqual(error.exception.status_code,422)
            with self.assertRaises(HTTPException):
                validate_answers(definition,{**answers,'operation':'x'*2001})
            for matrix in (q for q in questions if q['type']=='matrix'):
                excluded={**answers,matrix['id']:{matrix['rows'][0]:'Not applicable'}}
                if 'Not applicable' in matrix['choices']:
                    validate_answers(definition,excluded)
                else:
                    with self.assertRaises(HTTPException):
                        validate_answers(definition,excluded)
