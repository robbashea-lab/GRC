"""Saved-record R4 previews and immutable native report exports."""
import csv
from datetime import date, datetime, timezone
import hashlib
import io
import json
import math
import re
from typing import Literal
import uuid
from xml.sax.saxutils import escape
import zipfile

from bson import BSON
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from starlette.concurrency import run_in_threadpool

import authorization
import create_requests
import framework_reports
import framework_policy_links
from framework_catalog import CATALOGS
from grc_rules import assessed_risk, is_open
import review_occurrences
import shared_review_plans
from framework_work_links import action_applies_to, finding_applies_to, finding_scopes
from r4_services import assert_settled
from security_runtime import csv_cell
import vendor_governance

FrameworkKey = Literal['cis-ig1', 'soc-2', 'iso-27001', 'hipaa', 'nist-csf-2', 'cmmc']
ReportType = Literal['assessment', 'executive', 'scope', 'risks', 'vendors', 'policies']
ReportFormat = Literal['pdf', 'csv', 'xlsx']
QUALIFIER = 'Assessment progress and readiness, not a certification, attestation or auditor opinion.'
MIME = {'pdf': 'application/pdf', 'csv': 'text/csv; charset=utf-8',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
METADATA = ('export_id', 'client_id', 'framework_key', 'type', 'format', 'title', 'as_of',
            'created_at', 'prepared_by', 'sha256', 'bytes', 'filename', 'content_type', 'download_url')
FIELDS = {
    'risks': ('risk_id', 'display_id', 'title', 'status', 'likelihood_score', 'impact_score',
              'risk_score', 'risk_level', 'treatment', 'owner_id', 'next_review', 'decision_history',
              'accepted_by', 'acceptance_date', 'acceptance_rationale', 'acceptance_expires_at'),
    'vendors': ('vendor_id', 'name', 'status', 'criticality', 'data_types', 'data_relationship',
                'criticality_provisional', 'criticality_confirmed_at', 'criticality_confirmed_by', 'source_services',
                'assurance_status', 'assurance_records', 'assurance_required', 'assurance_window_days', 'next_review', 'last_review',
                'contract_renewal', 'contract_expiration', 'contract_end', 'review_frequency'),
    'policies': ('policy_id', 'title', 'status', 'version', 'owner_id', 'baseline_key', 'framework_assessment_id',
                 'approver_id', 'approved_at', 'approval_history', 'last_reviewed_at', 'next_review_date'),
    'reviews': ('review_id', 'title', 'status', 'due_date', 'owner_id', 'reviewer_id',
                'recurrence', 'custom_recurrence_days', 'schedule_anchor', 'recurrence_due_date',
                'framework_assessment_id', *shared_review_plans.MAPPING_FIELDS,
                'vendor_id', 'vendor_purpose', 'completion_date', 'occurrences.completed_at'),
    'tasks': ('task_id', 'title', 'status', 'due_date', 'assignee_id', 'owner_id', 'finding_id', 'framework_assessment_id', 'review_id'),
    'findings': ('finding_id', 'title', 'status', 'framework_assessment_id', 'review_id'),
}


class ReportExportIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client_id: str = Field(min_length=1, max_length=160)
    framework_key: FrameworkKey
    type: ReportType
    format: ReportFormat
    as_of: date | None = None


def formats(key, report_type):
    if report_type in ('assessment', 'executive'):
        return ('pdf',)
    if report_type == 'scope':
        return ('pdf',) if key == 'soc-2' else ('pdf', 'xlsx')
    if report_type in ('risks', 'vendors', 'policies'):
        return ('pdf', 'csv')
    raise HTTPException(422, 'Unknown report type')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), default=str).encode('utf-8')).hexdigest()


def scalar(value):
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


