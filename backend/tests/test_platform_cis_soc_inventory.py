"""Current CIS/SOC route inventory and write lifecycle, with isolated storage.

Uses modeled authorized identities, not hosted authentication or a permissions
campaign. Actual-engine summaries establish serialization, not independent
source/prose correctness. No login, recovery, invitation or SMTP route runs.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import uuid
from unittest.mock import patch

from motor.motor_asyncio import AsyncIOMotorClient

import test_framework_governance as harness
from framework_catalog import CIS, SOC


ROOT = Path(__file__).resolve().parents[2]
DATABASE_PREFIX = 'platform_acceptance_20261011_inventory_cis_soc'
FRAMEWORK = {'cis1': 'cis-ig1', 'cis2': 'cis-ig1', 'cis3': 'cis-ig1', 'soc38': 'soc-2', 'soc61': 'soc-2'}
SOC_PRIMARY = ['security', 'availability', 'confidentiality']
SOC_ALL = [*SOC_PRIMARY, 'processing_integrity', 'privacy']
PROTECTED_FIELDS = ('verification', 'notes', 'technology', 'related_links', 'owner_id', 'process_owner_id',
                    'soc_assessment_checks', 'management_controls', 'cis_assessment_criteria', 'cis_operation')
server = harness.server


class PlatformCisSocInventoryTests(unittest.IsolatedAsyncioTestCase):
    body = harness.FrameworkTests.body
    sign_in = harness.FrameworkTests.sign_in

    @classmethod
    def setUpClass(cls):
        node = shutil.which('node')
        if not node:
            raise unittest.SkipTest('Node is unavailable; current frontend-engine vectors were not executed')
        completed = subprocess.run([node, str(Path(__file__).with_name('platform_cis_soc_vectors.cjs'))],
                                   cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True, timeout=60)
        cls.contract = json.loads(completed.stdout)
        cls.vectors = cls.contract['vectors']

    async def asyncSetUp(self):
        await harness.FrameworkTests.asyncSetUp(self)
        self.storage_kind = 'isolated mongomock; not durable Mongo'
        mongo_url = os.environ.get('PLATFORM_ACCEPTANCE_MONGO_URL')
        if mongo_url:
            if mongo_url != 'mongodb://127.0.0.1:58749':
                raise ValueError('This acceptance suite permits only the coordinator-owned mongodb://127.0.0.1:58749 origin')
            starter = {name: await server.db[name].find({}, {'_id': 0}).to_list(None) for name in ('users', 'clients')}
            self.mongo = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
            self.addCleanup(self.mongo.close)
            self.database_name = DATABASE_PREFIX + '_' + uuid.uuid4().hex[:16]
            self.assertLessEqual(len(self.database_name.encode('utf-8')), 63)
            await self.mongo.admin.command('ping')
            self.assertNotIn(self.database_name, await self.mongo.list_database_names(), 'Never reuse an existing database')
            real_storage = patch.object(server, 'db', self.mongo[self.database_name])
            real_storage.start()
            self.addCleanup(real_storage.stop)
            self.addAsyncCleanup(self.remove_owned_database)
            for name, rows in starter.items():
                if rows:
                    await server.db[name].insert_many(rows)
            self.storage_kind = 'actual Motor/Mongo loopback storage; modeled ASGI identities'
        self.sign_in('admin')
        self.ledger = {'source_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                       'qa_working_file_sha256': {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                                  for name in ('test_platform_cis_soc_inventory.py', 'platform_cis_soc_vectors.cjs')},
                       'storage': self.storage_kind, 'unique_definitions': 0, 'cis_read_placements': 0,
                       'soc_read_placements': 0, 'interview_progress_writes': 0, 'native_writes': 0,
                       'nonempty_cross_client_comparisons': 0, 'foreign_records_compared': 0,
                       'explicit_rebases': 0,
                       'case_results': [], 'boundary': 'Isolated service/storage execution; not hosted browser/login/role or independent source review'}

    async def remove_owned_database(self):
        # Only this test's new UUID database; the coordinator owns the Mongo process.
        if not self.database_name.startswith(DATABASE_PREFIX + '_'):
            raise AssertionError('Refuse to clean a database outside the assigned inventory namespace')
        self.assertLessEqual(len(self.database_name.encode('utf-8')), 63)
        await self.mongo.drop_database(self.database_name)

    async def request(self, method, path, expected=200, **kwargs):
        self.assertFalse(path.startswith(('/api/auth', '/api/invitations')), 'Authentication/invitation endpoints are outside this suite')
        response = await self.client.request(method, path, **kwargs)
        self.assertEqual(response.status_code, expected, path + ': ' + response.text)
        return response.json()

    async def setup_clients(self):
        clients, workspaces = {}, {}
        for alias, name in self.contract['clients'].items():
            row = await self.request('POST', '/api/clients', json={'name': name})
            cid = row['client_id']
            clients[alias] = cid
            framework = FRAMEWORK[alias]
            payload = self.body((framework,), cid)
            if framework == 'cis-ig1':
                payload['state']['framework_settings'] = {'cis-ig1': {'implementation_group': int(alias[-1])}}
            await self.request('POST', '/api/onboarding/baseline', json=payload)
            if framework == 'soc-2':
                await self.request('PATCH', '/api/frameworks/soc-2/configuration', json={
                    'client_id': cid, 'categories': SOC_PRIMARY if alias == 'soc38' else SOC_ALL,
                    'system_description': 'Synthetic acceptance system; reported QA practices only', 'period_start': '', 'period_end': ''})
            workspace = await self.request('GET', '/api/frameworks/' + framework, params={'client_id': cid})
            before_ids = sorted(row['framework_assessment_id'] for row in workspace['assessments'])
            # A second ordinary configuration request must not create duplicate records.
            if framework == 'cis-ig1':
                await self.request('POST', '/api/onboarding/baseline', json=payload)
            else:
                await self.request('PATCH', '/api/frameworks/soc-2/configuration', json={
                    'client_id': cid, 'categories': SOC_PRIMARY if alias == 'soc38' else SOC_ALL,
                    'system_description': 'Synthetic acceptance system; reported QA practices only', 'period_start': '', 'period_end': ''})
            workspace = await self.request('GET', '/api/frameworks/' + framework, params={'client_id': cid})
            self.assertEqual(sorted(row['framework_assessment_id'] for row in workspace['assessments']), before_ids)
            self.assertEqual(len(before_ids), len(set(before_ids)))
            self.assertTrue(all(row['status'] == 'not_assessed' and not row.get('implementation')
                                and row.get('verification') != 'verified' for row in workspace['assessments']))
            workspaces[alias] = workspace
        return clients, workspaces

    async def assert_scope_placements(self, clients, workspaces):
        versions = {(row['framework'], row['id']): row['version'] for row in self.vectors}
        for alias, workspace in workspaces.items():
            framework = FRAMEWORK[alias]
            if framework == 'cis-ig1':
                group = int(alias[-1])
                expected_ids = {row['id'] for row in CIS['requirements'] if row['implementation_group'] <= group}
                self.assertEqual(len(expected_ids), {1: 56, 2: 130, 3: 153}[group])
            else:
                categories = SOC_PRIMARY if alias == 'soc38' else SOC_ALL
                expected_ids = {row['id'] for row in SOC['requirements'] if row['category'] in categories}
                self.assertEqual(len(expected_ids), 38 if alias == 'soc38' else 61)
            rows = workspace['assessments']
            self.assertEqual({row['definition_id'] for row in rows}, expected_ids)
            for row in rows:
                with self.subTest(placement=alias, requirement=row['definition_id']):
                    self.assertEqual(row['client_id'], clients[alias])
                    self.assertEqual(row['framework_key'], framework)
                    draft = await self.request('GET', '/api/framework_assessments/' + row['framework_assessment_id'] + '/guided-assessment')
                    self.assertEqual(draft['version'], versions[(framework, row['definition_id'])])
                    self.assertEqual(draft['answers'], {})
                    self.assertEqual(draft['revision'], 0)
                    self.ledger['cis_read_placements' if framework == 'cis-ig1' else 'soc_read_placements'] += 1
        self.assertEqual(self.ledger['cis_read_placements'], 339)
        self.assertEqual(self.ledger['soc_read_placements'], 99)

    async def run_vector(self, vector, row, native_before):
        path = '/api/framework_assessments/' + row['framework_assessment_id']
        guide_path = path + '/guided-assessment'
        draft = await self.request('GET', guide_path)
        self.assertEqual(draft['lineage_stale'], vector['scenario'] == 'unknown', 'Our prior native save requires explicit rebase before reassessment')
        if draft['lineage_stale']:
            old_complete = copy.deepcopy(draft)
            draft = await self.request('PUT', guide_path, json={
                'version': draft['version'], 'answers': draft['answers'], 'step': 0, 'completed': False,
                'narrative': draft.get('narrative', ''), 'expected_revision': draft['revision'], 'rebase': True,
                'base_assessment_token': draft['current_assessment_token'], 'base_scope_fingerprint': draft['current_scope_fingerprint']})
            self.ledger['explicit_rebases'] += 1
            self.assertFalse(draft['lineage_stale'])
            self.assertEqual(draft['answers'], old_complete['answers'])
            self.assertEqual(draft['narrative'], old_complete['narrative'])
            archived = (await self.request('GET', guide_path + '/history'))['items']
            snapshot = next(item for item in archived if item['revision'] == old_complete['revision'])
            for field in ('version', 'answers', 'narrative', 'result', 'completed'):
                self.assertEqual(snapshot[field], old_complete[field], field)
        for checkpoint in vector['checkpoints']:
            draft = await self.request('PUT', guide_path, json={
                'version': vector['version'], 'answers': checkpoint['answers'], 'step': checkpoint['step'],
                'completed': False, 'narrative': draft.get('narrative', ''), 'expected_revision': draft['revision'],
                **{key: draft[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}})
            self.ledger['interview_progress_writes'] += 1
            progress = await self.request('GET', guide_path)
            self.assertEqual(progress['answers'], checkpoint['answers'])
            self.assertEqual(progress['step'], checkpoint['step'])
            self.assertEqual(await self.request('GET', path), native_before, 'Interview progress must not change the native record')
        reviewed = vector['result']['narrative'] + '\n\nOperator review\n- SYNTHETIC QA ONLY; preserve exact line breaks, punctuation and café.\n\n'
        self.assertLessEqual(len(reviewed), 20000)
        result = {**copy.deepcopy(vector['result']), 'narrative': reviewed}
        completed_payload = {'version': vector['version'], 'answers': vector['answers'], 'step': draft['step'],
                             'completed': True, 'narrative': reviewed, 'result': result, 'expected_revision': draft['revision'],
                             **{key: draft[key] for key in ('base_assessment_token', 'base_scope_fingerprint')}}
        if vector['framework'] == 'soc-2':
            completed_payload['summary_review'] = {'version': vector['version'], 'answers': vector['answers']}
        completed = await self.request('PUT', guide_path, json=completed_payload)
        self.assertEqual(completed['result'], result)
        self.assertEqual(await self.request('GET', path), native_before, 'Completed interview is not a native assessment save')
        native_payload = {'implementation': reviewed, 'status': vector['expected_status'],
                          'guided_assessment_source': {key: completed[key] for key in ('version', 'revision', 'generated_at')},
                          'expected_last_assessed': native_before.get('last_saved') or native_before.get('last_assessed')}
        saved = await self.request('PATCH', path, json=native_payload)
        reloaded = await self.request('GET', path)
        self.ledger['native_writes'] += 1
        self.assertEqual(saved, reloaded)
        self.assertEqual(reloaded['implementation'], reviewed)
        self.assertEqual(reloaded['status'], vector['expected_status'])
        self.assertEqual(reloaded['guided_assessment_source']['answers'], vector['answers'])
        for field in PROTECTED_FIELDS:
            self.assertEqual(reloaded.get(field), native_before.get(field), field)
        old_history = native_before.get('assessment_history', [])
        self.assertEqual(reloaded['assessment_history'][:-1], old_history)
        self.assertEqual(reloaded['assessment_history'][-1]['implementation'], reviewed)
        self.assertEqual(reloaded['assessment_history'][-1]['status'], vector['expected_status'])
        resumed = await self.request('GET', guide_path)
        self.assertEqual(resumed['narrative'], reviewed)
        self.assertEqual(resumed['result'], result)
        self.assertEqual(resumed['answers'], vector['answers'])
        self.assertTrue(resumed['lineage_known'])
        self.assertTrue(resumed['lineage_stale'], 'Native save must not silently advance the interview base')
        self.assertEqual(resumed['base_assessment_token'], native_before.get('last_saved') or native_before.get('last_assessed'))
        self.assertEqual(resumed['current_assessment_token'], reloaded['last_saved'])
        await self.request('PATCH', path, expected=409, json=native_payload)
        self.assertEqual(await self.request('GET', path), reloaded, 'Duplicate/stale native submission must not add history or overwrite')
        self.ledger['case_results'].append({'framework': vector['framework'], 'id': vector['id'], 'scenario': vector['scenario'],
                                          'status': reloaded['status'], 'progress_checkpoints': len(vector['checkpoints']),
                                          'exact_reviewed_text': True, 'native_history_count': len(reloaded['assessment_history'])})
        return reloaded

    async def test_all_unique_definitions_placements_and_exact_current_native_lifecycles(self):
        clients, workspaces = await self.setup_clients()
        await self.assert_scope_placements(clients, workspaces)
        primary_scopes = {alias: {row['definition_id'] for row in workspace['assessments']} for alias, workspace in workspaces.items()}
        rows = {(alias, row['definition_id']): row for alias, workspace in workspaces.items() for row in workspace['assessments']}
        visited = set()
        for vector in self.vectors:
            with self.subTest(framework=vector['framework'], requirement=vector['id'], scenario=vector['scenario']):
                row = rows[(vector['client'], vector['id'])]
                foreign_before = await server.db.framework_assessments.find(
                    {'definition_id': vector['id'], 'client_id': {'$ne': row['client_id']}}, {'_id': 0}).to_list(None)
                before = await self.request('GET', '/api/framework_assessments/' + row['framework_assessment_id'])
                await self.run_vector(vector, row, before)
                foreign_after = await server.db.framework_assessments.find(
                    {'definition_id': vector['id'], 'client_id': {'$ne': row['client_id']}}, {'_id': 0}).to_list(None)
                self.assertEqual(foreign_after, foreign_before, 'Same-definition records in other clients remain unchanged')
                if foreign_before:
                    self.ledger['nonempty_cross_client_comparisons'] += 1
                    self.ledger['foreign_records_compared'] += len(foreign_before)
                visited.add((vector['framework'], vector['id']))
        self.ledger['unique_definitions'] = len(visited)
        self.assertEqual(len(visited), 214)
        self.assertEqual(self.ledger['native_writes'], 428)
        self.assertEqual(self.ledger['interview_progress_writes'], 1277)
        self.assertEqual(self.ledger['explicit_rebases'], 214)
        for alias, cid in clients.items():
            workspace = await self.request('GET', '/api/frameworks/' + FRAMEWORK[alias], params={'client_id': cid})
            self.assertEqual({row['definition_id'] for row in workspace['assessments']}, primary_scopes[alias])
            self.assertEqual(await server.db.findings.count_documents({'client_id': cid}), 0)
            self.assertEqual(await server.db.tasks.count_documents({'client_id': cid}), 0)
            self.assertTrue(all(row['status'] != 'completed' for row in await server.db.reviews.find({'client_id': cid}).to_list(None)))
        output = os.environ.get('PLATFORM_ACCEPTANCE_INVENTORY_OUTPUT')
        if output:
            Path(output).write_text(json.dumps(self.ledger, indent=2) + '\n', encoding='utf-8')
        print('CIS/SOC acceptance:', json.dumps({key: value for key, value in self.ledger.items() if key != 'case_results'}))
