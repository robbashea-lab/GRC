"""Completed export preserves unknown history and actual recorded support."""
import copy
import csv
import io
import unittest

import test_client_dashboard_sources as fixture
from r4_review_exports import COLUMNS, completed_rows

server = fixture.server


class R4ReviewExportTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def test_native_export_preserves_scope_original_history_and_support_columns(self):
        self.sign_in('admin')
        occurrence = {'occurrence_id': 'retained-occurrence', 'title': '=Unsafe spreadsheet title',
                      'completed_at': '2026-05-04T10:00:00Z', 'completed_by': None,
                      'due_date': '2026-04-30', 'checklist_results': [{'step_id': 'retained',
                        'text': 'Actual recorded check', 'result': 'Exception', 'reason': 'Retained exception'}],
                      'checklist': {'required_support': ['Period results']},
                      'supporting_reference': 'Completed result SYNTHETIC-53', 'evidence': [{'filename': 'résumé.csv', 'version': 2}]}
        record = {'review_id': 'synthetic-export-review', 'client_id': 'a', 'title': 'Current changed title',
                  'occurrences': [occurrence], 'created_at': '2026-01-01'}
        await server.db.reviews.insert_one(copy.deepcopy(record))
        response = await self.client.get('/api/reviews/completions/export', params={
            'client_id': 'a', 'from_date': '2026-05-01', 'to_date': '2026-05-04'})
        self.assertEqual(response.status_code, 200, response.text)
        rows = list(csv.reader(io.StringIO(response.text)))
        self.assertEqual(rows[0], COLUMNS)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][0], "'=Unsafe spreadsheet title")
        self.assertEqual(rows[1][6], 'Not recorded')
        self.assertEqual(rows[1][-2:], ['Completed result SYNTHETIC-53', 'Period results'])
        retained = await server.db.reviews.find_one({'review_id': record['review_id']}, {'_id': 0})
        self.assertEqual(retained, record)
        self.sign_in('member')
        denied = await self.client.get('/api/reviews/completions/export', params={
            'client_id': 'b', 'from_date': '2026-05-01', 'to_date': '2026-05-04'})
        self.assertEqual(denied.status_code, 403, denied.text)
        invalid = await self.client.get('/api/reviews/completions/export', params={
            'client_id': 'a', 'from_date': '2026-02-30', 'to_date': '2026-05-04'})
        self.assertEqual(invalid.status_code, 422, invalid.text)

    def test_legacy_and_annual_coverage_do_not_invent_individual_checklist_results(self):
        legacy = {'review_id': 'legacy', 'status': 'completed', 'completion_date': '2026-04-01',
                  'title': 'Synthetic legacy', 'completion_snapshot': {'by': None}}
        coverage = {'review_id': 'covered', 'occurrences': [{'occurrence_id': 'covered-occ',
            'completed_at': '2026-04-02', 'coverage_evaluation': {'source_review_id': 'set-review',
              'checklist_results': [{'result': 'Pass'}], 'supporting_reference': 'Actual annual population'}}]}
        rows = completed_rows([legacy, coverage], '2026-01-01', '2026-12-31')
        old = next(row for row in rows if row[0] == 'Synthetic legacy')
        self.assertEqual(old[10], 'Not recorded')
        self.assertEqual(old[6], 'Not recorded')
        covered = next(row for row in rows if row[15] == 'covered-occ')
        self.assertTrue(covered[10].startswith('Annual coverage from set-review:'))
        self.assertEqual(covered[-2], 'Actual annual population')
