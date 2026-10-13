"""Real authorized routes with isolated Mongo; no hosted or durable-Mongo claims."""
from copy import deepcopy
import asyncio
import unittest
import json
from pathlib import Path
import subprocess
from unittest.mock import patch
from fastapi import HTTPException

import assessment_items
import guided_assessment
import test_framework_governance as harness

server = harness.server


class AssessmentItemsTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure

    async def completed(self, row, answers=None):
        base = '/api/framework_assessments/' + row['framework_assessment_id']
        draft = (await self.client.get(base + '/guided-assessment')).json()
        if draft['revision']:
            response = await self.client.put(base + '/guided-assessment', json={
                'version': draft['version'], 'expected_revision': draft['revision'], 'answers': {},
                'step': 0, 'completed': False, 'restart': True, 'narrative': '',
                'base_assessment_token': draft['current_assessment_token'],
                'base_scope_fingerprint': draft['current_scope_fingerprint']})
            self.assertEqual(response.status_code, 200, response.text)
            draft = response.json()
        answers = answers or {'practice': 'No', 'gaps': 'Reported gap'}
        answers={**answers}
        for question in guided_assessment.VERSIONS[draft['version']]['safeguards'][row['definition_id']]:
            if question['type']=='matrix':
                answers.setdefault(question['id'],{name:answers['practice'] for name in question['rows']})
        result = {'version': draft['version'], 'status': 'needs_attention', 'narrative': 'Reported practice.\n\nControls in place',
            'basis': [], 'gaps': ['Reported incomplete practice'], 'unknowns': [], 'nextSteps': [], 'evidence': [], 'answers': [],
            'signals': [{'questionId': 'practice', 'kind': 'gap'}] if answers['practice'] != 'Yes' else []}
        response = await self.client.put(base + '/guided-assessment', json={
            'version': draft['version'], 'expected_revision': draft['revision'], 'answers': answers,
            'step': 0, 'completed': True, 'narrative': result['narrative'], 'result': result,
            **{key: draft[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}})
        self.assertEqual(response.status_code, 200, response.text)
        return base, response.json()

    async def apply(self, base, draft, row):
        response = await self.client.patch(base, json={
            'implementation': draft['narrative'], 'status': draft['result']['status'],
            'expected_last_assessed': row.get('last_saved') or row.get('last_assessed'),
            'guided_assessment_source': {key: draft[key] for key in ('version', 'revision', 'generated_at')}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def initial(self):
        workspace = await self.configure()
        row = next(row for row in workspace['assessments'] if row['definition_id'] == '2.1')
        base, draft = await self.completed(row)
        return base, await self.apply(base, draft, row)

    async def test_atomic_apply_resolution_reload_and_independent_judgment(self):
        base, row = await self.initial()
        count=sum(question['type']=='matrix' for question in guided_assessment.CATALOG['safeguards']['2.1'])+1
        self.assertEqual(len(row['items_to_address']), count)
        item = row['items_to_address'][0]
        protected = {key: deepcopy(row.get(key)) for key in
            ('implementation', 'status', 'verification', 'last_assessed', 'last_saved', 'assessment_history')}
        response = await self.client.patch(base + '/items/' + item['item_id'], json={
            'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Work completed; reassessment pending.'})
        self.assertEqual(response.status_code, 200, response.text)
        saved = (await self.client.get(base)).json()
        self.assertEqual(saved['items_to_address'][0]['state'], 'resolved')
        self.assertEqual({key: saved.get(key) for key in protected}, protected)
        self.assertEqual(saved['items_to_address'][0]['history'][-1]['by'], 'admin')
        stale = await self.client.patch(base + '/items/' + item['item_id'], json={
            'expected_revision': row['items_revision'], 'state': 'open', 'resolution': ''})
        self.assertEqual(stale.status_code, 409)
        base, draft = await self.completed(saved)
        reapplied = await self.apply(base, draft, saved)
        self.assertEqual(reapplied['items_to_address'][0]['state'], 'resolved')
        self.assertEqual(reapplied['items_to_address'][0]['resolution'], 'Work completed; reassessment pending.')
        base, draft = await self.completed(reapplied, {'practice': 'Partially', 'gaps': 'Reported gap'})
        changed = await self.apply(base, draft, reapplied)
        self.assertEqual(changed['items_to_address'][0]['state'], 'open')
        self.assertEqual(changed['items_to_address'][0]['resolution'], 'Work completed; reassessment pending.')
        base, draft = await self.completed(changed, {'practice': 'Yes', 'gaps': ''})
        removed = await self.apply(base, draft, changed)
        self.assertTrue(all(item['state'] == 'superseded' for item in removed['items_to_address']))
        self.assertEqual(len(removed['items_to_address']), count)
        self.assertGreater(len(removed['items_to_address'][0]['history']), 3)

    async def test_origin_validation_cross_tenant_readonly_and_assignment(self):
        base, row = await self.initial()
        item = row['items_to_address'][0]
        payload = {'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Done'}
        self.sign_in('member')
        unassigned = await self.client.patch(base + '/items/' + item['item_id'], json=payload)
        self.assertEqual(unassigned.status_code, 403)
        await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'owner_id': 'member'}})
        assigned = await self.client.patch(base + '/items/' + item['item_id'], json=payload)
        self.assertEqual(assigned.status_code, 200, assigned.text)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        readonly = await self.client.patch(base + '/items/' + item['item_id'], json={**payload, 'expected_revision': assigned.json()['items_revision']})
        self.assertEqual(readonly.status_code, 403)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_contributor', 'client_ids': ['b']}})
        forbidden = await self.client.patch(base + '/items/' + item['item_id'], json=payload)
        self.assertEqual(forbidden.status_code, 403)
        self.sign_in('admin')
        foreign = await self.client.patch(base + '/items/item_foreign', json={**payload, 'expected_revision': assigned.json()['items_revision']})
        self.assertEqual(foreign.status_code, 404)
        forged = await self.client.patch(base, json={'items_to_address': [], 'expected_last_assessed': row.get('last_saved')})
        self.assertEqual(forged.status_code, 422)

    async def test_explicit_finding_retries_new_intents_and_cross_actor_do_not_duplicate(self):
        base, row = await self.initial()
        item = row['items_to_address'][0]
        payload = {'item_id': item['item_id'], 'title': 'Explicit formal follow-up', 'remediation_title': 'Close reported gap',
            'description': item['text'], 'request_id': 'first-item-finding', 'owner_id': 'member'}
        first = await self.client.post(base + '/findings', json=payload)
        self.assertEqual(first.status_code, 200, first.text)
        saved = (await self.client.get(base)).json()
        self.assertEqual(saved['items_to_address'][0]['finding_id'], first.json()['finding_id'])
        self.assertEqual(saved['items_to_address'][0]['state'], 'open')
        for request_id in ('first-item-finding', 'second-intent-same-item'):
            retry = await self.client.post(base + '/findings', json={**payload, 'request_id': request_id})
            self.assertEqual(retry.status_code, 200, retry.text)
            self.assertEqual(retry.json()['finding_id'], first.json()['finding_id'])
        await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'owner_id': 'member'}})
        self.sign_in('member')
        other_actor = await self.client.post(base + '/findings', json={**payload, 'request_id': 'cross-actor'})
        self.assertEqual(other_actor.status_code, 200, other_actor.text)
        self.assertEqual(await server.db.findings.count_documents({'framework_assessment_id': row['framework_assessment_id']}), 1)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id': first.json()['finding_id']}), 1)

    async def test_native_guided_apply_does_not_overwrite_concurrent_item_resolution(self):
        base, row = await self.initial()
        base, draft = await self.completed(row, {'practice': 'Partially', 'gaps': 'Gap remains'})
        collection = server.db.framework_assessments
        original = type(collection).update_one

        async def interleave(current_collection, query, update, *args, **kwargs):
            if '$push' in update and 'items_to_address' in update.get('$set', {}):
                await original(current_collection, {'framework_assessment_id': row['framework_assessment_id']}, {
                    '$set': {'items_to_address.0.state': 'resolved', 'items_to_address.0.resolution': 'Concurrent completion',
                             'items_revision': row['items_revision'] + 1}})
            return await original(current_collection, query, update, *args, **kwargs)

        with patch.object(type(collection), 'update_one', new=interleave):
            response = await self.client.patch(base, json={'implementation': draft['narrative'], 'status': draft['result']['status'],
                'expected_last_assessed': row.get('last_saved'),
                'guided_assessment_source': {key: draft[key] for key in ('version', 'revision', 'generated_at')}})
        self.assertEqual(response.status_code, 409, response.text)
        saved = (await self.client.get(base)).json()
        self.assertEqual(saved['implementation'], row['implementation'])
        self.assertEqual(saved['items_to_address'][0]['resolution'], 'Concurrent completion')

    async def test_interrupted_finding_can_recover_after_origin_is_superseded(self):
        base,row=await self.initial()
        item=row['items_to_address'][0]
        payload={'item_id':item['item_id'],'title':'Formal follow-up','remediation_title':'Complete corrective work','request_id':'recover-item'}
        with patch.object(server,'finding_create_task',side_effect=HTTPException(503,'Isolated interrupted action write')):
            interrupted=await self.client.post(base+'/findings',json=payload)
        self.assertEqual(interrupted.status_code,503,interrupted.text)
        self.assertEqual(await server.db.findings.count_documents({'framework_assessment_id':row['framework_assessment_id']}),1)
        await server.db.framework_assessments.update_one({'framework_assessment_id':row['framework_assessment_id']},
            {'$set':{'items_to_address.0.state':'superseded','items_revision':row['items_revision']+1}})
        recovered=await self.client.post(base+'/findings',json=payload)
        self.assertEqual(recovered.status_code,200,recovered.text)
        saved=(await self.client.get(base)).json()
        self.assertEqual(saved['items_to_address'][0]['state'],'superseded')
        self.assertEqual(saved['items_to_address'][0]['finding_id'],recovered.json()['finding_id'])
        self.assertEqual(await server.db.tasks.count_documents({'finding_id':recovered.json()['finding_id']}),1)

    async def test_concurrent_finding_intents_share_one_native_finding_and_action(self):
        base,row=await self.initial()
        item=row['items_to_address'][0]
        payload={'item_id':item['item_id'],'title':'Explicit concurrent follow-up','remediation_title':'Correct reported practice'}
        payloads=[{**payload,'request_id':'concurrent-item-'+str(index)} for index in range(2)]
        responses=await asyncio.gather(*(self.client.post(base+'/findings',json=body) for body in payloads))
        self.assertIn(200,[response.status_code for response in responses])
        for body,response in zip(payloads,responses):
            self.assertIn(response.status_code,(200,409),response.text)
            if response.status_code==409:
                response=await self.client.post(base+'/findings',json=body)
                self.assertEqual(response.status_code,200,response.text)
        findings=await server.db.findings.find({'framework_assessment_id':row['framework_assessment_id']}).to_list(None)
        self.assertEqual(len(findings),1)
        self.assertEqual(await server.db.tasks.count_documents({'finding_id':findings[0]['finding_id']}),1)
        saved=(await self.client.get(base)).json()
        self.assertEqual(saved['items_to_address'][0]['state'],'open')
        self.assertEqual(saved['items_to_address'][0]['finding_id'],findings[0]['finding_id'])


