// Optimized loopback Demo only. Every browser context has disposable storage.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4217',key='grc_interactive_demo_v3';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback Demo required');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
  const output=process.env.QA_OUTPUT_DIR;if(output)fs.mkdirSync(output,{recursive:true});
  page.on('pageerror',error=>errors.push(error.message));
  const store=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
  try{
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_prestige'));await page.goto(base+'/client-profile?tab=program');
    await page.getByText('SOC 2 scope',{exact:true}).click();for(const name of ['Availability','Confidentiality','Processing Integrity','Privacy'])await page.getByRole('checkbox',{name,exact:true}).check();
    await page.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();await expect.poll(async()=>(await store()).framework_assessments.filter(a=>a.client_id==='demo_prestige'&&a.framework_key==='soc-2').length).toBe(61);
    const rows=(await store()).framework_assessments;
    const open=async row=>{
      await page.evaluate(cid=>localStorage.setItem('grc_client_id',cid),row.client_id);
      await page.goto(base+'/compliance/'+row.framework_key+'?assessment='+row.framework_assessment_id);
      const dialog=page.locator('[data-assessment-shell]');
      await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeEnabled();return dialog;
    };
    for(const [framework,id] of [['cis-ig1','1.1'],['cis-ig1','18.2'],['soc-2','CC1.1'],['soc-2','A1.1'],['soc-2','C1.1'],['soc-2','PI1.1'],['soc-2','P1.1'],['iso-27001','4.1'],['iso-27001','6.1.3'],['iso-27001','A.5.1']]){
      const row=rows.find(row=>row.framework_key===framework&&row.definition_id===id);assert(row,framework+' '+id);
      let dialog=await open(row);
      assert.deepEqual(await dialog.getByRole('tab').allTextContents(),['Requirement & implementation','Assessment criteria']);
      await expect(dialog.getByRole('tab',{name:'Requirement & implementation',exact:true})).toHaveAttribute('data-state','active');
      await expect(dialog.locator('.assessment-summary')).not.toHaveAttribute('open','');
      assert.equal(await dialog.locator('.bcsg-metadata,.iso-assessment-metadata').count(),0);
      const field=dialog.getByLabel('Current implementation',{exact:true});
      await field.fill('SYNTHETIC layout draft '+id);
      await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).click();
      await expect(field).not.toBeVisible();
      const check=dialog.locator('.assessment-check input').first();
      const hasCheck=await check.count();if(hasCheck)await check.check();
      await dialog.getByRole('tab',{name:'Requirement & implementation',exact:true}).click();
      await expect(field).toHaveValue('SYNTHETIC layout draft '+id);
      await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();
      await expect(dialog.getByText(/Assessment saved\.|Changes saved; assessment date unchanged\./)).toBeVisible();
      const saved=(await store()).framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id);
      for(const name of ['status','owner_id','process_owner_id','evidence_ids','related_links'])assert.deepEqual(saved[name]??null,row[name]??null,name+' unchanged by checklist/narrative');
      assert.equal(saved.verification||'not_verified',row.verification||'not_verified','verification unchanged by checklist/narrative');
      await page.reload();dialog=page.locator('[data-assessment-shell]');
      await expect(dialog.getByLabel('Current implementation',{exact:true})).toHaveValue('SYNTHETIC layout draft '+id);
      await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).click();if(hasCheck)await expect(dialog.locator('.assessment-check input').first()).toBeChecked();
      await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).focus();await page.keyboard.press('ArrowLeft');
      await expect(dialog.getByRole('tab',{name:'Requirement & implementation',exact:true})).toHaveAttribute('data-state','active');
      for(const theme of ['light','dark'])for(const width of [1440,1280,768,480]){
        await page.setViewportSize({width,height:1000});await page.evaluate(theme=>localStorage.setItem('omnisciente:brawndo-dashboard-theme',theme),theme);await page.reload();
        dialog=page.locator('[data-assessment-shell]');await expect(dialog.getByLabel('Current implementation',{exact:true})).toBeVisible();
        await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).click();
        const bounds=await dialog.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
        assert(bounds.scroll<=bounds.width+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify({framework,id,theme,width,bounds}));
        if(output&&width===1440)await page.screenshot({path:path.join(output,framework+'-'+id+'-'+theme+'.png')});
      }
      results.push({framework,id,checklistAvailable:!!hasCheck,saveReopen:true,independent:true,keyboardTabs:true});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+'/admin/clients');await page.getByTestId('add-client-button').click();
    await page.getByTestId('new-client-name').fill('Synthetic assessment layout client');await page.getByTestId('new-client-save').click();
    await expect(page.getByTestId('add-client-dialog')).not.toBeVisible();
    const cid=(await store()).clients.find(c=>c.name==='Synthetic assessment layout client').client_id;
    await page.goto(base+'/clients');await page.getByTestId('sidebar-open-'+cid).click();await page.goto(base+'/client-profile');
    await page.getByRole('combobox',{name:'CIS Controls v8.1 IG1',exact:true}).selectOption('applies');
    const main=page.locator('main');await main.getByRole('button',{name:'Next',exact:true}).click();
    const responses=main.getByRole('button',{name:'Unsure',exact:true});for(let i=0,count=await responses.count();i<count;i++)await responses.nth(i).click();
    await main.getByRole('button',{name:'Next',exact:true}).click();await main.getByRole('button',{name:'Next',exact:true}).click();await main.getByRole('button',{name:'Complete onboarding',exact:true}).click();
    await expect(main.getByRole('heading',{name:'Client Profile',exact:true})).toBeVisible();
    const clientRows=async framework=>(await store()).framework_assessments.filter(a=>a.client_id===cid&&a.framework_key===framework);
    assert.equal((await clientRows('cis-ig1')).length,56);
    const first=(await clientRows('cis-ig1')).find(a=>a.definition_id==='1.1');let dialog=await open(first);
    await dialog.getByLabel('Current implementation',{exact:true}).fill('Synthetic newly onboarded implementation');await dialog.getByRole('tab',{name:'Assessment criteria',exact:true}).click();await dialog.locator('.assessment-check input').first().check();
    await dialog.getByRole('button',{name:'Save assessment',exact:true}).click();await expect(dialog.getByText('Assessment saved.',{exact:true})).toBeVisible();
    const retained=await clientRows('cis-ig1');await dialog.getByRole('button',{name:'Close assessment',exact:true}).click();
    await page.goto(base+'/client-profile?tab=program');
    for(const [group,count]of [[2,130],[3,153]]){
      await page.getByRole('combobox',{name:'CIS implementation group',exact:true}).selectOption(String(group));await page.getByRole('button',{name:'Review scope change',exact:true}).click();await page.getByRole('button',{name:'Confirm scope change',exact:true}).click();
      await expect.poll(async()=>(await clientRows('cis-ig1')).length).toBe(count);
      const now=await clientRows('cis-ig1');for(const old of retained)assert.deepEqual(now.find(a=>a.framework_assessment_id===old.framework_assessment_id),old,'inherited assessment unchanged through IG'+group);
    }
    for(const [name,framework,count]of [['SOC 2 Type 2','soc-2',33],['ISO/IEC 27001','iso-27001',123]]){
      await page.getByRole('combobox',{name:'Applicability — '+name,exact:true}).selectOption('applies');await page.getByRole('button',{name:'Confirm Program Change',exact:true}).click();await expect.poll(async()=>(await clientRows(framework)).length).toBe(count);
      const row=(await clientRows(framework))[0];dialog=await open(row);assert.deepEqual(await dialog.getByRole('tab').allTextContents(),['Requirement & implementation','Assessment criteria']);await dialog.getByRole('button',{name:'Close assessment',exact:true}).click();await page.goto(base+'/client-profile?tab=program');
    }
    results.push({newClient:true,frameworksAddedToExistingClient:['soc-2','iso-27001'],multiFramework:true,cisUpgradeCounts:[56,130,153],inheritedAnswersHistoryChecklistPreserved:true});
    assert.deepEqual(errors,[]);const report={build:'optimized Demo',results,widths:[1440,1280,768,480],themes:['light','dark'],errors,limits:['Approved screenshot absent; exact visual matching unverified.','ISO source coverage partial; this test does not claim checklist completeness.','Demo persistence is not authenticated backend browser verification.']};
    if(output)fs.writeFileSync(path.join(output,'assessment-layout-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
