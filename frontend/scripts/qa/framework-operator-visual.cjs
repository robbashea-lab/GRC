// Runs only against a local preview, with a fresh browser session and fictional Demo data.
// Supply Playwright through the verification environment; no production credentials are used.
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4174';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Framework visual QA requires an isolated local preview.');
const cases=[['cis-ig1','1.1','safeguard'],['nist-csf-2','GV.OC-01','subcategory'],['hipaa','164.308(a)(1)(ii)(A)','requirement'],['iso-27001','4.1','requirement'],['soc-2','CC1.1','criterion']];
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  // Loopback only: synthetic QA activity never reaches an external service.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.fulfill({status:204,body:''}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const go=p=>page.goto(base+p),db=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3'))),drawer=()=>page.getByTestId('framework-drawer');
  const tab=name=>drawer().getByRole('tab',{name,exact:true}).click();
  try{
    await go('/login');await expect(page.locator('input[type=email]')).toHaveValue('');await expect(page.locator('input[type=password]')).toHaveValue('');
    await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');assert.equal((await db()).clients.length,5);
    await go('/admin/clients');await page.getByTestId('add-client-button').click();await page.getByTestId('new-client-name').fill('Operator QA');await page.getByTestId('new-client-save').click();await expect(page.getByTestId('new-client-name')).toHaveCount(0);
    const cid=(await db()).clients.find(c=>c.name==='Operator QA').client_id;await page.evaluate(id=>localStorage.setItem('grc_client_id',id),cid);
    await go('/onboarding');for(const name of ['CIS Controls v8.1 IG1','HIPAA','ISO/IEC 27001','SOC 2 Type 2'])await page.getByRole('combobox',{name,exact:true}).selectOption('applies');
    await page.getByRole('button',{name:'Next',exact:true}).click();const unsure=page.getByRole('button',{name:'Unsure',exact:true});for(let i=0;i<await unsure.count();i++)await unsure.nth(i).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Complete onboarding',exact:true}).click();await expect(page.getByTestId('onboarding-handoff')).toBeVisible();
    await go('/client-settings?tab=compliance');await page.getByLabel('Applicability — NIST CSF 2.0',{exact:true}).selectOption('applies');await expect(page.getByTestId('nav-compliance-nist-csf-2')).toBeVisible();
    const initial=await db();assert.equal(initial.framework_assessments.filter(a=>a.client_id===cid).length,394);const reviews=initial.reviews.filter(r=>r.client_id===cid);

    const cdp=await page.context().newCDPSession(page);await cdp.send('Animation.enable');
    for(const [key,id,type] of cases){
      await go('/compliance/'+key);
      const search=page.getByRole('textbox',{name:/^Search /});await search.fill('no matching synthetic requirement');await expect(page.locator('main tbody tr')).toHaveCount(0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();
      await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
      await page.getByTestId(type+'-'+id).getByRole('button').first().click();
      const timings=await page.evaluate(()=>document.getAnimations().map(a=>{const d=a.effect.getTiming().duration;a.pause();if(typeof d==='number')a.currentTime=d*.1;return d;}));
      assert.ok(timings.length,'No entry motion captured for '+key);
      if(process.env.QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'operator-motion-'+key+'.png')});
      await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
      for(const width of [1440,1280,1024,768]){await page.setViewportSize({width,height:1100});assert.ok(await drawer().evaluate(e=>e.scrollWidth<=e.clientWidth+2),'drawer overflow '+key+' '+width);}
      await page.setViewportSize({width:1440,height:1100});
      if(process.env.QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'operator-assessment-'+key+'.png')});
      await drawer().getByRole('tab',{name:'Evidence',exact:true}).hover();await drawer().getByRole('tab',{name:'Evidence',exact:true}).click();await expect(drawer()).toContainText('No linked Evidence.');
      await tab('History');await expect(drawer()).toContainText('No saved assessments yet.');
      await page.keyboard.press('Escape');await expect(drawer()).toHaveCount(0);
      await page.emulateMedia({reducedMotion:'reduce'});await page.getByTestId(type+'-'+id).getByRole('button').first().click();await expect(drawer().getByLabel('Assessment notes',{exact:true})).toBeVisible();
      const reduced=await drawer().evaluate(e=>getComputedStyle(e).animationDuration);assert.ok(reduced.split(',').every(v=>parseFloat(v)<=.01),'reduced motion '+reduced);
      await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
      console.log('PASS visual '+key+': empty filters/evidence/history, hover and active tabs, four drawer widths, entry motion at 10%, reduced motion. Durations '+JSON.stringify(timings));
    }
    const before=await db(),adminId=before.user.user_id;
    await page.evaluate(cid=>{const key='grc_interactive_demo_v3',data=JSON.parse(sessionStorage.getItem(key));const reader={user_id:'framework-qa-reader',name:'Synthetic Read-only Assessor',email:'reader@example.test',role:'client_readonly',status:'active',client_ids:[cid]};data.users.push(reader);data.user=reader;sessionStorage.setItem(key,JSON.stringify(data));},cid);
    for(const [key,id,type] of cases){
      await go('/compliance/'+key);await page.getByTestId(type+'-'+id).getByRole('button').first().click();
      await expect(drawer().getByLabel('Assessment Status',{exact:true})).toBeDisabled();
      await expect(drawer().getByRole('button',{name:'Save assessment',exact:true})).toHaveCount(0);
      await tab('Related');await expect(drawer().getByRole('button',{name:'Raise Finding',exact:true})).toHaveCount(0);
      await tab('Evidence');await expect(drawer().getByLabel('Upload Evidence',{exact:true})).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(id=>{const key='grc_interactive_demo_v3',data=JSON.parse(sessionStorage.getItem(key));data.user=data.users.find(u=>u.user_id===id);sessionStorage.setItem(key,JSON.stringify(data));},adminId);
    console.log('PASS read-only Demo assessment, Related and Evidence controls across five frameworks; no record changes.');
    await go('/client-settings?tab=compliance');
    for(const label of ['CIS Controls v8.1 IG1','NIST CSF 2.0','HIPAA','ISO/IEC 27001','SOC 2 Type 2']){
      const picker=page.getByLabel('Applicability — '+label,{exact:true});
      for(const state of ['does_not_apply','unsure','applies']){await picker.selectOption(state);await expect(picker).toHaveValue(state);}
    }
    const after=await db();assert.deepEqual(after.framework_assessments.filter(a=>a.client_id===cid),before.framework_assessments.filter(a=>a.client_id===cid));assert.deepEqual(after.reviews.filter(r=>r.client_id===cid),reviews);
    await page.getByTestId('profile-menu-trigger').click();await page.getByTestId('logout-button').click();await page.waitForURL('**/login');assert.equal(await page.evaluate(()=>localStorage.getItem('grc_token')),null);await expect(page.locator('input[type=email]')).toHaveValue('');await expect(page.locator('input[type=password]')).toHaveValue('');
    assert.deepEqual(errors,[]);console.log('PASS activation/unsure/deactivation preserves framework records and Review history; Demo logout does not create standard authentication.');
  }catch(e){if(process.env.QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'operator-visual-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
