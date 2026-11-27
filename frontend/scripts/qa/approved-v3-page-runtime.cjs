'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require('jsdom');

// The backend test passes the production-generated signed-in document over stdin.
// JS assets do not load from the network. Every record here is an in-memory copy.
const html = fs.readFileSync(0,'utf8');
const demoKey = 'governara.audit-report-preview.v1';
const storageCalls = [];
const dom = new JSDOM(html,{
  url:'https://governara.example.test/clients#client-brawndo-policies',
  runScripts:'dangerously',virtualConsole:new VirtualConsole(),
  beforeParse(window){
    window.scrollTo=()=>{};
    window.localStorage.setItem(demoKey,'retained offline work');
    window.localStorage.setItem('governara.appearance.v2',JSON.stringify({theme:'teal',mode:'dark'}));
    for(const method of ['getItem','setItem','removeItem']){
      const native=window.Storage.prototype[method];
      window.Storage.prototype[method]=function(key,...args){
        if(key===demoKey)storageCalls.push(method);
        return native.call(this,key,...args);
      };
    }
  },
});

const {window}=dom,{document,GoverNaraNativePage:page}=window;
const field=id=>document.getElementById(id);
const loadingRule=()=>field('native-workspace-loading')?.sheet.cssRules[0];
const click=(action,id)=>{
  const button=document.createElement('button');
  button.dataset.action=action;
  if(id)button.dataset.id=id;
  document.body.appendChild(button);button.click();button.remove();
};
const delay=()=>new Promise(resolve=>window.setTimeout(resolve,20));

async function check(){
  assert.equal(loadingRule()?.selectorText,'body');
  assert.equal(loadingRule()?.style.visibility,'hidden');
  const loading = field('native-workspace-status');
  assert.ok(loading, 'Authorized startup must show persistent loading feedback');
  const statusRule = field('native-workspace-loading').sheet.cssRules[1];
  assert.equal(statusRule.selectorText, '#native-workspace-status');
  assert.equal(statusRule.style.visibility, 'visible');
  assert.equal(loading.querySelector('[role="status"]').textContent, 'Loading saved workspace…');
  assert.equal(loading.querySelector('a[href="/existing"]').textContent, 'Open Existing records');
  assert.deepEqual(storageCalls,[]);
  // Load the same session/appearance script the native document references.
  window.eval(fs.readFileSync('public/staging-workspace.js','utf8'));
  assert.equal(document.documentElement.dataset.previewTheme,'glass07');
  click('connected-reset-confirm');
  assert.deepEqual(storageCalls,[]);
  assert.equal(loadingRule()?.style.visibility,'hidden');
  const state=page.snapshot();
  const actual={user_id:'real-writer',name:'Same name',email:'writer@example.test',role:'client_contributor'};
  state.users=[
    {id:'reference-exec',name:actual.name,email:'reference@example.test',status:'Reference only',
      role:'owner',referenceOnly:true,clients:'all'},
    {id:'different-admin',nativeUserId:'different-admin',name:actual.name,email:'other@example.test',
      role:'owner',status:'Active',clients:'all'},
  ];
  const captured=[];
  let pending=false;
  let awaitingApprovalSave=false;
  page.configure({busy:()=>pending,command:(name,args)=>{
    captured.push({name,args});
    if(name==='savePolicyApproval')awaitingApprovalSave=true;
  },persist:()=>{
    if(awaitingApprovalSave){pending=true;awaitingApprovalSave=false;}
    return true;
  }});
  page.apply(state);page.actor(actual,['brawndo']);
  assert.equal(loadingRule(),undefined);
  assert.equal(field('native-workspace-status'),null);
  assert.notEqual(document.body.style.visibility,'hidden');
  assert.equal(page.context().sourceId,'brawndo');
  // Source governance authorization must choose the signed-in ID even when a
  // reference executive and an actual administrator have the same display name.
  const policy=state.programs.brawndo.pols[0],delta='Verified supporting policy during the review.';
  click('pol-approve',policy.wfId);
  field('f-why').value=delta;click('dlg-run');
  assert.match(field('fdlg-err').textContent,/permission/i);
  assert.equal(field('dlg-scrim').hidden,false);
  assert.ok(!captured.some(c=>c.name==='savePolicyApproval'));
  page.actor({...actual,role:'super_admin'},['brawndo']);
  click('dlg-run');
  assert.equal(pending,true);
  assert.equal(field('dlg-scrim').hidden,false);
  assert.equal(captured.filter(c=>c.name==='savePolicyApproval').length,1);
  // Reconciliation after a failed native save must retain the open form. A
  // subsequent confirmed native success may close it.
  page.apply(state);page.actor({...actual,role:'super_admin'},['brawndo']);
  page.finish(false,'The policy changed. Review the saved record.');
  assert.equal(field('dlg-scrim').hidden,false);
  assert.equal(field('f-why').value,delta);
  pending=false;
  click('dlg-close');
  click('pol-approve',policy.wfId);
  field('f-why').value=delta;click('dlg-run');
  assert.equal(pending,true);
  page.finish(true,'Policy approved.');pending=false;
  assert.equal(field('dlg-scrim').hidden,true);
  click('demo-storage');click('connected-reset');click('connected-reset-confirm');
  await delay();
  assert.deepEqual(storageCalls,[]);
  page.fail('Sign in again to verify your access.');
  assert.equal(document.body.style.visibility,'hidden');
  const recovery=document.body.lastElementChild;
  assert.equal(recovery.style.visibility,'visible');
  assert.equal(recovery.querySelector('a[href="/existing"]').textContent,'Open Existing records');
}

