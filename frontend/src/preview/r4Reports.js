// Browser-local saved Demo records only; authenticated report delivery stays native.
import {zipSync, strToU8} from 'fflate';
import {policySupportIds} from '../lib/frameworkPolicyLinks';
import {FRAMEWORKS, activeDefinitions, frameworkCatalog} from '../lib/frameworks';
import {cisConfiguration} from '../lib/cisScope';
import {socConfiguration, SOC_CATEGORIES} from '../lib/socReadiness';
import {cmmcConfiguration} from '../lib/cmmcScope';
import {assessedRisk, isOpen} from '../lib/grcWork';
import {vendorProjection, assuranceStatus} from '../lib/vendorGovernance';
import {canExportReports} from '../lib/permissions';
import {frameworkScope} from './frameworks';
import {demoCurrentPositions} from './portfolioReporting';
import {commandRequest, stable} from './commandRequests';
import {clone, audit, now} from './store';
import {reviewView} from '../lib/reviewOccurrences';
import {recordUuid} from '../lib/recordUuid';
import {clientAccess} from './assignmentEligibility';

const TYPES = ['assessment', 'executive', 'scope', 'risks', 'vendors', 'policies'];
const STATUSES = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'];
const QUALIFIER = 'Assessment progress and readiness, not a certification, attestation or auditor opinion.';
const MIME = {csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const META = ['export_id', 'client_id', 'framework_key', 'type', 'format', 'title', 'as_of',
  'created_at', 'prepared_by', 'sha256', 'bytes', 'filename', 'content_type', 'download_url'];
const SOURCES = ['framework_assessments', 'requirements', 'evidence', 'findings', 'risks', 'vendors', 'policies', 'reviews', 'tasks'];
const fail = (message, status=422) => { throw Object.assign(new Error(message), {status}); };
const scalar = value => value == null ? null : typeof value === 'object' ? stable(value)
  : typeof value === 'number' && !Number.isFinite(value) ? null : value;
const section = (title, columns, rows) => ({title, columns, rows: rows.map(row => row.map(scalar))});
const metadata = row => Object.fromEntries(META.map(key => [key, row[key]]));

function clientFor(db, clientId) {
  if (!canExportReports(db.user) || db.user.status !== 'active') fail('Account unavailable for report export', 403);
  frameworkScope(db, clientId);
  const client = db.clients.find(row => row.client_id === clientId);
  if (client._r4_context_pending) fail('A saved client change needs recovery before reporting', 409);
  return client;
}

function authority(db, clientId, key) {
  const client = clientFor(db, clientId);
  if (!FRAMEWORKS.some(framework => framework.key === key) || !frameworkCatalog(key)) fail('Unknown framework');
  if (!(client.onboarding_baseline?.completed || db.baselines?.[clientId]?.completed)
      || !(db.requirements || []).some(row => row.client_id === clientId && row.baseline_key === key && row.baseline_response === 'applies')) {
    fail('The selected framework is not available to this client', 403);
  }
  return client;
}

function formats(key, type) {
  return ['risks', 'vendors', 'policies'].includes(type) ? ['pdf', 'csv']
    : type === 'scope' && key !== 'soc-2' ? ['pdf', 'xlsx'] : ['pdf'];
}

function configurationFor(key, client) {
  const value = key === 'cis-ig1' ? cisConfiguration(client) : key === 'soc-2' ? socConfiguration(client)
    : key === 'cmmc' ? cmmcConfiguration(client) : {};
  if (key === 'cis-ig1' && !frameworkCatalog(key).available_implementation_groups.includes(value.implementation_group)
      || key === 'cmmc' && ![1, 2].includes(value.level)
      || key === 'soc-2' && (!Array.isArray(value.categories) || !value.categories.includes('security')
        || new Set(value.categories).size !== value.categories.length || value.categories.some(category => !Object.hasOwn(SOC_CATEGORIES, category)))) {
    fail('Saved framework configuration is invalid; review the program before reporting', 409);
  }
  return value;
}

function frameworkOption(key, client) {
  const catalog = frameworkCatalog(key), configuration = configurationFor(key, client);
  const option = {...program(key, configuration, catalog), scope: catalog.scope_note || '',
    unit_name: key === 'iso-27001' ? 'requirements and controls' : key === 'soc-2' ? 'criteria'
      : key === 'cis-ig1' ? 'safeguards' : key === 'nist-csf-2' ? 'outcomes' : key === 'hipaa' ? 'tracked provisions' : configuration.level === 1 ? 'mapped checks' : 'requirements',
    group_name: key === 'cis-ig1' ? 'Controls' : key === 'soc-2' ? 'Criteria groups' : key === 'iso-27001' ? 'Sections and domains' : key === 'nist-csf-2' ? 'Functions and categories' : key === 'cmmc' ? 'Domains' : 'Cited sections'};
  if (key === 'cis-ig1') option.scope = `Cumulative IG${configuration.implementation_group} safeguards`;
  if (key === 'iso-27001') option.scope = client.isms_scope || client.iso_scope || 'ISMS scope not recorded; clauses 4–10 and Annex A / Statement of Applicability';
  if (key === 'soc-2') option.scope = configuration.categories.map(category => SOC_CATEGORIES[category]).join(', ')
    + (configuration.system_description ? '. System: ' + configuration.system_description : '. System description not recorded')
    + (configuration.period_start && configuration.period_end ? `. Recorded evidence period: ${configuration.period_start} to ${configuration.period_end}` : '. Evidence period not recorded');
  if (key === 'cmmc') option.scope = (configuration.level === 1 ? 'FAR / FCI scope: 15 parent requirements represented by 17 mapped child checks' : 'NIST SP 800-171 Rev 2 / CUI scope: 110 requirements')
    + '. Internal readiness, not CMMC Status, affirmation, certification or a weighted assessment score. Retained answers require a scope check after a level change.';
  return option;
}

function localDay(client, at) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: client.timezone || client.time_zone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(at));
    const value = type => parts.find(part => part.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch { return fail('The client reporting timezone is invalid'); }
}

