// Real production UI, disposable session Demo. Never targets persistent data.
const {chromium}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4184';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use a loopback Demo preview');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  try{
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.fulfill({status:204,body:''}));
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',dialog=>dialog.accept());
    await page.goto(base+'/login');await page.getByTestId('explore-demo').click();await page.waitForURL('**/clients');
    const scope=await page.evaluate(()=>{
      const key='grc_interactive_demo_v3',db=JSON.parse(sessionStorage.getItem(key)),cid=db.clients[0].client_id,other=db.clients[1].client_id,at=new Date().toISOString();
      for(const kind of ['reviews','policies','findings','tasks','evidence'])db[kind]=db[kind].filter(r=>r.client_id!==cid);
      db.reviews.push({review_id:'library-review',client_id:cid,title:'Library User Access Review',review_type:'access',recurrence:'quarterly',due_date:'2027-03-31',status:'upcoming',current_occurrence_id:'occ_library-review',occurrences:[],created_at:at,updated_at:at});
      db.policies.push({policy_id:'library-policy',client_id:cid,title:'Library Risk Management Policy',status:'draft',version:'1.0',created_at:at,updated_at:at});
      db.findings.push({finding_id:'library-finding',client_id:cid,title:'Library Access Gap',status:'open',severity:'high',created_at:at,updated_at:at});
      db.vendors.push({vendor_id:'library-vendor',client_id:cid,name:'Library CloudCore',service:'Cloud hosting',criticality:'high',status:'active',next_review:'2027-06-30',review_frequency:'annual',assurance_records:[],created_at:at,updated_at:at});
      db.reviews.push({review_id:'library-vendor-review',client_id:cid,vendor_id:'library-vendor',title:'Library Vendor Review',review_type:'vendor',recurrence:'annual',due_date:'2027-06-30',status:'upcoming',current_occurrence_id:'occ_library-vendor-review',occurrences:[],created_at:at,updated_at:at});
      sessionStorage.setItem(key,JSON.stringify(db));localStorage.setItem('grc_client_id',cid);return {cid,other};
    });
    const upload={name:'policy-library.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic policy evidence')};
    await page.goto(base+'/policies');await page.getByText('Library Risk Management Policy',{exact:true}).click();
    const policy=page.getByTestId('policies-drawer');await policy.getByRole('button',{name:'Evidence',exact:true}).click();
    await policy.getByTestId('drawer-evidence-input').setInputFiles(upload);await expect(policy.getByText(upload.name,{exact:true})).toBeVisible();
    await policy.getByTestId('drawer-close').click();
    await page.goto(base+'/vendors');await page.getByText('Library CloudCore',{exact:true}).click();
    const vendor=page.getByTestId('vendors-drawer');await vendor.getByRole('button',{name:'Security Assurance',exact:true}).click();
    await vendor.getByLabel('Add vendor evidence',{exact:true}).setInputFiles({name:'vendor-assurance-library.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic assurance report')});
    await vendor.getByLabel('Add assurance expectation',{exact:true}).click();await page.getByRole('option',{name:'SOC 2',exact:true}).click();
    await expect(vendor.getByText('vendor-assurance-library.txt',{exact:true})).toBeVisible();await vendor.getByLabel('Link vendor-assurance-library.txt',{exact:true}).check();await vendor.getByTestId('drawer-save').click();await expect(vendor).toHaveCount(0);
    await page.goto(base+'/reviews');await page.getByText('Vendor Review — Library CloudCore',{exact:true}).click();
    const vendorReview=page.getByTestId('reviews-drawer');await vendorReview.getByTestId('tab-evidence').click();await vendorReview.getByRole('button',{name:'Link existing Evidence',exact:true}).click();
    await vendorReview.getByLabel('Find existing Evidence').fill('vendor-assurance-library');await vendorReview.getByRole('button',{name:'Link file',exact:true}).click();
    await expect(vendorReview.getByText('vendor-assurance-library.txt',{exact:true})).toBeVisible();await vendorReview.getByTestId('tab-overview').click();await vendorReview.getByTestId('review-complete').click();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).reviews.find(r=>r.review_id==='library-vendor-review').occurrences.length)).toBe(1);
    const shared=await page.evaluate(()=>{const db=JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3'));return {files:db.evidence.filter(e=>e.filename==='vendor-assurance-library.txt'),snapshot:db.reviews.find(r=>r.review_id==='library-vendor-review').occurrences[0]};});
    assert.equal(shared.files.length,1);assert.equal(shared.snapshot.evidence[0].evidence_id,shared.files[0].evidence_id);await vendorReview.getByTestId('drawer-close').click();
    for(let q=1;q<=4;q++){
      await page.goto(base+'/reviews');await page.getByText('Library User Access Review',{exact:true}).click();
      const drawer=page.getByTestId('reviews-drawer');await drawer.getByTestId('tab-evidence').click();
      await expect(drawer.getByText(/q[1-4]-library.txt/)).toHaveCount(0);
      const name=`q${q}-library.txt`;await drawer.getByTestId('drawer-evidence-input').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from('Synthetic Q'+q)});
      await expect(drawer.getByText(name,{exact:true})).toBeVisible();await drawer.getByTestId('tab-overview').click();await drawer.getByTestId('review-complete').click();
      await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).reviews.find(r=>r.review_id==='library-review').occurrences.length)).toBe(q);await drawer.getByTestId('drawer-close').click();
    }
    await page.goto(base+'/evidence');await expect(page.getByRole('heading',{name:'Evidence Library',exact:true})).toBeVisible();await expect(page.getByTestId('evidence-dropzone')).toHaveCount(0);
    await page.getByRole('button',{name:/^Reviews \d+ files$/}).click();await page.getByRole('button',{name:/^Library User Access Review Current occurrence/}).click();
    for(let q=1;q<=4;q++)await expect(page.getByRole('button',{name:`Q${q} 2027`,exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Q1 2028',exact:true})).toBeVisible();await page.getByRole('button',{name:'Q2 2027',exact:true}).click();
    await expect(page.getByRole('button',{name:'q2-library.txt',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'q1-library.txt',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'q2-library.txt',exact:true}).click();let detail=page.getByRole('dialog').last();await detail.getByRole('button',{name:'Related',exact:true}).click();
    await detail.getByText('Link another record',{exact:true}).click();await detail.getByLabel('Record type').selectOption('findings');await detail.getByLabel('Find source record').fill('Library Access Gap');await detail.getByRole('button',{name:'Library Access Gap',exact:true}).click();
    await expect(detail.getByRole('button',{name:'Unlink',exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grc_interactive_demo_v3')).evidence.filter(e=>e.filename==='q2-library.txt').length),1);
    await detail.getByRole('button',{name:'Unlink',exact:true}).click();await expect(detail.getByRole('button',{name:'Unlink',exact:true})).toHaveCount(0);
    await detail.getByRole('button',{name:'Overview',exact:true}).click();const downloadPromise=page.waitForEvent('download');await detail.getByRole('button',{name:'Download file',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'q2-library.txt');assert.equal(await download.failure(),null);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Evidence Library',exact:true}).click();
    await page.getByRole('button',{name:/^Policies \d+ files$/}).click();await page.getByRole('button',{name:'Library Risk Management Policy',exact:true}).click();await expect(page.getByRole('button',{name:'policy-library.txt',exact:true})).toBeVisible();await page.getByRole('button',{name:'Open Policy',exact:true}).click();await expect(page.getByTestId('policies-drawer')).toBeVisible();await page.getByTestId('drawer-close').click();
    await page.getByRole('button',{name:'Evidence Library',exact:true}).click();await page.getByRole('button',{name:'Add Evidence',exact:true}).click();detail=page.getByRole('dialog').last();await detail.getByTestId('evidence-file-input').setInputFiles({name:'unassigned-library.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic unassigned')});await detail.getByLabel('Evidence Type',{exact:true}).selectOption('Report');await detail.getByRole('button',{name:'Upload Evidence',exact:true}).click();
    await page.getByRole('button',{name:/^Needs Classification \d+ files$/}).click();await expect(page.getByRole('button',{name:'unassigned-library.txt',exact:true})).toBeVisible();await page.getByRole('button',{name:'unassigned-library.txt',exact:true}).click();detail=page.getByRole('dialog').last();await detail.getByRole('button',{name:'Related',exact:true}).click();await detail.getByText('Link another record',{exact:true}).click();await detail.getByRole('button',{name:'Library Access Gap',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'unassigned-library.txt',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Evidence Library',exact:true}).click();
    for(const width of [1440,1280,1024,768]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal document overflow at '+width);if(process.env.QA_ARTIFACTS)await page.screenshot({path:require('node:path').join(process.env.QA_ARTIFACTS,'evidence-library-'+width+'.png'),fullPage:true});}
    await page.evaluate(cid=>localStorage.setItem('grc_client_id',cid),scope.other);await page.reload();await page.getByRole('textbox',{name:'Search Evidence',exact:true}).fill('library');await expect(page.getByTestId('evidence-row-0')).toHaveCount(0);
    assert.deepEqual(errors,[]);console.log('PASS: Policy upload/source, four Review occurrence uploads/completions, 2027 sets/2028 clean, one-file supporting link/unlink, completed download, central upload/classification, client switching, four widths. Demo only.');
  }catch(e){console.error('Browser errors:',errors);console.error((await page.locator('body').innerText()).slice(-5000));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
