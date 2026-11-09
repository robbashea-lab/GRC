import {brawndoInventoryDraft} from './brawndoInventoryDraft';
import {catalogForVersion, generateResult, versionForSafeguard} from './guidedAssessment';

const version = versionForSafeguard('1.1');
const date = new Date('2026-11-08T12:00:00Z');
const evaluate = (answers, sourceVersion = version) => generateResult('1.1', answers, date, sourceVersion);
const draft = answers => brawndoInventoryDraft(answers, version, evaluate(answers));
const complete = () => ({
  inventory: 'Yes',
  coverage: Object.fromEntries(catalogForVersion(version).safeguards['1.1'].find(question => question.id === 'coverage').rows.map(row => [row, 'Yes'])),
  attributes: Object.fromEntries(catalogForVersion(version).safeguards['1.1'].find(question => question.id === 'attributes').rows.map(row => [row, 'Yes'])),
  maintenance: 'Yes', frequency: 'Every six months', last_review: '2026-11-01',
  additional_gap: 'No', additional_confirmation: 'No',
});
const sections = text => {
  const [practice, remaining] = text.split('\n\nIdentified gaps\n');
  const [gaps, confirmation] = remaining.split('\n\nItems requiring confirmation\n');
  return {practice, gaps, confirmation};
};

test.each([
  ['Yes', 'reports maintaining an enterprise asset inventory.'],
  ['Partially', 'reports a partially established enterprise asset inventory.'],
  ['No', 'reports that an enterprise asset inventory is not currently in place.'],
  ['Not sure', 'has not confirmed whether an enterprise asset inventory is in place.'],
])('the %s inventory answer is reported without inventing a stronger position', (inventory, opening) => {
  const text = draft({inventory});
  expect(text.startsWith('Brawndo ' + opening)).toBe(true);
  expect(typeof text).toBe('string');
  if (inventory === 'No' || inventory === 'Not sure') expect(sections(text).practice).not.toContain('reports maintaining');
});

test('blank answers do not invent cadence, a tool, an owner, a completed review or evidence', () => {
  const answers = {}, result = evaluate(answers), text = brawndoInventoryDraft(answers, version, result);
  const {practice, confirmation} = sections(text);
  expect(practice).toBe('Brawndo has not confirmed whether an enterprise asset inventory is in place.');
  for (const unknown of result.unknowns) expect(confirmation).toContain(unknown);
  expect(text).not.toContain('Every six months');
  expect(text).not.toContain('2026-11-08');
  expect(text).not.toContain('NinjaOne');
  expect(text).not.toContain('Dale');
});

test.each(['NinjaOne', 'Microsoft Intune', '  Bespoke register / plant “A”\nSharePoint → asset-list.csv  '])('the reported tool/location remains exact: %s', system => {
  const {practice} = sections(draft({...complete(), system}));
  expect(practice).toContain(`Reported inventory tool or location: “${system}”.`);
  expect(practice).not.toContain('NinjaOne provides complete enterprise coverage');
});

test.each(['Not sure', 'Unknown', 'not known', ' UNSURE '])('uncertain tool and owner %s stay under confirmation', value => {
  const {practice, confirmation} = sections(draft({...complete(), system: value, owner: value}));
  expect(practice).not.toContain('Reported inventory tool or location');
  expect(practice).not.toContain('Reported inventory responsibility');
  expect(confirmation).toContain(`Reported inventory tool or location: “${value}”.`);
  expect(confirmation).toContain(`Reported inventory responsibility: “${value}”.`);
  expect(confirmation).not.toContain('The inventory uses Not sure');
});

test('optional reported context, responsibility, review date and source scope are preserved without verification claims', () => {
  const answers = {...complete(), owner: 'Client IT maintains it; MSP supplies discovery exports.',
    sources: 'Multiple reconciled sources', sources_detail: 'RMM covers managed endpoints; cloud records cover subscriptions.',
    maintenance_detail: 'Add through change tickets; retain retired entries.', evidence: 'An export may be available; ask the asset team.',
    coverage_detail: 'Compare remote scope with IT; no independent check was performed.'};
  const {practice, confirmation} = sections(draft(answers));
  for (const key of ['owner', 'sources_detail', 'maintenance_detail', 'evidence']) expect(practice).toContain(`“${answers[key]}”`);
  expect(confirmation).toContain(`“${answers.coverage_detail}”`);
  expect(practice).not.toContain(answers.coverage_detail);
  expect(practice).toContain('not independently verified');
  expect(confirmation).toContain('not separately classified');
  expect(practice).toContain('Asset additions, changes and retirements are reported to be reflected consistently in the inventory.');
  expect(practice).toContain('The complete inventory is reportedly reviewed and updated every six months.');
  expect(practice).toContain('Reported last complete inventory review date: “2026-11-01”.');
  expect(practice).not.toContain('verified by');
});

