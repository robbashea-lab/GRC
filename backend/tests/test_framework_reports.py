"""Native snapshot, role and immutable report boundary checks; no client data."""
import copy
from datetime import datetime, timezone
import os
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import patch

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
import framework_reports as reports
import portfolio_progress as native_progress
from framework_catalog import CATALOGS, FRAMEWORKS, active_definitions, client_configuration

NOW = datetime(2026, 10, 13, 15, 0, tzinfo=timezone.utc)


def fixture(key='cis-ig1', group=1, categories=None):
    client = {'client_id': 'a', 'name': 'A Real Client', 'status': 'active',
        'onboarding_baseline': {'completed': True},
        'framework_settings': {'cis-ig1': {'implementation_group': group},
            'soc-2': {'categories': categories or ['security']}}}
    rows = [{'framework_assessment_id': 'a:' + key + ':' + d['id'], 'client_id': 'a',
        'framework_key': key, 'framework_version': CATALOGS[key]['version'], 'definition_id': d['id'],
        'status': 'not_assessed', 'implementation': '', 'related_links': [], 'assessment_history': [],
        'created_at': '2026-01-01T00:00:00+00:00'}
        for d in active_definitions(key, client_configuration(key, client))]
    return client, rows


def snapshot(client, key, rows, evidence=(), findings=(), period='6m', reviews=()):
    return reports.build_snapshot(client, key, rows, list(evidence), list(findings), NOW, period,
        ('read-start', 'read-end'), 'test position', list(reviews))


def native_position(client, key, rows):
    framework = next(row for row in FRAMEWORKS if row['key'] == key)
    return native_progress.current_position(client, framework, [], rows, NOW)['current']


