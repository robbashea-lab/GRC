"""Pilot routes against the existing isolated authorization harness."""
import unittest
import asyncio
import json
from pathlib import Path
from unittest.mock import patch
import test_framework_governance as harness
import guided_assessment
from guided_assessment import CATALOG, CONTROL1, LEGACY, PROGRAM, PROGRAM_V1, VERSIONS, current_version, validate_answers
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
        initial=(await self.client.get(self.path)).json()
        self.pilot_body={'version':current_version('1.1'),'answers':{'inventory':'No','existing':'Manual records'},'step':1,'completed':False,'expected_revision':0,
            **{key:initial[key] for key in ('base_assessment_token','base_scope_fingerprint')}}

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
        self.assertEqual(edited.json()['assessment_history'][-2]['guided_assessment_source']['version'],current_version('1.1'))

    async def test_version_transition_archives_exact_old_answers_and_narrative(self):
        identity=self.aid+':admin'
        old={'version':LEGACY['version'],'answers':{'inventory':'No'},'step':0,'completed':True,'revision':4,'narrative':'Original client-written summary','client_id':'demo_brawndo','generated_at':'2026-09-01T12:00:00Z'}
        await server.db.guided_assessment_pilot.insert_one({'_id':identity,**old})
        read=(await self.client.get(self.path)).json()
        self.assertEqual({key:read[key] for key in old},old)
        self.assertFalse(read['lineage_known'])
        started=await self.client.put(self.path,json={**self.pilot_body,'answers':{},'step':0,'expected_revision':4,'restart':True})
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
        initial=(await self.client.get(path)).json()
        body={**self.pilot_body,'version':current_version('2.1'),'answers':{'practice':'Partially','operation':'Synthetic software inventory process'},'narrative':'Original operator narrative',**{key:initial[key] for key in ('base_assessment_token','base_scope_fingerprint')}}
        first=await self.client.put(path,json=body)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual((await self.client.get(path)).json()['answers'],body['answers'])
        workspace=await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'demo_brawndo'})
        self.assertEqual(workspace.status_code,200,workspace.text)
        self.assertEqual(workspace.json()['guided_assessment_drafts']['2.1'],{'revision':1,'completed':False,'version':current_version('2.1'),'generated_at':None,'user_id':'admin'})
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
            validate_answers(definition,answers,current_version(definition,upgraded=True))
            for choice in ('Partially','No','Not sure'):
                validate_answers(definition,{**answers,'practice':choice},current_version(definition,upgraded=True))
            with self.assertRaises(HTTPException) as error:
                validate_answers(definition,{**answers,'role':'super_admin'},current_version(definition,upgraded=True))
            self.assertEqual(error.exception.status_code,422)
            with self.assertRaises(HTTPException):
                validate_answers(definition,{**answers,'operation':'x'*2001},current_version(definition,upgraded=True))
            for matrix in (q for q in questions if q['type']=='matrix'):
                excluded={**answers,matrix['id']:{matrix['rows'][0]:'Not applicable'}}
                if 'Not applicable' in matrix['choices']:
                    validate_answers(definition,excluded,current_version(definition,upgraded=True))
                else:
                    with self.assertRaises(HTTPException):
                        validate_answers(definition,excluded,current_version(definition,upgraded=True))

    async def test_175_source_condition_changes_only_its_current_schema(self):
        self.assertEqual(current_version('17.5'), 'cis-v8.1-program-4')
        for definition in PROGRAM['definitions']:
            if definition != '17.5':
                self.assertEqual(current_version(definition), PROGRAM['version'])
        old = VERSIONS[PROGRAM['version']]['safeguards']['17.5']
        corrected = VERSIONS[current_version('17.5')]['safeguards']['17.5']
        old_row = 'Incident-response responsibilities include relevant third parties.'
        new_row = 'Where relevant, third parties have assigned incident-response roles and responsibilities.'
        self.assertNotIn('Not applicable', next(q for q in old if old_row in q.get('rows', []))['choices'])
        matrix = next(q for q in corrected if new_row in q.get('rows', []))
        validate_answers('17.5', {matrix['id']: {new_row: 'Not applicable'}, 'scope_reason': 'Synthetic internally assigned response'}, current_version('17.5'))
        with self.assertRaises(HTTPException):
            validate_answers('17.5', {matrix['id']: {old_row: 'Yes'}}, current_version('17.5'))

    async def test_175_explicit_upgrade_preserves_old_interview_and_native_record_until_apply(self):
        aid = 'synthetic-17.5'
        await server.db.clients.update_one({'client_id': 'demo_brawndo'}, {'$set': {'framework_settings.cis-ig1.implementation_group': 2}})
        native = {**self.row, '_id': aid, 'framework_assessment_id': aid, 'client_id': 'demo_brawndo', 'definition_id': '17.5',
                  'implementation': 'SYNTHETIC QA: exact existing native wording.\n\n- Retain history.', 'status': 'in_progress'}
        await server.db.framework_assessments.insert_one(native)
        path = '/api/framework_assessments/' + aid + '/guided-assessment'
        old_questions = VERSIONS[PROGRAM['version']]['safeguards']['17.5']
        old_answers = {'practice': 'Yes', 'unknowns': 'Original required-practice uncertainty',
                       **{q['id']: {row: 'Yes' for row in q['rows']} for q in old_questions if q['type'] == 'matrix'}}
        old = {'version': PROGRAM['version'], 'answers': old_answers, 'step': 4, 'completed': True, 'revision': 7,
               'narrative': 'SYNTHETIC QA: completed historical reviewed wording.\n- Retain this.', 'client_id': 'demo_brawndo'}
        await server.db.guided_assessment_pilot.insert_one({'_id': aid + ':admin', **old})
        read = (await self.client.get(path)).json()
        self.assertEqual({key: read[key] for key in old}, old)
        upgrade = {**self.pilot_body, 'version': current_version('17.5'), 'answers': {}, 'step': 0, 'completed': False,
                   'narrative': '', 'expected_revision': 7, 'restart': True,
                   'base_assessment_token': read['current_assessment_token'], 'base_scope_fingerprint': read['current_scope_fingerprint']}
        restarted = await self.client.put(path, json=upgrade)
        self.assertEqual(restarted.status_code, 200, restarted.text)
        self.assertEqual(restarted.json()['answers'], {})
        self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': aid}), native)
        history = (await self.client.get(path + '/history')).json()['items']
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['answers'], old_answers)
        self.assertEqual(history[0]['narrative'], old['narrative'])
        self.assertEqual(history[0]['version'], PROGRAM['version'])
        current = restarted.json()
        answers = {'practice': 'Yes', 'scope_reason': 'SYNTHETIC QA: no relevant third-party role',
                   **{q['id']: {row: 'Not applicable' if 'Not applicable' in q['choices'] else 'Yes' for row in q['rows']}
                      for q in VERSIONS[current_version('17.5')]['safeguards']['17.5'] if q['type'] == 'matrix'}}
        text = 'OVERVIEW\nSYNTHETIC QA ONLY.\n\nIMPLEMENTATION BREAKDOWN\n- Internal response assigned.\n\nITEMS TO ADDRESS\n- Reviewed manual line.'
        completed = await self.client.put(path, json={**upgrade, 'restart': False, 'expected_revision': current['revision'],
                                                     'answers': answers, 'completed': True, 'narrative': text})
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(await server.db.framework_assessments.find_one({'framework_assessment_id': aid}), native)
        source = {key: completed.json()[key] for key in ('version', 'revision', 'generated_at')}
        applied = await self.client.patch('/api/framework_assessments/' + aid,
                                         json={'implementation': text, 'status': 'addressed', 'guided_assessment_source': source})
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertEqual(applied.json()['implementation'], text)
        self.assertEqual(applied.json()['status'], 'addressed')
        self.assertNotEqual(applied.json().get('verification'), 'verified')
        self.assertEqual(applied.json()['assessment_history'][-1]['guided_assessment_source']['version'], current_version('17.5'))


