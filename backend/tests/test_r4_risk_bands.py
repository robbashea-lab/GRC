"""R4 Risk bands, cadence boundaries and Review-only assessment projection."""
from copy import deepcopy
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import test_client_dashboard_sources as fixtures
import grc_rules
import risk_lifecycle


class RiskBandContractTests(unittest.TestCase):
    def test_all_valid_scores_use_the_approved_bands(self):
        for score in range(1, 26):
            expected = 'low' if score <= 4 else 'moderate' if score <= 9 else 'high' if score <= 14 else 'critical'
            with self.subTest(score=score):
                self.assertEqual(grc_rules.risk_level(score), expected)

    def test_unrated_invalid_and_out_of_range_scores_stay_unknown(self):
        for score in (None, True, False, 0, -1, 26, 100, 1.0, 15.5, '5', '', [], {}):
            with self.subTest(score=score):
                self.assertIsNone(grc_rules.risk_level(score))

    def test_assessment_derives_score_from_valid_inputs_without_changing_saved_row(self):
        for likelihood in range(1, 6):
            for impact in range(1, 6):
                row = {'likelihood_score': likelihood, 'impact_score': impact,
                       'risk_score': 99, 'risk_level': 'stale', 'status': 'accepted'}
                before = deepcopy(row)
                calculated = grc_rules.assessed_risk(row)
                self.assertEqual(calculated['risk_score'], likelihood * impact)
                self.assertEqual(calculated['risk_level'], grc_rules.risk_level(likelihood * impact))
                self.assertEqual(calculated['status'], 'accepted')
                self.assertEqual(row, before)
        for value in (None, True, 0, 6, 2.0, '2'):
            for field in ('likelihood_score', 'impact_score'):
                row = {'likelihood_score': 2, 'impact_score': 3, field: value,
                       'risk_score': 25, 'risk_level': 'critical'}
                with self.subTest(field=field, value=value):
                    self.assertIsNone(grc_rules.assessed_risk(row)['risk_score'])
                    self.assertIsNone(grc_rules.assessed_risk(row)['risk_level'])

    def test_custom_cadence_accepts_only_whole_days_in_the_approved_range(self):
        for days in (1, 3650, 3651, 3660):
            risk_lifecycle.validate_schedule({'review_cadence': 'custom', 'custom_recurrence_days': days})
        for days in (None, True, False, 0, -1, 3661, 1.0, '1'):
            with self.subTest(days=days), self.assertRaises(HTTPException) as error:
                risk_lifecycle.validate_schedule({'review_cadence': 'custom', 'custom_recurrence_days': days})
            self.assertEqual(error.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            risk_lifecycle.validate_schedule({'review_cadence': 'custom', 'custom_recurrence_days': 3660,
                                              'next_review': 'invalid date'})


class RiskReviewProjectionTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.ClientDashboardSourcesTests.asyncSetUp

    async def test_projection_updates_assessment_but_preserves_governance_identity_and_history(self):
        source = {'risk_id': 'r4-risk', 'client_id': 'a', 'owner_id': 'member', 'status': 'accepted',
                  'acceptance_rationale': 'Current authorized decision', 'accepted_by': 'admin',
                  'acceptance_date': '2026-11-19', 'acceptance_expires_at': '2027-11-19',
                  'updated_at': '2026-11-19T10:00:00+00:00', 'likelihood_score': 2, 'impact_score': 2}
        await fixtures.server.db.risks.insert_one(deepcopy(source))
        await fixtures.server.db.risks.insert_one({**source, 'client_id': 'b', 'title': 'Other tenant'})
        historical = {**risk_lifecycle.snapshot(source), 'likelihood_score': 3, 'impact_score': 5,
                      'risk_score': 15, 'risk_level': 'critical', 'assessment_rationale': 'Reviewed exposure',
                      'status': 'closed', 'accepted_by': 'old-actor', 'acceptance_rationale': 'Old decision',
                      'acceptance_date': '2020-01-01', 'acceptance_expires_at': '2020-02-01',
                      'client_id': 'b', 'risk_id': 'other', 'owner_id': 'old-owner'}
        review = {'risk_id': source['risk_id'], 'client_id': 'a', 'status': 'upcoming',
                  'due_date': '2027-10-01', 'occurrences': [{'occurrence_id': 'r4-occ',
                  'completed_at': '2026-11-19T11:00:00+00:00', 'completed_by': 'member',
                  'completed_by_name': 'Synthetic reviewer', 'risk_after': historical}]}
        history_before = deepcopy(review)
        other_before = await fixtures.server.db.risks.find_one({'risk_id': source['risk_id'], 'client_id': 'b'})
        await risk_lifecycle.sync_completion(fixtures.server.db, review)
        saved = await fixtures.server.db.risks.find_one({'risk_id': source['risk_id'], 'client_id': 'a'})
        for key in ('risk_id', 'client_id', 'owner_id', 'status', 'accepted_by', 'acceptance_date',
                    'acceptance_expires_at', 'acceptance_rationale'):
            self.assertEqual(saved[key], source[key], key)
        for key in risk_lifecycle.REVIEW_ASSESSMENT_FIELDS:
            self.assertEqual(saved.get(key), historical.get(key), key)
        self.assertEqual(saved['last_reviewed'], review['occurrences'][0]['completed_at'])
        self.assertEqual(saved['next_review'], review['due_date'])
        self.assertEqual(review, history_before)
        self.assertEqual(await fixtures.server.db.risks.find_one({'risk_id': source['risk_id'], 'client_id': 'b'}), other_before)
        await risk_lifecycle.sync_completion(fixtures.server.db, review)
        self.assertEqual(await fixtures.server.db.risks.find_one({'risk_id': source['risk_id'], 'client_id': 'a'}), saved)

    async def test_projection_rejects_a_concurrent_source_change(self):
        await fixtures.server.db.risks.insert_one({'risk_id': 'r4-race', 'client_id': 'a', 'status': 'assessed',
                                                  'updated_at': '2026-11-19T10:00:00+00:00', 'risk_score': 4})
        review = {'risk_id': 'r4-race', 'client_id': 'a', 'status': 'completed', 'occurrences': [{
            'occurrence_id': 'race-occ', 'completed_at': '2026-11-19T11:00:00+00:00', 'completed_by': 'member',
            'risk_after': {'risk_score': 15, 'risk_level': 'critical'}}]}
        collection = fixtures.server.db.risks
        original = collection.update_one

        async def competing_write(query, update):
            await original({'risk_id': 'r4-race', 'client_id': 'a'},
                           {'$set': {'updated_at': '2026-11-19T10:30:00+00:00'}})
            return await original(query, update)

        # The mock database otherwise returns a new collection wrapper per access.
        with patch.object(fixtures.server.db, 'risks', collection), \
                patch.object(collection, 'update_one', new_callable=AsyncMock, side_effect=competing_write) as write:
            with self.assertRaises(HTTPException) as error:
                await risk_lifecycle.sync_completion(fixtures.server.db, review)
            write.assert_awaited_once()
        self.assertEqual(error.exception.status_code, 409)
        saved = await fixtures.server.db.risks.find_one({'risk_id': 'r4-race', 'client_id': 'a'})
        self.assertEqual(saved['updated_at'], '2026-11-19T10:30:00+00:00')
        self.assertEqual(saved['risk_score'], 4)
        self.assertNotIn('review_sync_occurrence_id', saved)

    async def test_missing_source_or_assessment_history_does_not_create_a_risk(self):
        for review in ({'client_id': 'a'}, {'client_id': 'a', 'risk_id': 'absent', 'occurrences': []},
                       {'client_id': 'a', 'risk_id': 'absent', 'occurrences': [{'occurrence_id': 'absent',
                         'completed_at': 'now', 'risk_after': {'risk_score': 4}}]}):
            await risk_lifecycle.sync_completion(fixtures.server.db, review)
        self.assertEqual(await fixtures.server.db.risks.count_documents({}), 0)
