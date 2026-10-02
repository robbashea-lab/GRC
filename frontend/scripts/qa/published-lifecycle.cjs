// Run one framework at a time, after its actual-command lifecycle simulation.
// A checkpoint restores that simulation's output; it does not manufacture history.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {input,SITE,KEY,frameworkJourney,dashboardJourney}=require('./published-release.cjs');
const names={'cis-ig1':'CIS Controls v8.1 IG1','soc-2':'SOC 2 Type 2','iso-27001':'ISO/IEC 27001'};
const counts=require('../../../shared/contracts/program-lifecycle.json').assessment_counts;
const catalogFiles={'cis-ig1':'cisIG1.json','soc-2':'soc2.json','iso-27001':'iso27001.json'};
const day=value=>value?String(value).slice(0,10):null;

async function frameworkScope({page,go,db,cid,framework}){
  const catalog=require('../../../shared/catalogs/'+catalogFiles[framework]);
  const categories=db.clients.find(c=>c.client_id===cid).framework_settings?.['soc-2']?.categories||['security'];
  const definitions=catalog.requirements.filter(r=>framework!=='soc-2'||categories.includes(r.category));
  const rows=db.framework_assessments.filter(r=>r.client_id===cid&&r.framework_key===framework);
  assert.deepEqual(rows.map(r=>r.definition_id).sort(),definitions.map(r=>r.id).sort(),'selected framework definition identities');
  await go('/compliance/'+framework);
  if(framework==='iso-27001'){
    const clauses=definitions.filter(r=>r.specification==='isms_clause'),annex=definitions.filter(r=>r.specification==='annex_control');
    assert.equal(clauses.length,30);assert.equal(annex.length,93);
    await page.getByRole('tab',{name:'Overview',exact:true}).click();
    await expect(page.getByRole('button',{name:/^Open ISMS Requirements\./})).toContainText('Clauses 4–10');
    await expect(page.getByRole('button',{name:/^Open Annex A Controls\./})).toContainText('Implementation of necessary controls');
    await expect(page.getByRole('button',{name:/^Open Internal Audit Programme\./})).toBeVisible();
    await page.getByRole('button',{name:/^Open Statement of Applicability\./}).click();
    const summary=page.getByRole('region',{name:'Statement of Applicability status'});
    const annexIds=new Set(annex.map(r=>r.id)),controls=rows.filter(r=>annexIds.has(r.definition_id));
    const necessary=controls.filter(r=>r.soa_applicability==='included').length,excluded=controls.filter(r=>r.soa_applicability==='excluded').length;
    await expect(summary).toContainText(`${necessary+excluded} of 93 necessity decisions recorded`);
    await expect(summary).toContainText('Necessity decisions and implementation status are separate. All 93 Annex A reference controls remain in scope for consideration.');
    for(const [label,total] of [['Necessary',necessary],['Not Necessary',excluded],['Not yet determined',93-necessary-excluded]]){
      await expect(summary.locator('.iso-workspace-breakdown > span').filter({hasText:new RegExp('^'+label+' ')}).locator('strong')).toHaveText(String(total));
    }
    return {isms_clauses:30,annex_reference_controls:93,necessary,not_necessary:excluded,undetermined:93-necessary-excluded};
  }
  if(framework==='soc-2'){
    const nav=page.getByRole('navigation',{name:'SOC 2 location'}),root=nav.getByRole('button',{name:'SOC 2',exact:true});
    await expect(nav).toBeVisible();if(await root.count())await root.click();
    await expect(page.locator('[data-testid^="soc-category-"]')).toHaveCount(categories.length);
    for(const category of categories)await expect(page.getByTestId('soc-category-'+category)).toBeVisible();
    await expect(page.getByTestId('soc-category-security')).toContainText('Security — Common Criteria');
    await expect(page.getByRole('region',{name:'Trust Services Categories'})).toContainText(`${definitions.length} in-scope criteria across ${categories.length} Trust Services Categories.`);
  }else{
    assert.equal(catalog.version,'8.1');assert.equal(catalog.implementation_group,1);
    assert.ok(definitions.every(r=>r.version==='8.1'&&r.implementation_group===1));
    await expect(page.locator('main')).toContainText('CIS Controls v8.1 IG1');
  }
  const definition=framework==='soc-2'?'CC6.1':'1.1';
  await page.getByRole('textbox',{name:framework==='soc-2'?'Search criteria':'Search safeguards'}).fill(definition);
  await page.getByTestId('requirement-'+definition).click();
  const panel=page.getByTestId(framework==='soc-2'?'prestige-soc-assessment':'brawndo-cis-assessment');
  await expect(panel.getByLabel('Verification result',{exact:true})).toBeVisible();
  await expect(panel.getByRole('group',{name:'Implementation status',exact:true})).toBeVisible();
  if(framework==='soc-2'){
    for(const label of ['SOC 2 Criterion Requirements','Operational Practices','Enhanced Assurance'])await expect(panel.getByRole('group',{name:new RegExp('^'+label)})).toBeVisible();
    await expect(panel).toContainText('do not represent additional SOC 2 requirements');
  }else{
    await expect(panel.getByTestId('criteria-source')).toHaveText('Sources: CIS Safeguard 1.1 · v8.1');
    await expect(panel).toContainText('do not introduce additional requirements');
  }
  await panel.getByRole('button',{name:'Close assessment',exact:true}).click();
  return {definitions:definitions.length,...(framework==='soc-2'?{categories,guidance_tiers:3}:{version:'8.1',implementation_group:1})};
}

