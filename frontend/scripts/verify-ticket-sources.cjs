// Synthetic Demo-only UI checks with isolated storage and same-origin networking.
const {chromium,expect}=require('playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {base,out,route}=await require('./ticket-verification-target.cjs')();
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(15000);
 await page.route('**/*',route);
 const go=p=>page.goto(base+p),store=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3'))),result={checks:[],errors:[]};
 let stage='enter';const drawer=page.getByTestId('remediation-ticket-drawer');
 async function exercise(cid,key,id){
  stage=[cid,key,id].join(' ');await go('/clients');await page.getByTestId('sidebar-open-'+cid).click();
  const a=(await store()).framework_assessments.find(a=>a.client_id===cid&&a.framework_key===key&&a.definition_id===id);assert(a,stage);
  await go('/compliance/'+key+'?assessment='+a.framework_assessment_id);
  const shell=page.locator('[data-assessment-shell]'),title='Source ticket '+cid+' '+id;
  await expect(shell.getByLabel('Current implementation',{exact:true})).toBeEnabled();
  await shell.getByLabel('Current implementation',{exact:true}).fill('Unsaved assessment narrative');
  await shell.getByRole('button',{name:'Raise Finding',exact:true}).click();
  await shell.getByLabel('Finding title',{exact:true}).fill(title+' issue');await shell.getByLabel('Finding description',{exact:true}).fill('Actual issue recorded independently');
  await shell.getByLabel(key==='cis-ig1'?'Corrective action':'Remediation Action title',{exact:true}).fill(title);
  await shell.getByLabel('Finding target date',{exact:true}).fill('2027-03-01');
  await expect(shell.getByRole('button',{name:'Finding owner',exact:true})).toBeVisible();
  if(id==='4.1'){
   await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage&&k==='grc_interactive_demo_v3'){Storage.prototype.setItem=original;throw new DOMException('Synthetic storage outage','QuotaExceededError');}return original.call(this,k,v);};});
   await shell.getByRole('button',{name:'Create Finding & Action',exact:true}).click();await expect(shell.getByRole('alert')).toBeVisible();assert(!(await store()).findings.some(f=>f.title===title+' issue'));
  }
  await shell.getByRole('button',{name:'Create Finding & Action',exact:true}).click();await expect(shell.getByLabel('Finding title',{exact:true})).toHaveCount(0);
  const finding=(await store()).findings.find(f=>f.title===title+' issue');assert(finding);
  assert.notEqual((await store()).framework_assessments.find(r=>r.framework_assessment_id===a.framework_assessment_id).implementation,'Unsaved assessment narrative');
  await shell.getByRole('button',{name:title,exact:true}).click();await expect(drawer).toContainText('Actual issue recorded independently');await drawer.getByLabel('Actual resolution',{exact:true}).fill('Verified correction '+id);
  await drawer.getByRole('button',{name:'Complete work',exact:true}).click();await drawer.getByLabel('Validation rationale',{exact:true}).fill('Verified sample '+id);await drawer.getByRole('button',{name:'Validate and complete',exact:true}).click();await expect(drawer).toContainText('Ticket completed. Validation saved.');
  await page.reload();await shell.getByRole('button',{name:title,exact:true}).click();await expect(drawer).toContainText('Completed');await expect(drawer.getByLabel('Actual resolution',{exact:true})).toHaveValue('Verified correction '+id);
  await go('/action-items?view=completed');await page.getByTestId('ai-search').fill(title);await expect(page.locator('tbody tr')).toHaveCount(1);result.checks.push({cid,key,id,result:'creation, draft preservation, source completion, validation, reload and one Completed entry passed'});
 }
 try{
  await go('/');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  for(const [cid,key,id]of [['demo_prestige','soc-2','CC1.1'],['demo_dunder','iso-27001','4.1'],['demo_dunder','iso-27001','A.5.1'],['demo_initech','cis-ig1','1.3']])await exercise(cid,key,id);
  stage='ISO audit item';await go('/clients');await page.getByTestId('sidebar-open-demo_dunder').click();const before=await store(),r=before.reviews.find(r=>r.client_id==='demo_dunder'&&r.iso_audit&&!['completed','cancelled'].includes(r.status));
  await go('/compliance/iso-27001?iso_view=audit&package='+r.iso_audit.package_key);const item=page.locator('[data-audit-item]').first();const key=await item.getAttribute('data-audit-item');await item.click();const shell=page.locator('[data-assessment-shell]');
  await shell.getByLabel('Auditor notes',{exact:true}).fill('Uncommitted notes must be discarded');await shell.getByRole('button',{name:'Create Finding',exact:true}).click();
  await shell.getByLabel('Finding title',{exact:true}).fill('Audit exact item issue');await shell.getByLabel('Remediation Action title',{exact:true}).fill('Audit exact item correction');await shell.getByRole('button',{name:'Create Finding & Action',exact:true}).click();await expect(shell.getByLabel('Finding title',{exact:true})).toHaveCount(0);
  const f=(await store()).findings.find(f=>f.title==='Audit exact item issue');assert((await store()).reviews.find(x=>x.review_id===r.review_id).iso_audit.items[key].finding_ids.includes(f.finding_id));
  await shell.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await go('/compliance/iso-27001?iso_view=audit&package='+r.iso_audit.package_key);await page.locator('[data-audit-item="'+key+'"]').click();await expect(shell.getByRole('button',{name:'Audit exact item correction',exact:true})).toBeVisible();await expect(shell.getByLabel('Auditor notes',{exact:true})).not.toHaveValue('Uncommitted notes must be discarded');result.checks.push({scenario:'ISO item association survives discarded draft and reload',result:'passed'});
  stage='historical origin';await go('/clients');await page.getByTestId('sidebar-open-demo_brawndo').click();const db=await store(),historical=db.findings.find(f=>f.client_id==='demo_brawndo'&&db.reviews.find(r=>r.review_id===f.review_id)?.occurrences?.some(o=>o.occurrence_id===f.occurrence_id));assert(historical);const review=db.reviews.find(r=>r.review_id===historical.review_id);
  await go('/action-items?finding_id='+historical.finding_id);await expect(drawer).toBeVisible();await drawer.getByRole('button',{name:review.title+' · '+review.occurrences.find(o=>o.occurrence_id===historical.occurrence_id).period,exact:true}).click();await expect(page.getByTestId('reviews-drawer')).toContainText(review.occurrences.find(o=>o.occurrence_id===historical.occurrence_id).period);result.checks.push({scenario:'exact historical Review occurrence',result:'passed'});
  stage='new client';await go('/admin/clients');await page.getByTestId('add-client-button').click();await page.getByTestId('new-client-name').fill('Synthetic ticket new client');await page.getByTestId('new-client-save').click();await expect(page.getByTestId('add-client-dialog')).toHaveCount(0);const cid=(await store()).clients.find(c=>c.name==='Synthetic ticket new client').client_id;
  await go('/clients');await page.getByTestId('sidebar-open-'+cid).click();await go('/onboarding');await page.getByLabel('SOC 2 Type 2',{exact:true}).selectOption('applies');await page.getByRole('button',{name:'Next',exact:true}).click();
  const unsure=page.getByRole('button',{name:'Unsure',exact:true});const n=await unsure.count();assert(n>0);for(let i=0;i<n;i++)await unsure.nth(i).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Complete onboarding',exact:true}).click();await expect.poll(async()=> (await store()).framework_assessments.some(a=>a.client_id===cid&&a.framework_key==='soc-2')).toBe(true);
  await exercise(cid,'soc-2','CC1.1');
  stage='add framework';await go('/client-profile?tab=program');await page.getByLabel(/Applicability — ISO/).selectOption('applies');await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();await expect.poll(async()=> (await store()).framework_assessments.some(a=>a.client_id===cid&&a.framework_key==='iso-27001')).toBe(true);await exercise(cid,'iso-27001','4.1');
  stage='themes';await go('/action-items');await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-brawndo-portal','dark');await page.getByTestId('ai-view-completed').click();await page.getByRole('button',{name:'Source ticket '+cid+' 4.1',exact:true}).click();await drawer.evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));await page.screenshot({path:path.join(out,'unified-ticket-dark.png')});result.checks.push({scenario:'shared dark theme and source drawer',result:'passed'});
  result.status='passed';
 }catch(e){result.status='failed';result.errors.push({stage,message:e.message,url:page.url(),body:(await page.locator('body').innerText()).slice(-14000)});}
 fs.writeFileSync(path.join(out,'unified-ticket-sources.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();if(result.status!=='passed')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
