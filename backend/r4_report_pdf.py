"""Render the authorized R4 report DTO without reading or changing records."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.platypus import CondPageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from framework_report_pdf import (
    FONT, MUTED, RULE, _RENDER_LOCK, _markup, _register_fonts, _styles,
)


class _ReportTable(Table):
    """Keep ordinary rows intact while allowing genuinely oversized rows."""

    def _splitRows(self, availHeight, doInRowSplit=0):
        # ReportLab 4.4.9 supplies this frame; recheck the hook on upgrade.
        frame = getattr(self, '_frame', None)
        if doInRowSplit and frame is not None and not frame._atTop:
            return []
        return super()._splitRows(availHeight, doInRowSplit=doInRowSplit)


def _identity(value):
    return value.get('name') or value.get('id') or 'Not recorded'


def render_report(report):
    """Share the native TTFont lock and plain-text/glyph validation."""
    with _RENDER_LOCK:
        return _render_report(report)


def _render_report(report):
    _register_fonts()
    styles = _styles()
    # Keep a section header with room for a row, rather than the entire table.
    styles['heading'].keepWithNext = False
    header = report['header']
    sections = report['sections']
    widest = max((len(section['columns']) for section in sections), default=0)
    page_size = landscape(LETTER) if widest > 5 else LETTER
    width = page_size[0] - 96
    stream = io.BytesIO()
    document = SimpleDocTemplate(stream, pagesize=page_size, leftMargin=48, rightMargin=48,
        topMargin=48, bottomMargin=60, title=str(header['title']), author=_identity(header['prepared_by']))
    story = []

    def paragraph(value, style='body'):
        return Paragraph(_markup(value), styles[style])

    story.append(paragraph(_identity(header['client']), 'eyebrow'))
    story.append(paragraph(header['title'], 'title'))
    program = header['program']
    story.append(paragraph(' '.join(str(value) for value in (program.get('name'), program.get('version')) if value), 'mini'))
    story.append(paragraph('As of: ' + str(header['as_of']), 'mini'))
    story.append(paragraph('Prepared by: ' + _identity(header['prepared_by']) +
                           ' | GRC lead: ' + _identity(header['lead']), 'mini'))
    if header.get('qualifier'):
        story.append(paragraph(header['qualifier'], 'mini'))
    story.append(Spacer(1, 8))
    for stat in report['stats']:
        value = stat['value'] if stat.get('value') is not None else 'Not recorded'
        story.append(paragraph(str(stat['label']) + ': ' + str(value)))
        if stat.get('detail'):
            story.append(paragraph(stat['detail'], 'mini'))

    for section in sections:
        story.append(CondPageBreak(80))
        story.append(paragraph(section['title'], 'heading'))
        columns = section['columns']
        if not columns:
            raise ValueError('A report section must define its columns')
        data = [[paragraph(column, 'cellhead') for column in columns]]
        for row in section['rows']:
            if len(row) != len(columns):
                raise ValueError('Report rows must match their section columns')
            data.append([paragraph(value if value is not None else 'Not recorded', 'cell') for value in row])
        weights = []
        for index, column in enumerate(columns):
            longest = max((len(str(row[index])) for row in section['rows'] if row[index] is not None), default=0)
            weights.append(max(8, min(60, max(len(str(column)), longest))))
        minimum = min(54, width / len(columns))
        remaining = width - minimum * len(columns)
        widths = [minimum + remaining * weight / sum(weights) for weight in weights]
        # Keep ordinary rows intact; split oversized rows only when needed.
        table = _ReportTable(data, colWidths=widths, hAlign='LEFT',
                      repeatRows=1, splitByRow=1, splitInRow=1)
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f6')),
            ('LINEBELOW', (0, 0), (-1, 0), 0.6, RULE),
            ('LINEBELOW', (0, 1), (-1, -1), 0.3, RULE),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(table)
        story.append(Spacer(1, 8))

    provenance = report.get('provenance') or {}
    for key in ('consistency', 'framework_source_cutoff', 'read_started_at', 'read_completed_at', 'source_hash'):
        if provenance.get(key) is not None:
            story.append(paragraph(key.replace('_', ' ').capitalize() + ': ' + str(provenance[key]), 'tiny'))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.line(48, 43, page_size[0] - 48, 43)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 7)
        canvas.drawRightString(page_size[0] - 48, 30, str(doc.page))
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()
