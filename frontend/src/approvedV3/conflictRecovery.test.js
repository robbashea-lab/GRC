/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import fixture from '../../../shared/fixtures/approvedV3Scenario.json';
import {applyGlobalChanges,overlayGlobalRecords} from './adminCommands';
import {setupActivities} from '../preview/r4ServicesTools';

// Import the controller without automatically starting its browser entry point.
global.window={};
const {startNativeWorkspace,reconcileView}=require('./nativeWorkspace');
delete global.window;

const clone=value=>JSON.parse(JSON.stringify(value));
// The test's controller and source document use separate JS realms. Preserve
// dates with the application's existing wire envelope at that test boundary.
const wire=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));

function openPage(route='client-brawndo-policies'){
  const root=path.join(__dirname,'../../..');
  const source=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  return new JSDOM(source.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#'+route,runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

test('a recovered conflict retains the operator draft without silently replacing the newer native value on retry',async()=>{
  const dom=openPage(),savedGlobals=new Map();
  for(const key of ['window','document','sessionStorage','localStorage','HTMLInputElement']){
    savedGlobals.set(key,Object.getOwnPropertyDescriptor(global,key));
    Object.defineProperty(global,key,{value:dom.window[key],configurable:true,writable:true});
  }
  try{
    const clientId='v3sample_brawndo',actor={user_id:'operator',name:'Operator',email:'operator@example.test',role:'super_admin',status:'active'};
    const source=clone(fixture.source_state);source.clients=source.clients.filter(row=>row.id==='brawndo');
    const records=Object.fromEntries(Object.entries(clone(fixture.records)).map(([key,rows])=>[key,
      rows.filter(row=>key==='users'?row.client_ids?.includes(clientId):row.client_id===clientId)]));
    records.users.forEach(user=>Object.assign(user,{reference_only:true,assignment_eligible:false,status:'reference_only'}));
    records.users.push(actor);records.audit_logs=[];records.approved_v3_guidance=[];
    const policy=records.policies[0];policy.summary='Original saved description';policy.updated_at='policy-v1';
    const packet={initialized:true,source_state:source,records:{[clientId]:records},drafts:{},actor};
    const writes=[];
    const api={get:jest.fn(async endpoint=>{
      if(endpoint.endsWith('/bootstrap'))return {data:clone(packet)};
      if(endpoint==='/auth/me')return {data:clone(actor)};
      if(endpoint==='/users')return {data:[clone(actor)]};
      if(endpoint==='/service-catalog')return {data:{tools:[]}};
      if(endpoint==='/evidence/catalog')return {data:{items:[],total:0,page_size:100}};
      if(endpoint==='/clients/'+clientId+'/iv-setup'){
        const client=records.clients.find(row=>row.client_id===clientId),activities=setupActivities(records,client);
        return {data:{client_id:clientId,expected_client_updated_at:client.updated_at??null,activities,
          outstanding_count:activities.filter(row=>row.provider_relevant&&!row.internal&&['todo','decide'].includes(row.state)).length}};
      }
      if(endpoint.endsWith('/records'))return {data:{client_id:clientId,records:clone(records)}};
      throw Error('Unexpected read '+endpoint);
    }),patch:jest.fn(async(endpoint,body)=>{
      expect(endpoint).toBe('/policies/'+policy.policy_id);
      writes.push(clone(body));
      if(writes.length===1){
        policy.summary='A concurrent saved description';policy.updated_at='policy-v2';
        throw Object.assign(Error('Record changed. Reload before saving.'),{response:{status:409,data:{detail:'Record changed. Reload before saving.'}}});
      }
      expect(body.expected_updated_at).toBe(policy.updated_at);
      Object.assign(policy,body,{updated_at:'policy-v3'});delete policy.expected_updated_at;
      return {data:clone(policy)};
    }),put:jest.fn(async(_,body)=>({data:{client_id:clientId,revision:body.expected_revision+1,view:body.view}})),post:jest.fn()};
    const nativePage=dom.window.GoverNaraNativePage;
    const page={...nativePage,snapshot:()=>wire(nativePage.snapshot()),apply:(state,reconcile)=>nativePage.apply(wire(state),reconcile),
      configure:options=>nativePage.configure({...options,persist:(state,...args)=>options.persist(wire(state),...args)})};
    const controller=await startNativeWorkspace(page,api);
    const name=page.snapshot().programs.brawndo.pols.find(row=>row.wfId===policy.source_record_id).name;
    const open=[...dom.window.document.querySelectorAll('[data-action="open-pol"]')].find(node=>node.dataset.id===name);
    expect(open).toBeDefined();open.click();
    dom.window.document.querySelector('#drawer [data-action="pol-description"]').click();
    const input=dom.window.document.getElementById('f-description');
    expect(input.value).toBe('Original saved description');input.value='My unsaved operator draft';
    dom.window.document.querySelector('#dlg [data-action="dlg-run"]').click();await controller.flush();
    expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({summary:'My unsaved operator draft',expected_updated_at:'policy-v1'});
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(false);
    expect(input.value).toBe('My unsaved operator draft');
    expect(page.snapshot().programs.brawndo.pols.find(row=>row.wfId===policy.source_record_id).description).toBe('A concurrent saved description');
    dom.window.document.querySelector('#dlg [data-action="dlg-run"]').click();await controller.flush();
    expect(writes).toHaveLength(1);
    expect(policy.summary).toBe('A concurrent saved description');
    expect(dom.window.document.getElementById('fdlg-err').textContent).toMatch(/Reopen this item/);
    expect(input.value).toBe('My unsaved operator draft');
    dom.window.document.querySelector('#dlg [data-action="dlg-close"]').click();
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(true);
    dom.window.document.querySelector('#drawer [data-action="pol-description"]').click();
    const fresh=dom.window.document.getElementById('f-description');
    expect(fresh.value).toBe('A concurrent saved description');fresh.value='Operator reviewed the concurrent description';
    dom.window.document.querySelector('#dlg [data-action="dlg-run"]').click();await controller.flush();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({summary:'Operator reviewed the concurrent description',expected_updated_at:'policy-v2'});
    expect(policy.summary).toBe('Operator reviewed the concurrent description');
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(true);
  }finally{
    dom.window.close();
    for(const [key,descriptor] of savedGlobals)if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];
  }
},30000);

test('a stale direct client-access dialog cannot replace refreshed memberships and Cancel still works',async()=>{
  const dom=openPage('users-access');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot();
    const actor={user_id:'owner',name:'Owner',email:'owner@example.test',role:'super_admin',status:'active'};
    const writer={user_id:'writer',name:'Writer',email:'writer@example.test',role:'client_contributor',status:'active',
      client_ids:['v3sample_brawndo'],updated_at:'user-v1'};
    const identityMaps={clientIds:{brawndo:'v3sample_brawndo',prestige:'v3sample_prestige'}};
    const globals={account:actor,users:[actor,writer],tools:[]};
    const commands=[],persist=jest.fn(()=>true);
    state.users=[];overlayGlobalRecords(state,globals,identityMaps);
    page.configure({busy:()=>false,command:(name,args)=>commands.push({name,args}),persist});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    const before=page.snapshot(),index=before.users.findIndex(user=>user.nativeUserId==='writer');
    dom.window.document.querySelector('[data-action="user-menu"][data-idx="'+index+'"]').click();
    dom.window.document.querySelector('[data-action="u-access"][data-idx="'+index+'"]').click();
    dom.window.document.getElementById('ux-c-brawndo').click();
    dom.window.document.querySelector('#dlg [data-action="save-access"]').click();
    for(let i=0;i<8;i++)await Promise.resolve();
    const api={patch:jest.fn(async()=>{throw Object.assign(Error('Account changed'),{response:{status:409}});})};
    await expect(applyGlobalChanges({before,after:page.snapshot(),globals,actor,api,identityMaps,commands})).rejects.toThrow('Account changed');
    expect(api.patch).toHaveBeenCalledWith('/users/writer/client-memberships',{client_ids:[],expected_updated_at:'user-v1'});
    writer.client_ids=['v3sample_brawndo','v3sample_prestige'];writer.updated_at='user-v2';
    const recovered=overlayGlobalRecords(wire(before),globals,identityMaps);
    page.actor(actor,recovered.clients.map(client=>client.id));page.apply(recovered,reconcileView);page.finish(false,'Account changed');
    expect(dom.window.document.getElementById('ux-c-brawndo').checked).toBe(false);
    commands.length=0;persist.mockClear();
    dom.window.document.querySelector('#dlg [data-action="save-access"]').click();
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(commands).toEqual([]);expect(persist).not.toHaveBeenCalled();
    expect(page.snapshot().users.find(user=>user.nativeUserId==='writer')).toMatchObject({clients:['brawndo','prestige'],nativeUpdatedAt:'user-v2'});
    expect(dom.window.document.getElementById('ux-c-brawndo').checked).toBe(false);
    expect(dom.window.document.getElementById('toast-msg').textContent).toMatch(/Reopen this item/);
    dom.window.document.querySelector('#dlg [data-action="dlg-close"]').click();
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(true);
  }finally{dom.window.close();}
},30000);

test('refreshing saved records does not block an existing read-only evidence download dialog',async()=>{
  const dom=openPage('client-prestige-evidence');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot(),download=jest.fn(async()=>({downloaded:false,message:'No stored files'}));
    page.configure({busy:()=>false,command:()=>{},persist:()=>true,downloadEvidenceArchive:download});
    page.actor({user_id:'owner',name:'Owner',email:'owner@example.test',role:'super_admin'},state.clients.map(client=>client.id));
    page.apply(state);
    dom.window.document.querySelector('#v-client [data-action="ev-zip"][data-val="__all"]').click();
    page.apply(page.snapshot(),reconcileView);
    dom.window.document.querySelector('#dlg [data-action="ev-zip-go"]').click();
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(download.mock.calls).toEqual([['prestige','__all']]);
  }finally{dom.window.close();}
},30000);