class AssessmentItemsReconciliationTests(unittest.TestCase):
    def test_canonical_origins_match_existing_browser_evaluators_for_every_record(self):
        cases=[]
        records=set()
        def affirmative(question):
            if question['type']=='matrix':return {name:'Yes' for name in question['rows']}
            if question['type']=='multi':return [next((choice for choice in question['choices'] if choice not in ('None','Not sure')),question['choices'][0])]
            if question['type']=='date':return '2026-10-13'
            if question['type']=='text':return ''
            if question['type']=='context':return 'Relevant'
            return 'Yes' if 'Yes' in question['choices'] else question['choices'][0]
        for framework,definitions in (('cis-ig1',guided_assessment.CATALOG['definitions']),
                ('soc-2',guided_assessment.soc_guided_assessment.CATALOG['definitions']),
                ('iso-27001',guided_assessment.iso_guided_assessment.CATALOG['definitions'])):
            for definition in definitions:
                records.add((framework,definition))
                row={'framework_assessment_id':framework+':'+definition,'framework_key':framework,'definition_id':definition}
                version=guided_assessment.current_version(definition,framework=framework)
                draft={'version':version,'answers':{},'generated_at':'2026-10-13T12:00:00+00:00'}
                all_questions=guided_assessment.VERSIONS[version]['safeguards'][definition] if framework=='cis-ig1' else guided_assessment.soc_guided_assessment._questions(definition,version) if framework=='soc-2' else guided_assessment.iso_guided_assessment._questions(definition,version)
                questions={question['id']:question for question in all_questions}
                answers={key:affirmative(question) for key,question in questions.items()}
                variants=[answers,{**answers,'gaps':'\ufeff','unknowns':'\ufeff'},
                    {**answers,'gaps':'Reported supplemental gap','unknowns':'Reported supplemental confirmation'}]
                for key,question in questions.items():
                    if question['type']=='matrix':
                        for choice in question['choices']:
                            variants.append({**answers,key:{name:choice for name in question['rows']},'scope_reason':'Source condition absent' if choice=='Not applicable' else ''})
                    elif question['type']=='multi':
                        variants.extend({**answers,key:[choice]} for choice in question['choices'])
                        variants.append({**answers,key:[]})
                    elif question['type']=='date':
                        variants.extend({**answers,key:value} for value in ('','invalid','2026-01-01','2026-10-14','2026-04-13','2026-04-12'))
                    elif question['type']!='text':
                        variants.extend({**answers,key:choice} for choice in question['choices'])
                for variant in variants:
                    try:
                        guided_assessment.validate_answers(definition,variant,version)
                    except HTTPException:
                        continue  # Row-specific choices remain part of the unchanged answer boundary.
                    cases.append({'framework':framework,'id':definition,'version':version,'answers':variant})
        self.assertEqual({(case['framework'],case['id']) for case in cases},records)
        script=r"""
const fs=require('node:fs'),path=require('node:path'),root=process.argv[1],cache=new Map();
const allowed=new Set(['guidedAssessment','socGuidedAssessment','isoGuidedAssessment','inlineAssessment']);
function load(name){
  if(!allowed.has(name))throw new Error('Unreviewed evaluator import '+name);
  if(cache.has(name))return cache.get(name);
  let source=fs.readFileSync(path.join(root,'frontend/src/lib',name+'.js'),'utf8');const params=[],inputs=[];
  source=source.replace(/^import (.+?) from ['"](.+?)['"];\r?\n/gm,(_,binding,reference)=>{
    params.push(binding);inputs.push(reference.startsWith('@catalogs/')?JSON.parse(fs.readFileSync(path.join(root,'shared/catalogs',reference.slice(10)),'utf8')):load(reference.slice(2)));return '';
  });
  const names=[...source.matchAll(/^export (?:const|function) (\w+)/gm)].map(match=>match[1]);
  const engine=new Function(...params,source.replace(/\bexport /g,'')+'\nreturn {'+names.join(',')+'};')(...inputs);cache.set(name,engine);return engine;
}
const cis=load('guidedAssessment'),soc=load('socGuidedAssessment'),iso=load('isoGuidedAssessment');
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(cases.map(({framework,id,version,answers})=>{
  const result=framework==='cis-ig1'?cis.generateResult(id,answers,new Date('2026-10-13T12:00:00Z'),version):framework==='soc-2'?soc.socGuidedResult(id,answers,version):iso.isoGuidedResult(id,answers,version);
  const origins=(result.signals||[]).map(signal=>signal.questionId+':'+signal.kind);
  for(const [key,kind] of [['gaps','gap'],['unknowns','verification']])if(answers[key]?.trim())origins.push(key+':'+kind);
  if(result.unknowns.some(text=>text.startsWith('No substantive practice is established')||text.startsWith('The overall practice answer conflicts with the reported absence')))origins.push('summary_confirmation:verification');
  return [...new Set(origins)].sort();
})));
"""
        result=subprocess.run(['node','-e',script,str(Path(__file__).resolve().parents[2])],input=json.dumps(cases),
            capture_output=True,text=True,timeout=60)
        self.assertEqual(result.returncode,0,result.stderr)
        expected=json.loads(result.stdout)
        self.assertEqual(len(expected),len(cases))
        for case,origins in zip(cases,expected):
            with self.subTest(framework=case['framework'],definition=case['id'],answers=case['answers']):
                row={'framework_assessment_id':'synthetic','framework_key':case['framework'],'definition_id':case['id']}
                draft={'version':case['version'],'answers':case['answers'],'generated_at':'2026-10-13T12:00:00+00:00',
                    'result':{'signals':[{'questionId':'forged','kind':'gap','text':'Ignored client metadata'}]}}
                actual=sorted(item['question_id']+':'+item['kind'] for item in assessment_items.generated(row,draft))
                self.assertEqual(actual,origins)

    def test_matrix_signal_aggregates_all_current_deficient_and_unconfirmed_rows(self):
        row={'framework_assessment_id':'cis-matrix','framework_key':'cis-ig1','definition_id':'2.1'}
        version=guided_assessment.current_version('2.1')
        matrix=next(question for question in guided_assessment.VERSIONS[version]['safeguards']['2.1'] if question['type']=='matrix')
        values={name:'Yes' for name in matrix['rows']}
        values[matrix['rows'][0]]='No'
        values[matrix['rows'][1]]='Partially'
        draft={'version':version,'answers':{'practice':'Yes',matrix['id']:values},
            'result':{'gaps':['First row only','Second row also'], 'signals':[{'questionId':matrix['id'],'kind':'gap'}]}}
        item=assessment_items.generated(row,draft)[0]
        self.assertIn(matrix['rows'][0],item['text'])
        self.assertIn(matrix['rows'][1],item['text'])
        self.assertEqual(item['question_id'],matrix['id'])
        draft['answers'][matrix['id']]={matrix['rows'][0]:'Not sure'}
        draft['result']={'signals':[{'questionId':matrix['id'],'kind':'verification'}]}
        confirmation=assessment_items.generated(row,draft)[0]
        self.assertTrue(all(name in confirmation['text'] for name in matrix['rows']))

    def test_every_framework_origins_and_stable_matrix_identity(self):
        for framework, definition, version, question in (
                ('cis-ig1', '2.1', guided_assessment.current_version('2.1'), 'practice'),
                ('soc-2', 'CC1.1', guided_assessment.soc_guided_assessment.CATALOG['version'], 'cc11_integrity'),
                ('iso-27001', '4.1', guided_assessment.iso_guided_assessment.current_version('4.1'), None)):
            row = {'framework_assessment_id': framework + '-synthetic', 'framework_key': framework, 'definition_id': definition}
            draft = {'version': version, 'answers': {}, 'result': {'signals': []}}
            questions = assessment_items._questions(row, draft)
            question = next(q for q in questions if questions[q]['type']=='matrix') if framework=='cis-ig1' else question if question in questions else next(q for q in questions if questions[q].get('type') not in ('text','context'))
            draft['answers']={q:({name:'Yes' for name in detail['rows']} if detail['type']=='matrix' else '' if detail['type']=='text' else 'Relevant' if detail['type']=='context' else 'Yes') for q,detail in questions.items()}
            draft['answers'][question]={name:'No' for name in questions[question]['rows']} if questions[question]['type']=='matrix' else 'No'
            draft['result']['signals'] = [{'questionId': question, 'kind': 'gap', 'text': 'Reported gap'}]
            items = assessment_items.reconcile(row, draft, 'reviewer', 'now')
            self.assertEqual(items[0]['question_id'], question)
            items[0].update(state='resolved', resolution='Retained note', finding_id='fnd-native')
            row['items_to_address'] = items
            unchanged = assessment_items.reconcile(row, deepcopy(draft), 'reviewer', 'later')
            self.assertEqual(unchanged, items)
            draft['answers'][question + '_detail'] = 'Explicit current limitation'
            reopened = assessment_items.reconcile(row, draft, 'reviewer', 'later')
            self.assertEqual(reopened[0]['item_id'], items[0]['item_id'])
            self.assertEqual((reopened[0]['state'], reopened[0]['resolution'], reopened[0]['finding_id']),
                ('open', 'Retained note', 'fnd-native'))
            clean=deepcopy(draft)
            clean['answers'][question]={name:'Yes' for name in questions[question]['rows']} if questions[question]['type']=='matrix' else 'Yes'
            clean['result']={'signals':[{'questionId':question,'kind':'gap','text':'Forged false gap'}]}
            superseded=assessment_items.reconcile(row,clean,'reviewer','later')
            self.assertEqual(superseded[0]['state'],'superseded')
            restored=assessment_items.reconcile({**row,'items_to_address':superseded},draft,'reviewer','even later')
            self.assertEqual(restored[0]['state'],'open')
            self.assertEqual((restored[0]['resolution'],restored[0]['finding_id']),('Retained note','fnd-native'))
