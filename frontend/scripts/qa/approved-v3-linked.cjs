const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFile} = require('node:fs/promises');
const {strFromU8, unzipSync} = require('fflate');

module.exports = async function verifyLinkedWork({page, action, field, route, settle, reload, api, records, waitFor}) {
  const clientId = 'v3sample_brawndo';
  const sourceId = 'brawndo';
  const ref = '1.1';
  const itemRoute = 'client-brawndo-item-1.1';
  const narrative = 'Disposable QA inventory assessment narrative.';
  const findingTitle = 'Disposable QA inventory gap';
  const taskTitle = 'Disposable QA inventory corrective action';
  const description = 'Synthetic QA observation for this inventory safeguard only.';
  const resolution = 'Synthetic corrective work submitted for independent validation.';
  const assessmentFor = data => data.framework_assessments.find(row =>
    row.client_id === clientId && row.framework_key === 'cis-ig1' && row.definition_id === ref);
  const judgment = row => [row.status, row.verification, row.assessment_recorded_at];
  const before = assessmentFor(await records(clientId));
  assert.ok(before, 'The synthetic client has an enrolled CIS 1.1 assessment');
  const assessmentId = before.framework_assessment_id;

  await route(itemRoute);
  await page.getByLabel('Current implementation', {exact:true}).fill(narrative);
  await page.getByRole('button', {name:'Save assessment', exact:true}).click();
  await settle();
  await waitFor(async () => assessmentFor(await records(clientId)).implementation === narrative,
    'The assessment narrative did not reach its exact native record.');
  const saved = assessmentFor(await records(clientId));
  assert.equal(saved.framework_assessment_id, assessmentId);
  assert.deepEqual(judgment(saved), judgment(before), 'A narrative-only save preserves the assessment judgment');
  assert.equal(saved.assessment_history.length, before.assessment_history.length+1);
  assert.equal(saved.assessment_history.at(-1).implementation, narrative);

  await action('item-finding').click();
  await field('finding').fill(findingTitle);
  await field('title').fill(taskTitle);
  await field('description').fill(description);
  await field('pri').selectOption('High');
  await field('owner').selectOption({label:'QA Owner'});
  await action('dlg-run').click();
  await settle();
  const related = () => api('/framework_assessments/'+encodeURIComponent(assessmentId)+'/related');
  await waitFor(async () => (await related()).findings.some(row => row.title === findingTitle),
    'The Finding is missing from its originating assessment.');
  const origin = await related();
  const findings = origin.findings.filter(row => row.title === findingTitle);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.equal(finding.client_id, clientId);
  assert.equal(finding.framework_assessment_id, assessmentId);
  assert.equal(finding.severity, 'high');
  assert.equal(finding.description, description);
  const tasks = origin.tasks.filter(row => row.finding_id === finding.finding_id);
  assert.equal(tasks.length, 1, 'The Finding has one primary corrective Action');
  const task = tasks[0];
  assert.equal(task.task_id, finding.primary_task_id);
  assert.equal(task.client_id, clientId);
  assert.equal(task.title, taskTitle);
  assert.equal(task.priority, 'high');
  assert.equal(task.assignee_id, 'qa-owner');

  await page.getByRole('tab', {name:/^Findings/}).click();
  const linkedAction = page.locator('#gn-assess-tabpanel [data-action="open-act"][data-id="'+task.task_id+'"]');
  assert.equal(await linkedAction.count(), 1);
  assert.ok((await linkedAction.innerText()).includes(taskTitle));
  await route('client-brawndo-actions');
  await page.getByRole('searchbox', {name:'Search action items'}).fill(taskTitle);
  const actionRow = page.locator('#wk-reg [data-action="open-act"][data-id="'+task.task_id+'"]');
  await actionRow.click();
  const drawer = page.locator('#drawer');
  assert.ok((await drawer.innerText()).includes(description));
  await action('act-complete-dlg', task.task_id).click();
  await field('done').fill(resolution);
  await page.getByRole('button', {name:'Submit for validation', exact:true}).click();
  await settle();
  await waitFor(async () => (await related()).findings.find(row => row.finding_id === finding.finding_id)?.status === 'remediated',
    'Corrective work did not move the same Finding to Pending validation.');

  await reload();
  await route('client-brawndo-actions');
  await page.getByRole('searchbox', {name:'Search action items'}).fill(taskTitle);
  assert.match(await actionRow.innerText(), /Pending validation/i);
  const after = await related();
  assert.equal(after.tasks.find(row => row.task_id === task.task_id)?.resolution, resolution);
  assert.equal(after.findings.find(row => row.finding_id === finding.finding_id)?.status, 'remediated');
  assert.equal(after.tasks.filter(row => row.finding_id === finding.finding_id).length, 1);
  const afterAssessment = assessmentFor(await records(clientId));
  assert.deepEqual(judgment(afterAssessment), judgment(saved));
  assert.deepEqual(afterAssessment.assessment_history, saved.assessment_history);

  await route('client-initech-item-1.1');
  const other = page.locator('#v-client');
  assert.match(await other.locator('.item-head .eyebrow').innerText(), /INITECH/);
  assert.notEqual(await other.getByLabel('Current implementation', {exact:true}).inputValue(), narrative);
  await other.getByRole('tab', {name:/^Findings/}).click();
  assert.equal(await other.locator('[data-id="'+task.task_id+'"]').count(), 0);
  await route(itemRoute);
  assert.match(await other.locator('.item-head .eyebrow').innerText(), /BRAWNDO/);
  assert.equal(await other.getByLabel('Current implementation', {exact:true}).inputValue(), narrative);
  const linkedWork = other.locator('section.panel').filter({has:page.getByRole('heading', {name:'Linked work', exact:true})});
  const reopenedAction = linkedWork.locator('[data-action="open-act"][data-id="'+task.task_id+'"]');
  assert.equal(await reopenedAction.count(), 1);
  assert.match(await reopenedAction.innerText(), /Pending validation/i);

  await route('client-prestige-program');
  const programs = page.locator('#side-client');
  for (const [kind, label, scope] of [['soc', 'SOC 2', 'CC1.1'], ['iso', 'ISO 27001', '4.1'], ['soc', 'SOC 2', 'CC1.1']]) {
    await settle();
    const program = programs.locator('[data-action="prog-switch"][data-val="'+kind+'"]');
    assert.equal((await program.innerText()).trim(), label);
    await program.click();
    await waitFor(async () => await program.getAttribute('aria-current') === 'page',
      'The selected '+label+' link did not become active.');
    await other.getByRole('heading', {name:label, exact:true, level:1}).waitFor();
    const search = other.getByRole('searchbox', {name:'Search', exact:true});
    await search.fill(scope);
    await other.locator('#reg-panel [data-action="fw-item"][data-id="'+scope+'"]').waitFor();
  }

  return {clientId, sourceId, safeguard:ref, assessmentId, findingId:finding.finding_id,
    taskId:task.task_id, verifiedActionStatus:'Pending validation', neighboringClient:'initech',
    switchedFrameworks:['SOC 2','ISO 27001','SOC 2']};
};

