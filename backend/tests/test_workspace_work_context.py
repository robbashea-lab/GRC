"""Pilot work context uses real projections/relationships with isolated persistence."""
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import test_client_dashboard_sources as harness
import framework_governance

server = harness.server

class WorkspaceWorkContextTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp

    async def seed(self):
        rows = [
            {'client_id': 'a', 'framework_assessment_id': 'assessment-a', 'framework_key': 'cis-ig1',
             'definition_id': '13.2', 'related_links': [{'kind': 'reviews', 'id': 'shared'},
                {'kind': 'findings', 'id': 'narrow'}, {'kind': 'tasks', 'id': 'remediation'}],
             'unlinked_evidence_ids': ['unlinked']},
            {'client_id': 'a', 'framework_assessment_id': 'assessment-b', 'framework_key': 'cis-ig1',
             'definition_id': '13.3', 'related_links': [{'kind': 'reviews', 'id': 'shared'}]},
        ]
        await server.db.framework_assessments.insert_many(rows)
        await server.db.reviews.insert_many([
            {'review_id': 'shared', 'client_id': 'a', 'title': 'Detection review', 'status': 'in_progress',
             'due_date': '2026-01-01', 'owner_id': 'review-owner', 'reviewer_id': 'reviewer',
             'notes': 'Excluded review narrative'},
            {'review_id': 'complete', 'client_id': 'a', 'framework_key': 'cis-ig1',
             'framework_safeguards': ['13.2'], 'status': 'completed', 'due_date': '2025-01-01'},
            {'review_id': 'cancelled', 'client_id': 'a', 'framework_key': 'cis-ig1',
             'framework_safeguards': ['13.2'], 'status': 'cancelled', 'due_date': '2025-01-01'},
            {'review_id': 'foreign', 'client_id': 'b', 'framework_key': 'cis-ig1',
             'framework_safeguards': ['13.2'], 'status': 'upcoming', 'title': 'Private review'},
        ])
        await server.db.findings.insert_many([
            {'finding_id': 'narrow', 'client_id': 'a', 'review_id': 'shared', 'title': 'Host coverage gap',
             'status': 'in_remediation', 'severity': 'critical', 'owner_id': 'finding-owner',
             'due_date': '2026-01-02', 'description': 'Excluded finding narrative'},
            {'finding_id': 'shared-gap', 'client_id': 'a', 'review_id': 'shared', 'title': 'Shared gap',
             'status': 'open', 'severity': 'high'},
            {'finding_id': 'closed-gap', 'client_id': 'a', 'review_id': 'shared', 'status': 'closed'},
            {'finding_id': 'accepted-gap', 'client_id': 'a', 'review_id': 'shared', 'status': 'accepted'},
            {'finding_id': 'foreign-gap', 'client_id': 'b', 'framework_assessment_id': 'assessment-a',
             'status': 'open', 'title': 'Private finding', 'severity': 'critical'},
        ])
        await server.db.tasks.insert_many([
            {'task_id': 'remediation', 'client_id': 'a', 'finding_id': 'narrow', 'review_id': 'shared',
             'framework_assessment_id': 'assessment-a', 'title': 'Close host gap', 'status': 'blocked',
             'priority': 'high', 'assignee_id': 'assignee', 'owner_id': 'legacy-owner',
             'due_date': '2026-01-03', 'description': 'Excluded task narrative'},
            {'task_id': 'routine', 'client_id': 'a', 'review_id': 'shared', 'status': 'open',
             'title': 'Routine review work', 'priority': 'low', 'due_date': '2027-01-01'},
            {'task_id': 'closed-finding-action', 'client_id': 'a', 'finding_id': 'closed-gap',
             'status': 'open', 'priority': 'medium'},
            {'task_id': 'done', 'client_id': 'a', 'review_id': 'shared', 'status': 'done'},
            {'task_id': 'cancelled', 'client_id': 'a', 'review_id': 'shared', 'status': 'cancelled'},
            {'task_id': 'foreign-action', 'client_id': 'b', 'framework_assessment_id': 'assessment-a',
             'status': 'open', 'priority': 'critical', 'title': 'Private action'},
        ])
        await server.db.evidence.insert_many([
            {'evidence_id': 'support', 'client_id': 'a', 'linked_type': 'framework_assessment',
             'linked_id': 'assessment-a', 'evidence_date': '2026-01-05', 'created_at': '2026-01-06',
             'updated_at': '2026-10-07', 'content_base64': 'Excluded evidence content'},
            {'evidence_id': 'unlinked', 'client_id': 'a', 'linked_type': 'framework_assessment',
             'linked_id': 'assessment-a', 'created_at': '2027-01-01'},
            {'evidence_id': 'archived', 'client_id': 'a', 'linked_type': 'framework_assessment',
             'linked_id': 'assessment-a', 'created_at': '2027-01-01', 'archived_at': '2026-01-01'},
            {'evidence_id': 'foreign-evidence', 'client_id': 'b', 'linked_type': 'framework_assessment',
             'linked_id': 'assessment-a', 'created_at': '2027-01-01'},
        ])
        return rows

    async def work(self, rows, **kwargs):
        clock = SimpleNamespace(now=lambda _tz: datetime(2026, 10, 7, tzinfo=timezone.utc))
        with patch.object(framework_governance, 'datetime', clock):
            return await framework_governance.workspace_work(server, 'a', rows, **kwargs)

    async def test_native_scalars_scope_and_existing_counts_are_preserved(self):
        rows = await self.seed()
        legacy = await self.work(rows)
        result = await self.work(rows, upgraded=True)
        for aid, context in result.items():
            self.assertTrue(context['context_complete'])
            for field, value in legacy[aid].items():
                self.assertEqual(context[field], value, (aid, field))
        first, second = result['assessment-a'], result['assessment-b']
        self.assertEqual(first['task_ids'], ['closed-finding-action', 'remediation', 'routine'])
        self.assertEqual(second['task_ids'], ['closed-finding-action', 'routine'])
        self.assertEqual((first['open_findings'], second['open_findings']), (2, 1))
        self.assertEqual((first['overdue_reviews'], first['overdue_actions']), (1, 1))
        records = {(r['kind'], r['id']): r for r in first['priority_records']}
        self.assertEqual(records[('findings', 'narrow')], {
            'kind': 'findings', 'id': 'narrow', 'finding_id': 'narrow', 'title': 'Host coverage gap',
            'status': 'in_remediation', 'due_date': '2026-01-02', 'severity': 'critical',
            'owner_id': 'finding-owner', 'open_gap': True})
        self.assertEqual(records[('tasks', 'remediation')]['assignee_id'], 'assignee')
        self.assertEqual(records[('tasks', 'remediation')]['owner_id'], 'legacy-owner')
        self.assertEqual(records[('tasks', 'remediation')]['priority'], 'high')
        self.assertTrue(records[('tasks', 'remediation')]['open_gap'])
        self.assertFalse(records[('tasks', 'closed-finding-action')]['open_gap'])
        self.assertFalse(records[('tasks', 'routine')]['open_gap'])
        self.assertEqual(records[('reviews', 'shared')]['reviewer_id'], 'reviewer')
        self.assertFalse(records[('reviews', 'shared')]['open_gap'])
        self.assertEqual(len(first['priority_records']), len(records))
        self.assertFalse(any(r['id'] in ('narrow', 'remediation') for r in second['priority_records']))
        self.assertFalse(any(r['id'] in ('complete', 'cancelled', 'done', 'accepted-gap', 'closed-gap') for r in first['priority_records']))
        self.assertFalse(any('Private' in (r['title'] or '') for context in result.values() for r in context['priority_records']))

    async def test_evidence_age_never_implies_verification_or_exposes_content(self):
        rows = await self.seed()
        first = (await self.work(rows, upgraded=True))['assessment-a']
        self.assertEqual((first['evidence_count'], first['latest_evidence_at']), (1, '2026-01-05'))
        self.assertFalse(any('verif' in field for field in first))
        allowed = {'kind', 'id', 'review_id', 'finding_id', 'task_id', 'title', 'status', 'due_date',
                   'owner_id', 'reviewer_id', 'assignee_id', 'severity', 'priority', 'open_gap'}
        for record in first['priority_records']:
            self.assertLessEqual(set(record), allowed)
        self.assertFalse(any(r['kind'] == 'evidence' for r in first['priority_records']))

    async def test_nonpilot_keeps_original_shape_and_empty_pilot_context_is_complete(self):
        row = {'framework_assessment_id': 'empty', 'framework_key': 'cis-ig1', 'definition_id': '13.2'}
        legacy = (await self.work([row]))['empty']
        self.assertNotIn('priority_records', legacy)
        self.assertNotIn('task_ids', legacy)
        self.assertNotIn('context_complete', legacy)
        pilot = (await self.work([row], upgraded=True))['empty']
        self.assertTrue(pilot['context_complete'])
        self.assertEqual((pilot['priority_records'], pilot['task_ids']), ([], []))
        self.assertEqual((pilot['open_actions'], pilot['open_findings']), (0, 0))

    async def test_five_bounded_queries_are_shared_across_assessments(self):
        rows = await self.seed()
        bounded = AsyncMock(wraps=server._bounded)
        with patch.object(server, '_bounded', bounded):
            await self.work(rows, upgraded=True)
        self.assertEqual(bounded.await_count, 5)
        self.assertEqual([call.args[1] for call in bounded.await_args_list], [10000] * 5)
        self.assertEqual([call.args[2] for call in bounded.await_args_list], [
            'workspace reviews', 'workspace findings', 'workspace finding scopes',
            'workspace actions', 'workspace evidence'])

    async def test_overflow_and_query_failure_do_not_return_complete_or_zero_context(self):
        rows = await self.seed()
        class OverflowCursor:
            async def to_list(self, length):
                self.length = length
                return [{}] * 10001
        cursor = OverflowCursor()
        database = SimpleNamespace(reviews=SimpleNamespace(find=lambda *_: cursor))
        with patch.object(server, 'db', database):
            with self.assertRaises(HTTPException) as caught:
                await self.work(rows, upgraded=True)
        self.assertEqual(cursor.length, 10001)
        self.assertEqual(caught.exception.status_code, 413)
        self.assertIn('No partial results shown', caught.exception.detail)
        async def fail_evidence(source, limit, what):
            if what == 'workspace evidence':
                raise RuntimeError('Isolated evidence query failed')
            return await original_bounded(source, limit, what)
        original_bounded = server._bounded
        with patch.object(server, '_bounded', side_effect=fail_evidence):
            with self.assertRaisesRegex(RuntimeError, 'Isolated evidence query failed'):
                await self.work(rows, upgraded=True)
