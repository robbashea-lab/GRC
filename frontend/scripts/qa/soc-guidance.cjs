// Isolated loopback Demo browser verification. Synthetic records only; no canonical reset.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guidance=require('../../../shared/catalogs/operatorGuidance/socAssessmentGuidance.json');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4179',key='grc_interactive_demo_v3';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback Demo required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key),go=route=>page.goto(base+route);
 const main=page.locator('main'),dialog=page.getByTestId('prestige-soc-assessment');
 const rows=async cid=>(await store()).framework_assessments.filter(r=>r.client_id===cid&&r.framework_key==='soc-2');
 async function open(cid,id){
  const row=(await rows(cid)).find(r=>r.definition_id===id);assert(row,id+' exists');
  await page.evaluate(cid=>localStorage.setItem('grc_client_id',cid),cid);
  await go('/compliance/soc-2?assessment='+row.framework_assessment_id);
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();
  return row;
 }
 async function content(id){
  const p=guidance.criteria[id].practical;
  const section=dialog.locator('[data-guidance-version]');
  await expect(section).toHaveAttribute('data-guidance-version',guidance.version);
  for(const text of [...p.review,...p.evidence,...p.outcome,...p.operational,...p.enhanced])await expect(section.getByText(text,{exact:true})).toBeVisible();
  await expect(section.locator('input')).toHaveCount(0);
  await expect(dialog.getByRole('heading',{name:'Enhanced Assurance',exact:true})).toHaveCount(p.enhanced.length?1:0);
 }
 async function onboard(name,framework='SOC 2 Type 2'){
  await go('/admin/clients');await page.getByTestId('add-client-button').click();await page.getByTestId('new-client-name').fill(name);
  await page.getByTestId('new-client-save').click();await expect(page.getByTestId('add-client-dialog')).not.toBeVisible();
  await main.getByRole('button',{name,exact:true}).click();await go('/onboarding');
  await page.getByRole('combobox',{name:framework,exact:true}).selectOption('applies');await main.getByRole('button',{name:'Next',exact:true}).click();
  const responses=main.getByRole('button',{name:'Unsure',exact:true});assert.equal(await responses.count(),17);
  for(let i=0;i<17;i++)await responses.nth(i).click();
  await main.getByRole('button',{name:'Next',exact:true}).click();await expect(main.getByRole('heading',{name:'Recurring Reviews',exact:true})).toBeVisible();
  await main.getByRole('button',{name:'Next',exact:true}).click();await main.getByRole('button',{name:'Complete onboarding',exact:true}).click();
  await expect(main.getByRole('heading',{name:'Client Profile',exact:true})).toBeVisible();
  return (await store()).clients.find(c=>c.name===name).client_id;
 }
 async function scope(cid,additional){
  await go('/compliance/soc-2');await main.getByText('Scope and observation period settings',{exact:true}).click();
  for(const label of ['Availability','Confidentiality'])await main.getByRole('checkbox',{name:label,exact:true}).setChecked(additional);
  await main.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();
  await expect.poll(async()=>(await store()).clients.find(c=>c.client_id===cid).framework_settings['soc-2'].categories.length).toBe(additional?3:1);
  await page.reload();
  const breadcrumb=main.getByRole('navigation',{name:'SOC 2 location'});await expect(breadcrumb).toBeVisible();
  const root=breadcrumb.getByRole('button',{name:'SOC 2',exact:true});if(await root.count())await root.click();
  // The navigator receives only currently scoped criteria; retained records stay in storage.
  await expect(main.getByRole('link',{name:/Open Availability/})).toHaveCount(additional?1:0);
  await expect(main.getByRole('link',{name:/Open Confidentiality/})).toHaveCount(additional?1:0);
 }
 async function save(cid,id='CC1.1'){
  const before=await open(cid,id),others=(await store()).framework_assessments.filter(r=>r.client_id!==cid);
  await content(id);
  assert.deepEqual((await rows(cid)).find(r=>r.definition_id===id),before,'reading guidance is not an assessment write');
  await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();
  const unchanged=(await rows(cid)).find(r=>r.definition_id===id);
  for(const field of ['status','implementation','owner_id','evidence_ids','related_links'])assert.deepEqual(unchanged[field],before[field],field+' unaffected by guidance');
  assert.equal(unchanged.verification||'not_verified',before.verification||'not_verified');
  assert.deepEqual(unchanged.assessment_history.slice(0,before.assessment_history.length),before.assessment_history);
  await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC QA practical guidance '+cid);
  await dialog.locator('input[value="in_progress"]').check();await dialog.getByLabel('Verification result').selectOption('needs_validation');
  await dialog.getByRole('button',{name:'Save & next',exact:true}).click();await expect(dialog.getByRole('heading',{name:/SOC 2 CC1.2/})).toBeVisible();
  await dialog.getByRole('button',{name:'Previous',exact:true}).click();await page.reload();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC QA practical guidance '+cid);
  const after=(await rows(cid)).find(r=>r.definition_id===id);
  assert.deepEqual(after.soc_assessment_checks||[],before.soc_assessment_checks||[]);
  assert.deepEqual(after.assessment_history.slice(0,before.assessment_history.length),before.assessment_history);
  assert.equal(after.assessment_history.length,unchanged.assessment_history.length+1);
  assert.deepEqual((await store()).framework_assessments.filter(r=>r.client_id!==cid),others);
  return after;
 }
 try{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  await go('/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  // Represent previous responses and a linked artifact in this disposable session, never real client data.
  await page.evaluate(key=>{const db=JSON.parse(sessionStorage.getItem(key)),r=db.framework_assessments.find(r=>r.client_id==='demo_prestige'&&r.definition_id==='CC1.1');r.soc_assessment_checks=['CC1.1-v1-r1'];db.evidence.push({evidence_id:'synthetic-existing-soc-evidence',client_id:r.client_id,filename:'synthetic-existing-soc-evidence.txt',mime_type:'text/plain',created_at:'2026-10-01T12:00:00Z'});r.related_links.push({kind:'evidence',id:'synthetic-existing-soc-evidence'});sessionStorage.setItem(key,JSON.stringify(db));},key);
  const prestigeBefore=(await store()).clients.find(c=>c.client_id==='demo_prestige').framework_settings;
  await open('demo_prestige','CC1.1');
  for(const id of Object.keys(guidance.criteria)){await open('demo_prestige',id);await content(id);}
  console.log('All 38 Prestige criteria rendered.');
  await save('demo_prestige');
  await dialog.getByText(/^Previous checklist responses/).click();
  await expect(dialog.getByText(guidance.criteria['CC1.1'].items[0].text,{exact:true})).toBeVisible();
  await dialog.getByText('Linked work and history',{exact:true}).click();
  await expect(dialog.getByRole('button',{name:'synthetic-existing-soc-evidence.txt',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Raise Finding',exact:true}).click();
  await dialog.getByLabel('Finding title',{exact:true}).fill('SYNTHETIC SOC guidance gap');
  await dialog.getByRole('button',{name:'Create Finding & Action',exact:true}).click();
  const finding=dialog.getByRole('button',{name:'SYNTHETIC SOC guidance gap',exact:true});await expect(finding).toBeVisible();await finding.click();
  const nested=page.getByTestId('findings-drawer');await nested.getByRole('button',{name:'Evidence',exact:true}).click();
  const filename='synthetic-soc-guidance.txt';
  await nested.getByTestId('drawer-evidence-input').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from('DEMO SYNTHETIC DATA - evidence link regression')});
  await expect(nested.getByText(filename,{exact:true})).toBeVisible();const downloading=page.waitForEvent('download');await nested.getByRole('button',{name:'Download '+filename,exact:true}).click();
  const downloaded=await downloading;assert.equal(downloaded.suggestedFilename(),filename);assert.equal(await downloaded.failure(),null);
  await nested.getByRole('button',{name:'Close',exact:true}).click();await expect(finding).toBeFocused();
  await page.reload();await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();await dialog.getByText('Linked work and history',{exact:true}).click();await finding.click();
  await nested.getByRole('button',{name:'Evidence',exact:true}).click();await expect(nested.getByText(filename,{exact:true})).toBeVisible();await nested.getByRole('button',{name:'Close',exact:true}).click();
  const db=await store(),f=db.findings.find(f=>f.title==='SYNTHETIC SOC guidance gap');assert.equal(db.tasks.filter(t=>t.finding_id===f.finding_id).length,1);
  const assessed=(await rows('demo_prestige')).find(r=>r.definition_id==='CC1.1');assert.equal(assessed.status,'in_progress');assert.equal(assessed.verification,'needs_validation');
  assert.deepEqual(db.clients.find(c=>c.client_id==='demo_prestige').framework_settings,prestigeBefore);
  const out=process.env.QA_OUTPUT_DIR;if(out)fs.mkdirSync(out,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [1440,1280,1024,768]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);await page.reload();await content('CC1.1');
   const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert(bounds.scroll<=bounds.width+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify({theme,width,bounds}));
   if(out){await page.screenshot({path:path.join(out,theme+'-'+width+'.png')});await dialog.getByRole('heading',{name:'Operational Practices',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,theme+'-'+width+'-guidance.png')});}
  }
  await dialog.getByRole('button',{name:'CC1',exact:true}).click();await expect(dialog).toHaveCount(0);await page.getByTestId('requirement-CC1.1').click();await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByTestId('requirement-CC1.1')).toBeFocused();
  await page.setViewportSize({width:1440,height:1000});
  console.log('Prestige persistence, linked Finding evidence, navigation and responsive checks passed.');
  const security=await onboard('SOC guidance Security-only QA');await scope(security,false);assert.equal((await rows(security)).length,33);await save(security);
  console.log('New Security-only client passed.');
  const all=await onboard('SOC guidance Three-category QA');await scope(all,true);assert.equal((await rows(all)).length,38);await save(all);
  for(const id of ['A1.1','A1.3','C1.1','C1.2']){await open(all,id);await content(id);}
  const retained=await rows(all);await scope(all,false);assert.deepEqual(await rows(all),retained);await scope(all,true);assert.deepEqual(await rows(all),retained);
  console.log('Three-category client and scope retention passed.');
  const existing=await onboard('SOC guidance Existing ISO QA','ISO/IEC 27001');const isoBefore=(await store()).framework_assessments.filter(r=>r.client_id===existing);
  await go('/client-settings?tab=compliance');await page.getByRole('combobox',{name:'Applicability — SOC 2 Type 2',exact:true}).selectOption('applies');await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();
  await expect.poll(async()=>(await store()).requirements.find(r=>r.client_id===existing&&r.baseline_key==='soc-2')?.baseline_response).toBe('applies');await go('/compliance/soc-2');await save(existing);
  assert.deepEqual((await store()).framework_assessments.filter(r=>r.client_id===existing&&r.framework_key!=='soc-2'),isoBefore);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({criteria:38,scenarios:['Prestige','new Security-only','Security Availability Confidentiality','existing ISO adds SOC2'],scopeRetention:true,readOnlyGuidance:true,legacyChecks:true,saveReloadHistory:true,evidenceUploadDownloadReload:true,findingActionNoConclusionChange:true,breadcrumbEscapeFocus:true,themes:['light','dark'],widths:[1440,1280,1024,768],runtimeErrors:errors}));
 }catch(e){console.error((await page.locator('body').innerText()).slice(-4500));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