test('annual practice stays annual and the existing evaluator supplies its requirement gap', () => {
  const answers = {...complete(), frequency: 'Annually'}, result = evaluate(answers);
  const {practice, gaps} = sections(brawndoInventoryDraft(answers, version, result));
  expect(practice).toContain('The complete inventory is reportedly reviewed and updated annually.');
  expect(practice).not.toContain('Every six months');
  expect(result.signals).toContainEqual({questionId: 'frequency', kind: 'gap'});
  for (const gap of result.gaps) expect(gaps).toContain(gap);
});

test('positive, deficient and uncertain matrix rows remain distinct and native messages remain intact', () => {
  const answers = complete();
  answers.coverage.Servers = 'No';
  answers.coverage['Cloud-hosted assets'] = 'Not sure';
  answers.attributes.Department = 'Partially';
  const result = evaluate(answers), {practice, gaps, confirmation} = sections(brawndoInventoryDraft(answers, version, result));
  expect(practice).toContain('The reported inventory covers: End-user devices; Portable and mobile devices;');
  expect(practice).toContain('Machine name; Asset owner; Approved to connect.');
  expect(practice.match(/The reported inventory covers:/g)).toHaveLength(1);
  expect(practice.match(/The inventory is reported to record:/g)).toHaveLength(1);
  expect(gaps).toContain('Servers: No');
  expect(gaps).toContain('Department: Partially');
  expect(confirmation).toContain('Cloud-hosted assets: Not sure');
  expect(gaps.split('Servers: No')).toHaveLength(2);
  expect(gaps.split('Department: Partially')).toHaveLength(2);
  for (const gap of result.gaps) expect(gaps).toContain(gap);
  for (const unknown of result.unknowns) expect(confirmation).toContain(unknown);
});

test('reported non-applicability keeps its supplied rationale without becoming an affirmative coverage claim', () => {
  const answers = complete();
  answers.attributes['Static network address where applicable'] = 'Not applicable';
  answers.scope_reason = 'All addresses in this scoped segment are dynamically assigned.';
  const text = draft(answers);
  expect(text).toContain('Reported non-applicability: Static network address where applicable.');
  expect(text).toContain(`Reported applicability explanation: “${answers.scope_reason}”.`);
});

test.each(['No', 'Not sure'])('%s inventory suppresses inactive saved facts and preserves the source answers', inventory => {
  const answers = {...complete(), inventory, system: 'HIDDEN TOOL', owner: 'HIDDEN OWNER', frequency: 'Annually',
    sources: 'Multiple reconciled sources', sources_detail: 'HIDDEN SOURCE SCOPE',
    maintenance_detail: 'HIDDEN UPDATE PROCESS', scope_reason: 'HIDDEN SCOPE', existing: 'Only the finance list exists; IT can confirm its scope.'};
  const before = JSON.stringify(answers), text = draft(answers);
  for (const hidden of ['HIDDEN', 'Annually', '2026-11-01', 'End-user devices']) expect(text).not.toContain(hidden);
  expect(text).toContain(`“${answers.existing}”`);
  expect(JSON.stringify(answers)).toBe(before);
});

test('inactive source detail and declined additional gap/uncertainty branches are not used', () => {
  const answers = {...complete(), sources: 'One source', sources_detail: 'INACTIVE SOURCE NOTE',
    gaps: 'INACTIVE GAP', unknowns: 'INACTIVE UNCERTAINTY'};
  const text = draft(answers);
  expect(text).not.toContain('INACTIVE');
  expect(text).toContain('No additional gaps were reported in these answers.');
});

test('active supplied gap and uncertainty prose remain exact and separate', () => {
  const answers = {...complete(), additional_gap: 'Yes', gaps: '  Missing two retired-device entries.\nConfirm exact IDs.  ',
    additional_confirmation: 'Yes', unknowns: '  Ask IT whether the contractor segment is included.  '};
  const {gaps, confirmation} = sections(draft(answers));
  expect(gaps).toContain(`“${answers.gaps}”`);
  expect(confirmation).toContain(`“${answers.unknowns}”`);
  expect(gaps).not.toContain(answers.unknowns);
});

