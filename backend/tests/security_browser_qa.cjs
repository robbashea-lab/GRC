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
      await page.getByLabel('Email',{exact:true}).fill(role+'@example.com');
      await page.getByLabel('Password',{exact:true}).fill(password);
      await page.getByRole('button',{name:'Sign in',exact:true}).click();
      await page.waitForURL(url=>!url.pathname.includes('login'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('grc_token')),null);
      const me=await page.evaluate(async()=>{const r=await fetch('/api/auth/me');return {status:r.status,body:await r.json()};});
      assert.equal(me.status,200); assert.equal(me.body.user_id,role);
      await page.reload();
      const clients=await page.evaluate(async()=>{const r=await fetch('/api/clients');return await r.json();});
      assert.deepEqual(clients.map(x=>x.client_id).sort(), role==='owner'?['a','b']:['a']);
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
