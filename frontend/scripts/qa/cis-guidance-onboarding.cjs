// Real UI; disposable local Demo sessions only. No canonical sample reset/migration.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict');
const guidance=require('../../../shared/catalogs/operatorGuidance/cisAssessmentGuidance.json');
const guide=require('../../../shared/catalogs/operatorGuidance/cisRequirementGuide.json');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4179',key='grc_interactive_demo_v3';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback Demo required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
 const go=route=>page.goto(base+route),main=page.locator('main');
 const dialog=page.getByTestId('brawndo-cis-assessment');
 async function onboard(name,framework){
  await go('/admin/clients');await page.getByTestId('add-client-button').click();await page.getByTestId('new-client-name').fill(name);
  await page.getByTestId('new-client-save').click();await expect(page.getByTestId('add-client-dialog')).not.toBeVisible();
  await main.getByRole('button',{name,exact:true}).click();await go('/onboarding');
  await page.getByRole('combobox',{name:framework,exact:true}).selectOption('applies');
  await main.getByRole('button',{name:'Next',exact:true}).click();
  const responses=main.getByRole('button',{name:'Unsure',exact:true});
  assert.equal(await responses.count(),17);
  for(let i=0;i<17;i++)await responses.nth(i).click();
  await main.getByRole('button',{name:'Next',exact:true}).click();
  await expect(main.getByRole('heading',{name:'Recurring Reviews',exact:true})).toBeVisible();
  await main.getByRole('button',{name:'Next',exact:true}).click();
  await main.getByRole('button',{name:'Complete onboarding',exact:true}).click();
  await expect(main.getByRole('heading',{name:'Client Profile',exact:true})).toBeVisible();
  return (await store()).clients.find(c=>c.name===name).client_id;
 }
 async function verifyCis(cid){
  const before=await store(),rows=before.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='cis-ig1');
  assert.equal(rows.length,56);assert.equal(new Set(rows.map(r=>r.definition_id)).size,56);
  assert(rows.every(r=>r.status==='not_assessed'));
  assert(rows.every(r=>!r.implementation&&!r.assessment_history?.length&&!r.evidence_ids?.length),'No Brawndo assessment data copied');
  await go('/compliance/cis-ig1?assessment='+rows.find(r=>r.definition_id==='1.1').framework_assessment_id);
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();
  assert.deepEqual(await dialog.locator('.cis-assessment-guidance li').allTextContents(),Object.values(guidance.requirements['1.1']).flat());
  await expect(dialog.locator('.cis-assessment-guidance input')).toHaveCount(0);
  await expect(dialog.locator('.cis-assessment-layout')).toBeVisible();
  await expect(dialog.locator('.cis-guide-disclosure')).not.toHaveAttribute('open','');
  await dialog.locator('.cis-guide-disclosure > summary').click();
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.1'].plain);
  await dialog.getByRole('button',{name:'What common gaps should I look for?',exact:true}).click();
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.1'].gaps);
  assert.deepEqual((await store()).framework_assessments,before.framework_assessments);
  await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC QA shared guidance '+cid);
  await dialog.locator('input[value="in_progress"]').check();
  await dialog.getByRole('button',{name:'Save & next',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/CIS IG1 1.2 —/})).toBeVisible();
  await expect(dialog.locator('.cis-guide-disclosure')).not.toHaveAttribute('open','');
  await dialog.locator('.cis-guide-disclosure > summary').click();
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.2'].plain);
  assert.deepEqual(await dialog.locator('.cis-assessment-guidance li').allTextContents(),Object.values(guidance.requirements['1.2']).flat());
  await dialog.getByRole('button',{name:'Previous',exact:true}).click();await page.reload();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC QA shared guidance '+cid);
  await expect(dialog.locator('.cis-guide-disclosure')).not.toHaveAttribute('open','');
  await dialog.locator('.cis-guide-disclosure > summary').click();
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.1'].plain);
  const saved=(await store()).framework_assessments.find(r=>r.framework_assessment_id===rows[0].framework_assessment_id);
  assert.equal(saved.client_id,cid);assert(saved.assessment_history.length>0);
  assert.equal(JSON.stringify((await store()).framework_assessments.filter(r=>r.client_id!==cid)),JSON.stringify(before.framework_assessments.filter(r=>r.client_id!==cid)));
 }
 try{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  await go('/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  const fresh=await onboard('CIS Guidance Fresh QA','CIS Controls v8.1 IG1');await verifyCis(fresh);
  const existing=await onboard('CIS Guidance Existing ISO QA','ISO/IEC 27001');
  const isoBefore=(await store()).framework_assessments.filter(r=>r.client_id===existing&&r.framework_key==='iso-27001');
  assert(isoBefore.length>0);
  await go('/client-settings?tab=compliance');
  await page.getByRole('combobox',{name:'Applicability — CIS Controls v8.1 IG1',exact:true}).selectOption('applies');
  await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();
  await expect.poll(async()=>(await store()).requirements.find(r=>r.client_id===existing&&r.baseline_key==='cis-ig1')?.baseline_response).toBe('applies');
  await go('/compliance/cis-ig1');await expect(main.getByRole('heading',{name:'CIS IG1',exact:true})).toBeVisible();
  await verifyCis(existing);
  assert.deepEqual((await store()).framework_assessments.filter(r=>r.client_id===existing&&r.framework_key==='iso-27001'),isoBefore);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({newCisOnlyClient:true,existingIsoClientAddsCis:true,sharedGuidance:true,perClientRecords:56,narrativeReload:true,saveNext:true,history:true,otherClientAndFrameworkPreserved:true,runtimeErrors:errors}));
 }catch(e){console.error((await page.locator('body').innerText()).slice(-4500));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
