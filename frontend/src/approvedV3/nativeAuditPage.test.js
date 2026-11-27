/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {overlayNativeAudit} from './auditProjection';

const clone=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));
let dom,page,document,base,persist,command;
beforeAll(()=>{
  const root=path.join(__dirname,'../../..');
  const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  dom=new JSDOM(html.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\nwindow.auditRowsForQA=function(){return auditFiltered();};\nif (!location.hash)'),{
    url:'https://governara.example.test/#audit-log',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  page=dom.window.GoverNaraNativePage;document=dom.window.document;base=page.snapshot();
});
afterAll(()=>dom.window.close());
const actor={user_id:'qa-native-operator',name:'QA Operator',email:'operator@example.test',role:'super_admin',status:'active'};
function stateWithEvents(count=125){
  const state=clone(base),now=Date.now();state.audit=[];state.activity={};
  state.users.unshift({id:'qa-reference',name:actor.name,email:'reference@example.test',role:'owner',clients:['brawndo'],status:'Active'});
  state.users.unshift({id:actor.user_id,name:actor.name,email:'source-id-collision@example.test',role:'owner',clients:['brawndo'],status:'Active'});
  state.users.push({id:actor.user_id,nativeUserId:actor.user_id,name:actor.name,email:actor.email,role:'owner',clients:['brawndo'],status:'Active'});
  const records={audit_logs:Array.from({length:count},(_,index)=>({log_id:'native-'+index,client_id:'native-brawndo',
    user_id:actor.user_id,user_name:actor.name,at:new Date(now-index*1000).toISOString(),action:index===2?'prepare-export':'update',
    entity_type:'client',entity_id:'native-record-'+index,entity_name:'Native record '+index,...(index===0?{outcome:'success'}:{})}))};
  overlayNativeAudit(state,records,{clientId:'native-brawndo',sourceId:'brawndo',userName:()=>actor.name});
  return state;
}
function filter(key,value){const input=document.getElementById('al-'+key);input.value=value;input.dispatchEvent(new dom.window.Event(key==='q'?'input':'change',{bubbles:true}));}
function rows(){return [...document.querySelectorAll('#al-table .gt-row')];}
function footer(){return document.querySelector('#al-table .gt-foot').textContent;}
function go(value){document.querySelector('#al-table [data-action="native-audit-page"][data-val="'+value+'"]').click();}
beforeEach(()=>{
  persist=jest.fn(()=>true);command=jest.fn();page.configure({busy:()=>false,persist,command});
  const state=stateWithEvents();page.actor(actor,state.clients.map(row=>row.id));page.apply(clone(state));
  filter('range','all');filter('client','all');filter('user','all');filter('action','all');filter('entity','all');filter('q','');
  filter('q','Reset page');filter('q','');
  persist.mockClear();command.mockClear();
});

test('pages the loaded filtered rows with accurate counts and exact View identities, without saving or fetching',()=>{
  const seen=[];
  for(const [pageNumber,count] of [[1,50],[2,50],[3,25]]){
    if(pageNumber>1)go(pageNumber);
    expect(rows()).toHaveLength(count);expect(footer()).toContain('of 125 loaded events');expect(footer()).toContain('Page '+pageNumber+' of 3');
    seen.push(...rows().map(row=>row.querySelector('[data-action="al-view"]').dataset.i));
  }
  expect(new Set(seen).size).toBe(125);
  expect(document.querySelector('[data-action="native-audit-page"][data-val="4"]').disabled).toBe(true);
  go(2);expect(rows()[0].textContent).toContain('Native record 50');
  rows()[0].querySelector('[data-action="al-view"]').click();
  expect(document.querySelector('#drawer .code').textContent).toContain('native-50');
  document.querySelector('#drawer [data-action="drawer-close"]').click();
  expect(persist).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();
});

test('filter/search changes reset the page and audit-only refresh clamps it while retaining filters and all CSV rows',()=>{
  go(2);go(3);filter('action','prepare-export');expect(rows()).toHaveLength(1);expect(footer()).toContain('Page 1 of 1');
  filter('action','all');go(2);filter('q','Native record 12');expect(rows()).toHaveLength(6);expect(footer()).toContain('Page 1 of 1');
  filter('q','Native record');go(2);go(3);
  const fewer=stateWithEvents(55);page.audit(clone(fewer.audit),clone(fewer.activity));
  expect(rows()).toHaveLength(5);expect(footer()).toContain('Page 2 of 2');expect(footer()).toContain('of 55 loaded events');
  expect(document.getElementById('al-action').value).toBe('all');
  expect(document.getElementById('al-q').value).toBe('Native record');
  expect(page.snapshot().audit).toHaveLength(55);
  expect(dom.window.auditRowsForQA()).toHaveLength(55);
  const empty=stateWithEvents(0);page.audit(clone(empty.audit),clone(empty.activity));
  expect(rows()).toHaveLength(0);expect(footer()).toContain('Showing 0 loaded events');expect(footer()).toContain('Page 1 of 1');
  expect([...document.querySelectorAll('[data-action="native-audit-page"]')].every(button=>button.disabled)).toBe(true);
  expect(persist).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();
});

test('native drawer uses actual IDs/outcome and verified actor email; missing payload details remain unavailable',()=>{
  expect(rows()[0].children[2].textContent).toContain(actor.email);
  expect(rows()[0].children[2].textContent).not.toContain('reference@example.test');
  expect(rows()[0].children[2].textContent).not.toContain('source-id-collision@example.test');
  rows()[0].querySelector('[data-action="al-view"]').click();
  const drawer=document.getElementById('drawer'),details=Object.fromEntries([...drawer.querySelectorAll('dt')].map(term=>[term.textContent,term.nextElementSibling.textContent]));
  expect(details['CLIENT ID']).toBe('native-brawndo');expect(details.OUTCOME).toBe('success');expect(details['RAW CODE']).toBe('update');
  const metadata=JSON.parse(drawer.querySelector('.code').textContent);
  expect(metadata).toMatchObject({native:true,log_id:'native-0',client_id:'native-brawndo',user_id:actor.user_id,entity_type:'client',entity_id:'native-record-0'});
  expect(metadata).not.toHaveProperty('simulated');expect(metadata).not.toHaveProperty('payload');
  expect(drawer.textContent).not.toContain('demo_brawndo');expect(drawer.textContent).not.toContain('reference@example.test');
  expect(drawer.textContent).not.toContain('source-id-collision@example.test');
  expect(drawer.querySelector('.m-head .sub').textContent).toMatch(/summary.*Existing records/);
  document.querySelector('#drawer [data-action="drawer-close"]').click();
  rows()[1].querySelector('[data-action="al-view"]').click();
  expect([...drawer.querySelectorAll('dt')].find(term=>term.textContent==='OUTCOME').nextElementSibling.textContent).toBe('Not included in this summary');
});

test('reference events retain their supplied history and original reference drawer',()=>{
  const state=stateWithEvents(0);state.audit=[{i:0,t:{$date:new Date().toISOString()},client:'brawndo',user:'Reference operator',
    action:'Reference decision',entity:'Clients',title:'Approved reference history',eid:'reference-id'}];
  page.audit(state.audit,state.activity);
  rows()[0].querySelector('[data-action="al-view"]').click();
  const metadata=JSON.parse(document.querySelector('#drawer .code').textContent);
  expect(metadata).toMatchObject({simulated:true,title:'Approved reference history',by_name:'Reference operator'});
  expect(page.snapshot().audit).toHaveLength(1);expect(page.snapshot().audit[0].native).toBeUndefined();
});
