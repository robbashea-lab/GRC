/* Run with Node, Playwright, the test Python runtime and the built staging frontend.
   This harness owns one short-lived loopback server and one private browser context. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {unzipSync}=require('fflate');

const base='http://127.0.0.1:18194';
const root=path.resolve(__dirname,'../../..');
const build=path.resolve(process.env.APPROVED_QA_BUILD || path.join(root,'deploy/cloudflare/dist'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const receipt={checks:[],build:path.basename(build),bundle:hash(fs.readFileSync(path.join(build,'approved-v3-native.js')))};
const selectedCase=process.env.APPROVED_QA_CASE;
if(selectedCase)receipt.selectedCase=selectedCase;
const password=crypto.randomBytes(24).toString('hex'),runId=crypto.randomUUID();
const owner='owner@example.com',clientId='v3sample_brawndo';

async function waitFor(check,message,timeout=30000) {
  const end=Date.now()+timeout;
  do {if(await check())return;await delay(150);}while(Date.now()<end);
  throw Error(message);
}
function pass(name) {receipt.checks.push(name);console.log('PASS',name);}
async function run(){
  let server,browser,context,page;
  const failures=[],pageErrors=[],external=[];
  try {
    try {await fetch(base+'/qa-native-identity');throw Error('Port 18194 is already in use.');}
    catch(error){if(error.message==='Port 18194 is already in use.')throw error;}
    server=spawn(process.env.APPROVED_QA_PYTHON || 'python',[path.join(root,'backend/tests/approved_v3_browser_server.py'),build],{
      cwd:root,windowsHide:true,stdio:['ignore','inherit','inherit'],env:{...process.env,GOVERNARA_QA_PASSWORD:password,
        GOVERNARA_QA_JWT:crypto.randomBytes(40).toString('hex'),GOVERNARA_QA_RUN_ID:runId}});
    await waitFor(async()=>{
      if(server.exitCode!==null)throw Error('The disposable server exited with '+server.exitCode);
      try{return (await (await fetch(base+'/qa-native-identity')).json()).run_id===runId;}catch{return false;}
    },'The disposable server did not identify this run.');
    browser=await chromium.launch({headless:true,executablePath:process.env.APPROVED_QA_BROWSER || undefined,
      args:['--disable-background-networking']});
    context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===base || ['data:','blob:'].includes(url.protocol))return route.continue();
      external.push(url.origin);await route.abort();
    });
    page=await context.newPage();page.setDefaultTimeout(9000);
    page.on('pageerror',e=>pageErrors.push(e.message));
    page.on('response',async resp=>{if(resp.status()>=400 && resp.url().includes('/api/') && !resp.url().endsWith('/auth/me'))
      failures.push({path:new URL(resp.url()).pathname,status:resp.status(),detail:(await resp.text().catch(()=>'' )).slice(0,260)});});
    const api=async uri=>page.evaluate(async path=>{
      const response=await fetch('/api'+path,{credentials:'same-origin'});
      if(!response.ok)throw Error(path+' returned '+response.status());
      return response.json();
    },uri);
    const records=async(cid=clientId)=>(await api('/v3/approved-portfolio/records?client_id='+encodeURIComponent(cid))).records;
    const ready=async()=>{
      const result=await page.waitForFunction(()=>document.querySelector('[data-native-workspace-error]')?.textContent ||
        (!document.getElementById('native-workspace-loading')&&window.GoverNaraNativePage?.snapshot().users.some(u=>u.self&&u.id==='qa-owner')?true:false),
        null,{timeout:45000});
      const status=await result.jsonValue();assert.equal(status,true,String(status));
    };
    const snapshot=()=>page.evaluate(()=>window.GoverNaraNativePage.snapshot());
    const route=async hash=>{await page.evaluate(h=>new Promise(resolve=>{
      if(location.hash==='#'+h){resolve();return;}
      window.addEventListener('hashchange',()=>requestAnimationFrame(()=>resolve()),{once:true});location.hash=h;
    }),hash);};
    const action=(name,id)=>page.locator('[data-action="'+name+'"]'+(id?'[data-id="'+id+'"]':'')).filter({visible:true}).first();
    const settle=async()=>{await delay(225);await page.waitForFunction(()=>document.body.getAttribute('aria-busy')!=='true');};
    const assertSuccessfulSaves=async()=>{
      const rejected=await page.evaluate(()=>(window.qaNativeSaves||[]).filter(result=>result[0]===false));
      assert.deepEqual(rejected,[],'Every requested native save must succeed: '+JSON.stringify(rejected));
    };
    const reload=async()=>{await assertSuccessfulSaves();await page.reload();await ready();};
    const field=id=>page.locator('#f-'+id);
    const getRevision=async id=>(await records()).reviews.find(row=>row.review_id===id);
    const issues=[];
    async function workflow(label,exercise) {
      if(selectedCase && selectedCase!==label)return;
      try {await exercise();await assertSuccessfulSaves();}
      catch(error) {
        const issue={label,message:error.message,stack:error.stack,url:page.url(),visible:(await page.locator('body').innerText()).slice(-1600),
          saves:await page.evaluate(()=>window.qaNativeSaves||[])};
        issues.push(issue);console.log('FAILED',label,issue.message);
        await page.goto(base+'/clients');await ready();
      }
    }

    await page.goto(base+'/clients');assert.equal(new URL(page.url()).pathname,'/login');
    await page.getByTestId('email-input').fill(owner);await page.getByTestId('password-input').fill(password);
    await page.locator('button[type=submit]').click();await page.waitForURL('**/clients**',{timeout:25000});await ready();
    assert.ok((await context.cookies()).some(cookie=>cookie.name==='access_token'&&cookie.httpOnly&&cookie.secure));
    const approved=await page.evaluate(async()=>{
      const response=await fetch('/clients',{credentials:'same-origin',headers:{Accept:'text/html'}});
      const bundle=await fetch('/approved-v3-native.js');
      const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await bundle.arrayBuffer()));
      return {status:response.status,source:response.headers.get('x-governara-source-sha256'),
        bundle:Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')};
    });
    assert.equal(approved.status,200);assert.equal(approved.source,hash(fs.readFileSync(path.join(build,'visual-preview.html'))));
    assert.equal(approved.bundle,receipt.bundle);
    pass('Normal sign-in opened the authenticated approved page and exact build.');
    await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
      const page=window.GoverNaraNativePage;if(!page)return;const finish=page.finish;window.qaNativeSaves=[];
      page.finish=(...args)=>{window.qaNativeSaves.push(args);return finish(...args);};
    }));
    await reload();
    const original=await snapshot();assert.equal(original.clients.length,8);
    receipt.calendarWidths={};
    for(const client of original.clients){
      await route('portfolio');
      await page.locator('#nav-clients').getByRole('link',{name:client.name,exact:true}).click();
      await page.locator('#side-client a[href="#client-'+client.id+'-calendar"]').click();
      await page.locator('.cal-cell').first().waitFor();
      assert.equal(await page.locator('#v-client .dash-head h1').innerText(),'Calendar');
      assert.ok((await page.locator('#v-client .dash-head .eyebrow').innerText()).includes(client.name.toUpperCase()),client.name);
      const dimensions=await page.locator('.cal-grid').first().evaluate(grid=>({grid:grid.getBoundingClientRect().width,
        available:document.querySelector('#v-client .dash-head').getBoundingClientRect().width}));
      receipt.calendarWidths[client.name]=dimensions;
      assert.ok(dimensions.grid>=dimensions.available-20,client.name+' calendar uses the available desktop area');
    }
    for(const width of [1920,390]){
      await page.setViewportSize({width,height:900});
      const size=await page.locator('.cal-grid').first().evaluate(grid=>({grid:grid.getBoundingClientRect().width,
        workspace:document.querySelector('#v-client .dash-head').getBoundingClientRect().width,
        panel:grid.closest('.panel').getBoundingClientRect().width,documentWidth:document.documentElement.scrollWidth}));
      receipt.calendarWidths[width+'px']=size;
      assert.ok(Math.abs(size.panel-size.workspace)<4,'Calendar panel follows full workspace width at '+width);
      assert.ok(size.documentWidth<=width+1,'Calendar does not overflow the page at '+width);
      if(width>1000)assert.ok(size.grid>=size.workspace-20,'Wide desktop grid expands with the workspace');
    }
    await page.setViewportSize({width:1440,height:900});
    assert.equal((await api('/clients')).find(c=>c.client_id==='qa-existing')?.name,'Retained QA client');
    pass('Used the portfolio links for all eight clients, verified full calendar width on desktop and phone, and preserved the original client.');
    await route('client-brawndo-calendar');
    const scheduled=original.work.brawndo.revs.find(r=>r.title==='Enterprise Asset Inventory Review').id;
    const review=original.work.brawndo.revs.find(r=>r.id===scheduled);assert.ok(review.nativeId);
    await workflow('Calendar move',async()=>{
    const prior=await getRevision(review.nativeId);
    const target=await page.locator('[data-drop-date]').evaluateAll((cells,old)=>cells.map(c=>c.dataset.dropDate).find(d=>d!==old),prior.due_date.slice(0,10));
    const event=page.locator('[data-action="cal-ev"][data-kind="rev"][data-id="'+scheduled+'"]').first();
    await event.dragTo(page.locator('[data-drop-date="'+target+'"]').first());await field('due').waitFor();
    assert.equal(await field('due').inputValue(),target);await action('dlg-run').click();
    await waitFor(async()=>(await getRevision(review.nativeId)).due_date.slice(0,10)===target,'Calendar drag was not saved.');
    await reload();
    const savedDay=await page.evaluate(id=>{const due=window.GoverNaraNativePage.snapshot().work.brawndo.revs.find(r=>r.id===id).due;
      return [due.getFullYear(),String(due.getMonth()+1).padStart(2,'0'),String(due.getDate()).padStart(2,'0')].join('-');},scheduled);
    assert.equal(savedDay,target);assert.equal((await getRevision(review.nativeId)).current_occurrence_id,prior.current_occurrence_id);
    pass('Calendar drag saved the same review occurrence and survived reload.');
    });
    await workflow('Action editing',async()=>{
    await route('client-brawndo-actions');await action('new-act').click();
    await field('title').fill('Browser QA inventory task');await field('description').fill('Collect the sample from the inventory owner.');
    await field('owner').selectOption({label:'QA Owner'});await action('dlg-run').click();
    await waitFor(async()=>(await records()).tasks.some(t=>t.title==='Browser QA inventory task'),'New Action did not reach its native record.');
    await reload();const added=(await snapshot()).work.brawndo.acts.find(t=>t.title==='Browser QA inventory task');assert.ok(added.nativeId);
    await action('open-act',added.id).click();await action('act-edit',added.id).click();await field('description').fill('Confirmed owner and asset inventory.');
    await action('dlg-run').click();await waitFor(async()=>(await records()).tasks.some(t=>t.task_id===added.nativeId && t.description==='Confirmed owner and asset inventory.'),'Action description did not persist.');
    await page.locator('#dlg').waitFor({state:'hidden'});
    pass('Created and edited an Action using its native ID after reload.');
    });
    await workflow('Review and evidence',async()=>{
    await route('client-brawndo-reviews');await action('open-rev',scheduled).click();
    await page.locator('#drawer .review-check-card').first().waitFor();await action('rev-complete-dlg',scheduled).click();
    await page.locator('#toast').filter({hasText:/result for every checklist step/i}).waitFor();
    assert.equal(await field('outcome').count(),0,'Missing checklist steps must prevent completion.');
    await page.locator('#drawer [data-action="dr-tab"][data-val="evidence"]').click();
    await action('rev-ev',scheduled).click();const bytes=Buffer.from('GoverNara disposable browser evidence\n');
    await page.locator('#f-nativeEvidenceFile').setInputFiles({name:'inventory-proof.txt',mimeType:'text/plain',buffer:bytes});
    await action('dlg-run').click();await waitFor(async()=>(await records()).evidence.some(e=>e.filename==='inventory-proof.txt'&&e.sha256===hash(bytes)),'Real file was not saved.');
    await reload();await route('client-brawndo-evidence');const fileButton=page.locator('[data-action="ev-file"][data-id="inventory-proof.txt"]:visible').first();
    if(!await fileButton.count())await page.locator('[data-action="ev-open-folder"][data-val="Reviews"]').click();
    await fileButton.click();const downloaded=page.waitForEvent('download');
    await action('native-evidence-download').click();const file=await downloaded;
    assert.equal(hash(fs.readFileSync(await file.path())),hash(bytes));
    pass('Reviewed completion rules and recovered the exact uploaded evidence bytes after reload.');
    await action('dlg-close').click();
    if(await action('drawer-close').count())await action('drawer-close').click();
    await page.locator('[data-action="ev-zip"][data-val="__all"]:visible').click();
    const archiveDownload=page.waitForEvent('download');await action('ev-zip-go').click();
    const archive=unzipSync(fs.readFileSync(await (await archiveDownload).path()));
    const contents=Object.entries(archive).filter(([name])=>name!=='index.csv');
    assert.ok(contents.length>0);contents.forEach(([,content])=>assert.equal(hash(content),hash(bytes)));
    const indexText=Buffer.from(archive['index.csv']).toString('utf8'),evidence=(await records()).evidence;
    assert.ok(indexText.includes(evidence.find(row=>row.filename==='inventory-proof.txt').evidence_id));
    evidence.filter(row=>row.file_available===false).forEach(row=>assert.ok(!indexText.includes(row.evidence_id)));
    pass('Evidence ZIP contained the exact saved file and native index without inventing bytes for metadata references.');
    });
    await runAdditional({page,action,field,route,settle,reload,snapshot,api,records,waitFor,workflow});
    if(issues.length){receipt.issues=issues;throw Error(issues.map(issue=>issue.label+': '+issue.message).join('\n'));}
    assert.deepEqual(pageErrors,[]);assert.deepEqual(failures,[]);
    receipt.externalOriginsBlocked=[...new Set(external)];receipt.result=selectedCase?'partial-pass':'pass';
  }catch(error){
    receipt.result='fail';receipt.error=error.message;receipt.stack=error.stack;receipt.apiFailures=failures;receipt.pageErrors=pageErrors;
    if(page&&!page.isClosed())receipt.visible=await page.locator('body').innerText().then(value=>value.slice(-1350)).catch(()=>'');
    throw error;
  }finally{
    if(process.env.APPROVED_QA_RECEIPT)fs.writeFileSync(process.env.APPROVED_QA_RECEIPT,JSON.stringify(receipt,null,2));
    await context?.close();await browser?.close();if(server&&server.exitCode===null)server.kill();
  }
}

