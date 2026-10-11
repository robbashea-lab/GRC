"""Real ISO HTTP/auth flows on isolated Mongo mocks, not hosted/Motor assurance."""
import asyncio
import copy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from pymongo.errors import AutoReconnect, NetworkTimeout, OperationFailure, WriteConcernError
import guided_assessment
import iso_guided_assessment as engine
import iso_guided_lease
import test_framework_governance as harness
from test_iso_guided_assessment import complete

server = harness.server


class IsoGuidedRoutes(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.FrameworkTests.asyncSetUp
    sign_in = harness.FrameworkTests.sign_in
    body = harness.FrameworkTests.body
    configure = harness.FrameworkTests.configure

    async def setup_iso(self, cid='a', programs=('iso-27001',)):
        await self.configure(self.body(programs, cid))
        response = await self.client.get('/api/frameworks/iso-27001', params={'client_id': cid})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def path(self, row):
        return '/api/framework_assessments/' + row['framework_assessment_id']

    def token(self, row):
        return row.get('last_saved') or row.get('last_assessed')

    async def decision(self, row, applicability='included', justification='Synthetic risk treatment rationale'):
        response = await self.client.patch(self.path(row), json={'soa_applicability': applicability,
            'soa_justification': justification, 'expected_last_assessed': self.token(row)})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def finish(self, row, answers=None):
        path = self.path(row) + '/guided-assessment'
        response = await self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        draft = response.json()
        answers = complete(row['definition_id']) if answers is None else answers
        text = 'OVERVIEW\nSynthetic reported practices for ' + row['definition_id'] + '\n\nIMPLEMENTATION BREAKDOWN\n- User reviewed wording.\n\nITEMS TO ADDRESS\n- Confirm reported limits.\n'
        status = engine.result_status(row['definition_id'], answers)
        result = {'version': engine.VERSION, 'status': status, 'narrative': text, 'basis': [], 'gaps': [],
                  'unknowns': [], 'nextSteps': [], 'evidence': [], 'answers': [], 'signals': []}
        payload = {'version': engine.VERSION, 'answers': answers, 'completed': True, 'narrative': text,
                   'expected_revision': draft['revision'], 'result': result,
                   'summary_review': {'version': engine.VERSION, 'answers': answers},
                   **{k: draft[k] for k in ('base_assessment_token', 'base_scope_fingerprint') if k in draft}}
        response = await self.client.put(path, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json(), payload

    def native(self, row, draft):
        return {'implementation': draft['narrative'], 'status': draft['result']['status'],
                'guided_assessment_source': {k: draft[k] for k in ('version', 'revision', 'generated_at')},
                'expected_last_assessed': self.token(row)}

    async def fixture(self, id='4.1'):
        workspace = await self.setup_iso()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == id)
        if id.startswith('A.'):
            row = await self.decision(row)
        draft, payload = await self.finish(row)
        return row, self.path(row), draft, payload, self.native(row, draft)

    async def assert_released(self, row):
        lease = await server.db.iso_guided_locks.find_one({'_id': row['framework_assessment_id']})
        self.assertEqual(lease['until'], '')
        self.assertNotIn('token', lease)

    async def expire(self, row):
        await server.db.iso_guided_locks.update_one({'_id': row['framework_assessment_id']},
            {'$set': {'until': (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}})

    async def test_all_123_resume_exact_native_save_and_shared_soa_annex_record(self):
        workspace = await self.setup_iso()
        self.assertEqual(len(workspace['assessments']), 123)
        for row in workspace['assessments']:
            with self.subTest(id=row['definition_id']):
                if row['definition_id'].startswith('A.'):
                    row = await self.decision(row)
                before = copy.deepcopy(row)
                draft, payload = await self.finish(row)
                self.assertEqual((await self.client.get(self.path(row))).json(), before)
                self.assertEqual((await self.client.get(self.path(row) + '/guided-assessment')).json()['answers'], payload['answers'])
                write = self.native(row, draft)
                response = await self.client.patch(self.path(row), json=write)
                self.assertEqual(response.status_code, 200, response.text)
                saved = response.json()
                self.assertEqual(saved['implementation'], draft['narrative'])
                self.assertEqual(saved['status'], 'addressed')
                for key in ('soa_applicability', 'soa_justification', 'iso_assessment_checks', 'related_links', 'owner_id', 'process_owner_id', 'notes', 'technology', 'verification', 'soa_approval'):
                    self.assertEqual(saved.get(key), before.get(key), key)
                source = saved['assessment_history'][-1]['guided_assessment_source']
                self.assertEqual(source['answers'], payload['answers'])
                self.assertEqual(source['version'], engine.VERSION)
                self.assertEqual((await self.client.patch(self.path(row), json=write)).status_code, 409)
        reopened = (await self.client.get('/api/frameworks/iso-27001?client_id=a')).json()
        self.assertEqual(len(reopened['guided_assessment_drafts']), 123)
        self.assertEqual({a['status'] for a in reopened['assessments']}, {'addressed'})
        self.assertEqual(await server.db.findings.count_documents({'client_id': 'a'}), 0)
        self.assertEqual(await server.db.evidence.count_documents({'client_id': 'a'}), 0)
        self.assertEqual(await server.db.soc_guided_locks.count_documents({}), 0)

    async def test_summary_metadata_exact_answers_and_native_allowlist(self):
        row, path, draft, payload, write = await self.fixture()
        before = (await self.client.get(path)).json()
        for extra in ({'implementation': 'Unreviewed'}, {'status': 'not_applicable'}, {'notes': before['notes']},
                      {'iso_assessment_checks': []}, {'verification': 'verified'}, {'soa_applicability': ''},
                      {'soa_justification': ''}, {'owner_id': before['owner_id']}, {'record_assessment': False}):
            with self.subTest(extra=extra):
                self.assertEqual((await self.client.patch(path, json={**write, **extra})).status_code, 422)
        for review in ({'version': 'soc2-omni-1', 'answers': payload['answers']},
                       {'version': engine.VERSION, 'answers': {'foreign': 'Yes'}},
                       {'version': engine.VERSION, 'answers': payload['answers'], 'approved': True}):
            response = await self.client.put(path + '/guided-assessment', json={**payload, 'expected_revision': draft['revision'], 'summary_review': review})
            self.assertEqual(response.status_code, 422, response.text)
        forged = copy.deepcopy(payload)
        forged['expected_revision'] = draft['revision']
        forged['result']['status'] = 'needs_attention'
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=forged)).status_code, 422)
        for review in (None, {'version': engine.VERSION, 'answers': {}}):
            changed = await self.client.put(path + '/guided-assessment', json={**payload, 'expected_revision': draft['revision'], 'summary_review': review})
            self.assertEqual(changed.status_code, 200, changed.text)
            draft = changed.json()
            self.assertEqual((await self.client.patch(path, json=self.native(row, draft))).status_code, 409)
        self.assertEqual((await self.client.get(path)).json(), before)

    async def test_undecided_excluded_progress_history_and_separate_decision_before_apply(self):
        workspace = await self.setup_iso()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == 'A.5.1')
        path = self.path(row)
        draft, payload = await self.finish(row)
        self.assertEqual((await self.client.patch(path, json=self.native(row, draft))).status_code, 422)
        original_history = row['assessment_history']
        row = await self.decision(row, 'excluded', 'Synthetic justified exclusion')
        self.assertEqual(row['implementation'], '')
        self.assertEqual(row['status'], 'not_assessed')
        self.assertEqual(row['assessment_history'][:len(original_history)], original_history)
        draft, payload = await self.finish(row)
        self.assertTrue(draft['lineage_stale'])
        self.assertEqual((await self.client.patch(path, json=self.native(row, draft))).status_code, 409)
        compare = {**payload, 'completed': False, 'result': None, 'expected_revision': draft['revision'], 'rebase': True,
                   'base_assessment_token': draft['current_assessment_token'], 'base_scope_fingerprint': draft['current_scope_fingerprint']}
        compared = await self.client.put(path + '/guided-assessment', json=compare)
        self.assertEqual(compared.status_code, 200, compared.text)
        draft, _ = await self.finish(row)
        self.assertEqual((await self.client.patch(path, json=self.native(row, draft))).status_code, 422)
        old_history = (await self.client.get(path + '/guided-assessment/history')).json()['items']
        row = await self.decision(row)
        latest = (await self.client.get(path + '/guided-assessment')).json()
        compare.update(expected_revision=latest['revision'], base_assessment_token=latest['current_assessment_token'],
                       base_scope_fingerprint=latest['current_scope_fingerprint'])
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=compare)).status_code, 200)
        draft, _ = await self.finish(row)
        response = await self.client.patch(path, json=self.native(row, draft))
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        self.assertEqual((saved['soa_applicability'], saved['soa_justification']), ('included', row['soa_justification']))
        history = (await self.client.get(path + '/guided-assessment/history')).json()['items']
        self.assertTrue(all(snapshot in history for snapshot in old_history))

    async def test_bidirectional_native_edits_separate_soa_history_and_stale_manual_lineage(self):
        row, path, draft, _, write = await self.fixture('A.5.1')
        # Preserved historical approval is distinct from working implementation.
        approval = {'revision': 2, 'decision': 'excluded', 'approved_by': 'original-approver'}
        await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'soa_approval': approval}})
        response = await self.client.patch(path, json=write)
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        previous_history = copy.deepcopy(saved['assessment_history'])
        updated = await self.client.patch(path, json={'implementation': 'Manual Annex A wording\nkept exactly\n',
            'status': 'in_progress', 'expected_last_assessed': self.token(saved)})
        self.assertEqual(updated.status_code, 200, updated.text)
        manual = updated.json()
        self.assertIsNone(manual['guided_assessment_source'])
        self.assertEqual((manual['soa_applicability'], manual['soa_justification']), (saved['soa_applicability'], saved['soa_justification']))
        row = await self.decision(manual, 'excluded', 'Reviewed exclusion separately')
        self.assertEqual(row['implementation'], manual['implementation'])
        self.assertEqual(row['status'], manual['status'])
        self.assertEqual(row['soa_approval'], approval)
        self.assertEqual(row['assessment_history'][:len(previous_history)], previous_history)
        reflected = next(a for a in (await self.client.get('/api/frameworks/iso-27001?client_id=a')).json()['assessments'] if a['definition_id'] == 'A.5.1')
        self.assertEqual(reflected, row)
        self.assertEqual((await self.client.patch(path, json={**write, 'expected_last_assessed': self.token(row)})).status_code, 409)
        self.assertEqual((await self.client.get(path + '/guided-assessment')).json()['narrative'], draft['narrative'])

    async def test_existing_legacy_source_is_not_rewritten_by_read_or_interview_progress(self):
        workspace = await self.setup_iso()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == '4.1')
        source = {'origin': 'preserved-old-source', 'version': 'original', 'answers': {'old': 'answer'}}
        await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']},
            {'$set': {'implementation': 'Existing manual wording', 'guided_assessment_source': source}})
        path = self.path(row)
        await self.finish(row)
        self.assertEqual((await self.client.get(path)).json()['guided_assessment_source'], source)
        # Normal notes/check writer remains usable; legacy source is untouched.
        changed = await self.client.patch(path, json={'notes': 'Normal writer note', 'expected_last_assessed': self.token(row)})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()['guided_assessment_source'], source)
        old = {'_id': row['framework_assessment_id'] + ':member', 'assessment_id': row['framework_assessment_id'], 'client_id': 'a',
               'user_id': 'member', 'revision': 1, 'version': 'preserved-legacy-version', 'answers': {'old': 'answer'}, 'completed': True, 'step': 0, 'narrative': 'Old reviewed wording'}
        await server.db.guided_assessment_pilot.insert_one(old)
        self.sign_in('member')
        reopened = (await self.client.get(path + '/guided-assessment')).json()
        self.assertFalse(reopened['lineage_known'])
        self.assertIsNone(reopened['lineage_stale'])
        self.assertEqual(reopened['answers'], old['answers'])

    async def test_partial_progress_cas_unknown_lineage_restart_and_history_pagination(self):
        workspace = await self.setup_iso()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == '4.1')
        path = self.path(row)
        base = (await self.client.get(path + '/guided-assessment')).json()
        key = next(q['id'] for q in engine._questions('4.1') if q['type'] == 'select')
        progress = {'version': engine.VERSION, 'answers': {key: 'Not sure'}, 'step': 1, 'expected_revision': 0,
                    **{k: base[k] for k in ('base_assessment_token', 'base_scope_fingerprint')}}
        saved = await self.client.put(path + '/guided-assessment', json=progress)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['step'], 1)
        self.assertFalse(saved.json()['completed'])
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=progress)).status_code, 409)
        self.assertEqual((await self.client.get(path)).json(), row)
        missing = {**progress, 'expected_revision': saved.json()['revision'], 'completed': True}
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=missing)).status_code, 422)
        await self.finish(row)
        collection = server.db.guided_assessment_pilot
        identity = row['framework_assessment_id'] + ':admin'
        await collection.update_one({'_id': identity}, {'$unset': {'base_assessment_token': '', 'base_scope_fingerprint': ''}})
        draft, payload = await self.finish(row)
        self.assertFalse(draft['lineage_known'])
        self.assertEqual((await self.client.patch(path, json=self.native(row, draft))).status_code, 409)
        restart = {'version': engine.VERSION, 'answers': {}, 'step': 0, 'restart': True, 'expected_revision': draft['revision'],
                   'base_assessment_token': draft['current_assessment_token'], 'base_scope_fingerprint': draft['current_scope_fingerprint']}
        response = await self.client.put(path + '/guided-assessment', json=restart)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['lineage_known'])
        first = (await self.client.get(path + '/guided-assessment/history?limit=1')).json()
        self.assertEqual(first['items'][0]['answers'], payload['answers'])
        self.assertTrue(first['has_more'])
        second = (await self.client.get(path + '/guided-assessment/history', params={'limit': 1, 'before_revision': first['next_before_revision']})).json()
        self.assertLess(second['items'][0]['revision'], first['items'][0]['revision'])
        self.assertFalse(second['has_more'])

    async def test_no_isms_whole_na_and_annex_decision_requires_justification(self):
        workspace = await self.setup_iso()
        for row in workspace['assessments']:
            if not row['definition_id'].startswith('A.'):
                response = await self.client.patch(self.path(row), json={'status': 'not_applicable', 'na_rationale': 'Not a valid ISMS exclusion', 'expected_last_assessed': self.token(row)})
                self.assertEqual(response.status_code, 422, response.text)
        row = next(a for a in workspace['assessments'] if a['definition_id'] == 'A.5.1')
        for decision in ('included', 'excluded'):
            self.assertEqual((await self.client.patch(self.path(row), json={'soa_applicability': decision, 'soa_justification': ' \n', 'expected_last_assessed': self.token(row)})).status_code, 422)

    async def test_wrong_framework_client_reader_unauthenticated_and_inactive_routes(self):
        workspace = await self.setup_iso(programs=('iso-27001', 'cis-ig1', 'hipaa'))
        row = next(a for a in workspace['assessments'] if a['definition_id'] == '4.1')
        path = self.path(row)
        draft, payload = await self.finish(row)
        write = self.native(row, draft)
        hipaa = (await self.client.get('/api/frameworks/hipaa?client_id=a')).json()['assessments'][0]
        for suffix, method, body in (('/guided-assessment', self.client.get, None), ('/guided-assessment/history', self.client.get, None), ('/guided-assessment', self.client.put, payload)):
            response = await method(self.path(hipaa) + suffix, **({'json': body} if body else {}))
            self.assertEqual(response.status_code, 404, response.text)
        collection = server.db.iso_guided_locks
        for user_change, expected in [({'role': 'client_readonly'}, 403), ({'role': 'client_grc_manager', 'client_ids': ['b']}, 403)]:
            await server.db.users.update_one({'user_id': 'member'}, {'$set': user_change})
            self.sign_in('member')
            with patch.object(server.db, 'iso_guided_locks', collection), patch.object(collection, 'update_one', side_effect=AssertionError('Denied writer touched lease')):
                self.assertEqual((await self.client.put(path + '/guided-assessment', json=payload)).status_code, expected)
                self.assertEqual((await self.client.patch(path, json=write)).status_code, expected)
            self.assertEqual((await self.client.get(path + '/guided-assessment')).status_code, 200 if user_change['role'] == 'client_readonly' else 403)
            self.assertEqual((await self.client.get(path + '/guided-assessment/history')).status_code, 200 if user_change['role'] == 'client_readonly' else 403)
        self.client.cookies.clear()
        self.client.headers.pop('Authorization', None)
        for method, url, body in ((self.client.get, path + '/guided-assessment', None), (self.client.get, path + '/guided-assessment/history', None), (self.client.put, path + '/guided-assessment', payload), (self.client.patch, path, write)):
            self.assertEqual((await method(url, **({'json': body} if body else {}))).status_code, 401)
        self.sign_in('admin')
        await server.db.requirements.update_many({'client_id': 'a', 'baseline_key': 'iso-27001'}, {'$set': {'baseline_response': 'does_not_apply'}})
        for method, url, body in ((self.client.get, path + '/guided-assessment', None), (self.client.get, path + '/guided-assessment/history', None), (self.client.put, path + '/guided-assessment', payload), (self.client.patch, path, write)):
            self.assertEqual((await method(url, **({'json': body} if body else {}))).status_code, 404)
        inactive = (await self.client.get('/api/frameworks/iso-27001?client_id=a')).json()
        self.assertFalse(inactive['selected'])
        self.assertEqual(inactive['guided_assessment_drafts'], {})
        self.assertTrue(all('context_complete' not in work for work in inactive['work'].values()))
        self.assertEqual((await self.client.get(path + '/guided-assessment')).status_code, 404)
        await server.db.requirements.update_many({'client_id': 'a', 'baseline_key': 'iso-27001'}, {'$set': {'baseline_response': 'applies'}})
        self.assertEqual((await self.client.get(path + '/guided-assessment')).json()['answers'], payload['answers'])

    async def test_active_iso_ownership_preserves_assessment_and_rejects_stale_editors(self):
        workspace = await self.setup_iso()
        row = next(a for a in workspace['assessments'] if a['definition_id'] == '4.1')
        path = self.path(row)
        response = await self.client.patch(path, json={'implementation': 'Existing manual assessment', 'status': 'addressed', 'expected_last_assessed': self.token(row)})
        self.assertEqual(response.status_code, 200, response.text)
        before = response.json()
        owned = await self.client.patch(path, json={'owner_id': 'admin', 'expected_last_assessed': self.token(before)})
        self.assertEqual(owned.status_code, 200, owned.text)
        current = owned.json()
        for field in ('last_assessed', 'assessed_by', 'assessment_history'):
            self.assertEqual(current[field], before[field])
        self.assertNotEqual(current['last_saved'], before['last_saved'])
        for stale in ({'notes': 'Stale manual editor'}, {'owner_id': None}):
            self.assertEqual((await self.client.patch(path, json={**stale, 'expected_last_assessed': self.token(before)})).status_code, 409)
        self.sign_in('member')
        self.assertEqual((await self.client.patch(path, json={'owner_id': None, 'expected_last_assessed': self.token(current)})).status_code, 403)

    async def test_existing_new_add_iso_mixed_program_initialization_is_idempotent(self):
        await self.setup_iso('a', ('cis-ig1', 'soc-2'))
        before = await server.db.framework_assessments.find({'client_id': 'a'}).to_list(None)
        workspace = await self.setup_iso('a', ('cis-ig1', 'soc-2', 'iso-27001'))
        row = next(a for a in workspace['assessments'] if a['definition_id'] == '4.1')
        draft, _ = await self.finish(row)
        await self.setup_iso('a', ('cis-ig1', 'soc-2', 'iso-27001'))
        self.assertEqual(await server.db.framework_assessments.find({'client_id': 'a', 'framework_key': {'$ne': 'iso-27001'}}).to_list(None), before)
        self.assertEqual(await server.db.framework_assessments.count_documents({'client_id': 'a', 'framework_key': 'iso-27001'}), 123)
        self.assertEqual((await self.client.get(self.path(row) + '/guided-assessment')).json()['revision'], draft['revision'])
        fresh = await self.setup_iso('b')
        self.assertEqual(len(fresh['assessments']), 123)
        self.assertEqual(fresh['guided_assessment_drafts'], {})
        self.assertTrue(all(a['implementation'] == '' and a['status'] == 'not_assessed' for a in fresh['assessments']))

    async def test_workspace_drafts_are_current_program_client_user_and_bounded(self):
        workspace = await self.setup_iso()
        row = workspace['assessments'][0]
        draft, _ = await self.finish(row)
        await server.db.guided_assessment_pilot.insert_many([
            {'_id': row['framework_assessment_id'] + ':member', 'client_id': 'a', 'revision': 999, 'completed': True, 'user_id': 'member'},
            {'_id': 'foreign:admin', 'client_id': 'a', 'revision': 999, 'completed': True, 'user_id': 'admin'},
            {'_id': workspace['assessments'][1]['framework_assessment_id'] + ':admin', 'client_id': 'b', 'revision': 999, 'completed': True, 'user_id': 'admin'}])
        collection = server.db.guided_assessment_pilot
        cursor_factory = collection.find
        limits = []
        def inspect(*args, **kwargs):
            cursor = cursor_factory(*args, **kwargs)
            original = cursor.to_list
            async def bounded(length):
                limits.append(length)
                return await original(length)
            cursor.to_list = bounded
            return cursor
        with patch.object(server.db, 'guided_assessment_pilot', collection), patch.object(collection, 'find', side_effect=inspect):
            response = await self.client.get('/api/frameworks/iso-27001?client_id=a')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(limits, [123])
        summaries = response.json()['guided_assessment_drafts']
        self.assertEqual(list(summaries), [row['definition_id']])
        self.assertEqual(summaries[row['definition_id']]['revision'], draft['revision'])
        self.assertNotIn('answers', summaries[row['definition_id']])

    async def test_lease_serializes_native_interview_and_soa_writes_both_directions(self):
        row, path, draft, payload, write = await self.fixture('A.5.1')
        next_payload = copy.deepcopy(payload)
        next_payload['expected_revision'] = draft['revision']
        question = next(q for q in engine._active_questions(row['definition_id'], payload['answers']) if q['type'] == 'select')
        next_payload['answers'][question['id']] = 'No'
        next_payload['summary_review']['answers'] = copy.deepcopy(next_payload['answers'])
        next_payload['result']['status'] = 'needs_attention'
        collection = server.db.framework_assessments
        original = collection.update_one
        attempts = []
        async def interleave_native(query, update, *args, **kwargs):
            if update.get('$set', {}).get('guided_assessment_source'):
                attempts.append(await self.client.put(path + '/guided-assessment', json=next_payload))
                attempts.append(await self.client.patch(path, json={'soa_applicability': 'excluded', 'soa_justification': 'Competing decision', 'expected_last_assessed': self.token(row)}))
            return await original(query, update, *args, **kwargs)
        with patch.object(server.db, 'framework_assessments', collection), patch.object(collection, 'update_one', side_effect=interleave_native):
            response = await self.client.patch(path, json=write)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([r.status_code for r in attempts], [409, 409])
        saved = response.json()
        collection = server.db.guided_assessment_pilot
        original = collection.update_one
        attempts.clear()
        async def interleave_interview(query, update, *args, **kwargs):
            attempts.append(await self.client.patch(path, json={'implementation': 'Competing native edit', 'expected_last_assessed': self.token(saved)}))
            attempts.append(await self.client.patch(path, json={'soa_applicability': 'excluded', 'soa_justification': 'Competing decision', 'expected_last_assessed': self.token(saved)}))
            return await original(query, update, *args, **kwargs)
        with patch.object(server.db, 'guided_assessment_pilot', collection), patch.object(collection, 'update_one', side_effect=interleave_interview):
            revised = await self.client.put(path + '/guided-assessment', json=next_payload)
        self.assertEqual(revised.status_code, 200, revised.text)
        self.assertEqual([r.status_code for r in attempts], [409, 409])
        self.assertEqual((await self.client.patch(path, json={**write, 'expected_last_assessed': self.token(saved)})).status_code, 409)
        self.assertEqual((await self.client.get(path)).json(), saved)

    async def test_reauthorization_and_refetch_under_lease_rejects_changed_actor_scope_owner(self):
        row, path, draft, payload, write = await self.fixture()
        lease_run = iso_guided_lease.run
        before = (await self.client.get(path)).json()
        for collection, query, update, expected in (
            ('users', {'user_id': 'admin'}, {'role': 'client_readonly'}, 403),
            ('requirements', {'client_id': 'a', 'baseline_key': 'iso-27001'}, {'baseline_response': 'does_not_apply'}, 404)):
            async def changed(s, current, operation):
                await s.db[collection].update_one(query, {'$set': update})
                return await lease_run(s, current, operation)
            with patch.object(iso_guided_lease, 'run', side_effect=changed):
                response = await self.client.patch(path, json=write)
            self.assertEqual(response.status_code, expected, response.text)
            await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin'}})
            await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': 'iso-27001'}, {'$set': {'baseline_response': 'applies'}})
            self.assertEqual((await self.client.get(path)).json(), before)
            await self.assert_released(row)
        await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'owner_id': 'member'}})
        self.sign_in('member')
        async def unassigned(s, current, operation):
            await s.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'owner_id': None}})
            return await lease_run(s, current, operation)
        with patch.object(iso_guided_lease, 'run', side_effect=unassigned):
            response = await self.client.put(path + '/guided-assessment', json={**payload, 'expected_revision': draft['revision']})
        self.assertEqual(response.status_code, 403, response.text)

    async def test_native_refetch_rejects_changed_soa_and_new_interview_before_cas(self):
        row, path, _, _, write = await self.fixture('A.5.1')
        original = guided_assessment.read_draft
        reads = 0
        async def change_soa(*args, **kwargs):
            nonlocal reads
            result = await original(*args, **kwargs)
            reads += 1
            if reads == 1:
                # Non-cooperating direct fixture write exercises the final refetch.
                await server.db.framework_assessments.update_one({'framework_assessment_id': row['framework_assessment_id']}, {'$set': {'soa_applicability': 'excluded'}})
            return result
        with patch.object(guided_assessment, 'read_draft', side_effect=change_soa):
            response = await self.client.patch(path, json=write)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual((await self.client.get(path)).json()['implementation'], '')

    async def test_contention_private_metadata_expiry_and_successor_protection(self):
        row, path, draft, payload, write = await self.fixture()
        locks = server.db.iso_guided_locks
        future = (datetime.now(timezone.utc) + timedelta(seconds=120)).isoformat()
        await locks.update_one({'_id': row['framework_assessment_id']}, {'$set': {'token': 'other', 'until': future}})
        self.assertEqual((await self.client.patch(path, json=write)).status_code, 409)
        self.assertEqual((await self.client.put(path + '/guided-assessment', json={**payload, 'expected_revision': draft['revision']})).status_code, 409)
        def public(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    self.assertNotIn(key, ('token', 'until', 'iso_guided_locks'))
                    public(item)
            elif isinstance(value, list):
                for item in value:
                    public(item)
        for url in (path, path + '/guided-assessment', path + '/guided-assessment/history', '/api/frameworks/iso-27001?client_id=a'):
            response = await self.client.get(url)
            self.assertEqual(response.status_code, 200, response.text)
            public(response.json())
        await self.expire(row)
        history = server.db.guided_assessment_history
        original = history.update_one
        async def takeover(*args, **kwargs):
            result = await original(*args, **kwargs)
            await locks.update_one({'_id': row['framework_assessment_id']}, {'$set': {'token': 'successor', 'until': future}})
            return result
        with patch.object(server.db, 'guided_assessment_history', history), patch.object(history, 'update_one', side_effect=takeover):
            response = await self.client.put(path + '/guided-assessment', json={**payload, 'expected_revision': draft['revision']})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual((await locks.find_one({'_id': row['framework_assessment_id']}))['token'], 'successor')
        self.assertEqual((await self.client.get(path + '/guided-assessment')).json()['revision'], draft['revision'])

    async def test_uncertain_driver_outcome_503_retains_lease_even_after_native_dispatch(self):
        row, path, _, _, write = await self.fixture()
        for error in (NetworkTimeout('Synthetic timeout'), AutoReconnect('Synthetic lost reply'),
                      WriteConcernError('Synthetic uncertain ack'), OperationFailure('Synthetic retryable', details={'errorLabels': ['RetryableWriteError']})):
            with patch.object(guided_assessment, 'read_draft', side_effect=error):
                response = await self.client.patch(path, json=write)
            self.assertEqual(response.status_code, 503, response.text)
            self.assertIn('reload', response.json()['detail'])
            held = await server.db.iso_guided_locks.find_one({'_id': row['framework_assessment_id']})
            self.assertTrue(held['token'])
            self.assertEqual((await self.client.patch(path, json=write)).status_code, 409)
            await self.expire(row)
        collection = server.db.framework_assessments
        original = collection.update_one
        async def lost_reply(*args, **kwargs):
            await original(*args, **kwargs)
            raise AutoReconnect('Synthetic acknowledgement loss after write')
        with patch.object(server.db, 'framework_assessments', collection), patch.object(collection, 'update_one', side_effect=lost_reply):
            response = await self.client.patch(path, json=write)
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual((await self.client.get(path)).json()['implementation'], write['implementation'])
        self.assertTrue((await server.db.iso_guided_locks.find_one({'_id': row['framework_assessment_id']}))['token'])

    async def test_request_timeout_and_cancellation_keep_lease_and_draft(self):
        row, path, draft, payload, _ = await self.fixture()
        payload['expected_revision'] = draft['revision']
        before = (await self.client.get(path + '/guided-assessment')).json()
        entered = asyncio.Event()
        never = asyncio.Event()
        async def blocked(*args, **kwargs):
            entered.set()
            await never.wait()
        with patch.object(guided_assessment, '_save_draft', side_effect=blocked), patch.object(iso_guided_lease, 'SAVE_TIMEOUT_SECONDS', 0.02):
            response = await self.client.put(path + '/guided-assessment', json=payload)
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=payload)).status_code, 409)
        await self.expire(row)
        entered.clear()
        with patch.object(guided_assessment, '_save_draft', side_effect=blocked):
            request = asyncio.create_task(self.client.put(path + '/guided-assessment', json=payload))
            await asyncio.wait_for(entered.wait(), 5)
            request.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await request
        self.assertEqual((await self.client.get(path + '/guided-assessment')).json(), before)
        self.assertTrue((await server.db.iso_guided_locks.find_one({'_id': row['framework_assessment_id']}))['token'])
        await self.expire(row)
        self.assertEqual((await self.client.put(path + '/guided-assessment', json=payload)).status_code, 200)
        await self.assert_released(row)

    async def test_iso_csot_80_request_90_lease_120_and_cleanup_outside_csot(self):
        from pymongo import _csot
        row, path, _, _, write = await self.fixture()
        collection, locks = server.db.framework_assessments, server.db.iso_guided_locks
        original, lock_update = collection.update_one, locks.update_one
        deadlines, cleanup = [], []
        async def checked_write(*args, **kwargs):
            deadlines.append(_csot.get_timeout())
            return await original(*args, **kwargs)
        async def checked_lock(query, update, *args, **kwargs):
            if '$unset' in update:
                cleanup.append(_csot.get_timeout())
            return await lock_update(query, update, *args, **kwargs)
        with patch.object(server.db, 'framework_assessments', collection), patch.object(collection, 'update_one', side_effect=checked_write), patch.object(server.db, 'iso_guided_locks', locks), patch.object(locks, 'update_one', side_effect=checked_lock):
            response = await self.client.patch(path, json=write)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(deadlines, [80])
        self.assertEqual(cleanup, [None])
        self.assertEqual((iso_guided_lease.DRIVER_TIMEOUT_SECONDS, iso_guided_lease.SAVE_TIMEOUT_SECONDS, iso_guided_lease.LEASE_SECONDS), (80, 90, 120))
        self.assertIsNone(_csot.get_timeout())

    async def test_cis_soc_native_writes_never_touch_iso_lease_or_accept_iso_review(self):
        await self.setup_iso(programs=('iso-27001', 'cis-ig1', 'soc-2'))
        collection = server.db.iso_guided_locks
        with patch.object(server.db, 'iso_guided_locks', collection), patch.object(collection, 'update_one', side_effect=AssertionError('Non-ISO writer touched ISO lease')):
            for framework in ('cis-ig1', 'soc-2'):
                row = (await self.client.get('/api/frameworks/' + framework + '?client_id=a')).json()['assessments'][0]
                response = await self.client.patch(self.path(row), json={'implementation': 'Preserved native workflow', 'expected_last_assessed': self.token(row)})
                self.assertEqual(response.status_code, 200, response.text)
                if framework == 'cis-ig1':
                    draft = (await self.client.get(self.path(row) + '/guided-assessment')).json()
                    response = await self.client.put(self.path(row) + '/guided-assessment', json={'version': draft['version'], 'answers': {},
                        'summary_review': {'version': engine.VERSION, 'answers': {}},
                        **{k: draft[k] for k in ('base_assessment_token', 'base_scope_fingerprint')}})
                    self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(await collection.count_documents({}), 0)


if __name__ == '__main__':
    unittest.main()