async def authority(s, request, cid, key, expected_actor=None):
    actor = await s.get_current_user(request)
    framework_reports.require_access(actor, cid)
    if expected_actor and actor['user_id'] != expected_actor['user_id']:
        raise HTTPException(401, 'The authenticated account changed during report generation')
    client = await s.db.clients.find_one({'client_id': cid}, framework_reports.projection(framework_reports.CLIENT_FIELDS))
    if not client:
        raise HTTPException(404, 'Client not found')
    assert_settled(client)
    programs = await s.db.requirements.distinct('baseline_key', {'client_id': cid, 'baseline_response': 'applies'})
    if key not in {option['key'] for option in framework_reports.enabled_options(client, programs)}:
        raise HTTPException(403, 'The selected framework is not available to this client')
    return actor


async def read_operational(s, cid, key, actor, session=None):
    """The production caller supplies its own snapshot transaction, separately dated."""
    began = datetime.now(timezone.utc).isoformat()
    kwargs = {'session': session} if session is not None else {}
    client = await s.db.clients.find_one({'client_id': cid},
        framework_reports.projection((*framework_reports.CLIENT_FIELDS, 'assigned_owner_id')), **kwargs)
    if not client:
        raise HTTPException(404, 'Client not found')
    assert_settled(client)
    result = {'client': client}
    for kind, fields in FIELDS.items():
        rows = await s.db[kind].find({'client_id': cid}, framework_reports.projection(
            (*fields, 'client_id', 'updated_at', '_r4_context_pending')), **kwargs).to_list(10001)
        if len(rows) > 10000:
            raise HTTPException(413, 'The complete ' + kind + ' register exceeds the supported report size')
        for row in rows:
            assert_settled(row)
        result[kind] = sorted(rows, key=lambda row: str(row.get(kind[:-1] + '_id') or row.get('policy_id') or row))
    # Explicit assignments to a different program take precedence over a shared Review.
    assignments = await s.db.framework_assessments.find({'client_id': cid, '$or': [
        {'framework_key': key}, {'related_links.kind': 'findings'}]},
        framework_reports.projection(('framework_assessment_id', 'definition_id', 'framework_key', 'client_id', 'owner_id', 'related_links', 'policy_link_ids', 'last_saved', 'updated_at', '_r4_context_pending')),
        **kwargs).to_list(10001)
    if len(assignments) > 10000:
        raise HTTPException(413, 'Assessment ownership exceeds the supported report size')
    for row in assignments:
        assert_settled(row)
    result['finding_scopes'] = {fid: sorted(ids) for fid, ids in finding_scopes(assignments).items()}
    result['assessment_owners'] = sorted((row for row in assignments if row['framework_key'] == key),
                                         key=lambda row: row['framework_assessment_id'])
    identities = {actor['user_id'], client.get('assigned_owner_id')}
    for rows in (result['risks'], result['policies'], result['reviews'], result['tasks'], result['assessment_owners']):
        for row in rows:
            identities.update(row.get(field) for field in ('owner_id', 'assignee_id', 'reviewer_id', 'approver_id'))
    users = await s.db.users.find({'user_id': {'$in': [ident for ident in identities if ident]}},
        framework_reports.projection(('user_id', 'name', 'role', 'client_ids', 'all_clients', 'status')), **kwargs).to_list(len(identities))
    result['users'] = sorted((user for user in users if authorization.can_access(user, cid)), key=lambda user: user['user_id'])
    return {'records': result, 'source_hash': digest(result), 'read_started_at': began,
            'read_completed_at': datetime.now(timezone.utc).isoformat()}


async def operational_snapshot(s, cid, key, actor):
    try:
        async with await s.db.client.start_session() as session:
            async with session.start_transaction(read_concern=ReadConcern('snapshot')):
                return await read_operational(s, cid, key, actor, session)
    except HTTPException:
        raise
    except (PyMongoError, NotImplementedError):
        raise HTTPException(503, 'A consistent operational report snapshot is unavailable; retry after database snapshot support is restored')


def section(title, columns, rows):
    return {'title': title, 'columns': columns, 'rows': [[scalar(cell) for cell in row] for row in rows]}