async function runAdditional({page,action,field,route,settle,reload,snapshot,api,records,waitFor,workflow}) {
  await workflow('Client Profile',async()=>{
  await route('client-brawndo-profile');
  await page.locator('[data-action="prof-tab"][data-val="organization"]').first().click();
  await page.locator('[data-action="prof-edit2"][data-val="org"]').first().click();
  await page.locator('#pf-notes').fill('Native browser QA profile note.');
  await action('pf-save').click();
  await waitFor(async()=>JSON.stringify((await records()).clients[0].profile).includes('Native browser QA profile note.'),'Profile edit did not persist.');
  await reload();assert.ok(JSON.stringify((await snapshot()).profile.brawndo).includes('Native browser QA profile note.'));
  pass('Client Profile notes survived reload.');
  });
  await workflow('CMMC export',async()=>{
  await route('client-cyberdyne-program');
  await page.getByRole('button',{name:/SPRS score/i}).first().click();
  const download=page.waitForEvent('download');await action('cmmc-export-score').click();
  const workbook=await download;assert.ok(fs.readFileSync(await workbook.path()).subarray(0,2).equals(Buffer.from('PK')));
  pass('Downloaded a native CMMC SPRS workbook.');
  });
  await workflow('Client onboarding',async()=>{
  await route('client-management');await action('add-client').click();await field('name').fill('Browser QA new client');
  await action('save-client').click();
  await waitFor(async()=>(await api('/clients')).some(c=>c.name==='Browser QA new client'),'New client missing from native client management.');
  await reload();const client=(await snapshot()).clients.find(c=>c.name==='Browser QA new client');assert.ok(client);
  await route('client-'+client.id+'-profile');
  await page.locator('[data-action="onb-next"]').first().waitFor();assert.ok((await snapshot()).work[client.id].acts.length===0);
  await page.locator('#onbp-cis').selectOption('ig1');await settle();
  await action('onb-next').click();await settle();
  const policies=page.locator('[data-action="onb-pol"][data-val="unsure"]:enabled');
  const policyCount=await policies.count();assert.ok(policyCount>0,'Onboarding offered baseline policies');
  for(let index=0;index<policyCount;index++){await policies.nth(index).click();await settle();}
  await action('onb-next').click();await settle();
  await action('onb-next').click();await settle();
  await action('onb-complete').click();
  const nativeClient=(await api('/clients')).find(c=>c.name==='Browser QA new client');
  const handoff=()=>api('/onboarding/handoff?client_id='+encodeURIComponent(nativeClient.client_id));
  await waitFor(async()=>{const {records:created}=await handoff();return created.policies?.length>0&&created.reviews?.length>0;},
    'Completed onboarding did not materialize native policies and reviews.',45000);
  await reload();const enrolled=(await snapshot()).clients.find(c=>c.id===client.id);
  assert.equal(enrolled.onboarded,true);assert.match(JSON.stringify(enrolled.progs),/cis/i);
  pass('New client reopened with an empty Action register, completed CIS IG1 onboarding and created native policies and reviews.');
  });
  await workflow('Multi-framework onboarding',async()=>{
  await route('client-management');await action('add-client').click();await field('name').fill('Browser QA multi-framework client');
  await action('save-client').click();await settle();await reload();
  const client=(await snapshot()).clients.find(c=>c.name==='Browser QA multi-framework client');assert.ok(client);
  await route('client-'+client.id+'-profile');
  for(const [program,value] of Object.entries({cis:'ig3',cmmc:'l2',soc:'applies',iso:'applies',nist:'applies',hipaa:'applies'})){
    await page.locator('#onbp-'+program).selectOption(value);await settle();
  }
  await action('onb-next').click();await settle();
  const answers=page.locator('[data-action="onb-pol"][data-val="unsure"]:enabled');
  const count=await answers.count();assert.ok(count>0);
  for(let index=0;index<count;index++){await answers.nth(index).click();await settle();}
  await action('onb-next').click();await settle();await action('onb-next').click();await settle();
  const planned=Number(await page.locator('.onb-rail .onb-r').filter({hasText:'Recurring Reviews'}).locator('b.num').innerText());
  assert.equal(planned,33,'The wizard previews the shared activities that will actually be created.');
  const saved=(await api('/clients')).find(c=>c.name==='Browser QA multi-framework client');assert.ok(saved);
  await action('onb-complete').click();
  await waitFor(async()=>(await records(saved.client_id)).clients[0].onboarding_baseline?.completed===true,
    'The six-framework onboarding did not finalize its saved native baseline.',45000);
  await settle();await reload();
  const data=await records(saved.client_id),frameworks=new Set(data.framework_assessments.map(a=>a.framework_key));
  assert.deepEqual([...frameworks].sort(),['cis-ig1','cmmc','hipaa','iso-27001','nist-csf-2','soc-2']);
  assert.equal(data.framework_assessments.filter(a=>a.framework_key==='cis-ig1').length,153);
  assert.equal(data.framework_assessments.filter(a=>a.framework_key==='cmmc').length,110);
  assert.ok(data.policies.length>0&&data.reviews.length>0);
  assert.equal(data.reviews.length,33,'The six-framework baseline has one series per selected shared activity.');
  assert.equal(data.reviews.flatMap(review=>review.framework_drivers||[]).filter(driver=>driver.framework_driver_active!==false).length,62);
  receipt.multiFramework={plannedReviews:planned,reviews:data.reviews.length,frameworkLinks:62,frameworks:[...frameworks].sort()};
  const projected=(await snapshot()).clients.find(c=>c.id===client.id);
  assert.equal(projected.onboarded,true);assert.equal(projected.progs.filter(p=>!p.retired).length,6);
  for(const program of projected.progs.filter(p=>!p.retired)){
    await route('client-'+client.id+'-program');
    await page.locator('#side-client [data-action="prog-switch"][data-val="'+program.k+'"]').click();await settle();
    assert.equal((await snapshot()).clients.find(c=>c.id===client.id).activeProg,program.k);
  }
  pass('A new six-framework client completed onboarding, retained CIS IG3/CMMC L2 scopes and all six native program links after reload.');
  });
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
