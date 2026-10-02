// Actual UI with disposable session Demo data; all external requests blocked.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guide=require('../../../shared/catalogs/operatorGuidance/isoRequirementGuide.json');
const coverageIds=process.env.QA_SKIP_COVERAGE?[]:Object.keys(guide.entries);
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4187',key='grc_interactive_demo_v3';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback Demo required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key),go=route=>page.goto(base+route);
 const main=page.locator('main'),dialog=page.getByTestId('iso-assessment-workspace');
 const rows=async cid=>(await store()).framework_assessments.filter(r=>r.client_id===cid&&r.framework_key==='iso-27001');
 async function open(cid,id,view='annex_control'){
  const row=(await rows(cid)).find(r=>r.definition_id===id);assert(row,id+' exists');
  await page.evaluate(cid=>localStorage.setItem('grc_client_id',cid),cid);
  await go('/compliance/iso-27001?iso_view='+view+'&assessment='+row.framework_assessment_id);
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();return row;
 }
 async function content(id){
  const disclosure=dialog.locator('.iso-guide-disclosure');await expect(disclosure).not.toHaveAttribute('open','');
  await disclosure.locator('summary').click();await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.entries[id].plain);
  for(const [question,field] of [['Where should I start?','start'],['What evidence could help?','evidence'],['What should I ask IT or our provider?','ask'],['What common gaps should I look for?','gaps']]){
   await dialog.getByRole('button',{name:question,exact:true}).click();await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.entries[id][field]);
  }
  assert.deepEqual(await dialog.locator('.iso-guidance-columns li').allTextContents(),['review','evidence_examples','outcome'].flatMap(k=>guide.entries[id][k]));
 }
 async function onboard(name,framework){
  await go('/admin/clients');await page.getByTestId('add-client-button').click();await page.getByTestId('new-client-name').fill(name);await page.getByTestId('new-client-save').click();await expect(page.getByTestId('add-client-dialog')).not.toBeVisible();
  await main.getByRole('button',{name,exact:true}).click();await go('/onboarding');await main.getByRole('combobox',{name:framework,exact:true}).selectOption('applies');await main.getByRole('button',{name:'Next',exact:true}).click();
  const choices=main.getByRole('button',{name:'Unsure',exact:true});assert.equal(await choices.count(),17);for(let i=0;i<17;i++)await choices.nth(i).click();
  await main.getByRole('button',{name:'Next',exact:true}).click();await expect(main.getByRole('heading',{name:'Recurring Reviews',exact:true})).toBeVisible();await main.getByRole('button',{name:'Next',exact:true}).click();await main.getByRole('button',{name:'Complete onboarding',exact:true}).click();await expect(main.getByRole('heading',{name:'Client Profile',exact:true})).toBeVisible();
  return (await store()).clients.find(c=>c.name===name).client_id;
 }
 async function sharedSave(cid){
  const before=await store(),row=await open(cid,'A.5.1','soa');await content('A.5.1');assert.deepEqual((await store()).framework_assessments,before.framework_assessments,'guide is read-only');
  await expect(dialog.getByRole('status')).not.toContainText('Unsaved assessment');
  await dialog.getByLabel('SoA applicability').selectOption('included');await dialog.getByLabel('SoA justification').fill('SYNTHETIC scope: policy direction supports identified security risks.');await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC policy is communicated; coverage is partly verified.');await dialog.locator('input[value="in_progress"]').check();
  await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();
  await open(cid,'A.5.1');await expect(dialog.getByLabel('SoA justification')).toHaveValue('SYNTHETIC scope: policy direction supports identified security risks.');await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC policy is communicated; coverage is partly verified.');
  await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC updated from Annex A.');await dialog.getByRole('button',{name:'Save & next',exact:true}).click();await expect(dialog.getByRole('heading',{name:/A\.5\.2/})).toBeVisible();await expect(dialog.locator('.iso-guide-disclosure')).not.toHaveAttribute('open','');
  await open(cid,'A.5.1','soa');await page.reload();await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC updated from Annex A.');
  const after=await store(),saved=after.framework_assessments.find(r=>r.framework_assessment_id===row.framework_assessment_id);
  assert.equal(saved.soa_applicability,'included');assert.equal(saved.status,'in_progress');assert.equal(saved.assessment_history.length,(row.assessment_history||[]).length+2);
  assert.deepEqual(after.framework_assessments.filter(r=>r.client_id!==cid),before.framework_assessments.filter(r=>r.client_id!==cid));
  assert.equal(after.reviews.length,before.reviews.length);assert.equal(after.findings.length,before.findings.length);assert.equal(after.evidence.length,before.evidence.length);
 }
 try{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  await go('/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_dunder'));
  await go('/compliance/iso-27001');
  await expect(main.getByRole('tab')).toHaveCount(5);
  assert.deepEqual(await main.getByRole('tab').allTextContents(),['Overview','Statement of Applicability','ISMS Requirements','Annex A Controls','Internal Audit']);
  await expect(main.locator('button.iso-program-card')).toHaveCount(4);
  assert.equal(await main.locator('.iso-program-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  assert.equal(await main.getByText('Work next',{exact:true}).count(),0);
  await main.getByRole('tab',{name:'Overview',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(main.getByRole('tab',{name:'Statement of Applicability',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(main.getByRole('tab',{name:'Internal Audit',exact:true})).toBeFocused();await page.keyboard.press('Home');await expect(main.getByRole('tab',{name:'Overview',exact:true})).toBeFocused();
  for(const [view,title] of [['soa','Statement of Applicability'],['isms_clause','ISMS Requirements'],['annex_control','Annex A Controls'],['audit','Internal Audit']]){
   await go('/compliance/iso-27001?iso_view='+view);await expect(main.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
  const canonical=await store();
  await go('/compliance/iso-27001?iso_view=soa');await main.getByRole('button',{name:'All controls',exact:true}).click();const trigger=main.getByTestId('requirement-A.5.1').getByRole('button').first();await trigger.click();await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();await dialog.locator('.iso-guide-disclosure > summary').focus();await page.keyboard.press('Enter');await expect(dialog.locator('.iso-guide-disclosure')).toHaveAttribute('open','');await dialog.getByRole('button',{name:'Close assessment',exact:true}).click();await expect(trigger).toBeFocused();
  for(const id of coverageIds){await open('demo_dunder',id,id.startsWith('A.')?'annex_control':'isms_clause');await content(id);if(!id.startsWith('A.'))await expect(dialog.locator('input[value="not_applicable"]')).toHaveCount(0);}
  assert.deepEqual((await store()).framework_assessments,canonical.framework_assessments);
  console.log(`${coverageIds.length} ISO records and their five guide answers rendered without writes.`);
  await sharedSave('demo_dunder');
  await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC unsaved guard');await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'Leave unsaved changes?',exact:true})).toBeVisible();await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC unsaved guard');
  await dialog.getByRole('button',{name:'Close assessment',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(dialog).toHaveCount(0);
  await open('demo_dunder','A.8.30','soa');await dialog.getByLabel('SoA applicability').selectOption('excluded');await dialog.getByLabel('SoA justification').fill('');await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('justification');await dialog.getByLabel('SoA justification').fill('SYNTHETIC no outsourced development in this scope.');await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();await page.reload();await expect(dialog.getByLabel('SoA justification')).toHaveValue('SYNTHETIC no outsourced development in this scope.');
  await open('demo_dunder','4.1','isms_clause');await dialog.getByRole('button',{name:'Raise Finding',exact:true}).click();await dialog.getByLabel('Finding title',{exact:true}).fill('SYNTHETIC ISO context gap');await dialog.getByLabel('Remediation Action title').fill('SYNTHETIC clarify context');await dialog.getByRole('button',{name:'Create Finding & Action',exact:true}).click();await expect(dialog.getByRole('button',{name:'SYNTHETIC ISO context gap',exact:true})).toBeVisible();
  const found=(await store()).findings.find(f=>f.title==='SYNTHETIC ISO context gap');assert.equal(found.framework_assessment_id,(await rows('demo_dunder')).find(r=>r.definition_id==='4.1').framework_assessment_id);assert.equal((await store()).tasks.filter(t=>t.finding_id===found.finding_id).length,1);
  const out=process.env.QA_OUTPUT_DIR;if(out)fs.mkdirSync(out,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [1440,1280,1024,768,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);await open('demo_dunder','A.8.24');await content('A.8.24');
   const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert(bounds.scroll<=bounds.width+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify({theme,width,bounds}));
   if(out&&(width===1440||width===390))await page.screenshot({path:path.join(out,theme+'-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});await go('/compliance/iso-27001?iso_view=audit');await expect(main.getByRole('region',{name:'Internal Audit Program'})).toBeVisible();
  const auditReviews=(await store()).reviews.filter(r=>r.client_id==='demo_dunder'&&r.iso_audit);assert.equal(auditReviews.length,4);
  await main.locator('[aria-label="Quarterly audit progress"]').getByRole('button').first().click();await main.locator('[data-audit-item]').first().click();const auditDialog=page.locator('[data-assessment-shell]');await auditDialog.locator('.iso-guide-disclosure > summary').click();await auditDialog.getByRole('button',{name:'What should I examine or sample?',exact:true}).click();await expect(auditDialog.locator('.cis-guide-answer p')).toContainText('Sample');await auditDialog.getByRole('button',{name:'Close assessment',exact:true}).click();
  const isolated=await onboard('ISO redesign isolated QA','ISO/IEC 27001');assert.equal((await rows(isolated)).length,123);assert((await rows(isolated)).every(r=>r.status==='not_assessed'&&!r.implementation&&!r.assessment_history?.length));await sharedSave(isolated);
  await open(isolated,'A.6.3');await content('A.6.3');await open(isolated,'A.7.2');await content('A.7.2');
  const mixed=await onboard('ISO redesign existing CIS QA','CIS Controls v8.1 IG1');const cisBefore=(await store()).framework_assessments.filter(r=>r.client_id===mixed);
  await go('/client-settings?tab=compliance');await page.getByRole('combobox',{name:'Applicability — ISO/IEC 27001',exact:true}).selectOption('applies');await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();await expect.poll(async()=>(await rows(mixed)).length).toBe(123);await sharedSave(mixed);
  assert.deepEqual((await store()).framework_assessments.filter(r=>r.client_id===mixed&&r.framework_key==='cis-ig1'),cisBefore);
  await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_brawndo'));const cis=(await store()).framework_assessments.find(r=>r.client_id==='demo_brawndo'&&r.definition_id==='1.1');await go('/compliance/cis-ig1?assessment='+cis.framework_assessment_id);await expect(page.getByTestId('brawndo-cis-assessment').getByLabel('Current implementation',{exact:true})).toBeEnabled();
  await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_prestige'));const soc=(await store()).framework_assessments.find(r=>r.client_id==='demo_prestige'&&r.definition_id==='CC1.1');await go('/compliance/soc-2?assessment='+soc.framework_assessment_id);await expect(page.getByTestId('prestige-soc-assessment').getByLabel('Current implementation',{exact:true})).toBeEnabled();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({guides:coverageIds.length,answers:coverageIds.length*5,scenarios:['Dunder','new ISO only','existing CIS adds ISO'],sharedPersistence:true,exclusionValidation:true,findingAction:true,readOnlyGuide:true,history:true,auditGuide:true,quarterlyProgress:true,keyboardAndFocus:true,themes:['light','dark'],widths:[1440,1280,1024,768,390],errors}));
 }catch(e){console.error((await page.locator('body').innerText()).slice(-3500));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