class FrameworkReportUnitTests(unittest.TestCase):
    def test_native_position_iso_undetermined_annex_never_supplies_implementation_credit(self):
        client, rows = fixture('iso-27001')
        for row in rows:
            if row['definition_id'].startswith('A.'):
                row['status'] = 'addressed'
        before = copy.deepcopy(rows)
        value = snapshot(client, 'iso-27001', rows)
        summary = value['summary']
        expected = native_position(client, 'iso-27001', rows)
        self.assertEqual(summary['applicable_total'], 30)
        self.assertEqual(summary['implementation_percent'], 0.0)
        self.assertEqual(summary['scope_undetermined'], 93)
        self.assertEqual(summary['not_applicable'], 0)
        self.assertEqual(summary['implementation_position'], expected)
        self.assertEqual(summary['status_counts']['addressed'], 93)
        self.assertEqual(summary['status_counts']['not_assessed'], 30)
        self.assertEqual(summary['native_metrics']['assessment_progress']['resolved'], 93)
        self.assertEqual(summary['native_metrics']['soa']['undetermined'], 93)
        self.assertEqual(len(value['assessments']), 123)
        self.assertEqual(sum(row['status'] == 'addressed' for row in value['assessments']), 93)
        self.assertEqual(rows, before)

    def test_native_position_invalid_na_and_zero_scope_never_look_complete(self):
        for key in ('cis-ig1', 'soc-2'):
            with self.subTest(framework=key):
                client, rows = fixture(key)
                rows[0]['status'] = 'addressed'
                rows[1].update(status='not_applicable', na_rationale='   ')
                invalid = snapshot(client, key, rows)['summary']
                self.assertEqual(invalid['applicable_total'], len(rows))
                self.assertIsNone(invalid['implementation_percent'])
                self.assertEqual(invalid['not_applicable'], 0)
                self.assertEqual(invalid['implementation_position'], native_position(client, key, rows))
                self.assertEqual(invalid['implementation_position']['availability'], 'partial')
                self.assertEqual(invalid['status_counts']['not_applicable'], 1)
                self.assertEqual(invalid['native_metrics']['assessment_progress']['invalid_na'], 1)
                rows[1]['na_rationale'] = 'Valid saved native scope exclusion'
                valid = snapshot(client, key, rows)['summary']
                self.assertEqual(valid['applicable_total'], len(rows) - 1)
                self.assertEqual(valid['implementation_percent'], native_position(client, key, rows)['percentage'])
                self.assertEqual(valid['implementation_position'], native_position(client, key, rows))
                self.assertEqual(valid['native_metrics']['assessment_progress']['valid_na'], 1)
                for row in rows:
                    row.update(status='not_applicable', na_rationale='Valid saved native scope exclusion')
                excluded = snapshot(client, key, rows)['summary']
                self.assertEqual(excluded['applicable_total'], 0)
                self.assertEqual(excluded['not_applicable'], len(rows))
                self.assertIsNone(excluded['implementation_percent'])
                self.assertEqual(excluded['implementation_position'], native_position(client, key, rows))
                self.assertEqual(excluded['native_metrics']['assessment_progress']['valid_na'], len(rows))

    def test_iso_history_retains_recorded_events_when_cis_configuration_changes(self):
        client, rows = fixture('iso-27001')
        client['cis_configuration_updated_at'] = '2026-10-05T00:00:00Z'
        for row in rows:
            row.update(status='addressed', assessment_history=[
                {'at': '2026-03-01T00:00:00Z', 'status': 'in_progress'},
                {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
            if row['definition_id'].startswith('A.'):
                row.update(soa_applicability='included', soa_justification='Recorded inclusion')
                for event in row['assessment_history']:
                    event.update(soa_applicability='included', soa_justification='Recorded inclusion')
        value = snapshot(client, 'iso-27001', rows)
        points = value['trend']['observations']
        self.assertEqual([point['date'][:10] for point in points], ['2026-03-01', '2026-10-01', '2026-10-13'])
        self.assertEqual(points[0]['status_counts']['in_progress'], 123)
        self.assertEqual(points[1]['status_counts']['addressed'], 123)
        self.assertTrue(points[-1]['current_snapshot'])
        self.assertEqual(points[-1]['implementation_percent'], native_position(client, 'iso-27001', rows)['percentage'])

    def test_assessment_events_do_not_establish_past_program_scope_or_catalog_lineage(self):
        for key, group in (('cis-ig1', 1), ('cis-ig1', 2), ('cis-ig1', 3), ('soc-2', 1), ('iso-27001', 1)):
            with self.subTest(framework=key, group=group):
                client, rows = fixture(key, group)
                for row in rows:
                    row.update(status='addressed', assessment_history=[
                        {'at': '2026-03-01T00:00:00Z', 'status': 'in_progress', 'framework_version': CATALOGS[key]['version']},
                        {'at': '2026-10-01T00:00:00Z', 'status': 'addressed', 'framework_version': CATALOGS[key]['version']}])
                    if key == 'iso-27001' and row['definition_id'].startswith('A.'):
                        row.update(soa_applicability='included', soa_justification='Recorded inclusion')
                        for event in row['assessment_history']:
                            event.update(soa_applicability='included', soa_justification='Recorded inclusion')
                value = snapshot(client, key, rows)
                trend = value['trend']
                self.assertEqual(trend['state'], 'partial')
                self.assertFalse(trend['comparable'])
                points = trend['observations']
                self.assertEqual([point['date'][:10] for point in points], ['2026-03-01', '2026-10-01', '2026-10-13'])
                for point in points[:-1]:
                    self.assertIsNone(point['implementation_percent'])
                    self.assertFalse(point['comparison_baseline'])
                self.assertEqual(points[0]['status_counts']['in_progress'], len(rows))
                self.assertEqual(points[1]['status_counts']['addressed'], len(rows))
                self.assertEqual(points[-1]['implementation_percent'], native_position(client, key, rows)['percentage'])

    def test_historical_missing_rationale_never_borrows_current_applicability(self):
        for key in ('cis-ig1', 'iso-27001'):
            with self.subTest(framework=key):
                client, rows = fixture(key)
                for row in rows:
                    row.update(status='addressed', assessment_history=[
                        {'at': '2026-03-01T00:00:00Z', 'status': 'addressed'},
                        {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
                    if key == 'iso-27001' and row['definition_id'].startswith('A.'):
                        row.update(soa_applicability='excluded', soa_justification='Current exclusion rationale only')
                        for event in row['assessment_history']:
                            event['soa_applicability'] = 'excluded'
                if key == 'cis-ig1':
                    rows[0].update(status='not_applicable', na_rationale='Current exclusion rationale only')
                    for event in rows[0]['assessment_history']:
                        event['status'] = 'not_applicable'
                value = snapshot(client, key, rows)
                trend = value['trend']
                self.assertEqual(len(trend['observations']), 3)
                for point in trend['observations'][:-1]:
                    self.assertIsNone(point['implementation_percent'])
                    self.assertFalse(point['comparison_baseline'])
                self.assertFalse(trend['comparable'])
                self.assertEqual(trend['state'], 'partial')
                self.assertEqual(trend['observations'][-1]['implementation_percent'], native_position(client, key, rows)['percentage'])

    def test_actual_pdf_labels_recorded_states_without_claiming_past_program_scope(self):
        from framework_report_pdf import render_framework_report
        from test_framework_report_pdf import pdf_streams
        client, rows = fixture('iso-27001')
        for row in rows:
            if row['definition_id'].startswith('A.'):
                row['status'] = 'addressed'
            row['assessment_history'] = [
                {'at': '2026-03-01T00:00:00Z', 'status': row['status']},
                {'at': '2026-10-01T00:00:00Z', 'status': row['status']}]
        value = snapshot(client, 'iso-27001', rows)
        with patch('framework_report_pdf._TrendChart', side_effect=AssertionError('Unproven history must not draw a percentage trend')):
            content = pdf_streams(render_framework_report(value, 'executive'))
        progress = content.split(b'PROGRAM PROGRESS', 1)[1].split(b'CONTROL / DOMAIN SUMMARY', 1)[0]
        self.assertIn(b'Saved assessment states', progress)
        self.assertIn(b'Population and history limits', progress)
        self.assertIn(b'current catalog population', progress)
        self.assertNotIn(b'Comparison baseline', progress)
        current_metadata_date = b'October 13, 2026, 15:00 UTC:'
        history_metadata = progress.split(b'Population and history limits', 1)[1].split(current_metadata_date, 1)[0]
        self.assertIn(b'March 01, 2026, 00:00 UTC:', history_metadata)
        self.assertIn(b'October 01, 2026, 00:00 UTC:', history_metadata)
        self.assertNotIn(b'Applicable denominator:', history_metadata)
        self.assertNotIn(b'coverage: 100%', history_metadata)
        self.assertIn(current_metadata_date, progress)
        self.assertIn(b'Applicable denominator: 30', progress)
        self.assertIn(b'0 of 30 applicable requirements and controls', content)
        self.assertIn(b'Saved implementation statuses (all units)', content)
        self.assertEqual(value['summary']['status_counts']['addressed'], 93)
        self.assertEqual(len(value['assessments']), 123)
        self.assertIn(b'native-implementation-v1', content)
        self.assertIn(b'session operation time test position', content)
        self.assertNotIn(b'logical read position', content)
        client, rows = fixture()
        rows[0].update(status='not_applicable', na_rationale=' ')
        partial = snapshot(client, 'cis-ig1', rows)
        self.assertIsNone(partial['summary']['implementation_percent'])
        partial_content = pdf_streams(render_framework_report(partial, 'executive'))
        self.assertIn(b'N/A', partial_content)
        self.assertIn(b'Saved position availability: partial', partial_content)

    def test_five_experiences_native_totals_inheritance_once_and_disabled_categories(self):
        for group, count in ((1, 56), (2, 130), (3, 153)):
            client, rows = fixture(group=group)
            result = snapshot(client, 'cis-ig1', rows)
            self.assertEqual(result['framework']['name'], f'CIS IG{group}')
            self.assertEqual(result['summary']['total'], count)
            self.assertEqual(len({r['id'] for r in result['assessments']}), count)
            self.assertEqual(sum(g['total'] for g in result['groups']), count)
        client, rows = fixture('soc-2', categories=['security', 'availability'])
        result = snapshot(client, 'soc-2', rows)
        expected = active_definitions('soc-2', client_configuration('soc-2', client))
        self.assertEqual(result['summary']['total'], len(expected))
        self.assertTrue(all(g['id'].split('/')[0] in ('security', 'availability') for g in result['groups']))
        self.assertFalse(any(g['id'].startswith('privacy/') for g in result['groups']))
        client, rows = fixture('iso-27001')
        result = snapshot(client, 'iso-27001', rows)
        self.assertEqual(result['summary']['total'], 123)
        self.assertEqual(result['summary']['native_metrics']['clauses']['total'], 30)
        self.assertEqual(result['summary']['native_metrics']['soa']['total'], 93)

    def test_native_default_timezone_snapshot_renders_real_full_and_executive_pdf(self):
        from framework_report_pdf import render_framework_report
        client, rows = fixture()
        value = snapshot(client, 'cis-ig1', rows)
        self.assertEqual(value['timezone'], 'UTC')
        self.assertIn('not recorded', value['timezone_note'])
        for detail in ('full', 'executive'):
            self.assertTrue(render_framework_report(value, detail).startswith(b'%PDF'))

    def test_native_saved_status_not_narrative_and_na_separate_from_implementation(self):
        client, rows = fixture()
        rows[0]['implementation'] = 'Unapproved draft text is not an assessment'
        rows[1].update(status='addressed', implementation='')
        rows[2].update(status='not_applicable', na_rationale='No such scope')
        rows[3].update(status='in_progress', verification='verified')
        result = snapshot(client, 'cis-ig1', rows)
        summary = result['summary']
        self.assertEqual(summary['applicable_total'], 55)
        self.assertEqual(summary['assessed'], 2)
        self.assertEqual(summary['not_assessed'], 53)
        self.assertEqual(summary['not_applicable'], 1)
        self.assertEqual(summary['implementation_percent'], native_position(client, 'cis-ig1', rows)['percentage'])
        self.assertEqual(summary['native_metrics']['assessment_progress']['resolved'], 2)
        self.assertEqual(result['assessments'][0]['status'], 'not_assessed')
        self.assertEqual(result['assessments'][1]['current_implementation'], '')
        self.assertEqual(summary['verification_counts']['verified'], 1)
        self.assertEqual(result['trend']['state'], 'unavailable')
        self.assertEqual(result['trend']['observations'], [])

    def test_iso_soa_independent_and_invalid_na_receives_no_native_resolution(self):
        client, rows = fixture('iso-27001')
        by_id = {row['definition_id']: row for row in rows}
        by_id['4.1'].update(status='not_applicable', na_rationale='Invalid clause exclusion')
        by_id['A.5.1'].update(status='addressed', soa_applicability='included', soa_justification='Within recorded ISMS scope')
        by_id['A.5.2'].update(status='not_applicable', soa_applicability='excluded', soa_justification='Outside recorded scope')
        by_id['A.5.3'].update(status='addressed', soa_applicability='')
        result = snapshot(client, 'iso-27001', rows)
        native = result['summary']['native_metrics']
        self.assertEqual(native['soa'], {'total': 93, 'included': 1, 'excluded': 1, 'undetermined': 91})
        self.assertEqual(native['included_annex']['status_counts']['addressed'], 1)
        self.assertEqual(native['assessment_progress']['invalid_na'], 1)
        self.assertEqual(result['summary']['not_applicable'], 1)
        self.assertEqual(result['summary']['assessed'], 1)
        self.assertIsNone(result['summary']['implementation_percent'])
        self.assertEqual(len(result['assessments']), 123)
        by_id['A.5.4'].update(status='not_applicable', soa_applicability='included', soa_justification='Within recorded ISMS scope')
        legacy = snapshot(client, 'iso-27001', rows)
        self.assertEqual(legacy['summary']['assessed'], 1)
        self.assertEqual(legacy['summary']['native_metrics']['assessment_progress']['invalid_na'], 2)

    def test_evidence_is_authorized_redacted_and_inherited_and_items_use_current_native_state(self):
        client, rows = fixture()
        row = rows[0]
        row['implementation'] = 'Saved paragraph.\n\nControls in place\n• One control\n• Another control'
        row['related_links'] = [{'kind': 'evidence', 'id': 'same'}, {'kind': 'evidence', 'id': 'foreign'},
            {'kind': 'evidence', 'id': 'archived'}, {'kind': 'reviews', 'id': 'review-a'}]
        row['unlinked_evidence_ids'] = ['unlinked']
        row['items_to_address'] = [{'item_id': 'open', 'text': 'Open saved gap', 'state': 'open', 'resolution': '', 'finding_id': 'f-a'},
            {'item_id': 'resolved', 'text': 'Resolved saved gap', 'state': 'resolved', 'resolution': 'Completed', 'finding_id': 'f-b'},
            {'item_id': 'old', 'text': 'Superseded gap', 'state': 'superseded'}]
        row['items_revision'] = 7
        evidence = [{'evidence_id': 'same', 'client_id': 'a', 'filename': 'Reference.pdf', 'content_base64': 'SECRET', 'url': 'https://unapproved.test'},
            {'evidence_id': 'foreign', 'client_id': 'b', 'filename': 'Do not expose'},
            {'evidence_id': 'archived', 'client_id': 'a', 'archived_at': '2026-01-01', 'filename': 'Archived'},
            {'evidence_id': 'inherited', 'client_id': 'a', 'filename': 'Inherited.pdf', 'linked_type': 'reviews', 'linked_id': 'review-a'},
            {'evidence_id': 'unlinked', 'client_id': 'a', 'filename': 'Unlinked.pdf', 'linked_type': 'framework_assessment', 'linked_id': row['framework_assessment_id']}]
        findings = [{'client_id': 'a', 'finding_id': 'f-a'}, {'client_id': 'b', 'finding_id': 'f-b'}]
        before = copy.deepcopy(rows)
        result = snapshot(client, 'cis-ig1', rows, evidence, findings, reviews=[{'client_id': 'a', 'review_id': 'review-a'}])
        detail = result['assessments'][0]
        self.assertEqual(detail['current_implementation'], row['implementation'])
        self.assertEqual(detail['evidence'], [{'id': 'same', 'title': 'Reference.pdf'}, {'id': 'inherited', 'title': 'Inherited.pdf'}])
        self.assertEqual([i['state'] for i in detail['items_to_address']], ['open', 'resolved'])
        self.assertEqual(detail['items_to_address'][0]['finding_id'], 'f-a')
        self.assertIsNone(detail['items_to_address'][1]['finding_id'])
        self.assertEqual(detail['items_revision'], 7)
        self.assertEqual(rows, before)
        self.assertNotIn('SECRET', str(result))
        self.assertNotIn('unapproved.test', str(result))
        self.assertNotIn('Do not expose', str(result))

    def test_missing_duplicate_or_unsupported_native_data_fails_without_partial_report(self):
        client, rows = fixture()
        for bad in (rows[:-1], rows + [rows[0]], [{**r, 'status': 'unknown'} if i == 0 else r for i, r in enumerate(rows)],
                    [{**r, 'framework_version': 'old'} if i == 0 else r for i, r in enumerate(rows)]):
            with self.assertRaises(HTTPException) as raised:
                snapshot(client, 'cis-ig1', bad)
            self.assertEqual(raised.exception.status_code, 409)

    def test_soc_judgment_date_not_draft_date_and_timezone_and_month_boundaries(self):
        client, rows = fixture('soc-2')
        client['timezone'] = 'America/New_York'
        rows[0].update(status='addressed', last_assessed='2026-10-01T23:30:00Z')
        rows[1].update(status='in_progress', last_assessed='2026-10-03T00:30:00Z', assessment_recorded_at='2026-10-02T00:30:00Z')
        result = snapshot(client, 'soc-2', rows)
        self.assertIsNone(result['assessments'][0]['last_assessed'])
        self.assertIn('Legacy assessment date unconfirmed', result['assessments'][0]['legacy_date_note'])
        self.assertEqual(result['assessments'][0]['assessment_basis'], 'Not recorded')
        self.assertTrue(result['assessments'][1]['last_assessed'].startswith('2026-10-01T20:30'))
        self.assertEqual(result['timezone'], 'America/New_York')
        self.assertEqual(result['generated_at'], '2026-10-13T11:00:00-04:00')
        self.assertEqual(reports.local_time('2026-10-02', reports.report_zone(client)[0]), '2026-10-02')
        self.assertEqual(reports.period_start(datetime(2024, 8, 31, tzinfo=timezone.utc), '6m').date().isoformat(), '2024-02-29')
        self.assertEqual(reports.period_start(datetime(2024, 2, 29, tzinfo=timezone.utc), '12m').date().isoformat(), '2023-02-28')

    def test_native_save_tokens_are_not_judgment_dates_and_source_method_is_explicit(self):
        for key in ('cis-ig1', 'iso-27001'):
            client, rows = fixture(key)
            rows[0].update(notes='Notes-only save', last_assessed='2026-10-12T12:00:00Z', last_saved='2026-10-12T12:00:00Z')
            rows[1].update(status='addressed', last_assessed='2026-10-11T12:00:00Z',
                guided_assessment_source={'origin': 'guided-assessment-pilot', 'version': 'saved-source'})
            value = snapshot(client, key, rows)
            self.assertIsNone(value['assessments'][0]['last_assessed'])
            self.assertIsNone(value['latest_assessment_at'])
            self.assertEqual(value['latest_record_saved_at'], '2026-10-12T12:00:00+00:00')
            self.assertEqual(value['assessments'][0]['assessment_basis'], 'Not recorded')
            self.assertEqual(value['assessments'][1]['assessment_basis'], 'Saved guided interview summary')
        client, rows = fixture('soc-2')
        rows[0].update(status='addressed', assessment_recorded_at='2026-10-01T12:00:00Z',
            last_saved='2026-10-12T12:00:00Z', last_assessed='2026-10-12T12:00:00Z')
        value = snapshot(client, 'soc-2', rows)
        self.assertEqual(value['assessments'][0]['last_assessed'], '2026-10-01T12:00:00+00:00')
        self.assertEqual(value['assessments'][0]['record_saved_at'], '2026-10-12T12:00:00+00:00')
        self.assertEqual(value['latest_assessment_at'], '2026-10-01T12:00:00+00:00')

    def test_trend_never_backdates_current_and_discloses_scope_changes(self):
        client, rows = fixture()
        for row in rows:
            row.update(status='addressed', assessment_history=[
                {'at': '2026-09-01T00:00:00Z', 'status': 'in_progress'},
                {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
        result = snapshot(client, 'cis-ig1', rows)
        self.assertEqual([o['implementation_percent'] for o in result['trend']['observations'] if not o.get('current_snapshot')], [None, None])
        self.assertEqual(result['trend']['state'], 'partial')
        rows[-1]['assessment_history'] = []
        incomplete = snapshot(client, 'cis-ig1', rows)
        self.assertEqual([point['known_count'] for point in incomplete['trend']['observations']], [55, 55, 56])
        self.assertEqual(incomplete['trend']['state'], 'partial')
        self.assertFalse(incomplete['trend']['comparable'])
        client['cis_configuration_updated_at'] = '2026-09-15T00:00:00Z'
        client['cis_scope_change'] = {'before': 2, 'after': 1, 'updated_at': '2026-09-15T00:00:00Z'}
        rows[-1]['assessment_history'] = copy.deepcopy(rows[0]['assessment_history'])
        changed = snapshot(client, 'cis-ig1', rows)
        self.assertEqual(len(changed['trend']['observations']), 2)
        self.assertTrue(changed['trend']['scope_changes'])

    def test_historical_applicability_denominator_changes_are_explicit(self):
        client, rows = fixture()
        for row in rows:
            row.update(status='addressed', assessment_history=[
                {'at': '2026-09-01T00:00:00Z', 'status': 'in_progress'},
                {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
        rows[0]['assessment_history'][0].update(status='not_applicable', na_rationale='Then out of scope')
        result = snapshot(client, 'cis-ig1', rows)
        self.assertEqual([p['applicable_total'] for p in result['trend']['observations']], [55, 56, 56])
        self.assertFalse(result['trend']['comparable'])
        self.assertIn('denominator', ' '.join(result['trend']['scope_changes']))

    def test_legacy_iso_history_does_not_borrow_current_applicability(self):
        client, rows = fixture('iso-27001')
        definitions = {d['id']: d for d in CATALOGS['iso-27001']['requirements']}
        for row in rows:
            row.update(status='addressed', assessment_history=[
                {'at': '2026-09-01T00:00:00Z', 'status': 'addressed'},
                {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
            if definitions[row['definition_id']]['specification'] == 'annex_control':
                row.update(soa_applicability='excluded', soa_justification='Current decision only')
        result = snapshot(client, 'iso-27001', rows)
        self.assertEqual([point['status_counts']['addressed'] for point in result['trend']['observations']], [123, 123, 123])
        self.assertEqual([point['implementation_percent'] for point in result['trend']['observations']], [None, None, 100.0])
        self.assertEqual(result['trend']['state'], 'partial')
        for row in rows:
            if definitions[row['definition_id']]['specification'] == 'annex_control':
                for event in row['assessment_history']:
                    event['soa_applicability'] = 'included'
                    event['soa_justification'] = 'Historical recorded inclusion'
        known = snapshot(client, 'iso-27001', rows)
        self.assertEqual([p['applicable_total'] for p in known['trend']['observations']], [123, 123, 30])
        self.assertEqual([p['implementation_percent'] for p in known['trend']['observations']], [None, None, 100.0])
        self.assertFalse(known['trend']['comparable'])
        self.assertEqual(known['summary']['applicable_total'], 30)

    def test_trend_density_uses_real_latest_month_dates_without_interpolation(self):
        client, rows = fixture()
        events = [{'at': f'2026-09-{day:02d}T00:00:00Z', 'status': 'in_progress'} for day in range(1, 31)]
        events.append({'at': '2026-10-01T00:00:00Z', 'status': 'addressed'})
        for row in rows:
            row.update(status='addressed', assessment_history=copy.deepcopy(events))
        result = snapshot(client, 'cis-ig1', rows)
        self.assertEqual([p['date'][:10] for p in result['trend']['observations']], ['2026-09-30', '2026-10-01', '2026-10-13'])
        daily = snapshot(client, 'cis-ig1', rows, period='30d')
        self.assertEqual(len(daily['trend']['observations']), 20)

    def test_event_history_retains_prior_dates_without_claiming_program_baseline_or_scope_comparison(self):
        client, rows = fixture()
        for row in rows:
            row.update(status='addressed', assessment_history=[
                {'at': '2026-03-01T00:00:00Z', 'status': 'in_progress'},
                {'at': '2026-10-01T00:00:00Z', 'status': 'addressed'}])
        value = snapshot(client, 'cis-ig1', rows)
        self.assertEqual(value['trend']['state'], 'partial')
        self.assertEqual(value['trend']['observations'][0]['date'][:10], '2026-03-01')
        self.assertFalse(value['trend']['observations'][0]['comparison_baseline'])
        self.assertTrue(value['trend']['observations'][0]['prior_period_observation'])
        self.assertFalse(value['trend']['comparable'])
        self.assertEqual([p['implementation_percent'] for p in value['trend']['observations']], [None, None, 100.0])
        rows[0]['assessment_history'][0].update(status='not_applicable', na_rationale='Historical recorded exclusion')
        rows[1]['status'] = 'not_applicable'
        rows[1]['na_rationale'] = 'Current decision'
        rows[1]['assessment_history'][1].update(status='not_applicable', na_rationale='Current decision')
        swapped = snapshot(client, 'cis-ig1', rows)
        self.assertEqual({p['applicable_total'] for p in swapped['trend']['observations']}, {55})
        self.assertFalse(swapped['trend']['comparable'])
        self.assertEqual([point['status_counts']['not_applicable'] for point in swapped['trend']['observations']], [1, 1, 1])

    def test_unknown_intermediate_iso_applicability_does_not_imply_complete_history(self):
        client, rows = fixture('iso-27001')
        definitions = {d['id']: d for d in CATALOGS['iso-27001']['requirements']}
        for row in rows:
            row.update(status='addressed', assessment_history=[{'at': '2026-03-01T00:00:00Z', 'status': 'addressed'}])
            if definitions[row['definition_id']]['specification'] == 'annex_control':
                row['soa_applicability'] = 'included'
                row['soa_justification'] = 'Current recorded inclusion'
                row['assessment_history'][0]['soa_applicability'] = 'included'
                row['assessment_history'][0]['soa_justification'] = 'Historical recorded inclusion'
        rows[-1]['assessment_history'].append({'at': '2026-10-01T00:00:00Z', 'status': 'addressed'})
        value = snapshot(client, 'iso-27001', rows)
        self.assertEqual(value['trend']['state'], 'partial')
        self.assertFalse(value['trend']['comparable'])
        self.assertFalse(value['trend']['observations'][0]['comparison_baseline'])
        self.assertTrue(value['trend']['observations'][0]['prior_period_observation'])
        self.assertIn('not recorded', ' '.join(value['trend']['scope_changes']))


class FrameworkReportRouteTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    async def prepare(self, key='cis-ig1', group=1):
        client, rows = fixture(key, group)
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': client})
        await server.db.requirements.insert_one({'client_id': 'a', 'baseline_key': key, 'baseline_response': 'applies'})
        await server.db.framework_assessments.insert_many(copy.deepcopy(rows))
        self.sign_in('admin')
        result = snapshot(client, key, rows)
        async def adapter(*args):
            return result, client
        self.mock_snapshot = patch.object(reports, 'read_snapshot', adapter)
        self.mock_snapshot.start()
        self.addCleanup(self.mock_snapshot.stop)
        return client, rows, result

    async def test_options_current_and_new_clients_and_native_configured_cis(self):
        await self.prepare(group=3)
        response = await self.client.get('/api/reports/frameworks', params={'client_id': 'a'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([(f['key'], f['name']) for f in response.json()['frameworks']], [('cis-ig1', 'CIS IG3')])
        empty = await self.client.get('/api/reports/frameworks', params={'client_id': 'b'})
        self.assertEqual(empty.json()['frameworks'], [])

    async def test_download_all_established_roles_and_no_mutation_and_fixed_snapshot(self):
        _, _, saved = await self.prepare()
        initial = await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None)
        def render(value, detail):
            self.assertEqual(value['source_hash'], saved['source_hash'])
            return b'%PDF-1.4\nsynthetic renderer boundary test'
        with patch('framework_report_pdf.render_framework_report', render):
            for role in ('super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer'):
                await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': role}})
                self.sign_in('member')
                response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue({'private', 'no-store'}.issubset({v.strip() for v in response.headers['cache-control'].split(',')}))
                self.assertIn('attachment;', response.headers['content-disposition'])
                self.assertTrue(response.content.startswith(b'%PDF'))
        self.assertEqual(initial, await server.db.framework_assessments.find({}, {'_id': 0}).to_list(None))
        audit = await server.db.audit_logs.find_one({'entity_type': 'framework-report'})
        self.assertEqual(audit['meta']['source_hash'], saved['source_hash'])
        self.assertNotIn('implementation', audit['meta'])

    async def test_auth_cross_client_invalid_requests_and_no_render_on_denial(self):
        await self.prepare()
        with patch('framework_report_pdf.render_framework_report') as render:
            self.sign_in('member')
            for path in ('/api/reports/frameworks', '/api/reports/framework'):
                response = await self.client.get(path, params={'client_id': 'b', 'framework_key': 'cis-ig1'})
                self.assertEqual(response.status_code, 403, response.text)
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'invented_admin'}})
            self.assertEqual((await self.client.get('/api/reports/frameworks', params={'client_id': 'a'})).status_code, 403)
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly', 'password_change_required': True}})
            self.assertEqual((await self.client.get('/api/reports/frameworks', params={'client_id': 'a'})).status_code, 403)
            self.client.headers.pop('Authorization')
            self.assertEqual((await self.client.get('/api/reports/frameworks', params={'client_id': 'a'})).status_code, 401)
            self.sign_in('admin')
            for change in ({'framework_key': 'cis-ig2'}, {'detail': 'word'}, {'trend_period': '5y'}):
                response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1', **change})
                self.assertEqual(response.status_code, 422, response.text)
            render.assert_not_called()

    async def test_delivery_rechecks_actor_scope_framework_and_evidence(self):
        _, _, saved = await self.prepare()
        original_role = 'client_readonly'
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': original_role}})
        self.sign_in('member')
        async def revoke(*args):
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'client_ids': []}})
            return b'%PDF'
        with patch.object(reports, 'run_in_threadpool', revoke):
            response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
            self.assertEqual(response.status_code, 403, response.text)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'client_ids': ['a']}})
        async def disable(*args):
            await server.db.requirements.update_one({'client_id': 'a'}, {'$set': {'baseline_response': 'does_not_apply'}})
            return b'%PDF'
        with patch.object(reports, 'run_in_threadpool', disable):
            response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
            self.assertEqual(response.status_code, 403, response.text)
        await server.db.requirements.update_one({'client_id': 'a'}, {'$set': {'baseline_response': 'applies'}})
        saved['assessments'][0]['evidence'] = [{'id': 'not-visible', 'title': 'Should not be delivered'}]
        with patch('framework_report_pdf.render_framework_report', return_value=b'%PDF'):
            response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
            self.assertEqual(response.status_code, 409, response.text)

    async def test_unsupported_font_is_actionable_and_snapshot_fails_closed(self):
        await self.prepare()
        with patch('framework_report_pdf.render_framework_report', side_effect=ValueError('unsupported glyph')):
            response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
            self.assertEqual(response.status_code, 422, response.text)
        self.mock_snapshot.stop()
        response = await self.client.get('/api/reports/framework', params={'client_id': 'a', 'framework_key': 'cis-ig1'})
        self.assertEqual(response.status_code, 503, response.text)
        self.assertIn('consistent database snapshot', response.json()['detail'])


@unittest.skipUnless(os.environ.get('FRAMEWORK_REPORT_TEST_MONGO'), 'Set FRAMEWORK_REPORT_TEST_MONGO to an isolated replica set to verify real Mongo snapshot isolation')
class FrameworkReportMongoSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        uri = os.environ['FRAMEWORK_REPORT_TEST_MONGO']
        self.mongo = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
        self.database_name = 'framework_report_test_' + uuid.uuid4().hex
        self.db = self.mongo[self.database_name]
        async def cleanup():
            await self.mongo.drop_database(self.database_name)
            self.mongo.close()
        self.addAsyncCleanup(cleanup)
        self.client, self.rows = fixture()
        self.actor = {'user_id': 'reader', 'status': 'active', 'role': 'client_readonly', 'client_ids': ['a']}
        await self.db.users.insert_one(self.actor.copy())
        await self.db.clients.insert_one(self.client.copy())
        await self.db.requirements.insert_one({'client_id': 'a', 'baseline_key': 'cis-ig1', 'baseline_response': 'applies'})
        await self.db.framework_assessments.insert_many(copy.deepcopy(self.rows))
        await self.db.evidence.insert_one({'evidence_id': 'reference', 'client_id': 'a', 'filename': 'Before.pdf',
            'linked_type': 'framework_assessment', 'linked_id': self.rows[0]['framework_assessment_id'], 'content_base64': 'DO NOT READ'})

    async def test_real_transaction_concurrent_assessment_and_evidence_edits_use_one_snapshot(self):
        actual = self.db
        injected = False
        class Cursor:
            def __init__(self, cursor):
                self.cursor = cursor
            async def to_list(inner, length):
                nonlocal injected
                # The actor/client reads already pinned the transaction timestamp.
                await actual.framework_assessments.update_one({'framework_assessment_id': self.rows[0]['framework_assessment_id']},
                    {'$set': {'status': 'addressed', 'implementation': 'Concurrent new state'}})
                await actual.evidence.update_one({'evidence_id': 'reference'}, {'$set': {'filename': 'After.pdf'}})
                injected = True
                return await inner.cursor.to_list(length)
        class Collection:
            def find(inner, *args, **kwargs):
                return Cursor(actual.framework_assessments.find(*args, **kwargs))
        wrapped = SimpleNamespace(client=actual.client, users=actual.users, clients=actual.clients,
            requirements=actual.requirements, framework_assessments=Collection(), evidence=actual.evidence,
            findings=actual.findings, reviews=actual.reviews)
        value, _ = await reports.read_snapshot(SimpleNamespace(db=wrapped), 'a', 'cis-ig1', self.actor, '6m')
        self.assertTrue(injected)
        self.assertEqual(value['assessments'][0]['status'], 'not_assessed')
        self.assertEqual(value['assessments'][0]['current_implementation'], '')
        self.assertEqual(value['assessments'][0]['evidence'], [{'id': 'reference', 'title': 'Before.pdf'}])
        self.assertEqual((await actual.framework_assessments.find_one({'framework_assessment_id': self.rows[0]['framework_assessment_id']}))['implementation'], 'Concurrent new state')
        self.assertEqual((await actual.evidence.find_one({'evidence_id': 'reference'}))['filename'], 'After.pdf')
        self.assertNotIn('DO NOT READ', str(value))

    async def test_real_snapshot_has_no_source_writes(self):
        await self.db.framework_assessments.update_one({'framework_assessment_id': self.rows[0]['framework_assessment_id']},
            {'$set': {'assessment_history': [{'at': '2026-09-01T00:00:00Z', 'status': 'not_assessed',
                'implementation': 'Unused prior narrative must not be loaded for a status trend'}]}})
        before = await self.db.framework_assessments.find({}).to_list(None)
        with patch.object(reports, 'build_snapshot', wraps=reports.build_snapshot) as adapter:
            first, _ = await reports.read_snapshot(SimpleNamespace(db=self.db), 'a', 'cis-ig1', self.actor, '30d')
            self.assertEqual(adapter.call_args.args[2][0]['assessment_history'],
                [{'at': '2026-09-01T00:00:00Z', 'status': 'not_assessed'}])
        second, _ = await reports.read_snapshot(SimpleNamespace(db=self.db), 'a', 'cis-ig1', self.actor, '12m')
        self.assertEqual(before, await self.db.framework_assessments.find({}).to_list(None))
        self.assertEqual(first['source_hash'], second['source_hash'])
        self.assertEqual(await self.db.audit_logs.count_documents({}), 0)
        self.assertIn('Consistent MongoDB read snapshot', first['source_cutoff'])

    async def test_real_snapshot_rechecks_role_membership_enabled_program_and_session_fences(self):
        service = SimpleNamespace(db=self.db)
        for patch_value, expected in (({'role': 'invented_role'}, 403), ({'client_ids': ['b']}, 403),
                                      ({'sessions_revoked_at': '2026-10-13T00:00:00Z'}, 401)):
            await self.db.users.update_one({'user_id': 'reader'}, {'$set': patch_value})
            with self.assertRaises(HTTPException) as raised:
                await reports.read_snapshot(service, 'a', 'cis-ig1', self.actor, '6m')
            self.assertEqual(raised.exception.status_code, expected)
            await self.db.users.replace_one({'user_id': 'reader'}, self.actor.copy())
        await self.db.requirements.update_one({'client_id': 'a'}, {'$set': {'baseline_response': 'does_not_apply'}})
        with self.assertRaises(HTTPException) as raised:
            await reports.read_snapshot(service, 'a', 'cis-ig1', self.actor, '6m')
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
