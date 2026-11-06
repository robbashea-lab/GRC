import * as modelSource from './cisCanonicalKrustyModel';
import * as sampleSource from './cisCanonicalKrustySamples';
import {krustyArtifactSpecs} from './cisCanonicalKrustyBooks';

const CID = 'demo_krusty_krab', ANCHOR = '2026-11-04T00:00:00.000Z';
const IDS = {framework_assessments:'framework_assessment_id',reviews:'review_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',findings:'finding_id',tasks:'task_id'};
const SINGULAR = {framework_assessment:'framework_assessments',review:'reviews',policy:'policies',
  risk:'risks',vendor:'vendors',ai_system:'ai_systems',finding:'findings',task:'tasks'};
const HEADER = ['type','record_id','context_record','scheduled_date','recorded_date','actor','state','scope','observation','result','basis'];
const PERIOD_COLUMNS = {
  requirements:['definition_id','framework_version','status','owner_id','process_owner_id'],
  policy_coverage:['policy_id','subject_id','version','approval_recorded_at','reported_approved_at']
};
const bookSetHash = items => require('crypto').createHash('sha256').update(JSON.stringify(items),'utf8').digest('hex');
let model, books, rows, bookRows, rawRows;
beforeAll(() => {model = modelSource.krustyArtifactModel(ANCHOR);});
beforeAll(() => {
  books = krustyArtifactSpecs(ANCHOR);
  const rawBooks = books.map(book => ({book,rows:parseBook(book.text)}));
  rawRows = rawBooks.flatMap(item => item.rows);
  bookRows = rawBooks.map(({book,rows}) => ({book,rows:rows.map(row => row.type === 'review_occurrence' ? periodRow(row) : row)}));
  rows = bookRows.flatMap(item => item.rows);
});
afterEach(() => {jest.restoreAllMocks(); jest.useRealTimers();});

// Parse standard CSV, including embedded quotes/newlines, rather than counting
// physical lines or treating Unicode character counts as file byte counts.
function csvInput(text) {
  const header = text.split('\n').find(line => line && !line.startsWith('#'));
  expect(header).toBeDefined();
  return text.slice(text.indexOf(header));
}
function parseBook(text) {
  const input = csvInput(text);
  const parsed = [];
  let fields = [], value = '', quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index+1] === '"') {value += '"'; index++;}
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {fields.push(value); value = '';}
    else if (char === '\n' && !quoted) {fields.push(value); parsed.push(fields); fields = []; value = '';}
    else value += char;
  }
  expect(quoted).toBe(false); expect(fields).toEqual([]); expect(value).toBe('');
  expect(parsed.shift()).toEqual(HEADER);
  return parsed.map(cells => {
    expect(cells).toHaveLength(11);
    return Object.fromEntries(HEADER.map((field,index) => [field,cells[index]]));
  });
}

function sourceBasis(source) {
  const basis = JSON.parse(source.basis);
  for (const [key,fields] of Object.entries(PERIOD_COLUMNS)) {
    if (!basis[key]?.length || !Array.isArray(basis[key][0])) continue;
    basis[key] = basis[key].map(values => {
      expect(Array.isArray(values)).toBe(true);expect(values).toHaveLength(fields.length);
      return Object.fromEntries(fields.map((field,index) => [field,values[index]]));
    });
  }
  return basis;
}
function periodRow(record, sources = rawRows.filter(row => row.type === 'review_period_source')) {
  const source = sources.find(row => row.record_id === record.context_record);
  if (!source) throw new Error('Missing review period source: '+record.context_record);
  const basis = sourceBasis(source);
  if (basis.coverage === 'representative_detail') {
    basis.operating_observation = basis.operating_observation
      ? {execution_reference:record.observation,...basis.operating_observation} : null;
    basis.selection_reasons = JSON.parse(record.basis).selection_reasons;
  }
  return {...record,record_id:source.context_record,context_record:record.record_id,scope:source.scope,
    observation:source.observation,basis:JSON.stringify(basis)};
}
const periodBasis = record => JSON.parse(record.basis);
const csvLine = cells => cells.map(value => '"'+String(value).replaceAll('"','""')+'"').join(',')+'\n';
const rowMultiset = items => items.map(row => JSON.stringify(HEADER.map(field => row[field]))).sort();