async function socScopeJourney({page,go,store,cid,prefix}){
  const before=await store();assert.equal(before.clients.find(c=>c.client_id===cid)?.name,prefix,'only the newly created disposable client');
  const assessments=db=>db.framework_assessments.filter(r=>r.client_id===cid&&r.framework_key==='soc-2');
  const configuration=db=>db.clients.find(c=>c.client_id===cid).framework_settings?.['soc-2'];
  assert.equal(assessments(before).length,33,'initial default Security scope');
  await go('/compliance/soc-2');await expect(page.getByTestId('prestige-soc-workspace')).toBeVisible();
  const summary=page.locator('summary').filter({hasText:/^Scope and observation period settings$/});
  if(!await summary.count())return {scenario:'N02/N07 SOC scope editing',status:'not_covered',client:cid,detail:'Published candidate does not expose the SOC category/period editor. The initial 33 criteria are default Security scope, not an explicit category selection.'};
  const settings=page.locator('details').filter({has:summary});
  await summary.click();
  const security=settings.getByRole('checkbox',{name:'Security / Common Criteria',exact:true});
  await expect(security).toBeChecked();await expect(security).toBeDisabled();
  await settings.getByRole('checkbox',{name:'Availability',exact:true}).check();
  await settings.getByLabel('Program period start',{exact:true}).fill('2027-01-01');
  await settings.getByLabel('Program period end',{exact:true}).fill('2027-12-31');
  await settings.getByLabel('System boundary and service commitments',{exact:true}).fill(prefix+' synthetic scoped service');
  await settings.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();
  await expect.poll(async()=>configuration(await store())).toEqual({categories:['security','availability'],period_start:'2027-01-01',period_end:'2027-12-31',system_description:prefix+' synthetic scoped service'});
  const expanded=await store();assert.equal(assessments(expanded).length,36);
  const originalIds=new Set(assessments(before).map(r=>r.framework_assessment_id));
  assert.deepEqual(assessments(expanded).filter(r=>originalIds.has(r.framework_assessment_id)),assessments(before),'scope expansion preserves existing assessments/history');
  await page.reload();await expect(summary).toBeVisible();await summary.click();
  await expect(settings.getByRole('checkbox',{name:'Availability',exact:true})).toBeChecked();
  await expect(settings.getByLabel('Program period start',{exact:true})).toHaveValue('2027-01-01');
  await expect(settings.getByLabel('Program period end',{exact:true})).toHaveValue('2027-12-31');
  await expect(settings.getByLabel('System boundary and service commitments',{exact:true})).toHaveValue(prefix+' synthetic scoped service');
  const expandedScope=await frameworkScope({page,go,db:await store(),cid,framework:'soc-2'});
  assert.deepEqual(expandedScope.categories,['security','availability']);assert.equal(expandedScope.definitions,36);
  await page.getByRole('textbox',{name:'Search criteria',exact:true}).fill('A1.1');
  await page.getByTestId('requirement-A1.1').click();
  const panel=page.getByTestId('prestige-soc-assessment'),implementation=prefix+' Availability assessment retained after scope change.';
  await panel.getByLabel('Current implementation',{exact:true}).fill(implementation);
  await panel.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(panel).toContainText('Assessment saved');
  const withHistory=await store(),availabilityIds=new Set(require('../../../shared/catalogs/soc2.json').requirements.filter(r=>r.category==='availability').map(r=>r.id));
  const retained=assessments(withHistory).filter(r=>availabilityIds.has(r.definition_id)),assessed=retained.find(r=>r.definition_id==='A1.1');
  assert.equal(retained.length,3);assert.equal(assessed.implementation,implementation);assert.equal(assessed.status,'not_assessed');assert.ok(assessed.assessment_history.length>0);
  await panel.getByRole('button',{name:'Close assessment',exact:true}).click();
  await go('/compliance/soc-2');await summary.click();
  await settings.getByRole('checkbox',{name:'Availability',exact:true}).uncheck();
  await settings.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();
  await expect.poll(async()=>configuration(await store())?.categories).toEqual(['security']);
  await page.reload();await expect(summary).toBeVisible();await summary.click();
  await expect(settings.getByRole('checkbox',{name:'Availability',exact:true})).not.toBeChecked();
  await expect(settings.getByLabel('Program period start',{exact:true})).toHaveValue('2027-01-01');
  await expect(settings.getByLabel('Program period end',{exact:true})).toHaveValue('2027-12-31');
  const nav=page.getByRole('navigation',{name:'SOC 2 location'}),root=nav.getByRole('button',{name:'SOC 2',exact:true});
  await expect(nav).toBeVisible();if(await root.count())await root.click();
  await expect(page.locator('[data-testid^="soc-category-"]')).toHaveCount(1);await expect(page.getByTestId('soc-category-availability')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Trust Services Categories'})).toContainText('33 in-scope criteria across 1 Trust Services Categories.');
  const after=await store();assert.equal(assessments(after).length,36,'out-of-scope assessments are retained');
  assert.deepEqual(assessments(after).filter(r=>availabilityIds.has(r.definition_id)),retained,'scope shrink retains assessment content and history');
  assert.deepEqual(after.baselines[cid],before.baselines[cid],'onboarding baseline remains immutable');
  assert.deepEqual(after.clients.filter(c=>c.client_id!==cid),before.clients.filter(c=>c.client_id!==cid));
  return {scenario:'N02/N07 SOC scope editing',status:'passed',client:cid,initial_default_criteria:33,expanded_scope:expandedScope,final_active_criteria:33,retained_criteria:3,retained_history_entries:assessed.assessment_history.length,period:{start:'2027-01-01',end:'2027-12-31'},detail:'UI-selected Availability and observation period saved/reloaded; A1.1 assessment saved before shrinking to Security; all three Availability records and assessment history retained after reload.'};
}

// Bounded oracle for these command-generated fixtures, not a second dashboard engine.
// Fail on additional obligation types rather than silently omit them from expected totals.
function checkpointWorkCounts(db,cid,today){
  const mine=kind=>db[kind].filter(r=>r.client_id===cid),active=kind=>mine(kind).filter(r=>!r.archived&&!r.archived_at&&!['completed','cancelled','done','closed','retired','archived','inactive','terminated','offboarding','revoked','not_applicable'].includes(r.status));
  assert.equal(mine('exceptions').length,0,'fixture oracle does not include exception obligations');
  for(const kind of ['policies','requirements'])assert.ok(mine(kind).every(r=>!r.next_review_date),'fixture oracle requires undated '+kind);
  const reviews=active('reviews'),tasks=active('tasks');
  const work=[...reviews.map(r=>({date:day(r.due_date),owner:r.owner_id||r.reviewer_id})),...tasks.map(r=>({date:day(r.due_date),owner:r.assignee_id||r.owner_id}))];
  for(const finding of active('findings').filter(r=>r.status!=='accepted'))if(finding.status==='remediated'||!tasks.some(t=>t.finding_id===finding.finding_id))work.push({date:day(finding.due_date),owner:finding.owner_id});
  for(const risk of active('risks')){
    assert.ok(reviews.some(r=>r.risk_id===risk.risk_id&&day(r.due_date)===day(risk.next_review)),'risk review must be represented by its authoritative Review');
    if(risk.status==='accepted'&&risk.acceptance_expires_at&&day(risk.acceptance_expires_at)!==day(risk.next_review))work.push({date:day(risk.acceptance_expires_at),owner:risk.owner_id});
  }
  for(const vendor of active('vendors')){
    assert.ok(reviews.some(r=>r.vendor_id===vendor.vendor_id&&day(r.due_date)===day(vendor.next_review)),'vendor review must be represented by its authoritative Review');
    assert.ok(!vendor.assurance_records?.length&&!vendor.contract_expiration&&!vendor.contract_end,'fixture oracle excludes other Vendor obligations');
    if(vendor.contract_renewal&&!reviews.some(r=>r.vendor_id===vendor.vendor_id&&r.vendor_purpose==='contract'))work.push({date:day(vendor.contract_renewal),owner:vendor.business_owner_id||vendor.owner_id});
  }
  const eligible=new Set(db.users.filter(u=>u.status==='active'&&['super_admin','platform_admin','client_grc_manager','client_contributor','client_readonly'].includes(u.role)&&(u.role==='super_admin'||u.client_ids?.includes(cid))).map(u=>u.user_id));
  const horizon=new Date(Date.parse(today+'T12:00:00Z')+30*86400000).toISOString().slice(0,10);
  return {'Past Due':work.filter(r=>r.date&&r.date<today).length,'Due in 30 Days':work.filter(r=>r.date&&r.date>=today&&r.date<=horizon).length,'All Open':work.length,'Unassigned':work.filter(r=>!eligible.has(r.owner)).length};
}

function checkpointCalendar(db,cid,year){
  const entries=new Map(),add=(row,kind,id,occurrence)=>{
    if(!day(row.due_date)?.startsWith(year+'-12-'))return;
    assert.ok(id&&(kind!=='review'||occurrence),'Calendar source identity');
    assert.equal(typeof row.title,'string','Calendar source title');
    const key=kind+':'+id+':'+(occurrence||'current');entries.set(key,{key,date:day(row.due_date),title:row.title});
  };
  for(const review of db.reviews.filter(r=>r.client_id===cid)){
    add(review,'review',review.review_id,review.current_occurrence_id);
    for(const occurrence of review.occurrences||[]){
      assert.ok(['completed','cancelled'].includes(occurrence.status),'fixture history must be immutable');
      assert.ok(!occurrence.client_id||occurrence.client_id===cid);assert.ok(!occurrence.review_id||occurrence.review_id===review.review_id);
      // Compact storage inherits only fields explicitly marked as unchanged.
      const title=occurrence._review_inherited?.includes('title')?review.title:occurrence.title;
      add({...occurrence,title},'review',review.review_id,occurrence.occurrence_id);
    }
  }
  for(const kind of ['finding','task'])for(const row of db[kind+'s'].filter(r=>r.client_id===cid))add(row,kind,row[kind+'_id']);
  return [...entries.values()];
}

async function calendarCheckpoint({page,go,db,cid,year,expectedReviewEntries}){
  const expected=checkpointCalendar(db,cid,year);
  assert.equal(expected.filter(r=>r.key.startsWith('review:')).length,expectedReviewEntries);
  await go('/calendar');await expect(page.getByTestId('cal-month-label')).toHaveText('December '+year);
  const all=page.getByRole('group',{name:'Calendar scope'}).getByRole('button',{name:'All',exact:true});
  await all.click();await expect(all).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Loading Calendar…',{exact:true})).toHaveCount(0);
  for(let date=1;date<=31;date++){
    const ymd=year+'-12-'+String(date).padStart(2,'0'),cell=page.getByTestId('cal-day-'+ymd),rows=expected.filter(r=>r.date===ymd);
    const more=cell.getByRole('button',{name:new RegExp('^Show all .* on '+ymd+'$')});
    if(await more.count())await more.click();
    await expect(cell.locator('[data-testid^="cal-item-"]')).toHaveCount(rows.length);
    for(const row of rows)await expect(cell.getByTestId('cal-item-'+row.key)).toContainText(row.title);
  }
  return {month:year+'-12',entries:expected.length,review_entries:expectedReviewEntries,keys:expected.map(r=>r.key).sort()};
}

async function main(){
  const cfg=await input();assert.equal(cfg.origin,SITE);assert.ok(names[cfg.framework]);
  const out=path.resolve(cfg.artifacts);fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),results=[],errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===SITE
    ?route.continue({headers:{...route.request().headers(),...(cfg.bearer?{'OAI-Sites-Authorization':'Bearer '+cfg.bearer}:{})}})
    :route.fulfill({status:204,body:''}));
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const go=async suffix=>{await page.goto(SITE+suffix);await expect(page.locator('main')).not.toBeEmpty();};
  const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),KEY);
  try{
    await page.clock.setFixedTime(new Date('2027-01-01T14:00:00Z'));
    await page.goto(SITE+'/login');await expect(page.getByTestId('explore-demo')).toBeVisible();
    const bundle=await page.evaluate(async()=>{const src=[...document.scripts].map(s=>s.src).find(s=>s.includes('/static/js/main.'));return {src,bytes:Array.from(new Uint8Array(await (await fetch(src)).arrayBuffer()))};});
    assert.ok(bundle.src.endsWith(cfg.mainFile));assert.equal(crypto.createHash('sha256').update(Buffer.from(bundle.bytes)).digest('hex'),cfg.mainSha256);
    await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    if(cfg.stage==='onboard'){
      const original=await store(),prefix='Release QA new '+cfg.framework;
      await go('/admin/clients');await page.getByTestId('add-client-button').click();
      await page.getByTestId('new-client-name').fill(prefix);await page.getByTestId('new-client-save').click();
      await expect(page.getByTestId('add-client-dialog')).not.toBeVisible();
      await page.getByRole('button',{name:'Open Client Profile',exact:true}).click();await page.waitForURL('**/client-profile');
      const cid=(await store()).clients.find(c=>c.name===prefix).client_id;
      await page.getByRole('combobox',{name:names[cfg.framework],exact:true}).selectOption('applies');
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await expect(page.locator('main')).toContainText('Choose Yes, No or Unsure');
      const policyGroups=page.locator('main [role="group"][aria-label]');
      await expect(policyGroups).toHaveCount(17);
      for(const group of await policyGroups.all())await group.getByRole('button',{name:'Unsure',exact:true}).click();
      // Draft writes are queued; reload only after the final answer is persisted.
      await expect.poll(async()=>Object.values((await store()).baselines?.[cid]?.policies||{}).filter(answer=>answer==='unsure').length).toBe(17);
      await page.reload();await expect(page.locator('main')).toContainText('17 of 17 answered');
      await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.getByRole('button',{name:'Complete onboarding',exact:true}).click();
      await expect.poll(async()=>(await store()).baselines?.[cid]?.completed).toBe(true);
      await go('/client-profile?tab=program');await expect(page.getByTestId('onboarding-handoff')).toBeVisible();
      const db=await store(),rows=db.framework_assessments.filter(r=>r.client_id===cid);
      assert.equal(rows.length,counts[cfg.framework]);assert.ok(rows.every(r=>r.framework_key===cfg.framework&&r.status==='not_assessed'));
      assert.equal(db.policies.filter(r=>r.client_id===cid).length,17);
      assert.equal(db.findings.filter(r=>r.client_id===cid).length,0);
      assert.equal(db.tasks.filter(r=>r.client_id===cid).length,0);
      await expect(page.locator('main')).toContainText('not yet assessed');
      assert.ok(db.reviews.filter(r=>r.client_id===cid).every(r=>!r.owner_id&&!r.due_date));
      await page.reload();assert.equal((await store()).framework_assessments.filter(r=>r.client_id===cid).length,rows.length);
      const scope=await frameworkScope({page,go,db:await store(),cid,framework:cfg.framework});
      await frameworkJourney({page,go,store,cid,framework:cfg.framework,prefix});
      for(const kind of ['reviews','findings','tasks','framework_assessments'])assert.deepEqual((await store())[kind].filter(r=>r.client_id!==cid),original[kind]);
      results.push({scenario:'N01/N02',status:'passed',client:cid,framework:cfg.framework,assessments:rows.length,scope,detail:'UI-created client, incomplete input rejected, saved/reloaded intake, catalog identity and visible framework scope/terminology, explicit unassessed/unassigned state, framework workspace edit/history'});
      if(cfg.framework==='soc-2'){
        results.push(await socScopeJourney({page,go,store,cid,prefix}));
        for(const kind of ['reviews','findings','tasks','framework_assessments'])assert.deepEqual((await store())[kind].filter(r=>r.client_id!==cid),original[kind]);
      }
    }else{
      assert.equal(cfg.stage,'checkpoints');
      for(const year of [2027,2028,2029]){
        const filename=path.join(cfg.checkpointDirectory,cfg.framework+'-'+year+'.json'),bytes=fs.readFileSync(filename),fixture=JSON.parse(bytes);
        assert.equal(fixture.synthetic_lifecycle_fixture,true);assert.equal(fixture.checkpoint.framework,cfg.framework);
        assert.ok(fixture.store.clients.some(c=>c.client_id===fixture.client_id&&c.name.includes('disposable')));
        await page.clock.setFixedTime(new Date(year+'-12-31T14:00:00Z'));
        await page.evaluate(({key,db,cid})=>{sessionStorage.setItem(key,JSON.stringify(db));localStorage.setItem('grc_client_id',cid);}, {key:KEY,db:fixture.store,cid:fixture.client_id});
        await go('/dashboard');
        const before=await store(),mine=kind=>before[kind].filter(r=>r.client_id===fixture.client_id);
        assert.equal(mine('reviews').reduce((n,r)=>n+(r.occurrences||[]).length,0),fixture.checkpoint.occurrences);
        const dashboard=await dashboardJourney({page,go,store,cid:fixture.client_id,framework:cfg.framework});
        const work=checkpointWorkCounts(before,fixture.client_id,year+'-12-31');
        await go('/dashboard');
        for(const [label,total] of Object.entries(work)){
          const tile=page.getByRole('group',{name:'Filter current work'}).getByRole('button').filter({has:page.getByText(label,{exact:true})});
          await expect(tile.locator('.bd-tile-value')).toHaveText(String(total));
          await tile.click();await expect(page.locator('.bd-results')).toContainText(total?`of ${total} items`:'0 items');
        }
        await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-dashboard.png'),fullPage:true});
        await go('/reviews');
        await expect(page.locator('tr[data-testid^="reviews-row-"]')).toHaveCount(mine('reviews').filter(r=>!['completed','cancelled'].includes(r.status)).length);
        const historical=mine('reviews').find(r=>r.occurrences?.length&&r.status!=='cancelled');assert.ok(historical);
        await page.getByTestId('reviews-search').fill(historical.title);await page.getByText(historical.title,{exact:true}).first().click();
        const drawer=page.getByTestId('reviews-drawer');await expect(drawer.getByTestId('review-history').locator('tbody tr')).toHaveCount(historical.occurrences.length);
        await drawer.getByTestId('review-history').getByRole('button').last().click();
        await expect(drawer.getByTestId('review-complete')).toHaveCount(0);
        await drawer.getByTestId('tab-evidence').click();await expect(drawer).toContainText('Evidence');
        await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-history.png'),fullPage:true});
        const scope=await frameworkScope({page,go,db:before,cid:fixture.client_id,framework:cfg.framework});
        await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-framework.png'),fullPage:true});
        const calendar=await calendarCheckpoint({page,go,db:before,cid:fixture.client_id,year,expectedReviewEntries:fixture.checkpoint.calendar_review_entries});
        await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-calendar.png'),fullPage:true});
        await page.reload();assert.equal((await store()).reviews.filter(r=>r.client_id===fixture.client_id).reduce((n,r)=>n+(r.occurrences||[]).length,0),fixture.checkpoint.occurrences);
        results.push({scenario:'N02/N08/N09',status:'passed',year,framework:cfg.framework,checkpoint:fixture.checkpoint,scope,dashboard:{...dashboard,work},calendar,fixture_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),detail:'Published checkpoint: visible Dashboard framework/material Finding/work totals and every December Calendar entry reconciled to source records; register population, immutable occurrence selection, evidence panel and refresh checked. Not a second lifecycle simulation.'});
      }
    }
    assert.deepEqual(errors,[]);
  }catch(e){results.push({status:'failed',message:e.message,url:page.url()});await page.screenshot({path:path.join(out,cfg.framework+'-'+cfg.stage+'-failure.png'),fullPage:true});throw e;}
  finally{fs.writeFileSync(path.join(out,cfg.framework+'-'+cfg.stage+'.json'),JSON.stringify({commit:cfg.commit,version:cfg.version,results,errors},null,2));console.log(JSON.stringify({results,errors}));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
