// Production bundle, isolated browser Demo only; not persistent Mongo verification.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4183';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use an isolated loopback preview');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage(),errors=[];
  try {
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:204,body:''}));
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    const ids=await page.evaluate(()=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key));
      const client=db.clients[0].client_id,other=db.clients[1].client_id;
      // Dedicated session-only fixture: no source records or shared persistent data touched.
      for(const kind of ['reviews','tasks','findings','risks','vendors','policies'])db[kind]=db[kind].filter(row=>row.client_id!==client);
      for(let i=0;i<26;i++)db.tasks.push({task_id:'bounded-'+String(i).padStart(2,'0'),client_id:client,title:'Bounded task '+String(i).padStart(2,'0'),status:'open',priority:'high',due_date:'2020-01-01',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
      sessionStorage.setItem(key,JSON.stringify(db));localStorage.setItem('grc_client_id',client);return {client,other};
    });
    await page.goto(base+'/dashboard');
    await expect(page.getByTestId('kpi-overdue')).toHaveAccessibleName('Past Due Items: 26. View contributing records');
    await page.getByTestId('kpi-overdue').click();
    const drill=page.getByTestId('dashboard-drilldown');
    await expect(drill.getByText('Showing 1–25 of 26',{exact:true})).toBeVisible();
    await expect(drill.getByText('Bounded task 25',{exact:true})).toHaveCount(0);
    await drill.getByRole('button',{name:'Next',exact:true}).click();
    await expect(drill.getByText('Showing 26–26 of 26',{exact:true})).toBeVisible();
    await drill.getByRole('button',{name:'Open Action',exact:true}).click();
    await expect(page.getByTestId('tasks-drawer')).toBeVisible();
    await expect(page.getByTestId('field-title')).toHaveValue('Bounded task 25');
    await page.getByTestId('drawer-close').click();
    await page.getByTestId('kpi-overdue').click();
    await expect(drill.getByText('Showing 1–25 of 26',{exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(id=>localStorage.setItem('grc_client_id',id),ids.other);await page.reload();
    await expect(page.getByTestId('management-dashboard')).toBeVisible();
    await expect(page.getByText(/^Bounded task /)).toHaveCount(0);
    assert.deepEqual(errors,[]);
    console.log('PASS: bounded Dashboard total, paging, authoritative record opening, reopen, client isolation; no page errors. Demo only.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