test('immutable synthetic CSV books preserve the native byte,file,identity and relationship bounds', () => {
  // Sealed actual RUN2 book set: bytes, order, metadata and primary/occurrence links.
  expect(bookSetHash(books)).toBe('a8aa47880f4c9ba3bbfc462ccee516a58863ef92046e5ee0fd4f4e4e3d709b23');
  const summary = {anchor:ANCHOR,files:books.length,
    bytes:books.reduce((sum,book) => sum+Buffer.byteLength(book.text,'utf8'),0),
    assessments:model.program.assessments.length,review_parents:model.history.reviews.length,
    completed_occurrences:model.history.occurrence_count,findings:model.history.findings.length,
    tasks:model.db.tasks.filter(row => row.client_id === CID).length,
    downloaded_history_coverage:{complete_concise_ledger_periods:rows.filter(row => row.type === 'review_occurrence').length,
      detailed_export:'Clearly classified REPRESENTATIVE, NONEXHAUSTIVE excerpts; all full native periods remain in the application.',
      representative_periods:rows.filter(row => row.type === 'review_occurrence' && periodBasis(row).coverage === 'representative_detail')
        .map(row => ({review_id:row.record_id,occurrence_id:row.context_record,scheduled_date:row.scheduled_date,
          reasons:periodBasis(row).selection_reasons})),
      current_source_details:rows.filter(row => row.type === 'current_source_detail').map(row => ({record_id:row.record_id,context_record:row.context_record,recorded_date:row.recorded_date,result:row.result}))},
    books:books.map(book => ({key:book.key,bytes:Buffer.byteLength(book.text,'utf8'),relationships:book.relationships.length}))};
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'KRUSTY-BOOK-CAPACITY.json'),JSON.stringify(summary,null,2)+'\n');
    fs.writeFileSync(path.join(output,'KRUSTY-BOOKS.json'),JSON.stringify(books)+'\n');
  }
  expect(books.length).toBeGreaterThan(0); expect(books.length).toBeLessThanOrEqual(32);
  expect(new Set(books.map(book => book.evidence_id)).size).toBe(books.length);
  for (const [index,book] of books.entries()) {
    expect(book.key).toBe('record-books-'+(index+1));
    expect(book.evidence_id).toBe(CID+'_canonical_evidence_'+book.key);
    expect(book.filename).toBe('cis-'+book.key+'.csv'); expect(book.mime_type).toBe('text/csv');
    expect(Buffer.byteLength(book.text,'utf8')).toBeLessThanOrEqual(16384);
    expect(book.text).toContain('DEMO — SYNTHETIC DATA'); expect(book.text).toContain(ANCHOR);
    expect(book.text).toContain('not original uploaded or externally verified files');
    expect(book.text).toContain('REPRESENTATIVE, NONEXHAUSTIVE');
    expect(book.relationships.length).toBeGreaterThan(0); expect(book.relationships.length).toBeLessThanOrEqual(100);
    expect(new Set(book.relationships.map(link => [link.kind,link.id,link.occurrence_id || ''].join(':'))).size)
      .toBe(book.relationships.length);
    const parsed = parseBook(book.text);
    expect(csvLine(HEADER)+parsed.map(row => csvLine(HEADER.map(field => row[field]))).join(''))
      .toBe(book.text.slice(book.text.indexOf('"type","record_id"')));
    const kind = SINGULAR[book.linked_type], primary = model.db[kind].find(row => row[IDS[kind]] === book.linked_id);
    expect(primary?.client_id).toBe(CID);
    if (kind === 'reviews') expect(primary.occurrences.some(row => row.occurrence_id === book.occurrence_id)).toBe(true);
    else expect(book.occurrence_id).toBeNull();
  }
  // Every file keeps the complete honest header and names the single legend.
  const marker = '# COLUMN AND REFERENCE LEGEND — cis-record-books-1.csv\n';
  expect(books[0].filename).toBe('cis-record-books-1.csv');
  expect(books.filter(book => book.text.includes(marker))).toHaveLength(1);
  for (const [index,book] of books.entries()) {
    const header = book.text.slice(0,book.text.indexOf('"type","record_id"'));
    expect(header).toContain('DEMO — SYNTHETIC DATA');expect(header).toContain(ANCHOR);
    expect(header).toContain('Retrospective source books; not original uploaded or externally verified files.');
    expect(header).toContain('COMPLETE concise ledger and FULL native history');
    expect(header).toContain('REPRESENTATIVE, NONEXHAUSTIVE historical details. Not certification or assurance.');
    if (index === 0) {
      expect(header).toContain(marker);
      expect(header).toContain('Earlier organization history is not a legacy CIS assessment.');
      expect(header).toContain('context_record names one review_period_source row across this book set');
      expect(header).toContain('Each selected occurrence records its selection_reasons in its own basis');
    } else {
      expect(header).toContain('# Column/reference legend: '+books[0].filename+'.\n');
      expect(header).not.toContain(marker);
      expect(header).not.toContain('# review_occurrence:');
    }
    // This is the actual complete file, including its different first/later
    // header, not a row-only estimate or a reserved byte allowance.
    expect(Buffer.byteLength(book.text,'utf8')).toBeLessThanOrEqual(16384);
  }
});