module.exports.verifyReviewReport = async function verifyReviewReport({page, route, records}, cisReview) {
  assert.ok(cisReview?.occurrence && cisReview.completedOccurrenceCount === 1,
    'Run the CIS review case before checking its workbook.');
  const {occurrence, due, next} = cisReview;
  const clientId = 'v3sample_brawndo';
  const data = await records(clientId);
  const review = data.reviews.find(row => row.occurrences?.some(saved => saved.occurrence_id === occurrence));
  assert.ok(review, 'The report must use the saved native Review series.');
  const completion = review.occurrences.find(saved => saved.occurrence_id === occurrence);
  const client = data.clients.find(row => row.client_id === clientId);
  const parts = new Intl.DateTimeFormat('en', {timeZone:client.timezone || client.time_zone || 'UTC',
    year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(completion.completed_at));
  const calendar = Object.fromEntries(parts.map(({type,value}) => [type,value]));
  const completedOn = [calendar.year,calendar.month,calendar.day].join('-');

  await route('client-brawndo-reports');
  await page.getByRole('tab', {name:/^Audit packages/}).click();
  const start = page.locator('#rp-start'), end = page.locator('#rp-end');
  if (completedOn > await end.inputValue()) await end.fill(completedOn);
  if (completedOn < await start.inputValue()) await start.fill(completedOn);
  assert.ok(await start.inputValue() <= completedOn && await end.inputValue() >= completedOn,
    'The selected report period must contain the saved completion.');
  await page.getByText('Single reports', {exact:true}).click();
  const workbook = 'Review-schedule-and-log.xlsx';
  const register = page.locator('.rp-single').filter({hasText:/Recurring reviews|Review schedule and log/i});
  const [download,response] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForResponse(result => new URL(result.url()).pathname === '/api/reports/deliveries' &&
      result.request().method() === 'POST'),
    register.getByRole('button', {name:'Download', exact:true}).click()
  ]);
  assert.ok(response.ok(), 'The native report delivery must be recorded successfully.');
  const delivery = await response.json();
  const bytes = await readFile(await download.path());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(download.suggestedFilename(), workbook);
  assert.ok(delivery.delivery_id);
  assert.deepEqual(delivery, {delivery_id:delivery.delivery_id, client_id:clientId, framework_key:'cis-ig1',
    kind:'register-workbook', workbook, sha256});

  const files = unzipSync(bytes);
  const worksheetRows = sheet => strFromU8(files['xl/worksheets/sheet'+sheet+'.xml']).match(/<row\b[^>]*>.*?<\/row>/gs) || [];
  const historyRows = worksheetRows(1).filter(row => row.includes('>'+occurrence+'</t>'));
  const scheduleRows = worksheetRows(2).filter(row => row.includes('>'+review.review_id+'</t>'));
  assert.equal(historyRows.length, 1, 'Report history must include the exact completed occurrence once.');
  assert.ok(historyRows[0].includes('>'+due) && historyRows[0].includes('>Completed'));
  assert.equal(scheduleRows.length, 1, 'Report schedule must contain the exact Review series once.');
  assert.ok(scheduleRows[0].includes('>'+next), 'The reported next due date must match Calendar.');
  return {clientId, framework:'cis-ig1', deliveryId:delivery.delivery_id, occurrence, next, sha256};
};
