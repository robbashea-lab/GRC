import {initechArtifactModel} from './cisCanonicalInitechModel';
import {initechArtifactSpecs} from './cisCanonicalInitechBooks';

const CID = 'demo_initech', ANCHOR = '2026-11-02T00:00:00.000Z';
const IDS = {framework_assessments:'framework_assessment_id', reviews:'review_id', policies:'policy_id',
  risks:'risk_id', vendors:'vendor_id', ai_systems:'ai_system_id', findings:'finding_id', tasks:'task_id'};
const SINGULAR = {framework_assessment:'framework_assessments', review:'reviews', policy:'policies',
  risk:'risks', vendor:'vendors', ai_system:'ai_systems', finding:'findings', task:'tasks'};
let model, books;
beforeAll(() => {model = initechArtifactModel(ANCHOR);});
beforeAll(() => {books = initechArtifactSpecs(ANCHOR);});

test('meaningful immutable CSV books stay within existing file and relationship limits', () => {
  const summary = {anchor:ANCHOR, files:books.length, bytes:books.reduce((sum, book) => sum+Buffer.byteLength(book.text, 'utf8'),0),
    assessments:model.program.assessments.length, review_parents:model.history.reviews.length,
    completed_occurrences:model.history.occurrence_count, findings:model.history.findings.length,
    tasks:model.db.tasks.filter(row => row.client_id === CID).length,
    assessment_history_events:model.program.assessments.reduce((sum, row) => sum+row.assessment_history.length,0),
    books:books.map(book => ({key:book.key,bytes:Buffer.byteLength(book.text, 'utf8'),relationships:book.relationships.length}))};
  if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
    const fs = require('fs'), path = require('path'), output = process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, 'INITECH-BOOK-CAPACITY.json'), JSON.stringify(summary,null,2)+'\n');
    fs.writeFileSync(path.join(output, 'INITECH-BOOKS.json'), JSON.stringify(books)+'\n');
  }
  expect(books.length).toBeGreaterThan(0); expect(books.length).toBeLessThanOrEqual(32);
  expect(new Set(books.map(book => book.evidence_id)).size).toBe(books.length);
  for (const book of books) {
    expect(Buffer.byteLength(book.text, 'utf8')).toBeLessThanOrEqual(16384);
    expect(book.text).toContain('DEMO — SYNTHETIC DATA'); expect(book.text).toContain(ANCHOR);
    expect(book.relationships.length).toBeGreaterThan(0); expect(book.relationships.length).toBeLessThanOrEqual(100);
    const kind = SINGULAR[book.linked_type];
    const primary = model.db[kind].find(row => row[IDS[kind]] === book.linked_id);
    expect(primary?.client_id).toBe(CID);
    if (kind === 'reviews') expect(primary.occurrences.some(row => row.occurrence_id === book.occurrence_id)).toBe(true);
    else expect(book.occurrence_id).toBeNull();
  }
});

test('every safeguard and saved Review occurrence has a real same-client book relationship', () => {
  const links = books.flatMap(book => book.relationships);
  for (const assessment of model.program.assessments)
    expect(links.some(link => link.kind === 'framework_assessments' && link.id === assessment.framework_assessment_id)).toBe(true);
  for (const review of model.history.reviews) for (const occurrence of review.occurrences)
    expect(links.filter(link => link.kind === 'reviews' && link.id === review.review_id
      && link.occurrence_id === occurrence.occurrence_id)).toHaveLength(1);
  for (const link of links) {
    const record = model.db[link.kind]?.find(row => row[IDS[link.kind]] === link.id);
    expect(record?.client_id).toBe(CID);
    if (link.occurrence_id) expect(record.occurrences.some(row => row.occurrence_id === link.occurrence_id)).toBe(true);
  }
});

test('pending amendments, original approvals and unknown assessment plans retain their distinct meanings', () => {
  const text = books.map(book => book.text).join('\n');
  expect(text).toContain('2.1-draft'); expect(text).toContain('pending amendment');
  expect(text).toContain('"1.2|1.4"');
  expect(text).toContain('external_approval_recorded'); expect(text).toContain('2.0'); expect(text).toContain('1.0');
  expect(text).toContain('2026-07-02T00:00:00.000Z'); expect(text).toContain('2026-10-25T00:00:00.000Z');
  expect(text).toContain('No restore execution,passed result,completed occurrence or historical test sequence is supplied.');
  expect(text).toContain('No network-IDS sensor coverage,passed detection,completed test or inferred implementation is supplied.');
  expect(model.history.reviews.find(row => row.framework_safeguards?.includes('11.5')
    && row.framework_setup_key)?.occurrences).toEqual([]);
});

test('book bytes are independent of editable current records and the caller execution clock', () => {
  const expected = books.map(book => book.text);
  model.db.framework_assessments[0].implementation = 'Disposable visitor text';
  jest.useFakeTimers().setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
  try {expect(initechArtifactSpecs(ANCHOR).map(book => book.text)).toEqual(expected);}
  finally {jest.useRealTimers();}
  expect(expected.join('\n')).not.toContain('Disposable visitor text');
});
