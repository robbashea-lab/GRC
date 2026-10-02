// Published Demo verification. Credentials arrive on hidden stdin, never argv/files.
// Only the identified Site origin may receive requests; all business writes use UI.
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const SITE='https://iventure-grc-code-preview.mr-robbashea.chatgpt.site';
const KEY='grc_interactive_demo_v3';

async function input(){
  return new Promise((resolve,reject)=>{
    let text='';const terminal=process.stdin.isTTY;
    if(terminal)process.stdin.setRawMode(true);
    process.stderr.write('Ready for published QA JSON on stdin (input is hidden).\n');
    process.stdin.setEncoding('utf8');process.stdin.resume();
    const read=chunk=>{text+=chunk;if(!text.includes('\n'))return;
      process.stdin.removeListener('data',read);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();
      try{resolve(JSON.parse(text.trim()));}catch{reject(Error('Invalid QA input'));}
    };process.stdin.on('data',read);
  });
}

async function frameworkJourney({page,go,store,cid,framework,prefix}){
  await go('/compliance/'+framework);
  if(framework==='iso-27001')await page.getByRole('button',{name:/^Open ISMS Requirements\./}).click();
  await page.getByRole('textbox',{name:/^Search /}).fill(framework==='soc-2'?'CC1':framework==='cis-ig1'?'1.':'4.');
  const first=page.locator('[data-testid^="requirement-"]').first();
  if(await first.getByRole('button').count())await first.getByRole('button').first().click();else await first.click();
  const panel=page.locator('[data-testid="brawndo-cis-assessment"], [data-testid="prestige-soc-assessment"], [data-testid="framework-assessment-workspace"]');
  await expect(panel).toBeVisible();
  const text=framework==='iso-27001'?'How is this requirement implemented?':'Current implementation';
  const field=panel.getByLabel(text,{exact:true});
  await expect(field).toBeEnabled();
  await field.fill(prefix+' observed implementation; verification remains separate.');
  await panel.getByRole('button',{name:'Close assessment',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toContainText('unsaved');
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(field).toHaveValue(prefix+' observed implementation; verification remains separate.');
  const before=(await store()).framework_assessments.filter(a=>a.client_id===cid);
  await panel.getByRole('button',{name:'Save assessment',exact:true}).click();
  await expect(panel).toContainText('Assessment saved');
  const after=(await store()).framework_assessments.filter(a=>a.client_id===cid);
  const changed=after.find(a=>a.implementation===prefix+' observed implementation; verification remains separate.');
  assert.ok(changed,'assessment save persists');
  assert.equal(changed.status,before.find(a=>a.framework_assessment_id===changed.framework_assessment_id).status);
  if(framework==='soc-2')await panel.getByText('Linked work and history',{exact:true}).click();
  await panel.getByText('View History',{exact:true}).click();
  await expect(panel).toContainText(prefix+' observed implementation');
  if(framework==='soc-2')await expect(panel).toContainText('do not represent additional SOC 2 requirements');
  if(framework==='cis-ig1')await expect(panel).toContainText('do not introduce additional requirements');
  await panel.getByRole('button',{name:'Save & next',exact:true}).click();
  await expect(field).not.toHaveValue(prefix+' observed implementation; verification remains separate.');
  await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
  await page.reload();await expect(page.locator('main')).not.toBeEmpty();
  assert.equal((await store()).framework_assessments.find(a=>a.framework_assessment_id===changed.framework_assessment_id).implementation,changed.implementation);
}

async function dashboardJourney({page,go,store,cid,framework}){
  await go('/dashboard');const db=await store(),client=db.clients.find(c=>c.client_id===cid);
  const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../..','shared/catalogs',{'cis-ig1':'cisIG1.json','soc-2':'soc2.json','iso-27001':'iso27001.json'}[framework]),'utf8'));
  const categories=client.framework_settings?.['soc-2']?.categories||['security'];
  const definitions=new Map(catalog.requirements.map(r=>[r.id,r]));
  const rows=db.framework_assessments.filter(r=>r.client_id===cid&&r.framework_key===framework)
    .map(r=>({...definitions.get(r.definition_id),...r})).filter(r=>framework!=='soc-2'||categories.includes(r.category));
  const applicable=rows.filter(r=>r.specification==='annex_control'?r.soa_applicability!=='excluded':r.status!=='not_applicable');
  const implemented=applicable.filter(r=>r.status==='addressed').length,assessed=applicable.filter(r=>r.status!=='not_assessed').length;
  const title={'cis-ig1':'CIS IG1','soc-2':'SOC 2','iso-27001':'ISO 27001'}[framework];
  const card=page.locator('section.bd-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await expect(card).toBeVisible();
  if(applicable.length){await expect(card.locator('.bd-cis-measures')).toContainText(`${implemented} of ${applicable.length}`);await expect(card.locator('.bd-cis-measures')).toContainText(`${assessed} of ${applicable.length}`);}
  else await expect(card).toContainText('readiness not calculated');
  await card.getByText('How is this calculated?',{exact:true}).click();await expect(card).toContainText('not a');
  const material=db.findings.filter(f=>f.client_id===cid&&!['closed','accepted'].includes(f.status)&&['high','critical'].includes(f.severity));
  const link=page.getByRole('link').filter({hasText:'High / critical findings'});await expect(link.locator('strong')).toHaveText(String(material.length));await link.click();
  await expect(page.getByTestId('ai-view-high_critical')).toHaveAttribute('aria-pressed','true');
  const active=db.tasks.filter(t=>t.client_id===cid&&!['done','cancelled'].includes(t.status));
  const expectedRows=material.reduce((n,f)=>n+Math.max(1,active.filter(t=>t.finding_id===f.finding_id).length),0);
  await expect(page.locator('tr[data-testid^="ai-row-"]')).toHaveCount(expectedRows);
  return {framework,applicable:applicable.length,implemented,assessed,unassessed:applicable.length-assessed,material_findings:material.length,material_work_rows:expectedRows};
}

async function reviewJourney({page,expect,assert,go,store,cid,prefix}){
  const drawer=()=>page.getByTestId('reviews-drawer').last();
  const choose=async(control,name)=>{await control.click();await page.getByRole('option',{name,exact:true}).click();};
  await go('/reviews');
  const records=(await store()).reviews.filter(r=>r.client_id===cid&&!['completed','cancelled'].includes(r.status));
  await expect(page.locator('tr[data-testid^="reviews-row-"]')).toHaveCount(records.length);
  await page.getByTestId('reviews-search').fill('no matching '+prefix);
  await expect(page.locator('tr[data-testid^="reviews-row-"]')).toHaveCount(0);
  await page.getByTestId('reviews-search').fill('');
  await page.getByTestId('create-reviews-button').click();
  await drawer().getByTestId('field-title').fill(prefix+' Quarterly access review');
  await choose(drawer().getByTestId('field-review_type'),'Access');
  await drawer().getByTestId('field-due_date').fill('2027-01-31');
  await choose(drawer().getByTestId('field-recurrence'),'Quarterly');
  await drawer().getByTestId('drawer-save').click();
  await expect(drawer().getByTestId('review-start')).toBeVisible();
  let row=(await store()).reviews.find(r=>r.client_id===cid&&r.title===prefix+' Quarterly access review');
  assert.ok(row);assert.ok(!row.owner_id,'unassigned is retained rather than silently filled');
  await drawer().getByTestId('review-start').click();
  await drawer().getByTestId('tab-evidence').click();
  await drawer().getByTestId('drawer-evidence-input').setInputFiles({name:prefix+'-review.txt',mimeType:'text/plain',buffer:Buffer.from('Disposable release verification evidence')});
  await expect(drawer()).toContainText(prefix+'-review.txt');
  await drawer().getByTestId('tab-comments').click();
  await drawer().getByTestId('comment-input').fill(prefix+' observed account owner gap');
  await drawer().getByTestId('comment-submit').click();
  await expect(drawer()).toContainText(prefix+' observed account owner gap');
  await drawer().getByTestId('tab-overview').click();
  await drawer().getByTestId('quick-create-finding').click();
  await page.getByTestId('finding-title').fill(prefix+' ownership gap');
  await page.getByTestId('finding-remediation-title').fill(prefix+' reconcile account owners');
  // Inject a single browser-storage failure, not a successful business record.
  await page.evaluate(key=>{const original=Storage.prototype.setItem;window.__restoreQaStorage=()=>{Storage.prototype.setItem=original;};let failed=false;Storage.prototype.setItem=function(k,v){if(k===key&&!failed){failed=true;throw new DOMException('Injected quota failure','QuotaExceededError');}return original.call(this,k,v);};},KEY);
  const before=await store();
  await page.getByTestId('finding-save').click();
  await expect(page.getByText(/Changes were not saved/).first()).toBeVisible();
  assert.equal((await store()).findings.length,before.findings.length);
  await expect(page.getByTestId('finding-title')).toHaveValue(prefix+' ownership gap');
  await page.evaluate(()=>{window.__restoreQaStorage();delete window.__restoreQaStorage;});
  await page.getByTestId('finding-save').click();
  await expect(page.getByTestId('review-finding-form')).toHaveCount(0);
  const finding=(await store()).findings.find(f=>f.title===prefix+' ownership gap');
  assert.equal((await store()).tasks.filter(t=>t.finding_id===finding.finding_id).length,1);
  await drawer().getByTestId('review-complete').click();
  if(await page.getByTestId('review-complete-confirmed').count())await page.getByTestId('review-complete-confirmed').click();
  await expect(drawer().getByTestId('field-due_date')).toHaveValue('2027-04-30');
  await expect(drawer().getByTestId('review-history')).toContainText('2027');
  const saved=(await store()).reviews.find(r=>r.review_id===row.review_id);
  assert.equal(saved.occurrences.length,1);assert.ok(saved.occurrences[0].evidence.length);
  await go('/action-items');await page.getByText(prefix+' reconcile account owners',{exact:true}).click();
  await page.getByTestId('tasks-drawer').getByRole('button',{name:'Complete Action Item',exact:true}).click();
  await expect.poll(async()=>(await store()).findings.find(f=>f.finding_id===finding.finding_id).status).toBe('remediated');
  await expect(page.getByTestId('action-completion-handoff')).toContainText('awaiting validation');
  await go('/findings');await page.getByText(prefix+' ownership gap',{exact:true}).click();
  await page.getByTestId('finding-validate').click();
  await page.getByRole('dialog').last().locator('textarea').fill(prefix+' independently verified named account ownership');
  await page.getByRole('button',{name:'Record decision',exact:true}).click();
  await expect.poll(async()=>(await store()).findings.find(f=>f.finding_id===finding.finding_id).status).toBe('closed');
  await go('/reviews');await page.getByText(row.title,{exact:true}).click();
  await drawer().getByTestId('review-history').getByRole('button').first().click();
  await drawer().getByTestId('tab-evidence').click();await expect(drawer()).toContainText(prefix+'-review.txt');
  assert.deepEqual((await store()).reviews.find(r=>r.review_id===row.review_id).occurrences,saved.occurrences);
  await go('/calendar');await expect(page.locator('main')).not.toBeEmpty();
  return {review_id:row.review_id,finding_id:finding.finding_id,next_due:saved.due_date};
}

async function main(){
  const cfg=await input();assert.equal(cfg.origin,SITE);assert.ok(cfg.commit&&cfg.version&&cfg.mainFile&&cfg.mainSha256);
  const artifacts=path.resolve(cfg.artifacts);fs.mkdirSync(artifacts,{recursive:true});
  const results=[],errors=[];
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{
    for(const [cid,framework,name] of [['demo_brawndo','cis-ig1','Brawndo'],['demo_dunder','iso-27001','Dunder Mifflin'],['demo_prestige','soc-2','Prestige Worldwide']]){
      if(cfg.client&&cfg.client!==cid)continue;
      const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==SITE)return route.fulfill({status:204,body:''});
        assert.ok(!url.pathname.startsWith('/api/'),'Demo must not send backend requests');
        return route.continue({headers:{...route.request().headers(),...(cfg.bearer?{'OAI-Sites-Authorization':'Bearer '+cfg.bearer}:{})}});
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push({client:cid,message:e.message}));
      const go=async suffix=>{await page.goto(SITE+suffix);await expect(page.locator('main')).not.toBeEmpty();};
      const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),KEY);
      const prefix='Release QA '+name;
      const record=(scenario,detail)=>{results.push({client:cid,scenario,status:'passed',detail});console.log(JSON.stringify(results.at(-1)));};
      try{
        await page.goto(SITE+'/login');await expect(page.getByTestId('explore-demo')).toBeVisible();
        const bundle=await page.evaluate(async()=>{const src=[...document.scripts].map(s=>s.src).find(s=>s.includes('/static/js/main.'));const response=await fetch(src);return {src,bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};});
        assert.ok(bundle.src.endsWith(cfg.mainFile));assert.equal(crypto.createHash('sha256').update(Buffer.from(bundle.bytes)).digest('hex'),cfg.mainSha256);
        record('identity',{commit:cfg.commit,version:cfg.version,main:cfg.mainFile,sha256:cfg.mainSha256});
        await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
        await page.getByTestId('sidebar-open-'+cid).click();await expect(page.getByTestId('context-header-client')).toContainText(name);
        const initial=await store();
        record('E01',await dashboardJourney({page,go,store,cid,framework}));
        await frameworkJourney({page,go,store,cid,framework,prefix});record('E02/E14','Framework narrative save/history, unchanged implementation conclusion, Save & next, draft guard, focus and reload');
        const chain=await reviewJourney({page,expect,assert,go,store,cid,prefix});record('E03/E04/E09/E10/E14',chain);
        const extra=await require('./published-record-journey.cjs')({page,expect,assert,go,store,cid,prefix,artifacts});
        for(const result of extra){results.push({client:cid,...result});console.log(JSON.stringify(results.at(-1)));}
        const findingsAI=await require('./published-findings-ai.cjs')({page,expect,assert,go,store,cid,prefix,artifacts});
        for(const result of findingsAI){results.push({client:cid,...result});console.log(JSON.stringify(results.at(-1)));}
        assert.ok(extra.every(r=>r.status==='passed'),'One or more record journeys failed; inspect results');
        assert.ok(findingsAI.every(r=>r.status==='passed'),'Finding/AI journeys failed; inspect results');
        for(const [route,label] of [['dashboard','Dashboard'],['reviews','Reviews'],['findings','Findings'],['action-items','Action Items'],['risks','Risks'],['policies','Policies'],['vendors','Vendors'],['evidence','Evidence'],['calendar','Calendar'],['contacts','Contacts'],['client-settings','Client Settings']]){
          await go('/'+route);await page.screenshot({path:path.join(artifacts,cid+'-'+route+'.png'),fullPage:true});
          assert.ok((await page.locator('main').innerText()).trim(),label);
        }
        for(const width of [1440,1024,768]){
          await page.setViewportSize({width,height:1050});await go('/reviews');
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'page overflow '+width);
          const toggle=page.getByRole('button',{name:'Switch to dark mode',exact:true});
          if(await toggle.count())await toggle.click();
          await page.screenshot({path:path.join(artifacts,cid+'-'+width+'-dark.png'),fullPage:true});
          const light=page.getByRole('button',{name:'Switch to light mode',exact:true});if(await light.count())await light.click();
          await page.screenshot({path:path.join(artifacts,cid+'-'+width+'-light.png'),fullPage:true});
        }
        record('E15','Desktop/tablet no document overflow; light/dark screenshots require visual inspection');
        const after=await store();
        assert.deepEqual(after.framework_assessments.filter(r=>r.client_id===cid).map(r=>[r.framework_assessment_id,r.status,r.verification]),initial.framework_assessments.filter(r=>r.client_id===cid).map(r=>[r.framework_assessment_id,r.status,r.verification]),'completed activity does not change control conclusions');
        for(const kind of ['reviews','findings','tasks','risks','policies','vendors','evidence','framework_assessments'])assert.deepEqual(after[kind].filter(r=>r.client_id!==cid),initial[kind].filter(r=>r.client_id!==cid),'other clients unchanged '+kind);
        await page.reload();assert.ok((await store()).reviews.some(r=>r.review_id===chain.review_id));
        record('E16','Same-session reload persisted; other clients unchanged; context disposal removes synthetic edits');
      }catch(error){results.push({client:cid,status:'failed',message:error.message});await page.screenshot({path:path.join(artifacts,cid+'-failure.png'),fullPage:true});throw error;}
      finally{await context.close();fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({commit:cfg.commit,version:cfg.version,results,errors},null,2));}
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
module.exports={input,SITE,KEY,frameworkJourney,reviewJourney};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