test('all153 safeguards and all514 stored periods remain represented with real same-client relationships', () => {
  const links = books.flatMap(book => book.relationships);
  for (const assessment of model.program.assessments)
    expect(links.some(link => link.kind === 'framework_assessments' && link.id === assessment.framework_assessment_id)).toBe(true);
  expect(rows.filter(row => row.type === 'operating_sample')).toHaveLength(130);
  expect(rows.filter(row => row.type === 'review_occurrence')).toHaveLength(model.history.occurrence_count);
  expect(model.history.occurrence_count).toBe(514);
  for (const review of model.history.reviews) for (const occurrence of review.occurrences)
    expect(links.filter(link => link.kind === 'reviews' && link.id === review.review_id
      && link.occurrence_id === occurrence.occurrence_id)).toHaveLength(1);
  for (const link of links) {
    const record = model.db[link.kind]?.find(row => row[IDS[link.kind]] === link.id);
    expect(record?.client_id).toBe(CID);
    if (link.occurrence_id) expect(record.occurrences.some(row => row.occurrence_id === link.occurrence_id)).toBe(true);
  }
  const key = (...values) => JSON.stringify(values), expected = [];
  for (const group of sampleSource.krustyOperatingSamples(model.dates)) for (const row of group.rows)
    expected.push(key('operating_sample','fw_'+CID+'_assessment_'+row.safeguards.split('|')[0],row.safeguards,
      row.observed_at,row.entity+' / '+row.source_file+' / '+row.observed_value));
  for (const mapping of model.program.mapping) for (const section of mapping.sections)
    expected.push(key('document_contents',mapping.policy_id,section.ids.join('|'),section.content));
  for (const policy of model.program.policies) for (const decision of policy.decision_history)
    expected.push(key('document_version',policy.policy_id,decision.subject.subject_id));
  for (const [type,records,field] of [['risks',model.operations.risks,'risk_id'],['vendors',model.operations.vendors,'vendor_id'],
    ['ai_systems',model.operations.ai_systems,'ai_system_id'],['findings',model.history.findings,'finding_id'],
    ['tasks',model.db.tasks.filter(row => row.client_id === CID),'task_id']])
    for (const row of records) expected.push(key(type,row[field]));
  for (const review of model.history.reviews) {
    expected.push(key('current_review',review.review_id));
    for (const occurrence of review.occurrences) expected.push(key('review_occurrence',occurrence.occurrence_id));
  }
  expected.push(key('current_source_detail',model.history.reviews.find(row => row.framework_plan_key === 'provider-inventory').review_id));
  const actual = rawRows.filter(row => row.type !== 'review_period_source').map(row => {
    if (row.type === 'operating_sample') return key(row.type,row.record_id,row.context_record,row.recorded_date,row.observation);
    if (row.type === 'document_contents') return key(row.type,row.record_id,row.context_record,row.observation);
    if (row.type === 'document_version') return key(row.type,row.record_id,row.context_record);
    if (['current_review','current_source_detail'].includes(row.type)) return key(row.type,row.context_record);
    return key(row.type,row.record_id);
  });
  expect(actual.sort()).toEqual(expected.sort());
  const actualOccurrences = rawRows.filter(row => row.type === 'review_occurrence').map(row => row.record_id);
  expect(new Set(actualOccurrences).size).toBe(model.history.occurrence_count);
});

test('every ledger row retains its exact scheduled date,completion,actor,outcome and approved-version coverage', () => {
  const ledger = rows.filter(row => row.type === 'review_occurrence');
  expect(new Set(ledger.map(row => row.record_id+':'+row.context_record)).size).toBe(ledger.length);
  for (const review of model.history.reviews) for (const occurrence of review.occurrences) {
    const record = ledger.find(row => row.record_id === review.review_id && row.context_record === occurrence.occurrence_id);
    expect(record).toMatchObject({scheduled_date:occurrence.due_date,recorded_date:occurrence.completed_at,
      actor:occurrence.completed_by,state:occurrence.status,scope:review.title,observation:occurrence.conclusion});
    expect(record.result).toBe(occurrence.outcome+'; Findings: '+(occurrence.finding_ids || []).join(', '));
    const raw = rawRows.find(row => row.type === 'review_occurrence' && row.record_id === occurrence.occurrence_id);
    expect(raw.observation).toBe(occurrence.operating_observation?.execution_reference || '');
    expect(record.recorded_date < ANCHOR).toBe(true);
    const basis = periodBasis(record);
    expect(basis.policy_coverage).toEqual((occurrence.policy_coverage || []).map(row => ({policy_id:row.policy_id,
        subject_id:row.subject_id,version:row.version,approval_recorded_at:row.approval_recorded_at,
        reported_approved_at:row.approval?.reported_approved_at || null})));
    if (basis.coverage === 'representative_detail') {
      expect(basis.requirements).toEqual((occurrence.requirement_snapshot || []).map(row => ({definition_id:row.definition_id,
        framework_version:row.framework_version,status:row.status,owner_id:row.owner_id,process_owner_id:row.process_owner_id})));
      expect(basis.operating_observation).toEqual(occurrence.operating_observation || null);
      expect(basis.source_snapshot).toEqual(occurrence.source_snapshot || null);
      expect(basis.selection_reasons.length).toBeGreaterThan(0);
    } else {
      expect(basis.coverage).toBe('complete_concise_ledger');
      expect(Object.keys(basis).sort()).toEqual(['coverage','policy_coverage']);
    }
    for (const covered of basis.policy_coverage) {
      const policy = model.program.policies.find(row => row.policy_id === covered.policy_id);
      const decision = policy.decision_history.find(row => row.subject.subject_id === covered.subject_id);
      expect(covered.approval_recorded_at).toBe(decision.recorded_at);
      expect(covered.reported_approved_at).toBe(decision.reported_approved_at);
      expect(Number.isFinite(Date.parse(covered.approval_recorded_at))).toBe(true);
      expect(covered.reported_approved_at <= record.recorded_date).toBe(true);
    }
  }
});

