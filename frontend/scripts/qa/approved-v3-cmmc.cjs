const assert = require('node:assert/strict');
const fs = require('node:fs');
const {strFromU8, unzipSync} = require('fflate');

const clientId = 'v3sample_cyberdyne';
const requirement = '3.1.4';
const practice = 'AC.L2-3.1.4';
const poamId = 'POAM-3.1.4';
const narrative = 'Synthetic QA judgment. Separation of duties requires remediation.';

function sheet(workbook, number) {
  const bytes = workbook['xl/worksheets/sheet'+number+'.xml'];
  assert.ok(bytes, 'The exported workbook must include worksheet '+number);
  return strFromU8(bytes);
}

function cell(xml, ref) {
  const body = xml.match(new RegExp('<c r="'+ref+'"(?:\\s[^>]*)?(?<!/)>([\\s\\S]*?)</c>'))?.[1];
  assert.ok(body, 'Missing exported cell '+ref);
  return body.match(/<v>(.*?)<\/v>/s)?.[1] ?? body.match(/<t(?: [^>]+)?>(.*?)<\/t>/s)?.[1];
}

function rowWith(xml, column, value) {
  const rows = [];
  for (const [, row, body] of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    if (new RegExp('<c r="'+column+row+'"[^>]*>\\s*<(?:is|v)>').test(body) && cell(body, column+row) === value)
      rows.push({row, body});
  }
  assert.equal(rows.length, 1, 'Expected exactly one workbook row for '+value);
  return rows[0];
}

async function downloadWorkbook(page, control, filename) {
  const [download] = await Promise.all([page.waitForEvent('download'), control.click()]);
  assert.equal(download.suggestedFilename(), clientId+'-cmmc-'+filename+'.xlsx');
  return unzipSync(fs.readFileSync(await download.path()));
}