class PilotHistoryTests(unittest.IsolatedAsyncioTestCase):
    sign_in=harness.FrameworkTests.sign_in
    configure=harness.FrameworkTests.configure
    body=harness.FrameworkTests.body

    async def asyncSetUp(self):
        await GuidedTests.asyncSetUp(self)
        configuration=json.loads((Path(__file__).resolve().parents[2]/'shared/catalogs/omniWorkspacePilot.json').read_text())
        self.cid=configuration['stagingClientIds'][0]
        await server.db.clients.insert_one({'client_id':self.cid,'name':'Synthetic pilot client','status':'active'})
        await server.db.framework_assessments.update_one({'framework_assessment_id':self.aid},{'$set':{'client_id':self.cid}})
        self.initial=(await self.client.get(self.path)).json()
        self.pilot_body.update(version=self.initial['version'],**{k:self.initial[k] for k in ('base_assessment_token','base_scope_fingerprint')})

    def write(self,draft,**changes):
        return {**self.pilot_body,'version':draft['version'],'answers':draft['answers'],
                'step':draft['step'],'completed':draft['completed'],'narrative':draft.get('narrative',''),
                'expected_revision':draft['revision'],
                **{k:draft[k] for k in ('base_assessment_token','base_scope_fingerprint') if k in draft},**changes}

    async def restart_body(self,path=None):
        current=(await self.client.get(path or self.path)).json()
        return {**self.pilot_body,'version':current_version('1.1',upgraded=True),'answers':{},'step':0,
                'completed':False,'narrative':'','expected_revision':current['revision'],'restart':True,
                'base_assessment_token':current['current_assessment_token'],
                'base_scope_fingerprint':current['current_scope_fingerprint']}

    async def test_read_is_nonmutating_and_all_configured_clients_receive_current_lineage_contract(self):
        self.assertTrue(self.initial['lineage_known'])
        self.assertFalse(self.initial['lineage_stale'])
        self.assertEqual(await server.db.guided_assessment_pilot.count_documents({}),0)
        self.assertEqual(await server.db.guided_assessment_history.count_documents({}),0)
        legacy='/api/framework_assessments/'+self.foreign+'/guided-assessment'
        response=(await self.client.get(legacy)).json()
        self.assertTrue(response['lineage_known'])
        self.assertFalse(response['lineage_stale'])
        self.assertEqual(response['version'],current_version('1.1'))
        body={**self.pilot_body,'version':response['version'],**{key:response[key] for key in ('base_assessment_token','base_scope_fingerprint')}}
        saved=await self.client.put(legacy,json=body)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertIn('base_scope_fingerprint',saved.json())
        self.assertEqual((await self.client.get(legacy+'/history')).status_code,200)
        rejected=await self.client.put(legacy,json={**body,'expected_revision':1,'base_scope_fingerprint':'0'*64})
        self.assertEqual(rejected.status_code,409,rejected.text)
        denied=await self.client.put(legacy,json={**body,'version':CONTROL1['version'],'expected_revision':1})
        self.assertEqual(denied.status_code,409,denied.text)

    async def test_non_cis_pilot_workspace_retains_legacy_work_contract(self):
        for key,definition in (('soc-2','CC1.1'),('iso-27001','A.5.1')):
            aid='pilot-other-framework-'+key
            await server.db.framework_assessments.insert_one({**self.row,'_id':aid,'framework_assessment_id':aid,
                'client_id':self.cid,'framework_key':key,'definition_id':definition})
            response=await self.client.get('/api/frameworks/'+key,params={'client_id':self.cid})
            self.assertEqual(response.status_code,200,response.text)
            work=response.json()['work'][aid]
            for field in ('task_ids','context_complete','priority_records'):
                self.assertNotIn(field,work)
            self.assertEqual(response.json()['guided_assessment_drafts'],{})

    async def test_shared_lineage_fixture_matches_current_backend_formula(self):
        contract=json.loads((Path(__file__).parent/'fixtures/guided-lineage-contract.json').read_text(encoding='utf-8'))
        self.assertEqual(guided_assessment.current_base(contract['row'],contract['client']),contract['base'])

    async def test_explicit_same_version_compare_preserves_answers_wording_history_and_rejects_forged_rebase(self):
        old={'version':LEGACY['version'],'answers':{'inventory':'No','gaps':'Historical unknown steps'},
             'step':0,'completed':True,'revision':3,'narrative':'Manual historical wording\n- Preserve exactly\n','client_id':self.cid}
        await server.db.guided_assessment_pilot.insert_one({'_id':self.aid+':admin',**old})
        current=(await self.client.get(self.path)).json()
        body={'version':old['version'],'answers':old['answers'],'step':0,'completed':False,'narrative':old['narrative'],
              'expected_revision':3,'rebase':True,'base_assessment_token':current['current_assessment_token'],
              'base_scope_fingerprint':current['current_scope_fingerprint']}
        for changes in ({'answers':{'inventory':'Yes'}},{'narrative':'Replaced'},{'base_scope_fingerprint':'0'*64},{'rebase':'yes'}):
            response=await self.client.put(self.path,json={**body,**changes})
            self.assertIn(response.status_code,(409,422),response.text)
        saved=await self.client.put(self.path,json=body)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(saved.json()['answers'],old['answers']);self.assertEqual(saved.json()['narrative'],old['narrative'])
        self.assertEqual(saved.json()['version'],old['version']);self.assertFalse(saved.json()['lineage_stale'])
        self.assertEqual((await self.client.get(self.path+'/history')).json()['items'][0]['narrative'],old['narrative'])
        self.assertEqual((await self.client.put(self.path,json=body)).status_code,409)
        complete=await self.client.put(self.path,json={**body,'expected_revision':4,'completed':True,'rebase':False})
        self.assertEqual(complete.status_code,200,complete.text)
        source={key:complete.json()[key] for key in ('version','revision','generated_at')}
        self.assertEqual((await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Must not apply old source','status':'addressed','guided_assessment_source':source})).status_code,409)
        self.sign_in('member')
        self.assertEqual((await self.client.get(self.path)).status_code,403)

    async def test_all_153_native_save_adapters_preserve_the_whole_reviewed_writeup_status_and_verification(self):
        await server.db.clients.update_one({'client_id':self.cid},{'$set':{'framework_settings.cis-ig1.implementation_group':3}})
        for definition in CATALOG['definitions']:
            with self.subTest(safeguard=definition):
                aid='exact-writeup-'+definition
                original={**self.row,'_id':aid,'framework_assessment_id':aid,'client_id':self.cid,'definition_id':definition,'status':'not_assessed','implementation':'','verification':'not_verified','notes':'Unrelated native notes'}
                await server.db.framework_assessments.insert_one(original)
                path='/api/framework_assessments/'+aid+'/guided-assessment';initial=(await self.client.get(path)).json()
                reviewed='OVERVIEW\n\nSynthetic isolated client '+definition+' only.\n\nIMPLEMENTATION BREAKDOWN\n\nNeeds confirmation\n- Actual requirements are unanswered.\n\nITEMS TO ADDRESS\n\nConfirmation work\n- Confirm the actual practice.\n\nOperator edit\n- Keep punctuation and line breaks.\n'
                snapshot={'version':initial['version'],'status':'not_assessed','narrative':reviewed,'basis':[],'gaps':[],'unknowns':[],'nextSteps':[],'evidence':[],'answers':[],'signals':[]}
                interview=await self.client.put(path,json={'version':initial['version'],'answers':{},'step':0,'completed':True,'narrative':reviewed,'result':snapshot,'expected_revision':0,
                    **{key:initial[key] for key in ('base_assessment_token','base_scope_fingerprint')}})
                self.assertEqual(interview.status_code,200,interview.text)
                source={key:interview.json()[key] for key in ('version','revision','generated_at')}
                saved=await self.client.patch('/api/framework_assessments/'+aid,json={'implementation':reviewed,'status':'not_assessed','guided_assessment_source':source,'expected_last_assessed':original.get('last_saved') or original.get('last_assessed')})
                self.assertEqual(saved.status_code,200,saved.text)
                record=(await self.client.get('/api/framework_assessments/'+aid)).json()
                self.assertEqual(record['implementation'],reviewed);self.assertEqual(record['status'],'not_assessed');self.assertEqual(record['verification'],'not_verified');self.assertEqual(record['notes'],'Unrelated native notes')
                self.assertEqual(record['guided_assessment_source']['answers'],{})

    async def test_completed_edit_and_explicit_incomplete_restart_preserve_checkpoints(self):
        complete=(await self.client.put(self.path,json={**self.pilot_body,'completed':True,'narrative':'Original completed narrative'})).json()
        edited=await self.client.put(self.path,json=self.write(complete,answers={'inventory':'No','existing':'Edited report'},completed=False,narrative=''))
        self.assertEqual(edited.status_code,200,edited.text)
        prior=await server.db.guided_assessment_history.find_one({'assessment_id':self.aid,'revision':1},{'_id':0})
        self.assertEqual(prior['answers'],complete['answers'])
        self.assertEqual(prior['narrative'],'Original completed narrative')
        self.assertEqual(prior['generated_at'],complete['generated_at'])
        restart=await self.client.put(self.path,json=await self.restart_body())
        self.assertEqual(restart.status_code,200,restart.text)
        checkpoint=await server.db.guided_assessment_history.find_one({'assessment_id':self.aid,'revision':2},{'_id':0})
        self.assertEqual(checkpoint['answers'],edited.json()['answers'])
        first=(await self.client.get(self.path+'/history',params={'limit':1})).json()
        self.assertEqual([row['revision'] for row in first['items']],[2])
        self.assertTrue(first['has_more'])
        second=(await self.client.get(self.path+'/history',params={'limit':1,'before_revision':first['next_before_revision']})).json()
        self.assertEqual([row['revision'] for row in second['items']],[1])
        self.assertFalse(second['has_more'])
        self.assertEqual((await self.client.get(self.path+'/history',params={'limit':101})).status_code,422)

    async def test_completed_narrative_edit_preserves_original_completion(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True,'narrative':'Original'})).json()
        changed=await self.client.put(self.path,json=self.write(first,narrative='Reviewed edit'))
        self.assertEqual(changed.status_code,200,changed.text)
        history=(await self.client.get(self.path+'/history')).json()['items']
        self.assertEqual(history[0]['narrative'],'Original')
        self.assertEqual(history[0]['generated_at'],first['generated_at'])
        self.assertEqual(changed.json()['base_scope_fingerprint'],first['base_scope_fingerprint'])

    async def test_reported_result_roundtrip_is_bounded_and_distinct_from_edited_narrative(self):
        reported={'status':'needs_attention','narrative':'Original generated output','basis':[],
                  'gaps':['Inventory is reported missing'],'unknowns':[],'nextSteps':['Review the inventory'],
                  'evidence':['Available inventory records'],'answers':[{'prompt':'Inventory available?','answer':'No'}]}
        response=await self.client.put(self.path,json={**self.pilot_body,'completed':True,'narrative':'Operator-edited narrative','result':reported})
        self.assertEqual(response.status_code,200,response.text)
        first=response.json()
        restored=(await self.client.get(self.path)).json()
        self.assertEqual(restored['result'],reported)
        self.assertEqual(restored['narrative'],'Operator-edited narrative')
        for invalid in ({**reported,'verification':'verified'},{**reported,'status':'verified'},
                        {**reported,'gaps':['x'*4001]},{**reported,'basis':['entry']*154}):
            rejected=await self.client.put(self.path,json=self.write(first,result=invalid))
            self.assertEqual(rejected.status_code,422,rejected.text)
        editing=await self.client.put(self.path,json=self.write(first,completed=False,narrative=''))
        self.assertEqual(editing.status_code,200,editing.text)
        self.assertIsNone(editing.json()['result'])
        history=(await self.client.get(self.path+'/history')).json()['items']
        self.assertEqual(history[0]['result'],reported)
        self.assertEqual(history[0]['narrative'],'Operator-edited narrative')

    async def test_actual_frontend_engine_results_survive_save_read_and_archive(self):
        # Captured by work/generate-result-contract.cjs from the actual JS engine,
        # including its version and gap/verification signals without adaptation.
        fixtures=json.loads((Path(__file__).parent/'fixtures/guided-result-contract.json').read_text(encoding='utf-8'))
        await server.db.clients.update_one({'client_id':self.cid},{'$set':{'framework_settings.cis-ig1.implementation_group':2}})
        for case in fixtures['cases']:
            with self.subTest(case=case['name']):
                aid='engine-output-'+case['name']
                await server.db.framework_assessments.insert_one({**self.row,'_id':aid,'framework_assessment_id':aid,'client_id':self.cid,'definition_id':case['id']})
                path='/api/framework_assessments/'+aid+'/guided-assessment'
                base=(await self.client.get(path)).json()
                # These unchanged fixtures record historical program-2 engine output.
                await server.db.guided_assessment_pilot.insert_one({'_id':aid+':admin','client_id':self.cid,
                    'version':case['version'],'answers':{},'step':0,'completed':False,'narrative':'','revision':1,
                    **{key:base[key] for key in ('base_assessment_token','base_scope_fingerprint')}})
                body={**self.pilot_body,'version':case['version'],'answers':case['answers'],'completed':True,
                      'narrative':'Reviewed narrative differs from generated original','result':case['result'],'expected_revision':1,
                      **{k:base[k] for k in ('base_assessment_token','base_scope_fingerprint')}}
                response=await self.client.put(path,json=body)
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['result'],case['result'])
                self.assertEqual((await self.client.get(path)).json()['result'],case['result'])
                mismatch=await self.client.put(path,json={**body,'expected_revision':2,'result':{**case['result'],'version':'different-version'}})
                self.assertEqual(mismatch.status_code,422,mismatch.text)
                edit=await self.client.put(path,json={**body,'expected_revision':2,'completed':False,'result':None,'narrative':''})
                self.assertEqual(edit.status_code,200,edit.text)
                self.assertEqual((await self.client.get(path+'/history')).json()['items'][0]['result'],case['result'])

    async def test_start_rejects_missing_forged_and_stale_base_without_saving(self):
        missing={k:v for k,v in self.pilot_body.items() if not k.startswith('base_')}
        self.assertEqual((await self.client.put(self.path,json=missing)).status_code,409)
        self.assertEqual((await self.client.put(self.path,json={**self.pilot_body,'base_scope_fingerprint':'0'*64})).status_code,409)
        changed=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Saved while interview was open'})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual((await self.client.put(self.path,json=self.pilot_body)).status_code,409)
        self.assertEqual(await server.db.guided_assessment_pilot.count_documents({}),0)

    async def test_stale_apply_rejected_even_with_fresh_native_save_token(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        changed=await self.client.patch('/api/framework_assessments/'+self.aid,json={'notes':'Another saved assessment change'})
        self.assertEqual(changed.status_code,200,changed.text)
        before=changed.json()
        source={k:first[k] for k in ('version','revision','generated_at')}
        response=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Old proposal','status':'needs_attention','guided_assessment_source':source,'expected_last_assessed':before['last_saved']})
        self.assertEqual(response.status_code,409,response.text)
        saved=(await self.client.get('/api/framework_assessments/'+self.aid)).json()
        self.assertEqual(saved['assessment_history'],before['assessment_history'])
        self.assertEqual(saved['implementation'],before['implementation'])
        current=(await self.client.get(self.path)).json()
        self.assertTrue(current['lineage_stale'])
        attempted=await self.client.put(self.path,json=self.write(current,base_assessment_token=current['current_assessment_token']))
        self.assertEqual(attempted.status_code,409,attempted.text)

    async def test_current_pilot_apply_records_trusted_base_and_manual_clear_preserves_history(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        source={k:first[k] for k in ('version','revision','generated_at')}
        saved=await self.client.patch('/api/framework_assessments/'+self.aid,json={
            'implementation':'Reviewed reported inventory gap','status':'needs_attention','guided_assessment_source':source})
        self.assertEqual(saved.status_code,200,saved.text)
        row=saved.json()
        attribution=row['guided_assessment_source']
        self.assertEqual(attribution['by'],'admin')
        for key in ('base_assessment_token','base_scope_fingerprint'):
            self.assertEqual(attribution[key],first[key])
        self.assertEqual(attribution['answers'],first['answers'])
        self.assertNotEqual(row.get('verification'),'verified')
        manual=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Later manual revision'})
        self.assertEqual(manual.status_code,200,manual.text)
        self.assertIsNone(manual.json()['guided_assessment_source'])
        self.assertEqual(manual.json()['assessment_history'][-2]['guided_assessment_source'],attribution)
        current=(await self.client.get(self.path)).json()
        self.assertTrue(current['lineage_stale'])

    async def test_scope_change_rejects_apply_and_restart_captures_new_base(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        await server.db.clients.update_one({'client_id':self.cid},{'$set':{'framework_settings.cis-ig1.implementation_group':2,'cis_configuration_updated_at':'2026-10-07T13:00:00Z'}})
        current=(await self.client.get(self.path)).json()
        self.assertTrue(current['lineage_stale'])
        source={k:first[k] for k in ('version','revision','generated_at')}
        failed=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Stale scope proposal','status':'needs_attention','guided_assessment_source':source})
        self.assertEqual(failed.status_code,409,failed.text)
        restarted=await self.client.put(self.path,json=await self.restart_body())
        self.assertEqual(restarted.status_code,200,restarted.text)
        self.assertNotEqual(restarted.json()['base_scope_fingerprint'],first['base_scope_fingerprint'])
        self.assertFalse(restarted.json()['lineage_stale'])

    async def test_legacy_unknown_lineage_can_continue_but_not_apply_without_restart(self):
        old={'version':CONTROL1['version'],'answers':{'inventory':'No'},'step':0,'completed':True,
             'revision':4,'narrative':'Historical report','client_id':self.cid,'generated_at':'2026-09-01T12:00:00Z'}
        await server.db.guided_assessment_pilot.insert_one({'_id':self.aid+':admin',**old})
        read=(await self.client.get(self.path)).json()
        self.assertFalse(read['lineage_known'])
        self.assertIsNone(read['lineage_stale'])
        self.assertNotIn('base_assessment_token',read)
        continuation={k:v for k,v in self.write(read,narrative='New report on original question set').items() if not k.startswith('base_')}
        continued=await self.client.put(self.path,json=continuation)
        self.assertEqual(continued.status_code,200,continued.text)
        self.assertEqual(continued.json()['version'],old['version'])
        self.assertFalse(continued.json()['lineage_known'])
        source={k:continued.json()[k] for k in ('version','revision','generated_at')}
        response=await self.client.patch('/api/framework_assessments/'+self.aid,json={'implementation':'Historical result','status':'needs_attention','guided_assessment_source':source})
        self.assertEqual(response.status_code,409,response.text)
        restarted=await self.client.put(self.path,json=await self.restart_body())
        self.assertEqual(restarted.status_code,200,restarted.text)
        self.assertTrue(restarted.json()['lineage_known'])
        self.assertEqual(restarted.json()['version'],current_version('1.1',upgraded=True))
        self.assertEqual((await self.client.get(self.path+'/history')).json()['items'][-1]['narrative'],'Historical report')

    async def test_old_program_rows_resume_only_actual_saved_version_and_explicitly_restart(self):
        aid='pilot-old-13.2'
        await server.db.framework_assessments.insert_one({**self.row,'_id':aid,'framework_assessment_id':aid,'client_id':self.cid,'definition_id':'13.2'})
        await server.db.clients.update_one({'client_id':self.cid},{'$set':{'framework_settings.cis-ig1.implementation_group':2}})
        path='/api/framework_assessments/'+aid+'/guided-assessment'
        question=next(q for q in VERSIONS[PROGRAM_V1['version']]['safeguards']['13.2'] if q['type']=='matrix')
        old={'version':PROGRAM_V1['version'],'answers':{'practice':'Yes',question['id']:{question['rows'][0]:'Yes'}},
             'step':1,'completed':False,'revision':3,'narrative':'','client_id':self.cid}
        await server.db.guided_assessment_pilot.insert_one({'_id':aid+':admin',**old})
        request={k:v for k,v in self.write(old).items() if not k.startswith('base_')}
        continued=await self.client.put(path,json=request)
        self.assertEqual(continued.status_code,200,continued.text)
        self.assertEqual(continued.json()['answers'],old['answers'])
        changed_version=await self.client.put(path,json={**request,'expected_revision':4,'version':current_version('13.2',upgraded=True)})
        self.assertEqual(changed_version.status_code,409,changed_version.text)
        fresh=await self.restart_body(path)
        fresh['version']=current_version('13.2',upgraded=True)
        restarted=await self.client.put(path,json=fresh)
        self.assertEqual(restarted.status_code,200,restarted.text)
        self.assertEqual(restarted.json()['answers'],{})
        archived=(await self.client.get(path+'/history')).json()['items'][0]
        self.assertEqual(archived['version'],PROGRAM_V1['version'])
        self.assertEqual(archived['answers'],old['answers'])

    async def test_concurrent_completion_edits_keep_one_winner_and_exact_prior_snapshot(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True,'narrative':'Completed before race'})).json()
        original=guided_assessment.stored_draft
        barrier=asyncio.Event()
        arrived=0
        async def synchronized_read(*args):
            nonlocal arrived
            old=await original(*args)
            arrived+=1
            if arrived==2:barrier.set()
            await asyncio.wait_for(barrier.wait(),timeout=5)
            return old
        with patch.object(guided_assessment,'stored_draft',side_effect=synchronized_read):
            responses=await asyncio.gather(*(self.client.put(self.path,json=self.write(first,narrative=text)) for text in ('Window one','Window two')))
        self.assertEqual(sorted(r.status_code for r in responses),[200,409])
        history=(await self.client.get(self.path+'/history')).json()['items']
        self.assertEqual(len(history),1)
        self.assertEqual(history[0]['narrative'],'Completed before race')
        winner=next(r.json() for r in responses if r.status_code==200)
        current=(await self.client.get(self.path)).json()
        self.assertEqual(current['narrative'],winner['narrative'])

    async def test_archive_failure_preserves_current_draft_and_history_is_user_scoped(self):
        first=(await self.client.put(self.path,json={**self.pilot_body,'completed':True})).json()
        collection=server.db.guided_assessment_history
        original=type(collection).update_one
        async def fail_archive(target,*args,**kwargs):
            if target.name=='guided_assessment_history':
                raise RuntimeError('Isolated archive failure')
            return await original(target,*args,**kwargs)
        with patch.object(type(collection),'update_one',new=fail_archive):
            with self.assertRaises(RuntimeError):
                await self.client.put(self.path,json=self.write(first,narrative='Must not replace before archive'))
        current=(await self.client.get(self.path)).json()
        self.assertEqual(current['revision'],first['revision'])
        self.assertEqual(current['narrative'],first['narrative'])
        await self.client.put(self.path,json=self.write(first,narrative='Archived edit'))
        await server.db.users.update_one({'user_id':'member'},{'$addToSet':{'client_ids':self.cid}})
        self.sign_in('member')
        response=await self.client.get(self.path+'/history')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['items'],[])
        await server.db.users.update_one({'user_id':'member'},{'$pull':{'client_ids':self.cid}})
        self.assertEqual((await self.client.get(self.path+'/history')).status_code,403)