def policy_alignment(policy, key, assessments=()):
    identifiers=list(dict.fromkeys(ident for mapping in CATALOGS[key].get('policy_mappings', [])
                                   if mapping['policy_key']==policy.get('baseline_key') for ident in mapping['safeguards']))
    for row in assessments:
        if row.get('framework_key')!=key:continue
        if framework_policy_links.supports(row,policy):
            if row['definition_id'] not in identifiers:identifiers.append(row['definition_id'])
        elif row['definition_id'] in identifiers:identifiers.remove(row['definition_id'])
    return identifiers



def linked_work(row, data, key):
    aid = row['assessment_id']
    saved = next((item for item in data['assessment_owners'] if item['framework_assessment_id'] == aid), {})
    references = saved.get('related_links') or []
    direct_reviews = {link['id'] for link in references if link.get('kind') == 'reviews'}
    reviews = [review for review in data['reviews'] if review['review_id'] in direct_reviews
               or review.get('framework_assessment_id') == aid or shared_review_plans.maps_to(review, key, row['id'])]
    # A completed Review or Finding can still own an open corrective action.
    review_ids = {review['review_id'] for review in reviews}
    finding_ids = {item['finding_id'] for item in row['items_to_address'] if item.get('finding_id')}
    finding_ids.update(link['id'] for link in references if link.get('kind') == 'findings')
    findings = [finding for finding in data['findings'] if finding['finding_id'] in finding_ids
                or finding_applies_to(aid, finding, review_ids, data.get('finding_scopes', {}))]
    finding_ids.update(finding['finding_id'] for finding in findings)
    direct_tasks = {link['id'] for link in references if link.get('kind') == 'tasks'}
    tasks = [task for task in data['tasks'] if task['task_id'] in direct_tasks
             or action_applies_to(aid, task, review_ids, finding_ids)]
    return [{'type': kind, 'id': item[field], 'title': item.get('title'), 'status': item.get('status')}
            for kind, field, records in (('findings', 'finding_id', findings), ('tasks', 'task_id', tasks),
                                         ('reviews', 'review_id', reviews)) for item in records if is_open(kind, item)]


def criticality_text(vendor, names):
    text = (vendor.get('criticality') or 'Not recorded') + (' (provisional)' if vendor.get('criticality_provisional') is True else '')
    source = vendor.get('source_services') or {}
    if isinstance(source, dict) and source.get('qualification'):
        text += '\n' + source['qualification']
    if vendor.get('criticality_confirmed_at'):
        text += '\nConfirmed at ' + str(vendor['criticality_confirmed_at'])
    if vendor.get('criticality_confirmed_by'):
        ident = vendor['criticality_confirmed_by']
        text += '\nConfirmed by ' + (names.get(ident) or ident)
    return text


def assurance_text(vendor):
    rows = vendor.get('assurance_records') or []
    if rows:
        return '; '.join(str(row.get('type') or row.get('name') or row.get('assurance_id') or 'Assurance record')
                         + ': ' + str(row['status']).replace('_', ' ') for row in rows)
    return str(vendor['assurance_status']).replace('_', ' ') if vendor.get('assurance_status') else None


