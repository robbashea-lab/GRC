// Isolated synthetic Demo only. Baseline and candidate use the same fixed clock and fresh store.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4187';
assert.equal(new URL(base).hostname,'127.0.0.1');
const output=path.resolve(process.env.QA_ARTIFACTS||'../work/visual-baseline');
const comparison=process.env.QA_COMPARE;
const routes=['/dashboard','/reviews','/action-items','/findings','/calendar','/risks','/policies','/vendors','/evidence','/contacts','/systems','/ai-governance','/client-profile'];
const platform=['/clients','/admin/clients','/admin/users','/admin/roles','/admin/security','/admin/audit','/account'];
const normalize=s=>s.replace(/\s+/g,' ').trim();
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
  const results=[],failures=[];
  try{
    for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'America/New_York',reducedMotion:'reduce'});
      await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:204,body:''}));
      await context.addInitScript(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);
      const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
      const clients=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).clients.map(c=>({id:c.client_id,name:c.name})));
      const cases=platform.map(route=>({route,client:'platform'}));
      for(const client of clients){
        await page.evaluate(id=>sessionStorage.setItem('grc_client_id',id),client.id);await page.goto(base+'/dashboard');await page.locator('.bdash').waitFor();
        assert.equal(normalize(await page.locator('main h1').innerText()),client.name+' Dashboard','Client selection must match the case');
        const frameworkRoutes=await page.locator('a[href^="/compliance/"]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('href').split('?')[0]))]);
        cases.push(...[...routes,...frameworkRoutes].map(route=>({route,client:client.id,name:client.name})));
      }
      for(const item of cases){
        await page.evaluate(id=>id==='platform'?sessionStorage.removeItem('grc_client_id'):sessionStorage.setItem('grc_client_id',id),item.client);
        await page.setViewportSize({width:1440,height:1000});await page.goto(base+item.route);await page.waitForLoadState('networkidle');
        await page.locator('main').waitFor();
        if(item.name)assert.equal(await page.evaluate(()=>sessionStorage.getItem('grc_client_id')),item.client);
        const key=theme+'-'+item.client+'-'+item.route.replace(/[^a-zA-Z0-9_-]/g,'_');
        const snapshot=await page.evaluate(()=>{
          const main=document.querySelector('main'), norm=s=>s.replace(/\s+/g,' ').trim(),visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
          const pick=s=>[...document.querySelectorAll(s)].filter(visible);
          const styles=e=>{const s=getComputedStyle(e);return {text:norm(e.textContent),class:e.className,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,border:s.borderColor,radius:s.borderRadius,padding:s.padding,height:s.height,numerals:s.fontVariantNumeric,transform:s.textTransform};};
          return {content:{text:norm(main.textContent),buttons:pick('button').map(e=>[norm(e.textContent),e.getAttribute('aria-label'),e.disabled]),links:pick('a').map(e=>[norm(e.textContent),e.getAttribute('href'),e.getAttribute('aria-label')]),headings:pick('main h1,main h2,main h3').map(e=>norm(e.textContent)),inputs:pick('input,select,textarea').map(e=>[e.tagName,e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.value,e.disabled]),labels:pick('label').map(e=>norm(e.textContent)),tables:pick('main table').map(e=>({headings:[...e.querySelectorAll('th')].map(t=>norm(t.textContent)),rows:e.querySelectorAll('tbody tr').length,columns:e.querySelectorAll('thead tr:first-child th').length})),cards:pick('main .bd-card,main .bp-tile,main .bpage-tile,main .assessment-metric').length,icons:main.querySelectorAll('svg').length},inventory:{titles:pick('main h1').map(styles),status:pick('main .pill,main .bd-status').map(styles),counts:pick('main .bp-count,main .bp-tile-value,main .metric-value,main .assessment-metric strong').map(styles),owners:pick('main .register-owner').slice(0,5).map(styles),headers:pick('main th').slice(0,12).map(styles),cells:pick('main td').slice(0,12).map(styles),cards:pick('main .bd-card,main .bp-tile,main .bpage-tile').map(styles)}};
        });
        const aria=await page.locator('main').ariaSnapshot();snapshot.content.accessibility=aria;
        const layouts=[];
        for(const width of [1440,1024,768]){
          await page.setViewportSize({width,height:1000});
          const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('main').getBoundingClientRect().width}));
          layouts.push(layout);
          await page.screenshot({path:path.join(output,key+'-'+width+'.png'),fullPage:true});
        }
        const result={key,...item,theme,...snapshot,layouts,errors:[...errors]};results.push(result);
        fs.writeFileSync(path.join(output,'inventory.json'),JSON.stringify({clients,results,failures},null,2));
        if(comparison){const prior=JSON.parse(fs.readFileSync(path.join(comparison,'inventory.json'))).results.find(r=>r.key===key);try{assert.ok(prior,'Missing baseline '+key);assert.deepEqual(snapshot.content,prior.content);}catch(e){failures.push({key,error:e.message});}}
        console.log(key+' '+JSON.stringify(layouts));
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    fs.writeFileSync(path.join(output,'inventory.json'),JSON.stringify({results,failures},null,2));
    assert.deepEqual(failures,[],'Content preservation differences');
    console.log('PASS '+results.length+' route/theme captures; '+results.length*3+' screenshots; preservation '+(comparison?'compared':'baseline recorded'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