module.exports = async function verifyCmmc({page, action, field, route, settle, reload, api, records, waitFor}) {
  const workbook = () => api('/frameworks/cmmc/workbook?client_id='+clientId);
  const selectTab = name => page.getByRole('tab', {name, exact:true}).click();
  const poamRow = page.locator('#cmmc-poam-family-groups [data-action="poam-open"][data-id="'+requirement+'"]');
  const queue = page.locator('#cmmc-poam-results');
  const summary = page.locator('.cmmc-score-number');
  const equation = page.getByLabel('Working score calculation', {exact:true});
  const submission = page.locator('.cmmc-summary-panel details summary').filter({hasText:'Last recorded SPRS submission'});
  const readAssessment = packet => packet.data.assessments.find(row => row.definition_id === requirement);
  const unaffectedAssessments = packet => packet.data.assessments.filter(row => row.definition_id !== requirement)
    .sort((a,b) => a.definition_id.localeCompare(b.definition_id));

  await route('client-cyberdyne-program');
  const before = await workbook();
  assert.equal(before.client.client_id, clientId);
  assert.equal(before.client.name, 'Cyberdyne Systems');
  assert.equal(before.data.configuration.level, 2);
  assert.equal(before.records.client_id, clientId);
  assert.equal(before.records.level, 2);
  assert.equal(before.records.revision, 0);
  assert.equal(Object.hasOwn(before.records, 'posting'), false, 'Pinned client has never recorded an SPRS submission');
  assert.equal(Object.hasOwn(before.records, 'plans'), false, 'Pinned client starts with derived queue items only');
  assert.equal(before.data.assessments.length, 110);
  assert.ok(before.data.assessments.every(row => row.client_id === clientId));
  const original = readAssessment(before);
  assert.equal(original.status, 'addressed');
  assert.equal(original.verification, 'verified');
  await selectTab('POA&M');
  assert.match(await queue.innerText(), /^23 of 23 items shown/);
  assert.equal(await poamRow.count(), 0);
  await selectTab('SPRS Score');
  assert.equal(await summary.innerText(), '51 / 110');
  assert.deepEqual(await equation.locator('strong').allTextContents(), ['110','−44','−15']);
  const submittedLabel = await submission.innerText();
  assert.match(submittedLabel, /Not recorded/);
  await page.locator('[data-action="cmmc-score-view"][data-val="all"]').click();
  await page.getByRole('searchbox', {name:'Search scoring requirements', exact:true}).fill(requirement);
  await page.getByRole('button', {name:'Edit assessment for '+requirement, exact:true}).click();
  assert.equal(await field('cmmcQuickStatus').inputValue(), 'I');
  await field('cmmcQuickStatus').selectOption({label:'Not implemented'});
  await field('cmmcQuickVerification').selectOption({label:'Gap identified'});
  await field('cmmcQuickNarrative').fill(narrative);
  await page.getByRole('button', {name:'Save assessment', exact:true}).click();
  await settle();
  await waitFor(async () => readAssessment(await workbook())?.implementation === narrative,
    'The CMMC assessment did not reach the saved workbook source.');
  await reload();

  const saved = await workbook();
  assert.equal(saved.client.client_id, clientId);
  const judgment = readAssessment(saved);
  assert.equal(judgment.framework_assessment_id, original.framework_assessment_id);
  assert.equal(judgment.status, 'needs_attention');
  assert.equal(judgment.verification, 'gap_identified');
  assert.equal(judgment.implementation, narrative);
  const native = (await records(clientId)).framework_assessments.find(row => row.framework_assessment_id === judgment.framework_assessment_id);
  const savedHistory = native.assessment_history.filter(entry => entry.implementation === narrative);
  assert.equal(savedHistory.length, 1);
  assert.equal(savedHistory[0].status, 'needs_attention');
  assert.equal(savedHistory[0].verification, 'gap_identified');
  assert.equal(savedHistory[0].by, 'qa-owner');
  assert.deepEqual(unaffectedAssessments(saved), unaffectedAssessments(before),
    'The save must leave all other CMMC requirements untouched');
  assert.equal(saved.records.revision, 0, 'Assessment Save does not write independent workbook inputs');
  assert.equal(Object.hasOwn(saved.records, 'posting'), false);
  assert.equal(Object.hasOwn(saved.records, 'plans'), false, 'A gap alone creates no separately saved plan');

  await route('client-brawndo-program');
  assert.equal(await page.getByRole('tab', {name:'SPRS Score', exact:true}).count(), 0);
  await route('client-cyberdyne-program');
  await selectTab('SPRS Score');
  // Fixed oracle for the pinned 110-item fixture plus this one weighted gap.
  // Requirement 3.1.4 contributes one known point and no unresolved points.
  assert.equal(await summary.innerText(), '50 / 110');
  assert.deepEqual(await equation.locator('strong').allTextContents(), ['110','−45','−15']);
  assert.equal(await submission.innerText(), submittedLabel);
  const sprs = await downloadWorkbook(page, action('cmmc-export-score'), 'sprs-score');
  const dashboard = sheet(sprs, 1);
  for (const [ref, expected] of Object.entries({B3:'Cyberdyne Systems', B14:'50', D14:'60', F21:'50', F22:'15', F23:'65', L19:'Not recorded'}))
    assert.equal(cell(dashboard, ref), expected, 'SPRS workbook cell '+ref);
  const scoreRow = rowWith(sheet(sprs, 2), 'A', practice);
  assert.equal(cell(scoreRow.body, 'C'+scoreRow.row), 'Not implemented');
  assert.equal(cell(scoreRow.body, 'D'+scoreRow.row), 'Gap identified');
  assert.equal(cell(scoreRow.body, 'E'+scoreRow.row), '1');
  assert.equal(cell(scoreRow.body, 'F'+scoreRow.row), '0');
  assert.equal(cell(scoreRow.body, 'H'+scoreRow.row), narrative);

  await selectTab('POA&M');
  assert.match(await queue.innerText(), /^24 of 24 items shown/);
  await page.getByRole('searchbox', {name:'Search work items', exact:true}).fill(requirement);
  assert.match(await queue.innerText(), /^1 of 24 items shown/);
  assert.equal(await poamRow.count(), 1);
  assert.equal(await poamRow.locator('.st').innerText(), 'Open');
  assert.equal(await poamRow.locator('.cmmc-point').getAttribute('data-points'), '1');
  await poamRow.click();
  const drawer = page.locator('#drawer');
  assert.match(await drawer.locator('.eyebrow').innerText(), /^POAM-3\.1\.4 · AC\.L2-3\.1\.4$/);
  await drawer.getByRole('tab', {name:'Why this exists', exact:true}).click();
  assert.match(await drawer.getByRole('tabpanel').innerText(), /Potential candidate/);
  await drawer.getByRole('button', {name:'Close', exact:true}).click();
  const poam = await downloadWorkbook(page, action('poam-export'), 'poam');
  const poamSummary = sheet(poam, 1);
  assert.equal(cell(poamSummary, 'B3'), 'Cyberdyne Systems');
  assert.equal(cell(poamSummary, 'B14'), '50');
  assert.equal(cell(poamSummary, 'D14'), '24');
  const plan = rowWith(sheet(poam, 4), 'A', poamId);
  for (const [column, expected] of Object.entries({B:practice,D:'1',E:'Open',F:'Not implemented',G:narrative,M:'Potential candidate'}))
    assert.equal(cell(plan.body, column+plan.row), expected, 'POA&M workbook column '+column);

  const exports = (await records(clientId)).audit_logs.filter(event =>
    event.action === 'prepare-export' && event.entity_type === 'cmmc-workbook' &&
    event.client_id === clientId && event.user_id === 'qa-owner' && event.outcome === 'success');
  for (const kind of ['SPRS','POAM'])
    assert.equal(exports.filter(event => event.entity_name === kind).length, 1, kind+' export audit receipt');
  return {clientId, requirement, assessmentId:judgment.framework_assessment_id, poamId,
    before:{workingScore:51, range:[51,66], knownDeduction:44, maximumDeduction:59, activePoamItems:23},
    after:{workingScore:50, range:[50,65], knownDeduction:45, maximumDeduction:60, activePoamItems:24,
      target:{status:'Open', points:1, eligibility:'Potential candidate'}},
    submissionUnchanged:true, otherRequirementsUnchanged:109, exports:['sprs','poam']};
};
