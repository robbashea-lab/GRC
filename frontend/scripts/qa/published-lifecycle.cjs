// Run one framework at a time, after its actual-command lifecycle simulation.
// A checkpoint restores that simulation's output; it does not manufacture history.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {input,SITE,KEY,frameworkJourney}=require('./published-release.cjs');
const names={'cis-ig1':'CIS Controls v8.1 IG1','soc-2':'SOC 2 Type 2','iso-27001':'ISO/IEC 27001'};
const counts=require('../../../../shared/contracts/program-lifecycle.json').assessment_counts;

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
      for(const group of await page.locator('main').getByRole('group').all())await group.getByRole('button',{name:'Unsure',exact:true}).click();
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
      await frameworkJourney({page,go,store,cid,framework:cfg.framework,prefix});
      for(const kind of ['reviews','findings','tasks','framework_assessments'])assert.deepEqual((await store())[kind].filter(r=>r.client_id!==cid),original[kind]);
      results.push({scenario:'N01/N02',status:'passed',client:cid,framework:cfg.framework,assessments:rows.length,detail:'UI-created client, incomplete input rejected, saved/reloaded intake, one selected framework, explicit unassessed/unassigned state, framework workspace edit/history'});
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
        await go('/compliance/'+cfg.framework);await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-framework.png'),fullPage:true});
        await go('/calendar');await page.screenshot({path:path.join(out,cfg.framework+'-'+year+'-calendar.png'),fullPage:true});
        await page.reload();assert.equal((await store()).reviews.filter(r=>r.client_id===fixture.client_id).reduce((n,r)=>n+(r.occurrences||[]).length,0),fixture.checkpoint.occurrences);
        results.push({scenario:'N09',status:'passed',year,framework:cfg.framework,checkpoint:fixture.checkpoint,fixture_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),detail:'Published rendering of command-generated checkpoint; register population, immutable occurrence selection, evidence panel and refresh checked. Not a second lifecycle simulation.'});
      }
    }
    assert.deepEqual(errors,[]);
  }catch(e){results.push({status:'failed',message:e.message,url:page.url()});await page.screenshot({path:path.join(out,cfg.framework+'-'+cfg.stage+'-failure.png'),fullPage:true});throw e;}
  finally{fs.writeFileSync(path.join(out,cfg.framework+'-'+cfg.stage+'.json'),JSON.stringify({commit:cfg.commit,version:cfg.version,results,errors},null,2));console.log(JSON.stringify({results,errors}));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
