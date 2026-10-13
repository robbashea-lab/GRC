"""Content and pagination regressions for the immutable snapshot renderer."""
import copy
import io
import re
import unittest
import zlib
from concurrent.futures import ThreadPoolExecutor

from framework_report_pdf import _Donut, _register_fonts, render_framework_report
from reportlab.pdfgen.canvas import Canvas


def fixture():
    return {
        'client_name': 'Example & Co. - Δοκιμή / Проверка', 'client_id': 'fixture-client',
        'framework': {'key': 'cis_ig3', 'name': 'CIS IG3', 'version': 'v8.1', 'scope': 'Recorded scope',
                      'unit_name': 'safeguards', 'group_name': 'Controls'},
        'generated_at': '2026-10-14T02:30:00Z', 'snapshot_at': '2026-10-13T20:00:00Z',
        'source_cutoff': '2026-10-14T02:30:00Z', 'source_hash': 'abc123', 'timezone': 'America/New_York',
        'summary': {'total': 2, 'applicable_total': 1, 'assessed': 1, 'not_assessed': 0,
                    'not_applicable': 1, 'status_counts': {'partial': 1, 'not_applicable': 1},
                    'applicable_status_counts': {'partial': 1},
                    'implementation_percent': 0, 'verification_counts': {'not_verified': 2},
                    'management_summary': 'One saved partial assessment; one not applicable.'},
        'groups': [{'id': '3', 'title': 'Data protection', 'total': 2,
                    'status_counts': {'partial': 1, 'not_applicable': 1}}],
        'assessments': [
            {'id': '3.5', 'title': 'Securely dispose of data', 'group_id': '3', 'group_title': 'Data protection',
             'status': 'partial', 'status_label': 'Partially implemented',
             'current_implementation': "First saved paragraph & exact <b>plain text</b>.\n\nControls in place\n- Existing recorded control\n* Second recorded control\nLast saved paragraph.",
             'verification_state': 'not_verified', 'last_assessed': '2026-10-13', 'assessment_basis': 'Reported',
             'evidence': [{'id': 'ev-allowed', 'title': 'Authorized reference'}],
             'items_to_address': [{'item_id': 'item-1', 'text': 'Saved checklist task', 'state': 'resolved',
                                   'notes': 'Saved notes', 'resolution': 'Saved resolution', 'finding_id': 'finding-1'}]},
            {'id': '3.6', 'title': 'Second safeguard', 'group_id': '3', 'group_title': 'Data protection',
             'status': 'not_applicable', 'status_label': 'Not applicable', 'current_implementation': '',
             'verification_state': 'not_verified', 'last_assessed': None, 'assessment_basis': '',
             'na_rationale': 'Saved not-applicable rationale', 'evidence': [], 'items_to_address': []},
        ],
        'trend': {'period': '6 months', 'state': 'unavailable', 'message': 'History unavailable.',
                  'observations': [], 'scope_changes': []},
    }


def pdf_streams(pdf):
    # The renderer compresses content streams with FlateDecode; this keeps tests dependency-free.
    streams = []
    for match in re.finditer(rb'<<(.*?)>>\s*stream\r?\n(.*?)endstream', pdf, re.DOTALL):
        header, content = match.groups()
        if b'/FlateDecode' not in header or b'/Length1' in header:
            continue
        if b'/ASCII85Decode' in header:
            import base64
            content = base64.a85decode(content.strip(), adobe=True)
        streams.append(zlib.decompress(content))
    content = b'\n'.join(streams)
    text = b''.join(re.findall(rb'\(((?:\\.|[^\\)])*)\)\s*Tj', content))
    return re.sub(rb'\\([\\()])', rb'\1', text)