test('downloaded period facts retain the dated provider roster,entitlement distinction and as-of safeguard state', () => {
  const ledger = rows.filter(row => row.type === 'review_occurrence');
  const provider = model.history.reviews.find(row => row.framework_plan_key === 'provider-inventory');
  const roster = date => periodBasis(ledger.find(row => row.record_id === provider.review_id && row.scheduled_date === date))
    .source_snapshot.vendor_roster;
  expect(roster('2025-01-28')).toHaveLength(13);
  const january = roster('2026-01-28');
  expect(january).toHaveLength(15);
  expect(january.find(row => row.vendor_id === CID+'_canonical_vendor_retired'))
    .toMatchObject({status:'active',offboarded_at:null});
  const authorization = model.history.reviews.find(row => row.framework_plan_key === 'account-authorization');
  const accountFacts = ledger.filter(row => row.record_id === authorization.review_id).map(row => periodBasis(row))
    .filter(row => row.coverage === 'representative_detail');
  expect(accountFacts.some(row => row.source_snapshot.support_entitlements.some(item => item.status === 'active'
    && item.relationship_status === 'active'))).toBe(true);
  expect(accountFacts.some(row => row.source_snapshot.support_entitlements.some(item => item.status === 'revoked'
    && item.relationship_status === 'active'))).toBe(true);
  const operating = ledger.map(row => periodBasis(row)).filter(row => row.operating_observation);
  expect(operating.length).toBeGreaterThan(0);
  expect(operating.every(row => row.operating_observation.execution_reference
    && row.operating_observation.observation && row.operating_observation.basis)).toBe(true);
  expect(operating.some(row => row.requirements.some(item => item.status !== 'addressed'))).toBe(true);
  expect(operating.some(row => row.requirements.some(item => item.status === 'addressed'))).toBe(true);
  const current = rows.find(row => row.type === 'current_source_detail' && row.context_record === provider.review_id);
  expect(current).toMatchObject({recorded_date:ANCHOR,state:'representative current source',result:'14 active / 1 inactive'});
  expect(current.observation).toContain('not a completed');
  const currentRoster = JSON.parse(current.basis).vendor_roster;
  expect(currentRoster.filter(row => row.status === 'active')).toHaveLength(14);
  expect(currentRoster.filter(row => row.status === 'inactive')).toHaveLength(1);
  expect(currentRoster.find(row => row.vendor_id === CID+'_canonical_vendor_retired').status).toBe('inactive');
});

test('representative details cover required endpoints,each actual covered version and real change boundaries without altering full native history', () => {
  const ledger = rows.filter(row => row.type === 'review_occurrence');
  const detailed = ledger.filter(row => periodBasis(row).coverage === 'representative_detail');
  const selected = new Set(detailed.map(row => row.context_record));
  expect(detailed.length).toBeGreaterThan(0);expect(detailed.length).toBeLessThan(model.history.occurrence_count);
  for (const review of model.program.reviews) {
    expect(review.occurrences.length).toBeGreaterThan(0);
    expect(selected.has(review.occurrences[0].occurrence_id)).toBe(true);
    expect(selected.has(review.occurrences.at(-1).occurrence_id)).toBe(true);
  }
  const actualSubjects = new Set(model.history.reviews.flatMap(review => review.occurrences)
    .flatMap(row => row.policy_coverage || []).map(row => row.subject_id));
  expect(new Set(detailed.flatMap(row => periodBasis(row).policy_coverage).map(row => row.subject_id))).toEqual(actualSubjects);
  for (const review of model.history.reviews) for (const [index,occurrence] of review.occurrences.entries()) {
    if (occurrence.finding_ids?.length || occurrence.outcome !== 'no_findings') expect(selected.has(occurrence.occurrence_id)).toBe(true);
    if (!index) continue;
    const previous = review.occurrences[index-1];
    const state = row => JSON.stringify([row.source_snapshot || null,(row.requirement_snapshot || [])
      .map(item => [item.definition_id,item.framework_version,item.status,item.owner_id,item.process_owner_id])]);
    if (state(previous) !== state(occurrence)) {
      expect(selected.has(previous.occurrence_id)).toBe(true);expect(selected.has(occurrence.occurrence_id)).toBe(true);
    }
  }
  const before = JSON.parse(JSON.stringify(model.db));
  jest.spyOn(modelSource,'krustyArtifactModel').mockReturnValue(model);
  krustyArtifactSpecs(ANCHOR);
  expect(model.db).toEqual(before);
  expect(model.history.reviews.reduce((sum,row) => sum+row.occurrences.length,0)).toBe(514);
});