def build_preview(snapshot, operational, report_type, actor):
    data = operational['records']
    key, program = snapshot['framework']['key'], snapshot['framework']
    names = {user['user_id']: user.get('name') for user in data['users']}
    person = lambda ident: names.get(ident) or ident or None
    client = data['client']
    day = snapshot['generated_at'][:10]
    title = {'assessment': program['name'] + ' assessment report', 'executive': 'Executive summary',
             'scope': 'Statement of Applicability' if key == 'iso-27001' else 'SOC 2 readiness summary' if key == 'soc-2' else 'Safeguard gap list' if key == 'cis-ig1' else 'Requirement gap list',
             'risks': 'Risk register', 'vendors': 'Vendor register', 'policies': 'Policy register'}[report_type]
    header = {'client': {'id': snapshot['client_id'], 'name': snapshot['client_name']},
              'program': {field: program[field] for field in ('key', 'name', 'version')},
              'title': title, 'as_of': day, 'prepared_by': {'id': actor['user_id'], 'name': names.get(actor['user_id'])},
              'lead': {'id': client.get('assigned_owner_id'), 'name': names.get(client.get('assigned_owner_id'))},
              'qualifier': QUALIFIER}
    summary, assessments = snapshot['summary'], snapshot['assessments']
    position = summary['implementation_position']
    percentage = position.get('percentage')
    count_detail = (str(position['implemented']) + ' of ' + str(position['denominator']) + '. '
                    if position.get('implemented') is not None and position.get('denominator') is not None else '')
    stats = [{'label': summary['status_labels']['addressed'],
              'value': f'{percentage:.1f}%' if percentage is not None else 'N/A',
              'detail': count_detail + summary['denominator_note']}]
    counts = {item['key']: item['count'] for item in position.get('included_counts', [])}
    stats += [{'label': summary['status_labels'][status],
               'value': counts.get(status, summary['applicable_status_counts'][status]), 'detail': ''}
              for status in ('in_progress', 'needs_attention', 'not_assessed')]
    applicability = summary['implementation_position'].get('scope', {}).get('applicability', {})
    included = [row for row in assessments if applicability.get(row['id']) in ('included', 'invalid_not_applicable')]
    risks = [assessed_risk(row) for row in data['risks'] if row.get('status') not in ('closed', 'retired')]
    risks.sort(key=lambda row: (row['risk_score'] is None, -(row['risk_score'] or 0), row['risk_id']))
    policies = data['policies']
    sections = []
    if report_type == 'assessment':
        groups = []
        for group in snapshot['groups']:
            rows = [row for row in included if row['group_id'] == group['id']]
            implemented = sum(row['status'] == 'addressed' for row in rows)
            groups.append([group['title'], implemented, len(rows), f'{implemented * 100 / len(rows):.1f}%' if rows else 'N/A'])
        sections = [section('Results by domain', ['Domain', summary['status_labels']['addressed'], 'Applicable', 'Rate'], groups),
                    section('Items needing attention', ['ID', 'Title', 'Status', 'Verification'],
                            [[row['id'], row['title'], row['status_label'], row['verification_state']]
                             for row in included if row['status'] != 'addressed'])]
    elif report_type == 'executive':
        overdue = []
        for kind in ('reviews', 'tasks'):
            for saved in data[kind]:
                row = review_occurrences.view(saved) if kind == 'reviews' else saved
                due = review_occurrences.scheduled_date(row.get('due_date'))
                due_day = due.date().isoformat() if due else None
                if due_day and due_day < day and row.get('status') not in ('completed', 'cancelled', 'done'):
                    overdue.append([row.get('title'), 'Review' if kind == 'reviews' else 'Action item',
                                    person(row.get('assignee_id') or row.get('owner_id')), due_day])
        significant = [row for row in risks if row['risk_score'] is not None and row['risk_score'] >= 10]
        sections = [section('Position', ['Program position', 'Overdue work', 'High or critical risks'],
                            [[summary['management_summary'], len(overdue), len(significant)]]),
                    section('Significant risks', ['Risk', 'Score', 'Status', 'Owner'],
                            [[row['title'], row['risk_score'], row.get('status'), person(row.get('owner_id'))]
                             for row in (significant or risks[:3])]),
                    section('Overdue work', ['Item', 'Type', 'Owner', 'Due'], overdue)]
    elif report_type == 'scope':
        if key == 'iso-27001':
            sections = [section(title, ['Control', 'Title', 'Applicability', 'Justification', 'Status', 'Linked policy'],
                [[row['id'], row['title'], row['soa_applicability'], row['soa_justification'], row['status_label'],
                  '; '.join(policy['title'] for policy in policies if row['id'] in policy_alignment(policy, key, data['assessment_owners'])) or None]
                 for row in assessments if row['specification'] == 'annex_control'])]
        elif key == 'soc-2':
            owners = {row['framework_assessment_id']: row.get('owner_id') for row in data['assessment_owners']}
            sections = [section(title, ['Criterion', 'Title', 'Category', 'Owner', 'Readiness'],
                [[row['id'], row['title'], CATALOGS[key]['categories'].get(row['group_id'].split('/')[0]),
                  person(owners.get(row['assessment_id'])), row['status_label']]
                 for row in assessments])]
        else:
            gaps = []
            for row in included:
                work = linked_work(row, data, key)
                if row['status'] != 'addressed' or any(item['type'] in ('tasks', 'findings') for item in work):
                    readable = '; '.join({'tasks': 'Action item', 'findings': 'Finding', 'reviews': 'Review'}[item['type']] + ' ' + item['id'] + ': '
                                         + str(item['title'] or item['id']) + ' (' + str(item['status'] or 'Not recorded') + ')' for item in work)
                    gaps.append([row['id'], row['title'], row['status_label'], row['verification_state'], readable or None])
            sections = [section(title, ['ID', 'Title', 'Status', 'Verification', 'Linked work'],
                                gaps)]
    elif report_type == 'risks':
        sections = [section(title, ['Risk', 'Title', 'Score', 'Status', 'Owner', 'Next review'],
            [[row.get('display_id') or row['risk_id'], row['title'], row['risk_score'], row.get('status'),
              person(row.get('owner_id')), row.get('next_review')] for row in risks])]
    elif report_type == 'vendors':
        vendors = [vendor_governance.view(row, data['reviews']) for row in data['vendors']]
        sections = [section(title, ['Vendor', 'Criticality', 'Data access', 'Assurance', 'Next review', 'Renewal'],
            [[row['name'], criticality_text(row, names),
              ', '.join([*(row.get('data_relationship') or []), *(row.get('data_types') or [])]) or None,
              assurance_text(row),
              row.get('next_review'), row.get('contract_renewal') or row.get('contract_expiration')] for row in vendors])]
    else:
        sections = [section(title, ['Policy', 'Status', 'Version', 'Owner', program['name'] + ' alignment'],
            [[row['title'], row.get('status'), row.get('version'), person(row.get('owner_id')),
              ', '.join(policy_alignment(row, key, data['assessment_owners'])) or None] for row in policies])]
    return {'header': header, 'stats': stats, 'sections': sections, 'allowed_formats': list(formats(key, report_type)), 'provenance': {
        'source_hash': digest([snapshot['source_hash'], operational['source_hash']]),
        'implementation_position': position,
        'framework_source_cutoff': snapshot['source_cutoff'],
        'read_started_at': operational.get('report_read_started_at', operational['read_started_at']),
        'read_completed_at': operational['read_completed_at'],
        'consistency': 'Separate framework and operational MongoDB snapshots; unchanged source hashes rechecked before delivery.'}}


