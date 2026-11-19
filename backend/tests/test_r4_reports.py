"""Native R4 report handlers with synthetic source reads; no durability claim."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import csv
import io
import json
import re
import unittest
from unittest.mock import AsyncMock, patch
import xml.etree.ElementTree as ET
import zipfile

from fastapi import HTTPException

import test_client_dashboard_sources as fixtures
import test_framework_reports as framework_fixtures
import test_framework_report_pdf as pdf_fixtures
import framework_reports
import r4_reports as reports
from r4_report_pdf import render_report

server = fixtures.server


def pdf_dto(client='R4 synthetic client A'):
    return {'header': {'client': {'id': client, 'name': client},
                      'program': {'key': 'cis-ig1', 'name': 'CIS IG1', 'version': '8.1'},
                      'title': 'Risk register', 'as_of': '2026-11-19',
                      'prepared_by': {'id': 'synthetic-preparer', 'name': 'Synthetic preparer'},
                      'lead': {'id': 'synthetic-lead', 'name': 'Synthetic lead'}, 'qualifier': reports.QUALIFIER},
            'stats': [{'label': 'Saved count', 'value': 1, 'detail': 'Actual synthetic source'}],
            'sections': [{'title': 'Saved risks', 'columns': ['ID', 'Saved text'], 'rows': [['r4-id', 'Saved native value']]}],
            'provenance': {'source_hash': 'synthetic', 'consistency': 'Isolated test fixture'}}


class R4ReportFormatTests(unittest.TestCase):
    def test_exact_six_report_type_and_framework_format_contract(self):
        for key in framework_reports.REPORT_KEYS:
            for report_type in ('assessment', 'executive'):
                self.assertEqual(reports.formats(key, report_type), ('pdf',))
            self.assertEqual(reports.formats(key, 'scope'), ('pdf',) if key == 'soc-2' else ('pdf', 'xlsx'))
            for report_type in ('risks', 'vendors', 'policies'):
                self.assertEqual(reports.formats(key, report_type), ('pdf', 'csv'))
        with self.assertRaises(HTTPException):
            reports.formats('cis-ig1', 'unknown')

    def test_csv_retains_complete_records_and_uses_native_formula_protection(self):
        dto = pdf_dto()
        dto['sections'][0]['rows'] = [['first', '=HYPERLINK("https://example.test")'],
                                    ['second', 'Comma, newline\nretained'], ['last', None]]
        rows = list(csv.reader(io.StringIO(reports.render_csv(dto).decode('utf-8-sig'))))
        self.assertIn(['first', '\'=HYPERLINK("https://example.test")'], rows)
        self.assertIn(['second', 'Comma, newline\nretained'], rows)
        self.assertEqual(rows[-1], ['last', ''])
        self.assertIn(['Saved count', '1', 'Actual synthetic source'], rows)

    def test_xlsx_is_a_real_package_with_literal_cells_and_no_formulas(self):
        dto = pdf_dto()
        dto['sections'][0]['rows'] = [['=SUM(1,2)', 'Unicode Ω and <literal> & content'], ['last', 'Final saved record']]
        content = reports.render_xlsx(dto)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(len(archive.namelist()), 5)
            for name in archive.namelist():
                ET.fromstring(archive.read(name))
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            cells = [element.text for element in sheet.findall('.//s:t', ns)]
            self.assertIn('=SUM(1,2)', cells)
            self.assertIn('Unicode Ω and <literal> & content', cells)
            self.assertEqual(cells[-1], 'Final saved record')
            self.assertFalse(sheet.findall('.//s:f', ns))
        dto['sections'][0]['rows'][0][1] = 'Unsupported\x00value'
        with self.assertRaises(ValueError):
            reports.render_xlsx(dto)
        dto['sections'][0]['rows'] = [['capacity', 'x' * 32767]]
        with zipfile.ZipFile(io.BytesIO(reports.render_xlsx(dto))) as archive:
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            self.assertEqual(sheet.findall('.//s:t', ns)[-1].text, 'x' * 32767)
        for oversized in ('x' * 32768, '\U0001f600' * 16384):
            dto['sections'][0]['rows'][0][1] = oversized
            with self.subTest(units=len(oversized.encode('utf-16-le')) // 2), self.assertRaises(ValueError):
                reports.render_xlsx(dto)

    def test_pdf_contains_actual_values_and_treats_saved_markup_as_plain_text(self):
        dto = pdf_dto()
        dto['sections'][0]['rows'][0][1] = 'Saved <b>literal</b> & text'
        content = render_report(dto)
        self.assertTrue(content.startswith(b'%PDF-'))
        text = pdf_fixtures.pdf_streams(content)
        for value in (b'R4 synthetic client A', b'Synthetic preparer', b'Synthetic lead',
                      b'Saved <b>literal</b> & text', b'r4-id'):
            self.assertIn(value, text)
        dto['sections'][0]['rows'][0][1] = 'Unsupported \U0001f984'
        with self.assertRaises(ValueError):
            render_report(dto)

    def test_pdf_long_row_and_final_record_survive_pagination(self):
        dto = pdf_dto()
        dto['sections'][0]['rows'] = [['long', 'Saved detailed work. ' * 1200 + 'R4_LONG_ROW_END'],
                                    ['final', 'R4_FINAL_RECORD']]
        content = render_report(dto)
        text = pdf_fixtures.pdf_streams(content)
        self.assertIn(b'R4_LONG_ROW_END', text)
        self.assertIn(b'R4_FINAL_RECORD', text)
        self.assertGreater(len(re.findall(rb'/Type\s*/Page\b', content)), 1)

    def test_concurrent_pdf_renders_keep_client_content_separate(self):
        first, second = pdf_dto('R4 CLIENT ALPHA'), pdf_dto('R4 CLIENT BRAVO')
        with ThreadPoolExecutor(max_workers=2) as pool:
            rendered = list(pool.map(render_report, (first, second)))
        alpha, bravo = (pdf_fixtures.pdf_streams(content) for content in rendered)
        self.assertIn(b'R4 CLIENT ALPHA', alpha)
        self.assertNotIn(b'R4 CLIENT BRAVO', alpha)
        self.assertIn(b'R4 CLIENT BRAVO', bravo)
        self.assertNotIn(b'R4 CLIENT ALPHA', bravo)


class R4ReportRouteTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixtures.ClientDashboardSourcesTests.sign_in

    async def prepare(self, key='cis-ig1'):
        client, rows = framework_fixtures.fixture(key)
        client.update(name='Native synthetic report client', assigned_owner_id='member', timezone='Pacific/Honolulu')
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': client})
        await server.db.requirements.update_one({'client_id': 'a', 'baseline_key': key},
                                                {'$set': {'baseline_response': 'applies'}}, upsert=True)
        await server.db.framework_assessments.insert_many(deepcopy(rows))
        self.sign_in('admin')

        async def framework_adapter(s, cid, framework_key, actor, period):
            stored_client = await s.db.clients.find_one({'client_id': cid}, {'_id': 0})
            saved = await s.db.framework_assessments.find({'client_id': cid, 'framework_key': framework_key}, {'_id': 0}).to_list(None)
            evidence = await s.db.evidence.find({'client_id': cid}, {'_id': 0}).to_list(None)
            findings = await s.db.findings.find({'client_id': cid}, {'_id': 0}).to_list(None)
            reviews = await s.db.reviews.find({'client_id': cid}, {'_id': 0}).to_list(None)
            now = datetime.now(timezone.utc)
            return framework_reports.build_snapshot(stored_client, framework_key, saved, evidence, findings,
                now, period, (now.isoformat(), now.isoformat()), 'synthetic nontransactional fixture', reviews), stored_client

        async def operational_adapter(s, cid, framework_key, actor):
            return await reports.read_operational(s, cid, framework_key, actor)

        first = patch.object(framework_reports, 'read_snapshot', framework_adapter)
        second = patch.object(reports, 'operational_snapshot', operational_adapter)
        first.start()
        second.start()
        self.addCleanup(first.stop)
        self.addCleanup(second.stop)
        return client, rows

    def params(self, report_type='assessment', key='cis-ig1'):
        return {'client_id': 'a', 'framework_key': key, 'type': report_type}

    async def export(self, report_type='risks', output_format='csv', intent='r4-report-export-intent'):
        return await self.client.post('/api/reports/exports',
            json={**self.params(report_type), 'format': output_format}, headers={'Idempotency-Key': intent})

    async def test_preview_uses_actual_actor_lead_scope_and_never_invents_historical_as_of(self):
        await self.prepare()
        response = await self.client.get('/api/reports/preview', params=self.params())
        self.assertEqual(response.status_code, 200, response.text)
        dto = response.json()
        self.assertEqual(dto['header']['prepared_by'], {'id': 'admin', 'name': 'admin'})
        self.assertEqual(dto['header']['lead'], {'id': 'member', 'name': 'member'})
        self.assertEqual(dto['header']['client']['name'], 'Native synthetic report client')
        expected = datetime.now(framework_reports.report_zone({'timezone': 'Pacific/Honolulu'})[0]).date().isoformat()
        self.assertEqual(dto['header']['as_of'], expected)
        self.assertIn('Separate framework and operational', dto['provenance']['consistency'])
        previous = datetime.fromisoformat(expected).date() - timedelta(days=1)
        denied = await self.client.get('/api/reports/preview', params={**self.params(), 'as_of': previous.isoformat()})
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await server.db.report_exports.count_documents({}), 0)

    async def test_all_six_types_and_soc_owner_come_from_saved_records(self):
        await self.prepare('soc-2')
        row = await server.db.framework_assessments.find_one({'client_id': 'a', 'framework_key': 'soc-2'})
        await server.db.framework_assessments.update_one({'_id': row['_id']}, {'$set': {'owner_id': 'member'}})
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Saved real risk title',
                                         'status': 'assessed', 'likelihood_score': 2, 'impact_score': 3})
        await server.db.vendors.insert_one({'vendor_id': 'vendor-a', 'client_id': 'a', 'name': 'Saved vendor', 'status': 'active'})
        await server.db.policies.insert_one({'policy_id': 'policy-a', 'client_id': 'a', 'title': 'Saved policy', 'version': '7'})
        for report_type in ('assessment', 'executive', 'scope', 'risks', 'vendors', 'policies'):
            with self.subTest(report_type=report_type):
                response = await self.client.get('/api/reports/preview', params=self.params(report_type, 'soc-2'))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.json()['sections'])
                if report_type == 'scope':
                    detail = next(item for item in response.json()['sections'][0]['rows'] if item[0] == row['definition_id'])
                    self.assertEqual(detail[3], 'member')
                    self.assertEqual(detail[2], framework_reports.CATALOGS['soc-2']['categories']['security'])
                if report_type == 'risks':
                    self.assertEqual(response.json()['sections'][0]['rows'][0][1:3], ['Saved real risk title', 6])
                self.assertEqual(response.json()['allowed_formats'], list(reports.formats('soc-2', report_type)))

    async def test_executive_overdue_work_uses_saved_calendar_days_without_mixing_date_types(self):
        await self.prepare()
        today = datetime.now(framework_reports.report_zone({'timezone': 'Pacific/Honolulu'})[0]).date()
        past, future = (today - timedelta(days=1)).isoformat(), (today + timedelta(days=1)).isoformat()
        await server.db.tasks.insert_many([
            {'task_id': 'past', 'client_id': 'a', 'title': 'Past Action', 'status': 'open', 'due_date': past + 'T23:30:00-10:00'},
            {'task_id': 'future', 'client_id': 'a', 'title': 'Future Action', 'status': 'open', 'due_date': future},
            {'task_id': 'done', 'client_id': 'a', 'title': 'Completed Action', 'status': 'done', 'due_date': past},
            {'task_id': 'unscheduled', 'client_id': 'a', 'title': 'Unscheduled Action', 'status': 'open'},
        ])
        await server.db.reviews.insert_one({'review_id': 'past-review', 'client_id': 'a', 'title': 'Past Review',
                                           'status': 'upcoming', 'due_date': past, 'recurrence': 'annual'})
        response = await self.client.get('/api/reports/preview', params=self.params('executive'))
        self.assertEqual(response.status_code, 200, response.text)
        overdue = next(item for item in response.json()['sections'] if item['title'] == 'Overdue work')
        self.assertEqual({row[0] for row in overdue['rows']}, {'Past Action', 'Past Review'})
        self.assertTrue(all(row[3] == past for row in overdue['rows']))

    async def test_vendor_provisional_criticality_retains_source_and_unknown_confirmation(self):
        await self.prepare()
        await server.db.vendors.insert_one({'vendor_id': 'provisional-provider', 'client_id': 'a', 'name': 'Synthetic provider',
            'criticality': 'high', 'criticality_provisional': True,
            'source_services': {'area_ids': ['governance'], 'qualification': 'Confirm actual business impact; assurance is not inferred'}})
        response = await self.client.get('/api/reports/preview', params=self.params('vendors'))
        self.assertEqual(response.status_code, 200, response.text)
        recorded = response.json()['sections'][0]['rows'][0][1]
        self.assertTrue(recorded.startswith('high (provisional)'))
        self.assertIn('assurance is not inferred', recorded)
        self.assertNotIn('Confirmed at', recorded)
        self.assertNotIn('Confirmed by', recorded)
        self.assertEqual(len(response.json()['sections']), 1)

    async def test_vendor_artifact_statuses_preserve_required_flag_and_custom_window(self):
        await self.prepare()
        today = date.today()
        for status, days in (('expired', -1), ('missing', 200), ('current', 200), ('due soon', 100)):
            await server.db.vendors.insert_one({'vendor_id': 'assurance-' + status, 'client_id': 'a', 'name': status,
                'assurance_required': True, 'assurance_window_days': 120,
                'assurance_records': [{'type': 'SOC 2', 'received_at': (today - timedelta(days=10)).isoformat(),
                                      'refresh_due': (today + timedelta(days=days)).isoformat(),
                                      'evidence_ids': [] if status == 'missing' else ['synthetic-assurance-proof']}]})
        response = await self.client.get('/api/reports/preview', params=self.params('vendors'))
        self.assertEqual(response.status_code, 200, response.text)
        actual = {row[0]: row[3] for row in response.json()['sections'][0]['rows']}
        for status in ('expired', 'missing', 'current', 'due soon'):
            self.assertEqual(actual[status], 'SOC 2: ' + status)

    async def test_pending_ownership_after_framework_read_is_rejected_before_preview_delivery(self):
        _, rows = await self.prepare()
        original = framework_reports.read_snapshot

        async def pending_after_snapshot(*args):
            result = await original(*args)
            await server.db.framework_assessments.update_one({'framework_assessment_id': rows[0]['framework_assessment_id']},
                {'$set': {'owner_id': 'member', '_r4_context_pending': 'synthetic-pending-context'}})
            return result

        guard = AsyncMock(side_effect=AssertionError('Pending ownership must be rejected before the final source guard'))
        with patch.object(framework_reports, 'read_snapshot', pending_after_snapshot), patch.object(reports, 'generation_guard', guard):
            response = await self.client.get('/api/reports/preview', params=self.params())
        self.assertEqual(response.status_code, 409, response.text)
        guard.assert_not_called()
        saved = await server.db.framework_assessments.find_one({'framework_assessment_id': rows[0]['framework_assessment_id']})
        self.assertEqual(saved['_r4_context_pending'], 'synthetic-pending-context')
        self.assertEqual(await server.db.report_exports.count_documents({}), 0)

    async def test_percentage_display_and_counts_use_the_native_applicable_measure(self):
        _, rows = await self.prepare()
        await server.db.framework_assessments.update_one({'framework_assessment_id': rows[0]['framework_assessment_id']},
                                                       {'$set': {'status': 'addressed'}})
        response = await self.client.get('/api/reports/preview', params=self.params())
        self.assertEqual(response.status_code, 200, response.text)
        dto = response.json()
        self.assertEqual(dto['stats'][0]['value'], f'{100 / len(rows):.1f}%')
        self.assertTrue(dto['stats'][0]['detail'].startswith('1 of ' + str(len(rows))))
        self.assertEqual(dto['provenance']['implementation_position']['implemented'], 1)
        self.assertEqual(dto['provenance']['implementation_position']['denominator'], 56)
        self.assertEqual(dto['provenance']['implementation_position']['percentage'], (1 / len(rows)) * 100)
        _, iso_rows = await self.prepare('iso-27001')
        annex = [row for row in iso_rows if row['definition_id'].startswith('A.')]
        await server.db.framework_assessments.update_many(
            {'framework_assessment_id': {'$in': [row['framework_assessment_id'] for row in annex]}},
            {'$set': {'soa_applicability': 'included', 'soa_justification': 'Synthetic explicit inclusion'}})
        await server.db.framework_assessments.update_one({'framework_assessment_id': annex[0]['framework_assessment_id']},
            {'$set': {'status': 'needs_attention', 'soa_applicability': 'excluded', 'soa_justification': 'Synthetic explicit exclusion'}})
        response = await self.client.get('/api/reports/preview', params=self.params(key='iso-27001'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['stats'][2]['value'], 0)
        self.assertEqual(response.json()['stats'][3]['value'], len(iso_rows) - 1)

    async def test_read_only_export_history_and_download_are_real_and_tenant_scoped(self):
        await self.prepare()
        await server.db.users.insert_one({'user_id': 'report-reader', 'email': 'report-reader@example.test',
                                         'name': 'Report reader', 'role': 'client_readonly', 'client_ids': ['a'], 'status': 'active'})
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Persisted report value', 'status': 'open'})
        await server.db.risks.insert_one({'risk_id': 'risk-b', 'client_id': 'b', 'title': 'PRIVATE OTHER TENANT', 'status': 'open'})
        self.sign_in('report-reader')
        response = await self.export()
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()
        download = await self.client.get(saved['download_url'])
        self.assertEqual(download.status_code, 200, download.text)
        self.assertEqual(len(download.content), saved['bytes'])
        self.assertIn(b'Persisted report value', download.content)
        self.assertNotIn(b'PRIVATE OTHER TENANT', download.content)
        self.assertNotIn(b'Persisted report value', (await self.client.get('/api/reports/history', params=self.params())).content)
        history = await self.client.get('/api/reports/history', params=self.params())
        self.assertEqual(history.json()['exports'], [saved])
        await server.db.clients.update_one({'client_id': 'a'}, {'$set': {'framework_settings.cis-ig1.implementation_group': 3}})
        historical = await self.client.get(saved['download_url'])
        self.assertEqual(historical.status_code, 200, historical.text)
        self.assertEqual(historical.content, download.content)
        await server.db.users.update_one({'user_id': 'report-reader'}, {'$set': {'client_ids': ['b']}})
        denied = await self.client.get(saved['download_url'])
        self.assertEqual(denied.status_code, 403, denied.text)

    async def test_routine_review_is_not_a_gap_but_open_corrective_work_is_retained(self):
        _, rows = await self.prepare()
        await server.db.framework_assessments.update_many({'client_id': 'a'}, {'$set': {'status': 'addressed'}})
        aid = rows[0]['framework_assessment_id']
        await server.db.reviews.insert_one({'review_id': 'routine', 'client_id': 'a', 'title': 'Scheduled operational review',
                                           'status': 'upcoming', 'framework_assessment_id': aid})
        response = await self.client.get('/api/reports/preview', params=self.params('scope'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['sections'][0]['rows'], [])
        await server.db.tasks.insert_one({'task_id': 'corrective', 'client_id': 'a', 'title': 'Actual corrective work',
                                         'status': 'open', 'framework_assessment_id': aid})
        response = await self.client.get('/api/reports/preview', params=self.params('scope'))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['sections'][0]['rows'][0][0], rows[0]['definition_id'])
        self.assertIn('Actual corrective work', response.json()['sections'][0]['rows'][0][4])
        await server.db.tasks.update_one({'task_id': 'corrective'}, {'$set': {'status': 'done'}})
        response = await self.client.get('/api/reports/preview', params=self.params('scope'))
        self.assertEqual(response.json()['sections'][0]['rows'], [])

    async def test_partial_audit_recovery_and_exact_replay_preserve_original_bytes(self):
        await self.prepare()
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Original exported value', 'status': 'open'})
        audit = server.audit

        async def fail_report_audit(user, action, entity_type, *args, **kwargs):
            if entity_type == 'report-export':
                raise RuntimeError('Synthetic report audit interruption')
            return await audit(user, action, entity_type, *args, **kwargs)

        with patch.object(server, 'audit', fail_report_audit):
            failed = await self.export()
        self.assertEqual(failed.status_code, 503, failed.text)
        original = await server.db.report_exports.find_one({})
        await server.db.risks.update_one({'risk_id': 'risk-a'}, {'$set': {'title': 'Later saved value'}})
        with patch.object(reports, 'render', side_effect=AssertionError('A retained export must never rerender')):
            recovered = await self.export()
            replay = await self.export()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(replay.json(), recovered.json())
        self.assertEqual(await server.db.report_exports.count_documents({}), 1)
        download = await self.client.get(recovered.json()['download_url'])
        self.assertEqual(download.content, original['content'])
        self.assertIn(b'Original exported value', download.content)
        self.assertNotIn(b'Later saved value', download.content)

    async def test_source_change_after_render_rejects_before_export_write(self):
        await self.prepare()
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Before', 'status': 'open'})
        threadpool = reports.run_in_threadpool

        async def concurrent_change(function, *args):
            content = await threadpool(function, *args)
            await server.db.risks.update_one({'risk_id': 'risk-a'}, {'$set': {'title': 'Concurrent change'}})
            return content

        with patch.object(reports, 'run_in_threadpool', concurrent_change):
            response = await self.export()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(await server.db.report_exports.count_documents({}), 0)

    async def test_revoked_actor_after_render_cannot_receive_or_repair_an_export(self):
        await self.prepare()
        threadpool = reports.run_in_threadpool

        async def revoke(function, *args):
            content = await threadpool(function, *args)
            await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'status': 'disabled'}})
            return content

        with patch.object(reports, 'run_in_threadpool', revoke):
            response = await self.export()
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(await server.db.report_exports.count_documents({}), 0)
        self.assertEqual((await self.export()).status_code, 401)

    async def test_format_spoofing_and_retained_content_corruption_fail_closed(self):
        await self.prepare()
        invalid = await self.export('assessment', 'csv', 'r4-invalid-format')
        self.assertEqual(invalid.status_code, 422, invalid.text)
        forged = await self.client.post('/api/reports/exports', json={**self.params('risks'), 'format': 'csv',
            'prepared_by': {'id': 'member'}}, headers={'Idempotency-Key': 'r4-forged-actor-identity'})
        self.assertEqual(forged.status_code, 422, forged.text)
        saved = await self.export()
        self.assertEqual(saved.status_code, 200, saved.text)
        await server.db.report_exports.update_one({'export_id': saved.json()['export_id']}, {'$set': {'content': b'corrupted'}})
        denied = await self.client.get(saved.json()['download_url'])
        self.assertEqual(denied.status_code, 409, denied.text)
        replay = await self.export()
        self.assertEqual(replay.status_code, 409, replay.text)

    async def test_pdf_export_uses_real_renderer_and_glyph_failure_retains_no_file(self):
        await self.prepare()
        await server.db.risks.insert_one({'risk_id': 'risk-a', 'client_id': 'a', 'title': 'Saved PDF risk value', 'status': 'open'})
        exported = await self.export('risks', 'pdf', 'r4-native-pdf-file')
        self.assertEqual(exported.status_code, 200, exported.text)
        downloaded = await self.client.get(exported.json()['download_url'])
        self.assertTrue(downloaded.content.startswith(b'%PDF-'))
        self.assertIn(b'Saved PDF risk value', pdf_fixtures.pdf_streams(downloaded.content))
        await server.db.risks.update_one({'risk_id': 'risk-a'}, {'$set': {'title': 'Unsupported \U0001f984'}})
        denied = await self.export('risks', 'pdf', 'r4-invalid-glyph-pdf')
        self.assertEqual(denied.status_code, 422, denied.text)
        self.assertEqual(await server.db.report_exports.count_documents({}), 1)