test('every single-level period source is unique,used and available across the complete book set with no dangling reference', () => {
  const sources = rawRows.filter(row => row.type === 'review_period_source'), references = [];
  expect(sources.length).toBeGreaterThan(0);
  expect(new Set(sources.map(row => row.record_id)).size).toBe(sources.length);
  expect(new Set(sources.map(row => JSON.stringify([row.context_record,row.scope,row.observation,row.basis]))).size).toBe(sources.length);
  const sourceFiles = new Map(books.flatMap(book => parseBook(book.text).filter(row => row.type === 'review_period_source')
    .map(row => [row.record_id,book.key])));
  let crossFileReference = false;
  for (const book of books) for (const row of parseBook(book.text).filter(row => row.type === 'review_occurrence')) {
    const source = sources.find(item => item.record_id === row.context_record);
    expect(source).toBeDefined();references.push(row.context_record);
    const review = model.history.reviews.find(item => item.review_id === source.context_record);
    expect(review.occurrences.some(item => item.occurrence_id === row.record_id)).toBe(true);
    const facts = JSON.parse(source.basis);
    expect(Object.keys(facts).sort()).toEqual(facts.coverage === 'representative_detail'
      ? ['coverage','operating_observation','policy_coverage','requirements','source_snapshot']
      : ['coverage','policy_coverage']);
    if (facts.coverage === 'representative_detail') {
      const selection = JSON.parse(row.basis);
      expect(Object.keys(selection)).toEqual(['selection_reasons']);
      expect(selection.selection_reasons.length).toBeGreaterThan(0);
      expect(periodBasis(periodRow(row)).selection_reasons).toEqual(selection.selection_reasons);
    } else expect(row.basis).toBe('');
    expect(row.scope).toBe('');
    if (sourceFiles.get(row.context_record) !== book.key) crossFileReference = true;
    expect(() => periodRow(row)).not.toThrow();
  }
  expect(new Set(references)).toEqual(new Set(sources.map(row => row.record_id)));
  expect(references.length).toBeGreaterThan(sources.length);
  expect(crossFileReference).toBe(true);
  const referenced = rawRows.find(row => row.type === 'review_occurrence');
  expect(() => periodRow(referenced,sources.filter(row => row.record_id !== referenced.context_record)))
    .toThrow('Missing review period source');
});

test('current Review context uses its actual associated record without inventing completed occurrences', () => {
  const current = rows.filter(row => row.type === 'current_review');
  expect(current).toHaveLength(70);
  for (const review of model.history.reviews) {
    const record = current.find(row => row.context_record === review.review_id);
    const actual = [review.risk_id,review.vendor_id,review.ai_system_id,
      ...(review.framework_safeguards || []).map(id => 'fw_'+CID+'_assessment_'+id)].filter(Boolean);
    expect(actual).toContain(record.record_id);
    expect(record).toMatchObject({scheduled_date:review.due_date || '',state:review.status,scope:review.title});
    expect(record.result).toContain('not a completed execution');
    expect(bookRows.some(({book,rows}) => rows.some(row => row.type === 'current_review' && row.context_record === review.review_id)
      && book.relationships.some(link => link.kind === 'reviews' && link.id === review.review_id && !link.occurrence_id))).toBe(true);
  }
});

test('exact original/current external document subjects and native work decisions keep their separate meanings', () => {
  const versions = rows.filter(row => row.type === 'document_version');
  expect(versions).toHaveLength(18);
  for (const policy of model.program.policies) for (const decision of policy.decision_history)
    expect(versions.find(row => row.record_id === policy.policy_id && row.context_record === decision.subject.subject_id))
      .toMatchObject({recorded_date:decision.reported_approved_at,actor:decision.reported_approver_id,
        state:decision.action,scope:policy.title+' / '+decision.subject.version,observation:decision.subject.summary,
        result:JSON.stringify(decision.subject.basis),basis:decision.provenance});
  expect(new Set(versions.map(row => row.scope.split(' / ').at(-1)))).toEqual(new Set(['1.0','2.0']));
  for (const [type,records,field] of [['risks',model.operations.risks,'risk_id'],['vendors',model.operations.vendors,'vendor_id'],
    ['ai_systems',model.operations.ai_systems,'ai_system_id'],['findings',model.history.findings,'finding_id'],
    ['tasks',model.db.tasks.filter(row => row.client_id === CID),'task_id']])
    for (const record of records) expect(rows.some(row => row.type === type && row.record_id === record[field])).toBe(true);
  const text = books.map(book => book.text).join('\n');
  expect(text).toContain('then-active15'); expect(text).toContain('Old Galley is still active');
  expect(text).toContain('Action completion, Finding validation and Risk closure are separate.');
  expect(text).toContain('not independent verification, a native save, a signature or an uploaded-file claim');
  expect(model.program.assessments.every(row => row.verification === 'needs_validation')).toBe(true);
});