async def current_report(s, cid, key, report_type, as_of, user):
    began = datetime.now(timezone.utc).isoformat()
    snapshot, client = await framework_reports.read_snapshot(s, cid, key, user, '6m')
    if as_of is not None and as_of.isoformat() != snapshot['generated_at'][:10]:
        raise HTTPException(409, 'Historical source reconstruction is unavailable; open a retained export by its export ID')
    operational = await operational_snapshot(s, cid, key, user)
    operational['report_read_started_at'] = began
    return build_preview(snapshot, operational, report_type, user), snapshot, client, operational


async def generation_guard(s, request, cid, key, user, snapshot, client, operational):
    current = await authority(s, request, cid, key, user)
    fresh, _ = await framework_reports.read_snapshot(s, cid, key, current, '6m')
    records = await operational_snapshot(s, cid, key, current)
    if fresh['source_hash'] != snapshot['source_hash'] or records['source_hash'] != operational['source_hash']:
        raise HTTPException(409, 'Saved report sources changed during generation; generate the report again')
    checked = await framework_reports.recheck_delivery(s, request, cid, key, client, snapshot)
    if checked['user_id'] != user['user_id']:
        raise HTTPException(401, 'The authenticated account changed during report generation')
    return checked


async def preview(s, request, cid, key, report_type, as_of, user):
    await authority(s, request, cid, key, user)
    dto, snapshot, client, operational = await current_report(s, cid, key, report_type, as_of, user)
    await generation_guard(s, request, cid, key, user, snapshot, client, operational)
    return dto


