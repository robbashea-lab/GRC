// Disposable Demo browser storage. No real API or shared client writes.
const {chromium,expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prefix='Unified ticket verification';
(async()=>{
 const {base,out,route}=await require('./ticket-verification-target.cjs')();
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 await context.route('**/*',route);
 const result={assessments:[],tickets:[],checks:[],errors:[]};let stage='enter';
 const store=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')));
 const go=p=>page.goto(base+p),drawer=page.getByTestId('remediation-ticket-drawer');
 const assessment=page.getByTestId('brawndo-cis-assessment');
 const open=async t=>{await go('/action-items?view=all');await page.getByTestId('ai-search').fill(t.title);await page.getByRole('button',{name:t.title,exact:true}).click();await expect(drawer).toBeVisible();};
 const validate=async()=>{await drawer.getByLabel('Validation rationale',{exact:true}).fill('Synthetic independent sample checked.');await drawer.getByRole('button',{name:'Validate and complete',exact:true}).click();await expect(drawer.getByRole('status')).toContainText('Ticket completed. Validation saved.');};
 try{
  await go('/');await page.getByTestId('explore-demo').click();await page.getByTestId('sidebar-open-demo_brawndo').click();
  const initial=await store(),first=initial.framework_assessments.find(a=>a.client_id==='demo_brawndo'&&a.framework_key==='cis-ig1'&&a.definition_id==='1.1');
  await go('/compliance/cis-ig1?assessment='+first.framework_assessment_id);
  for(let i=0;i<10;i++){
   stage='assessment '+i;await expect(assessment.getByLabel('Current implementation',{exact:true})).toBeEnabled();
   const aid=new URL(page.url()).searchParams.get('assessment');result.assessments.push(aid);
   if([0,2,5].includes(i)){
    await assessment.getByRole('button',{name:'Raise Finding',exact:true}).click();
    await assessment.getByLabel('Finding title',{exact:true}).fill(prefix+' issue '+i);
    await assessment.getByLabel('Finding description',{exact:true}).fill('Recorded issue '+i+': former accounts remained active.');
    await assessment.getByLabel('Corrective action',{exact:true}).fill(prefix+' action '+i);
    await assessment.getByLabel('Finding target date',{exact:true}).fill('2026-12-'+(10+i));
    await assessment.getByRole('button',{name:'Finding owner',exact:true}).click();
    const choices=page.locator('[aria-label="Finding owner candidates"]').getByRole('button');
    if(i===5)await choices.filter({hasText:/^Unassigned$/}).click();else {await expect(choices.nth(2)).toBeVisible();await choices.nth(i===0?1:2).click();}
    if(i===0){await assessment.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('Leave unsaved changes');await page.getByRole('button',{name:'Keep editing',exact:true}).click();}
    await assessment.getByRole('button',{name:'Create Finding & Action',exact:true}).click();
    await expect(assessment.getByLabel('Finding title',{exact:true})).toHaveCount(0);
    await expect(assessment.getByRole('button',{name:prefix+' action '+i,exact:true})).toBeVisible();
    await expect(assessment.getByRole('status')).toContainText('Ticket saved');
    const db=await store(),finding=db.findings.find(f=>f.title===prefix+' issue '+i),tasks=db.tasks.filter(t=>t.finding_id===finding.finding_id);assert.equal(tasks.length,1);
    result.tickets.push({aid,fid:finding.finding_id,tid:tasks[0].task_id,title:tasks[0].title,owner:tasks[0].assignee_id,due:tasks[0].due_date});
   }
   if(i<9){await assessment.getByRole('button',{name:'Save & next',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('assessment')).not.toBe(aid);}
  }
  result.checks.push('ten consecutive assessments; three tickets; different owners, dates and unassigned work');
  stage='complete and validate';const t=result.tickets[0];await open(t);
  await expect(drawer).toContainText('Recorded issue 0');
  await drawer.getByLabel('Planned action',{exact:true}).fill('Planned correction');
  await drawer.getByLabel('Actual resolution',{exact:true}).fill('Actual correction and verified sample');
  await drawer.getByLabel('Attach ticket evidence',{exact:true}).setInputFiles({name:'synthetic-ticket.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic evidence only')});
  await expect(drawer).toContainText('Evidence attached to this ticket');
  await drawer.getByRole('button',{name:'Complete work',exact:true}).click();await expect(drawer).toContainText('Pending validation');
  await go('/action-items?view=active');await page.getByTestId('ai-search').fill(prefix);await expect(page.locator('tbody tr')).toHaveCount(3);
  await go('/compliance/cis-ig1?assessment='+t.aid);await assessment.getByRole('button',{name:t.title,exact:true}).click();await validate();
  await go('/action-items?view=completed');await page.getByTestId('ai-search').fill(t.title);await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByRole('button',{name:t.title,exact:true}).click();
  await expect(drawer.getByLabel('Actual resolution',{exact:true})).toHaveValue('Actual correction and verified sample');await expect(drawer.getByLabel('Planned action',{exact:true})).toHaveValue('Planned correction');await expect(drawer).toContainText('synthetic-ticket.txt');
  const history=drawer.locator('details').filter({has:page.getByText('History and comments',{exact:true})});await history.locator('summary').click();await expect(history).toContainText('validate');const completedHistory=await history.locator('li').allTextContents();
  await drawer.getByRole('button',{name:/CIS Controls v8.1 Assessment/}).click();await expect(assessment).toBeVisible();await expect(assessment).toContainText('1.1');
  await go('/compliance/cis-ig1?assessment='+t.aid);await page.reload();await assessment.getByRole('button',{name:t.title,exact:true}).click();await expect(drawer).toContainText('Completed');await expect(drawer.getByLabel('Actual resolution',{exact:true})).toHaveValue('Actual correction and verified sample');await expect(drawer).toContainText('synthetic-ticket.txt');await history.locator('summary').click();await expect(history.locator('li')).toHaveText(completedHistory);
  result.checks.push('one Completed entry; refreshed source/register matching status, resolution, plan, evidence and history; exact assessment origin');
  stage='reopen';await open(t);await drawer.getByRole('button',{name:'Reopen ticket',exact:true}).click();await expect(drawer).toContainText('Ticket reopened');
  const reopened=await store(),f=reopened.findings.find(f=>f.finding_id===t.fid);assert.notEqual(f.primary_task_id,t.tid);assert.equal(reopened.tasks.find(x=>x.task_id===t.tid).status,'done');assert.equal(f.decision_history.length,2);
  await go('/action-items?view=active');await page.getByTestId('ai-search').fill(prefix);await expect(page.locator('tbody tr')).toHaveCount(3);result.checks.push('reopen retains completed work and decisions; stable identity; unique active counts');
  stage='complete from source';const second=result.tickets[1];await go('/compliance/cis-ig1?assessment='+second.aid);await assessment.getByRole('button',{name:second.title,exact:true}).click();await drawer.getByLabel('Actual resolution',{exact:true}).fill('Source-side correction');await drawer.getByRole('button',{name:'Complete work',exact:true}).click();await validate();
  stage='standalone';await go('/action-items');await page.getByRole('button',{name:'New Action Item',exact:true}).click();await page.getByTestId('field-title').fill(prefix+' standalone');await page.getByTestId('drawer-save').click();
  await open({title:prefix+' standalone'});await drawer.getByRole('button',{name:'Complete work',exact:true}).click();await expect(drawer).toContainText('Completed');assert.ok(!(await store()).tasks.find(t=>t.title===prefix+' standalone').finding_id);result.checks.push('source-side completion/validation; standalone direct completion without Finding');
  stage='responsive keyboard';await page.setViewportSize({width:390,height:844});await expect(drawer).toBeVisible();await drawer.evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));assert.equal(await drawer.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1;}),true);await page.keyboard.press('Tab');assert.equal(await drawer.evaluate(e=>e.contains(document.activeElement)),true);await page.screenshot({path:path.join(out,'unified-ticket-mobile.png')});
  result.checks.push('mobile layout and keyboard focus');
  const final=await store();for(const kind of ['findings','tasks','framework_assessments'])assert.deepEqual(final[kind].filter(r=>r.client_id!=='demo_brawndo'),initial[kind].filter(r=>r.client_id!=='demo_brawndo'));
  result.status='passed';
 }catch(e){result.status='failed';result.errors.push({stage,message:e.message,url:page.url(),body:(await page.locator('body').innerText()).slice(-12000)});await page.screenshot({path:path.join(out,'unified-ticket-failure.png'),fullPage:true});}
 fs.writeFileSync(path.join(out,'unified-ticket-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();if(result.status!=='passed')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
