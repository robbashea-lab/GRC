// Browser acceptance operates only a fresh, synthetic, loopback Demo.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4187',output=process.env.QA_ARTIFACTS;
assert.equal(new URL(base).hostname,'127.0.0.1');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});const evidence=[];
 try{for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'America/New_York'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  await context.addInitScript(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
  await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  await page.getByRole('textbox',{name:'Search clients',exact:true}).fill('Dunder');await page.waitForFunction(()=>document.querySelectorAll('main tbody tr').length===1);
  await page.getByRole('textbox',{name:'Search clients',exact:true}).fill('');await page.waitForFunction(()=>document.querySelectorAll('main tbody tr').length===4);
  await page.getByRole('button',{name:'Brawndo: Past Due, 4 items',exact:true}).click();await page.getByTestId('drill-dialog').waitFor();
  assert.equal(await page.locator('[data-testid^="drill-row-"]').count(),4);await page.keyboard.press('Escape');await page.getByTestId('drill-dialog').waitFor({state:'hidden'});
  evidence.push({theme,check:'Portfolio search and existing Past Due drill-down',passed:true});
  const clients=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).clients);
  for(const client of clients){
   await page.evaluate(id=>sessionStorage.setItem('grc_client_id',id),client.client_id);
   for(const route of ['/reviews','/action-items','/risks','/policies','/vendors','/evidence','/contacts','/systems','/ai-governance']){
    console.log(theme,client.name,route);
    await page.goto(base+route);await page.waitForLoadState('networkidle');const search=page.locator('main input[type="search"],main input[placeholder*="Search"]').first();
    if(await search.count()){
     await search.fill('NO MATCH VISUAL QA 94682');await page.waitForFunction(()=>!document.querySelector('main tbody tr [data-status]')&&!document.querySelector('main tbody tr td:not([colspan])'));
     await search.fill('');await page.waitForLoadState('networkidle');evidence.push({theme,client:client.name,route,check:'Search empty result and reset',passed:true});
    }
    await page.setViewportSize({width:720,height:1000});const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    evidence.push({theme,client:client.name,route,check:'720 CSS px reflow (1440 at 200% equivalent; not native zoom)',...layout});
    if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,theme+'-'+client.client_id+'-'+route.slice(1)+'-720.png'),fullPage:true});}
    await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {tag:e.tagName,name:e.getAttribute('aria-label')||e.textContent.slice(0,80),outline:s.outlineWidth,outlineStyle:s.outlineStyle,shadow:s.boxShadow}});
    assert.notEqual(focus.tag,'BODY');evidence.push({theme,client:client.name,route,check:'Keyboard reachable',...focus});await page.setViewportSize({width:1440,height:1000});
   }
   await page.goto(base+'/calendar');const title=await page.locator('.bcal-month').textContent();
   await page.getByRole('button',{name:'Next month',exact:true}).click();await page.waitForFunction(t=>document.querySelector('.bcal-month')?.textContent!==t,title);
   await page.getByRole('button',{name:'Previous month',exact:true}).click();assert.equal(await page.locator('.bcal-month').textContent(),title);
   evidence.push({theme,client:client.name,check:'Calendar month navigation round trip',passed:true});
  }
  await page.evaluate(()=>sessionStorage.setItem('grc_client_id','demo_brawndo'));await page.goto(base+'/compliance/cis-ig1');
  await page.getByRole('button',{name:'Open Omni guided assessment',exact:true}).press('Enter');await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Open Omni guided assessment');
  evidence.push({theme,check:'Omni keyboard open, Escape close, launcher focus restored',passed:true});
  await page.goto(base+'/admin/users');await page.getByRole('button',{name:'Add user',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  evidence.push({theme,check:'Administration existing Add user dialog opens and closes',passed:true});
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'workflows.json'),JSON.stringify(evidence,null,2));}}
 console.log('PASS '+evidence.length+' browser workflow/reflow/focus observations');
})().catch(e=>{console.error(e);process.exitCode=1;});
