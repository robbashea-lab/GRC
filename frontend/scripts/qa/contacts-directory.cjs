const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  const base=process.env.QA_BASE_URL||'http://127.0.0.1:4179';
  if(new URL(base).hostname!=='127.0.0.1')throw Error('Contacts QA requires isolated loopback Demo.');
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  const output=path.resolve(process.env.QA_OUTPUT||'qa-contacts-output');fs.mkdirSync(output,{recursive:true});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const dialog=()=>page.locator('.contact-workspace');
  const db=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')));
  const fill=async(name,email)=>{await page.getByLabel('Full Name *',{exact:true}).fill(name);await page.getByLabel('Email *',{exact:true}).fill(email);};
  try{
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    await page.getByTestId('sidebar-open-demo_brawndo').click();await page.getByTestId('nav-contacts').click();
    await expect(page.getByRole('heading',{name:'Contacts',exact:true})).toBeVisible();
    await expect(page.locator('.contacts-directory')).not.toContainText('Responsibility coverage');await expect(page.locator('thead')).not.toContainText('GRC Role');
    await page.getByRole('button',{name:'New Contact',exact:true}).click();await fill('Directory QA Person','directory-qa@example.test');await page.getByLabel('Job Title',{exact:true}).fill('Client Operations');await page.getByLabel('Phone',{exact:true}).fill('555-0101');
    await expect(dialog()).not.toContainText('Contact Status');await page.getByRole('button',{name:'Create Contact',exact:true}).click();await expect(dialog()).toHaveCount(0);
    await page.getByTestId('contacts-search').fill('directory-qa@example.test');await expect(page.locator('tbody')).toContainText('No access');
    await page.getByRole('button',{name:'Directory QA Person',exact:true}).click();await page.getByLabel('Job Title',{exact:true}).fill('Updated Operations');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(dialog()).toHaveCount(0);await page.reload();await expect(page.locator('tbody')).toContainText('Updated Operations');
    await page.getByRole('button',{name:'Directory QA Person',exact:true}).click();await page.getByRole('button',{name:'Invite to Omnisciente',exact:true}).click();await page.getByRole('button',{name:'Confirm invitation',exact:true}).click();await expect(dialog()).toContainText('Invitation pending');await expect(page.getByRole('button',{name:'Archive Contact',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Resend Invitation',exact:true}).click();await expect(page.getByRole('button',{name:'Resend Invitation',exact:true})).toBeEnabled();
    await page.keyboard.press('Escape');await expect(dialog()).toHaveCount(0);await expect(page.getByRole('button',{name:'Directory QA Person',exact:true})).toBeFocused();
    await page.getByLabel('Platform Access',{exact:true}).selectOption('pending');await expect(page.locator('tbody')).toContainText('Directory QA Person');await page.getByLabel('Platform Access',{exact:true}).selectOption('active');await expect(page.locator('tbody')).toContainText('No contacts match');await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    // Synthetic isolated browser data only: simulate the existing administrator disable workflow's result.
    const invited=(await db()).contacts.find(c=>c.email==='directory-qa@example.test');
    await page.evaluate(uid=>{const key='grc_interactive_demo_v3',data=JSON.parse(sessionStorage.getItem(key));data.users.find(u=>u.user_id===uid).status='disabled';sessionStorage.setItem(key,JSON.stringify(data));},invited.linked_user_id);
    await page.reload();await page.getByTestId('contacts-search').fill('directory-qa@example.test');await expect(page.locator('tbody')).toContainText('Disabled');
    await page.getByRole('button',{name:'Directory QA Person',exact:true}).click();await page.getByRole('button',{name:'Archive Contact',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Archive Contact',exact:true}).click();await expect(dialog()).toHaveCount(0);await expect(page.locator('tbody')).not.toContainText('Directory QA Person');
    await page.getByLabel('Include archived',{exact:true}).click();await expect(page.getByLabel('Include archived',{exact:true})).toBeChecked();await expect(page.locator('tbody')).toContainText('Directory QA Person');await page.reload();await expect(page.locator('tbody')).toContainText('Archived');
    await page.getByRole('button',{name:'Directory QA Person',exact:true}).click();await page.getByRole('button',{name:'Restore Contact',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Restore Contact',exact:true}).click();await expect(dialog()).toHaveCount(0);
    await page.getByRole('button',{name:'New Contact',exact:true}).click();await fill('Creation Invite QA','creation-invite@example.test');await page.getByLabel('Invite this contact to Omnisciente',{exact:true}).check();await page.getByRole('button',{name:'Create & Invite',exact:true}).click();await expect(dialog()).toHaveCount(0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByTestId('contacts-search').fill('creation-invite');await expect(page.locator('tbody')).toContainText('Invitation pending');
    const data=await db();assert.equal(data.users.filter(u=>u.email==='creation-invite@example.test').length,1);assert.equal(data.contacts.filter(c=>c.email==='creation-invite@example.test').length,1);
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    await page.getByRole('button',{name:'Joe Bowers',exact:true}).click();await expect(dialog()).toContainText('Active account');await expect(page.getByRole('button',{name:'Archive Contact',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog()).toHaveCount(0);
    for(const width of [1440,1280,1024,768]){
      await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'New Contact',exact:true}).click();
      await expect.poll(async()=>{const box=await dialog().boundingBox();return !!box&&box.width>width*.5&&box.x>=-1&&box.x+box.width<=width+1;}).toBe(true);
      for(let n=0;n<12;n++){await page.keyboard.press('Tab');assert.equal(await dialog().evaluate(el=>el.contains(document.activeElement)),true);}
      await page.screenshot({path:path.join(output,`contact-workspace-${width}.png`)});await page.keyboard.press('Escape');await expect(dialog()).toHaveCount(0);await expect(page.getByRole('button',{name:'New Contact',exact:true})).toBeFocused();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,`contacts-${width}.png`)});
    }
    await page.getByRole('button',{name:'New Contact',exact:true}).click();await page.getByLabel('Full Name *',{exact:true}).fill('Unsaved');await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toContainText('Discard contact changes?');await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(page.getByLabel('Full Name *',{exact:true})).toHaveValue('Unsaved');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(dialog()).toHaveCount(0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['create','edit','reload','invite later','invite during creation','filter','search','disabled display','archive','restore','duplicate prevention','draft protection','focus trap/restoration','Escape'],widths:[1440,1280,1024,768],errors,output}));
  }catch(e){await page.screenshot({path:path.join(output,'failure.png')});console.error({url:page.url(),active:await page.evaluate(()=>document.activeElement?.outerHTML)});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
