// Isolated optimized Demo checks; never mutates a shared workspace.
const fs=require('node:fs'), {chromium,expect}=require('playwright/test');
const base=process.env.ROBUSTNESS_URL||'http://127.0.0.1:4385';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Use an isolated loopback Demo build');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ROBUSTNESS_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 try{
  const context=await browser.newContext(),page=await context.newPage();
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.getByTestId('sidebar-open-demo_brawndo').click();
  const search=page.getByTestId('ai-search');
  for(const delay of [0,30,100]){
   await page.goto(base+'/action-items');await expect(search).toBeVisible();
   for(const value of ['Report','Extend','Report','Extend','Report']){await search.press('ControlOrMeta+A');await search.pressSequentially(value,{delay});}
   let matches=true;try{await expect(search).toHaveValue('Report',{timeout:3000});await expect(page).toHaveURL(/q=Report/);await expect(page.locator('tbody')).toContainText('Report training');}catch{matches=false;}
   results.push({scenario:'rapid replacement',delay,input:await search.inputValue(),url:page.url(),matches});
  }
  await page.goto(base+'/action-items?q=Report');
  const trigger=page.getByRole('button',{name:'Report training completion and follow up non-completers',exact:true});
  await trigger.focus();await page.keyboard.press('Enter');const drawer=page.getByTestId('remediation-ticket-drawer');await expect(drawer).toBeVisible();await page.keyboard.press('Tab');
  const contained=await drawer.evaluate(e=>e.contains(document.activeElement));await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(trigger).toBeFocused();
  results.push({scenario:'Escape invoking focus',contained,restored:true});
  await search.fill('Extend');await expect(page).toHaveURL(/q=Extend/);await page.goto(base+'/action-items?q=Report');await page.goBack();await expect(search).toHaveValue('Extend');await page.goForward();await expect(search).toHaveValue('Report');
  results.push({scenario:'back-forward query',matches:true});
  for(const [cid,key] of [['demo_brawndo','cis-ig1'],['demo_initech','cis-ig1'],['demo_prestige','soc-2'],['demo_dunder','iso-27001']]){
   await page.goto(base+'/clients');await page.getByTestId('sidebar-open-'+cid).click();
   const a=await page.evaluate(({cid,key})=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).framework_assessments.find(a=>a.client_id===cid&&a.framework_key===key),{cid,key});
   await page.goto(base+'/compliance/'+key+'?assessment='+a.framework_assessment_id);
   const shell=page.locator('[data-assessment-shell]'),title='Isolated focus check '+cid;
   await expect(shell.getByLabel('Current implementation',{exact:true})).toBeEnabled();
   await shell.getByRole('button',{name:'Raise Finding',exact:true}).click();
   await shell.getByLabel('Finding title',{exact:true}).fill(title+' issue');await shell.getByLabel('Finding description',{exact:true}).fill('Synthetic focus regression only.');
   await shell.getByLabel(key==='cis-ig1'?'Corrective action':'Remediation Action title',{exact:true}).fill(title);
   await shell.getByRole('button',{name:'Create Finding & Action',exact:true}).click();
   const source=shell.getByRole('button',{name:title,exact:true});await source.focus();await page.keyboard.press('Enter');await expect(drawer).toBeVisible();
   await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(source).toBeFocused();
   await source.click();await drawer.getByLabel('Actual resolution',{exact:true}).fill('Unsaved synthetic draft');await page.keyboard.press('Escape');
   await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'Keep editing',exact:true}).click();
   await expect(drawer.getByLabel('Actual resolution',{exact:true})).toHaveValue('Unsaved synthetic draft');
   await drawer.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();
   await expect(drawer).toHaveCount(0);await expect(source).toBeFocused();
   results.push({scenario:'source Escape, Close, cancel and discard focus',cid,key,matches:true});
   const opener=await source.elementHandle();await source.focus();await page.keyboard.press('Enter');await expect(drawer).toBeVisible();await opener.evaluate(e=>e.remove());
   await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
   await expect.poll(()=>page.evaluate(()=>document.activeElement.tagName)).not.toBe('BODY');
   results.push({scenario:'removed source invoker logical fallback',cid,key,matches:true});
  }
 }finally{await browser.close();const out=process.env.ROBUSTNESS_EVIDENCE;if(out)fs.writeFileSync(out,JSON.stringify(results,null,2));console.log(JSON.stringify(results));}
 if(results.some(r=>r.matches===false))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
