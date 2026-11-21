"""R4 scope and guided workflow through isolated native handlers; no hosted state."""
import copy
import json
import unittest
import uuid
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
import assessment_items
from framework_catalog import CATALOGS, FRAMEWORKS, active_definitions, active_plans
from framework_governance import stable
from portfolio_progress import current_position
import framework_reports
import generic_guided_assessment as guide
import guided_assessment as native_guide
import test_framework_governance as harness


class R4ItemDraftTests(unittest.TestCase):
    def setUp(self):
        self.row = {'framework_assessment_id': 'synthetic-assessment', 'client_id': 'synthetic-client',
            'framework_key': 'nist-csf-2', 'definition_id': 'GV.OC-01', 'items_revision': 0,
            'items_to_address': []}
        self.draft = {'version': guide.current_version('GV.OC-01', 'nist-csf-2'),
            'answers': {'practice': 'Not sure', 'implementation': 'Reported practice is unconfirmed',
                'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'Ask the accountable owner'}}
        self.manual = {'request_id': 'synthetic-manual-0001', 'item_type': 'confirmation',
            'text': 'Confirm the retained record — München Ω'}

    def test_manual_intent_is_strict_and_cannot_supply_saved_identity_or_history(self):
        for extra in ({'text': ' '}, {'request_id': 'short'}, {'expected_revision': True},
                      {'item_id': 'chosen'}, {'history': []}, {'origin': 'guided'}, {'by': 'other'}):
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                assessment_items.ItemAdd(**{**self.manual, 'expected_revision': 0, **extra})
        body = assessment_items.ItemAdd(**self.manual, expected_revision=0)
        items = []
        self.assertTrue(assessment_items.add_manual(self.row, items, body, 'writer', 'now'))
        self.assertFalse(assessment_items.add_manual(self.row, items, body, 'writer', 'later'))
        self.assertEqual(len(items), 1)
        valid = items[0]
        self.assertTrue(assessment_items.known_manual(self.row, valid))
        self.assertTrue(assessment_items.task_eligible(self.row, valid))
        record = {**self.row, 'items_to_address': items}
        before = copy.deepcopy(record)
        view = assessment_items.with_item_controls(record)
        self.assertEqual(record, before)
        self.assertEqual(view['items_to_address'], items)
        self.assertEqual(view['item_controls'][valid['item_id']], {
            'origin': 'manual', 'can_remove': True, 'can_create_action': True, 'can_create_finding': False})
        for malformed in ({'item_type': 'gap'}, {'item_type': None}, {'history': []}, {'kind': 'gap'}):
            with self.subTest(malformed=malformed):
                retained = {**valid, **malformed}
                self.assertFalse(assessment_items.known_manual(self.row, retained))
                self.assertFalse(assessment_items.task_eligible(self.row, retained))
                with self.assertRaises(HTTPException):
                    assessment_items.remove_item(self.row, retained, 'writer', 'never')
        self.assertNotIn('question_id', items[0])
        self.assertNotIn('source_version', items[0])
        with self.assertRaises(HTTPException) as conflict:
            assessment_items.add_manual(self.row, items,
                assessment_items.ItemAdd(**{**self.manual, 'text': 'Different intent'}, expected_revision=0), 'writer', 'later')
        self.assertEqual(conflict.exception.status_code, 409)

    def test_reconciliation_preserves_manual_unknown_and_removed_history(self):
        items = assessment_items.reconcile(self.row, self.draft, 'writer', 'first')
        guided = next(item for item in items if item['question_id'] == 'unknown_reason')
        with self.assertRaises(HTTPException):
            assessment_items.remove_item(self.row, guided, 'writer', 'too-early')
        guided['state'] = 'resolved'
        assessment_items.remove_item(self.row, guided, 'writer', 'removed')
        retained = copy.deepcopy(guided)
        assessment_items.add_manual(self.row, items,
            assessment_items.ItemAdd(**self.manual, expected_revision=0), 'writer', 'manual')
        unknown = {'item_id': 'retained-unknown', 'text': 'Retained legacy item', 'kind': 'gap',
            'state': 'resolved', 'history': [{'event': 'historical'}]}
        items.append(copy.deepcopy(unknown))
        row = {**self.row, 'items_to_address': items}
        same = assessment_items.reconcile(row, self.draft, 'writer', 'same')
        self.assertEqual(next(item for item in same if item['item_id'] == guided['item_id']), retained)
        self.assertEqual(same[-1], unknown)
        self.assertEqual(same[-2], items[-2])
        with self.assertRaises(HTTPException):
            assessment_items.remove_item(row, same[-1], 'writer', 'never')
        missing_request = {'item_id': assessment_items.manual_id(self.row, ''), 'origin': 'manual',
            'state': 'resolved', 'text': 'Unknown retained shape', 'history': []}
        with self.assertRaises(HTTPException):
            assessment_items.remove_item(self.row, missing_request, 'writer', 'never')
        malformed = {**retained, 'source_fingerprint': ''}
        self.assertFalse(assessment_items.known_guided(self.row, malformed))
        with self.assertRaises(HTTPException):
            assessment_items.remove_item(self.row, {**malformed, 'state': 'resolved'}, 'writer', 'never')
        changed = copy.deepcopy(self.draft)
        changed['answers']['unknown_reason'] = 'A genuinely changed source explanation'
        reopened = assessment_items.reconcile(row, changed, 'writer', 'changed')
        current = next(item for item in reopened if item['item_id'] == guided['item_id'])
        # A genuinely changed origin can reopen through the existing native reassessment path.
        self.assertNotEqual(current['source_fingerprint'], retained['source_fingerprint'])
        self.assertEqual(current['state'], 'open')
        self.assertEqual(current['history'][:len(retained['history'])], retained['history'])

    def test_pending_operations_are_typed_pure_cas_bound_and_do_not_fabricate_work(self):
        items = assessment_items.reconcile(self.row, self.draft, 'writer', 'generated')
        before = copy.deepcopy(items)
        guided = items[0]
        batch = assessment_items.ItemDraft(expected_revision=0, operations=[
            {'operation': 'add', **self.manual},
            {'operation': 'resolve', 'target': {'manual_request_id': self.manual['request_id']},
             'state': 'resolved', 'resolution': 'SYNTHETIC retained local resolution'},
            {'operation': 'remove', 'target': {'manual_request_id': self.manual['request_id']}},
            {'operation': 'resolve', 'target': {'question_id': guided['question_id'], 'kind': guided['kind']},
             'state': 'resolved', 'resolution': 'SYNTHETIC confirmed with owner'},
            {'operation': 'remove', 'target': {'question_id': guided['question_id'], 'kind': guided['kind']}}])
        after = assessment_items.apply_draft(self.row, items, batch, 'writer', 'saved')
        self.assertEqual(items, before)
        self.assertEqual(after[0]['state'], 'removed')
        self.assertEqual(after[-1]['state'], 'removed')
        self.assertTrue(all(not item.get('finding_id') and not item.get('task_id') for item in after))
        with self.assertRaises(HTTPException) as stale:
            assessment_items.apply_draft({**self.row, 'items_revision': 1}, items, batch, 'writer', 'late')
        self.assertEqual(stale.exception.status_code, 409)
        for target in ({'item_id': 'a', 'question_id': 'b', 'kind': 'gap'}, {}, {'question_id': 'b'}):
            with self.subTest(target=target), self.assertRaises(ValidationError):
                assessment_items.ItemTarget(**target)

    def test_malformed_retained_guided_metadata_stays_readable_without_new_authority(self):
        item = assessment_items.reconcile(self.row, self.draft, 'writer', 'original')[0]
        for fields in ({'question_id': ['not-a-string']}, {'source_version': {'not': 'a-version'}},
                       {'source_version': ['not-a-version']}, {'question_id': {'not': 'a-question'}}):
            with self.subTest(fields=fields):
                record = {**self.row, 'items_to_address': [{**item, **fields}]}
                before = copy.deepcopy(record)
                result = assessment_items.with_item_controls(record)
                self.assertEqual(record, before)
                self.assertEqual(result['items_to_address'], before['items_to_address'])
                self.assertEqual(result['item_controls'][item['item_id']], {
                    'origin': 'unknown', 'can_remove': False, 'can_create_action': False, 'can_create_finding': False})


class R4CatalogTests(unittest.TestCase):
    def test_cumulative_scope_and_far_parents_are_distinct(self):
        self.assertEqual([len(active_definitions('cis-ig1', {'implementation_group': n})) for n in (1, 2, 3)], [56, 130, 153])
        one = active_definitions('cmmc', {'level': 1})
        self.assertEqual(len(one), 17)
        self.assertEqual(len({d['level_one_parent'] for d in one}), 15)
        self.assertEqual({d['id'] for d in one if d['level_one_parent'] == 'ix'}, {'3.10.3', '3.10.4', '3.10.5'})
        self.assertEqual(len(active_definitions('cmmc', {'level': 2})), 110)
        self.assertTrue(all(set(p['safeguards']) <= {d['id'] for d in one} for p in active_plans('cmmc', {'level': 1})))
        self.assertTrue(all(p['source_minimum'] is None for p in active_plans('cmmc')))

    def test_hipaa_child_units_preserve_native_parents_and_identity_version(self):
        definitions = {d['id']: d for d in CATALOGS['hipaa']['requirements']}
        self.assertEqual(len(definitions), 81)
        self.assertTrue({'164.302', '164.105', '164.530'} <= definitions.keys())
        children = {d['id']: d['parent_assessment_id'] for d in definitions.values() if d.get('parent_assessment_id')}
        self.assertEqual(len(children), 5)
        self.assertEqual(children['164.314(a)(2)(i)'], '164.314(a)(1)')
        before = stable('client', 'assessment', '164.308(b)(1)', 'hipaa')
        catalog = CATALOGS['hipaa']
        original = catalog['content_revision']
        try:
            catalog['content_revision'] = 'a later display correction'
            self.assertEqual(stable('client', 'assessment', '164.308(b)(1)', 'hipaa'), before)
        finally:
            catalog['content_revision'] = original

    def test_unknown_answers_never_become_confirmed_gaps(self):
        answers = {'practice': 'Not sure', 'implementation': 'Not confirmed', 'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'Ask the accountable person'}
        version = guide.current_version('GV.OC-01', 'nist-csf-2')
        self.assertEqual(guide.result_status('GV.OC-01', answers, version), 'not_assessed')
        self.assertTrue(all(kind == 'verification' for _, kind in guide.origins(answers)))
        with self.assertRaises(HTTPException):
            guide.validate_completion('GV.OC-01', {**answers, 'unknown_reason': ' '}, version)
        with self.assertRaises(HTTPException):
            guide.validate_answers('GV.OC-01', {**answers, 'privileged': 'Yes'}, version)

    def test_cmmc_position_uses_level_scope_revision_and_pending_guard(self):
        client={'client_id':'scope-client','framework_settings':{'cmmc':{'level':1}},
            'cmmc_configuration_updated_at':'2026-11-19T00:00:00+00:00'}
        framework=next(f for f in FRAMEWORKS if f['key']=='cmmc')
        rows=[{'framework_assessment_id':'assessment-'+d['id'],'definition_id':d['id'],
            'framework_version':CATALOGS['cmmc']['version'],'status':'not_assessed'} for d in active_definitions('cmmc',{'level':2})]
        assignments=[{'baseline_key':'cmmc','requirement_id':'native-cmmc-enrollment'}]
        one=current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(one['program_label'],'CMMC Level 1')
        self.assertEqual(one['current']['scope']['configuration'],{'level':1})
        self.assertEqual(one['current']['denominator'],17)
        self.assertEqual(one['current']['provenance']['source_as_of'],client['cmmc_configuration_updated_at'])
        client['framework_settings']['cmmc']['level']=2
        two=current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(two['current']['denominator'],110)
        self.assertNotEqual(one['current']['scope_signature'],two['current']['scope_signature'])
        self.assertEqual(one['program_id'],two['program_id'])
        client['framework_settings']['cmmc']['level']=True
        self.assertEqual(current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')['current']['availability'],'unavailable')
        client['framework_settings']['cmmc']['level']=1
        rows[0]['_r4_context_pending']='other-command'
        with self.assertRaises(HTTPException) as pending:
            current_position(client,framework,assignments,rows,'2026-11-20T00:00:00+00:00')
        self.assertEqual(pending.exception.status_code,409)

    def test_new_reports_keep_source_scope_and_native_outcome_language(self):
        client={'client_id':'scope-client','framework_settings':{'cmmc':{'level':1}}}
        rows=[{'framework_assessment_id':'assessment-'+d['id'],'definition_id':d['id'],
            'framework_version':CATALOGS['cmmc']['version'],'status':'not_assessed'} for d in active_definitions('cmmc',{'level':1})]
        now=datetime(2026,11,19,tzinfo=timezone.utc)
        report=framework_reports.build_snapshot(client,'cmmc',rows,[],[],now,'6m',
            (now.isoformat(),now.isoformat()),'isolated fixture')
        media=next(item for item in report['assessments'] if item['id']=='3.8.3')
        self.assertIn('FCI',media['title'])
        self.assertNotIn('CUI',media['title'])
        self.assertEqual(media['assessment_id'],'assessment-3.8.3')
        self.assertEqual(len(report['assessments']),17)
        self.assertIn('15 parent',report['framework']['scope'])
        self.assertEqual(framework_reports.labels('nist-csf-2')['addressed'],'Achieved')


class R4NativeFrameworkTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure

    async def workspace(self, key):
        response = await self.client.get('/api/frameworks/' + key, params={'client_id': 'a'})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_manual_items_preserve_judgment_and_history_with_retry_and_remove(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            with self.subTest(framework=key):
                path, before, draft, adoption = await self.narrative_items_fixture(key)
                body = {'expected_revision': before.get('items_revision', 0), 'request_id': uuid.uuid4().hex,
                    'item_type': 'confirmation', 'text': 'SYNTHETIC manual confirmation — München Ω'}
                response = await self.client.post(path + '/items', json=body)
                self.assertEqual(response.status_code, 200, response.text)
                saved = response.json()
                item = next(item for item in saved['items_to_address'] if item.get('request_id') == body['request_id'])
                self.assertEqual(item['origin'], 'manual')
                self.assertNotIn('source_version', item)
                for field in ('status', 'verification', 'implementation', 'assessment_history', 'last_saved', 'last_assessed'):
                    self.assertEqual(saved.get(field), before.get(field))
                retry = await self.client.post(path + '/items', json=body)
                self.assertEqual(retry.status_code, 200, retry.text)
                self.assertEqual(retry.json(), saved)
                bad = await self.client.post(path + '/items', json={**body, 'request_id': uuid.uuid4().hex})
                self.assertEqual(bad.status_code, 409, bad.text)
                remove = await self.client.post(path + '/items/' + item['item_id'] + '/remove',
                    json={'expected_revision': saved['items_revision']})
                self.assertEqual(remove.status_code, 200, remove.text)
                removed = next(row for row in remove.json()['items_to_address'] if row['item_id'] == item['item_id'])
                self.assertEqual(removed['state'], 'removed')
                self.assertEqual(removed['history'][:-1], item['history'])
                adopted = await self.client.patch(path, json=adoption)
                self.assertEqual(adopted.status_code, 200, adopted.text)
                self.assertEqual(next(row for row in adopted.json()['items_to_address'] if row['item_id'] == item['item_id']), removed)

    async def test_pending_item_operations_commit_with_narrative_only_across_all_six_frameworks(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            with self.subTest(framework=key):
                path, before, draft, body = await self.narrative_items_fixture(key)
                proposed = assessment_items.generated(before, draft)[0]
                batch = {'expected_revision': before.get('items_revision', 0), 'operations': [
                    {'operation': 'add', 'request_id': uuid.uuid4().hex, 'item_type': 'evidence',
                     'text': 'SYNTHETIC evidence link needs confirmation — Ω'},
                    {'operation': 'resolve', 'target': {'question_id': proposed['question_id'], 'kind': proposed['kind']},
                     'state': 'resolved', 'resolution': 'SYNTHETIC reviewed follow-up'}]}
                self.assertEqual((await self.client.get(path)).json(), before)
                response = await self.client.patch(path, json={**body, 'item_draft': batch})
                self.assertEqual(response.status_code, 200, response.text)
                saved = response.json()
                self.assertEqual(saved['status'], before['status'])
                self.assertEqual(saved.get('verification'), before.get('verification'))
                self.assertEqual(saved['implementation'], draft['narrative'])
                self.assertNotIn('item_draft', saved)
                self.assertNotIn('item_draft', saved['assessment_history'][-1])
                manual = next(item for item in saved['items_to_address'] if item.get('origin') == 'manual')
                self.assertEqual(manual['item_type'], 'evidence')
                self.assertEqual(next(item for item in saved['items_to_address'] if item['item_id'] == proposed['item_id'])['state'], 'resolved')
                bad = await self.client.patch(path, json={**body, 'expected_last_assessed': saved['last_saved'],
                    'item_draft': {**batch, 'operations': [{'operation': 'resolve', 'target': {'item_id': manual['item_id']},
                        'state': 'resolved', 'resolution': 'SYNTHETIC stale alteration'}]}})
                self.assertEqual(bad.status_code, 409, bad.text)
                self.assertEqual((await self.client.get(path)).json(), saved)

    async def task_item_fixture(self, key='nist-csf-2', item_type='confirmation'):
        row = (await self.workspace(key))['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        response = await self.client.patch(path, json={'owner_id': 'member',
            'expected_last_assessed': row.get('last_saved') or row.get('last_assessed')})
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()
        response = await self.client.post(path + '/items', json={'expected_revision': row.get('items_revision', 0),
            'request_id': uuid.uuid4().hex, 'item_type': item_type, 'text': 'SYNTHETIC confirm the actual source — Ω'})
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()
        item = row['items_to_address'][-1]
        return path, row, item

    async def test_client_questions_use_complete_scope_and_actual_saved_responsibility_without_writes(self):
        await self.configure()
        path, row, item = await self.task_item_fixture('cis-ig1')
        context = (await self.client.get(path + '/service-context')).json()
        activity = context['candidates'][0]
        workspace = await self.workspace('cis-ig1')
        other = next(candidate for candidate in workspace['assessments'] if candidate['framework_assessment_id'] != row['framework_assessment_id'])
        other_path = '/api/framework_assessments/' + other['framework_assessment_id']
        unknown = await self.client.post(other_path + '/items', json={'expected_revision': other.get('items_revision', 0),
            'request_id': uuid.uuid4().hex, 'item_type': 'confirmation', 'text': 'Client should confirm this, but responsibility is not established'})
        self.assertEqual(unknown.status_code, 200, unknown.text)
        services = {'areas': {activity['area_id']: {'responsibility': 'cl'}}, 'assessment_activities': {
            row['framework_assessment_id']: activity['activity_id'], other['framework_assessment_id']: 'missing-activity'}}
        await harness.server.db.clients.update_one({'client_id': 'a'}, {'$set': {'profile.services': services}})
        await harness.server.db.framework_assessments.insert_one({'framework_assessment_id': 'foreign-private',
            'client_id': 'b', 'framework_key': 'cis-ig1', 'definition_id': row['definition_id'],
            'items_to_address': [{'item_id': 'foreign-item', 'text': 'FOREIGN PRIVATE QUESTION', 'state': 'open'}]})
        await harness.server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        self.sign_in('member')
        before = {name: await harness.server.db[name].find({}).to_list(None) for name in
            ('clients', 'framework_assessments', 'reviews', 'tasks', 'findings', 'audit_logs')}
        response = await self.client.get('/api/frameworks/cis-ig1/client-questions', params={'client_id': 'a'})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual([question['item_id'] for question in result['questions']], [item['item_id']])
        self.assertEqual(result['unconfirmed_count'], 1)
        self.assertEqual(result['questions'][0]['basis']['responsibility'], 'cl')
        self.assertEqual(result['questions'][0]['basis']['activity_id'], activity['activity_id'])
        self.assertNotIn('FOREIGN', response.text)
        self.assertEqual({name: await harness.server.db[name].find({}).to_list(None) for name in before}, before)
        await harness.server.db.clients.update_one({'client_id': 'a'},
            {'$unset': {'profile.services.assessment_activities.' + row['framework_assessment_id']: ''}})
        unbound = await self.client.get('/api/frameworks/cis-ig1/client-questions', params={'client_id': 'a'})
        self.assertEqual(unbound.status_code, 200, unbound.text)
        self.assertEqual(unbound.json()['questions'], [])
        self.assertEqual(unbound.json()['unconfirmed_count'], 2)
        forbidden = await self.client.get('/api/frameworks/cis-ig1/client-questions', params={'client_id': 'b'})
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

    async def test_retained_malformed_item_metadata_remains_readable_without_record_writes(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        row = (await self.workspace('nist-csf-2'))['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        item = {'item_id': 'retained-malformed-item', 'kind': 'verification', 'state': 'open',
            'text': 'SYNTHETIC retained unknown provenance', 'source_fingerprint': 'a' * 64,
            'question_id': ['not-a-question'], 'source_version': {'not': 'a-version'}, 'history': []}
        await harness.server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'items_to_address': [item]}})
        before = await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        response = await self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['items_to_address'], [item])
        self.assertEqual(response.json()['item_controls'][item['item_id']]['origin'], 'unknown')
        self.assertEqual(await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']}), before)

    async def test_client_questions_refuse_incomplete_or_pending_program_population(self):
        await self.configure()
        workspace = await self.workspace('cis-ig1')
        row = workspace['assessments'][0]
        await harness.server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']},
            {'$set': {'_r4_context_pending': 'other-accepted-command'}})
        pending = await self.client.get('/api/frameworks/cis-ig1/client-questions', params={'client_id': 'a'})
        self.assertEqual(pending.status_code, 409, pending.text)
        await harness.server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']},
            {'$unset': {'_r4_context_pending': ''}})
        collection = harness.server.db.framework_assessments
        # Use the native declarations in both isolated and real-Mongo variants.
        await collection.create_index('framework_assessment_id', unique=True)
        definition_index = [('client_id', 1), ('framework_key', 1), ('framework_version', 1), ('definition_id', 1)]
        await collection.create_index(definition_index, unique=True)
        indexes = await collection.index_information()
        self.assertTrue(any(index.get('key') == definition_index and index.get('unique') is True
            for index in indexes.values()))
        def canonical_records(records, expected_length):
            self.assertEqual(len(records), expected_length)
            identities = [record['framework_assessment_id'] for record in records]
            self.assertEqual(len(set(identities)), len(identities))
            return sorted(records, key=lambda record: record['framework_assessment_id'])

        canonical = copy.deepcopy(await collection.find({}).to_list(None))
        canonical = canonical_records(canonical, len(canonical))
        duplicate = {**row, 'framework_assessment_id': 'duplicate-native-definition'}
        self.assertNotIn('_id', duplicate)
        self.assertNotIn(duplicate['framework_assessment_id'], [record['framework_assessment_id'] for record in canonical])
        with self.assertRaises(DuplicateKeyError):
            await collection.insert_one(duplicate)
        self.assertEqual(canonical_records(await collection.find({}).to_list(None), len(canonical)), canonical)
        query = {'client_id': 'a', 'framework_key': 'cis-ig1'}
        projection = {'_id': 0}
        expected_rows = [{key: value for key, value in record.items() if key != '_id'} for record in canonical
            if record['client_id'] == query['client_id'] and record['framework_key'] == query['framework_key']]
        original_find = type(collection).find
        for malformed in ('duplicate', 'missing'):
            with self.subTest(population=malformed):
                observed_reads = []

                def scoped_program_read(current_collection, *args, **kwargs):
                    cursor = original_find(current_collection, *args, **kwargs)
                    if current_collection.full_name != collection.full_name or args != (query, projection) or kwargs:
                        return cursor

                    class MalformedProgramCursor:
                        async def to_list(cursor_self, length):
                            self.assertEqual(length, 10001)
                            records = await cursor.to_list(length)
                            self.assertEqual(canonical_records(records, len(expected_rows)), expected_rows)
                            observed_reads.append(malformed)
                            if malformed == 'duplicate':
                                return [*records, {**copy.deepcopy(records[0]),
                                    'framework_assessment_id': 'duplicate-native-definition'}]
                            return records[1:]

                    return MalformedProgramCursor()

                # Inject only a malformed read; the canonical unique records stay intact.
                with patch.object(type(collection), 'find', new=scoped_program_read):
                    incomplete = await self.client.get('/api/frameworks/cis-ig1/client-questions', params={'client_id': 'a'})
                self.assertEqual(observed_reads, [malformed])
                self.assertEqual(incomplete.status_code, 409, incomplete.text)
                self.assertEqual(incomplete.json()['detail'], 'The complete current program assessment population could not be verified')
                self.assertEqual(canonical_records(await collection.find({}).to_list(None), len(canonical)), canonical)
                self.assertEqual(await collection.index_information(), indexes)

    async def test_manual_item_late_audit_failure_recovers_once_before_another_write_is_published(self):
        await self.configure()
        row = (await self.workspace('cis-ig1'))['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        body = {'expected_revision': row.get('items_revision', 0), 'request_id': uuid.uuid4().hex,
            'item_type': 'confirmation', 'text': 'SYNTHETIC retained Item audit recovery — Ω'}
        original = harness.server.audit
        async def fail_item_audit(user, action, *args, **kwargs):
            if action == 'Assessment item updated':
                raise RuntimeError('SYNTHETIC late Item audit persistence failure')
            return await original(user, action, *args, **kwargs)
        with patch.object(harness.server, 'audit', side_effect=fail_item_audit):
            failed = await self.client.post(path + '/items', json=body)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual((await self.client.get(path)).status_code, 409)
        stored = await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        self.assertTrue(stored['_r4_context_pending'])
        self.assertEqual(len(stored['items_to_address']), 1)
        recovered = await self.client.post(path + '/items', json=body)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        repeated = await self.client.post(path + '/items', json=body)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(repeated.json(), recovered.json())
        item = recovered.json()['items_to_address'][0]
        self.assertEqual(len(item['history']), 1)
        self.assertEqual(await harness.server.db.audit_logs.count_documents({'action': 'Assessment item updated',
            'entity_id': row['framework_assessment_id'], 'meta.item_id': item['item_id']}), 1)
        remove_body = {'expected_revision': recovered.json()['items_revision']}
        remove_path = path + '/items/' + item['item_id'] + '/remove'
        with patch.object(harness.server, 'audit', side_effect=fail_item_audit):
            failed_remove = await self.client.post(remove_path, json=remove_body)
        self.assertEqual(failed_remove.status_code, 503, failed_remove.text)
        self.assertEqual((await self.client.get(path)).status_code, 409)
        removed = await self.client.post(remove_path, json=remove_body)
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertEqual(removed.json()['items_to_address'][0]['state'], 'removed')
        self.assertEqual([event['event'] for event in removed.json()['items_to_address'][0]['history']], ['added', 'removed'])
        self.assertEqual(await harness.server.db.audit_logs.count_documents({'action': 'Assessment item updated',
            'entity_id': row['framework_assessment_id'], 'meta.item_id': item['item_id']}), 2)
        for field in ('status', 'verification', 'implementation', 'last_saved', 'last_assessed', 'assessment_history'):
            self.assertEqual(removed.json().get(field), row.get(field))

    async def test_item_actions_use_native_tasks_without_findings_and_recheck_completed_retry_authority(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            with self.subTest(framework=key):
                self.sign_in('admin')
                path, before, item = await self.task_item_fixture(key)
                self.sign_in('member')
                route = path + '/items/' + item['item_id'] + '/task'
                headers = {'Idempotency-Key': uuid.uuid4().hex}
                body = {'expected_revision': before['items_revision'], 'title': 'SYNTHETIC confirm source — München Ω',
                    'description': item['text'], 'priority': 'medium', 'assignee_id': 'member', 'due_date': '2026-12-15'}
                created = await self.client.post(route, json=body, headers=headers)
                self.assertEqual(created.status_code, 200, created.text)
                task = created.json()
                self.assertEqual((task['client_id'], task['framework_assessment_id'], task['assessment_item_id']),
                    ('a', before['framework_assessment_id'], item['item_id']))
                self.assertEqual((task['source_type'], task.get('source_id'), task['status']), ('other', None, 'open'))
                self.assertFalse(task.get('finding_id'))
                after = (await self.client.get(path)).json()
                for field in ('status', 'verification', 'implementation', 'assessment_history', 'last_saved', 'last_assessed'):
                    self.assertEqual(after.get(field), before.get(field))
                linked = next(current for current in after['items_to_address'] if current['item_id'] == item['item_id'])
                self.assertEqual(linked['task_id'], task['task_id'])
                self.assertEqual(linked['state'], 'open')
                self.assertEqual(await harness.server.db.findings.count_documents({}), 0)
                self.assertEqual(await harness.server.db.tasks.count_documents({'assessment_item_id': item['item_id']}), 1)
                retry = await self.client.post(route, json=body, headers=headers)
                self.assertEqual(retry.status_code, 200, retry.text)
                self.assertEqual(retry.json(), task)
                await harness.server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
                denied = await self.client.post(route, json=body, headers=headers)
                self.assertEqual(denied.status_code, 403, denied.text)
                self.assertEqual(await harness.server.db.tasks.count_documents({'assessment_item_id': item['item_id']}), 1)
                await harness.server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_contributor'}})

    async def test_only_an_actual_open_gap_creates_a_new_finding_and_existing_replay_stays_safe(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        for item_type in ('confirmation', 'evidence', 'gap'):
            with self.subTest(item_type=item_type):
                path, row, item = await self.task_item_fixture(item_type=item_type)
                body = {'request_id': uuid.uuid4().hex, 'item_id': item['item_id'],
                    'title': 'SYNTHETIC actual gap', 'remediation_title': 'SYNTHETIC address actual gap'}
                before_findings = await harness.server.db.findings.count_documents({})
                before_tasks = await harness.server.db.tasks.count_documents({})
                response = await self.client.post(path + '/findings', json=body)
                if item_type != 'gap':
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertEqual(await harness.server.db.findings.count_documents({}), before_findings)
                    self.assertEqual(await harness.server.db.tasks.count_documents({}), before_tasks)
                    self.assertEqual((await self.client.get(path)).json(), row)
                    continue
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['assessment_item_id'], item['item_id'])
                self.assertEqual(await harness.server.db.findings.count_documents({}), before_findings + 1)
                self.assertEqual(await harness.server.db.tasks.count_documents({}), before_tasks + 1)
                saved = (await self.client.get(path)).json()
                resolved = await self.client.patch(path + '/items/' + item['item_id'], json={
                    'expected_revision': saved['items_revision'], 'state': 'resolved', 'resolution': 'SYNTHETIC reviewed work'})
                self.assertEqual(resolved.status_code, 200, resolved.text)
                replay = await self.client.post(path + '/findings', json=body)
                self.assertEqual(replay.status_code, 200, replay.text)
                self.assertEqual(replay.json()['finding_id'], response.json()['finding_id'])
                self.assertEqual((await self.client.get(path)).json(), resolved.json())

    async def test_item_action_recovery_hides_partial_pair_and_refuses_revoked_writer(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        path, before, item = await self.task_item_fixture()
        self.sign_in('member')
        route = path + '/items/' + item['item_id'] + '/task'
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        body = {'expected_revision': before['items_revision'], 'title': 'SYNTHETIC interrupted follow-up', 'assignee_id': 'member'}
        collection = harness.server.db.tasks
        original = type(collection).update_one
        async def interrupt(target_collection, query, update, *args, **kwargs):
            if target_collection.full_name == collection.full_name and '_r4_context_applied' in update.get('$set', {}):
                raise RuntimeError('SYNTHETIC interruption after assessment link and before Task receipt')
            return await original(target_collection, query, update, *args, **kwargs)
        with patch.object(type(collection), 'update_one', interrupt):
            failed = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        task = await harness.server.db.tasks.find_one({'assessment_item_id': item['item_id']})
        self.assertTrue(task['_r4_context_pending'])
        self.assertEqual((await self.client.get(path)).status_code, 409)
        self.assertEqual((await self.client.get('/api/tasks/' + task['task_id'])).status_code, 409)
        await harness.server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        retained_before = await harness.server.db.tasks.find_one({'task_id': task['task_id']})
        denied = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await harness.server.db.tasks.find_one({'task_id': task['task_id']}), retained_before)
        await harness.server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_contributor'}})
        recovered = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()['task_id'], task['task_id'])
        self.assertEqual(await harness.server.db.tasks.count_documents({'assessment_item_id': item['item_id']}), 1)
        self.assertEqual((await self.client.get(path)).status_code, 200)
        self.assertEqual((await self.client.get('/api/tasks/' + task['task_id'])).status_code, 200)

    async def test_resolution_late_audit_failure_retries_exact_intent_and_preserves_retained_scope_access(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        path, before, item = await self.task_item_fixture()
        route = path + '/items/' + item['item_id']
        original = harness.server.audit
        async def fail_item_audit(user, action, *args, **kwargs):
            if action == 'Assessment item updated':
                raise RuntimeError('SYNTHETIC post-resolution audit failure')
            return await original(user, action, *args, **kwargs)
        for state in ('resolved', 'open'):
            with self.subTest(state=state):
                current = (await self.client.get(path)).json()
                body = {'expected_revision': current['items_revision'], 'state': state, 'resolution': 'SYNTHETIC exact recovery — Ω'}
                with patch.object(harness.server, 'audit', side_effect=fail_item_audit):
                    failed = await self.client.patch(route, json=body)
                self.assertEqual(failed.status_code, 503, failed.text)
                self.assertEqual((await self.client.get(path)).status_code, 409)
                recovered = await self.client.patch(route, json=body)
                self.assertEqual(recovered.status_code, 200, recovered.text)
                retry = await self.client.patch(route, json=body)
                self.assertEqual(retry.status_code, 200, retry.text)
                self.assertEqual(retry.json(), recovered.json())
                actual = next(row for row in recovered.json()['items_to_address'] if row['item_id'] == item['item_id'])
                self.assertEqual((actual['state'], actual['resolution']), (state, body['resolution']))
                for field in ('status', 'implementation', 'verification', 'last_saved', 'assessment_history'):
                    self.assertEqual(recovered.json().get(field), before.get(field))
        self.assertEqual([entry['event'] for entry in actual['history']], ['added', 'resolved', 'reopened'])
        await harness.server.db.requirements.update_many({'client_id': 'a', 'baseline_key': 'nist-csf-2'}, {'$set': {'baseline_response': 'does_not_apply'}})
        final = await self.client.patch(route, json={'expected_revision': recovered.json()['items_revision'], 'state': 'resolved', 'resolution': 'SYNTHETIC retained scope resolution'})
        self.assertEqual(final.status_code, 200, final.text)

    async def test_native_task_domain_audit_failure_holds_both_records_and_recovers_without_duplicates(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        path, before, item = await self.task_item_fixture()
        route = path + '/items/' + item['item_id'] + '/task'
        body = {'expected_revision': before['items_revision'], 'title': 'SYNTHETIC native audit recovery'}
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        original = harness.server.audit
        async def fail_task_audit(user, action, entity_type, *args, **kwargs):
            if action == 'create' and entity_type == 'task':
                raise RuntimeError('SYNTHETIC native Task create audit failure')
            return await original(user, action, entity_type, *args, **kwargs)
        with patch.object(harness.server, 'audit', side_effect=fail_task_audit):
            failed = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(failed.status_code, 503, failed.text)
        task = await harness.server.db.tasks.find_one({'assessment_item_id': item['item_id']})
        self.assertTrue(task['_r4_context_pending'])
        self.assertEqual((await self.client.get(path)).status_code, 409)
        self.assertEqual((await self.client.get('/api/tasks/' + task['task_id'])).status_code, 409)
        recovered = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        retry = await self.client.post(route, json=body, headers=headers)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(recovered.json(), retry.json())
        self.assertEqual(await harness.server.db.tasks.count_documents({'assessment_item_id': item['item_id']}), 1)
        self.assertEqual(await harness.server.db.audit_logs.count_documents({'action': 'create', 'entity_id': task['task_id']}), 1)
        self.assertEqual((await self.client.get(path)).status_code, 200)

    async def test_item_action_rejects_gap_forged_provenance_assignee_and_lost_claim(self):
        await self.configure(self.body(programs=('nist-csf-2',)))
        path, before, item = await self.task_item_fixture(item_type='gap')
        route = path + '/items/' + item['item_id'] + '/task'
        body = {'expected_revision': before['items_revision'], 'title': 'SYNTHETIC gap cannot bypass Finding'}
        response = await self.client.post(route, json=body, headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(response.status_code, 409, response.text)
        path, before, item = await self.task_item_fixture(item_type='evidence')
        route = path + '/items/' + item['item_id'] + '/task'
        body = {'expected_revision': before['items_revision'], 'title': 'SYNTHETIC source confirmation'}
        self.sign_in('member')
        for extra, status in (({'client_id': 'b'}, 422), ({'framework_assessment_id': 'other'}, 422),
                              ({'assignee_id': 'admin'}, 403), ({'expected_revision': before['items_revision'] - 1}, 409)):
            response = await self.client.post(route, json={**body, **extra}, headers={'Idempotency-Key': uuid.uuid4().hex})
            self.assertEqual(response.status_code, status, response.text)
        collection = harness.server.db.framework_assessments
        original = type(collection).update_one
        changed = False
        async def concurrent_change(target_collection, query, update, *args, **kwargs):
            nonlocal changed
            if target_collection.full_name == collection.full_name and not changed and '_r4_context_pending' in update.get('$set', {}):
                changed = True
                concurrent = await self.client.post(path + '/items', json={'expected_revision': before['items_revision'],
                    'request_id': uuid.uuid4().hex, 'item_type': 'confirmation', 'text': 'SYNTHETIC concurrent retained Item'})
                self.assertEqual(concurrent.status_code, 200, concurrent.text)
            return await original(target_collection, query, update, *args, **kwargs)
        with patch.object(type(collection), 'update_one', concurrent_change):
            conflict = await self.client.post(route, json=body, headers={'Idempotency-Key': uuid.uuid4().hex})
        self.assertEqual(conflict.status_code, 409, conflict.text)
        self.assertTrue(changed)
        self.assertEqual(await harness.server.db.tasks.count_documents({}), 0)
        self.assertEqual(await harness.server.db.findings.count_documents({}), 0)
        current = (await self.client.get(path)).json()
        self.assertTrue(any(item['text'] == 'SYNTHETIC concurrent retained Item' for item in current['items_to_address']))

    async def test_cmmc_level_changes_reuse_answers_files_and_history(self):
        await self.configure(self.body(programs=('cmmc',)))
        initial = await self.workspace('cmmc')
        self.assertEqual(len(initial['active_definition_ids']), 110)
        row = next(r for r in initial['assessments'] if r['definition_id'] == '3.14.7')
        retained = {'implementation': 'Existing CUI scope method', 'assessment_history': [{'at': '2026-01-01', 'by': 'admin', 'implementation': 'Retained'}], 'related_links': [{'kind': 'evidence', 'id': 'retained-file'}]}
        await harness.server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': retained})
        identities = {r['definition_id']: r['framework_assessment_id'] for r in initial['assessments']}
        token = None
        for level, count in ((1, 17), (2, 110), (1, 17), (2, 110)):
            response = await self.client.patch('/api/frameworks/cmmc/configuration', headers={'Idempotency-Key': uuid.uuid4().hex}, json={
                'client_id': 'a', 'level': level, 'expected_updated_at': token, 'confirm_reduction': True,
                'reason': 'Synthetic scope exercise', 'effective_date': date.today().isoformat()})
            self.assertEqual(response.status_code, 200, response.text)
            token = response.json()['expected_updated_at']
            current = await self.workspace('cmmc')
            self.assertEqual(len(current['active_definition_ids']), count)
            self.assertEqual({r['definition_id']: r['framework_assessment_id'] for r in current['assessments']}, identities)
            saved = next(r for r in current['assessments'] if r['definition_id'] == '3.14.7')
            self.assertEqual({key: saved[key] for key in retained}, retained)
        self.sign_in('member')
        denied = await self.client.patch('/api/frameworks/cmmc/configuration', headers={'Idempotency-Key': uuid.uuid4().hex}, json={'client_id': 'a', 'level': 1, 'expected_updated_at': token})
        self.assertEqual(denied.status_code, 403)

    async def test_cmmc_level_one_initialization_uses_only_its_native_child_scope(self):
        body=self.body(programs=('cmmc',))
        body['state']['framework_settings']={'cmmc':{'level':1}}
        await self.configure(body)
        current=await self.workspace('cmmc')
        expected={d['id'] for d in active_definitions('cmmc',{'level':1})}
        self.assertEqual(current['configuration']['level'],1)
        self.assertEqual(len(current['assessments']),17)
        self.assertEqual({row['definition_id'] for row in current['assessments']},expected)
        reviews=await harness.server.db.reviews.find({'client_id':'a'},{'_id':0}).to_list(None)
        self.assertTrue(all(set(driver['framework_safeguards'])<=expected for review in reviews for driver in review['framework_drivers']))

    async def test_three_new_interview_kinds_apply_only_on_native_save(self):
        await self.configure(self.body(programs=('hipaa', 'nist-csf-2', 'cmmc')))
        for key in ('hipaa', 'nist-csf-2', 'cmmc'):
            with self.subTest(key=key):
                row = (await self.workspace(key))['assessments'][0]
                path = '/api/framework_assessments/' + row['framework_assessment_id']
                original = copy.deepcopy(await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']}))
                draft = (await self.client.get(path + '/guided-assessment')).json()
                answers = {'practice': 'Not sure', 'implementation': 'Actual scope still needs confirmation', 'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'Confirm with the accountable person'}
                result = {'version': draft['version'], 'status': 'not_assessed', 'narrative': 'Reported implementation remains unknown.', 'basis': [], 'gaps': [], 'unknowns': [], 'nextSteps': [], 'evidence': [], 'answers': []}
                payload = {'version': draft['version'], 'answers': answers, 'step': 8, 'completed': True, 'narrative': result['narrative'], 'expected_revision': 0,
                    'base_assessment_token': draft['base_assessment_token'], 'base_scope_fingerprint': draft['base_scope_fingerprint'], 'result': result}
                response = await self.client.put(path + '/guided-assessment', json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                saved_draft = response.json()
                self.assertEqual(await harness.server.db.framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']}), original)
                applied = await self.client.patch(path, json={'implementation': result['narrative'], 'status': 'not_assessed',
                    'expected_last_assessed': None, 'guided_assessment_source': {field: saved_draft[field] for field in ('version', 'revision', 'generated_at')}})
                self.assertEqual(applied.status_code, 200, applied.text)
                self.assertTrue(applied.json()['items_to_address'])
                self.assertTrue(all(item['kind'] == 'verification' for item in applied.json()['items_to_address']))
                stale = await self.client.patch(path, json={'implementation': 'Stale overwrite', 'expected_last_assessed': None})
                self.assertEqual(stale.status_code, 409)

    async def test_shared_context_and_assessment_save_retries_once(self):
        await self.configure()
        row = (await self.workspace('cis-ig1'))['assessments'][0]
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        context = (await self.client.get(path + '/service-context')).json()
        activity = context['candidates'][0]
        body = {'implementation': 'Scoped actual implementation', 'status': 'in_progress', 'expected_last_assessed': None,
            'coordination': {'activity_id': activity['activity_id'], 'review_id': activity['review_id'],
                'expected_updated_at': activity['expected_updated_at'], 'expected_client_updated_at': context['expected_client_updated_at'],
                'notes': 'Retain the original setup notes and add this reviewed change.'}}
        key = uuid.uuid4().hex
        collection=harness.server.db.framework_assessments
        collection_type=type(collection)
        real_update=collection_type.update_one
        interrupted=False
        async def interrupt_assessment(target, query, update, **kwargs):
            nonlocal interrupted
            if target.full_name==collection.full_name and not interrupted and update.get('$set',{}).get('implementation')==body['implementation']:
                interrupted=True
                raise RuntimeError('Synthetic interruption after shared context writes')
            return await real_update(target,query,update,**kwargs)
        with patch.object(collection_type,'update_one',interrupt_assessment):
            failed=await self.client.patch(path,json=body,headers={'Idempotency-Key':key})
        self.assertEqual(failed.status_code,503,failed.text)
        self.assertTrue(interrupted)
        self.assertEqual((await self.client.get(path)).status_code,409)
        self.assertEqual((await self.client.get('/api/frameworks/summary',params={'client_id':'a'})).status_code,409)
        response = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(response.status_code, 200, response.text)
        retry = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json(), response.json())
        self.assertEqual(len(response.json()['assessment_history']), 1)
        review = await harness.server.db.reviews.find_one({'review_id': activity['review_id']})
        self.assertEqual(review['activity_setup']['notes'], body['coordination']['notes'])
        self.assertFalse(review.get('_r4_context_pending'))
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id': 'b'}), 0)

    async def test_hipaa_explicit_reconciliation_adds_only_unanswered_children(self):
        await self.configure(self.body(programs=('hipaa',)))
        initial=await self.workspace('hipaa')
        rows=initial['assessments']
        parents={d['parent_assessment_id'] for d in CATALOGS['hipaa']['requirements'] if d.get('parent_assessment_id')}
        child_ids={d['id'] for d in CATALOGS['hipaa']['requirements'] if d.get('parent_assessment_id')}
        for row in rows:
            if row['definition_id'] in child_ids:
                await harness.server.db.framework_assessments.delete_one({'framework_assessment_id':row['framework_assessment_id']})
            elif row['definition_id'] in parents:
                await harness.server.db.framework_assessments.update_one({'framework_assessment_id':row['framework_assessment_id']},
                    {'$set':{'status':'addressed','implementation':'Previously assessed native parent',
                        'assessment_history':[{'at':'2026-01-01','implementation':'Retained parent judgment'}]}})
        saved_parents=await harness.server.db.framework_assessments.find({'client_id':'a','definition_id':{'$in':list(parents)}},{'_id':0}).to_list(None)
        self.assertEqual(len((await self.workspace('hipaa'))['assessments']),76)
        self.assertEqual(await harness.server.db.framework_assessments.count_documents({'client_id':'a'}),76)
        response=await self.client.patch('/api/onboarding/programs/hipaa',json={'client_id':'a','applicability':'applies'})
        self.assertEqual(response.status_code,200,response.text)
        current=await self.workspace('hipaa')
        self.assertEqual(len(current['assessments']),81)
        self.assertEqual(await harness.server.db.framework_assessments.find({'client_id':'a','definition_id':{'$in':list(parents)}},{'_id':0}).to_list(None),saved_parents)
        children=[row for row in current['assessments'] if row['definition_id'] in child_ids]
        self.assertTrue(all(row['status']=='not_assessed' and not row['implementation'] and not row['assessment_history'] for row in children))
        self.assertEqual(await harness.server.db.reviews.count_documents({'client_id':'a'}),8)
    async def narrative_items_fixture(self, key, reported_evidence=None):
        workspace = await self.workspace(key)
        identity = {'cis-ig1': '2.1', 'iso-27001': '4.1', 'soc-2': 'CC1.1'}.get(key)
        definitions = {item['id']: item for item in CATALOGS[key]['requirements']}
        row = next(row for row in workspace['assessments'] if (row['definition_id'] == identity if identity
            else definitions[row['definition_id']].get('specification') != 'addressable'))
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        response = await self.client.patch(path, json={'implementation': 'SYNTHETIC existing manual position.',
            'status': 'in_progress', 'expected_last_assessed': row.get('last_saved') or row.get('last_assessed')})
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()
        draft = (await self.client.get(path + '/guided-assessment')).json()
        if key in guide.FRAMEWORKS:
            answers = {'practice': 'Not sure', 'implementation': 'SYNTHETIC current practice needs confirmation.',
                'gap': 'Not sure', 'unknown': 'Yes', 'unknown_reason': 'SYNTHETIC accountable-person confirmation.'}
            status = guide.result_status(row['definition_id'], answers, draft['version'])
        else:
            engine = native_guide.iso_guided_assessment if key == 'iso-27001' else native_guide.soc_guided_assessment
            questions = native_guide.VERSIONS[draft['version']]['safeguards'][row['definition_id']] if key == 'cis-ig1' else engine._questions(row['definition_id'], draft['version'])
            answers = {question['id']: ({name: 'Not sure' for name in question['rows']} if question['type'] == 'matrix'
                else '' if question['type'] == 'text' else 'Relevant' if question['type'] == 'context' else 'Not sure') for question in questions}
            answers.update(additional_gap='No', additional_confirmation='Yes', unknowns='SYNTHETIC requirement confirmation work.')
            if key == 'cis-ig1':
                native_guide.validate_completion(row['definition_id'], answers, draft['version'])
                status = 'not_assessed'  # Explicit fixture reports an unknown overall practice, with every source criterion unconfirmed.
            else:
                status = engine.result_status(row['definition_id'], answers, draft['version'])
        if reported_evidence is not None:
            answers['evidence'] = reported_evidence
        wording = 'SYNTHETIC reviewed ' + key + ' implementation — München Ω; uncertainty is retained.'
        payload = {'version': draft['version'], 'answers': answers, 'step': 0, 'completed': True,
            'narrative': wording, 'expected_revision': draft['revision'],
            'result': {'version': draft['version'], 'status': status, 'narrative': wording, 'basis': [],
                'gaps': [], 'unknowns': ['SYNTHETIC reported uncertainty.'], 'nextSteps': [],
                'evidence': [reported_evidence] if reported_evidence else [], 'answers': [], 'signals': []},
            **{field: draft[field] for field in ('base_assessment_token', 'base_scope_fingerprint')}}
        if key in ('iso-27001', 'soc-2'):
            payload['summary_review'] = {'version': draft['version'], 'answers': answers}
        response = await self.client.put(path + '/guided-assessment', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        draft = response.json()
        self.assertEqual((await self.client.get(path)).json(), row)
        return path, row, draft, {'implementation': wording,
            'guided_assessment_source': {field: draft[field] for field in ('version', 'revision', 'generated_at')},
            'expected_last_assessed': row.get('last_saved') or row.get('last_assessed')}

    async def test_narrative_items_only_preserves_manual_judgment_in_all_six_frameworks(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            with self.subTest(framework=key):
                path, before, draft, body = await self.narrative_items_fixture(key)
                counts = [await harness.server.db[name].count_documents({}) for name in ('findings', 'tasks')]
                response = await self.client.patch(path, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                saved = response.json()
                for field in ('status', 'verification', 'assessment_recorded_at', 'assessment_recorded_by'):
                    self.assertEqual(saved.get(field), before.get(field))
                self.assertEqual(saved['implementation'], draft['narrative'])
                self.assertNotEqual(saved['last_saved'], before['last_saved'])
                self.assertEqual(saved['last_assessed'], saved['last_saved'])  # Existing legacy write token, not new verification.
                self.assertEqual(len(saved['assessment_history']), len(before['assessment_history']) + 1)
                self.assertEqual(saved['assessment_history'][-1]['status'], before['status'])
                self.assertTrue(saved['items_to_address'])
                self.assertTrue(all(item['kind'] == 'verification' for item in saved['items_to_address']))
                self.assertEqual(counts, [await harness.server.db[name].count_documents({}) for name in ('findings', 'tasks')])
                item = saved['items_to_address'][0]
                resolved = await self.client.patch(path + '/items/' + item['item_id'], json={
                    'expected_revision': saved['items_revision'], 'state': 'resolved', 'resolution': 'SYNTHETIC retained analyst resolution.'})
                self.assertEqual(resolved.status_code, 200, resolved.text)
                current = resolved.json()
                repeated = await self.client.patch(path, json={**body, 'expected_last_assessed': current['last_saved']})
                self.assertEqual(repeated.status_code, 200, repeated.text)
                for field in ('items_to_address', 'items_revision', 'assessment_history', 'last_saved', 'last_assessed', 'status', 'verification'):
                    self.assertEqual(repeated.json().get(field), current.get(field))

    async def test_narrative_items_only_refuses_mixed_edits_null_and_changed_source(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            path, before, draft, body = await self.narrative_items_fixture(key)
            missing_token = {field: value for field, value in body.items() if field != 'expected_last_assessed'}
            invalid = [(missing_token, 428), ({**body, 'expected_last_assessed': 'synthetic-stale-token'}, 409),
                ({**body, 'status': None}, 422), ({**body, 'notes': before.get('notes') or ''}, 422),
                ({**body, 'record_assessment': False}, 422), ({**body, 'implementation': 'Unreviewed text'}, 422),
                ({**body, 'guided_assessment_source': {**body['guided_assessment_source'], 'revision': draft['revision'] + 1}}, 409),
                ({**body, 'guided_assessment_source': {**body['guided_assessment_source'], 'generated_at': draft['generated_at'] + '-changed'}}, 409)]
            if key != 'cis-ig1':
                invalid.append(({**body, 'status': before['status']}, 422))  # Existing judged path still requires proposed status.
            for payload, status in invalid:
                with self.subTest(framework=key, fields=sorted(set(payload) - set(body)), status=status):
                    if 'expected_last_assessed' not in payload:
                        # Bypass only the harness's automatic fresh-editor token for this raw negative request.
                        hooks = self.client.event_hooks['request']
                        self.client.event_hooks['request'] = []
                        try:
                            response = await self.client.patch(path, json=payload)
                        finally:
                            self.client.event_hooks['request'] = hooks
                        self.assertNotIn('expected_last_assessed', json.loads(response.request.content))
                    else:
                        response = await self.client.patch(path, json=payload)
                    self.assertEqual(response.status_code, status, response.text)
                    self.assertEqual((await self.client.get(path)).json(), before)

    async def test_narrative_items_coordinated_save_recovers_exact_original_once(self):
        await self.configure()
        path, before, draft, body = await self.narrative_items_fixture('cis-ig1')
        context = (await self.client.get(path + '/service-context')).json()
        activity = context['candidates'][0]
        body['coordination'] = {'activity_id': activity['activity_id'], 'review_id': activity['review_id'],
            'expected_updated_at': activity['expected_updated_at'], 'expected_client_updated_at': context['expected_client_updated_at'],
            'notes': 'SYNTHETIC original reviewed context and Items command.'}
        collection = harness.server.db.framework_assessments
        update = type(collection).update_one
        interrupted = False
        async def fail_after_context(target, query, change, **kwargs):
            nonlocal interrupted
            if target.full_name == collection.full_name and not interrupted and change.get('$set', {}).get('implementation') == draft['narrative']:
                interrupted = True
                raise RuntimeError('Synthetic interruption before assessment and Items apply')
            return await update(target, query, change, **kwargs)
        key = uuid.uuid4().hex
        with patch.object(type(collection), 'update_one', fail_after_context):
            failed = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertTrue(interrupted)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual((await self.client.get(path)).status_code, 409)
        recovered = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(recovered.status_code, 200, recovered.text)
        repeated = await self.client.patch(path, json=body, headers={'Idempotency-Key': key})
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(repeated.json(), recovered.json())
        saved = recovered.json()
        self.assertEqual(saved['status'], before['status'])
        self.assertEqual(saved.get('verification'), before.get('verification'))
        self.assertTrue(saved['items_to_address'])
        self.assertEqual(len(saved['assessment_history']), len(before['assessment_history']) + 1)
        self.assertEqual(await harness.server.db.findings.count_documents({}), 0)
        self.assertEqual(await harness.server.db.tasks.count_documents({}), 0)
    async def test_pending_resolve_remove_batch_recovers_the_frozen_context_save_once(self):
        await self.configure()
        path, before, draft, body = await self.narrative_items_fixture('cis-ig1')
        proposed = assessment_items.generated(before, draft)[0]
        target = {'question_id': proposed['question_id'], 'kind': proposed['kind']}
        request = uuid.uuid4().hex
        body['item_draft'] = {'expected_revision': before.get('items_revision', 0), 'operations': [
            {'operation': 'add', 'request_id': request, 'item_type': 'confirmation', 'text': 'SYNTHETIC pending manual follow-up'},
            {'operation': 'resolve', 'target': target, 'state': 'resolved', 'resolution': 'SYNTHETIC confirmed before removal'},
            {'operation': 'remove', 'target': target}]}
        context = (await self.client.get(path + '/service-context')).json()
        activity = context['candidates'][0]
        body['coordination'] = {'activity_id': activity['activity_id'], 'review_id': activity['review_id'],
            'expected_updated_at': activity['expected_updated_at'], 'expected_client_updated_at': context['expected_client_updated_at'],
            'notes': 'SYNTHETIC coordinated pending Item operations.'}
        collection = harness.server.db.framework_assessments
        original = type(collection).update_one
        interrupted = False
        async def stop_before_items(target_collection, query, change, **kwargs):
            nonlocal interrupted
            if (target_collection.full_name == collection.full_name and not interrupted
                    and change.get('$set', {}).get('implementation') == draft['narrative']):
                interrupted = True
                raise RuntimeError('SYNTHETIC interruption before frozen pending Item batch')
            return await original(target_collection, query, change, **kwargs)
        headers = {'Idempotency-Key': uuid.uuid4().hex}
        with patch.object(type(collection), 'update_one', stop_before_items):
            failed = await self.client.patch(path, json=body, headers=headers)
        self.assertTrue(interrupted)
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual((await self.client.get(path)).status_code, 409)
        recovered = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        repeated = await self.client.patch(path, json=body, headers=headers)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(repeated.json(), recovered.json())
        saved = recovered.json()
        item = next(item for item in saved['items_to_address'] if item['item_id'] == proposed['item_id'])
        self.assertEqual((item['state'], item['resolution']), ('removed', 'SYNTHETIC confirmed before removal'))
        self.assertEqual([event['event'] for event in item['history']], ['generated', 'resolved', 'removed'])
        self.assertEqual(len([item for item in saved['items_to_address'] if item.get('request_id') == request]), 1)
        self.assertEqual(len(saved['assessment_history']), len(before['assessment_history']) + 1)
        for field in ('status', 'verification'):
            self.assertEqual(saved.get(field), before.get(field))
        self.assertEqual(await harness.server.db.tasks.count_documents({}), 0)
        self.assertEqual(await harness.server.db.findings.count_documents({}), 0)

    async def rereview_reported_evidence(self, path, body):
        current = (await self.client.get(path + '/guided-assessment')).json()
        compare = {'version': current['version'], 'answers': current['answers'], 'step': current['step'],
            'narrative': current['narrative'], 'completed': False, 'rebase': True, 'expected_revision': current['revision'],
            'base_assessment_token': current['current_assessment_token'], 'base_scope_fingerprint': current['current_scope_fingerprint']}
        response = await self.client.put(path + '/guided-assessment', json=compare)
        self.assertEqual(response.status_code, 200, response.text)
        compared = response.json()
        completion = {**compare, 'rebase': False, 'completed': True, 'result': current['result'],
            'expected_revision': compared['revision'], **{key: compared[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}}
        if current.get('summary_review'):
            completion['summary_review'] = current['summary_review']
        response = await self.client.put(path + '/guided-assessment', json=completion)
        self.assertEqual(response.status_code, 200, response.text)
        reviewed = response.json()
        self.assertEqual(reviewed['answers'], current['answers'])
        self.assertEqual(reviewed['narrative'], current['narrative'])
        row = (await self.client.get(path)).json()
        return {**body, 'expected_last_assessed': row['last_saved'],
            'guided_assessment_source': {key: reviewed[key] for key in ('version', 'revision', 'generated_at')}}
    async def test_reported_evidence_follow_up_uses_current_links_in_all_six_frameworks(self):
        keys = ('cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc')
        await self.configure(self.body(programs=keys))
        for key in keys:
            with self.subTest(framework=key):
                reported = '  SYNTHETIC reported records need linking; location and contents unverified — Ω.  '
                path, before, draft, body = await self.narrative_items_fixture(key, reported)
                self.assertEqual((await self.client.get(path + '/related')).json()['evidence'], [])
                response = await self.client.patch(path, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                saved = response.json()
                item = next(item for item in saved['items_to_address'] if item['question_id'] == 'evidence')
                self.assertEqual((item['kind'], item['state'], item['text']),
                    ('verification', 'open', 'Link the reported evidence: ' + reported.strip()))
                self.assertEqual((saved['status'], saved.get('verification')), (before['status'], before.get('verification')))
                self.assertEqual(await harness.server.db.findings.count_documents({}), 0)
                self.assertEqual(await harness.server.db.tasks.count_documents({}), 0)
                resolved = await self.client.patch(path + '/items/' + item['item_id'], json={
                    'expected_revision': saved['items_revision'], 'state': 'resolved', 'resolution': 'SYNTHETIC retained follow-up note.'})
                self.assertEqual(resolved.status_code, 200, resolved.text)
                saved = resolved.json()
                repeated = await self.client.patch(path, json={**body, 'expected_last_assessed': saved['last_saved']})
                self.assertEqual(repeated.status_code, 200, repeated.text)
                self.assertEqual(repeated.json(), saved)
                uploaded = await self.client.post('/api/evidence', json={'client_id': before['client_id'],
                    'linked_type': 'framework_assessment', 'linked_id': before['framework_assessment_id'],
                    'filename': 'SYNTHETIC reported record Ω.txt', 'mime_type': 'text/plain', 'content_base64': 'c3ludGhldGljCg=='})
                self.assertEqual(uploaded.status_code, 200, uploaded.text)
                artifact = uploaded.json()
                stored_artifact = await harness.server.db.evidence.find_one({'evidence_id': artifact['evidence_id']})
                self.assertEqual([entry['evidence_id'] for entry in (await self.client.get(path + '/related')).json()['evidence']], [artifact['evidence_id']])
                self.assertEqual((await self.client.get(path)).json(), saved)  # Reads never reconcile follow-up history.
                body = await self.rereview_reported_evidence(path, body)
                linked = await self.client.patch(path, json=body)
                self.assertEqual(linked.status_code, 200, linked.text)
                saved = linked.json()
                archived = next(current for current in saved['items_to_address'] if current['item_id'] == item['item_id'])
                self.assertEqual((archived['state'], archived['resolution']), ('superseded', 'SYNTHETIC retained follow-up note.'))
                unlinked = await self.client.request('DELETE', path + '/links', json={'kind': 'evidence', 'id': artifact['evidence_id']})
                self.assertEqual(unlinked.status_code, 200, unlinked.text)
                self.assertEqual((await self.client.get(path + '/related')).json()['evidence'], [])
                current = (await self.client.get(path)).json()
                self.assertEqual(current['items_to_address'], saved['items_to_address'])
                body = await self.rereview_reported_evidence(path, body)
                restored = await self.client.patch(path, json=body)
                self.assertEqual(restored.status_code, 200, restored.text)
                item_after = next(entry for entry in restored.json()['items_to_address'] if entry['item_id'] == item['item_id'])
                self.assertEqual((item_after['state'], item_after['resolution']), ('open', 'SYNTHETIC retained follow-up note.'))
                self.assertEqual(item_after['history'][:len(archived['history'])], archived['history'])
                self.assertEqual(await harness.server.db.evidence.find_one({'evidence_id': artifact['evidence_id']}), stored_artifact)

    async def test_reported_evidence_read_failure_does_not_claim_absence_or_save(self):
        await self.configure()
        path, before, draft, body = await self.narrative_items_fixture('cis-ig1', 'SYNTHETIC reported record — availability unknown.')
        with patch('framework_governance.related', side_effect=HTTPException(503, 'Synthetic related Evidence read unavailable')):
            response = await self.client.patch(path, json=body)
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual((await self.client.get(path)).json(), before)
        self.assertEqual(await harness.server.db.findings.count_documents({}), 0)
        self.assertEqual(await harness.server.db.tasks.count_documents({}), 0)