test('native generated follow-up and uncertainty appear once as exact quoted detail without mutating other messages or inputs', () => {
  const answers = {...complete(), additional_gap: 'Yes', gaps: '  Retired appliance entries are missing.  ',
    additional_confirmation: 'Yes', unknowns: '  Ask IT whether temporary devices are included.  '};
  const result = evaluate(answers);
  expect(result.gaps).toContain(`Reviewer-reported follow-up: ${answers.gaps.trim()}`);
  expect(result.unknowns).toContain(`Reviewer-reported uncertainty: ${answers.unknowns.trim()}`);
  result.gaps.push('Reviewer-reported follow-up: A separate native gap remains exact.');
  result.unknowns.push('Reviewer-reported uncertainty: A separate native confirmation remains exact.');
  const before = JSON.stringify({answers, result});
  Object.freeze(answers); Object.freeze(result.gaps); Object.freeze(result.unknowns); Object.freeze(result);
  const text = brawndoInventoryDraft(answers, version, result), {gaps, confirmation} = sections(text);
  expect(text.split(answers.gaps.trim())).toHaveLength(2);
  expect(text.split(answers.unknowns.trim())).toHaveLength(2);
  expect(gaps).toContain(`Additional reported gap detail: “${answers.gaps}”.`);
  expect(confirmation).toContain(`Additional reported uncertainty: “${answers.unknowns}”.`);
  expect(gaps).not.toContain(`Reviewer-reported follow-up: ${answers.gaps.trim()}`);
  expect(confirmation).not.toContain(`Reviewer-reported uncertainty: ${answers.unknowns.trim()}`);
  expect(gaps).toContain('Reviewer-reported follow-up: A separate native gap remains exact.');
  expect(confirmation).toContain('Reviewer-reported uncertainty: A separate native confirmation remains exact.');
  expect(JSON.stringify({answers, result})).toBe(before);
});

test('explicit unresolved responsibility and source-scope notes stay exact under confirmation', () => {
  const owner = 'IT or the provider — the operator has not confirmed the split.';
  const sources_detail = 'Endpoint scope is reported; remote coverage is unconfirmed.';
  const coverage_detail = 'The team is not sure whether supplier devices are included.';
  const {practice, confirmation} = sections(draft({...complete(), owner,
    sources: 'Multiple reconciled sources', sources_detail, coverage_detail}));
  for (const report of [owner, sources_detail, coverage_detail]) {
    expect(confirmation).toContain(`“${report}”`);
    expect(practice).not.toContain(report);
  }
});

test('unlisted tool and responsibility prose without an explicit uncertainty statement remain reported context', () => {
  const system = 'Unknowns Tracker / inventory.xlsx', owner = 'IT maintains entries; the provider exports discovery data.';
  const {practice} = sections(draft({...complete(), system, owner}));
  expect(practice).toContain(`Reported inventory tool or location: “${system}”.`);
  expect(practice).toContain(`Reported inventory responsibility: “${owner}”.`);
});

test('the supplied native result is authoritative and no narrative/status/evidence/date fields leak into the wording', () => {
  const answers = complete(), result = {...evaluate(answers), status: 'needs_attention',
    narrative: 'DO NOT COPY THIS OLD GENERATED NARRATIVE', evidence: ['DO NOT INVENT THIS EVIDENCE'],
    gaps: ['NATIVE GAP: retained exactly.'], unknowns: ['NATIVE CONFLICT: ask the responsible team.']};
  const text = brawndoInventoryDraft(answers, version, result, 'Synthetic client');
  expect(text.startsWith('Synthetic client reports maintaining')).toBe(true);
  expect(text).toContain('NATIVE GAP: retained exactly.');
  expect(text).toContain('NATIVE CONFLICT: ask the responsible team.');
  expect(text).not.toContain('DO NOT');
  expect(text).not.toContain('needs_attention');
});

test('original mixed historical follow-up is retained as confirmation, not upgraded to a confirmed gap', () => {
  const sourceVersion = 'brawndo-cis-pilot-1';
  const answers = {inventory: 'No', gaps: 'Unknown coverage; ask IT which records exist.'};
  const result = evaluate(answers, sourceVersion), before = JSON.stringify({answers, result});
  const {gaps, confirmation} = sections(brawndoInventoryDraft(answers, sourceVersion, result));
  expect(confirmation).toContain('Historical follow-up, not classified as a confirmed gap');
  expect(confirmation).toContain(`“${answers.gaps}”`);
  expect(gaps).not.toContain(answers.gaps);
  expect(JSON.stringify({answers, result})).toBe(before);
});

test('answer and evaluated-result objects are immutable inputs, including arrays and matrices', () => {
  const answers = complete(), result = evaluate(answers);
  Object.values(answers).filter(value => value && typeof value === 'object').forEach(Object.freeze);
  Object.values(result).filter(value => value && typeof value === 'object').forEach(Object.freeze);
  Object.freeze(answers); Object.freeze(result);
  const before = JSON.stringify({answers, result});
  expect(typeof brawndoInventoryDraft(answers, version, result)).toBe('string');
  expect(JSON.stringify({answers, result})).toBe(before);
});
