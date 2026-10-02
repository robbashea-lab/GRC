// Called by published-release.cjs after its origin, artifact identity and Demo checks.
// Business writes use visible UI only. store() is read-only assertion evidence.
// Existing standalone QA scripts retain their loopback guards.
const path = require('node:path');
const {createHash} = require('node:crypto');

module.exports = async function publishedRecordJourney({page, expect, assert, go, store, cid, prefix, artifacts, scenarioIds}) {
  assert.ok(typeof prefix === 'string' && prefix.trim().length >= 8, 'Use a unique synthetic record prefix');
  prefix += ' records'; // Keep this module distinct from the runner's Review/Finding journey.
  const initial = await store();
  assert.equal(initial.user?.workspace_mode, 'demo', 'This journey must never target persistent records');
  assert.ok(initial.clients.some(c => c.client_id === cid), 'Client must already exist in this isolated Demo');
  const collections = ['findings', 'risks', 'tasks', 'policies', 'vendors', 'evidence', 'contacts', 'assets'];
  for (const kind of collections) assert.ok(!initial[kind].some(r => r.client_id === cid &&
    [r.title, r.name, r.filename].some(value => value?.includes(prefix))), 'Prefix already used in ' + kind);

  await go('/clients');
  await page.getByTestId('sidebar-open-' + cid).click();
  const drawer = kind => page.getByTestId(kind + '-drawer').last();
  const saved = async (kind, title) => (await store())[kind].find(r => r.client_id === cid && (r.title === title || r.name === title));
  const searches = {'/findings': 'ai-search', '/action-items': 'ai-search', '/risks': 'risk-search',
    '/policies': 'policies-search', '/vendors': 'vendor-search', '/systems': 'assets-search'};
  const open = async (route, title) => {
    await go(route);
    await page.getByTestId(searches[route]).fill(title);
    if(['/findings','/action-items'].includes(route))await page.locator('button.register-record-link').filter({hasText:title}).click();
    else await page.getByText(title, {exact: true}).click();
  };
  const choose = async (control, label, value) => {
    if (await control.evaluate(el => el.tagName === 'SELECT')) await control.selectOption(value ? {value} : {label});
    else { await control.click(); await page.getByRole('option', {name: label, exact: true}).click(); }
  };
  const assign = async control => {
    const label = await control.getAttribute('aria-label');
    await control.click();
    const candidates = page.locator('[aria-label="' + label + ' candidates"]').getByRole('button').filter({hasNotText: /^Unassigned$/});
    await expect(candidates.first()).toBeVisible();
    await candidates.first().click();
  };
  const confirm = async control => {
    // Accept only the native confirmation caused by this explicit synthetic action.
    const accepted = page.waitForEvent('dialog').then(async dialog => {
      assert.equal(dialog.type(), 'confirm');
      await dialog.accept();
    });
    await Promise.all([accepted, control.click()]);
  };
  const completeReview = async () => {
    await drawer('reviews').getByTestId('review-complete').click();
    const confirmation = page.getByTestId('review-complete-confirmed');
    if (await confirmation.count()) await confirmation.click();
    await expect(drawer('reviews').getByTestId('review-history')).toBeVisible();
  };
  const newPolicy = async title => {
    await go('/policies');
    await page.getByTestId('create-policies-button').click();
    await drawer('policies').getByTestId('field-title').fill(title);
    await drawer('policies').getByTestId('field-version').fill('1');
    await drawer('policies').getByTestId('drawer-save').click();
    await expect.poll(async () => !!await saved('policies', title)).toBe(true);
  };
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const later = days => { const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const results = [];
  async function scenario(id, title, notCovered, body) {
    if(scenarioIds&&!scenarioIds.includes(id))return;
    const outcome = {scenario: id, title, status: 'failed', checks: [], notCovered, stage: 'start'};
    const stage = value => { outcome.stage = value; };
    try {
      await body(outcome.checks, stage);
      // A successful local journey must not have changed another client's records.
      const after = await store();
      for (const kind of [...collections, 'reviews', 'clients']) assert.deepEqual(
        after[kind].filter(r => r.client_id !== cid), initial[kind].filter(r => r.client_id !== cid), 'Other clients unchanged: ' + kind);
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
    // The runner must fail the release if any returned outcome failed.
    results.push(outcome);
  }

  await scenario('E06', 'Risk assessment, treatment, acceptance, Review and closure',
    ['Automatic acceptance expiry requires the separate controlled-clock simulation.'], async (checks, stage) => {
    const findingTitle = prefix + ' unassessed risk source';
    const title = 'Risk raised from finding: ' + findingTitle;
    const actionTitle = prefix + ' implement risk treatment';
    stage('Raise an unassessed Risk from a new Finding');
    await go('/findings');
    await page.getByRole('button', {name: 'New Finding', exact: true}).click();
    await drawer('findings').getByTestId('field-title').fill(findingTitle);
    await drawer('findings').getByTestId('field-description').fill('Synthetic supplier dependency observation; impact and likelihood are not yet assessed.');
    await drawer('findings').getByTestId('drawer-save').click();
    await expect.poll(async () => !!await saved('findings', findingTitle)).toBe(true);
    await open('/findings', findingTitle);
    await confirm(drawer('findings').getByTestId('finding-raise-risk'));
    await expect.poll(async () => !!await saved('risks', title)).toBe(true);
    const unassessed = await saved('risks', title);
    assert.equal(unassessed.status, 'identified');
    assert.ok(unassessed.risk_score == null, 'Unassessed must not become a zero/low score');
    assert.ok(unassessed.risk_level == null);
    assert.equal((await saved('findings', findingTitle)).risk_id, unassessed.risk_id);
    assert.equal((await store()).risks.filter(r => r.client_id === cid && r.finding_id === unassessed.finding_id).length, 1);
    checks.push('Finding raised one linked, unassessed Risk without an invented score');

    stage('Assess and assign the Risk');
    await open('/risks', title);
    await assign(drawer('risks').getByTestId('field-owner_id'));
    await choose(drawer('risks').getByLabel('Risk review cadence', {exact: true}), 'Annual');
    await drawer('risks').getByLabel('Next Review', {exact: true}).fill(later(30));
    await drawer('risks').getByTestId('tab-assessment').click();
    await choose(drawer('risks').getByTestId('field-likelihood_score'), '3 · Possible');
    await choose(drawer('risks').getByTestId('field-impact_score'), '4 · Major');
    await drawer('risks').getByLabel('assessment rationale', {exact: true}).fill(prefix + ' assessed likely service disruption against current safeguards');
    await drawer('risks').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('risks', title)).risk_score).toBe(12);
    const assessed = await saved('risks', title);
    assert.equal(assessed.risk_level, 'high'); assert.ok(assessed.owner_id); assert.ok(assessed.rating_history.length);
    checks.push('Explicit 3 × 4 assessment persists score 12/high, owner and rating history');

    stage('Record treatment and complete a linked Action Item');
    await open('/risks', title);
    await drawer('risks').getByTestId('tab-treatment').click();
    const treatment = drawer('risks').getByLabel('Treatment decision', {exact: true});
    await choose(await treatment.count() ? treatment : drawer('risks').getByTestId('field-treatment'), 'Mitigate');
    await drawer('risks').getByTestId('field-notes').fill(prefix + ' evaluate an alternate service provider');
    await drawer('risks').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('risks', title)).notes).toBe(prefix + ' evaluate an alternate service provider');
    assert.equal((await saved('risks', title)).treatment, 'mitigate');
    await open('/risks', title);
    await drawer('risks').getByTestId('tab-treatment').click();
    await drawer('risks').getByRole('button', {name: 'Create Action Item', exact: true}).click();
    await drawer('tasks').getByTestId('field-title').fill(actionTitle);
    await drawer('tasks').getByTestId('drawer-save').click();
    await expect.poll(async () => !!await saved('tasks', actionTitle)).toBe(true);
    assert.equal((await saved('tasks', actionTitle)).source_id, assessed.risk_id);
    await open('/action-items', actionTitle);
    await drawer('tasks').getByRole('button', {name: 'Complete Action Item', exact: true}).click();
    await expect.poll(async () => (await saved('tasks', actionTitle)).status).toBe('done');
    assert.notEqual((await saved('risks', title)).status, 'closed');
    checks.push('Treatment Action Item completes independently; Risk remains open');

    stage('Record acceptance without lowering severity');
    await open('/risks', title);
    await drawer('risks').getByRole('button', {name: /^Accept risk$/i}).click();
    await page.getByTestId('accept-rationale').fill(prefix + ' management accepts the residual exposure for a bounded period');
    await page.getByTestId('accept-expiry').fill(later(180));
    await page.getByTestId('accept-controls').fill('Synthetic monitoring and tested recovery procedures');
    await page.getByTestId('accept-submit').click();
    await expect.poll(async () => (await saved('risks', title)).status).toBe('accepted');
    const accepted = await saved('risks', title);
    assert.equal(accepted.risk_score, 12); assert.equal(accepted.risk_level, 'high'); assert.ok(accepted.accepted_by);
    assert.equal(accepted.acceptance_expires_at.slice(0, 10), later(180));
    checks.push('Acceptance records actor, rationale and expiry; assessed severity stays high');

    stage('Complete the authoritative linked Risk Review');
    await drawer('risks').getByRole('button', {name: 'Review Risk', exact: true}).click();
    await expect(drawer('reviews')).toContainText('Risk reassessment');
    await completeReview();
    await expect.poll(async () => (await store()).reviews.find(r => r.risk_id === assessed.risk_id)?.occurrences?.length).toBe(1);
    const review = (await store()).reviews.find(r => r.risk_id === assessed.risk_id);
    const reviewed = await saved('risks', title);
    assert.ok(reviewed.last_reviewed); assert.ok(reviewed.next_review > accepted.next_review);
    assert.equal(reviewed.acceptance_expires_at, accepted.acceptance_expires_at);
    checks.push('Review completes one occurrence and advances cadence without renewing acceptance');

    stage('Close the Risk and retain its historical Review');
    await open('/risks', title);
    await drawer('risks').getByRole('button', {name: 'Close Risk', exact: true}).click();
    await page.getByLabel('Closure note', {exact: true}).fill(prefix + ' independently confirmed the risk condition has been remediated');
    await page.getByRole('button', {name: 'Confirm closure', exact: true}).click();
    await expect.poll(async () => (await saved('risks', title)).status).toBe('closed');
    const retained = (await store()).reviews.find(r => r.review_id === review.review_id);
    assert.deepEqual(retained.occurrences, review.occurrences); assert.equal(retained.status, 'cancelled');
    assert.equal((await saved('risks', title)).risk_score, 12);
    assert.deepEqual((await saved('risks', title)).rating_history, assessed.rating_history);
    checks.push('Explicit closure cancels future work and retains completed Review/rating history');
  });

  await scenario('E07', 'Policy approval version history and separate recurring Review',
    ['Multi-person approval delegation and external document retrieval are not exercised here.'], async (checks, stage) => {
    const title = prefix + ' approval policy';
    const reviewTitle = prefix + ' recurring policy review';
    stage('Create, assign and verify Policy presence independently of approval');
    await newPolicy(title);
    assert.equal((await saved('policies', title)).status, 'draft');
    await open('/policies', title);
    await assign(drawer('policies').getByTestId('field-owner_id'));
    const presence = drawer('policies').getByTestId('field-presence');
    if (await presence.count()) await choose(presence, 'Reported Existing');
    await drawer('policies').getByTestId('drawer-save').click();
    await expect.poll(async () => !!(await saved('policies', title)).owner_id).toBe(true);
    await open('/policies', title);
    await page.getByTestId('policy-verify').click();
    await page.getByTestId('verify-version').fill('1');
    await choose(page.getByTestId('verify-status'), 'Draft');
    await page.getByTestId('verify-submit').click();
    await expect.poll(async () => (await saved('policies', title)).presence).toBe('verified_existing');
    const verified = await saved('policies', title);
    assert.equal(verified.status, 'draft'); assert.ok(!verified.approved_at); assert.ok(!verified.last_reviewed_at);
    checks.push('Policy ownership and verified presence do not manufacture approval or Review completion');

    stage('Approve an exact document version');
    await open('/policies', title);
    const approval = page.getByRole('region', {name: 'Policy approval authority', exact: true});
    await expect(approval).toBeVisible();
    await approval.getByText('Approval document & version', {exact: true}).click();
    await approval.getByLabel('Approval Policy version', {exact: true}).fill('1');
    await approval.getByLabel('External document reference', {exact: true}).fill('https://documents.example.test/' + encodeURIComponent(prefix));
    await approval.getByLabel('Document/version identifier', {exact: true}).fill('QA-version-1');
    await approval.getByRole('button', {name: 'Save approval basis', exact: true}).click();
    await expect.poll(async () => (await saved('policies', title)).approval_source?.external_version).toBe('QA-version-1');
    await page.getByTestId('policy-submit-review').click();
    await expect(page.getByTestId('policy-approve')).toBeEnabled();
    await page.getByLabel('Decision comment', {exact: true}).fill(prefix + ' reviewed the exact document/version basis');
    await page.getByTestId('policy-approve').click();
    await expect.poll(async () => (await saved('policies', title)).status).toBe('approved');
    const approved = (await saved('policies', title)).approval_history.find(h => h.action === 'approved');
    assert.equal(approved.subject.version, '1'); assert.equal(approved.subject.basis.document_version, 'QA-version-1');
    checks.push('Approval captures the exact version and external document identifier');

    stage('Change the Policy version without carrying forward approval');
    await open('/policies', title);
    await drawer('policies').getByTestId('field-version').fill('2');
    await drawer('policies').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('policies', title)).status).toBe('draft');
    assert.deepEqual((await saved('policies', title)).approval_history.find(h => h.action === 'approved'), approved);
    checks.push('Version 2 returns to draft; immutable version 1 approval remains');

    stage('Create and complete a recurring Policy Review');
    await go('/reviews'); await page.getByTestId('create-reviews-button').click();
    await drawer('reviews').getByTestId('field-title').fill(reviewTitle);
    await choose(drawer('reviews').getByTestId('field-review_type'), 'Policy');
    const supporting = drawer('reviews').getByLabel('Supporting policy', {exact: true});
    await choose(await supporting.count() ? supporting : drawer('reviews').getByTestId('field-policy_id'), title);
    await drawer('reviews').getByTestId('field-due_date').fill(later(31));
    await choose(drawer('reviews').getByTestId('field-recurrence'), 'Annual');
    await drawer('reviews').getByTestId('drawer-save').click();
    await expect(drawer('reviews').getByTestId('review-complete')).toBeVisible();
    await completeReview();
    await expect.poll(async () => (await saved('reviews', reviewTitle)).occurrences?.length).toBe(1);
    const policy = await saved('policies', title), review = await saved('reviews', reviewTitle);
    assert.equal(review.policy_id, policy.policy_id); assert.ok(policy.last_reviewed_at);
    assert.equal(policy.next_review_date.slice(0, 10), review.due_date.slice(0, 10));
    assert.equal(policy.status, 'draft'); assert.equal(policy.version, '2');
    assert.deepEqual(policy.approval_history.find(h => h.action === 'approved'), approved);
    checks.push('Recurring Review advances schedule but does not approve the new Policy version');
  });

  await scenario('E08', 'Vendor service, ownership, assurance, Review and offboarding history',
    ['Active-relationship due diligence and replacement assurance versions are separate workflows.'], async (checks, stage) => {
    const title = prefix + ' managed service';
    stage('Reject missing service, then create an owned Vendor');
    await go('/vendors'); await page.getByTestId('new-vendor').click();
    await expect(page.locator('[data-testid="vendors-drawer"], [data-testid="new-vendor-dialog"]')).toBeVisible();
    const genericCreate = page.getByTestId('new-vendor-dialog');
    const generic = !!await genericCreate.count();
    const createPanel = generic ? genericCreate : drawer('vendors');
    const createSave = createPanel.getByTestId(generic ? 'new-vendor-save' : 'drawer-save');
    await createPanel.getByTestId(generic ? 'new-vendor-name' : 'field-name').fill(title);
    await createSave.click();
    await expect(page.getByText(/Service \/ Product.*required/i).first()).toBeVisible();
    assert.equal(await saved('vendors', title), undefined);
    await (generic ? createPanel.getByLabel('Service / Product *', {exact: true}) : createPanel.getByTestId('field-service')).fill('Synthetic managed document storage');
    await assign(createPanel.getByRole('button', {name: /^Business owner$/i}));
    await createSave.click();
    await expect.poll(async () => !!await saved('vendors', title)).toBe(true);
    const created = await saved('vendors', title);
    assert.ok(created.business_owner_id); assert.equal(created.service, 'Synthetic managed document storage');
    checks.push('Required service is enforced; Vendor records an eligible Business Owner');

    stage('Schedule the Vendor Review and record a distinct contract renewal');
    await open('/vendors', title);
    await drawer('vendors').getByTestId('tab-reviews_tab').click();
    await choose(drawer('vendors').getByTestId('field-review_frequency'), 'annual', 'annual');
    await drawer('vendors').getByTestId('field-next_review').fill(later(32));
    await drawer('vendors').getByTestId('tab-contract').click();
    await drawer('vendors').getByTestId('field-contract_renewal').fill(later(120));
    await drawer('vendors').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('vendors', title)).next_review?.slice(0, 10)).toBe(later(32));
    await open('/vendors', title);
    await drawer('vendors').getByTestId('tab-assurance').click();
    const socButton = drawer('vendors').getByRole('button', {name: 'SOC 2 Report', exact: true});
    if (await socButton.count()) await socButton.click();
    else await choose(drawer('vendors').getByLabel('Add assurance expectation', {exact: true}), 'SOC 2');
    await drawer('vendors').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('vendors', title)).assurance_records?.length).toBe(1);
    const assurance = (await saved('vendors', title)).assurance_records[0];
    assert.equal(assurance.type, 'SOC 2'); assert.ok(!assurance.received_at); assert.ok(!assurance.last_reviewed);
    checks.push('Assurance expectation does not fabricate a received or reviewed document');

    stage('Complete Vendor Review independently of contract renewal');
    await open('/vendors', title);
    await drawer('vendors').getByTestId('tab-reviews_tab').click();
    await drawer('vendors').getByRole('button').filter({hasText: 'Vendor Review — ' + title}).click();
    await completeReview();
    await expect.poll(async () => (await store()).reviews.find(r => r.vendor_id === created.vendor_id)?.occurrences?.length).toBe(1);
    const review = (await store()).reviews.find(r => r.vendor_id === created.vendor_id);
    const reviewed = await saved('vendors', title);
    assert.ok(reviewed.last_review); assert.ok(reviewed.next_review.slice(0, 10) > later(32));
    assert.equal(reviewed.contract_renewal.slice(0, 10), later(120));
    checks.push('Review advances its cadence while the legal renewal date is unchanged');

    stage('Offboard and retain inactive Vendor history');
    for (const status of ['offboarding', 'inactive']) {
      await open('/vendors', title);
      const control = drawer('vendors').getByTestId('field-status');
      const native = await control.evaluate(el => el.tagName === 'SELECT');
      await choose(control, native ? status[0].toUpperCase() + status.slice(1) : status, status);
      await drawer('vendors').getByTestId('drawer-save').click();
      await expect.poll(async () => (await saved('vendors', title)).status).toBe(status);
    }
    await go('/vendors'); await page.getByTestId('vendor-view-inactive').click();
    await page.getByTestId('vendor-search').fill(title);
    await page.getByText(title, {exact: true}).click();
    await expect(drawer('vendors').getByTestId('drawer-save')).toBeDisabled();
    assert.deepEqual((await store()).reviews.find(r => r.review_id === review.review_id).occurrences, review.occurrences);
    assert.deepEqual((await saved('vendors', title)).assurance_records[0], assurance);
    checks.push('Inactive Vendor remains visible read-only with completed Review and assurance history');
  });

  await scenario('E09', 'Evidence upload, supporting relationship, unlink and exact download',
    ['Binary replacement/version workflows are not exercised; approval version retention is covered in E07.'], async (checks, stage) => {
    const title = prefix + ' evidence source policy';
    const filename = prefix.replace(/[^a-zA-Z0-9-]/g, '-') + '-evidence.txt';
    const bytes = Buffer.from(prefix + ': synthetic evidence content, no customer data.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    stage('Create a Policy and upload an unassigned Evidence file');
    await newPolicy(title);
    await go('/evidence');
    await page.getByRole('button', {name: 'Add Evidence', exact: true}).click();
    let detail = page.getByRole('dialog').last();
    await detail.getByTestId('evidence-file-input').setInputFiles({name: filename, mimeType: 'text/plain', buffer: bytes});
    await detail.getByLabel('Evidence Type', {exact: true}).selectOption('Report');
    await detail.getByRole('button', {name: 'Upload Evidence', exact: true}).click();
    await expect.poll(async () => (await store()).evidence.find(e => e.client_id === cid && e.filename === filename)?.sha256).toBe(digest);
    await page.getByRole('textbox', {name: 'Search Evidence', exact: true}).fill(filename);
    await page.getByRole('button', {name: filename, exact: true}).click();
    detail = page.locator('.evidence-workspace');
    checks.push('UI upload retains an exact SHA-256 content identity');

    stage('Link and unlink a supporting Policy without deleting or duplicating the file');
    await detail.getByRole('button', {name: 'Related', exact: true}).click();
    await detail.getByText('Link another record', {exact: true}).click();
    await detail.getByLabel('Record type', {exact: true}).selectOption('policies');
    await detail.getByLabel('Find source record', {exact: true}).fill(title);
    await detail.getByRole('button', {name: title, exact: true}).click();
    await expect(detail.getByRole('button', {name: 'Unlink', exact: true})).toBeVisible();
    let files = (await store()).evidence.filter(e => e.client_id === cid && e.filename === filename);
    assert.equal(files.length, 1); assert.equal(files[0].relationships.length, 1);
    assert.equal(files[0].relationships[0].id, (await saved('policies', title)).policy_id);
    await confirm(detail.getByRole('button', {name: 'Unlink', exact: true}));
    await expect(detail.getByRole('button', {name: 'Unlink', exact: true})).toHaveCount(0);
    files = (await store()).evidence.filter(e => e.client_id === cid && e.filename === filename);
    assert.equal(files.length, 1); assert.equal(files[0].relationships.length, 0); assert.equal(files[0].sha256, digest);
    checks.push('Supporting link/unlink changes one relationship only; authoritative file remains');

    stage('Download and compare the original bytes');
    await detail.getByRole('button', {name: 'Overview', exact: true}).click();
    const pending = page.waitForEvent('download');
    await detail.getByRole('button', {name: 'Download file', exact: true}).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), filename); assert.equal(await download.failure(), null);
    const chunks = [], stream = await download.createReadStream();
    assert.ok(stream, 'Completed download must provide file bytes');
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    checks.push('Browser download completes with the original filename and exact uploaded bytes');
  });

  await scenario('E11', 'Contact directory edit, archive/restore and assignment boundary',
    ['Invitations, account disabling and multi-person RBAC need separate authenticated personas.'], async (checks, stage) => {
    const name = prefix + ' directory contact';
    const email = prefix.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 55) + '@example.test';
    const beforeUsers = (await store()).users;
    stage('Create and edit a Contact without granting platform access');
    await go('/contacts'); await page.getByRole('button', {name: 'New Contact', exact: true}).click();
    await page.getByLabel('Full Name *', {exact: true}).fill(name);
    await page.getByLabel('Email *', {exact: true}).fill(email);
    await page.getByLabel('Job Title', {exact: true}).fill('Synthetic operations contact');
    await page.getByRole('button', {name: 'Create Contact', exact: true}).click();
    await expect(page.locator('.contact-workspace')).toHaveCount(0);
    await page.getByTestId('contacts-search').fill(email);
    await expect(page.locator('tbody')).toContainText('No access');
    await page.getByRole('button', {name, exact: true}).click();
    await page.getByLabel('Job Title', {exact: true}).fill('Updated synthetic operations contact');
    await page.getByRole('button', {name: 'Save Changes', exact: true}).click();
    await expect(page.locator('.contact-workspace')).toHaveCount(0);
    await page.reload(); await expect(page.locator('tbody')).toContainText('Updated synthetic operations contact');
    assert.ok(!(await saved('contacts', name)).linked_user_id);
    assert.deepEqual((await store()).users, beforeUsers);
    checks.push('Contact create/edit/reload leaves platform users and access unchanged');

    stage('Archive and restore the synthetic Contact');
    await page.getByRole('button', {name, exact: true}).click();
    await page.getByRole('button', {name: 'Archive Contact', exact: true}).click();
    await page.getByRole('alertdialog').getByRole('button', {name: 'Archive Contact', exact: true}).click();
    await expect(page.locator('.contact-workspace')).toHaveCount(0);
    await expect(page.locator('tbody')).not.toContainText(name);
    await page.getByLabel('Include archived', {exact: true}).check();
    await page.getByRole('button', {name, exact: true}).click();
    await page.getByRole('button', {name: 'Restore Contact', exact: true}).click();
    await page.getByRole('alertdialog').getByRole('button', {name: 'Restore Contact', exact: true}).click();
    await expect(page.locator('.contact-workspace')).toHaveCount(0);
    checks.push('Archive removes the active directory row; restore retains the same Contact');

    stage('Confirm a directory-only Contact is not an eligible system owner');
    await go('/systems'); await page.getByTestId('create-assets-button').click();
    await drawer('assets').getByTestId('field-owner_id').click();
    await page.getByLabel('Search owner candidates', {exact: true}).fill(email);
    await expect(page.getByText('No eligible users match this search.', {exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await drawer('assets').getByTestId('drawer-cancel').click();
    assert.deepEqual((await store()).users, beforeUsers);
    checks.push('Assignment picker excludes the directory-only Contact; no account was invented');
  });

  await scenario('E12', 'System scope and client profile edits',
    ['Program enrollment/retirement and onboarding handoff are covered by the separate framework journeys.'], async (checks, stage) => {
    const name = prefix + ' scoped system';
    stage('Create and edit a scoped System with an eligible owner');
    await go('/systems'); await page.getByTestId('create-assets-button').click();
    await drawer('assets').getByTestId('drawer-save').click();
    await expect(page.getByText('System name is required', {exact: true})).toBeVisible();
    await drawer('assets').getByTestId('field-name').fill(name);
    await choose(drawer('assets').getByTestId('field-asset_type'), 'SaaS');
    await choose(drawer('assets').getByTestId('field-criticality'), 'High');
    await assign(drawer('assets').getByTestId('field-owner_id'));
    await drawer('assets').getByTestId('drawer-save').click();
    await expect.poll(async () => !!await saved('assets', name)).toBe(true);
    await open('/systems', name);
    await drawer('assets').getByTestId('field-location').fill('Synthetic test region');
    await drawer('assets').getByTestId('drawer-save').click();
    await expect.poll(async () => (await saved('assets', name)).location).toBe('Synthetic test region');
    const system = await saved('assets', name);
    assert.equal(system.client_id, cid); assert.equal(system.asset_type, 'saas'); assert.ok(system.owner_id);
    checks.push('System required-name validation, type, criticality, ownership and region edit persist');

    stage('Append optional profile context without rewriting prior context or program decisions');
    const before = await store();
    await go('/client-profile?tab=organization');
    await page.getByRole('button', {name: 'Edit profile section', exact: true}).click();
    const notes = page.getByLabel('Organization context notes', {exact: true});
    const original = await notes.inputValue();
    const updated = [original, prefix + ' synthetic context verified through UI'].filter(Boolean).join(' | ');
    assert.ok(updated.length <= 2000, 'Preserve existing notes; do not truncate to fit this test');
    await notes.fill(updated);
    await page.getByRole('button', {name: 'Save profile', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Edit profile section', exact: true})).toBeVisible();
    await page.reload(); await expect(page.locator('main')).toContainText(prefix + ' synthetic context verified through UI');
    const after = await store();
    assert.equal(after.clients.find(c => c.client_id === cid).profile.organization.notes, updated);
    assert.deepEqual(after.baselines, before.baselines);
    assert.deepEqual(after.framework_assessments, before.framework_assessments);
    assert.deepEqual(after.reviews, before.reviews);
    checks.push('Optional profile update survives reload without changing baselines, assessments or Reviews');
  });

  return results;
};
