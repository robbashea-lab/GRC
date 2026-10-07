// Fresh synthetic Demo comparison against the exact deployed Brawndo source baseline.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const roots={approved:process.env.QA_APPROVED_URL||'http://127.0.0.1:4192',candidate:process.env.QA_BASE_URL||'http://127.0.0.1:4191'};
for(const url of Object.values(roots))if(new URL(url).hostname!=='127.0.0.1')throw Error('Synthetic loopback only');
const output=path.resolve(process.env.QA_ARTIFACTS||'../../outputs/platform-standardization/baseline-comparison');
const routes=process.env.QA_PORTALS_ONLY?['dashboard']:['dashboard','reviews','action-items','findings','calendar','risks','policies','vendors','evidence','contacts','systems','ai-governance','client-profile'];
const captures=new Set(['dashboard','reviews','action-items','risks','assessment','summary','record','risk-record']);
const results=[],failures=[],fontDelivery=[];
const sessions=new WeakMap();
async function sample(page){const result=await page.evaluate(()=>{
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const pick=selector=>[...document.querySelectorAll(selector)].find(visible);
  const style=selector=>{const e=pick(selector);if(!e)return null;const s=getComputedStyle(e);return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderRadius','textTransform'].map(k=>[k,s[k]]).concat([['paintedBorders',Object.fromEntries(['Top','Right','Bottom','Left'].map(side=>[side,s['border'+side+'Width']!=='0px'&&s['border'+side+'Style']!=='none'?{width:s['border'+side+'Width'],color:s['border'+side+'Color']}:null]))]]));};
  const portals=[...document.querySelectorAll('[role="dialog"]')].filter(visible),portal=portals.at(-1);
  const portalStyle=portal?getComputedStyle(portal):null;
  return {title:style('main h1'),tableHeader:style('main th'),body:style('main td,main p'),search:style('.bwp-search input'),primary:style('main .bpage-btn-primary,main .bcis-primary,main button.bg-primary'),portalSubmit:style('[role="dialog"] [data-testid="drawer-save"], [role="dialog"] button[type="submit"], [data-testid="brawndo-cis-assessment"] .ui-button.bg-primary'),portal:portalStyle?{fontFamily:portalStyle.fontFamily,color:portalStyle.color,backgroundColor:portalStyle.backgroundColor,borderColor:portalStyle.borderColor,borderRadius:portalStyle.borderRadius}:null,donut:[...document.querySelectorAll('.bd-donut circle[class^="bd-seg-"]')].map(e=>({class:e.getAttribute('class'),stroke:getComputedStyle(e).stroke})),sidebar:[...document.querySelectorAll('aside a[href]')].filter(visible).map(e=>e.getAttribute('href')),overflow:document.documentElement.scrollWidth>innerWidth,fonts:{inter:document.fonts.check('16px Inter'),loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)}};
});
 const session=sessions.get(page),{root}=await session.send('DOM.getDocument');result.renderedFonts={};
 for(const [kind,selector] of Object.entries({title:'main h1',tableHeader:'main th',body:'main td,main p',search:'.bwp-search input',portal:'[role=dialog] h2',portalSubmit:'[role=dialog] [data-testid=drawer-save]'})){
  const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  result.renderedFonts[kind]=nodeId?(await session.send('CSS.getPlatformFontsForNode',{nodeId})).fonts.map(({familyName,isCustomFont,glyphCount})=>({familyName,isCustomFont,glyphCount})):null;
 }
 return result;
}
(async()=>{
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
try{for(const theme of ['light','dark'])for(const [target,base] of Object.entries(roots)){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'America/New_York',reducedMotion:'reduce'});
 await context.addInitScript(t=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',t),theme);
 const page=await context.newPage(),errors=[];const session=await context.newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');sessions.set(page,session);page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{if(/fonts\.(googleapis|gstatic)\.com/.test(r.url()))fontDelivery.push({target,theme,url:r.url(),failure:r.failure()?.errorText});});
 await page.clock.setFixedTime(new Date('2026-10-07T16:00:00Z'));
 await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
 await page.evaluate(()=>{const store=JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3'));if(!store.clients.some(c=>c.client_id==='demo_brawndo'))throw Error('Fresh Demo Brawndo missing');sessionStorage.setItem('grc_client_id','demo_brawndo');});
 async function record(route,kind=route){for(const width of [1440,1024,768]){
  await page.setViewportSize({width,height:1000});const snapshot=await sample(page);
  const key=`${theme}-${kind}-${width}`;results.push({target,key,route,theme,width,...snapshot});
  if(snapshot.overflow)failures.push({target,key,issue:'Document horizontal overflow'});
  if(captures.has(kind))await page.screenshot({path:path.join(output,`${target}-${key}.png`),fullPage:true});
 }}
 for(const route of routes){await page.goto(base+'/'+route);await page.locator('main').waitFor();await page.waitForLoadState('networkidle');if(route==='dashboard'&&(await page.locator('main h1').innerText()).trim()!=='Brawndo Dashboard')throw Error('Wrong client selected');await record(route);}
 await page.goto(base+'/dashboard');await page.locator('.bd-item').first().click();await page.locator('.dashboard-item-summary').waitFor();await record('dashboard','summary');
 await page.locator('.dashboard-summary-primary').click();await page.locator('[role="dialog"]').last().waitFor();await record('dashboard','record');
 await page.goto(base+'/risks');await page.getByTestId('risk-row-0').click();await page.getByTestId('drawer-save').waitFor();await record('risks','risk-record');
 await page.goto(base+'/compliance/cis-ig1');await page.getByTestId('control-row-1').click();await page.getByTestId('requirement-1.1').click();await page.getByTestId('brawndo-cis-assessment').waitFor();await record('compliance/cis-ig1','assessment');
 if(errors.length)failures.push({target,theme,issue:'Page errors',errors});await context.close();
}
for(const current of results.filter(r=>r.target==='candidate')){const prior=results.find(r=>r.target==='approved'&&r.key===current.key);if(!prior){failures.push({key:current.key,issue:'Missing baseline'});continue;}for(const key of ['title','tableHeader','body','search','primary','portal','portalSubmit','donut','sidebar'])if(JSON.stringify(prior[key])!==JSON.stringify(current[key]))failures.push({key:current.key,field:key,approved:prior[key],candidate:current[key]});}
}finally{await browser.close();fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify({results,failures,fontDelivery,limitation:'Computed font stacks and Chromium actual rendered font families are separately recorded. Google font delivery failures are reported; downloaded font availability must not be inferred from the CSS stack.'},null,2));}
console.log(JSON.stringify({observations:results.length,differences:failures.length,fontDeliveryFailures:fontDelivery.length}));if(failures.length)process.exitCode=1;
})().catch(e=>{fs.writeFileSync(path.join(output,'error.txt'),e.stack||String(e));console.error(e);process.exitCode=1;});