test('book bytes and hashes are independent of visitor-local mutations and the caller execution clock', () => {
  const {createHash} = require('crypto'), expected = books.map(book => createHash('sha256').update(book.text,'utf8').digest('hex'));
  const original = model.db.framework_assessments[0].implementation;
  jest.useFakeTimers().setSystemTime(new Date('2027-02-15T13:00:00.000Z'));
  try {
    model.db.framework_assessments[0].implementation = 'Disposable visitor edit';
    const rebuilt = krustyArtifactSpecs(ANCHOR);
    expect(rebuilt.map(book => createHash('sha256').update(book.text,'utf8').digest('hex'))).toEqual(expected);
    expect(rowMultiset(rebuilt.flatMap(book => parseBook(book.text)))).toEqual(rowMultiset(rawRows));
  } finally {model.db.framework_assessments[0].implementation = original; jest.useRealTimers();}
  expect(books.map(book => book.text).join('\n')).not.toContain('Disposable visitor edit');
});

test('the adjacent November5 UTC cohort follows its actual native plan and emits bounded real UTF8 books without changing November4 bytes', () => {
  const {createHash} = require('crypto'), nextAnchor = '2026-11-05T00:00:00.000Z';
  const hash = text => createHash('sha256').update(Buffer.from(text,'utf8')).digest('hex');
  const previous = books.map(book => hash(book.text));
  const next = modelSource.krustyArtifactModel(nextAnchor), nextBooks = krustyArtifactSpecs(nextAnchor);
  expect(bookSetHash(nextBooks)).toBe('03ff4e5da3c7cbedc78e082ea1a6fe06ec2c212239474a4e9009febdaac8174f');
  const manifest = {anchor:nextAnchor,
    qualification:'Actual source specs and UTF8 bytes only; not native Browser downloads, persistence or acceptance.',
    complete_native_plan:next.history.volume_plan.complete,
    native_occurrences:next.history.occurrence_count,planned_native_occurrences:next.history.volume_plan.counts.planned_past_periods,
    files:nextBooks.map(book => ({key:book.key,evidence_id:book.evidence_id,filename:book.filename,mime_type:book.mime_type,
      utf8_bytes:Buffer.byteLength(book.text,'utf8'),sha256:hash(book.text),relationships:book.relationships.length}))};
  manifest.total_utf8_bytes = manifest.files.reduce((sum,file) => sum+file.utf8_bytes,0);
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'KRUSTY-BOOKS-2026-11-05.json'),JSON.stringify(nextBooks)+'\n');
    fs.writeFileSync(path.join(output,'KRUSTY-BOOKS-2026-11-05-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  expect(next.dates.anchor).toBe(nextAnchor);expect(next.history.anchor).toBe(nextAnchor);
  expect(next.history.volume_plan.complete).toBe(true);expect(next.history.volume_plan.unresolved).toEqual([]);
  expect(next.history.occurrence_count).toBe(next.history.volume_plan.counts.planned_past_periods);
  expect(next.program.assessments).toHaveLength(153);
  expect(nextBooks.length).toBeGreaterThan(0);expect(nextBooks.length).toBeLessThanOrEqual(32);
  expect(new Set(nextBooks.map(book => book.evidence_id)).size).toBe(nextBooks.length);
  const linkedOccurrences = new Set();
  for (const book of nextBooks) {
    expect(book.text).toContain(nextAnchor);expect(book.mime_type).toBe('text/csv');
    expect(Buffer.byteLength(book.text,'utf8')).toBeLessThanOrEqual(16384);
    expect(book.relationships.length).toBeGreaterThan(0);expect(book.relationships.length).toBeLessThanOrEqual(100);
    parseBook(book.text);
    for (const link of book.relationships) {
      const actual = next.db[link.kind]?.find(row => row[IDS[link.kind]] === link.id);
      expect(actual?.client_id).toBe(CID);
      if (link.occurrence_id) {
        expect(link.kind).toBe('reviews');
        expect(actual.occurrences.filter(row => row.occurrence_id === link.occurrence_id)).toHaveLength(1);
        linkedOccurrences.add(link.occurrence_id);
      }
    }
  }
  const nativeOccurrences = next.history.reviews.flatMap(row => row.occurrences).map(row => row.occurrence_id);
  expect(new Set(nativeOccurrences).size).toBe(next.history.occurrence_count);
  expect(linkedOccurrences).toEqual(new Set(nativeOccurrences));
  expect(krustyArtifactSpecs(ANCHOR).map(book => hash(book.text))).toEqual(previous);
});

