"""Isolated native status/scope and sampled-history contracts; no source writes."""
import copy
import unittest
from unittest.mock import patch

import portfolio_progress as progress
from framework_catalog import CATALOGS, FRAMEWORKS, active_definitions


AS_OF = '2026-10-13T18:00:00+00:00'


def client(group=1, categories=('security',)):
    return {'client_id': 'owned', 'name': 'Isolated portfolio fixture', 'status': 'active',
            'onboarding_baseline': {'completed': True}, 'framework_settings': {
                'cis-ig1': {'implementation_group': group}, 'soc-2': {'categories': list(categories)}}}


def framework(key):
    return next(row for row in FRAMEWORKS if row['key'] == key)


def source(key, configuration=None):
    return [{'client_id': 'owned', 'framework_key': key, 'framework_assessment_id': 'native-' + d['id'],
             'definition_id': d['id'], 'framework_version': CATALOGS[key]['version'], 'status': 'not_assessed',
             'created_at': '2026-10-01T12:00:00+00:00'} for d in active_definitions(key, configuration)]


def position(key, rows, configuration=None):
    return progress.current_position(configuration or client(), framework(key), [], rows, AS_OF)['current']


class NativeProgressTests(unittest.TestCase):
    def test_cis_scopes_reconcile_native_cumulative_inventory_and_exclude_retained_groups(self):
        rows = source('cis-ig1', {'implementation_group': 3})
        baseline_ids = {d['id'] for d in active_definitions('cis-ig1', {'implementation_group': 1})}
        baseline = [row for row in rows if row['definition_id'] in baseline_ids]
        baseline[0]['status'] = 'addressed'
        baseline[1]['status'] = 'in_progress'
        baseline[2]['status'] = 'needs_attention'
        baseline[3].update(status='not_applicable', na_rationale='Isolated supported native exclusion')
        for group, total in ((1, 56), (2, 130), (3, 153)):
            with self.subTest(group=group):
                result = progress.current_position(client(group), framework('cis-ig1'), [], rows, AS_OF)
                current = result['current']
                self.assertEqual(result['program_key'], 'cis-ig' + str(group))
                self.assertEqual(current['total'], total)
                self.assertEqual(current['denominator'], total - 1)
                self.assertEqual(current['implemented'], 1)
                self.assertEqual(current['excluded'], 1)
                self.assertAlmostEqual(current['percentage'], 100 / (total - 1))
                self.assertEqual(sum(c['count'] for c in current['counts']), total)
                self.assertEqual(len(current['scope']['definition_ids']), total)
        # A verification result and unfinished guided draft never change credit.
        before = position('cis-ig1', rows)
        rows[4].update(verification='verified', guided_assessment_source={'result': {'status': 'addressed'}})
        self.assertEqual(position('cis-ig1', rows)['percentage'], before['percentage'])

    def test_iso_mandatory_isms_included_annex_and_unresolved_soa_are_separate(self):
        rows = source('iso-27001')
        by_id = {r['definition_id']: r for r in rows}
        by_id['4.1']['status'] = 'addressed'
        by_id['A.5.1'].update(status='addressed', soa_applicability='included', soa_justification='Isolated inclusion')
        by_id['A.5.2'].update(status='addressed', soa_applicability='excluded', soa_justification='Isolated exclusion')
        current = position('iso-27001', rows)
        self.assertEqual(current['total'], 123)
        self.assertEqual(current['denominator'], 31)
        self.assertEqual(current['implemented'], 2)
        self.assertEqual(current['excluded'], 1)
        self.assertEqual(current['scope_undetermined'], 91)
        self.assertAlmostEqual(current['percentage'], 200 / 31)
        components = {c['key']: c for c in current['components']}
        self.assertEqual((components['isms']['denominator'], components['isms']['implemented']), (30, 1))
        self.assertEqual((components['annex']['denominator'], components['annex']['implemented']), (1, 1))
        self.assertEqual(components['soa'], {'key': 'soa', 'label': 'Statement of Applicability', 'total': 93,
                                           'included': 1, 'excluded': 1, 'undetermined': 91, 'unavailable': 0})
        self.assertIn('undetermined', current['reason'])
        by_id['4.1'].update(status='not_applicable', na_rationale='Invalid mandatory clause exclusion')
        invalid = position('iso-27001', rows)
        self.assertEqual(invalid['denominator'], 31)
        self.assertIsNone(invalid['percentage'])
        self.assertIn('4.1', invalid['invalid_applicability'])
        self.assertTrue(all(component.get('percentage') is None for component in invalid['components']))

    def test_soc_selected_categories_are_real_criteria_and_readiness_labels(self):
        rows = source('soc-2', {'categories': list(progress.SOC_LABELS)})
        rows[0]['status'] = 'addressed'
        security = position('soc-2', rows)
        three = position('soc-2', rows, client(categories=('security', 'availability', 'confidentiality')))
        five = position('soc-2', rows, client(categories=tuple(progress.SOC_LABELS)))
        self.assertEqual((security['total'], three['total'], five['total']), (33, 38, 61))
        self.assertIn('Readiness', security['counts'][0]['label'])
        self.assertEqual({c['key'] for c in three['components']}, {'security', 'availability', 'confidentiality'})
        self.assertNotEqual(security['scope_signature'], three['scope_signature'])
        self.assertEqual(three['scope_signature'], position('soc-2', rows,
            client(categories=('confidentiality', 'security', 'availability')))['scope_signature'])

    def test_other_supported_frameworks_do_not_invent_criteria_or_profile_alignment_credit(self):
        for key in ('hipaa', 'nist-csf-2'):
            with self.subTest(key=key):
                rows = source(key)
                rows[0].update(status='addressed', csf_profile={'gap_state': 'gap'})
                rows[1].update(csf_profile={'gap_state': 'aligned', 'target_selected': True})
                current = position(key, rows)
                self.assertEqual(current['total'], len(CATALOGS[key]['requirements']))
                self.assertEqual(current['implemented'], 1)
                self.assertEqual(current['denominator'], len(rows))
        unsupported = progress.current_position(client(), framework('cmmc'), [], [], AS_OF)['current']
        self.assertEqual(unsupported['availability'], 'unavailable')
        self.assertIsNone(unsupported['percentage'])

    def test_no_data_missing_duplicates_unknown_and_zero_scope_never_look_complete(self):
        missing = position('cis-ig1', [])
        self.assertEqual(missing['missing_records'], 56)
        self.assertEqual(missing['availability'], 'partial')
        self.assertIsNone(missing['percentage'])
        rows = source('cis-ig1')
        rows[0]['status'] = 'unrecognized'
        self.assertIsNone(position('cis-ig1', rows)['percentage'])
        rows[0]['status'] = 'not_assessed'
        duplicate = position('cis-ig1', rows + [copy.deepcopy(rows[0])])
        self.assertEqual(duplicate['duplicate_records'], 1)
        self.assertIsNone(duplicate['percentage'])
        for row in rows:
            row.update(status='not_applicable', na_rationale='Isolated native exemption')
        excluded = position('cis-ig1', rows)
        self.assertEqual((excluded['implemented'], excluded['denominator'], excluded['excluded']), (0, 0, 56))
        self.assertIsNone(excluded['percentage'])
        empty_catalog = {**CATALOGS['cis-ig1'], 'requirements': []}
        with patch.dict(CATALOGS, {'cis-ig1': empty_catalog}):
            self.assertIsNone(position('cis-ig1', [])['percentage'])

    def test_scope_hash_detects_same_count_replacements_versions_and_applicability(self):
        rows = source('cis-ig1')
        original = position('cis-ig1', rows)
        catalog = copy.deepcopy(CATALOGS['cis-ig1'])
        catalog['requirements'][0]['id'] = 'same-count-replacement'
        replacement = copy.deepcopy(rows)
        replacement[0]['definition_id'] = 'same-count-replacement'
        with patch.dict(CATALOGS, {'cis-ig1': catalog}):
            changed = position('cis-ig1', replacement)
        self.assertEqual(changed['denominator'], original['denominator'])
        self.assertNotEqual(changed['scope_signature'], original['scope_signature'])
        rows[0]['framework_version'] = 'retained-older-catalog'
        self.assertNotEqual(position('cis-ig1', rows)['scope_signature'], original['scope_signature'])
        rows[0].update(status='not_applicable', na_rationale='Isolated reason')
        self.assertNotEqual(position('cis-ig1', rows)['scope_signature'], original['scope_signature'])

    def test_duplicate_native_definition_with_null_legacy_and_current_version_is_partial(self):
        rows = source('cis-ig1')
        legacy = {**copy.deepcopy(rows[0]), 'framework_assessment_id': 'retained-legacy-record',
                  'framework_version': None, 'status': 'addressed'}
        before = copy.deepcopy([*rows, legacy])
        current = position('cis-ig1', [*rows, legacy])
        self.assertEqual(current['availability'], 'partial')
        self.assertEqual(current['duplicate_records'], 1)
        self.assertIsNone(current['percentage'])
        references = [r for r in current['provenance']['source_references']
                      if r.get('definition_id') == legacy['definition_id']]
        self.assertEqual({r['framework_version'] for r in references}, {None, CATALOGS['cis-ig1']['version']})
        self.assertEqual([*rows, legacy], before)

    def test_cutoff_race_is_partial_instead_of_backdated_current_success(self):
        rows = source('cis-ig1')
        rows[0].update(status='addressed', last_saved='2026-10-13T18:00:01+00:00')
        current = position('cis-ig1', rows)
        self.assertFalse(current['provenance']['cutoff_consistent'])
        self.assertIsNone(current['percentage'])
        self.assertIn('retry', current['reason'])

    def test_invalid_native_configuration_is_unavailable_instead_of_invented_scope(self):
        for key, configuration in (('cis-ig1', client(group=True)), ('cis-ig1', client(group=4)),
                                   ('soc-2', client(categories=('availability',))),
                                   ('soc-2', client(categories=('security', 'security'))),
                                   ('soc-2', client(categories=('security', 'invented')))):
            current = position(key, [], configuration)
            self.assertEqual(current['availability'], 'unavailable')
            self.assertIsNone(current['scope_signature'])

    def test_view_data_safe_source_references_are_scalar_not_narratives(self):
        rows = source('cis-ig1')
        rows[0].update(implementation='restricted source text', notes='private payload', assessment_history=[{'by': 'secret'}])
        current = position('cis-ig1', rows)
        self.assertNotIn('restricted source text', str(current))
        self.assertNotIn('private payload', str(current))
        self.assertEqual(current['provenance']['source_references'][0]['id'], rows[0]['framework_assessment_id'])


