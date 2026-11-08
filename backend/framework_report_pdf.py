"""Render an authorized, immutable framework snapshot; never load source records."""
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    CondPageBreak, Flowable, HRFlowable, PageBreak, Paragraph,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)


INK = colors.HexColor('#22363d')
MUTED = colors.HexColor('#627581')
TEAL = colors.HexColor('#187787')
RULE = colors.HexColor('#d6e0e4')
PALETTE = {
    'implemented': '#228d78', 'addressed': '#228d78',
    'partial': '#ca9a40', 'in_progress': '#ca9a40', 'not_implemented': '#c46870', 'gap': '#c46870',
    'needs_attention': '#c46870',
    'not_assessed': '#afbdc4', 'not_applicable': '#9587b3',
}
STATUS_ORDER = ('implemented', 'addressed', 'partial', 'in_progress', 'not_implemented', 'gap', 'needs_attention', 'not_assessed', 'not_applicable')
DEFAULT_LABELS = {
    'implemented': 'Implemented', 'addressed': 'Addressed', 'partial': 'Partially implemented',
    'not_implemented': 'Not implemented', 'gap': 'Gap', 'not_assessed': 'Not assessed',
    'not_applicable': 'Not applicable', 'in_progress': 'In progress', 'needs_attention': 'Needs attention',
}
FONT = 'FrameworkReportSans'
BOLD = 'FrameworkReportSansBold'
_RENDER_LOCK = Lock()


def _register_fonts():
    if FONT not in pdfmetrics.getRegisteredFontNames():
        base = Path(__file__).with_name('fonts')
        pdfmetrics.registerFont(TTFont(FONT, str(base / 'LiberationSans-Regular.ttf')))
        pdfmetrics.registerFont(TTFont(BOLD, str(base / 'LiberationSans-Bold.ttf')))
        pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=FONT, boldItalic=BOLD)


def _text(value):
    return '' if value is None else str(value)


def _markup(value):
    # Saved strings are plain text, never executable ReportLab XML or image markup.
    text = _text(value)
    supported = pdfmetrics.getFont(FONT).face.charWidths
    for char in text:
        if char in '\n\r\t':
            continue
        if ord(char) not in supported or 0x590 <= ord(char) <= 0x8ff:
            raise ValueError(f'Report text contains an unsupported character (U+{ord(char):04X}).')
    return escape(text).replace('\t', '    ').replace('\n', '<br/>')


def _statuses(counts):
    return [key for key in STATUS_ORDER if key in counts] + sorted(set(counts) - set(STATUS_ORDER))


def _color(key):
    return colors.HexColor(PALETTE.get(key, '#187787'))


def _date(value, timezone_name):
    if not value:
        return 'Not recorded'
    try:
        parsed = datetime.fromisoformat(_text(value).replace('Z', '+00:00'))
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc if timezone_name == 'UTC' else ZoneInfo(timezone_name))
        return parsed.strftime('%B %d, %Y') if len(_text(value)) <= 10 else parsed.strftime('%B %d, %Y, %H:%M %Z')
    except ValueError:
        return _text(value)


def _styles():
    def style(name, size, leading, **kwargs):
        options = dict(fontName=FONT, fontSize=size, leading=leading, textColor=INK,
                       spaceAfter=7, splitLongWords=True)
        options.update(kwargs)
        return ParagraphStyle(name, **options)
    return {
        'body': style('report-body', 10, 14.5),
        'mini': style('report-mini', 8.5, 12, textColor=MUTED),
        'tiny': style('report-tiny', 7, 9, textColor=MUTED),
        'title': style('report-title', 28, 33, fontName=BOLD, spaceAfter=13, keepWithNext=True),
        'detail': style('report-detail', 20, 25, fontName=BOLD, spaceAfter=10, keepWithNext=True),
        'heading': style('report-heading', 12, 16, fontName=BOLD, spaceBefore=12, keepWithNext=True),
        'eyebrow': style('report-eyebrow', 8, 11, fontName=BOLD, textColor=TEAL, spaceAfter=9, keepWithNext=True),
        'bullet': style('report-bullet', 10, 14.5, leftIndent=12, firstLineIndent=-9),
        'cell': style('report-cell', 9, 12, spaceAfter=0),
        'cellhead': style('report-cellhead', 7.5, 10, fontName=BOLD, textColor=MUTED, spaceAfter=0),
    }


