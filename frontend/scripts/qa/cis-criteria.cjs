// Disposable local Demo only; never targets persistent or hosted data.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const catalog=require('../../src/lib/cisIG1.json'),criteria=require('../../src/lib/operatorGuidance/cisAssessmentCriteria.json');
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
   assert.equal(await dialog.locator('.bcsg-criteria input').count(),criteria.requirements[d.id].criteria.length);
   await dialog.locator('.bcsg-criteria input').first().check();
   await dialog.locator('input[value="in_progress"]').check();
   await dialog.getByLabel('Verification result').selectOption('needs_validation');
   await dialog.getByLabel('Current implementation',{exact:true}).fill('SYNTHETIC QA implementation '+d.id);
   await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();
   await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();
   await page.reload();await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC QA implementation '+d.id);
   await expect(dialog.locator('.bcsg-criteria input').first()).toBeChecked();
   await expect(dialog.getByLabel('Verification result')).toHaveValue('needs_validation');
  }
  await open('1.1');
  const out=process.env.QA_OUTPUT_DIR;
  if(out)fs.mkdirSync(out,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [1440,1280,1024,768]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);await page.reload();
   await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();
   const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
   assert(bounds.scroll<=bounds.width+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify({theme,width,bounds}));
   if(out)await page.screenshot({path:path.join(out,theme+'-'+width+'.png')});
  }
  await dialog.getByLabel('Current implementation',{exact:true}).fill('Unsaved');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Leave unsaved changes?',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('Unsaved');
  await dialog.getByRole('button',{name:'Save & next',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:/CIS IG1 1.2 —/})).toBeVisible();
  await dialog.getByRole('button',{name:'Previous',exact:true}).click();
  await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('Unsaved');
  await dialog.getByRole('button',{name:'Control 1',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByTestId('requirement-1.1').click();await expect(dialog).toBeVisible();
  for(let i=0;i<20;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('requirement-1.1')).toBeFocused();
  await expect(page.getByRole('link',{name:'Program configuration',exact:true})).toHaveCount(0);
  await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_initech'));
  await page.goto(base+'/compliance/nist-csf-2');
  await expect(page.getByTestId('brawndo-cis-assessment')).toHaveCount(0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({safeguardsSavedAndReloaded:tested.length,widths:[1440,1280,1024,768],themes:['light','dark'],draftGuard:true,saveNext:true,previous:true,escape:true,focusTrap:true,focusReturn:true,breadcrumb:true,runtimeErrors:errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
