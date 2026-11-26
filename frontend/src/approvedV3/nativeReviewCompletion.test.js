/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import native from './__fixtures__/sixProgramReview.json';
import {serviceCatalog} from '../lib/r4ServicesTools';

// The separate CMMC snapshot transaction is unrelated to this native Review.
// Review contracts, source events, adapters, and version checks remain real.
jest.mock('./cmmcCommands',()=>({applyCmmcChanges:async()=>({handled:{}}),overlayCmmcWorkbook:()=>{}}));
global.window={};
const {startNativeWorkspace}=require('./nativeWorkspace');
delete global.window;
const clone=value=>JSON.parse(JSON.stringify(value));
const wire=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));
function recordsAt(changes){
  const records=clone(native.records);
  for(const [table,rows] of Object.entries(changes)){
    if(table==='reviews'){
      const changed=new Map(rows.map(row=>[row.review_id,row]));
      records.reviews=records.reviews.map(row=>changed.get(row.review_id)||row);
    }else records[table]=rows;
  }
  return records;
}
const cases=[{label:'after six answers',native:{...native,after_records:recordsAt(native.after)},exerciseSetup:true},
  {label:'before answering the next occurrence',native:{...native,...native.control,
    records:recordsAt(native.control.records),after_records:recordsAt(native.control.after)},exerciseSetup:false}];