def table_rows(dto):
    header = dto['header']
    yield [header['title']]
    yield ['Client', header['client']['name'], 'Program', header['program']['name'], 'As of', header['as_of']]
    yield ['Prepared by', header['prepared_by']['name'] or header['prepared_by']['id'], 'GRC lead', header['lead']['name'] or header['lead']['id']]
    yield [header['qualifier']]
    for stat in dto['stats']:
        yield [stat['label'], stat['value'], stat.get('detail')]
    for item in dto['sections']:
        yield []
        yield [item['title']]
        yield item['columns']
        yield from item['rows']


def render_csv(dto):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    for row in table_rows(dto):
        writer.writerow([csv_cell(cell) for cell in row])
    return output.getvalue().encode('utf-8-sig')


def xml_text(value):
    text = '' if value is None else str(value)
    if any(not (char in '\t\n\r' or 0x20 <= ord(char) <= 0xD7FF or 0xE000 <= ord(char) <= 0xFFFD or 0x10000 <= ord(char) <= 0x10FFFF) for char in text):
        raise ValueError('Saved report text contains an unsupported XML character')
    return escape(text)


def render_xlsx(dto):
    rows = []
    for number, row in enumerate(table_rows(dto), 1):
        cells = []
        for cell in row:
            text = xml_text(cell)
            # Reject values Excel cannot retain; never shorten a saved result.
            raw = '' if cell is None else str(cell)
            if len(raw.encode('utf-16-le')) // 2 > 32767:
                raise ValueError('Saved report text exceeds spreadsheet cell capacity')
            cells.append('<c t="inlineStr"><is><t xml:space="preserve">' + text + '</t></is></c>')
        rows.append('<row r="' + str(number) + '">' + ''.join(cells) + '</row>')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(rows) + '</sheetData></worksheet>')
    return output.getvalue()


def render(dto, output_format):
    if output_format == 'pdf':
        from r4_report_pdf import render_report
        return render_report(dto)
    return render_csv(dto) if output_format == 'csv' else render_xlsx(dto)


def metadata(row):
    return {field: row[field] for field in METADATA}


def verify_export(row):
    content = row.get('content')
    snapshot = row.get('snapshot') or {}
    header = snapshot.get('header') or {}
    if (not isinstance(content, bytes) or len(content) != row.get('bytes')
            or hashlib.sha256(content).hexdigest() != row.get('sha256')
            or digest(snapshot) != row.get('snapshot_hash')
            or header.get('client', {}).get('id') != row.get('client_id')
            or header.get('program', {}).get('key') != row.get('framework_key')
            or any(header.get(field) != row.get(field) for field in ('title', 'as_of', 'prepared_by'))
            or row.get('content_type') != MIME.get(row.get('format'))
            or not re.fullmatch(r'rpt_[a-f0-9]{32}', row.get('export_id', ''))
            or not re.fullmatch(r'[A-Za-z0-9._-]+', row.get('filename', ''))
            or row.get('download_url') != '/api/reports/exports/' + row.get('export_id', '') + '/download'):
        raise HTTPException(409, 'The retained report failed its content integrity check')
    return content