class FrameworkReportPdfTests(unittest.TestCase):
    def test_native_overview_overflow_shares_its_continuation_with_progress(self):
        snapshot = fixture()
        snapshot['summary']['denominator_note'] = (
            'Implementation and assessed coverage use applicable saved assessment units; '
            'excluded units are shown separately. Saved-state distributions retain all native statuses.')
        snapshot['summary']['management_summary'] = (
            'Saved implementation and separate verification states do not establish independent '
            'effectiveness, certification, or an assurance opinion. ' * 4)
        snapshot['summary']['native_metrics'] = {
            'assessment_progress': {'total': 123, 'resolved': 31, 'valid_na': 0, 'invalid_na': 0, 'percent': 25},
            'clauses': {'total': 30, 'status_counts': {'implemented': 7, 'partial': 8, 'not_assessed': 15}},
            'soa': {'total': 93, 'included': 93, 'excluded': 0, 'undetermined': 0},
            'included_annex': {'total': 93, 'status_counts': {'implemented': 24, 'partial': 23, 'not_assessed': 46}},
        }
        content = pdf_streams(render_framework_report(snapshot, 'executive'))
        continuation = content.split(b'Source cutoff:', 1)[1].split(b'PROGRAM PROGRESS', 1)[0]
        self.assertNotRegex(continuation, rb'\d{2} / \d{2}')
        self.assertIn(b'Native framework measures', content)
        self.assertIn(b'Included Annex A controls', content)
        self.assertIn(b'History unavailable.', content)

    def test_concurrent_client_exports_preserve_each_authorized_snapshot(self):
        snapshots = [fixture(), fixture()]
        snapshots[0]['client_name'] = 'Only Client Alpha'
        snapshots[1]['client_name'] = 'Only Client Bravo'
        snapshots[0]['assessments'][0]['current_implementation'] = 'Alpha authorized saved narrative'
        snapshots[1]['assessments'][0]['current_implementation'] = 'Bravo authorized saved narrative'
        before = copy.deepcopy(snapshots)
        with ThreadPoolExecutor(max_workers=2) as workers:
            reports = list(workers.map(render_framework_report, snapshots))
        for index, report in enumerate(reports):
            content = pdf_streams(report)
            self.assertIn(snapshots[index]['client_name'].encode(), content)
            self.assertNotIn(snapshots[1-index]['client_name'].encode(), content)
            self.assertIn(snapshots[index]['assessments'][0]['current_implementation'].encode(), content)
            self.assertNotIn(snapshots[1-index]['assessments'][0]['current_implementation'].encode(), content)
        self.assertEqual(snapshots, before)

    def test_donut_preserves_not_applicable_status_in_adapter_scoped_distribution(self):
        _register_fonts()
        chart = _Donut({'addressed': 122, 'not_applicable': 1}, 99)
        drawing = Canvas(io.BytesIO(), pageCompression=0)
        chart.drawOn(drawing, 0, 0)
        content = drawing.getCurrentPageContent()
        self.assertIn('.584314 .529412 .701961 rg', content)
        self.assertIn('(99.0%)', content)

    def test_full_snapshot_preserves_plain_text_narrative_references_and_checklist(self):
        snapshot = fixture()
        before = copy.deepcopy(snapshot)
        pdf = render_framework_report(snapshot)
        self.assertTrue(pdf.startswith(b'%PDF-'))
        self.assertIn(b'%%EOF', pdf[-20:])
        content = pdf_streams(pdf)
        for text in ('First saved paragraph', '<b>plain text</b>', 'Controls in place', 'Existing recorded control',
                     'Second recorded control', 'Last saved paragraph', 'Authorized reference', 'ev-allowed',
                     'Saved checklist task', 'Saved notes', 'Saved resolution', 'finding-1',
                     'No saved current implementation narrative.', 'Saved not-applicable rationale',
                     'October 13, 2026, 22:30 EDT', 'History unavailable.'):
            self.assertIn(text.encode(), content, text)
        self.assertEqual(snapshot, before)
        self.assertNotIn(b'/Subtype /Link', pdf)

    def test_executive_excludes_saved_details_and_items(self):
        content = pdf_streams(render_framework_report(fixture(), 'executive'))
        self.assertIn(b'Controls', content)
        self.assertNotIn(b'Saved checklist task', content)
        self.assertNotIn(b'First saved paragraph', content)
        self.assertNotIn(b'Authorized reference', content)
        self.assertIn(b'Not applicable', content)

    def test_long_text_spills_without_losing_end_or_records_and_pages_are_numbered(self):
        snapshot = fixture()
        snapshot['assessments'][0]['title'] = 'Long assessment title ' * 20
        snapshot['assessments'][0]['current_implementation'] = ('Giant recorded narrative. ' * 1500) + 'NARRATIVE-END-MARKER'
        snapshot['groups'][0]['title'] = 'Long grouping title ' * 60
        content = pdf_streams(render_framework_report(snapshot))
        self.assertIn(b'NARRATIVE-END-MARKER', content)
        self.assertIn(b'Second safeguard', content)
        self.assertGreater(content.count(b'FRAMEWORK ASSESSMENT'), 8)
        self.assertIn(b'01 / ', content)
        self.assertIn(b'Identifier / grouping', content)

    def test_partial_history_records_coverage_and_scope_without_fake_values(self):
        snapshot = fixture()
        snapshot['trend'] = {'period': '30 days', 'state': 'partial', 'message': 'Only two records have historical events.',
                             'observations': [{'date': '2026-10-01', 'total': 2, 'known_count': 1, 'coverage': 50,
                                               'comparison_baseline': True, 'applicable_total': 1,
                                               'status_counts': {'partial': 1}, 'scope': 'Previous scope'}],
                             'scope_changes': ['Current scope differs from the saved observation.']}
        content = pdf_streams(render_framework_report(snapshot, 'executive'))
        self.assertIn(b'1 of 2 records known', content)
        self.assertIn(b'Current scope differs', content)
        self.assertIn(b'Previous scope', content)
        self.assertIn(b'Comparison baseline', content)
        self.assertIn(b'Applicable denominator: 1', content)

    def test_unknown_detail_and_unsupported_unicode_fail_explicitly(self):
        with self.assertRaisesRegex(ValueError, 'Unknown report detail'):
            render_framework_report(fixture(), 'unknown')
        snapshot = fixture()
        snapshot['assessments'][0]['current_implementation'] = 'Unsupported \U0001f680'
        with self.assertRaisesRegex(ValueError, r'U\+1F680'):
            render_framework_report(snapshot)

    def test_missing_client_timezone_uses_utc_and_displays_recording_note(self):
        snapshot = fixture()
        snapshot.pop('timezone')
        snapshot['timezone_note'] = 'Client timezone not recorded; UTC is used.'
        content = pdf_streams(render_framework_report(snapshot, 'executive'))
        self.assertIn(b'October 14, 2026, 02:30 UTC', content)
        self.assertIn(b'Client timezone not recorded; UTC is used.', content)

    def test_annex_applicability_absence_and_additional_saved_notes_are_explicit(self):
        snapshot = fixture()
        row = snapshot['assessments'][1]
        row.update(specification='annex_control', soa_applicability=None, notes='Saved legacy notes.\nSecond notes paragraph.')
        content = pdf_streams(render_framework_report(snapshot))
        self.assertIn(b'SoA applicability: Not yet determined', content)
        self.assertIn(b'Assessment specification: Annex A control', content)
        self.assertIn(b'Saved legacy notes.', content)
        self.assertIn(b'Second notes paragraph.', content)

    def test_native_save_timestamp_is_not_labeled_as_a_recorded_assessment(self):
        snapshot = fixture()
        snapshot.update(latest_assessment_at=None, latest_record_saved_at='2026-10-13T20:00:00Z')
        row = snapshot['assessments'][0]
        row.update(last_assessed=None, record_saved_at='2026-10-13T20:00:00Z', assessment_basis=None,
                   legacy_date_note='Legacy save timestamp does not confirm an assessment judgment date.')
        content = pdf_streams(render_framework_report(snapshot))
        self.assertIn(b'Latest recorded assessment: Not recorded', content)
        self.assertIn(b'Latest native record save: October 13, 2026, 16:00 EDT', content)
        self.assertIn(b'Assessment date: Not recorded', content)
        self.assertIn(b'Native record saved: October 13, 2026, 16:00 EDT', content)
        self.assertIn(b'Assessment basis: Not recorded', content)
        self.assertIn(b'Legacy save timestamp does not confirm', content)


if __name__ == '__main__':
    unittest.main()