function sourceRecords(db, clientId) {
  const records = Object.fromEntries(SOURCES.map(kind => {
    const rows = (db[kind] || []).filter(row => row.client_id === clientId);
    if (rows.length > 10000) fail(`The complete ${kind} register exceeds the supported report size`, 413);
    if (rows.some(row => row._r4_context_pending)) fail('A saved record needs recovery before reporting', 409);
    return [kind, rows.map(row => Object.fromEntries(Object.entries(row)
      .filter(([key]) => key !== 'content_base64' && !key.startsWith('_'))))];
  }));
  const client = db.clients.find(row => row.client_id === clientId);
  const identities = new Set([db.user.user_id, client.assigned_owner_id]);
  for (const rows of [records.framework_assessments, records.risks, records.policies, records.reviews, records.tasks, records.vendors]) {
    for (const row of rows) for (const key of ['owner_id', 'assignee_id', 'reviewer_id', 'approver_id', 'criticality_confirmed_by']) if (row[key]) identities.add(row[key]);
  }
  const userFields = ['user_id', 'name', 'email', 'role', 'client_ids', 'all_clients', 'status', 'password_change_required'];
  const projectUser = user => Object.fromEntries(userFields.filter(key => Object.hasOwn(user, key)).map(key => [key, user[key]]));
  return {...records, client, actor: projectUser(db.user), users: (db.users || []).filter(user => identities.has(user.user_id)
    && canExportReports({...user, password_change_required: false})
    && clientAccess(user, clientId)).map(projectUser),
  baseline: db.baselines?.[clientId] || null};
}