class SampledHistoryTests(unittest.TestCase):
    def point(self, at, percentage=0, signature='scope-a'):
        return {'captured_at': at, 'percentage': percentage, 'scope_signature': signature,
                'measure_version': progress.MEASURE_VERSION, 'implemented': percentage, 'denominator': 100, 'counts': []}

    def test_calendar_ranges_month_end_and_leap_day(self):
        self.assertEqual(progress.range_start('2024-08-31T12:00:00Z', '6m'), '2024-02-29T12:00:00+00:00')
        self.assertEqual(progress.range_start('2024-02-29T12:00:00Z', '12m'), '2023-02-28T12:00:00+00:00')
        self.assertEqual(progress.range_start('2026-10-13T00:00:00-04:00', '30d'), '2026-09-13T04:00:00+00:00')
        for value, period in [('2026-10-13', '30d'), (AS_OF, '180d')]:
            with self.assertRaises(ValueError):
                progress.range_start(value, period)

    def test_no_earlier_snapshot_is_missing_baseline_even_if_first_after_start_exists(self):
        current = self.point(AS_OF, 50)
        result = progress.compare_positions([self.point('2026-10-01T00:00:00Z', 10)], current, '2026-09-13T18:00:00Z')
        self.assertIsNone(result['baseline'])
        self.assertIsNone(result['change_pp'])
        self.assertFalse(result['comparable'])
        self.assertEqual(result['available_from'], '2026-10-01T00:00:00+00:00')

    def test_actual_old_baseline_date_unrounded_pp_and_sparse_coverage(self):
        baseline = self.point('2026-09-01T00:00:00Z', 100 / 3)
        current = self.point(AS_OF, 200 / 3)
        result = progress.compare_positions([baseline, self.point('2026-10-01T00:00:00Z', 50)], current, '2026-09-13T18:00:00Z')
        self.assertEqual(result['baseline']['captured_at'], baseline['captured_at'])
        self.assertTrue(result['baseline_before_requested_start'])
        self.assertAlmostEqual(result['change_pp'], 100 / 3)
        self.assertTrue(result['comparable'])
        self.assertFalse(result['continuous_history'])
        self.assertIn('not reconstructed', result['reason'])

    def test_scope_changes_and_scope_reversion_never_show_an_improvement_delta(self):
        baseline = self.point('2026-09-01T00:00:00Z', 10)
        changed = self.point('2026-10-01T00:00:00Z', 60, 'same-total-different-requirements')
        for current in (self.point(AS_OF, 90), self.point(AS_OF, 90, changed['scope_signature'])):
            result = progress.compare_positions([changed, baseline], current, '2026-09-13T18:00:00Z')
            self.assertTrue(result['scope_changed'])
            self.assertFalse(result['comparable'])
            self.assertIsNone(result['change_pp'])

    def test_out_of_order_invalid_future_and_wrapper_snapshots_preserve_cutoff(self):
        baseline = self.point('2026-09-10T00:00:00Z', 10)
        snapshots = [{'current': self.point('2027-01-01T00:00:00Z', 100, 'future-scope')},
                     {'current': baseline}, {'current': {'captured_at': 'malformed'}},
                     {'current': self.point('2026-09-01T00:00:00Z', 0)}]
        current = self.point(AS_OF, 50)
        result = progress.compare_positions(snapshots, {'current': current}, '2026-09-13T18:00:00Z')
        self.assertEqual(result['baseline'], baseline)
        self.assertTrue(result['comparable'])
        self.assertEqual(result['change_pp'], 40)
        with self.assertRaises(ValueError):
            progress.compare_positions([], current, '2027-01-01T00:00:00Z')

    def test_unknown_scope_zero_and_incomplete_endpoint_do_not_report_zero_change(self):
        baseline = self.point('2026-09-01T00:00:00Z', 10)
        for current in (self.point(AS_OF, None), self.point(AS_OF, 10, None)):
            result = progress.compare_positions([baseline], current, '2026-09-13T18:00:00Z')
            self.assertFalse(result['comparable'])
            self.assertIsNone(result['change_pp'])

    def test_duplicate_baseline_delivery_is_idempotent_but_conflicting_ties_are_unavailable(self):
        baseline = self.point('2026-09-01T00:00:00Z', 10)
        current = self.point(AS_OF, 50)
        result = progress.compare_positions([baseline, copy.deepcopy(baseline)], current, '2026-09-13T18:00:00Z')
        self.assertEqual(result['change_pp'], 40)
        conflicting = {**baseline, 'percentage': 30}
        result = progress.compare_positions([baseline, conflicting], current, '2026-09-13T18:00:00Z')
        self.assertFalse(result['comparable'])
        self.assertIsNone(result['baseline'])
        self.assertIsNone(result['change_pp'])
        self.assertIn('Conflicting', result['reason'])


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return copy.deepcopy(self.rows[:limit])


