// Isolated optimized Demo browser checks. Fixtures are tab-local and synthetic.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../build'),output=path.resolve(process.env.QA_OUTPUT||'outputs/dashboard-priority');
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep))file=path.join(root,'index.html');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage(),errors=[],results=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:204,body:''}));
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    const clients=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).clients);
    for(const name of ['Brawndo','Dunder Mifflin','Prestige Worldwide']){
      const client=clients.find(c=>c.name.toLowerCase()===name.toLowerCase());assert(client,`Client ${name}`);
      await page.evaluate(id=>sessionStorage.setItem('grc_client_id',id),client.client_id);await page.goto(base+'/dashboard');
      await expect(page.locator('.bd-program').first()).toBeVisible();
      assert.equal(await page.locator('.bd-tile').count(),0);
      assert(await page.locator('.bd-aside').evaluate(e=>e.getBoundingClientRect().bottom)<=await page.locator('.bd-queue').evaluate(e=>e.getBoundingClientRect().top));
      for(const width of [1440,1024,768,390]){
        await page.setViewportSize({width,height:1000});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow ${width}`);
      }
      results.push(`${name}: shared layout and responsive widths`);
    }
    await page.evaluate(()=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key)),source=db.clients.find(c=>c.name.toLowerCase()==='brawndo'),id='dashboard-new-synthetic';
      db.clients.push({...source,client_id:id,name:'Synthetic dashboard client'});
      db.baselines[id]=JSON.parse(JSON.stringify(db.baselines[source.client_id]));
      for(const kind of ['requirements','framework_assessments'])db[kind].push(...db[kind].filter(r=>r.client_id===source.client_id).map((r,i)=>({...r,client_id:id,[kind==='requirements'?'requirement_id':'framework_assessment_id']:`new-${kind}-${i}`})));
      db.tasks.push({client_id:id,task_id:'new-only',title:'New client work',status:'open',framework_key:'cis-ig1'});
      sessionStorage.setItem(key,JSON.stringify(db));sessionStorage.setItem('grc_client_id',id);
    });
    await page.goto(base+'/dashboard');await expect(page.getByRole('heading',{name:'Synthetic dashboard client Dashboard'})).toBeVisible();
    await expect(page.getByLabel('Framework',{exact:true}).locator('option')).toHaveCount(2);
    await page.getByLabel('Framework',{exact:true}).selectOption('cis-ig1');await expect(page.getByText('New client work',{exact:true})).toBeVisible();
    await page.evaluate(()=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key)),source=db.clients.find(c=>c.name.toLowerCase()==='prestige worldwide'),id='dashboard-new-synthetic';
      db.baselines[id].framework_settings={...db.baselines[id].framework_settings,...db.baselines[source.client_id].framework_settings};
      for(const kind of ['requirements','framework_assessments'])db[kind].push(...db[kind].filter(r=>r.client_id===source.client_id).map((r,i)=>({...r,client_id:id,[kind==='requirements'?'requirement_id':'framework_assessment_id']:`additional-${kind}-${i}`})));
      sessionStorage.setItem(key,JSON.stringify(db));
    });
    await page.reload();await expect(page.locator('.bd-program')).toHaveCount(2);
    await expect(page.getByLabel('Framework',{exact:true}).locator('option')).toHaveCount(3);
    await page.getByLabel('Framework',{exact:true}).selectOption('soc-2');await expect(page.getByText('New client work',{exact:true})).toHaveCount(0);
    results.push('Synthetic newly configured client and later-added SOC 2: shared cards/options and no copied work');
    const cid=clients.find(c=>c.name.toLowerCase()==='brawndo').client_id;
    await page.evaluate(id=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key));
      for(const kind of ['reviews','tasks','findings','risks','vendors','policies','exceptions'])db[kind]=(db[kind]||[]).filter(r=>r.client_id!==id);
      for(const r of db.requirements.filter(r=>r.client_id===id))r.status='completed';
      const today=new Date().toISOString().slice(0,10),ahead=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
      db.tasks.push(...Array.from({length:26},(_,i)=>({client_id:id,task_id:`priority-${i}`,title:`Synthetic priority ${i}`,status:'open',priority:'high',due_date:'2020-01-01',framework_key:'cis-ig1'})),
        {client_id:id,task_id:'today',title:'Due today',status:'open',due_date:today,framework_key:'cis-ig1'},
        {client_id:id,task_id:'day30',title:'Due day 30',status:'open',due_date:ahead,framework_key:'cis-ig1'},
        {client_id:id,task_id:'general',title:'General unscheduled',status:'open'},
        {client_id:id,task_id:'done',title:'Completed excluded',status:'done',due_date:'2020-01-01',framework_key:'cis-ig1'});
      const rows=db.framework_assessments.filter(r=>r.client_id===id&&r.framework_key==='cis-ig1');
      ['addressed','in_progress','needs_attention','not_assessed'].forEach((status,i)=>rows[i].status=status);
      sessionStorage.setItem(key,JSON.stringify(db));sessionStorage.setItem('grc_client_id',id);
    },cid);
    await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/dashboard');
    const tabs=page.getByTestId('priority-filters');
    await expect(tabs.getByRole('button',{name:/^All\s*29$/})).toBeVisible();
    await tabs.getByRole('button',{name:/Overdue/}).click();
    await expect(page.getByRole('button',{name:/View all 26/})).toBeVisible();
    await page.getByLabel('Framework',{exact:true}).selectOption('cis-ig1');
    await expect(tabs.getByRole('button',{name:/^All\s*28$/})).toBeVisible();
    await page.getByRole('button',{name:/View all 26/}).click();await expect(page.locator('tbody tr')).toHaveCount(25);
    await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
    await tabs.getByRole('button',{name:/Due in 30 days/}).click();await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByText('Due today',{exact:true})).toBeVisible();
    await tabs.getByRole('button',{name:/Unassigned/}).click();await expect(page.getByRole('button',{name:/View all 28/})).toBeVisible();
    await page.getByLabel('Search priority work').fill('General unscheduled');await expect(page.getByText('No items match these filters.',{exact:true})).toBeVisible();
    await page.getByLabel('Framework',{exact:true}).selectOption('');await expect(page.getByText('General unscheduled',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(tabs.getByRole('button',{name:/^All\s*29$/})).toBeVisible();
    for(const circle of await page.locator('.bd-program circle[tabindex="0"]').all()){
      await circle.focus();await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page.getByRole('tooltip')).toContainText(/% · \d+ of \d+ safeguards/);
      await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
      const point=await circle.evaluate(e=>{const svg=e.ownerSVGElement.getBoundingClientRect(),scale=svg.width/42,len=Number(e.getAttribute('stroke-dasharray').split(' ')[0]),offset=Number(e.getAttribute('stroke-dashoffset')),angle=(len/2-offset)*Math.PI*2/100;return {x:svg.x+(21+15.9*Math.cos(angle))*scale,y:svg.y+(21+15.9*Math.sin(angle))*scale};});
      await page.mouse.move(point.x,point.y);await expect(page.getByRole('tooltip')).toBeVisible();
      await page.getByRole('tooltip').hover();await expect(page.getByRole('tooltip')).toBeVisible();
    }
    await page.locator('.bd-legend a').first().focus();await page.locator('.bd-legend a').first().hover();await expect(page.getByRole('tooltip')).toHaveCount(0);
    const links=await page.locator('.bd-program a').evaluateAll(nodes=>nodes.map(e=>e.getAttribute('href')));
    for(const view of ['addressed','in_progress','needs_attention','not_assessed','unremediated','stale','unevidenced'])assert(links.some(h=>h.includes('view='+view)),view);
    for(const view of ['addressed','in_progress','needs_attention','not_assessed','unremediated','stale','unevidenced']){
      await page.goto(base+'/compliance/cis-ig1?view='+view);assert.equal(new URL(page.url()).searchParams.get('view'),view);
      await expect(page.getByRole('heading',{name:/CIS/}).first()).toBeVisible();
    }
    await page.goto(base+'/dashboard');await page.screenshot({path:path.join(output,'dashboard-light.png'),fullPage:true});
    await page.getByRole('button',{name:'Switch to dark mode'}).click();await page.screenshot({path:path.join(output,'dashboard-dark.png'),fullPage:true});
    results.push('Full-set filters/counts, framework intersection, search/reset, 25-item paging, date boundaries, completed exclusion, keyboard/hover tooltip and filtered routes');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