async function hash(bytes) {
  if (!globalThis.crypto?.subtle) fail('Report hashing is unavailable in this Demo session', 503);
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

function program(key, configuration, catalog) {
  const names = {'cis-ig1': `CIS IG${configuration.implementation_group}`, 'soc-2': 'SOC 2',
    'iso-27001': 'ISO/IEC 27001', hipaa: 'HIPAA', 'nist-csf-2': 'NIST CSF 2.0', cmmc: `CMMC Level ${configuration.level}`};
  return {key, name: names[key], version: catalog.version};
}

function statusLabels(key) {
  return {not_assessed: 'Not Assessed', in_progress: key === 'soc-2' ? 'Partially Addressed' : 'Partially Implemented',
    addressed: key === 'soc-2' ? 'Addressed (Readiness)' : 'Implemented',
    needs_attention: key === 'soc-2' ? 'Needs Remediation / Validation' : key === 'iso-27001' ? 'Not Implemented / Needs Validation' : 'Not Implemented',
    not_applicable: 'Not Applicable'};
}

function policyAlignment(policy, key, assessments) {
  return policySupportIds(policy,key,assessments);
}

function linkedWork(row, source, key) {
  const references = row.related_links || [];
  const findingIds = new Set((row.items_to_address || []).map(item => item.finding_id).filter(Boolean));
  for (const link of references) if (link.kind === 'findings' && link.id) findingIds.add(link.id);
  return ['findings', 'tasks', 'reviews'].flatMap(kind => {
    const field = kind === 'tasks' ? 'task_id' : kind === 'findings' ? 'finding_id' : 'review_id';
    const direct = new Set(references.filter(link => link.kind === kind).map(link => link.id));
    return source[kind].filter(item => isOpen(kind, item) && (direct.has(item[field])
      || item.framework_assessment_id === row.framework_assessment_id
      || kind === 'findings' && findingIds.has(item.finding_id)
      || kind === 'tasks' && findingIds.has(item.finding_id)
      || kind === 'reviews' && item.framework_key === key && item.framework_safeguards?.includes(row.definition_id)))
      .map(item => ({type: kind, id: item[field], title: item.title ?? null, status: item.status ?? null}));
  });
}

async function preview(db, params) {
  const {client_id: clientId, framework_key: key, type} = params;
  if (!TYPES.includes(type)) fail('Unknown report type');
  const client = authority(db, clientId, key), actorId = db.user.user_id, began = now(), day = localDay(client, began);
  if (params.as_of != null && params.as_of !== day) {
    const parsed = typeof params.as_of === 'string' ? new Date(params.as_of + 'T00:00:00Z') : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(params.as_of)
        || parsed.toISOString().slice(0, 10) !== params.as_of) fail('Use a valid report date');
    fail('Historical source reconstruction is unavailable; open a retained export by its export ID', 409);
  }
  const catalog = frameworkCatalog(key);
  const configuration = configurationFor(key, client);
  const definitions = activeDefinitions(key, configuration), expected = new Set(definitions.map(row => row.id));
  const source = sourceRecords(db, clientId), guard = stable(source), saved = new Map();
  for (const row of source.framework_assessments.filter(row => expected.has(row.definition_id) && row.framework_key === key)) {
    if (saved.has(row.definition_id)) fail('Duplicate native assessments exist; resolve program initialization before reporting', 409);
    if (row.framework_version !== catalog.version) fail('Saved framework versions do not match the active catalog; review program initialization', 409);
    if (!STATUSES.includes(row.status)) fail('An assessment has an unsupported saved status; review it before reporting', 409);
    saved.set(row.definition_id, row);
  }
  if (saved.size !== expected.size) fail('Framework initialization is incomplete; finish enabling the program before generating its report', 409);
  const position = demoCurrentPositions(db, [client], began).find(row => row.framework_key === key)?.current;
  if (!position || key === 'cmmc' && position.scope?.configuration?.level !== configuration.level) {
    fail('The saved program implementation scope is unavailable; reload the current program', 409);
  }
  const rows = definitions.map(definition => ({...definition, ...saved.get(definition.id)}));
  const applicability = position.scope?.applicability || {};
  const included = rows.filter(row => ['included', 'invalid_not_applicable'].includes(applicability[row.definition_id]));
  const labels = statusLabels(key), selected = program(key, configuration, catalog);
  const users = new Map(source.users.filter(user => canExportReports({...user, password_change_required: false})
    && clientAccess(user, clientId))
    .map(user => [user.user_id, user.name || null]));
  const person = id => users.get(id) || id || null;
  const criticality = vendor => {
    const parts = [(vendor.criticality || 'Not recorded') + (vendor.criticality_provisional === true ? ' (provisional)' : '')];
    if (vendor.source_services?.qualification) parts.push(vendor.source_services.qualification);
    if (vendor.criticality_confirmed_at) parts.push('Confirmed at: ' + vendor.criticality_confirmed_at);
    if (vendor.criticality_confirmed_by) parts.push('Confirmed by: ' + person(vendor.criticality_confirmed_by));
    return parts.join('; ');
  };
  const titles = {assessment: selected.name + ' assessment report', executive: 'Executive summary',
    scope: key === 'iso-27001' ? 'Statement of Applicability' : key === 'soc-2' ? 'SOC 2 readiness summary'
      : key === 'cis-ig1' ? 'Safeguard gap list' : 'Requirement gap list', risks: 'Risk register', vendors: 'Vendor register', policies: 'Policy register'};
  const header = {client: {id: clientId, name: client.name}, program: selected, title: titles[type], as_of: day,
    prepared_by: {id: db.user.user_id, name: users.get(db.user.user_id) || null},
    lead: {id: client.assigned_owner_id || null, name: users.get(client.assigned_owner_id) || null},
    qualifier: `${QUALIFIER} Explore Demo uses synthetic browser-session records.`};
  const validNA = rows.filter(row => row.status === 'not_applicable' && applicability[row.definition_id] === 'excluded').length;
  const invalidNA = rows.filter(row => row.status === 'not_applicable' && applicability[row.definition_id] !== 'excluded').length;
  const detail = `Implementation uses ${position.measure_version}, the same native measure as Portfolio. `
    + 'Only applicable implementation units enter the donut; valid exclusions and undetermined SoA controls are separate. '
    + 'Assessed coverage counts valid saved implementation statuses other than Not Assessed; invalid N/A earns no credit. '
    + `Saved position availability: ${position.availability}. ${position.reason || ''}`
    + ` Native assessment resolution records ${validNA} valid and ${invalidNA} invalid Not Applicable states; invalid exclusions receive no resolution credit. `
    + 'Saved-state distributions retain all native statuses, including statuses on excluded or undetermined ISO controls. '
    + 'An unavailable percentage is shown as N/A, not zero or completion.';
  const percentage = value => Number.isFinite(value) ? value.toFixed(1) + '%' : 'N/A';
  const stats = [{label: labels.addressed, value: percentage(position.percentage),
    detail: `${position.implemented ?? 'N/A'} of ${position.denominator ?? 'N/A'} ${frameworkOption(key, client).unit_name}. ${detail}`},
    ...['in_progress', 'needs_attention', 'not_assessed'].map(status => ({label: labels[status],
      value: position.included_counts?.find(count => count.key === status)?.count ?? null, detail: ''}))];
  const groupId = row => key === 'soc-2' ? row.category + '/' + row.control : String(row.control);
  const groupTitle = row => `${key === 'cis-ig1' ? 'Control ' : ''}${row.control} — ${row.control_name}`;
  const risks = source.risks.filter(row => !['closed', 'retired'].includes(row.status)).map(assessedRisk)
    .sort((a, b) => Number(a.risk_score === null) - Number(b.risk_score === null) || (b.risk_score || 0) - (a.risk_score || 0) || a.risk_id.localeCompare(b.risk_id));
  let sections;
  if (type === 'assessment') {
    const groups = [...new Map(rows.map(row => [groupId(row), row])).values()].map(group => {
      const members = included.filter(row => groupId(row) === groupId(group)), implemented = members.filter(row => row.status === 'addressed').length;
      return [groupTitle(group), implemented, members.length, percentage(members.length ? implemented * 100 / members.length : null)];
    });
    sections = [section('Results by domain', ['Domain', labels.addressed, 'Applicable', 'Rate'], groups),
      section('Items needing attention', ['ID', 'Title', 'Status', 'Verification'], included.filter(row => row.status !== 'addressed')
        .map(row => [row.definition_id, row.title, labels[row.status], row.verification || 'not_verified']))];
  } else if (type === 'executive') {
    const overdue = ['reviews', 'tasks'].flatMap(kind => source[kind].map(row => kind === 'reviews' ? reviewView(row) : row)
      .filter(row => /^\d{4}-\d{2}-\d{2}/.test(row.due_date || '') && row.due_date.slice(0, 10) < day && !['completed', 'cancelled', 'done'].includes(row.status))
      .map(row => [row.title, kind === 'reviews' ? 'Review' : 'Action item', person(row.assignee_id || row.owner_id), row.due_date.slice(0, 10)]));
    const significant = risks.filter(row => row.risk_score !== null && row.risk_score >= 10);
    const positionText = `${included.filter(row => row.status === 'addressed').length} of ${included.length} applicable units are saved as ${labels.addressed}. `
      + `${position.assessed ?? 0} included units have a saved implementation status; ${included.filter(row => row.status === 'not_assessed').length} remain Not Assessed. `
      + `${position.excluded ?? 0} units are validly excluded or Not Applicable; ${position.scope_undetermined ?? 0} have undetermined applicability.`;
    sections = [section('Position', ['Program position', 'Overdue work', 'High or critical risks'], [[positionText, overdue.length, significant.length]]),
      section('Significant risks', ['Risk', 'Score', 'Status', 'Owner'], (significant.length ? significant : risks.slice(0, 3)).map(row => [row.title, row.risk_score, row.status, person(row.owner_id)])),
      section('Overdue work', ['Item', 'Type', 'Owner', 'Due'], overdue)];
  } else if (type === 'scope') {
    if (key === 'iso-27001') sections = [section(header.title, ['Control', 'Title', 'Applicability', 'Justification', 'Status', 'Linked policy'],
      rows.filter(row => row.specification === 'annex_control').map(row => [row.definition_id, row.title, row.soa_applicability || 'undetermined', row.soa_justification || '', labels[row.status],
        source.policies.filter(policy => policyAlignment(policy, key, rows).includes(row.definition_id)).map(policy => policy.title).join('; ')]))];
    else if (key === 'soc-2') sections = [section(header.title, ['Criterion', 'Title', 'Category', 'Owner', 'Readiness'],
      rows.map(row => [row.definition_id, row.title, SOC_CATEGORIES[row.category] ?? null, person(row.owner_id), labels[row.status]]))];
    else sections = [section(header.title, ['ID', 'Title', 'Status', 'Verification', 'Linked work'],
      included.map(row => ({row, work: linkedWork(row, source, key)}))
        .filter(({row, work}) => row.status !== 'addressed' || work.some(item => ['tasks', 'findings'].includes(item.type)))
        .map(({row, work}) => [row.definition_id, row.title, labels[row.status], row.verification || 'not_verified',
          work.map(item => `${{tasks: 'Action item', findings: 'Finding', reviews: 'Review'}[item.type]} ${item.id}: ${item.title || ''} (${item.status || ''})`).join('; ')]))];
  } else if (type === 'risks') sections = [section(header.title, ['Risk', 'Title', 'Score', 'Status', 'Owner', 'Next review'],
    risks.map(row => [row.display_id || row.risk_id, row.title, row.risk_score, row.status, person(row.owner_id), row.next_review]))];
  else if (type === 'vendors') {
    const vendors = source.vendors.map(row => vendorProjection(row, source.reviews));
    sections = [section(header.title, ['Vendor', 'Criticality', 'Data access', 'Assurance', 'Next review', 'Renewal'],
      vendors.map(row => [row.name, criticality(row),
        [...[row.data_relationship || []].flat(), ...[row.data_types || []].flat()].join(', '),
        (row.assurance_records || []).map(artifact => `${artifact.document_name || artifact.type || 'Not recorded'} — ${assuranceStatus(row, artifact).replace(/_/g, ' ')}`).join('; ') || 'None',
        row.next_review, row.contract_renewal || row.contract_expiration]))];
  }
  else sections = [section(header.title, ['Policy', 'Status', 'Version', 'Owner', selected.name + ' alignment'],
    source.policies.map(row => [row.title, row.status, row.version, person(row.owner_id), policyAlignment(row, key, rows).join(', ')]))];
  const sourceHash = await hash(strToU8(guard));
  if (db.user.user_id !== actorId) fail('The authenticated account changed during report generation', 401);
  authority(db, clientId, key);
  if (stable(sourceRecords(db, clientId)) !== guard) fail('Saved report sources changed during generation; generate the report again', 409);
  const completed = now();
  return {header, stats, sections, allowed_formats: formats(key, type).filter(format => format !== 'pdf'), provenance: {source_hash: sourceHash,
    implementation_position: position,
    framework_source_cutoff: `Browser-local saved Demo snapshot; read window ${began} to ${completed}`, read_started_at: began, read_completed_at: completed,
    consistency: 'Browser-local saved Demo snapshot; no authenticated database snapshot is claimed.'}};
}