function openPage(){
  const root=path.join(__dirname,'../../..');
  const source=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  return new JSDOM(source.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#client-'+native.client.id+'-reviews',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

test.each(cases)('SPM chosen $label retains native answers and the six-program Review completes without staling its own form',async({native,exerciseSetup})=>{
  const dom=openPage(),savedGlobals=new Map();
  for(const key of ['window','document','sessionStorage','localStorage','HTMLInputElement']){
    savedGlobals.set(key,Object.getOwnPropertyDescriptor(global,key));
    Object.defineProperty(global,key,{value:dom.window[key],configurable:true,writable:true});
  }
  try{
    const sourceId=native.client.id,cid=native.records.clients[0].client_id,rid=native.completion.review.review_id;
    let serverRecords=clone(native.records),setup=clone(exerciseSetup?native.before_setup.setup:native.setup),
      guide=clone(exerciseSetup?native.before_setup.guide:native.guide),completed=false;
    if(exerciseSetup){
      serverRecords.clients[0]=clone(native.before_setup.client);
      serverRecords.reviews=serverRecords.reviews.map(row=>row.review_id===rid?clone(native.before_setup.review):row);
      serverRecords.audit_logs=clone(native.before_setup.audit_logs);
    }
    const nativePage=dom.window.GoverNaraNativePage,source=nativePage.snapshot();source.clients=[clone(native.client)];
    const writes=[],persisted=[];
    const api={get:jest.fn(async(endpoint,options)=>{
      if(endpoint.endsWith('/bootstrap'))return {data:{initialized:true,source_state:source,records:{[cid]:clone(serverRecords)},drafts:{},actor:clone(native.actor)}};
      if(endpoint==='/auth/me')return {data:clone(native.actor)};
      if(endpoint==='/users')return {data:[clone(native.actor)]};
      if(endpoint==='/service-catalog')return {data:serviceCatalog};
      if(endpoint==='/evidence/catalog')return {data:clone(native.catalog)};
      if(endpoint==='/frameworks/cmmc/workbook')return {data:{client:{client_id:cid},records:{client_id:cid}}};
      if(endpoint.endsWith('/records'))return {data:{client_id:cid,records:clone(serverRecords)}};
      if(endpoint==='/reviews/'+rid+'/completion-guide')return {data:clone(guide)};
      if(endpoint==='/clients/'+cid+'/iv-setup')return {data:clone(setup)};
      throw Error('Unexpected read '+endpoint);
    }),post:jest.fn(async(endpoint,body)=>{
      writes.push({endpoint,body:clone(body)});
      if(endpoint==='/clients/'+cid+'/iv-setup/exclusion/'+encodeURIComponent(native.before_setup.setup.activities.find(activity=>activity.review_id===rid).activity_id)){
        expect(body.excluded).toBe(true);expect(body.kind).toBe('spm');
        expect(body.expected_updated_at).toBe(native.before_setup.review.updated_at);
        serverRecords=clone(native.records);setup=clone(native.setup);guide=clone(native.guide);
        return {data:{ok:true}};
      }
      if(endpoint==='/reviews/'+rid+'/complete'){
        expect(body.checklist).toEqual(native.accepted_request.checklist);
        expect(body.expected_updated_at).toBe(native.accepted_request.expected_updated_at);
        expect(body.occurrence_id).toBe(native.accepted_request.occurrence_id);
        serverRecords=clone(native.after_records);setup=clone(native.after_setup);completed=true;return {data:clone(native.completion)};
      }
      throw Error('Unexpected write '+endpoint);
    }),patch:jest.fn(async endpoint=>{throw Error('Unexpected patch '+endpoint);}),
    put:jest.fn(async(endpoint,body)=>{
      writes.push({endpoint,body:clone(body)});
      if(endpoint.endsWith('/view-draft'))return {data:{client_id:cid,revision:body.expected_revision+1,view:body.view}};
      throw Error('Unexpected write '+endpoint);
    })};
    const page={...nativePage,snapshot:()=>wire(nativePage.snapshot()),apply:(state,reconcile)=>nativePage.apply(wire(state),reconcile),
      configure:options=>nativePage.configure({...options,persist:(state,...args)=>{
        const snapshot=wire(state),review=snapshot.work[sourceId]?.revs.find(row=>row.id===rid);
        persisted.push({noTicket:review?.noTicket,answers:Object.values(snapshot.checklists||{}).map(check=>Object.keys(check.st||{}).length)});
        return options.persist(snapshot,...args);
      }})};
    const controller=await startNativeWorkspace(page,api),document=dom.window.document;
    const tick=()=>new Promise(resolve=>dom.window.setTimeout(resolve,0));
    async function until(check){for(let i=0;i<30;i++){if(check())return;await tick();}expect(check()).toBe(true);}
    async function drain(){for(let i=0;i<6;i++){await tick();await controller.flush();if(!document.body.hasAttribute('aria-busy'))return;}expect(document.body.hasAttribute('aria-busy')).toBe(false);}
    expect(page.snapshot().clients[0].progs).toHaveLength(6);
    const search=document.getElementById('rev-q');search.value='Enterprise Asset Inventory Review';
    search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await drain();
    document.querySelector('[data-action="open-rev"][data-id="'+rid+'"]').click();
    await until(()=>!document.getElementById('drawer').hidden);await drain();
    const checkbox=document.querySelector('[data-rck-noticket="'+rid+'"]');
    expect(checkbox.checked).toBe(!exerciseSetup);
    if(exerciseSetup){
      checkbox.click();await drain();
      expect(persisted.some(snapshot=>snapshot.noTicket===true)).toBe(true);
      expect(writes.filter(write=>write.endpoint.includes('/iv-setup/exclusion/'))).toHaveLength(1);
    }
    expect(document.querySelector('[data-rck-noticket="'+rid+'"]').checked).toBe(true);
    expect(Object.values(page.snapshot().checklists).find(check=>check.nativeContractToken===native.guide.contract_token).st).toEqual(Object.fromEntries(native.guide.steps.map((_,i)=>[i,'N/A'])));
    const beforeConfirm=writes.length;
    document.querySelector('#drawer [data-action="rev-complete-dlg"]').click();
    await until(()=>!document.getElementById('dlg-scrim').hidden);await drain();
    expect(writes).toHaveLength(beforeConfirm);
    document.getElementById('f-notes').value=native.accepted_request.completion_notes;
    document.getElementById('f-supportingReference').value=native.accepted_request.supporting_reference;
    document.querySelector('#dlg [data-action="dlg-run"]').click();await drain();
    expect(completed).toBe(true);
    expect(writes.filter(write=>write.endpoint.endsWith('/complete'))).toHaveLength(1);
    expect(document.getElementById('dlg-scrim').hidden).toBe(true);
    expect(page.snapshot().work[sourceId].hist.some(row=>row.nativeOccurrenceId===native.guide.occurrence_id)).toBe(true);
  }finally{
    dom.window.close();
    for(const [key,descriptor] of savedGlobals)if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];
  }
},90000);
