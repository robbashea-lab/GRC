// Called only after published-release.cjs verifies origin, artifact and Demo identity.
// All business writes use visible UI. store() supplies read-only assertions.
const path = require('node:path');

module.exports = async function publishedFindingsAI({page, expect, assert, go, store, cid, prefix, artifacts}) {
  assert.ok(typeof prefix === 'string' && prefix.trim().length >= 8, 'Use a unique synthetic prefix');
  prefix += ' findings-ai';
  const initial = await store();
  assert.equal(initial.user?.workspace_mode, 'demo', 'Never run against persistent records');
  assert.ok(initial.clients.some(row => row.client_id === cid), 'Expected isolated Demo client');
  const kinds = ['findings', 'tasks', 'risks', 'reviews', 'ai_systems', 'evidence'];
  for (const kind of kinds) assert.ok(!(initial[kind] || []).some(row => row.client_id === cid &&
    [row.title, row.name, row.filename].some(value => value?.includes(prefix))), 'Prefix already used in ' + kind);
  await go('/clients');
  await page.getByTestId('sidebar-open-' + cid).click();
  const drawer = kind => page.getByTestId(kind + '-drawer').last();
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const saved = async (kind, title) => (await store())[kind].find(row => row.client_id === cid && (row.title === title || row.name === title));
  const openWork = async title => {
    await go('/action-items?view=all');
    await page.getByTestId('ai-search').fill(title);
    await page.getByRole('button', {name: title, exact: true}).click();
  };
  const ai = () => page.getByTestId('ai-drawer');
  const openAI = async title => {
    await go('/ai-governance');
    await page.getByTestId('ai-system-search').fill(title);
    // Cards and table rows have different names; wait for either after the load.
    await page.getByRole('button', {name: new RegExp('^(?:Open )?' + escaped(title) + '$')}).click();
  };
  const governanceTab = async () => {
    const pilot = ai().getByRole('tab', {name: 'Oversight & Review', exact: true});
    await (await pilot.count() ? pilot : ai().getByRole('tab', {name: 'Risk & Governance', exact: true})).click();
  };
  const reviewTab = async () => {
    const generic = ai().getByRole('tab', {name: 'Reviews', exact: true});
    if (await generic.count()) await generic.click();
    else await governanceTab();
  };
  const results = [];
  async function scenario(id, title, notCovered, body) {
    const outcome = {scenario: id, title, status: 'failed', stage: 'start', checks: [], notCovered};
    try {
      await body(outcome.checks, value => { outcome.stage = value; });
      const after = await store();
      for (const kind of [...kinds, 'clients']) assert.deepEqual(
        (after[kind] || []).filter(row => row.client_id !== cid),
        (initial[kind] || []).filter(row => row.client_id !== cid), 'Other clients unchanged: ' + kind);
      outcome.status = 'passed';
      outcome.stage = 'complete';
    } catch (error) {
      outcome.error = {message: error.message, stack: error.stack, url: page.url()};
      if (artifacts) {
        outcome.screenshot = path.join(artifacts, cid + '-' + id + '-failure.png');
        try { await page.screenshot({path: outcome.screenshot, fullPage: true}); }
        catch (captureError) { outcome.screenshotError = captureError.message; }
      }
    }
    results.push(outcome);
  }

  const findingTitle = prefix + ' independent observation';
  const actionTitle = prefix + ' corrective action';
  let findingId, actionId;
  await scenario('E05', 'Independent Finding, correction, validation and reopening', [
    'The Finding drawer has no existing-Action picker. This tests new corrective Actions linked to an existing Finding, not relinking an independent Action.',
    'This administrator Demo session does not prove contributor/viewer or cross-tenant server authorization.'
  ], async (checks, stage) => {
    stage('Create an independent Finding without an Action');
    await go('/action-items?view=all');
    await page.getByRole('button', {name: 'New Finding', exact: true}).click();
    await drawer('findings').getByTestId('field-title').fill(findingTitle);
    await drawer('findings').getByTestId('field-description').fill('Synthetic independent observation requiring separately validated correction.');
    await drawer('findings').getByTestId('drawer-save').click();
    await expect.poll(async () => !!await saved('findings', findingTitle)).toBe(true);
    let finding = await saved('findings', findingTitle);
    findingId = finding.finding_id;
    assert.equal(finding.status, 'open');
    assert.ok(!finding.review_id && !finding.occurrence_id, 'Independent Finding must not invent Review provenance');
    assert.equal((await store()).tasks.filter(task => task.finding_id === findingId).length, 0);
    checks.push('Finding persists independently with no Action or invented Review provenance.');

    const completeCorrection = async title => {
      await openWork(findingTitle);
      await drawer('findings').getByTestId('quick-create-task').click();
      await drawer('tasks').getByTestId('field-title').fill(title);
      await drawer('tasks').getByTestId('drawer-save').click();
      await expect.poll(async () => !!await saved('tasks', title)).toBe(true);
      const task = await saved('tasks', title);
      assert.equal(task.finding_id, findingId);
      assert.equal(task.source_type, 'finding');
      assert.equal(task.source_id, findingId);
      await openWork(title);
      await drawer('tasks').getByRole('button', {name: 'Complete Action Item', exact: true}).click();
      await expect.poll(async () => (await saved('tasks', title))?.status).toBe('done');
      await expect.poll(async () => (await saved('findings', findingTitle))?.status).toBe('remediated');
      return task.task_id;
    };
    const validate = async rationale => {
      await openWork(findingTitle);
      await drawer('findings').getByTestId('finding-validate').click();
      await page.getByLabel('What confirms the remediation worked?', {exact: true}).fill(rationale);
      await page.getByRole('button', {name: 'Record decision', exact: true}).click();
      await expect.poll(async () => (await saved('findings', findingTitle))?.status).toBe('closed');
    };
    stage('Complete linked correction without implicitly validating the Finding');
    actionId = await completeCorrection(actionTitle);
    finding = await saved('findings', findingTitle);
    assert.ok(!finding.closed_at, 'Action completion is not Finding validation');
    checks.push('Corrective Action completes; Finding remains Pending Validation.');
    stage('Validate the Finding with a recorded rationale');
    await validate('Synthetic correction independently inspected and confirmed.');
    const history = (await saved('findings', findingTitle)).decision_history;
    assert.ok(history.some(decision => decision.action === 'validated'));

    stage('Reopen, remediate again and preserve the first decision');
    await openWork(findingTitle);
    await drawer('findings').getByTestId('field-status').click();
    await page.getByRole('option', {name: 'Open', exact: true}).click();
    await drawer('findings').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('findings', findingTitle))?.status).toBe('open');
    assert.deepEqual((await saved('findings', findingTitle)).decision_history.slice(0, history.length), history);
    await completeCorrection(actionTitle + ' follow-up');
    await validate('Synthetic follow-up correction inspected after reopening.');
    finding = await saved('findings', findingTitle);
    assert.deepEqual(finding.decision_history.slice(0, history.length), history);
    assert.equal(finding.decision_history.filter(decision => decision.action === 'validated').length, 2);
    assert.equal((await store()).tasks.find(task => task.task_id === actionId).status, 'done');
    checks.push('Two explicit validations retained after reopening; original completed Action remains intact.');
  });

  await scenario('E13', 'AI governance uses authoritative Reviews, Findings, Actions and Evidence', [
    'Internal screening is not a legal classification or a Risk Register score.',
    'This checks the enabled administrator workflow, not approval personas, contributor/viewer restrictions or persistent backend authorization.',
    'AI intake marked No is not silently changed by this helper; unavailable creation is reported as a failed precondition.'
  ], async (checks, stage) => {
    const title = prefix + ' synthetic AI system';
    stage('Create an enabled AI record through its normal form');
    await go('/ai-governance');
    await expect(page.getByTestId('new-ai-system')).toBeVisible();
    await page.getByTestId('new-ai-system').click();
    const pilot = await ai().getByLabel('Product / System Name', {exact: true}).count();
    await ai().getByLabel(pilot ? 'Product / System Name' : 'AI System / Use Case name', {exact: true}).fill(title);
    await ai().getByLabel('Provider', {exact: true}).fill('Synthetic release QA provider');
    await ai().getByLabel(pilot ? 'Purpose / Use' : 'Description', {exact: true}).fill('Synthetic decision-support system for governance workflow verification.');
    await ai().getByLabel('Business Owner', {exact: true}).click();
    const candidates = page.locator('[aria-label="Business Owner candidates"]').getByRole('button').filter({hasNotText: /^Unassigned$/});
    await expect(candidates.first()).toBeVisible();
    await candidates.first().click();
    await ai().getByLabel(pilot ? 'Lifecycle Status' : 'Status', {exact: true}).selectOption('active');
    await governanceTab();
    await ai().getByLabel('Influences consequential decisions?', {exact: true}).selectOption('yes');
    await ai().getByLabel('Human oversight approach / notes', {exact: true}).fill('Named human review is required for this synthetic decision-support scenario.');
    await ai().getByRole('button', {name: 'Create AI System', exact: true}).click();
    await expect.poll(async () => !!await saved('ai_systems', title)).toBe(true);
    const record = await saved('ai_systems', title);
    assert.equal(record.screening.consequential, true);
    assert.ok(record.owner_id);
    checks.push('Named owner and screening answers persist through the normal AI form.');

    stage('Schedule and complete the central recurring Review');
    await openAI(title);
    await reviewTab();
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await ai().getByLabel('Review due date', {exact: true}).fill(today);
    await ai().getByLabel('Review cadence', {exact: true}).selectOption('annual');
    await ai().getByRole('button', {name: 'Schedule Review', exact: true}).click();
    const reviews = async () => (await store()).reviews.filter(row => row.client_id === cid && row.ai_system_id === record.ai_system_id);
    await expect.poll(async () => (await reviews()).length).toBe(1);
    let review = (await reviews())[0];
    assert.equal(review.ai_review_purpose, 'periodic');
    assert.equal(review.owner_id, record.owner_id);
    await ai().getByRole('button', {name: new RegExp('AI Governance Review.*' + escaped(title) + '$')}).click();
    await drawer('reviews').getByTestId('review-complete').click();
    const confirmation = page.getByTestId('review-complete-confirmed');
    if (await confirmation.count()) await confirmation.click();
    await expect.poll(async () => ((await reviews())[0].occurrences || []).length).toBe(1);
    review = (await reviews())[0];
    const completed = review.occurrences;
    assert.ok(review.due_date.slice(0, 10) > today);
    assert.equal(review.recurrence, 'annual');
    await openAI(title);
    await expect(ai()).toContainText('Last Review: ' + today);
    await expect(ai()).toContainText('Next Review: ' + review.due_date.slice(0, 10));
    checks.push('Central Review completion supplies AI Last/Next Review dates and retains one occurrence.');

    stage('Link existing authoritative Finding and Action without duplicates');
    assert.ok(findingId && actionId, 'E05 must create authoritative linkage fixtures');
    const beforeLinks = await store();
    await ai().getByRole('tab', {name: 'Related', exact: true}).click();
    for (const [kind, id, label] of [['findings', findingId, findingTitle], ['tasks', actionId, actionTitle]]) {
      await ai().getByLabel('Record type', {exact: true}).selectOption(kind);
      const control = ai().getByLabel('Record', {exact: true});
      const option = control.getByRole('option', {name: new RegExp('(?:^| · )' + escaped(label) + '$')});
      await expect(option).toHaveCount(1);
      await control.selectOption(await option.getAttribute('value'));
      await ai().getByRole('button', {name: 'Link Record', exact: true}).click();
      await expect.poll(async () => (await saved('ai_systems', title)).related_links.some(link => link.kind === kind && link.id === id)).toBe(true);
    }
    const afterLinks = await store();
    assert.deepEqual(afterLinks.findings, beforeLinks.findings);
    assert.deepEqual(afterLinks.tasks, beforeLinks.tasks);
    checks.push('AI links reference existing Finding and Action IDs without modifying or duplicating those records.');

    stage('Attach evidence to the central library and record a material change');
    await ai().getByRole('tab', {name: 'Evidence', exact: true}).click();
    const filename = prefix + '.txt';
    await ai().getByLabel('Attach evidence', {exact: true}).setInputFiles({name: filename, mimeType: 'text/plain', buffer: Buffer.from('Synthetic AI governance verification evidence.\n')});
    await expect.poll(async () => (await store()).evidence.some(row => row.client_id === cid && row.filename === filename && row.linked_id === record.ai_system_id && row.linked_type === 'ai_system')).toBe(true);
    await reviewTab();
    await ai().getByLabel('Material change description', {exact: true}).fill('Synthetic expansion of decision-support scope requires reassessment.');
    await ai().getByRole('button', {name: 'Record Material Change', exact: true}).click();
    await expect.poll(async () => (await saved('ai_systems', title)).material_change_note).toBe('Synthetic expansion of decision-support scope requires reassessment.');
    assert.equal((await reviews()).length, 1);
    assert.deepEqual((await reviews())[0].occurrences, completed);
    checks.push('Evidence uses the shared library; material change preserves central Review history without duplicating Reviews.');
  });
  return results;
};
