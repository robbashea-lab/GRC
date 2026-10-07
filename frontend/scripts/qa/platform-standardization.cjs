// Fresh loopback Demo only: no hosted records, credentials or API shortcuts.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4191',output=path.resolve(process.env.QA_ARTIFACTS||'../../outputs/platform-standardization/local-qa');
assert.equal(new URL(base).hostname,'127.0.0.1');fs.mkdirSync(output,{recursive:true});
const results=[],failures=[];let activePage;const workflowsOnly=process.env.QA_WORKFLOWS_ONLY==='1';
const clientRoutes=['/dashboard','/reviews','/action-items','/calendar','/risks','/policies','/vendors','/evidence','/contacts','/systems','/ai-governance','/client-profile'];
const platformRoutes=['/clients','/admin/clients','/admin/users','/admin/roles','/admin/security','/admin/audit','/account'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
 try{for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'America/New_York'});
  await context.route('**/*',r=>['127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(r.request().url()).hostname)?r.continue():r.fulfill({status:204,body:''}));
  await context.addInitScript(t=>{if(!localStorage.getItem('omnisciente:brawndo-dashboard-theme'))localStorage.setItem('omnisciente:brawndo-dashboard-theme',t)},theme);
  const page=await context.newPage(),errors=[];activePage=page;page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
  await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
  const opposite=theme==='light'?'dark':'light';await page.getByRole('button',{name:'Use '+opposite+' workspace theme',exact:true}).click();await page.waitForFunction(t=>document.documentElement.dataset.brawndoWorkspace===t,opposite);await page.reload();await page.getByRole('button',{name:'Use '+theme+' workspace theme',exact:true}).click();await page.waitForFunction(t=>document.documentElement.dataset.brawndoWorkspace===t,theme);results.push({theme,check:'Shared header toggle persists across reload and restores requested theme',passed:true});
  await page.getByTestId('client-row-menu-0').click();await page.getByRole('menu').waitFor();assert.equal(new URL(page.url()).pathname,'/clients');await page.keyboard.press('Escape');
  const pastDue=page.getByRole('button',{name:/^Brawndo: Past Due, \d+ items$/});const announced=Number((await pastDue.getAttribute('aria-label')).match(/(\d+) items/)[1]);await pastDue.click();await page.getByTestId('drill-dialog').waitFor();assert.equal(await page.locator('[data-testid^="drill-row-"]').count(),announced);assert.equal(new URL(page.url()).pathname,'/clients');await page.keyboard.press('Escape');await page.getByTestId('drill-dialog').waitFor({state:'hidden'});
  results.push({theme,check:'Portfolio row menu and summary child actions preserve context; drill count matches actual rows',announced,passed:true});
  const clients=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).clients.map(c=>({id:c.client_id,name:c.name})));
  async function inspect(client,route){
   await page.goto(base+route);await page.waitForLoadState('networkidle');await page.locator('main').waitFor();
   const state=await page.evaluate(()=>{const style=e=>{if(!e)return null;const s=getComputedStyle(e);return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,color:s.color,background:s.backgroundColor,border:s.borderColor,radius:s.borderRadius,padding:s.padding,height:s.height}};return {theme:document.documentElement.dataset.brawndoWorkspace,header:!!document.querySelector('.bwp-topbar'),heading:document.querySelector('main h1')?.textContent,styles:{header:style(document.querySelector('.bwp-topbar')),title:style(document.querySelector('main h1')),table:style(document.querySelector('main table')),cell:style(document.querySelector('main td')),status:style(document.querySelector('main .pill')),search:style(document.querySelector('main input[type="search"],main input[placeholder*="Search"]'))},frameworkLinks:[...document.querySelectorAll('a[href^="/compliance/"]')].map(e=>e.getAttribute('href').split('?')[0])}});
   assert.equal(state.theme,theme,client+' '+route+' root theme');assert.equal(state.header,true,client+' '+route+' shared header');
   const layouts=[];for(const width of [1440,1024,768]){await page.setViewportSize({width,height:1000});const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=width,client+' '+route+' overflow '+JSON.stringify(layout));layouts.push(layout)}
   await page.setViewportSize({width:1440,height:1000});
   if(['/dashboard','/reviews','/risks','/clients','/account'].includes(route))await page.screenshot({path:path.join(output,theme+'-'+client+'-'+route.slice(1)+'.png'),fullPage:true});
   results.push({theme,client,route,...state,layouts});console.log(theme,client,route);return state;
  }
  for(const route of workflowsOnly?[]:platformRoutes){await page.evaluate(()=>sessionStorage.removeItem('grc_client_id'));await inspect('platform',route)}
  for(const client of workflowsOnly?[]:clients){
   await page.evaluate(id=>sessionStorage.setItem('grc_client_id',id),client.id);
   const dashboard=await inspect(client.id,'/dashboard');assert.equal(dashboard.heading,client.name+' Dashboard');
   for(const route of [...clientRoutes.slice(1),...new Set(dashboard.frameworkLinks)])await inspect(client.id,route);
   if(client.id==='demo_dunder'){
    await page.goto(base+'/vendors');const before=await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3'));
    await page.getByTestId('new-vendor').click();const vendor=page.getByTestId('new-vendor-dialog');await vendor.waitFor();
    assert.equal(await vendor.getByText('Category',{exact:true}).count(),1,'Existing Vendor Category remains available');
    assert.equal(await vendor.getByRole('checkbox',{name:'Security Assurance Required',exact:true}).count(),1,'Existing Vendor assurance-required choice remains available');
    await vendor.getByRole('button',{name:'Cancel',exact:true}).click();await vendor.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3')),before,'Inspecting New Vendor must not alter saved Demo records');
    results.push({theme,client:client.id,check:'New Vendor preserves Category and Security Assurance Required without saving records',passed:true});
   }
   if(dashboard.frameworkLinks.some(r=>r.includes('cis'))){await page.goto(base+dashboard.frameworkLinks.find(r=>r.includes('cis')));await page.getByRole('button',{name:'Open Omni guided assessment',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.omni-workspace-window').count(),client.id==='demo_brawndo'?1:0,'New Omni must remain Brawndo-only');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});results.push({theme,client:client.id,check:'Omni upgrade boundary',passed:true})}
  }
  // Compare resolved properties of the same shared table component, not unlike record contents.
  for(const route of ['/reviews','/action-items','/risks']){const entries=results.filter(r=>r.theme===theme&&r.route===route&&r.client!=='platform');const baseline=entries.find(r=>r.client==='demo_brawndo');const tableStyle=s=>{assert.ok(s,'Shared table exists');const {height,...presentation}=s;return presentation};for(const item of entries)assert.deepEqual(tableStyle(item.styles.table),tableStyle(baseline.styles.table),'Shared table style '+route+' '+item.client)}
  await page.evaluate(()=>sessionStorage.setItem('grc_client_id','demo_brawndo'));await page.goto(base+'/dashboard');
  await page.locator('.bd-item').first().click();await page.locator('.dashboard-item-summary').waitFor();
  await page.locator('.dashboard-summary-primary').click();const ticket=page.getByTestId('remediation-ticket-drawer');await ticket.waitFor();
  await ticket.getByRole('textbox',{name:'Planned action',exact:true}).fill('Synthetic shared-theme QA plan '+theme);
  await ticket.getByRole('button',{name:'Save changes',exact:true}).click();await ticket.getByText('Ticket saved.',{exact:true}).waitFor();
  await ticket.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.dashboard-item-summary').waitFor();
  await page.locator('.dashboard-summary-primary').click();await ticket.waitFor();assert.equal(await ticket.getByRole('textbox',{name:'Planned action',exact:true}).inputValue(),'Synthetic shared-theme QA plan '+theme);
  await ticket.getByRole('textbox',{name:'Planned action',exact:true}).fill('UNSAVED synthetic plan');await ticket.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();await page.locator('.dashboard-item-summary').waitFor();
  await page.locator('.dashboard-summary-primary').click();await ticket.waitFor();assert.equal(await ticket.getByRole('textbox',{name:'Planned action',exact:true}).inputValue(),'Synthetic shared-theme QA plan '+theme);await ticket.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.dashboard-item-summary').waitFor();await page.keyboard.press('Escape');
  await page.locator('.dashboard-item-summary').waitFor({state:'hidden'});assert.equal(new URL(page.url()).pathname,'/dashboard');
  results.push({theme,check:'Dashboard summary to related record, save, close, summary and dashboard return',passed:true});
  await page.goto(base+'/admin/clients');await page.getByTestId('add-client-button').click();
  const name='SYNTHETIC Platform Theme QA '+theme;await page.getByTestId('new-client-name').fill(name);await page.getByRole('button',{name:'Create client',exact:true}).click();
  await page.getByTestId('add-client-dialog').waitFor({state:'hidden'});await page.getByTestId('client-management-table').getByRole('button',{name,exact:true}).click();await page.goto(base+'/client-profile');
  await page.getByTestId('onboarding-stepper').waitFor();assert.equal(await page.locator('.bwp-topbar').count(),1);
  await page.getByRole('combobox',{name:'CIS Controls v8.1 IG1',exact:true}).selectOption('applies');
  await page.getByRole('combobox',{name:/ISO.*27001/}).selectOption('applies');
  await page.getByRole('button',{name:'Next',exact:true}).click();const answers=page.getByRole('button',{name:'Unsure',exact:true});
  for(let i=0,n=await answers.count();i<n;i++)await answers.nth(i).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Complete onboarding',exact:true}).click();
  await page.getByTestId('onboarding-stepper').waitFor({state:'hidden'});await page.getByRole('region',{name:'Programs',exact:true}).waitFor();await page.goto(base+'/dashboard');
  const fresh=await inspect('new-client','/dashboard');assert.equal(fresh.heading,name+' Dashboard');
  await page.goto(base+'/compliance/cis-ig1');await page.getByRole('button',{name:'Open Omni guided assessment',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.omni-workspace-window').count(),0);await page.keyboard.press('Escape');
  await page.goto(base+'/client-profile?tab=program');await page.getByRole('combobox',{name:'CIS implementation group',exact:true}).selectOption('3');await page.getByRole('button',{name:'Review scope change',exact:true}).click();await page.getByRole('button',{name:'Confirm scope change',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('combobox',{name:'CIS implementation group',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'CIS implementation group',exact:true}).inputValue(),'3');
  results.push({theme,check:'Fresh UI-created client, CIS plus ISO onboarding, shared shell by default, legacy Omni, CIS IG1 to IG3',passed:true});
  const applicable=page.getByRole('combobox',{name:/^Applicability — /});const labels=await applicable.evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
  for(const label of labels){const select=page.getByRole('combobox',{name:label,exact:true});if(await select.inputValue()==='applies')continue;await select.selectOption('applies');await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('combobox',{name:label,exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:label,exact:true}).inputValue(),'applies');results.push({theme,check:'Add framework after onboarding',framework:label,passed:true})}
  await page.goto(base+'/dashboard');await page.waitForLoadState('networkidle');const addedRoutes=await page.locator('a[href^="/compliance/"]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('href').split('?')[0]))]);
  assert.equal(addedRoutes.length,labels.length,'Every enabled program has its existing workspace');for(const route of addedRoutes)await inspect('new-all-frameworks',route);
  await page.goto(base+'/action-items');const beforeAction=await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3'));
  await page.getByTestId('create-tasks-button').click();const action=page.getByTestId('tasks-drawer');await action.waitFor();
  await action.getByRole('combobox',{name:'Priority',exact:true}).click();const priorities=await page.getByRole('option').allTextContents();
  assert.ok(priorities.includes('Critical'),'New Action Item retains Critical priority');await page.keyboard.press('Escape');await action.waitFor();
  await action.getByTestId('drawer-cancel').click();await action.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('grc_interactive_demo_v3')),beforeAction,'Inspecting New Action must not alter saved Demo records');
  results.push({theme,client:'new-client',check:'New Action Item retains Critical priority without saving records',priorities,passed:true});
  assert.deepEqual(errors,[]);await context.close();
 }}catch(e){failures.push({message:e.message,stack:e.stack});if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure-dom.txt'),await activePage.locator('body').ariaSnapshot())}throw e}finally{await browser.close();fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify({base,workflowsOnly,results,failures},null,2))}
 console.log('PASS '+results.length+' route/theme and boundary checks');
})().catch(e=>{console.error(e);process.exitCode=1});