const open = href => new JSDOM(html, {
  url: 'https://governara.example.test' + href, runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
  beforeParse(browser) { browser.scrollTo = () => {}; },
});

async function checkPortfolioEntry() {
  const portfolio = open('/clients');
  try {
    const browser = portfolio.window;
    assert.equal(browser.location.hash, '#portfolio');
    assert.equal(browser.history.length, 1, 'The default hash must not add a blank Back destination');
    const page = browser.GoverNaraNativePage;
    page.apply(page.snapshot());
    assert.equal(browser.document.getElementById('v-portfolio').hidden, false);
    assert.match(browser.document.getElementById('v-portfolio').textContent, /Brawndo/);
  } finally {
    portfolio.window.close();
  }
}

async function checkFrameworkNavigation() {
  function defaultToHipaa(page) {
    const state = page.snapshot();
    const client = state.clients.find(row => row.id === 'cyberdyne');
    const hipaa = state.clients.find(row => row.id === 'ppth').progs.find(program => program.k === 'hipaa');
    client.progs.unshift(hipaa);
    client.activeProg = 'hipaa';
    page.apply(state);
  }
  const first = open('/clients#client-cyberdyne');
  let reopened;
  try {
    const browser = first.window;
    const page = browser.GoverNaraNativePage;
    defaultToHipaa(page);

    const link = browser.document.querySelector('#side-client a[data-val="cmmc"]');
    assert.ok(link, 'The multi-framework client renders its CMMC Level 2 link');
    link.click();
    await new Promise(resolve => browser.setTimeout(resolve, 20));
    assert.equal(page.context().program, 'cmmc');

    reopened = open(browser.location.pathname + browser.location.hash);
    const reloadedPage = reopened.window.GoverNaraNativePage;
    defaultToHipaa(reloadedPage);
    assert.equal(reloadedPage.context().program, 'cmmc', 'Fresh boot preserves the selected framework');
    assert.equal(reloadedPage.context().sourceId, 'cyberdyne');
    assert.equal(link.getAttribute('href'), '#client-cyberdyne-program?framework=cmmc');

    reopened.window.location.hash = '#client-cyberdyne-item-3.1.4?framework=cmmc';
    await new Promise(resolve => reopened.window.setTimeout(resolve, 20));
    assert.match(reopened.window.document.getElementById('v-client').textContent, /Separate the duties/i);
    assert.equal(reloadedPage.context().program, 'cmmc');
    reopened.window.location.hash = '#client-cyberdyne-item-3.1.4?framework=hipaa';
    await new Promise(resolve => reopened.window.setTimeout(resolve, 20));
    assert.equal(reopened.window.location.hash, '#client-cyberdyne-program?framework=hipaa');
    assert.doesNotMatch(reopened.window.document.getElementById('v-client').textContent, /Separate the duties/i);

    browser.history.back();
    await new Promise(resolve => browser.setTimeout(resolve, 20));
    assert.equal(browser.location.hash, '#client-cyberdyne');
    browser.history.forward();
    await new Promise(resolve => browser.setTimeout(resolve, 20));
    assert.equal(browser.location.hash, '#client-cyberdyne-program?framework=cmmc');
    assert.equal(page.context().program, 'cmmc');
  } finally {
    first.window.close();
    reopened?.window.close();
  }
}

Promise.allSettled([check(), checkPortfolioEntry(), checkFrameworkNavigation()]).then(results => {
  for (const result of results) if (result.status === 'rejected') {
    console.error(result.reason);
    process.exitCode = 1;
  }
}).finally(() => window.close());
