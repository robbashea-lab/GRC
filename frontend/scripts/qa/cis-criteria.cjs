// Disposable local Demo only; never targets persistent or hosted data.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const catalog=require('../../../shared/catalogs/cisIG1.json'),criteria=require('../../../shared/catalogs/operatorGuidance/cisAssessmentCriteria.json');
const guidance=require('../../../shared/catalogs/operatorGuidance/cisAssessmentGuidance.json');
const guide=require('../../../shared/catalogs/operatorGuidance/cisRequirementGuide.json');
const questions=['Explain this in plain language.','Where should I start?','What evidence could help?','What should I ask IT or our provider?','What common gaps should I look for?'];
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4179';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback Demo required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 try{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  const rows=await page.evaluate(()=>{
   localStorage.setItem('grc_client_id','demo_brawndo');
   return JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).framework_assessments.filter(a=>a.client_id==='demo_brawndo'&&a.framework_key==='cis-ig1');
  });
  assert.equal(rows.length,56);
  const open=async id=>{await page.goto(base+'/compliance/cis-ig1?assessment='+rows.find(r=>r.definition_id===id).framework_assessment_id);await expect(page.getByLabel('Current implementation',{exact:true})).toBeEnabled();};
  const dialog=page.getByTestId('brawndo-cis-assessment');
  const tested=process.env.QA_LAYOUT_ONLY?catalog.requirements.slice(0,1):catalog.requirements;
  for(const d of tested){
   await open(d.id);
   await expect(dialog.getByRole('heading',{name:'CIS IG1 '+d.id+' — '+d.title,exact:true})).toBeVisible();
   await expect(dialog.getByRole('link',{name:'Official CIS reference'})).toHaveAttribute('href',criteria.requirements[d.id].source);
   assert.deepEqual(await dialog.locator('.brawndo-step h3').allTextContents(),['1What CIS Requires','2CIS IG1 Assessment Criteria','3Implementation Status','4Current Implementation']);
   assert(!/Stronger practice|Previously recorded|Manage people|Foundation|Mature/.test(await dialog.innerText()));
   assert.equal(await dialog.locator('.cis-assessment-guidance input').count(),0);
   assert.deepEqual(await dialog.locator('.cis-assessment-guidance h4').allTextContents(),['What to review and confirm','Examples of supporting evidence','What good looks like']);
   assert.deepEqual(await dialog.locator('.cis-assessment-guidance li').allTextContents(),Object.values(guidance.requirements[d.id]).flat());
   const before=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).framework_assessments.find(a=>a.framework_assessment_id===id),rows.find(r=>r.definition_id===d.id).framework_assessment_id);
   const snapshot=await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3'));
   const panel=dialog.getByRole('complementary',{name:'Requirement guide',exact:true});
   await expect(panel.locator('.cis-guide-answer p')).toHaveText(guide.requirements[d.id].plain);
   for(const [index,text] of Object.values(guide.requirements[d.id]).entries()){
    await panel.getByRole('button',{name:questions[index],exact:true}).click();
    await expect(panel.locator('.cis-guide-answer p')).toHaveText(text);
    await expect(panel.getByRole('button',{name:questions[index],exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(panel.locator('[aria-pressed="true"]')).toHaveCount(1);
   }
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3')),snapshot,'Reading guide must not mutate any Demo records');
   await expect(dialog.getByText('Unsaved assessment changes',{exact:true})).toHaveCount(0);
   await dialog.locator('input[value="in_progress"]').check();
   await dialog.getByLabel('Verification result').selectOption('needs_validation');
   await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC QA implementation '+d.id);
   await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();
   await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();
   await page.reload();await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC QA implementation '+d.id);
   const after=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).framework_assessments.find(a=>a.framework_assessment_id===id),before.framework_assessment_id);
   assert.deepEqual(after.cis_assessment_criteria||[],before.cis_assessment_criteria||[]);
   assert.deepEqual(after.evidence_ids||[],before.evidence_ids||[]);
   assert.deepEqual(after.assessment_history.slice(0,before.assessment_history?.length||0),before.assessment_history||[]);
   await expect(dialog.getByLabel('Verification result')).toHaveValue('needs_validation');
  }
  await open('1.1');
  // Existing authoritative Finding/Action/Evidence flow remains outside the guidance.
  await dialog.getByRole('button',{name:'Raise Finding',exact:true}).click();
  await dialog.getByLabel('Finding title',{exact:true}).fill('SYNTHETIC QA guidance evidence gap');
  await dialog.getByLabel('Finding description',{exact:true}).fill('Isolated regression record; not client evidence.');
  await dialog.getByLabel('Corrective action',{exact:true}).fill('SYNTHETIC QA inspect supporting record');
  await dialog.getByRole('button',{name:'Create Finding & Action',exact:true}).click();
  const findingButton=dialog.getByRole('button',{name:'SYNTHETIC QA guidance evidence gap',exact:true});
  await expect(findingButton).toBeVisible();await findingButton.click();
  const findingDialog=page.getByTestId('findings-drawer');
  await findingDialog.getByRole('button',{name:'Evidence',exact:true}).click();
  const filename='synthetic-guidance-validation.txt';
  await findingDialog.getByTestId('drawer-evidence-input').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from('DEMO — SYNTHETIC DATA\nGuidance UI regression fixture.')});
  await expect(findingDialog.getByText(filename,{exact:true})).toBeVisible();
  const downloadEvent=page.waitForEvent('download');await findingDialog.getByRole('button',{name:'Download '+filename,exact:true}).click();
  const download=await downloadEvent;assert.equal(download.suggestedFilename(),filename);assert.equal(await download.failure(),null);
  await findingDialog.getByRole('button',{name:'Close',exact:true}).click();await expect(findingButton).toBeFocused();
  await page.reload();await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();
  await findingButton.click();await findingDialog.getByRole('button',{name:'Evidence',exact:true}).click();
  await expect(findingDialog.getByText(filename,{exact:true})).toBeVisible();
  await findingDialog.getByRole('button',{name:'Close',exact:true}).click();
  const relationships=await page.evaluate(filename=>{const db=JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')),f=db.findings.find(f=>f.title==='SYNTHETIC QA guidance evidence gap');return {finding:f,actions:db.tasks.filter(t=>t.finding_id===f.finding_id),files:db.evidence.filter(e=>e.filename===filename)};},filename);
  assert.equal(relationships.actions.length,1);assert.equal(relationships.files.length,1);
  assert.equal(relationships.finding.framework_assessment_id,rows.find(r=>r.definition_id==='1.1').framework_assessment_id);
  const out=process.env.QA_OUTPUT_DIR;
  if(out)fs.mkdirSync(out,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [1440,1280,1024,768]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);await page.reload();
   await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();
   const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
   assert(bounds.scroll<=bounds.width+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify({theme,width,bounds}));
   const layout=await dialog.evaluate(el=>{
    const rect=s=>el.querySelector(s).getBoundingClientRect();
    const left=rect('.cis-guidance-main'),right=rect('.cis-requirement-guide'),work=rect('[aria-label="Current implementation"]');
    return {left:{x:left.x,right:left.right,bottom:left.bottom,width:left.width},right:{x:right.x,y:right.y,width:right.width},workWidth:work.width,overflow:[...el.querySelectorAll('.cis-guidance-layout *')].some(e=>e.scrollWidth>e.clientWidth+2&&e.clientWidth>0)};
   });
   assert(!layout.overflow,JSON.stringify({width,layout}));
   if(width>1100)assert(layout.right.x>=layout.left.right&&layout.workWidth>layout.left.width);
   else assert(layout.right.y>=layout.left.bottom-1);
   if(out)await page.screenshot({path:path.join(out,theme+'-'+width+'.png')});
   await dialog.locator('.cis-requirement-guide').scrollIntoViewIfNeeded();
   const keyButton=dialog.getByRole('button',{name:questions[1],exact:true});await keyButton.focus();await page.keyboard.press('Enter');
   await expect(keyButton).toBeFocused();await expect(keyButton).toHaveAttribute('aria-pressed','true');
   await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:questions[2],exact:true})).toBeFocused();
   await page.keyboard.press('Space');await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.1'].evidence);
   if(out)await page.screenshot({path:path.join(out,theme+'-'+width+'-guide.png')});
  }
  await dialog.getByLabel('Current implementation',{exact:true}).fill('Unsaved');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Leave unsaved changes?',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('Unsaved');
  await dialog.getByRole('button',{name:'Save & next',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/CIS IG1 1.2 —/})).toBeVisible();
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.2'].plain);
  await dialog.getByRole('button',{name:'Previous',exact:true}).click();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('Unsaved');
  await expect(dialog.locator('.cis-guide-answer p')).toHaveText(guide.requirements['1.1'].plain);
  await dialog.getByRole('button',{name:'Control 1',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByTestId('requirement-1.1').click();await expect(dialog).toBeVisible();
  for(let i=0;i<20;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('requirement-1.1')).toBeFocused();
  await expect(page.getByRole('link',{name:'Program configuration',exact:true})).toHaveCount(0);
  // Real existing framework records; do not activate CIS for canonical ISO/SOC clients.
  for(const [cid,framework,testId] of [['demo_dunder','iso-27001','framework-assessment-workspace'],['demo_prestige','soc-2','prestige-soc-assessment']]){
   const target=await page.evaluate(({cid,framework})=>{
    localStorage.setItem('grc_client_id',cid);
    return JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).framework_assessments.find(a=>a.client_id===cid&&a.framework_key===framework);
   },{cid,framework});
   assert(target,'Existing '+framework+' assessment required');
   await page.goto(base+'/compliance/'+framework+'?assessment='+target.framework_assessment_id);
   await expect(page.getByTestId(testId)).toBeVisible();
   await expect(page.locator('.cis-requirement-guide')).toHaveCount(0);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({safeguardsSavedAndReloaded:tested.length,guideAnswersChecked:tested.length*5,guideNeverMutatesRecords:true,guideKeyboard:true,findingAndSingleAction:true,evidenceUploadDownloadReload:true,widths:[1440,1280,1024,768],themes:['light','dark'],draftGuard:true,saveNext:true,previous:true,escape:true,focusTrap:true,focusReturn:true,breadcrumb:true,runtimeErrors:errors}));
 }catch(e){console.error((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
