// Isolated browser Demo, with synthetic records only. Not backend persistence proof.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const target=require('../ticket-verification-target.cjs');
const KEY='grc_interactive_demo_v3';
(async()=>{
  const {base,out,route}=await target();
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],results=[];
  await context.route('**/*',route);page.on('pageerror',error=>errors.push(error.message));
  const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),KEY);
  try{
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    const fixture=await page.evaluate(key=>{
      const db=JSON.parse(sessionStorage.getItem(key)),cid='calendar_synthetic',now=new Date();
      const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const today=iso(now),tomorrow=iso(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
      db.clients.push({client_id:cid,name:'Synthetic Calendar Client',status:'active',environment:'Demo'});
      const common={client_id:cid,owner_id:null,created_at:now.toISOString(),updated_at:now.toISOString()};
      db.tasks.push({...common,task_id:'calendar-task',title:'Synthetic date task',status:'open',priority:'medium',due_date:today+'T14:30:00-04:00'},
        {...common,task_id:'calendar-done',title:'Synthetic completed task',status:'done',priority:'medium',due_date:today},
        {...common,task_id:'calendar-linked',finding_id:'calendar-finding',title:'Synthetic correction',status:'open',priority:'medium',due_date:today});
      db.findings.push({...common,finding_id:'calendar-finding',title:'Synthetic issue',description:'Synthetic Calendar relationship',severity:'medium',status:'in_remediation',due_date:today});
      db.reviews.push({...common,review_id:'calendar-review',title:'Synthetic recurring review',review_type:'access',status:'upcoming',due_date:'2026-01-31',recurrence:'monthly',current_occurrence_id:'calendar-current',
        occurrences:[{...common,review_id:'calendar-review',occurrence_id:'calendar-history',title:'Synthetic completed occurrence',status:'completed',due_date:today,recurrence:'monthly',completed_at:now.toISOString(),completed_by:db.user.user_id,evidence:[]}]});
      db.vendors.push({...common,vendor_id:'calendar-vendor',name:'Synthetic Calendar Vendor',service:'Synthetic service',status:'active',criticality:'low',review_frequency:'as_needed',
        contract_notice_deadline:today,contract_renewal:tomorrow,assurance_records:[{assurance_id:'calendar-assurance',type:'SOC 2',next_follow_up:today}]});
      sessionStorage.setItem(key,JSON.stringify(db));localStorage.setItem('grc_client_id',cid);
      return {cid,today,tomorrow};
    },KEY);
    await page.goto(base+'/calendar');await expect(page.getByRole('heading',{name:'Calendar',exact:true})).toBeVisible();
    const view=page.getByRole('group',{name:'Calendar view'}),panel=page.getByRole('complementary').filter({has:page.getByRole('heading',{name:'Scheduled items'})});
    await expect(view.getByRole('button',{name:'Month',exact:true})).toHaveAttribute('aria-pressed','true');
    assert.equal(await page.locator('[data-testid^="cal-day-"]').count(),42);
    await expect(page.getByRole('group',{name:'Due date summary'})).toHaveCount(0);
    await expect(page.getByRole('group',{name:'Calendar scope'})).toHaveCount(0);
    await expect(panel.getByText('Synthetic completed task',{exact:true})).toBeVisible();
    await expect(panel.getByText('Synthetic completed occurrence',{exact:true})).toBeVisible();
    await expect(page.getByTestId('cal-attn-review:calendar-review:calendar-current')).toContainText('Overdue');
    results.push({scenario:'new-client standard, completion and old overdue visibility',passed:true});
    for(const mode of ['Day','Week','Month']){
      await view.getByRole('button',{name:mode,exact:true}).click();
      const count={Day:1,Week:7,Month:42}[mode];await expect(page.locator('[data-testid^="cal-day-"]')).toHaveCount(count);
      await page.getByTestId('cal-next').click();await page.getByTestId('cal-prev').click();await page.getByTestId('cal-today').click();
      await expect(view.getByRole('button',{name:mode,exact:true})).toHaveAttribute('aria-pressed','true');
      await expect(page.getByTestId('cal-day-'+fixture.today)).toBeVisible();
    }
    results.push({scenario:'Day Week Month, unit navigation and Today',passed:true});
    const task=page.getByTestId('cal-attn-task:calendar-task:current');
    await task.focus();await page.keyboard.press('Enter');let dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('link',{name:'Open Action Item',exact:true})).toBeVisible();
    await dialog.getByLabel('Due date', {exact:true}).fill(fixture.tomorrow);
    await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(task).toBeFocused();
    await task.click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Due date',{exact:true})).toHaveValue(fixture.tomorrow);
    await dialog.getByRole('button',{name:'Save date',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect.poll(async()=>(await store()).tasks.find(t=>t.task_id==='calendar-task').due_date).toBe(fixture.tomorrow+'T14:30:00-04:00');
    await page.reload();await page.getByTestId('cal-attn-task:calendar-task:current').click();
    await page.getByRole('dialog').getByRole('link',{name:'Open Action Item',exact:true}).click();
    await expect(page.getByTestId('remediation-ticket-drawer')).toBeVisible();await expect(page.getByTestId('remediation-ticket-drawer')).toContainText('Synthetic date task');
    await page.keyboard.press('Escape');await expect(page.getByTestId('remediation-ticket-drawer')).toHaveCount(0);
    results.push({scenario:'native date save, offset, refresh, exact task, draft, Escape and focus',passed:true});
    for(const [key,label,drawerId] of [['finding:calendar-finding:current','Open Action Item','remediation-ticket-drawer'],['review:calendar-review:calendar-history','Open Review','reviews-drawer'],
      ['vendor_assurance:calendar-vendor:calendar-assurance','Open Vendor','vendors-drawer'],['vendor_contract_notice:calendar-vendor:notice','Open Vendor','vendors-drawer'],['vendor_contract_renewal:calendar-vendor:renewal','Open Vendor','vendors-drawer']]){
      await page.getByTestId('cal-attn-'+key).click();dialog=page.getByRole('dialog');
      if(key.startsWith('finding:'))await expect(dialog.getByLabel('Due date',{exact:true})).toBeEnabled();
      else await expect(dialog.getByLabel('Due date',{exact:true})).toBeDisabled();
      await dialog.getByRole('link',{name:label,exact:true}).click();await expect(page.getByTestId(drawerId)).toBeVisible();
      if(key.startsWith('finding:'))await expect(page.getByTestId(drawerId)).toContainText('Synthetic correction');
      if(key.startsWith('review:'))await expect(page.getByTestId('field-due_date')).toHaveValue(fixture.today);
      await page.keyboard.press('Escape');await expect(page.getByTestId(drawerId)).toHaveCount(0);
    }
    results.push({scenario:'exact history, unified Finding ticket and three read-only Vendor dates',passed:true});
    await page.getByTestId('cal-attn-review:calendar-review:calendar-current').click();dialog=page.getByRole('dialog');
    await dialog.getByLabel('Due date',{exact:true}).fill(fixture.tomorrow);await dialog.getByRole('button',{name:'Save date',exact:true}).click();
    await expect.poll(async()=>(await store()).reviews.find(r=>r.review_id==='calendar-review').due_date).toBe(fixture.tomorrow);
    const moved=(await store()).reviews.find(r=>r.review_id==='calendar-review');assert.equal(moved.recurrence_due_date,'2026-01-31');assert.equal(moved.next_review_date.slice(0,10),'2026-02-28');assert.equal(moved.occurrences.length,1);
    await page.reload();await page.getByTestId('cal-attn-review:calendar-review:calendar-current').click();
    await page.getByRole('dialog').getByRole('link',{name:'Open Review',exact:true}).click();await expect(page.getByTestId('field-due_date')).toHaveValue(fixture.tomorrow);
    await page.keyboard.press('Escape');results.push({scenario:'Review occurrence-only save, original cadence/history and exact source',passed:true});
    // Drag an existing source chip, not a second Calendar record.
    const from=page.getByTestId('cal-item-task:calendar-linked:current'),destination=page.getByTestId('cal-day-'+fixture.tomorrow);
    await from.dragTo(destination);await expect.poll(async()=>(await store()).tasks.find(t=>t.task_id==='calendar-linked').due_date).toBe(fixture.tomorrow);
    assert.equal((await store()).tasks.filter(t=>t.task_id==='calendar-linked').length,1);
    results.push({scenario:'drag source persistence without duplicate task',passed:true});
    for(const theme of ['light','dark'])for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:1000});await page.evaluate(theme=>{localStorage.setItem('omnisciente:brawndo-dashboard-theme',theme);window.dispatchEvent(new Event('omnisciente:brawndo-theme'));},theme);
      await expect(page.locator('.bcal')).toHaveAttribute('data-theme',theme);
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
      if(width===390){
        const scroll=page.locator('.bcal-scroll');await scroll.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
        const bounds=await scroll.boundingBox(),sunday=await page.locator('[data-testid^="cal-day-"]').nth(6).boundingBox();
        assert(sunday.x+sunday.width<=bounds.x+bounds.width+1,'Sunday must remain reachable by inner horizontal scrolling');
        await scroll.evaluate(el=>{el.scrollLeft=0;});
      }
      await page.screenshot({path:path.join(out,`calendar-${theme}-${width}.png`),fullPage:true});
    }
    results.push({scenario:'light dark responsive widths, no page overflow and all Month columns reachable',passed:true});
    await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_prestige'));await page.reload();
    await expect(page.getByText('Synthetic date task',{exact:true})).toHaveCount(0);
    results.push({scenario:'client isolation',passed:true});assert.deepEqual(errors,[]);
    const report={mode:'isolated browser Demo',base,results,pageErrors:errors};fs.writeFileSync(path.join(out,'calendar-browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