test.each([
  ['2028-02-29T00:00:00.000Z',729,63,32,'d1219d1e586d78ff0da00d2393bf96efc17a5300e79c92676639a33581dd3a8c'],
  ['2030-01-01T00:00:00.000Z',979,70,37,null]
])('overflow-only CSV tables preserve every native ledger and representative value at %s',
  (anchor,expectedPeriods,expectedDetailedPeriods,expectedFiles,sealedBookSetHash) => {
    const future = modelSource.krustyArtifactModel(anchor), before = JSON.parse(JSON.stringify(future.db));
    jest.spyOn(modelSource,'krustyArtifactModel').mockReturnValue(future);
    let futureBooks;
    try {futureBooks = krustyArtifactSpecs(anchor);}
    catch (error) {
      if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
        const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
        fs.mkdirSync(output,{recursive:true});
        fs.writeFileSync(path.join(output,'KRUSTY-BOOKS-'+anchor.slice(0,10)+'-CAPACITY.json'),
          JSON.stringify({anchor,native_periods:future.history.occurrence_count,error:error.message},null,2)+'\n');
      }
      throw error;
    }
    const parsed = futureBooks.flatMap(book => parseBook(book.text));
    const sources = parsed.filter(row => row.type === 'review_period_source');
    const ledger = parsed.filter(row => row.type === 'review_occurrence').map(row => periodRow(row,sources));
    const selection = new Map(), coveredSubjects = new Set();
    const select = (occurrence,reason) => {
      const reasons = selection.get(occurrence.occurrence_id) || [];
      if (!reasons.includes(reason)) reasons.push(reason);
      selection.set(occurrence.occurrence_id,reasons);
    };
    for (const review of future.history.reviews) {
      if (future.program.reviews.some(row => row.review_id === review.review_id)) {
        select(review.occurrences[0],'earliest_framework_cycle');
        select(review.occurrences.at(-1),'latest_framework_cycle');
      }
      for (const [index,occurrence] of review.occurrences.entries()) {
        for (const covered of occurrence.policy_coverage || []) if (!coveredSubjects.has(covered.subject_id)) {
          coveredSubjects.add(covered.subject_id);select(occurrence,'effective_policy_subject:'+covered.subject_id);
        }
        const state = row => JSON.stringify([row.source_snapshot || null,(row.requirement_snapshot || [])
          .map(item => [item.definition_id,item.framework_version,item.status,item.owner_id,item.process_owner_id])]);
        if (index && state(review.occurrences[index-1]) !== state(occurrence)) {
          select(review.occurrences[index-1],'before_source_or_requirement_change');
          select(occurrence,'after_source_or_requirement_change');
        }
        if (occurrence.finding_ids?.length || occurrence.outcome !== 'no_findings') select(occurrence,'recorded_findings_or_exception');
      }
    }
    const report = {anchor,qualification:'Source fixture bytes and relationships only; not Browser downloads or acceptance.',
      native_periods:future.history.occurrence_count,ledger_periods:ledger.length,representative_periods:selection.size,
      files:futureBooks.length,total_utf8_bytes:futureBooks.reduce((sum,book) => sum+Buffer.byteLength(book.text,'utf8'),0),
      ordered_book_set_sha256:bookSetHash(futureBooks)};
    if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
      const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
      fs.mkdirSync(output,{recursive:true});
      fs.writeFileSync(path.join(output,'KRUSTY-BOOKS-'+anchor.slice(0,10)+'-CAPACITY.json'),JSON.stringify(report,null,2)+'\n');
      fs.writeFileSync(path.join(output,'KRUSTY-BOOKS-'+anchor.slice(0,10)+'.json'),JSON.stringify(futureBooks)+'\n');
    }
    expect(future.history.volume_plan.complete).toBe(true);
    expect(future.history.volume_plan.counts.planned_past_periods).toBe(future.history.occurrence_count);
    expect(future.history.occurrence_count).toBe(expectedPeriods);expect(selection.size).toBe(expectedDetailedPeriods);
    expect(futureBooks.length).toBe(expectedFiles);expect(futureBooks.length).toBeLessThanOrEqual(40);
    if (sealedBookSetHash) expect(bookSetHash(futureBooks)).toBe(sealedBookSetHash);
    expect(futureBooks[0].text).toContain('# Compact period-source tables');
    for (const [key,fields] of Object.entries(PERIOD_COLUMNS))
      expect(futureBooks[0].text).toContain('# '+key+' columns: '+fields.join(', ')+'.\n');
    expect(new Set(sources.map(row => row.record_id)).size).toBe(sources.length);
    expect(new Set(ledger.map(row => row.context_record)).size).toBe(future.history.occurrence_count);
    expect(ledger).toHaveLength(future.history.occurrence_count);
    for (const source of sources) {
      const basis = JSON.parse(source.basis);
      for (const key of Object.keys(PERIOD_COLUMNS)) if (basis[key])
        expect(basis[key].every(row => Array.isArray(row) && row.length === PERIOD_COLUMNS[key].length)).toBe(true);
    }
    for (const review of future.history.reviews) for (const occurrence of review.occurrences) {
      const raw = parsed.find(row => row.type === 'review_occurrence' && row.record_id === occurrence.occurrence_id);
      const record = ledger.find(row => row.context_record === occurrence.occurrence_id);
      expect(record).toMatchObject({record_id:review.review_id,context_record:occurrence.occurrence_id,
        scheduled_date:occurrence.due_date,recorded_date:occurrence.completed_at,actor:occurrence.completed_by,
        state:occurrence.status,scope:review.title,observation:occurrence.conclusion});
      expect(record.result).toBe(occurrence.outcome+'; Findings: '+(occurrence.finding_ids || []).join(', '));
      expect(raw.observation).toBe(occurrence.operating_observation?.execution_reference || '');
      expect(record.recorded_date < anchor).toBe(true);
      const policyCoverage = (occurrence.policy_coverage || []).map(row => ({policy_id:row.policy_id,
        subject_id:row.subject_id,version:row.version,approval_recorded_at:row.approval_recorded_at,
        reported_approved_at:row.approval?.reported_approved_at || null}));
      const expected = selection.has(occurrence.occurrence_id) ? {coverage:'representative_detail',
        requirements:(occurrence.requirement_snapshot || []).map(row => ({definition_id:row.definition_id,
          framework_version:row.framework_version,status:row.status,owner_id:row.owner_id,process_owner_id:row.process_owner_id})),
        policy_coverage:policyCoverage,operating_observation:occurrence.operating_observation || null,
        source_snapshot:occurrence.source_snapshot || null,selection_reasons:selection.get(occurrence.occurrence_id)}
        : {coverage:'complete_concise_ledger',policy_coverage:policyCoverage};
      expect(periodBasis(record)).toEqual(expected);
    }
    const links = futureBooks.flatMap(book => book.relationships);
    for (const assessment of future.program.assessments)
      expect(links.some(link => link.kind === 'framework_assessments' && link.id === assessment.framework_assessment_id)).toBe(true);
    for (const book of futureBooks) {
      expect(Buffer.byteLength(book.text,'utf8')).toBeLessThanOrEqual(16384);
      expect(book.relationships.length).toBeGreaterThan(0);expect(book.relationships.length).toBeLessThanOrEqual(100);
      expect(book.text).toContain(anchor);expect(book.text).toContain('REPRESENTATIVE, NONEXHAUSTIVE');
      expect(book.text).toContain('not original uploaded or externally verified files');
      for (const link of book.relationships) {
        const actual = future.db[link.kind]?.find(row => row[IDS[link.kind]] === link.id);
        expect(actual?.client_id).toBe(CID);
        if (link.occurrence_id) expect(actual.occurrences.some(row => row.occurrence_id === link.occurrence_id)).toBe(true);
      }
      const actual = future.db[SINGULAR[book.linked_type]].find(row => row[IDS[SINGULAR[book.linked_type]]] === book.linked_id);
      expect(actual.client_id).toBe(CID);
      if (book.linked_type === 'review') expect(actual.occurrences.some(row => row.occurrence_id === book.occurrence_id)).toBe(true);
      else expect(book.occurrence_id).toBeNull();
    }
    for (const review of future.history.reviews) for (const occurrence of review.occurrences)
      expect(links.filter(link => link.kind === 'reviews' && link.id === review.review_id
        && link.occurrence_id === occurrence.occurrence_id)).toHaveLength(1);
    expect(future.db).toEqual(before);
  });

