"""Native R4 report handlers with synthetic source reads; no durability claim."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import csv
import io
import json
from pathlib import Path
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


def native_shaped_public_cmmc_report():
    catalog_path = Path(__file__).resolve().parents[2] / 'shared' / 'catalogs' / 'cmmc.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    requirements = catalog['requirements']
    assessments = [
        {'id': item['id'], 'title': item['title'], 'assessment_id': 'synthetic-assessment-' + item['id'],
         'status': 'not_assessed', 'status_label': 'Not assessed', 'verification_state': 'Not verified',
         'items_to_address': []}
        for item in requirements]
    snapshot = {
        'framework': {'key': 'cmmc', 'name': 'CMMC', 'version': catalog['version']},
        'client_id': 'synthetic-public-cmmc-client',
        'client_name': 'R4 synthetic native-shaped CMMC pagination client',
        'generated_at': '2026-11-19T12:00:00+00:00',
        'source_hash': 'synthetic-public-framework-source', 'source_cutoff': '2026-11-19T12:00:00+00:00',
        'assessments': assessments,
        'summary': {
            'status_labels': {'addressed': 'Implemented', 'in_progress': 'In progress',
                              'needs_attention': 'Needs attention', 'not_assessed': 'Not assessed'},
            'applicable_status_counts': {'addressed': 0, 'in_progress': 0, 'needs_attention': 0, 'not_assessed': 110},
            'denominator_note': 'Synthetic applicable CMMC Level 2 requirements; no implementation claim.',
            'implementation_position': {'implemented': 0, 'denominator': 110, 'percentage': 0.0,
                'scope': {'applicability': {item['id']: 'included' for item in requirements}}}},
    }
    records = {'client': {'assigned_owner_id': 'synthetic-lead'},
        'users': [{'user_id': 'synthetic-preparer', 'name': 'Synthetic report preparer'},
                  {'user_id': 'synthetic-lead', 'name': 'Synthetic GRC lead'}],
        'risks': [], 'policies': [], 'findings': [], 'tasks': [], 'assessment_owners': [],
        'reviews': [{'review_id': 'synthetic-review-' + item['id'],
                     'title': 'Synthetic scheduled review for public requirement ' + item['id'],
                     'status': 'upcoming', 'framework_assessment_id': 'synthetic-assessment-' + item['id']}
                    for item in requirements]}
    operational = {'records': records, 'source_hash': 'synthetic-operational-source',
                   'read_started_at': '2026-11-19T12:00:00+00:00', 'read_completed_at': '2026-11-19T12:00:00+00:00'}
    return reports.build_preview(snapshot, operational, 'scope', {'user_id': 'synthetic-preparer'}), requirements


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

    def test_pdf_full_public_cmmc_scope_retains_contiguous_values_across_pages(self):
        catalog_path = Path(__file__).resolve().parents[2] / 'shared' / 'catalogs' / 'cmmc.json'
        catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
        requirements = catalog['requirements']
        self.assertEqual(len(requirements), 110)
        self.assertEqual(len({item['id'] for item in requirements}), 110)
        dto = pdf_dto('R4 synthetic public CMMC pagination client')
        dto['header'].update(title='Synthetic CMMC scope',
                             program={'key': 'cmmc', 'name': 'CMMC', 'version': catalog['version']})
        dto['stats'] = [{'label': 'Catalog rows', 'value': 110, 'detail': 'Public definitions; synthetic scope only'}]
        dto['sections'] = [{'title': 'Synthetic public CMMC scope',
                            'columns': ['ID', 'Title', 'Control', 'Scope', 'Reason'],
                            'rows': [[item['id'], item['title'], item['control_name'],
                                      'Synthetic scope', 'Synthetic scope reason; no implementation claim']
                                     for item in requirements]}]
        rows = dto['sections'][0]['rows']
        self.assertEqual(len(rows), 110)
        self.assertEqual([row[0] for row in rows], [item['id'] for item in requirements])
        self.assertEqual([row[1] for row in rows], [item['title'] for item in requirements])
        original = deepcopy(dto)
        header = dto['header']
        values = [('header/client/name', header['client']['name']), ('header/title', header['title']),
                  ('header/program/name', header['program']['name']), ('header/program/version', header['program'].get('version')),
                  ('header/as_of', header['as_of']), ('header/qualifier', header['qualifier']),
                  ('header/prepared_by', header['prepared_by']['name'] or header['prepared_by']['id'] or 'Not recorded'),
                  ('header/lead', header['lead']['name'] or header['lead']['id'] or 'Not recorded')]
        for index, item in enumerate(dto['stats']):
            rendered = str(item['value']) if item['value'] is not None else 'Not recorded'
            values.extend([(f'stats/{index}/label_value', item['label'] + ': ' + rendered),
                           (f'stats/{index}/detail', item.get('detail'))])
        for index, section in enumerate(dto['sections']):
            values.append((f'sections/{index}/title', section['title']))
            values.extend((f'sections/{index}/columns/{column}', value)
                          for column, value in enumerate(section['columns']))
            values.extend((f'sections/{index}/rows/{row}/{column}', 'Not recorded' if value is None else str(value))
                          for row, cells in enumerate(section['rows']) for column, value in enumerate(cells))
        self.assertTrue(all(str(value).isascii() for _, value in values if value))

        def assert_complete_values(content):
            # Same contiguous-value predicate as the native probe: ignore only whitespace.
            text = pdf_fixtures.pdf_streams(content).decode('latin-1')
            compact = re.sub(r'\s+', '', text)
            for path, value in values:
                if value:
                    self.assertIn(re.sub(r'\s+', '', str(value)), compact, path)

        content = render_report(dto)
        self.assertTrue(content.startswith(b'%PDF-'))
        self.assertGreater(len(re.findall(rb'/Type\s*/Page\b', content)), 1)
        self.assertEqual(dto, original)
        assert_complete_values(content)
        omitted = deepcopy(dto)
        title = rows[0][1]
        self.assertEqual(sum(row[1] == title for row in rows), 1)
        omitted['sections'][0]['rows'][0][1] = 'Synthetic deliberately omitted description'
        omitted_original = deepcopy(omitted)
        with self.assertRaisesRegex(AssertionError, 'sections/0/rows/0/1'):
            assert_complete_values(render_report(omitted))
        self.assertEqual(omitted, omitted_original)
        self.assertEqual(dto, original)

    def test_pdf_native_shaped_cmmc_scope_keeps_all_public_values_contiguous(self):
        dto, requirements = native_shaped_public_cmmc_report()
        self.assertEqual(len(requirements), 110)
        self.assertEqual(len({item['id'] for item in requirements}), 110)
        self.assertEqual(dto['header']['title'], 'Requirement gap list')
        self.assertEqual(dto['sections'][0]['columns'], ['ID', 'Title', 'Status', 'Verification', 'Linked work'])
        self.assertEqual(len(dto['stats']), 4)
        rows = dto['sections'][0]['rows']
        self.assertEqual(len(rows), 110)
        self.assertEqual([row[0] for row in rows], [item['id'] for item in requirements])
        self.assertEqual([row[1] for row in rows], [item['title'] for item in requirements])
        self.assertTrue(all(row[4] == 'Review synthetic-review-' + row[0]
                            + ': Synthetic scheduled review for public requirement ' + row[0] + ' (upcoming)' for row in rows))
        self.assertTrue({'3.7.5', '3.13.12'}.issubset({row[0] for row in rows}))
        original = deepcopy(dto)
        header = dto['header']
        values = [('header/client/name', header['client']['name']), ('header/title', header['title']),
                  ('header/program/name', header['program']['name']), ('header/program/version', header['program'].get('version')),
                  ('header/as_of', header['as_of']), ('header/qualifier', header['qualifier']),
                  ('header/prepared_by', header['prepared_by']['name'] or header['prepared_by']['id'] or 'Not recorded'),
                  ('header/lead', header['lead']['name'] or header['lead']['id'] or 'Not recorded')]
        for index, item in enumerate(dto['stats']):
            rendered = str(item['value']) if item['value'] is not None else 'Not recorded'
            values.extend([(f'stats/{index}/label_value', item['label'] + ': ' + rendered),
                           (f'stats/{index}/detail', item.get('detail'))])
        for index, section in enumerate(dto['sections']):
            values.append((f'sections/{index}/title', section['title']))
            values.extend((f'sections/{index}/columns/{column}', value) for column, value in enumerate(section['columns']))
            values.extend((f'sections/{index}/rows/{row}/{column}', 'Not recorded' if value is None else str(value))
                          for row, cells in enumerate(section['rows']) for column, value in enumerate(cells))
        self.assertTrue(all(str(value).isascii() for _, value in values if value))

        def assert_complete_values(content):
            compact = re.sub(r'\s+', '', pdf_fixtures.pdf_streams(content).decode('latin-1'))
            for path, value in values:
                if value:
                    self.assertIn(re.sub(r'\s+', '', str(value)), compact, path)

        content = render_report(dto)
        self.assertTrue(content.startswith(b'%PDF-'))
        self.assertGreater(len(re.findall(rb'/Type\s*/Page\b', content)), 1)
        assert_complete_values(content)
        self.assertEqual(dto, original)
        omitted = deepcopy(dto)
        title = rows[0][1]
        self.assertEqual(sum(row[1] == title for row in rows), 1)
        omitted['sections'][0]['rows'][0][1] = 'Synthetic deliberately omitted description'
        omitted_original = deepcopy(omitted)
        with self.assertRaisesRegex(AssertionError, 'sections/0/rows/0/1'):
            assert_complete_values(render_report(omitted))
        self.assertEqual(omitted, omitted_original)
        self.assertEqual(dto, original)


    def test_pdf_used_frame_keeps_ordinary_row_whole_and_later_oversized_row_splits(self):
        import r4_report_pdf as pdf_renderer

        dto, requirements = native_shaped_public_cmmc_report()
        by_id = {row[0]: row for row in dto['sections'][0]['rows']}
        ordinary = deepcopy(by_id['3.7.5'])
        later_long_row = ['synthetic-later-long', 'Synthetic oversized linked-work row', 'Not assessed', 'Not verified',
                          'Saved detailed work. ' * 1200 + 'R4_LATER_LONG_ROW_END']
        final = ['synthetic-final', 'R4_FINAL_RECORD', 'Not assessed', 'Not verified', None]
        dto['sections'][0]['rows'] = [ordinary, *[deepcopy(by_id[item['id']]) for item in requirements if item['id'] != '3.7.5'],
                                      later_long_row, final]
        original = deepcopy(dto)
        self.assertEqual(len(dto['sections'][0]['rows']), 112)
        self.assertEqual(len({row[0] for row in dto['sections'][0]['rows']}), 112)
        frame_pressure = []
        captured_tables = []
        native_document = pdf_renderer.SimpleDocTemplate

        class LeavePartialOrdinaryRow(pdf_renderer.Spacer):
            def __init__(self, remaining):
                super().__init__(1, 0)
                self.remaining = remaining

            def wrap(self, width, height):
                self.height = height - self.remaining
                if self.height <= 0:
                    raise AssertionError('Synthetic frame pressure must consume positive space')
                frame_pressure.append({'available': height, 'remaining': self.remaining, 'consumed': self.height})
                return self.width, self.height

        class UsedFrameDocument(native_document):
            def build(self, story, *args, **kwargs):
                self._calc()
                table = next(item for item in story if isinstance(item, pdf_renderer.Table))
                table.wrap(self.width - 12, self.height - 12)
                header_height, ordinary_height = table._rowHeights[:2]
                if not 0 < ordinary_height < self.height - 12 - header_height:
                    raise AssertionError('The ordinary row must fit a fresh native frame')
                if table._rowHeights[-2] <= self.height - 12 - header_height:
                    raise AssertionError('The later row must genuinely require in-row splitting')
                captured_tables.append((table, self.width - 12, header_height + ordinary_height / 2))
                story.insert(story.index(table), LeavePartialOrdinaryRow(header_height + ordinary_height / 2))
                return super().build(story, *args, **kwargs)

        with patch.object(pdf_renderer, 'SimpleDocTemplate', UsedFrameDocument):
            content = render_report(dto)
        self.assertTrue(frame_pressure)
        self.assertTrue(all(item['consumed'] > 0 for item in frame_pressure))
        self.assertTrue(content.startswith(b'%PDF-'))
        text = pdf_fixtures.pdf_streams(content).decode('latin-1')
        compact = re.sub(r'\s+', '', text)
        # Ordinary-row contiguity remains exact. The declared oversized cell instead
        # retains the established split-row end/final-record contract, not a flat join.
        for column, value in enumerate(ordinary):
            self.assertIn(re.sub(r'\s+', '', str(value)), compact, f'ordinary/columns/{column}')
        self.assertIn('R4_LATER_LONG_ROW_END', compact)
        self.assertIn('R4_FINAL_RECORD', compact)
        self.assertLess(compact.index('R4_LATER_LONG_ROW_END'), compact.index('R4_FINAL_RECORD'))
        self.assertGreater(len(re.findall(rb'/Type\s*/Page\b', content)), 1)
        self.assertEqual(dto, original)
        # Outside a live Frame, the same native Table must retain ordinary ReportLab
        # fallback. Frame.add/split remove their temporary _frame attribute afterward.
        self.assertEqual(len(captured_tables), 1)
        table, width, partial_height = captured_tables[0]
        self.assertFalse(hasattr(table, '_frame'))
        self.assertEqual(len(table.split(width, partial_height)), 2)
        self.assertEqual(dto, original)

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

    async def test_materials_limit_saved_register_events_to_the_selected_workspace(self):
        await self.prepare()
        at = '2026-11-18T03:00:00Z'
        await server.db.clients.update_one({'client_id':'a'}, {'$set': {
            'profile.scope': {'statement':'Production boundary','systems':'Nominated billing platform','private':'Excluded note'},
            'profile_scope_confirmation': {'at':at,'by':'Account owner'}}})
        await server.db.policies.insert_many([
            {'client_id': 'a', 'policy_id': 'package-a', 'title': 'Access policy', 'status': 'approved',
             'decision_history': [{'action': 'external_approval_recorded', 'recorded_at': at,
                                   'subject': {'private': 'Confidential approval attachment'}}]},
            {'client_id': 'b', 'policy_id': 'package-b', 'title': 'Foreign policy', 'status': 'approved',
             'approved_at': at}])
        await server.db.reviews.insert_many([
            {'client_id': 'a', 'review_id': 'package-cis', 'title': 'Selected review', 'framework_key': 'cis-ig1',
             'occurrences': [{'completed_at': at}], 'completion_date': at[:10]},
            {'client_id': 'a', 'review_id': 'package-soc', 'title': 'Other program review',
             'framework_drivers': [{'framework_key': 'soc-2'}], 'completion_date': at}])
        await server.db.findings.insert_one({
            'client_id': 'a', 'finding_id': 'package-finding', 'review_id': 'package-cis',
            'status': 'remediated', 'decision_history': [{
                'action': 'rejected', 'at': at, 'note': 'Private rework rationale',
            }],
        })
        path = '/api/reports/materials'
        params = {'client_id': 'a', 'framework_key': 'cis-ig1'}
        response = await self.client.get(path, params=params)
        self.assertEqual(response.status_code, 200, response.text)
        bundle = response.json()
        self.assertEqual(set(bundle['reports']), {'assessment','executive','scope','risks','vendors','policies'})
        self.assertEqual(bundle['framework_key'], params['framework_key'])
        self.assertEqual(bundle['client_id'], params['client_id'])
        self.assertEqual(bundle['registers']['clients'][0]['profile']['scope'],
                         {'statement':'Production boundary','systems':'Nominated billing platform'})
        self.assertEqual(bundle['registers']['clients'][0]['profile_scope_confirmation']['at'], at)
        finding = next(row for row in bundle['registers']['findings'] if row['finding_id']=='package-finding')
        self.assertEqual(finding['decision_history'], [{'action':'rejected','at':at}])
        self.assertNotIn('Private rework rationale', response.text)
        self.assertEqual([row['event'] for row in bundle['register_history'] if row['record'] == 'Access policy'],
                         ['External approval recorded'])
        self.assertEqual([row['event'] for row in bundle['register_history'] if row['record'] == 'Selected review'],
                         ['Review completed'])
        self.assertNotIn('Confidential approval attachment', response.text)
        self.assertNotIn('Foreign policy', response.text)
        self.assertNotIn('Other program review', json.dumps(bundle['registers']))
        self.assertFalse(any(row['record'] == 'Other program review' for row in bundle['register_history']))
        await server.db.requirements.update_one({'client_id':'a','baseline_key':'cis-ig1'},{'$set':{'baseline_response':'excluded'}})
        self.assertEqual((await self.client.get(path, params=params)).status_code, 403)

    async def test_browser_delivery_audits_metadata_once_and_reauthorizes_retries(self):
        await self.prepare()
        body = {'client_id': 'a', 'framework_key': 'cis-ig1', 'kind': 'audit-package',
                'sha256': 'f' * 64, 'bytes': 812, 'period_start': '2026-01-01', 'period_end': '2026-11-24'}
        headers = {'Idempotency-Key': 'report-browser-delivery-synthetic'}
        path = '/api/reports/deliveries'
        first = await self.client.post(path, json=body, headers=headers)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual((await self.client.post(path, json=body, headers=headers)).json(), first.json())
        rows = await server.db.audit_logs.find({'entity_type': 'report-delivery'}).to_list(None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['entity_id'], first.json()['delivery_id'])
        self.assertEqual(rows[0]['meta']['browser_reported_sha256'], body['sha256'])
        self.assertEqual(rows[0]['meta']['event'], 'browser_download_requested')
        self.assertEqual((await self.client.post(path, json={**body,'bytes':813}, headers=headers)).status_code, 409)
        self.assertEqual((await self.client.post(path, json={**body,'bytes':0}, headers=headers)).status_code, 422)
        self.assertEqual((await self.client.post(path, json={**body,'kind':'delete'}, headers=headers)).status_code, 422)
        self.assertEqual((await self.client.post(path, json={**body,'period_end':'2025-12-30'}, headers=headers)).status_code, 422)
        await server.db.requirements.update_one({'client_id':'a','baseline_key':'cis-ig1'},{'$set':{'baseline_response':'excluded'}})
        self.assertEqual((await self.client.post(path, json=body, headers=headers)).status_code, 403)
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_type':'report-delivery'}), 1)

    async def test_register_workbook_delivery_is_scoped_typed_and_audited_once(self):
        await self.prepare()
        body = {'client_id': 'a', 'framework_key': 'cis-ig1', 'kind': 'register-workbook',
                'workbook': 'CIS-IG1-safeguard-register.xlsx', 'sha256': 'a' * 64, 'bytes': 813,
                'period_start': '2026-01-01', 'period_end': '2026-11-24'}
        headers = {'Idempotency-Key': 'approved-register-workbook-test'}
        path = '/api/reports/deliveries'
        for invalid in ({'workbook': 'SOC-2-criteria-matrix.xlsx'}, {'workbook': '../../private.xlsx'},
                        {'workbook': None}, {'kind': 'audit-package'}):
            self.assertEqual((await self.client.post(path, json={**body, **invalid}, headers=headers)).status_code, 422)
        response = await self.client.post(path, json=body, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['workbook'], body['workbook'])
        self.assertEqual((await self.client.post(path, json=body, headers=headers)).json(), response.json())
        rows = await server.db.audit_logs.find({'entity_type': 'report-delivery'}).to_list(None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['meta']['format'], 'xlsx')
        self.assertEqual(rows[0]['meta']['title'], body['workbook'])
        await server.db.requirements.update_one({'client_id':'a','baseline_key':'cis-ig1'},{'$set':{'baseline_response':'excluded'}})
        self.assertEqual((await self.client.post(path, json=body, headers=headers)).status_code, 403)

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

    async def test_review_followups_remain_scoped_after_review_closes_and_in_download(self):
        _, rows = await self.prepare()
        first = rows[0]['definition_id']
        await server.db.framework_assessments.insert_many([
            {'client_id': 'a', 'framework_key': 'cmmc', 'framework_assessment_id': 'other-program',
             'related_links': [{'kind': 'findings', 'id': 'narrowed'}]},
            {'client_id': 'b', 'framework_key': 'cmmc', 'framework_assessment_id': 'other-client',
             'related_links': [{'kind': 'findings', 'id': 'open-finding'}]}])
        await server.db.reviews.insert_one({'client_id': 'a', 'review_id': 'source', 'title': 'Finished review',
            'status': 'completed', 'framework_drivers': [{'framework_key': 'cis-ig1', 'framework_safeguards': [first]}]})
        findings = [('open-finding', 'open'), ('closed-finding', 'closed'), ('narrowed', 'open')]
        await server.db.findings.insert_many([{'client_id':'a','review_id':'source','finding_id':fid,
            'title':fid,'status':status} for fid,status in findings])
        tasks = [('corrective', 'closed-finding'), ('other-program-action', 'narrowed'), ('review-followup', None)]
        await server.db.tasks.insert_many([{'client_id':'a','review_id':'source','task_id':tid,
            'finding_id':fid,'title':tid,'status':'open'} for tid,fid in tasks])
        response = await self.client.get('/api/reports/preview', params=self.params('scope'))
        self.assertEqual(response.status_code, 200, response.text)
        details = {row[0]:row[4] for row in response.json()['sections'][0]['rows']}
        for text in ('Finding open-finding:', 'Action item corrective:', 'Action item review-followup:'):
            self.assertIn(text, details[first])
            self.assertFalse(any(text in (linked or '') for ident,linked in details.items() if ident != first))
        for text in ('closed-finding','narrowed','other-program-action','Finished review'):
            self.assertNotIn(text, details[first])
        saved = await self.export('scope','xlsx')
        self.assertEqual(saved.status_code, 200, saved.text)
        file = await self.client.get(saved.json()['download_url'])
        with zipfile.ZipFile(io.BytesIO(file.content)) as archive:
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            cells = [element.text for element in sheet.findall('.//{*}t')]
        self.assertIn(details[first], cells)

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