async def create_export(s, request, body, user, idempotency_key):
    if body.format not in formats(body.framework_key, body.type):
        raise HTTPException(422, 'The selected format is unavailable for this report type')
    await authority(s, request, body.client_id, body.framework_key, user)
    payload = body.model_dump(mode='json')

    async def execute(identity):
        existing = await s.db.report_exports.find_one({'_id': 'create:' + identity}, {'_id': 0})
        if existing:
            verify_export(existing)
            actor = await authority(s, request, body.client_id, body.framework_key, user)
            row = existing
        else:
            dto, snapshot, client, operational = await current_report(s, body.client_id, body.framework_key, body.type, body.as_of, user)
            try:
                content = await run_in_threadpool(render, dto, body.format)
            except ValueError:
                raise HTTPException(422, 'Saved text could not be preserved faithfully in the selected report format')
            actor = await generation_guard(s, request, body.client_id, body.framework_key, user, snapshot, client, operational)
            export_id = 'rpt_' + uuid.uuid5(uuid.NAMESPACE_URL, identity).hex
            slug = re.sub(r'[^a-zA-Z0-9]+', '-', dto['header']['client']['name']).strip('-').lower()[:80] or 'client'
            row = {'export_id': export_id, 'client_id': body.client_id, 'framework_key': body.framework_key,
                   'type': body.type, 'format': body.format, 'title': dto['header']['title'], 'as_of': dto['header']['as_of'],
                   'created_at': datetime.now(timezone.utc).isoformat(), 'prepared_by': dto['header']['prepared_by'],
                   'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content),
                   'filename': slug + '-' + body.framework_key + '-' + body.type + '-' + dto['header']['as_of'] + '.' + body.format,
                   'content_type': MIME[body.format], 'download_url': '/api/reports/exports/' + export_id + '/download',
                   'snapshot': dto, 'snapshot_hash': digest(dto), 'content': content}
            if len(BSON.encode({'_id': 'create:' + identity, **row})) > 16 * 1024 * 1024:
                raise HTTPException(413, 'The complete report exceeds MongoDB document storage limits; no partial export was retained')
            row = await create_requests.insert_primary(s.db, 'report_exports', row, identity)
        await s.audit(actor, 'generate', 'report-export', row['export_id'], row['client_id'],
                      meta={'framework_key': row['framework_key'], 'type': row['type'], 'format': row['format'], 'sha256': row['sha256']})
        return metadata(row)

    result = await create_requests.run(s.db, idempotency_key, user['user_id'], body.client_id,
                                       'reports/exports', payload, execute)
    await authority(s, request, body.client_id, body.framework_key, user)
    saved = await s.db.report_exports.find_one({'export_id': result['export_id'], 'client_id': body.client_id,
                                               'framework_key': body.framework_key}, {'_id': 0})
    if not saved:
        raise HTTPException(409, 'The retained export is unavailable; its saved receipt cannot substitute for a file')
    verify_export(saved)
    return metadata(saved)


async def history(s, request, cid, key, user):
    await authority(s, request, cid, key, user)
    rows = await s.db.report_exports.find({'client_id': cid, 'framework_key': key},
        framework_reports.projection(METADATA)).sort([('created_at', -1), ('export_id', -1)]).to_list(1001)
    if len(rows) > 1000:
        raise HTTPException(413, 'Report export history exceeds the supported complete history size')
    await authority(s, request, cid, key, user)
    return {'exports': [metadata(row) for row in rows]}


async def download(s, request, export_id, user):
    row = await s.db.report_exports.find_one({'export_id': export_id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Report export not found')
    await authority(s, request, row['client_id'], row['framework_key'], user)
    content = verify_export(row)
    await authority(s, request, row['client_id'], row['framework_key'], user)
    return Response(content, media_type=row['content_type'], headers={
        'Content-Disposition': 'attachment; filename="' + row['filename'] + '"',
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


def router_for(s):
    router = APIRouter(prefix='/api/reports', tags=['r4-reports'])

    @router.get('/preview')
    async def preview_route(request: Request, client_id: str = Query(..., min_length=1, max_length=160),
                            framework_key: FrameworkKey = Query(...), type: ReportType = Query(...),
                            as_of: date | None = None, user=Depends(s.get_current_user)):
        return await preview(s, request, client_id, framework_key, type, as_of, user)

    @router.post('/exports')
    async def export_route(request: Request, body: ReportExportIn, idempotency_key: str | None = Header(None),
                           user=Depends(s.get_current_user)):
        return await create_export(s, request, body, user, idempotency_key)

    @router.get('/history')
    async def history_route(request: Request, client_id: str = Query(..., min_length=1, max_length=160),
                            framework_key: FrameworkKey = Query(...), user=Depends(s.get_current_user)):
        return await history(s, request, client_id, framework_key, user)

    @router.get('/exports/{export_id}/download')
    async def download_route(request: Request, export_id: str, user=Depends(s.get_current_user)):
        return await download(s, request, export_id, user)

    return router