test('missing or foreign safeguard identities and nonexistent historical occurrences fail closed', () => {
  const absent = {...model,db:{...model.db,framework_assessments:model.db.framework_assessments.slice(1)}};
  const source = jest.spyOn(modelSource,'krustyArtifactModel').mockReturnValue(absent);
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('actual same-client record or occurrence');
  source.mockReturnValue({...model,db:{...model.db,framework_assessments:model.db.framework_assessments.map((row,index) =>
    index ? row : {...row,client_id:'foreign_client'})}});
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('actual same-client record or occurrence');
  source.mockReturnValue({...model,db:{...model.db,reviews:model.db.reviews.map(row => ({...row,occurrences:[]}))}});
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('actual same-client record or occurrence');
});

test('an oversized evidence row fails instead of truncating its claimed content', () => {
  let changed = false;
  const history = {...model.history,reviews:model.history.reviews.map(review => ({...review,
    occurrences:review.occurrences.map(row => {
      if (changed) return row;
      changed = true; return {...row,conclusion:'Synthetic oversized observation '+ 'x'.repeat(17000)};
    })}))};
  jest.spyOn(modelSource,'krustyArtifactModel').mockReturnValue({...model,history});
  expect(changed).toBe(true);
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('evidence row exceeds the native file/link bounds');
});

test('aggregate file and per-row relationship overflow reject the full source without silent omissions', () => {
  let changed = 0;
  const history = {...model.history,reviews:model.history.reviews.map(review => ({...review,
    occurrences:review.occurrences.map(row => {
      const index = changed++;
      return index < 36 ? {...row,conclusion:'Synthetic distinct bounded observation '+index+' '+ 'x'.repeat(9000)} : row;
    })}))};
  const source = jest.spyOn(modelSource,'krustyArtifactModel').mockReturnValue({...model,history});
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('the approved limit is40 files');
  source.mockReturnValue(model);
  const samples = sampleSource.krustyOperatingSamples(model.dates), first = samples[0].rows[0];
  jest.spyOn(sampleSource,'krustyOperatingSamples').mockReturnValue([{key:'bounded-source',title:'Synthetic relationship overflow',
    rows:[{...first,safeguards:model.program.assessments.map(row => row.definition_id).join('|')}]}]);
  expect(() => krustyArtifactSpecs(ANCHOR)).toThrow('evidence row exceeds the native file/link bounds');
});
