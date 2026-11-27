/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import fixture from '../../../shared/fixtures/approvedV3Scenario.json';
import {cmmcWorkbookRequest} from '../preview/cmmcWorkbook';

global.window={};
const {startNativeWorkspace,workspaceMaterial}=require('./nativeWorkspace');
delete global.window;

const clone=value=>JSON.parse(JSON.stringify(value));
const wire=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));

function openPage(){
  const root=path.join(__dirname,'../../..');
  const source=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  return new JSDOM(source.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

test('native routing suppresses prototype notices and returns from every client profile on one Portfolio click',async()=>{
  const dom=openPage(),savedGlobals=new Map();
  for(const key of ['window','document','sessionStorage','localStorage','HTMLInputElement']){
    savedGlobals.set(key,Object.getOwnPropertyDescriptor(global,key));
    Object.defineProperty(global,key,{value:dom.window[key],configurable:true,writable:true});
  }
  try{
    const actor={user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin',status:'active'};
    const tables=clone(fixture.records);
    tables.users.forEach(user=>Object.assign(user,{reference_only:true,assignment_eligible:false,status:'reference_only'}));
    tables.users.push(actor);tables.audit_logs=[];tables.approved_v3_guidance=[];
    const records=Object.fromEntries(tables.clients.map(client=>[client.client_id,
      Object.fromEntries(Object.entries(tables).map(([kind,rows])=>[kind,kind==='users'?rows:rows.filter(row=>row.client_id===client.client_id)]))]));
    const packet={initialized:true,source_state:clone(fixture.source_state),records,drafts:{},actor};
    const workbookDb={...tables,user:actor,logs:[],baselines:Object.fromEntries(tables.clients.map(client=>[client.client_id,{completed:true}]))};
    const writes=[];
    const api={get:jest.fn(async(endpoint,options)=>{
      if(endpoint.endsWith('/bootstrap'))return {data:clone(packet)};
      if(endpoint==='/auth/me')return {data:clone(actor)};
      if(endpoint==='/users')return {data:[clone(actor)]};
      if(endpoint==='/service-catalog')return {data:{tools:[]}};
      if(endpoint==='/evidence/catalog')return {data:{items:[],total:0,page_size:100}};
      if(endpoint.endsWith('/iv-setup')){const cid=endpoint.split('/')[2];return {data:{client_id:cid,expected_client_updated_at:records[cid].clients[0].updated_at??null,activities:[]}};}
      if(endpoint==='/frameworks/cmmc/workbook')return {data:cmmcWorkbookRequest(workbookDb,'get',options.params,{})};
      if(endpoint.endsWith('/records'))return {data:{client_id:options.params.client_id,records:clone(records[options.params.client_id])}};
      throw Error('Unexpected read '+endpoint);
    })};
    for(const method of ['post','put','patch','delete'])api[method]=jest.fn(async(endpoint,body)=>{
      writes.push({method,endpoint,body});throw Error('Read-only navigation attempted a native write');
    });
    const nativePage=dom.window.GoverNaraNativePage;
    const page={...nativePage,snapshot:()=>wire(nativePage.snapshot()),apply:(state,reconcile)=>nativePage.apply(wire(state),reconcile),
      configure:options=>nativePage.configure({...options,persist:(state,...args)=>options.persist(wire(state),...args)})};
    const errors=[];dom.window.addEventListener('error',event=>errors.push(event.error?.message||event.message));
    const controller=await startNativeWorkspace(page,api),document=dom.window.document;
    const material=workspaceMaterial(page.snapshot()),notice=document.getElementById('demo-strip');
    const tick=()=>new Promise(resolve=>dom.window.setTimeout(resolve,0));
    async function rendered(hash,view,ready=()=>true){
      for(let i=0;i<12;i++){
        if(dom.window.location.hash===hash&&!document.getElementById(view).hidden&&ready())return;
        await tick();
      }
      expect({hash:dom.window.location.hash,view,hidden:document.getElementById(view).hidden}).toEqual({hash,view,hidden:false});
    }
    document.querySelector('#side-global [href="#client-management"]').click();
    await rendered('#client-management','v-client-management');
    expect(document.getElementById('demo-strip')).toBe(notice);
    expect(notice.hidden).toBe(false); // The original renderer still sets its prototype attribute.
    expect(notice.style.display).toBe('none');
    document.querySelector('#side-global [href="#portfolio"]').click();await rendered('#portfolio','v-portfolio');
    const profileTabs=['overview','organization','technical','security','services','program','people'];
    for(const [index,client] of packet.source_state.clients.entries()){
      document.querySelector('#nav-clients [href^="#client-'+client.id+'"]').click();
      await rendered('#client-'+client.id,'v-client',()=>page.context().sourceId===client.id);
      document.querySelector('#side-client [href="#client-'+client.id+'-profile"]').click();
      await rendered('#client-'+client.id+'-profile','v-client',()=>document.querySelector('#v-client .page-title')?.textContent===client.name+' Client Profile');
      expect(document.querySelector('#v-client .page-title').textContent).toBe(client.name+' Client Profile');
      const tab=profileTabs[index%profileTabs.length];
      document.querySelector('#v-client [role="tab"][data-action="prof-tab"][data-val="'+tab+'"]').click();
      expect(document.querySelector('#v-client [role="tab"][data-val="'+tab+'"]').getAttribute('aria-selected')).toBe('true');
      const portfolio=document.querySelector('#side-client [href="#portfolio"]');
      expect(document.body.hasAttribute('aria-busy')).toBe(false);
      portfolio.click();await rendered('#portfolio','v-portfolio');
      expect(document.getElementById('side-global').hidden).toBe(false);
      expect(document.getElementById('demo-strip')).toBe(notice);
      expect(notice.style.display).toBe('none');
      await controller.flush();
      expect({client:client.id,businessChanged:workspaceMaterial(page.snapshot())!==material}).toEqual({client:client.id,businessChanged:false});
    }
    expect(errors).toEqual([]);expect(writes).toEqual([]);
  }finally{
    dom.window.close();
    for(const [key,descriptor] of savedGlobals)if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];
  }
},90000);