class Collection:
    def __init__(self, rows):
        self.rows, self.queries = rows, []

    def find(self, query, projection):
        self.queries.append((query, projection))
        # Deliberately returns foreign rows to exercise the defensive client fence.
        return Cursor(self.rows)


class NativeReadTests(unittest.IsolatedAsyncioTestCase):
    async def test_batch_native_read_no_source_mutation_retirement_and_foreign_rows(self):
        class Database:
            requirements = Collection([
                {'client_id': 'owned', 'requirement_id': 'cis', 'baseline_key': 'cis-ig1', 'baseline_response': 'applies'},
                {'client_id': 'owned', 'requirement_id': 'soc', 'baseline_key': 'soc-2', 'baseline_response': 'applies'},
                {'client_id': 'owned', 'requirement_id': 'iso-retired', 'baseline_key': 'iso-27001', 'baseline_response': 'applies', 'status': 'retired'},
                {'client_id': 'foreign', 'requirement_id': 'private', 'baseline_key': 'hipaa', 'baseline_response': 'applies'}])
            framework_assessments = Collection(source('cis-ig1') + source('soc-2') + [{
                'client_id': 'foreign', 'framework_key': 'cis-ig1', 'definition_id': '1.1', 'status': 'addressed'}])
        database = Database()
        before = copy.deepcopy((database.requirements.rows, database.framework_assessments.rows))
        result = await progress.build_current_positions(database, client(), AS_OF)
        self.assertEqual([p['program_key'] for p in result], ['cis-ig1', 'soc-2'])
        self.assertEqual([p['current']['implemented'] for p in result], [0, 0])
        self.assertEqual(len(database.requirements.queries), 1)
        self.assertEqual(len(database.framework_assessments.queries), 1)
        self.assertEqual(before, (database.requirements.rows, database.framework_assessments.rows))
        for state in ({**client(), 'status': 'archived'}, {**client(), 'onboarding_baseline': {'completed': False}}):
            self.assertEqual(await progress.build_current_positions(database, state, AS_OF), [])

    async def test_overflow_refuses_partial_totals(self):
        class Database:
            requirements = Collection([{'client_id': 'owned', 'baseline_key': 'cis-ig1'}] * (progress.SOURCE_LIMIT + 1))
        with self.assertRaisesRegex(ValueError, 'supported size'):
            await progress.build_current_positions(Database(), client(), AS_OF)


if __name__ == '__main__':
    unittest.main()
