// Explicit local-only QA. Pass the existing Playwright module and Python runtime paths.
const {spawn} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const {chromium} = require(process.env.SECURITY_PLAYWRIGHT);
const root = path.resolve(__dirname, '../..');
const password = randomBytes(32).toString('base64url');
const origin = 'http://127.0.0.1:4190';
const server = spawn(process.env.SECURITY_PYTHON, [path.join(__dirname,'security_browser_server.py')], {
  cwd: root, windowsHide:true, stdio:['ignore','ignore','pipe'], env:{...process.env,
    SECURITY_TEST_PASSWORD:password, JWT_SECRET:randomBytes(48).toString('base64url')},
});
let diagnostics=''; server.stderr.on('data', chunk => {diagnostics+=chunk.toString();});
(async()=>{
  let browser;
  try {
    for(let n=0;n<300;n++){
      if(server.exitCode!==null) throw Error('Fixture server exited: '+diagnostics);
      try {const status=await new Promise((resolve,reject)=>{
        const request=http.get(origin+'/api/',response=>{response.resume();resolve(response.statusCode);});
        request.setTimeout(1000,()=>request.destroy(new Error('Connection timeout')));
        request.on('error',reject);
      }); if(status===200) break;
        if(n===299) diagnostics+=' HTTP '+status;
      } catch(error) {if(n===299) diagnostics+=' '+error.message;}
      await new Promise(resolve=>setTimeout(resolve,100));
      if(n===299) throw Error('Fixture server did not become ready: '+diagnostics);
    }
    browser=await chromium.launch({executablePath:process.env.SECURITY_BROWSER,headless:true});
    for(const role of ['owner','provider','manager','contributor','reader']){
      const context=await browser.newContext();
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/login');
      await page.getByLabel('Work email',{exact:true}).fill(role+'@example.com');
      await page.getByLabel('Password',{exact:true}).fill(password);
      await page.getByRole('button',{name:'Sign in',exact:true}).click();
      await page.waitForURL(url=>!url.pathname.includes('login'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('grc_token')),null);
      const me=await page.evaluate(async()=>{const r=await fetch('/api/auth/me');return {status:r.status,body:await r.json()};});
      assert.equal(me.status,200); assert.equal(me.body.user_id,role);
      await page.reload();
      const clients=await page.evaluate(async()=>{const r=await fetch('/api/clients');return await r.json();});
      assert.deepEqual(clients.map(x=>x.client_id).sort(), role==='owner'?['a','b']:['a']);
      if(role==='owner') {
        const setup=await page.evaluate(async()=>{
          const baseline=await (await fetch('/api/onboarding/baseline?client_id=a')).json(),catalog=baseline.catalog;
          const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure'])),requirements:Object.fromEntries(catalog.requirements.map(p=>[p.key,['cis-ig1','soc-2','iso-27001'].includes(p.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
          const r=await fetch('/api/onboarding/baseline',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({client_id:'a',state,finalize:true,expected_updated_at:baseline.state.updated_at||null,expected_records:baseline.record_versions})});return {status:r.status,detail:await r.text()};
        });assert.equal(setup.status,200,setup.detail);
        for(const [framework,id] of [['cis-ig1','1.1'],['soc-2','CC1.1'],['iso-27001','4.1'],['iso-27001','A.5.1']]) {
          const rows=await page.evaluate(async framework=>(await (await fetch('/api/frameworks/'+framework+'?client_id=a')).json()).assessments,framework);
          const row=rows.find(r=>r.definition_id===id);assert(row,framework+' '+id);
          await page.evaluate(()=>localStorage.setItem('grc_client_id','a'));
          await page.goto(origin+'/compliance/'+framework+'?assessment='+row.framework_assessment_id);
          const dialog=page.locator('[data-assessment-shell]'),field=dialog.getByLabel('Current implementation',{exact:true});
          await field.fill('SYNTHETIC authenticated assessment '+id);
          await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).click();
          const check=dialog.locator('.assessment-check input').first(),hasCheck=await check.count();if(hasCheck)await check.check();
          await dialog.getByRole('tab',{name:'Requirement & implementation',exact:true}).click();
          await field.waitFor();assert.equal(await field.inputValue(),'SYNTHETIC authenticated assessment '+id);
          await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();
          await dialog.getByText(/Assessment saved\.|Changes saved; assessment date unchanged\./).waitFor();
          await page.reload();await page.getByLabel('Current implementation',{exact:true}).waitFor();
          assert.equal(await page.getByLabel('Current implementation',{exact:true}).inputValue(),'SYNTHETIC authenticated assessment '+id);
          await page.locator('[data-assessment-shell]').getByRole('tab',{name:'Assessment criteria',exact:true}).click();
          if(hasCheck)assert.equal(await page.locator('.assessment-check input').first().isChecked(),true);
          const saved=await page.evaluate(async ({framework,recordId})=>(await (await fetch('/api/frameworks/'+framework+'?client_id=a')).json()).assessments.find(r=>r.framework_assessment_id===recordId),{framework,recordId:row.framework_assessment_id});
          for(const key of ['status','owner_id','process_owner_id','evidence_ids','related_links'])assert.deepEqual(saved[key]??null,row[key]??null,key+' remains independent');
          assert.equal(saved.verification||'not_verified',row.verification||'not_verified','verification remains independent');
          console.log(JSON.stringify({authenticatedAssessment:framework,id,syntheticInMemoryMongo:true,checklistAvailable:!!hasCheck,draftTabs:true,saveReload:true,independentStatus:true}));
        }
      }
      const attack=await page.evaluate(async()=>{
        const result={};
        for(const route of ['/api/tasks/task-b','/api/evidence?client_id=b','/api/clients/b/profile']) result[route]=(await fetch(route)).status;
        const row=await (await fetch('/api/tasks/task-a')).json();
        const write=await fetch('/api/tasks/task-a',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:'browser check',expected_updated_at:row.updated_at||null})});
        result.mutation=write.status;
        result.detail=await write.text();
        return result;
      });
      if(role!=='owner') for(const [route,status] of Object.entries(attack)) if(route.startsWith('/api/')) assert.equal(status,403,role+' '+route);
      assert.equal(attack.mutation,role==='reader'?403:200,role+' '+attack.detail);
      await page.evaluate(()=>{
        sessionStorage.setItem('grc_workspace_mode','demo');
        localStorage.setItem('grc_token','forged-platform-owner');
      });
      await page.reload();
      const identity=await page.evaluate(async()=>await (await fetch('/api/auth/me')).json());
      assert.equal(identity.user_id,role);
      assert.equal(await page.evaluate(()=>localStorage.getItem('grc_token')),null);
      await page.goto(origin+'/admin/security');
      if(!['owner','provider'].includes(role)) await page.waitForURL('**/dashboard');
      else await page.getByText('Security & Authentication',{exact:true}).waitFor();
      const logout=await page.evaluate(async()=>(await fetch('/api/auth/logout',{method:'POST'})).status);
      assert.equal(logout,200);
      assert.equal(await page.evaluate(async()=>(await fetch('/api/auth/me')).status),401);
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({role,login:true,reload:true,noPersistentToken:true,storageTamperingDenied:true,tenantIsolation:true,mutationGate:true,directRouteGate:true,logout:true,runtimeErrors:0}));
      await context.close();
    }
  } finally {await browser?.close();server.kill();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