function tableRows(dto) {
  const h = dto.header;
  return [[h.title], ['Client', h.client.name, 'Program', h.program.name, 'As of', h.as_of],
    ['Prepared by', h.prepared_by.name || h.prepared_by.id, 'GRC lead', h.lead.name || h.lead.id], [h.qualifier],
    ...dto.stats.map(stat => [stat.label, stat.value, stat.detail]),
    ...dto.sections.flatMap(item => [[], [item.title], item.columns, ...item.rows])];
}

function renderCsv(dto) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return strToU8('\uFEFF' + tableRows(dto).map(row => row.map(cell).join(',')).join('\r\n') + '\r\n');
}

function renderXlsx(dto) {
  const xml = value => {
    const text = String(value ?? '');
    if (text.length > 32767 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(text)
        || Array.from(text).some(character => character.codePointAt(0) >= 0xD800 && character.codePointAt(0) <= 0xDFFF)) {
      fail('Saved text could not be preserved faithfully in the selected report format');
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const rows = tableRows(dto).map((row, index) => `<row r="${index + 1}">${row.map(value => `<c t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows + '</sheetData></worksheet>',
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
}

function base64(bytes) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(text);
}

async function retainedBytes(row) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const snapshot = row.snapshot, header = object(snapshot) ? snapshot.header : null;
  if (!object(header) || !object(header.client) || !object(header.program) || !object(header.prepared_by)
      || typeof header.title !== 'string' || typeof header.as_of !== 'string') {
    fail('The retained report failed its content integrity check', 409);
  }
  let bytes;
  try { bytes = Uint8Array.from(atob(row.content_base64), value => value.charCodeAt(0)); }
  catch { return fail('The retained report failed its content integrity check', 409); }
  if (bytes.length !== row.bytes || await hash(bytes) !== row.sha256
      || await hash(strToU8(stable(row.snapshot))) !== row.snapshot_hash
      || row.snapshot?.header?.client?.id !== row.client_id || row.snapshot?.header?.program?.key !== row.framework_key
      || row.snapshot?.header?.title !== row.title || row.snapshot?.header?.as_of !== row.as_of
      || stable(row.snapshot?.header?.prepared_by) !== stable(row.prepared_by)
      || MIME[row.format] !== row.content_type || row.download_url !== `/api/reports/exports/${row.export_id}/download`
      || !/^rpt_[a-f0-9]{32}$/.test(row.export_id) || !/^[A-Za-z0-9._-]+$/.test(row.filename)) fail('The retained report failed its content integrity check', 409);
  return bytes;
}

// The adapter owns session/stale-snapshot guards and the single storage commit.
export async function r4ReportsRequest(db, path, method, params={}, body={}, requestKey) {
  path = path.replace(/^\/api(?=\/reports\/)/, '');
  const download = /^\/reports\/exports\/([^/]+)\/download$/.exec(path);
  if (!['/reports/frameworks', '/reports/preview', '/reports/history', '/reports/exports'].includes(path) && !download) return undefined;
  const actorId = db.user?.user_id;
  const sameActor = () => { if (db.user?.user_id !== actorId) fail('The authenticated account changed during report generation', 401); };
  if (path === '/reports/frameworks' && method === 'get') {
    const client = clientFor(db, params.client_id);
    const selected = new Set((db.requirements || []).filter(row => row.client_id === client.client_id && row.baseline_response === 'applies').map(row => row.baseline_key));
    const enabled = client.onboarding_baseline?.completed || db.baselines?.[client.client_id]?.completed;
    return {data: {client_id: client.client_id, frameworks: enabled ? FRAMEWORKS.filter(framework => selected.has(framework.key))
      .map(framework => frameworkOption(framework.key, client)) : []}, headers: {}, persist: false};
  }
  if (path === '/reports/preview' && method === 'get') return {data: await preview(db, params), headers: {}, persist: false};
  if (path === '/reports/history' && method === 'get') {
    authority(db, params.client_id, params.framework_key);
    const rows = (db.report_exports || []).filter(row => row.client_id === params.client_id && row.framework_key === params.framework_key);
    if (rows.length > 1000) fail('Report export history exceeds the supported complete history size', 413);
    return {data: {exports: rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.export_id.localeCompare(a.export_id)).map(metadata)}, headers: {}, persist: false};
  }
  if (download && method === 'get') {
    const row = (db.report_exports || []).find(item => item.export_id === decodeURIComponent(download[1]));
    if (!row) fail('Report export not found', 404);
    authority(db, row.client_id, row.framework_key);
    const bytes = await retainedBytes(row);
    sameActor();
    authority(db, row.client_id, row.framework_key);
    return {data: new Blob([bytes], {type: row.content_type}), persist: false, headers: {
      'content-type': row.content_type, 'content-disposition': `attachment; filename="${row.filename}"`,
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'}};
  }
  if (path !== '/reports/exports' || method !== 'post') fail('Unknown report operation', 404);
  if (Object.keys(body).some(key => !['client_id', 'framework_key', 'type', 'format', 'as_of'].includes(key))) fail('Unknown report export fields');
  authority(db, body.client_id, body.framework_key);
  if (!TYPES.includes(body.type)) fail('Unknown report type');
  if (!formats(body.framework_key, body.type).includes(body.format)) fail('The selected format is unavailable for this report type');
  if (body.format === 'pdf') fail('PDF reports are unavailable in Explore Demo. Use an authenticated client workspace to export saved assessments.', 501);
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey)) fail('Idempotency-Key is required for report export');
  const prior = db.command_requests?.[JSON.stringify([db.user.user_id, body.client_id, path, requestKey])];
  if (prior) {
    const result = commandRequest(db, path, body.client_id, requestKey, body, () => fail('The retained report receipt is unavailable', 409));
    const saved = (db.report_exports || []).find(row => row.export_id === result.export_id && row.client_id === body.client_id && row.framework_key === body.framework_key);
    if (!saved) fail('The retained export is unavailable; its saved receipt cannot substitute for a file', 409);
    await retainedBytes(saved);
    sameActor();
    authority(db, body.client_id, body.framework_key);
    return {data: metadata(saved), headers: {}, persist: false};
  }
  const dto = await preview(db, body), guard = stable(sourceRecords(db, body.client_id));
  const bytes = body.format === 'csv' ? renderCsv(dto) : renderXlsx(dto);
  const sha256 = await hash(bytes);
  const snapshotHash = await hash(strToU8(stable(dto)));
  sameActor();
  authority(db, body.client_id, body.framework_key);
  if (stable(sourceRecords(db, body.client_id)) !== guard) fail('Saved report sources changed during generation; generate the report again', 409);
  const slug = dto.header.client.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80) || 'client';
  const exportId = 'rpt_' + recordUuid().replace(/-/g, '');
  const row = {export_id: exportId, client_id: body.client_id, framework_key: body.framework_key, type: body.type, format: body.format,
    title: dto.header.title, as_of: dto.header.as_of, created_at: now(), prepared_by: dto.header.prepared_by,
    sha256, bytes: bytes.length, filename: `${slug}-${body.framework_key}-${body.type}-${dto.header.as_of}.${body.format}`,
    content_type: MIME[body.format], download_url: `/api/reports/exports/${exportId}/download`, snapshot: dto,
    snapshot_hash: snapshotHash, content_base64: base64(bytes)};
  const result = commandRequest(db, path, body.client_id, requestKey, body, () => {
    db.report_exports ||= [];
    db.report_exports.push(row);
    audit(db, 'generate', 'report-export', {client_id: body.client_id, title: row.title},
      {framework_key: body.framework_key, type: body.type, format: body.format, sha256});
    // Exports stay outside generic editable IDs; this new audit event owns the file identity.
    db.logs[0].entity_id = exportId;
    return metadata(row);
  });
  return {data: clone(result), headers: {}, persist: true};
}
