// Runs only against a local preview, with a fresh browser session and fictional Demo data.
// Supply Playwright through the verification environment; no production credentials are used.
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4174';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Framework QA requires an isolated local preview.');
const cases=[['cis-ig1','1.1','safeguard'],['nist-csf-2','GV.OC-01','subcategory'],['hipaa','164.308(a)(1)(ii)(A)','requirement'],['iso-27001','4.1','requirement'],['soc-2','CC1.1','criterion']];
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER?{executablePath:process.env.QA_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const go=p=>page.goto(base+p),db=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v2'))),drawer=()=>page.getByTestId('framework-drawer');
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
    for(const [key,id,type] of cases.filter(c=>!process.argv[2]||c[0]===process.argv[2])){
      await go('/compliance/'+key);await page.getByTestId(type+'-'+id).getByRole('button').first().click();await expect(drawer().getByRole('heading',{name:'What this means',exact:true})).toBeVisible();
      assert.ok(page.url().includes('assessment='));const direct=page.url();
      await drawer().getByText('Implementation guidance & evidence examples',{exact:true}).click();await expect(drawer().getByRole('heading',{name:'Evidence examples',exact:true})).toBeVisible();
      await drawer().getByText(/Governance & recurrence/).click();await expect(drawer()).toContainText('Activity:');
      const notes='Scoped practice exists; remote coverage remains incomplete. Evidence reviewed with the client.';
      await drawer().getByLabel('Assessment notes',{exact:true}).fill(notes);await drawer().getByLabel('Assessment Status').selectOption('in_progress');await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');
      await tab('Evidence');await drawer().getByLabel('Upload Evidence',{exact:true}).setInputFiles({name:key+'-proof.txt',mimeType:'text/plain',buffer:Buffer.from('Fictional operator workflow evidence.')});await expect(drawer().getByRole('button',{name:key+'-proof.txt',exact:true})).toBeVisible();
      const downloaded=page.waitForEvent('download');await drawer().getByRole('button',{name:key+'-proof.txt',exact:true}).click();assert.equal((await downloaded).suggestedFilename(),key+'-proof.txt');
      const eid=(await db()).evidence.find(e=>e.client_id===cid&&e.filename===key+'-proof.txt').evidence_id;
      await drawer().getByRole('button',{name:'Unlink '+key+'-proof.txt from this assessment',exact:true}).click();await expect(drawer().getByRole('button',{name:key+'-proof.txt',exact:true})).toHaveCount(0);await drawer().getByLabel('Link existing Evidence').selectOption(eid);await expect(drawer().getByRole('button',{name:key+'-proof.txt',exact:true})).toBeVisible();
      await tab('Related');await drawer().getByRole('button',{name:'Raise Finding',exact:true}).click();await expect(drawer().getByLabel('Finding description')).toHaveValue(notes);
      await drawer().getByLabel('Finding title',{exact:true}).fill(key+' coverage gap');await drawer().getByLabel('Remediation Action title',{exact:true}).fill(key+' extend coverage');await drawer().getByRole('button',{name:'Create Finding & Action',exact:true}).click();await expect(drawer().getByRole('button',{name:key+' extend coverage',exact:true})).toBeVisible();
      await drawer().getByRole('button',{name:key+' extend coverage',exact:true}).click();await page.locator('#task-description').fill('Extended coverage and checked the updated configuration.');await page.getByRole('button',{name:'Complete Action Item',exact:true}).click();await expect(page.getByTestId('action-completion-handoff')).toBeVisible();await page.getByTestId('drawer-close').click();
      await drawer().getByRole('button',{name:key+' coverage gap',exact:true}).click();await page.getByTestId('finding-validate').click();await page.getByLabel('What confirms the remediation worked?').fill('Confirmed coverage in the updated records and validated the previously missing scope.');await page.getByRole('button',{name:'Record decision',exact:true}).click();await expect(page.getByLabel('What confirms the remediation worked?')).toHaveCount(0);await page.getByTestId('drawer-close').click();
      await tab('Assessment');await expect(drawer().getByLabel('Assessment Status')).toHaveValue('in_progress');await drawer().getByLabel('Assessment notes',{exact:true}).fill('Coverage validated after remediation; linked Finding retains the decision.');await drawer().getByLabel('Assessment Status').selectOption('addressed');await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');
      await tab('History');await expect(drawer()).toContainText(notes);await expect(drawer()).toContainText('Coverage validated after remediation');
      await drawer().getByRole('button',{name:'Next',exact:true}).click();assert.notEqual(page.url(),direct);await drawer().getByRole('button',{name:'Previous',exact:true}).click();assert.equal(page.url(),direct);
      await drawer().getByLabel('Assessment notes',{exact:true}).fill('Unsaved draft');await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(drawer().getByLabel('Assessment notes',{exact:true})).toHaveValue('Unsaved draft');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(drawer()).toHaveCount(0);
      await page.goto(direct);await expect(drawer().getByLabel('Assessment Status')).toHaveValue('addressed');await page.reload();await expect(drawer().getByLabel('Assessment Status')).toHaveValue('addressed');await page.keyboard.press('Escape');
      const search=page.getByRole('textbox',{name:/^Search /});await search.fill(id);await page.getByTestId(type+'-'+id).getByRole('button').first().click();await page.keyboard.press('Escape');await expect(search).toHaveValue(id);await search.fill('');
      await page.getByTestId(type+'-'+id).getByRole('button').first().click();await page.goBack();await expect(drawer()).toHaveCount(0);await page.goForward();await expect(drawer()).toBeVisible();
      await drawer().getByRole('tab',{name:'Assessment',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(drawer().getByRole('tab',{selected:true})).not.toHaveText('Assessment');await tab('Assessment');
      if(process.env.QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'operator-'+key+'.png')});await page.keyboard.press('Escape');
      const a=(await db()).framework_assessments.find(a=>a.client_id===cid&&a.framework_key===key&&a.definition_id===id);assert.equal(a.assessment_history.length,2);assert.equal((await db()).findings.find(f=>f.framework_assessment_id===a.framework_assessment_id).status,'closed');
      if(key==='soc-2'){
        await page.goto(direct);await expect(drawer()).toContainText('The criterion describes an expectation');
        await tab('Management Controls');await drawer().getByRole('button',{name:'Add management control',exact:true}).click();
        await drawer().getByLabel('Control name 1',{exact:true}).fill('Management reviews conduct exceptions');
        await drawer().getByLabel('Control description 1',{exact:true}).fill('An assigned manager reviews reported exceptions and records follow-up decisions.');
        await drawer().getByLabel('Design readiness 1').selectOption('adequate');await drawer().getByLabel('Operating evidence 1').selectOption('gap');
        await drawer().getByLabel('Control frequency 1').fill('On reported exceptions');
        await drawer().getByLabel('Observation period start 1').fill('2026-01-01');await drawer().getByLabel('Observation period end 1').fill('2026-06-30');
        await drawer().getByLabel('Expected instances 1').fill('3');await drawer().getByLabel('Collected instances 1').fill('2');await expect(drawer()).toContainText('Reported missing instances: 1');
        await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');await page.reload();await tab('Management Controls');await expect(drawer().getByLabel('Control name 1')).toHaveValue('Management reviews conduct exceptions');await page.keyboard.press('Escape');
        await page.getByText('Scope & evidence period',{exact:true}).click();await page.getByLabel('Availability',{exact:true}).check();await page.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();await expect(page.locator('main tbody tr')).toHaveCount(36);
        await page.getByLabel('Availability',{exact:true}).uncheck();await page.getByRole('button',{name:'Save SOC 2 scope',exact:true}).click();await expect(page.locator('main tbody tr')).toHaveCount(33);
        await page.getByLabel('Include retained out-of-scope criteria').check();await expect(page.locator('main tbody tr')).toHaveCount(36);
      }
      if(key==='iso-27001'){
        await go('/compliance/iso-27001');await page.getByLabel('ISO workspace view').selectOption('soa');await expect(page.locator('main tbody tr')).toHaveCount(93);
        await page.getByTestId('requirement-A.5.18').getByRole('button').first().click();await expect(drawer()).toContainText('Annex A / SoA');
        await drawer().getByLabel('SoA applicability').selectOption('excluded');await drawer().getByLabel('Assessment Status').selectOption('not_applicable');await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer().getByRole('alert')).toContainText('justification');
        await drawer().getByLabel('SoA justification').fill('Synthetic applicability decision for this test scope.');await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');
        const soaLink=page.url();await page.reload();await expect(drawer().getByLabel('SoA applicability')).toHaveValue('excluded');await tab('History');await expect(drawer()).toContainText('Synthetic applicability decision');await page.keyboard.press('Escape');
        for(const view of ['audit','management','treatment','corrections']){await page.getByLabel('ISO workspace view').selectOption(view);assert.ok(await page.locator('main tbody tr').count()>0);}
        await page.goto(soaLink);await expect(drawer().getByLabel('Assessment Status')).toHaveValue('not_applicable');await page.keyboard.press('Escape');
      }
      if(key==='hipaa'){
        await go('/compliance/hipaa');await page.getByTestId('requirement-164.308(a)(3)(ii)(A)').getByRole('button').first().click();
        await expect(drawer()).toContainText('Addressable does not mean optional');
        await drawer().getByLabel('Assessment notes',{exact:true}).fill('Supervision and authorization documented for the scoped workforce.');
        await drawer().getByLabel('Assessment Status').selectOption('addressed');await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer().getByRole('alert')).toContainText('addressability decision');
        await drawer().getByLabel('Addressability decision').selectOption('as_written');await drawer().getByLabel('Decision rationale').fill('Written authorization and supervision are appropriate to the assessed workforce scope.');
        await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');await tab('History');await expect(drawer()).toContainText('Written authorization and supervision');await page.keyboard.press('Escape');
      }
      if(key==='nist-csf-2'){
        await page.goto(direct);await tab('Profiles');await drawer().getByLabel('Include in Target Profile').check();
        await drawer().getByLabel('Target outcome',{exact:true}).fill('Mission dependencies inform all risk decisions.');
        await drawer().getByLabel('Target priority').selectOption('high');await drawer().getByLabel('Gap decision').selectOption('gap');await drawer().getByLabel('Gap analysis / rationale').fill('A newly acquired service is outside the validated scope.');
        await drawer().getByRole('button',{name:'Save assessment',exact:true}).click();await expect(drawer()).toContainText('Assessment saved.');await page.keyboard.press('Escape');
        await page.getByLabel('CSF profile view').selectOption('gaps');await expect(page.locator('main tbody tr')).toHaveCount(1);await page.getByTestId(type+'-'+id).getByRole('button').first().click();await tab('Profiles');await expect(drawer().getByLabel('Target outcome',{exact:true})).toHaveValue('Mission dependencies inform all risk decisions.');await page.keyboard.press('Escape');
      }
      console.log('PASS '+key+': context, guidance, assessment, evidence download/relink, Finding/Action remediation/validation, history, next/previous, draft guard, deep link/refresh/back, search retention, keyboard tabs.');
    }
    if(!process.argv[2]){
      const before=await db(),shared=before.findings.find(f=>f.client_id===cid&&f.title==='cis-ig1 coverage gap');
      const sharedTask=before.tasks.find(t=>t.finding_id===shared.finding_id),sharedEvidence=before.evidence.find(e=>e.client_id===cid&&e.filename==='cis-ig1-proof.txt');
      for(const [key,id,type] of cases){
        await go('/compliance/'+key);await page.getByTestId(type+'-'+id).getByRole('button').first().click();await tab('Related');
        for(const [kind,identity,title] of [['findings',shared.finding_id,shared.title],['tasks',sharedTask.task_id,sharedTask.title]]){
          await drawer().getByLabel('Related record type',{exact:true}).selectOption(kind);await drawer().getByLabel('Related record',{exact:true}).selectOption(identity);await drawer().getByRole('button',{name:'Link record',exact:true}).click();await expect(drawer().getByRole('button',{name:title,exact:true})).toBeVisible();
        }
        await tab('Evidence');await drawer().getByLabel('Link existing Evidence').selectOption(sharedEvidence.evidence_id);await expect(drawer().getByRole('button',{name:sharedEvidence.filename,exact:true})).toBeVisible();await page.keyboard.press('Escape');
      }
      const after=await db();for(const kind of ['findings','tasks','evidence'])assert.equal(after[kind].length,before[kind].length);
      console.log('PASS cross-framework reuse: one existing Finding, Action and Evidence linked through all five framework UIs without duplicate records.');
    }
    assert.deepEqual((await db()).reviews.filter(r=>r.client_id===cid),reviews);
    for(const route of ['dashboard','calendar','reviews','findings','action-items','risks','policies','vendors','ai-governance','contacts','evidence','onboarding','client-settings',...cases.map(c=>'compliance/'+c[0])]){await go('/'+route);await expect(page.locator('main')).not.toBeEmpty();}
    for(const width of [1440,1280,1024,768]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'overflow at '+width);}
    await page.evaluate(()=>localStorage.setItem('grc_client_id','demo_dunder'));await go('/compliance/nist-csf-2?assessment='+initial.framework_assessments.find(a=>a.client_id===cid).framework_assessment_id);await expect(drawer()).toHaveCount(0);
    assert.deepEqual(errors,[]);console.log('PASS: 394 assessments, unchanged shared Reviews, 18 routes, four widths, wrong-client link excluded, no console errors.');
  }catch(e){if(process.env.QA_ARTIFACTS)await page.screenshot({path:path.join(process.env.QA_ARTIFACTS,'operator-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