class _Donut(Flowable):
    def __init__(self, counts, percent):
        super().__init__()
        self.counts, self.percent = counts, percent
        self.width, self.height = 180, 170

    def draw(self):
        c = self.canv
        total = sum(self.counts.values())
        angle = 90
        c.setFillColor(_color('not_assessed'))
        c.circle(82, 86, 69, fill=1, stroke=0)
        if total:
            for key in _statuses(self.counts):
                value = self.counts[key]
                if not value:
                    continue
                sweep = value / total * 360
                c.setFillColor(_color(key))
                path = c.beginPath()
                path.moveTo(82, 86)
                path.arcTo(13, 17, 151, 155, angle, -sweep)
                path.close()
                c.drawPath(path, fill=1, stroke=0)
                angle -= sweep
        c.setFillColor(colors.white)
        c.circle(82, 86, 52, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(BOLD, 25)
        c.drawCentredString(82, 88, f'{self.percent:.1f}%' if self.percent is not None else 'N/A')
        c.setFillColor(MUTED)
        c.setFont(FONT, 7)
        c.drawCentredString(82, 70, 'IMPLEMENTATION')


class _Distribution(Flowable):
    def __init__(self, counts, width=220, height=5):
        super().__init__()
        self.counts, self.width, self.height = counts, width, height

    def draw(self):
        total, left = sum(self.counts.values()), 0
        for key in _statuses(self.counts):
            width = self.width * self.counts[key] / total if total else 0
            self.canv.setFillColor(_color(key))
            self.canv.rect(left, 0, width, self.height, fill=1, stroke=0)
            left += width


class _TrendChart(Flowable):
    def __init__(self, observations, timezone_name):
        super().__init__()
        self.observations, self.timezone_name = observations, timezone_name
        self.width, self.height = 516, 230

    def draw(self):
        c = self.canv
        maximum = max(4, ((max(observation['total'] for observation in self.observations) + 3) // 4) * 4)
        left, bottom, chart_width, chart_height = 32, 37, 478, 173
        for tick in range(5):
            y = bottom + tick / 4 * chart_height
            c.setStrokeColor(RULE)
            c.line(left, y, left + chart_width, y)
            c.setFont(FONT, 7)
            c.setFillColor(MUTED)
            c.drawRightString(left - 8, y - 2, f'{maximum * tick / 4:g}')
        slot = chart_width / len(self.observations)
        for index, observation in enumerate(self.observations):
            x, y = left + slot * index + slot * 0.18, bottom
            for key in _statuses(observation['status_counts']):
                value = observation['status_counts'][key]
                height = value / maximum * chart_height
                c.setFillColor(_color(key))
                c.rect(x, y, slot * 0.64, height, fill=1, stroke=0)
                y += height
            c.setFillColor(MUTED)
            c.setFont(FONT, 6)
            date = _date(observation['date'], self.timezone_name).split(',')[0]
            c.drawCentredString(x + slot * 0.32, bottom - 13, date)


class _NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, footer='', header=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_states = []
        self._footer = footer
        self._header = header

    def showPage(self):
        self._page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        pages = len(self._page_states)
        for state in self._page_states:
            self.__dict__.update(state)
            if self._header:
                self._header(self)
            self.saveState()
            self.setStrokeColor(RULE)
            self.line(48, 50, 564, 50)
            paragraph = Paragraph(_markup(self._footer), ParagraphStyle('footer', fontName=FONT, fontSize=7,
                                                                       leading=9, textColor=MUTED))
            _, height = paragraph.wrap(405, 28)
            paragraph.drawOn(self, 48, 41 - height)
            self.setFont(FONT, 7)
            self.setFillColor(MUTED)
            self.drawRightString(564, 27, f'{self._pageNumber:02d} / {pages:02d}')
            self.restoreState()
            super().showPage()
        super().save()


def render_framework_report(snapshot, report_type='full'):
    """Return PDF bytes from the adapter contract; no writes, fetches or semantic scoring."""
    # ReportLab's shared TTFont objects must not render concurrent documents.
    with _RENDER_LOCK:
        return _render_framework_report(snapshot, report_type)


def _render_framework_report(snapshot, report_type):
    if report_type not in ('full', 'executive'):
        raise ValueError('Unknown report detail.')
    _register_fonts()
    styles = _styles()
    framework, summary = snapshot['framework'], snapshot['summary']
    counts = summary['status_counts']
    labels = {**DEFAULT_LABELS, **summary.get('status_labels', {})}
    for row in snapshot.get('assessments', []):
        if row.get('status_label'):
            labels[row['status']] = row['status_label']
    tz = snapshot.get('timezone') or 'UTC'
    width = 516
    story = []

    def paragraph(value, style='body'):
        return Paragraph(_markup(value), styles[style])

    def add(value, style='body'):
        story.append(paragraph(value, style))

    def title(eyebrow, heading, subtitle):
        add(eyebrow.upper(), 'eyebrow')
        add(heading, 'title')
        add(subtitle, 'mini')
        story.append(Spacer(1, 10))

    def narrative(value):
        lines = _text(value).replace('\r\n', '\n').replace('\r', '\n').split('\n')
        for line in lines:
            stripped = line.strip()
            if not stripped:
                story.append(Spacer(1, 4))
            elif stripped.rstrip(':').lower() == 'controls in place':
                add(stripped, 'heading')
            elif re.match(r'^(?:[-*\u2022]|\d+[.)])\s+', stripped):
                add(line, 'bullet')
            else:
                add(line)

    def rule():
        story.append(HRFlowable(width='100%', thickness=0.6, color=RULE, spaceBefore=10, spaceAfter=10))

    framework_name = ' '.join(filter(None, (framework['name'], _text(framework.get('version')))))
    title('Executive overview', snapshot['client_name'], framework_name)
    add(f"Scope: {framework.get('scope') or 'Not recorded'}", 'mini')
    add(f"Generated: {_date(snapshot.get('generated_at'), tz)} | Source captured: {_date(snapshot.get('snapshot_at'), tz)}", 'mini')
    add(f"Latest recorded assessment: {_date(snapshot.get('latest_assessment_at'), tz)}", 'mini')
    if 'latest_record_saved_at' in snapshot:
        add(f"Latest native record save: {_date(snapshot.get('latest_record_saved_at'), tz)}", 'mini')
    add(f'Timezone: {tz}', 'mini')
    if snapshot.get('timezone_note'):
        add(snapshot['timezone_note'], 'mini')
    add('IMPLEMENTATION PROFILE', 'eyebrow')
    legend_rows = []
    for key in _statuses(counts):
        label = labels.get(key, key.replace('_', ' ').capitalize())
        legend_rows.append([paragraph(label, 'cell'), paragraph(str(counts[key]), 'cell')])
    legend = Table(legend_rows, colWidths=[266, 40], hAlign='LEFT')
    commands = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 12)]
    for index, key in enumerate(_statuses(counts)):
        commands.append(('LINEBEFORE', (0, index), (0, index), 3, _color(key)))
    legend.setStyle(TableStyle(commands))
    legend_content = [paragraph('Saved implementation statuses (all units)', 'mini'), legend]
    profile = Table([[_Donut(summary['applicable_status_counts'], summary.get('implementation_percent')), legend_content]], colWidths=[194, 322])
    profile.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    story.append(profile)
    add(f"{summary.get('assessed', 0)} of {summary.get('applicable_total', 0)} applicable {framework.get('unit_name', 'records')} assessed; "
        f"{summary.get('total', 0)} total records; {summary.get('not_applicable', 0)} excluded from the applicable denominator.", 'mini')
    if summary.get('denominator_note'):
        add(summary['denominator_note'], 'mini')
    add('Management perspective', 'heading')
    add(summary.get('management_summary') or 'No management summary is recorded.')
    native_metrics = summary.get('native_metrics') or {}
    if native_metrics:
        add('Native framework measures', 'heading')
        for key, value in native_metrics.items():
            label = {'soa': 'SoA', 'included_annex': 'Included Annex A controls'}.get(key, key.replace('_', ' ').capitalize())
            if isinstance(value, dict):
                metrics = []
                for metric, number in value.items():
                    if metric == 'status_counts':
                        metrics.extend(f'{labels.get(status, status.replace("_", " "))}: {count}' for status, count in number.items())
                    else:
                        metrics.append(f'{metric.replace("_", " ")}: {number}')
                add(f'{label}: ' + '; '.join(metrics), 'mini')
            else:
                add(f'{label}: {value}' + ('%' if key == 'assessment_progress' else ''), 'mini')
    add('Verification', 'heading')
    verification = summary.get('verification_counts') or {}
    add('; '.join(f"{key.replace('_', ' ')}: {value}" for key, value in verification.items()) or 'No verification state is recorded.', 'mini')
    rule()
    add('Implementation status describes the saved assessment conclusion. It does not establish certification or independently verified operating effectiveness. Verification is recorded separately.', 'mini')
    add(f"Source cutoff: {_date(snapshot.get('source_cutoff'), tz)}", 'tiny')
    add(f"Snapshot identifier: {snapshot.get('source_hash') or 'Not recorded'}", 'tiny')

    # Long native metrics can continue the overview. Use that continuation page
    # for the next section rather than leave only a few metadata lines on it.
    story.append(Spacer(1, 20))
    story.append(CondPageBreak(280))
    trend = snapshot.get('trend') or {}
    period = {'30d': '30 days', '6m': '6 months', '12m': '12 months'}.get(trend.get('period'), trend.get('period') or 'Not recorded')
    period_caption = f'Selected period: {period}'
    if trend.get('start') and trend.get('end'):
        period_caption += f" | {_date(trend['start'], tz)} - {_date(trend['end'], tz)}"
    title('Program progress', 'Progress over time', period_caption)
    add(trend.get('message') or 'Historical assessment snapshots are unavailable.')
    observations = trend.get('observations') or []
    assessment_events = trend.get('provenance') == 'current_catalog_assessment_events'
    if observations:
        if (trend.get('state') == 'available' and trend.get('comparable', True)
                and not trend.get('scope_changes') and len(observations) <= 12):
            story.append(_TrendChart(observations, tz))
        keys = _statuses({key: 0 for observation in observations for key in observation['status_counts']})
        col_widths = [104] + [(width - 104) / (len(keys) + 1)] * (len(keys) + 1)
        data = [[paragraph('Observation', 'cellhead')] + [paragraph(labels.get(key, key.replace('_', ' ')), 'cellhead') for key in keys]
                + [paragraph('Saved states' if assessment_events else 'Total', 'cellhead')]]
        for observation in observations:
            observation_type = ('Comparison baseline' if observation.get('comparison_baseline') else
                                'Current source snapshot' if observation.get('current_snapshot') else 'Recorded observation')
            if assessment_events and not observation.get('current_snapshot'):
                observation_type = 'Saved assessment states'
            saved_count = observation.get('known_count', observation['total']) if assessment_events else observation['total']
            data.append([paragraph(f"{_date(observation['date'], tz)}\n{observation_type}", 'cell')] +
                        [paragraph(str(observation['status_counts'].get(key, 0)), 'cell') for key in keys] +
                        [paragraph(str(saved_count), 'cell')])
        table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT', splitInRow=1)
        table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, 0), 0.8, RULE),
                                  ('LINEBELOW', (0, 1), (-1, -1), 0.4, RULE), ('TOPPADDING', (0, 0), (-1, -1), 9),
                                  ('BOTTOMPADDING', (0, 0), (-1, -1), 9), ('LEFTPADDING', (0, 0), (-1, -1), 3)]))
        story.append(table)
        add('Saved assessment states use the current catalog population; past program scope is unproven. Missing dates are not interpolated.'
            if assessment_events else 'Only recorded observations are shown. Missing dates are not interpolated.', 'mini')
    for change in trend.get('scope_changes') or []:
        add(f'Scope change: {_text(change)}', 'mini')
    if observations:
        add('Population and history limits' if assessment_events else 'Recorded scope', 'heading')
        for observation in observations:
            metadata = f"{_date(observation['date'], tz)}: {observation.get('scope') or 'Not recorded'}"
            if assessment_events and not observation.get('current_snapshot'):
                metadata += f" | {observation.get('known_count', 0)} known saved states of {observation['total']} current catalog records."
            elif observation.get('known_count') is not None:
                metadata += f" | {observation['known_count']} of {observation['total']} records known; coverage: {observation.get('coverage', 'Not recorded')}%."
            if observation.get('applicable_total') is not None and (not assessment_events or observation.get('current_snapshot')):
                metadata += f" Applicable denominator: {observation['applicable_total']}."
            add(metadata, 'mini')

    story.append(PageBreak())
    title('Control / domain summary', framework.get('group_name') or 'Framework groupings',
          f"All in-scope groupings | Assessment units: {framework.get('unit_name', 'records')}")
    keys = _statuses(counts)
    group_width = 195
    number_width = (width - group_width) / (len(keys) + 1)
    data = [[paragraph('Identifier / grouping', 'cellhead')] + [paragraph(labels.get(key, key.replace('_', ' ')), 'cellhead') for key in keys]
            + [paragraph('Total', 'cellhead')]]
    for group in snapshot.get('groups') or []:
        data.append([paragraph(f"{group['id']}  {group['title']}", 'cell')] +
                    [paragraph(str(group['status_counts'].get(key, 0)), 'cell') for key in keys] +
                    [paragraph(str(group['total']), 'cell')])
        bar = _Distribution(group['status_counts'], width - 12)
        data.append([bar] + [''] * (len(keys) + 1))
    table = Table(data, colWidths=[group_width] + [number_width] * (len(keys) + 1), repeatRows=1,
                  hAlign='LEFT', splitInRow=1)
    commands = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, 0), 0.8, RULE),
                ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3)]
    for index in range(2, len(data), 2):
        commands.extend([('SPAN', (0, index), (-1, index)), ('TOPPADDING', (0, index), (-1, index), 0),
                         ('LINEBELOW', (0, index), (-1, index), 0.4, RULE)])
        if data[index - 1][0].wrap(group_width - 6, 10000)[1] < 500:
            commands.append(('NOSPLIT', (0, index - 1), (-1, index)))
    table.setStyle(TableStyle(commands))
    story.append(table)
    add('Each grouping shows its actual assessment-status distribution. No aggregate grouping-level compliance score is assigned.', 'mini')

    if report_type == 'full':
        story.append(PageBreak())
        title('Detailed assessments', 'Saved assessment records', f"All {len(snapshot.get('assessments') or [])} in-scope assessment records")
        for assessment in snapshot.get('assessments') or []:
            story.append(CondPageBreak(260))
            add(f"{assessment['id']}  {assessment['title']}", 'detail')
            add(f"{assessment.get('group_id', '')} - {assessment.get('group_title') or 'Grouping not recorded'}", 'mini')
            status = assessment.get('status_label') or labels.get(assessment['status'], assessment['status'])
            verification_label = _text(assessment.get('verification_state') or 'Not recorded').replace('_', ' ').capitalize()
            add(f"Implementation: {status} | Verification: {verification_label}", 'mini')
            add('Current implementation', 'heading')
            implementation = assessment.get('current_implementation')
            if implementation:
                narrative(implementation)
            else:
                add('No saved current implementation narrative.', 'mini')
            controls = assessment.get('controls_in_place')
            if controls:
                add('Controls in place', 'heading')
                if isinstance(controls, list):
                    for control in controls:
                        add(f'- {control}', 'bullet')
                else:
                    narrative(controls)
            if assessment.get('notes'):
                add('Additional saved notes', 'heading')
                narrative(assessment['notes'])
            evidence = assessment.get('evidence') or []
            if evidence:
                add('Supporting references', 'heading')
                for reference in evidence:
                    add(f"{reference['id']} - {reference.get('title') or 'Untitled reference'}", 'mini')
            add('Assessment record', 'heading')
            add(f"Assessment date: {_date(assessment.get('last_assessed'), tz)}", 'mini')
            if assessment.get('record_saved_at'):
                add(f"Native record saved: {_date(assessment['record_saved_at'], tz)}", 'mini')
            if assessment.get('legacy_date_note'):
                add(assessment['legacy_date_note'], 'mini')
            add(f"Assessment basis: {assessment.get('assessment_basis') or 'Not recorded'}", 'mini')
            if assessment.get('specification') == 'annex_control' or assessment.get('soa_applicability'):
                add(f"SoA applicability: {assessment.get('soa_applicability') or 'Not yet determined'}", 'mini')
            for key, label in (('specification', 'Assessment specification'),
                               ('soa_justification', 'SoA justification'), ('na_rationale', 'Not-applicable rationale')):
                if assessment.get(key):
                    value = {'annex_control': 'Annex A control', 'isms_clause': 'ISMS clause',
                             'common_criterion': 'Common criterion'}.get(assessment[key], assessment[key])
                    add(f'{label}: {value}', 'mini')
            add(f"Items to address: {len(assessment.get('items_to_address') or [])} saved items", 'mini')
            rule()

        story.append(PageBreak())
        title('Items to address', 'Assessment follow-up', 'Complete current assessment checklist | Saved open / resolved state')
        item_count = 0
        for assessment in snapshot.get('assessments') or []:
            items = assessment.get('items_to_address') or []
            if not items:
                continue
            story.append(CondPageBreak(90))
            add(f"{assessment['id']} - {assessment['title']}", 'heading')
            for item in items:
                item_count += 1
                add(f"{_text(item.get('state') or 'Not recorded').upper()} | {item.get('item_id') or 'Identifier not recorded'}", 'eyebrow')
                narrative(item.get('text') or 'No item description recorded.')
                if item.get('notes'):
                    add('Notes', 'heading')
                    narrative(item['notes'])
                if item.get('resolution'):
                    add('Resolution', 'heading')
                    narrative(item['resolution'])
                if item.get('finding_id'):
                    add(f"Existing finding: {item['finding_id']}", 'mini')
                rule()
        if not item_count:
            add('No saved assessment checklist items.')
        add('Follow-up boundaries', 'heading')
        add('Checklist resolution records work completion; it does not automatically change implementation or verification status. This report creates no formal findings and includes no operational Reviews or Action Items.', 'mini')

    output = io.BytesIO()
    document = SimpleDocTemplate(output, pagesize=LETTER, leftMargin=48, rightMargin=48,
                                topMargin=90, bottomMargin=67, title=f"{snapshot['client_name']} - {framework_name}",
                                author='GoverNara', pageCompression=1)

    def header(c):
        c.saveState()
        c.setFillColor(TEAL)
        c.rect(48, 745, 3, 20, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(BOLD, 15)
        c.drawString(61, 751, 'GoverNara')
        c.setFont(BOLD, 7)
        c.setFillColor(MUTED)
        c.drawRightString(564, 756, 'FRAMEWORK ASSESSMENT')
        c.setFont(FONT, 7)
        c.drawRightString(564, 743, 'EXECUTIVE SUMMARY' if report_type == 'executive' else 'FULL ASSESSMENT')
        c.setStrokeColor(RULE)
        c.line(48, 727, 564, 727)
        c.restoreState()

    footer = f"{framework.get('key', 'Framework')} | Source captured {_date(snapshot.get('snapshot_at'), tz)}\nSnapshot {snapshot.get('source_hash') or 'Not recorded'}"
    document.build(story, canvasmaker=lambda *args, **kwargs: _NumberedCanvas(*args, footer=footer, header=header, **kwargs))
    return output.getvalue()
