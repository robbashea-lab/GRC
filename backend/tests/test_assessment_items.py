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
import portfolio_activity
import test_framework_governance as harness

server = harness.server


class AssessmentItemsTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure

    async def test_current_control1_root_confirmation_native_repeat_preserves_id_notes_and_history(self):
        initial_workspace=await self.configure()
        changed=await self.client.patch('/api/frameworks/cis-ig1/configuration',json={
            'client_id':'a','implementation_group':3,'expected_updated_at':initial_workspace['configuration']['expected_updated_at']},
            headers={'Idempotency-Key':'synthetic-root-confirmation-scope'})
        self.assertEqual(changed.status_code,200,changed.text)
        workspace=(await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'a'})).json()
        for identity in ('1.3','1.4','1.5'):
            with self.subTest(definition=identity):
                row=next(row for row in workspace['assessments'] if row['definition_id']==identity)
                root=guided_assessment.CONTROL1_V5['definitions'][identity]['root']
                base='/api/framework_assessments/'+row['framework_assessment_id']
                initial=(await self.client.get(base+'/guided-assessment')).json()
                self.assertEqual(initial['version'],guided_assessment.CONTROL1_V5['version'])
                answers={root:'Not sure',root+'_detail':'Synthetic QA cannot confirm this practice.',
                    'additional_gap':'No','additional_confirmation':'No'}
                for q in guided_assessment.CONTROL1_V5['safeguards'][identity]:
                    if q['id'] in ('coverage','frequency','inventory_update'):
                        answers[q['id']]='No' if 'No' in q['choices'] else q['choices'][0]
                result={'version':initial['version'],'status':'not_assessed','narrative':'Synthetic QA reports an unconfirmed practice.',
                    'basis':[],'gaps':[],'unknowns':['Confirm the reported practice.'],'nextSteps':[],'evidence':[],'answers':[],
                    'signals':[{'questionId':root,'kind':'verification'}]}
                body={'version':initial['version'],'answers':answers,'step':0,'completed':True,'narrative':result['narrative'],
                    'result':result,'expected_revision':initial['revision'],
                    **{key:initial[key] for key in ('base_assessment_token','base_scope_fingerprint')}}
                response=await self.client.put(base+'/guided-assessment',json=body)
                self.assertEqual(response.status_code,200,response.text)
                draft=response.json()
                replay=await self.client.put(base+'/guided-assessment',json={**body,'expected_revision':draft['revision']})
                self.assertEqual(replay.status_code,200,replay.text)
                self.assertEqual(replay.json()['revision'],draft['revision'])
                saved=await self.apply(base,draft,row)
                self.assertEqual(saved['status'],'not_assessed')
                self.assertEqual(saved.get('verification'),row.get('verification'))
                self.assertEqual(len(saved['items_to_address']),1)
                item=saved['items_to_address'][0]
                self.assertEqual((item['question_id'],item['kind'],item['state']),(root,'verification','open'))
                self.assertIn(answers[root+'_detail'],item['text'])
                response=await self.client.patch(base+'/items/'+item['item_id'],json={
                    'expected_revision':saved['items_revision'],'state':'resolved','resolution':'Synthetic retained analyst confirmation note.'})
                self.assertEqual(response.status_code,200,response.text)
                resolved=response.json()
                repeated=await self.apply(base,draft,resolved)
                for key in ('items_to_address','items_revision','assessment_history','status','verification','implementation','last_saved'):
                    self.assertEqual(repeated.get(key),resolved.get(key))
                self.assertEqual(repeated['items_to_address'][0]['item_id'],item['item_id'])
                self.assertEqual((await self.client.get(base)).json()['items_to_address'],resolved['items_to_address'])

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
        if draft['version'] in (guided_assessment.PROGRAM_V5['version'],guided_assessment.CONTROL1_V5['version']):
            for parent,key in [('additional_gap','gaps'),('additional_confirmation','unknowns')]:
                if answers.get(key):answers.setdefault(parent,'Yes')
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

    async def test_unchanged_interview_and_applied_native_save_are_idempotent(self):
        workspace=await self.configure()
        row=next(row for row in workspace['assessments'] if row['definition_id']=='2.1')
        base,draft=await self.completed(row)
        payload={key:draft[key] for key in ('version','answers','step','completed','narrative','result','base_assessment_token','base_scope_fingerprint')}
        payload['expected_revision']=draft['revision']
        history=await server.db.guided_assessment_history.count_documents({})
        response=await self.client.put(base+'/guided-assessment',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['revision'],draft['revision'])
        self.assertEqual(response.json()['generated_at'],draft['generated_at'])
        self.assertEqual(await server.db.guided_assessment_history.count_documents({}),history)
        saved=await self.apply(base,draft,row)
        native={key:draft[key] for key in ('version','revision','generated_at')}
        response=await self.client.patch(base,json={'implementation':saved['implementation'],'status':saved['status'],
            'expected_last_assessed':saved['last_saved'],'guided_assessment_source':native})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['last_saved'],saved['last_saved'])
        self.assertEqual(response.json()['assessment_history'],saved['assessment_history'])
        changed=await self.client.put(base+'/guided-assessment',json={**payload,'step':1})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual(changed.json()['revision'],draft['revision']+1)

    async def test_ranking_metadata_proves_same_item_and_native_risk_without_changing_counts(self):
        base,row=await self.initial()
        item=next(item for item in row['items_to_address'] if item['kind']=='gap')
        created=await self.client.post(base+'/findings',json={'title':'Isolated specific gap','remediation_title':'Correct the isolated gap',
            'severity':'high','request_id':'ranking-origin','item_id':item['item_id']})
        self.assertEqual(created.status_code,200,created.text)
        finding=created.json()
        await server.db.risks.insert_one({'risk_id':'rank-risk','client_id':'a','status':'open','likelihood_score':5,'impact_score':5})
        await server.db.risks.insert_one({'risk_id':'foreign-risk','client_id':'b','status':'open','likelihood_score':5,'impact_score':5})
        await server.db.findings.update_one({'finding_id':finding['finding_id']},{'$set':{'risk_id':'rank-risk'}})
        workspace=await self.configure()
        current=next(record for record in workspace['assessments'] if record['framework_assessment_id']==row['framework_assessment_id'])
        work=workspace['work'][row['framework_assessment_id']]
        record=next(record for record in work['priority_records'] if record['kind']=='findings')
        self.assertEqual(record['client_id'],'a')
        self.assertEqual(record['framework_assessment_id'],row['framework_assessment_id'])
        self.assertEqual(record['assessment_item_id'],item['item_id'])
        self.assertTrue(record['open_gap'])
        risk=next(record for record in work['priority_records'] if record['kind']=='risks')
        self.assertEqual((risk['id'],risk['risk_level']),('rank-risk','critical'))
        self.assertNotIn('foreign-risk',str(work))
        self.assertEqual((current['status'],current.get('verification')),(row['status'],row.get('verification')))

    async def test_unchanged_native_application_can_acknowledge_the_same_committed_source(self):
        base,saved=await self.initial()
        source={key:saved['guided_assessment_source'][key] for key in ('version','revision','generated_at')}
        response=await self.client.patch(base,json={'implementation':saved['implementation'],'status':saved['status'],
            'expected_last_assessed':saved['last_saved'],'guided_assessment_source':source})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['last_saved'],saved['last_saved'])
        self.assertEqual(response.json()['assessment_history'],saved['assessment_history'])

    async def test_closed_finding_retains_exact_active_risk_projection_without_open_count(self):
        base,row=await self.initial()
        item=next(item for item in row['items_to_address'] if item['kind']=='gap')
        response=await self.client.post(base+'/findings',json={'title':'Isolated closed connector','remediation_title':'Correct the specific gap',
            'severity':'low','request_id':'closed-ranking-origin','item_id':item['item_id']})
        self.assertEqual(response.status_code,200,response.text);finding=response.json()
        await server.db.risks.insert_one({'risk_id':'accepted-ranking-risk','client_id':'a','status':'accepted','likelihood_score':5,'impact_score':5,
            'next_review':'2026-12-01','acceptance_expires_at':'2026-11-01'})
        await server.db.findings.update_one({'finding_id':finding['finding_id']},{'$set':{'risk_id':'accepted-ranking-risk'}})
        tasks=await server.db.tasks.find({'finding_id':finding['finding_id'],'client_id':'a'}).to_list(None)
        self.assertEqual(len(tasks),1)
        response=await self.client.patch('/api/tasks/'+tasks[0]['task_id'],json={'status':'done','expected_updated_at':tasks[0]['updated_at']})
        self.assertEqual(response.status_code,200,response.text)
        pending=await server.db.findings.find_one({'finding_id':finding['finding_id']})
        response=await self.client.post('/api/findings/'+finding['finding_id']+'/validate',json={
            'request_id':'close-ranking-connector','rationale':'Controlled validation of completed work','expected_updated_at':pending['updated_at']})
        self.assertEqual(response.status_code,200,response.text)
        workspace=(await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'a'})).json();work=workspace['work'][row['framework_assessment_id']]
        self.assertEqual(work['open_findings'],0);self.assertEqual(work['finding_ids'],[])
        connector=next((record for record in work['priority_records'] if record['kind']=='findings'),None)
        self.assertIsNotNone(connector)
        self.assertEqual((connector['id'],connector['status'],connector['assessment_item_id']),(finding['finding_id'],'closed',item['item_id']))
        self.assertFalse(connector['open_gap'])
        risk=next(record for record in work['priority_records'] if record['kind']=='risks')
        self.assertEqual((risk['id'],risk['status'],risk['risk_level']),('accepted-ranking-risk','accepted','critical'))
        self.assertEqual(risk['due_date'],'2026-11-01')
        await server.db.risks.update_one({'risk_id':'accepted-ranking-risk'},{'$set':{'status':'assessed'}})
        next_workspace=(await self.client.get('/api/frameworks/cis-ig1',params={'client_id':'a'})).json()
        next_risk=next(record for record in next_workspace['work'][row['framework_assessment_id']]['priority_records'] if record['kind']=='risks')
        self.assertEqual(next_risk['due_date'],'2026-12-01')
        persisted=await server.db.framework_assessments.find_one({'framework_assessment_id':row['framework_assessment_id']})
        self.assertEqual((persisted['status'],persisted['last_saved']),(row['status'],row['last_saved']))

    async def test_items_response_filters_capture_fields_on_update_and_noop(self):
        base, row = await self.initial()
        item = row['items_to_address'][0]
        path = base + '/items/' + item['item_id']
        body = {'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Native resolution'}
        for _ in range(2):
            response = await self.client.patch(path, json=body)
            self.assertEqual(response.status_code, 200, response.text)
            public = response.json()
            for field in portfolio_activity.SOURCE_INTERNAL_FIELDS:
                self.assertNotIn('"' + field + '":', json.dumps(public))
            self.assertEqual(public['items_to_address'][0]['resolution'], 'Native resolution')
            body['expected_revision'] = public['items_revision']
        internal = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        self.assertTrue(internal['_portfolio_activity_last_event_id'])
        self.assertEqual(public['items_revision'], row['items_revision'] + 1)

    async def test_repeated_item_transitions_at_same_time_have_distinct_committed_events(self):
        base, row = await self.initial()
        query = {'source_kind': 'framework_assessments', 'source_id': row['framework_assessment_id']}
        original_events = await server.db.portfolio_events.count_documents(query)
        item = row['items_to_address'][0]
        event_ids = []
        fixed = server._now()
        with patch.object(server, '_now', return_value=fixed):
            for state in ('resolved', 'open', 'resolved'):
                response = await self.client.patch(base + '/items/' + item['item_id'], json={
                    'expected_revision': row['items_revision'], 'state': state, 'resolution': ''})
                self.assertEqual(response.status_code, 200, response.text)
                row = response.json()
                internal = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
                event_ids.append(internal['_portfolio_activity_last_event_id'])
        self.assertEqual(len(set(event_ids)), 3)
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 3)
        await portfolio_activity.reconcile_pending(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 3)

    async def test_item_activity_preserves_judgment_and_recovers_projection_failure(self):
        base, row = await self.initial()
        query = {'source_kind': 'framework_assessments', 'source_id': row['framework_assessment_id']}
        original_events = await server.db.portfolio_events.count_documents(query)
        protected = {key: deepcopy(row.get(key)) for key in ('status', 'implementation', 'verification',
            'last_assessed', 'last_saved', 'assessment_recorded_at', 'assessment_recorded_by', 'assessment_history')}
        item = row['items_to_address'][0]
        path = base + '/items/' + item['item_id']
        body = {'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'PRIVATE ITEM RESOLUTION'}
        response = await self.client.patch(path, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 1)
        resolved = response.json()
        self.assertEqual({key: resolved.get(key) for key in protected}, protected)
        internal = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        resolved_id = internal['_portfolio_activity_last_event_id']
        self.assertFalse(internal.get('_portfolio_activity_pending'))
        event = await server.db.portfolio_events.find_one({'event_id': resolved_id})
        self.assertEqual(event['changed_fields'], ['items_to_address'])
        self.assertNotIn('PRIVATE ITEM RESOLUTION', json.dumps(event))
        receipt = await server.db.audit_logs.find_one({'action': 'Assessment item updated',
            'entity_id': row['framework_assessment_id'], 'meta._portfolio_activity_event_id': resolved_id})
        self.assertIsNotNone(receipt)

        body = {'expected_revision': resolved['items_revision'], 'state': 'open', 'resolution': 'PRIVATE REOPEN NOTE'}
        with patch.object(portfolio_activity, 'persist_event', side_effect=RuntimeError('isolated projection outage')):
            with self.assertRaisesRegex(RuntimeError, 'isolated projection outage'):
                await self.client.patch(path, json=body)
        internal = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        pending_id = internal['_portfolio_activity_last_event_id']
        self.assertNotEqual(pending_id, resolved_id)
        self.assertIn(pending_id, internal['_portfolio_activity_pending'])
        self.assertEqual({key: internal.get(key) for key in protected}, protected)
        self.assertIsNotNone(await server.db.audit_logs.find_one({'action': 'Assessment item updated',
            'entity_id': row['framework_assessment_id'], 'meta._portfolio_activity_event_id': pending_id}))
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 1)
        later = await self.client.patch(base + '/items/' + row['items_to_address'][1]['item_id'], json={
            'expected_revision': internal['items_revision'], 'state': 'resolved', 'resolution': 'PRIVATE OTHER ITEM NOTE'})
        self.assertEqual(later.status_code, 200, later.text)
        current = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        later_id = current['_portfolio_activity_last_event_id']
        self.assertNotEqual(later_id, pending_id)
        self.assertEqual(set(current['_portfolio_activity_pending']), {pending_id})
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 2)
        await portfolio_activity.reconcile_pending(server.db)
        await portfolio_activity.reconcile_pending(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 3)
        recovered = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        self.assertFalse(recovered.get('_portfolio_activity_pending'))
        self.assertEqual(recovered['_portfolio_activity_last_event_id'], later_id)
        recovered_event = await server.db.portfolio_events.find_one({'event_id': pending_id})
        self.assertEqual(recovered_event, {'_id': pending_id, **internal['_portfolio_activity_pending'][pending_id]})
        stale = await self.client.patch(path, json=body)
        self.assertEqual(stale.status_code, 409, stale.text)
        retry = await self.client.patch(path, json={**body, 'expected_revision': recovered['items_revision']})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()['items_revision'], recovered['items_revision'])
        self.assertEqual(await server.db.portfolio_events.count_documents(query), original_events + 3)
        self.assertNotIn('PRIVATE', json.dumps(await server.db.portfolio_events.find(query).to_list(None)))

    async def test_losing_item_cas_does_not_capture_or_audit_uncommitted_change(self):
        base, row = await self.initial()
        source_query = {'framework_assessment_id': row['framework_assessment_id']}
        before = await server.db.framework_assessments.find_one(source_query)
        query = {'source_kind': 'framework_assessments', 'source_id': row['framework_assessment_id']}
        event_count = await server.db.portfolio_events.count_documents(query)
        audit_query = {'entity_id': row['framework_assessment_id'], 'action': 'Assessment item updated'}
        audit_count = await server.db.audit_logs.count_documents(audit_query)
        collection = server.db.framework_assessments
        original = type(collection).update_one

        async def interleave(current_collection, predicate, update, *args, **kwargs):
            if current_collection.name == 'framework_assessments' and 'items_to_address' in update.get('$set', {}):
                await original(current_collection, source_query, {'$set': {'items_revision': row['items_revision'] + 1}})
            return await original(current_collection, predicate, update, *args, **kwargs)

        with patch.object(type(collection), 'update_one', new=interleave):
            response = await self.client.patch(base + '/items/' + row['items_to_address'][0]['item_id'], json={
                'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Uncommitted change'})
        self.assertEqual(response.status_code, 409, response.text)
        after = await server.db.framework_assessments.find_one(source_query)
        self.assertEqual(after, {**before, 'items_revision': row['items_revision'] + 1})
        self.assertEqual(await server.db.portfolio_events.count_documents(query), event_count)
        self.assertEqual(await server.db.audit_logs.count_documents(audit_query), audit_count)

    async def test_item_activity_does_not_claim_concurrent_native_judgment(self):
        base, row = await self.initial()
        source_query = {'framework_assessment_id': row['framework_assessment_id']}
        collection = server.db.framework_assessments
        original = type(collection).update_one

        async def interleave(current_collection, predicate, update, *args, **kwargs):
            if current_collection.name == 'framework_assessments' and 'items_to_address' in update.get('$set', {}):
                await original(current_collection, source_query, {'$set': {'status': 'addressed', 'verification': 'verified'}})
            return await original(current_collection, predicate, update, *args, **kwargs)

        with patch.object(type(collection), 'update_one', new=interleave):
            response = await self.client.patch(base + '/items/' + row['items_to_address'][0]['item_id'], json={
                'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Independent follow-up'})
        self.assertEqual(response.status_code, 200, response.text)
        saved = await server.db.framework_assessments.find_one(source_query)
        self.assertEqual((saved['status'], saved['verification']), ('addressed', 'verified'))
        for field in ('implementation', 'last_assessed', 'last_saved', 'assessment_recorded_at', 'assessment_history'):
            self.assertEqual(saved.get(field), row.get(field))
        event = await server.db.portfolio_events.find_one({'event_id': saved['_portfolio_activity_last_event_id']})
        self.assertEqual(event['changed_fields'], ['items_to_address'])
        self.assertNotIn('before', event)
        self.assertNotIn('after', event)

    async def date_snapshot(self, date_metadata=True):
        workspace = await self.configure()
        row = next(row for row in workspace['assessments'] if row['definition_id'] == '1.1')
        base = '/api/framework_assessments/' + row['framework_assessment_id']
        draft = (await self.client.get(base + '/guided-assessment')).json()
        questions = guided_assessment.VERSIONS[draft['version']]['safeguards']['1.1']
        answers = {question['id']: ({name: 'Yes' for name in question['rows']} if question['type'] == 'matrix'
            else [question['choices'][0]] if question['type'] == 'multi' else '2026-04-12' if question['type'] == 'date'
            else '' if question['type'] == 'text' else 'No' if question.get('optional') else 'Yes' if 'Yes' in question['choices'] else question['choices'][0])
            for question in questions}
        result = {'version': draft['version'], 'status': 'addressed', 'narrative': 'Reviewed inventory summary.',
            'basis': [], 'gaps': [], 'unknowns': [], 'nextSteps': [], 'evidence': [], 'answers': [], 'signals': []}
        if date_metadata:
            result['evaluation_date'] = '2026-10-12'
        payload = {'version': draft['version'], 'expected_revision': draft['revision'], 'answers': answers,
            'step': 0, 'completed': True, 'narrative': result['narrative'], 'result': result,
            **{key: draft[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}}
        return base, row, payload

    async def test_evaluation_date_validation_retention_and_bound_native_rebase(self):
        base, row, payload = await self.date_snapshot()
        with patch.object(server, '_now', return_value='2026-10-13T00:30:00+00:00'):
            for invalid in ('2026-02-30', '20261013', '', 20261013, '2026-10-11', '2026-10-15'):
                response = await self.client.put(base + '/guided-assessment', json={**payload,
                    'result': {**payload['result'], 'evaluation_date': invalid}})
                self.assertEqual(response.status_code, 422, response.text)
            inactive = await self.client.put(base + '/guided-assessment', json={**payload,
                'answers': {**payload['answers'], 'inventory': 'No'},
                'result': {**payload['result'], 'evaluation_date': '2026-10-13'}})
            self.assertEqual(inactive.status_code, 422, inactive.text)
            for valid in ('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-12'):
                payload['result']['evaluation_date'] = valid
                response = await self.client.put(base + '/guided-assessment', json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                draft = response.json()
                payload['expected_revision'] = draft['revision']
        with patch.object(server, '_now', return_value='2026-10-20T00:30:00+00:00'):
            omitted = deepcopy(payload)
            omitted['result'].pop('evaluation_date')
            response = await self.client.put(base + '/guided-assessment', json=omitted)
            self.assertEqual(response.status_code, 200, response.text)
            retained = response.json()
            self.assertEqual(retained['result']['evaluation_date'], '2026-10-12')
            self.assertEqual(retained['generated_at'], draft['generated_at'])
            self.assertEqual(retained['updated_at'], draft['updated_at'])
            self.assertEqual(retained['revision'], draft['revision'])
            row = await self.apply(base, retained, row)
        with patch.object(server, '_now', return_value='2026-10-25T00:30:00+00:00'):
            current = (await self.client.get(base + '/guided-assessment')).json()
            rebased = await self.client.put(base + '/guided-assessment', json={
                **payload, 'expected_revision': current['revision'], 'completed': False, 'result': None, 'rebase': True,
                'base_assessment_token': current['current_assessment_token'],
                'base_scope_fingerprint': current['current_scope_fingerprint']})
            self.assertEqual(rebased.status_code, 200, rebased.text)
            replay = {**payload, 'expected_revision': rebased.json()['revision'],
                **{key: rebased.json()[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}}
            source = deepcopy(row['guided_assessment_source'])
            await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']},
                {'$set': {'guided_assessment_source.by': 'other-actor'}})
            mismatch = await self.client.put(base + '/guided-assessment', json=replay)
            self.assertEqual(mismatch.status_code, 422, mismatch.text)
            await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']},
                {'$set': {'guided_assessment_source': source}})
            for altered in ({**replay, 'answers': {**replay['answers'], 'last_review': '2026-04-11'}},
                    {**replay, 'result': {**replay['result'], 'evaluation_date': '2026-10-11'}}):
                rejected = await self.client.put(base + '/guided-assessment', json=altered)
                self.assertEqual(rejected.status_code, 422, rejected.text)
            response = await self.client.put(base + '/guided-assessment', json=replay)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['generated_at'], draft['generated_at'])
            self.assertEqual(response.json()['result'], draft['result'])

    async def test_legacy_unchanged_result_retains_clock_and_resolved_date_item(self):
        base, row, payload = await self.date_snapshot(date_metadata=False)
        with patch.object(server, '_now', return_value='2026-10-13T00:30:00+00:00'):
            response = await self.client.put(base + '/guided-assessment', json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            draft = response.json()
            row = await self.apply(base, draft, row)
            item = next(item for item in row['items_to_address'] if item['question_id'] == 'last_review')
            self.assertEqual(item['kind'], 'verification')
            resolved = await self.client.patch(base + '/items/' + item['item_id'], json={
                'expected_revision': row['items_revision'], 'state': 'resolved', 'resolution': 'Original date basis retained.'})
            self.assertEqual(resolved.status_code, 200, resolved.text)
            row = resolved.json()
        with patch.object(server, '_now', return_value='2026-10-20T00:30:00+00:00'):
            current = (await self.client.get(base + '/guided-assessment')).json()
            rebased = await self.client.put(base + '/guided-assessment', json={
                **payload, 'expected_revision': draft['revision'], 'completed': False, 'result': None, 'rebase': True,
                'base_assessment_token': current['current_assessment_token'],
                'base_scope_fingerprint': current['current_scope_fingerprint']})
            self.assertEqual(rebased.status_code, 200, rebased.text)
            replay_body = {**payload, 'expected_revision': rebased.json()['revision'],
                **{key: rebased.json()[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}}
            response = await self.client.put(base + '/guided-assessment', json=replay_body)
            self.assertEqual(response.status_code, 200, response.text)
            replay = response.json()
            self.assertEqual(replay['generated_at'], draft['generated_at'])
            self.assertNotIn('evaluation_date', replay['result'])
            saved = await self.apply(base, replay, row)
            self.assertEqual(saved['items_to_address'], row['items_to_address'])
            fresh = deepcopy(replay_body)
            fresh.update(expected_revision=replay['revision'], narrative='Newly reviewed inventory wording.')
            fresh['result']['narrative'] = fresh['narrative']
            wording = await self.client.put(base + '/guided-assessment', json=fresh)
            self.assertEqual(wording.status_code, 200, wording.text)
            self.assertEqual(wording.json()['generated_at'], draft['generated_at'])
            self.assertEqual(assessment_items.generated(row, wording.json()), assessment_items.generated(row, draft))
            fresh.update(expected_revision=wording.json()['revision'], answers={**fresh['answers'], 'last_review': '2026-04-11'})
            changed = await self.client.put(base + '/guided-assessment', json=fresh)
            self.assertEqual(changed.status_code, 200, changed.text)
            self.assertEqual(changed.json()['generated_at'], '2026-10-20T00:30:00+00:00')

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
        activity_query = {'source_kind': 'framework_assessments', 'source_id': row['framework_assessment_id']}
        activity_count = await server.db.portfolio_events.count_documents(activity_query)
        base, draft = await self.completed(saved)
        reapplied = await self.apply(base, draft, saved)
        self.assertEqual(await server.db.portfolio_events.count_documents(activity_query), activity_count)
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
        activity_query = {'source_kind': 'framework_assessments', 'source_id': row['framework_assessment_id']}
        before = await server.db.portfolio_events.count_documents(activity_query)
        item = row['items_to_address'][0]
        payload = {'item_id': item['item_id'], 'title': 'Explicit formal follow-up', 'remediation_title': 'Close reported gap',
            'description': item['text'], 'request_id': 'first-item-finding', 'owner_id': 'member'}
        first = await self.client.post(base + '/findings', json=payload)
        self.assertEqual(first.status_code, 200, first.text)
        saved = (await self.client.get(base)).json()
        self.assertEqual(saved['items_to_address'][0]['finding_id'], first.json()['finding_id'])
        self.assertEqual(saved['items_to_address'][0]['state'], 'open')
        self.assertEqual(await server.db.portfolio_events.count_documents(activity_query), before + 1)
        internal = await server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        link_id = internal['_portfolio_activity_last_event_id']
        self.assertFalse(internal.get('_portfolio_activity_pending'))
        link_event = await server.db.portfolio_events.find_one({'event_id': link_id})
        self.assertEqual(link_event['changed_fields'], ['items_to_address'])
        finding = await server.db.findings.find_one({'finding_id': first.json()['finding_id']})
        self.assertNotEqual(link_id, finding['_portfolio_activity_creation_event_id'])
        self.assertIsNotNone(await server.db.audit_logs.find_one({'entity_id': row['framework_assessment_id'],
            'action': 'Assessment item updated', 'meta.finding_id': first.json()['finding_id'],
            'meta._portfolio_activity_event_id': link_id}))
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
        self.assertEqual(await server.db.portfolio_events.count_documents(activity_query), before + 1)

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
            if question.get('optional'):return 'No'
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
                    if framework != 'cis-ig1' and question['type'] != 'text':
                        for choice in (('Not sure',) if question['type'] == 'context' else ('No','Partially','Not sure')):
                            variants.append({**answers,key:choice,key+'_detail':'Synthetic literal detail.'})
                for variant in variants:
                    try:
                        guided_assessment.validate_answers(definition,variant,version)
                    except HTTPException:
                        continue  # Row-specific choices remain part of the unchanged answer boundary.
                    cases.append({'framework':framework,'id':definition,'version':version,'answers':variant})
        for framework,engine,definition,key in [('soc-2',guided_assessment.soc_guided_assessment,'CC1.1','CC1.1-expectations'),
                ('iso-27001',guided_assessment.iso_guided_assessment,'4.2','ISO-4.2-parties')]:
            for version in (engine.CATALOG['version'],engine.LEGACY['version']):
                for choice in ('No','Partially','Not sure'):
                    for ending in ('.','!','?','...',''):
                        answers={q['id']:affirmative(q) for q in engine._questions(definition,version)}
                        answers.update({key:choice,key+'_detail':'Synthetic literal detail'+ending})
                        cases.append({'framework':framework,'id':definition,'version':version,'answers':answers})
        self.assertEqual({(case['framework'],case['id']) for case in cases},records)
        script=r"""
const fs=require('node:fs'),path=require('node:path'),root=process.argv[1],cache=new Map();
const allowed=new Set(['guidedAssessment','socGuidedAssessment','isoGuidedAssessment','inlineAssessment','programTriage','managementDates','grcWork','grcRules.json']);
function load(name){
  if(!allowed.has(name))throw new Error('Unreviewed evaluator import '+name);
  if(cache.has(name))return cache.get(name);
  if(name==='grcRules.json')return JSON.parse(fs.readFileSync(path.join(root,'frontend/src/lib',name),'utf8'));
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
  const today=new Date('2026-10-13T12:00:00Z');
  const result=framework==='cis-ig1'?cis.generateResult(id,answers,today,version):framework==='soc-2'?soc.socGuidedResult(id,answers,version):iso.isoGuidedResult(id,answers,version);
  const origins=(result.signals||[]).map(signal=>signal.questionId+':'+signal.kind);
  for(const [key,kind] of [['gaps','gap'],['unknowns','verification']])if(answers[key==='gaps'?'additional_gap':'additional_confirmation']==='Yes'&&answers[key]?.trim())origins.push(key+':'+kind);
  if(result.unknowns.some(text=>text.startsWith('No substantive practice is established')||text.startsWith('The overall practice answer conflicts with the reported absence')))origins.push('summary_confirmation:verification');
  const texts=Object.fromEntries((result.signals||[]).filter(signal=>signal.text).map(signal=>[signal.questionId+':'+signal.kind,signal.text]));
  return {origins:[...new Set(origins)].sort(),texts,evaluation_date:framework==='cis-ig1'?[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-'):null};
})));
"""
        result=subprocess.run(['node','-e',script,str(Path(__file__).resolve().parents[2])],input=json.dumps(cases),
            capture_output=True,text=True,encoding='utf-8',timeout=60)
        self.assertEqual(result.returncode,0,result.stderr)
        expected=json.loads(result.stdout)
        self.assertEqual(len(expected),len(cases))
        for case,snapshot in zip(cases,expected):
            with self.subTest(framework=case['framework'],definition=case['id'],answers=case['answers']):
                row={'framework_assessment_id':'synthetic','framework_key':case['framework'],'definition_id':case['id']}
                draft={'version':case['version'],'answers':case['answers'],'generated_at':'2026-10-13T12:00:00+00:00',
                    'result':{'evaluation_date':snapshot['evaluation_date'],
                        'signals':[{'questionId':'forged','kind':'gap','text':'Ignored client metadata'}]}}
                native=assessment_items.generated(row,draft)
                actual=sorted(item['question_id']+':'+item['kind'] for item in native)
                self.assertEqual(actual,snapshot['origins'])
                labels={item['question_id']+':'+item['kind']:item['text'] for item in native}
                for key,text in snapshot['texts'].items():
                    self.assertEqual(labels[key],text)

    def test_cis_date_uses_recorded_local_day_and_legacy_boundary_confirmation(self):
        row = {'framework_assessment_id': 'date-vector', 'framework_key': 'cis-ig1', 'definition_id': '1.1'}
        version = guided_assessment.current_version('1.1')
        question = next(question for question in guided_assessment.VERSIONS[version]['safeguards']['1.1']
            if question['id'] == 'last_review')
        for answer, local_day, expected in (('2026-04-12', '2026-10-12', None),
                ('2026-04-12', '2026-10-13', 'gap'), ('2026-10-13', '2026-10-12', 'gap'),
                ('2026-10-13', '2026-10-13', None)):
            draft = {'version': version, 'answers': {'inventory': 'Yes', 'last_review': answer},
                'generated_at': '2026-10-13T00:30:00+00:00', 'result': {'evaluation_date': local_day}}
            origins = {item['kind']: item for item in assessment_items.generated(row, draft) if item['question_id'] == 'last_review'}
            self.assertEqual(set(origins), {expected} if expected else set())
            draft['result'] = {'signals': [{'questionId': 'last_review', 'kind': 'gap', 'text': 'Forged'}]}
            legacy = [item for item in assessment_items.generated(row, draft) if item['question_id'] == 'last_review']
            self.assertEqual([(item['kind'], item['text']) for item in legacy], [('verification', question['unknown_template'])])
        for answer, expected in (('2026-04-10', 'gap'), ('2026-04-15', None), ('invalid', 'gap')):
            draft = {'version': version, 'answers': {'inventory': 'Yes', 'last_review': answer}, 'generated_at': '2026-10-13T00:30:00+00:00'}
            origins = [item['kind'] for item in assessment_items.generated(row, draft) if item['question_id'] == 'last_review']
            self.assertEqual(origins, [expected] if expected else [])
        for generated_at in ('invalid', '2026-02-30T00:30:00Z', '2026-10-13T24:00:00Z', '2026-10-13T00:30:00'):
            draft = {'version': version, 'answers': {'inventory': 'Yes', 'last_review': '2026-04-10'}, 'generated_at': generated_at}
            items = assessment_items.generated(row, draft)
            self.assertEqual([(item['kind'], item['text']) for item in items if item['question_id'] == 'last_review'],
                [('verification', question['unknown_template'])])
            self.assertTrue(any(item['question_id'] == 'attributes' and item['kind'] == 'verification' for item in items))
        draft = {'version': version, 'answers': {'inventory': 'Yes', 'last_review': '2026-04-10'},
            'generated_at': '2026-10-13T00:30:00+00:00', 'result': {'evaluation_date': '2026-10-12'}}
        items = assessment_items.reconcile(row, draft, 'reviewer', 'initial')
        for item in items:
            item.update(state='resolved', resolution='Keep original note')
        row['items_to_address'] = items
        draft['result']['evaluation_date'] = '2026-10-13'
        self.assertEqual(assessment_items.reconcile(row, draft, 'reviewer', 'later'), items)

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
