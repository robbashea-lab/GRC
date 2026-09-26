// Actual production UI + isolated session Demo. Does not claim persistent backend concurrency.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4183';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use an isolated loopback preview');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage(),errors=[];
  try {
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:204,body:''}));
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/login');
    await expect(page.getByTestId('email-input')).toHaveValue('');
    await expect(page.getByTestId('password-input')).toHaveValue('');
    await expect(page.getByTestId('submit-auth')).toBeDisabled();
    await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    const identity=await page.evaluate(()=>{
      const db=JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3'));
      const row=db.findings.find(r=>r.status==='open');
      localStorage.setItem('grc_client_id',row.client_id);
      return {id:row.finding_id,title:row.title};
    });
    await page.goto(base+'/findings');
    await page.getByText(identity.title,{exact:true}).first().click();
    const drawer=page.getByTestId('findings-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByTestId('field-title').fill('Stale browser edit');
    // Simulate another successful write after this form was opened.
    await page.evaluate(id=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key)),row=db.findings.find(r=>r.finding_id===id);
      row.title='Newer saved finding';row.updated_at=new Date(Date.now()+1000).toISOString();sessionStorage.setItem(key,JSON.stringify(db));
    },identity.id);
    await drawer.getByTestId('drawer-save').click();
    await expect(page.getByText('Record changed since it was opened; reload before saving',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(id=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).findings.find(r=>r.finding_id===id).title,identity.id),'Newer saved finding');
    await expect(drawer.getByTestId('field-title')).toHaveValue('Stale browser edit');
    await drawer.getByTestId('drawer-close').click();
    await page.getByTestId('profile-menu-trigger').click();
    await page.getByTestId('logout-button').click();await page.waitForURL('**/login');
    assert.equal(await page.evaluate(()=>localStorage.getItem('grc_token')),null);
    assert.deepEqual(errors,[]);
    console.log('PASS: blank login, Demo entry, stale save blocked with draft retained, newer record preserved, logout without standard session.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
