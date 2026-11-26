import catalog from '@catalogs/cmmc.json';
import {applyCmmcChanges,downloadApprovedCmmc,overlayCmmcWorkbook} from './cmmcCommands';
import {cmmcWorkbookRequest} from '../preview/cmmcWorkbook';
import {unzipSync,strFromU8} from 'fflate';

const copy=v=>JSON.parse(JSON.stringify(v));
const endpoint='/frameworks/cmmc/workbook';
function setup(){
  const sourceId='sample',clientId='native',actor={user_id:'operator',name:'Taylor',role:'super_admin',status:'active'};
  const client={client_id:clientId,source_client_id:sourceId,name:'Example',status:'active',framework_settings:{cmmc:{level:2}}};
  const assessments=catalog.requirements.map(def=>({client_id:clientId,framework_key:'cmmc',framework_version:catalog.version,
    definition_id:def.id,framework_assessment_id:'req-'+def.id,status:'addressed',verification:'verified',related_links:[]}));
  Object.assign(assessments.find(r=>r.definition_id==='3.5.3'),{status:'in_progress',last_saved:'origin',implementation:'MFA gap'});
  const asset={asset_id:'sys-7',source_record_id:'1',client_id:clientId,name:'Enclave',asset_type:'server',location:'HQ'};
  const db={user:actor,users:[actor],clients:[client],assets:[asset],logs:[],
    requirements:[{client_id:clientId,baseline_key:'cmmc',baseline_response:'applies'}],
    baselines:{native:{completed:true}},framework_assessments:assessments};
  const state={clients:[{id:sourceId,progs:[{k:'cmmc',level:2,reg:{items:[{id:'3.5.3',st:'P'}]}}]}],
    records:{sample:{systems:[{sourceRecordId:'1',name:'Enclave',type:'Server',loc:'HQ'}]}},work:{sample:{acts:[],done:[]}}};
  const read=()=>cmmcWorkbookRequest(db,'get',{client_id:clientId},{});
  const records={clients:[client],framework_assessments:assessments,assets:[asset],cmmcWorkbook:read()};
  const ctx={records,clientId,sourceId,identityMaps:{recordIds:{}},userIds:{Taylor:'operator'}};
  overlayCmmcWorkbook(state,records.cmmcWorkbook,ctx);
  const put=jest.fn(async(url,body)=>({data:cmmcWorkbookRequest(db,'put',{},body)}));
  const context={...ctx,before:copy(state),after:copy(state),api:{put,post:jest.fn(),get:jest.fn()},pendingRequests:new Map()};
  return {context,read,db,program:context.after.clients[0].progs[0]};
}
test('all active saved assessments contribute to the native score while untouched gaps and absent draft stay read-only',async()=>{
  const {context,program}=setup();
  expect(program.nativeCmmcReadiness).toMatchObject({total:110,assessed:110,available:true,sspReady:true});
  expect(program.cmmcSsp).toBeUndefined();
  program.cmmcWorkspace={poamEntries:{'3.5.3':{status:'Open',openedAt:'source-display-only',assessment:{points:999},history:[]}}};
  program.nativeCmmcReadiness.value=999;
  expect((await applyCmmcChanges(context)).didWrite).toBe(false);
  expect(context.api.put).not.toHaveBeenCalled();
});
test('SSP scope, inventory classification, POA&M inputs and the scoring exception persist and rehydrate through the workbook',async()=>{
  const {context,program,read}=setup(),asset=JSON.stringify(['Enclave','Server','HQ']);
  program.cmmcSsp={2:{system:'Enclave A',boundary:'Approved boundary',assets:{[asset]:'cui'},assetTreatment:{[asset]:'CUI storage'}}};
  program.cmmcWorkspace={poamEntries:{'3.5.3':{status:'In progress',due:'2027-04-01',milestone:'Complete MFA'}},
    exceptions:{'3.5.3':'remote-privileged-only'},conditionalStatusDate:'2026-03-01',
    posting:{score:73,date:'2026-01-12',scope:'Prior assessed environment',reference:'Dated record'}};
  const result=await applyCmmcChanges(context);
  expect(result.didWrite).toBe(true);
  const requests=context.api.put.mock.calls.map(([path,body])=>{expect(path).toBe(endpoint);return body;});
  expect(requests.map(b=>b.revision)).toEqual([0,1,2,3,4,5]);
  expect(requests.find(b=>b.section==='assets')).toMatchObject({target:'sys-7',values:{category:'cui',treatment:'CUI storage'}});
  expect(requests.find(b=>b.section==='plans')).toMatchObject({target:'3.5.3',assessed_version:'origin',values:{milestone:'Complete MFA',due_date:'2027-04-01'}});
  expect(requests.find(b=>b.section==='posting').values.score).toBe('73');
  const updated=copy(context.before);overlayCmmcWorkbook(updated,read(),context);
  const saved=updated.clients[0].progs[0];
  expect(saved.cmmcSsp[2]).toMatchObject({system:'Enclave A',assets:{[asset]:'cui'},assetTreatment:{[asset]:'CUI storage'}});
  expect(saved.cmmcWorkspace.poamEntries['3.5.3']).toMatchObject({status:'In progress',milestone:'Complete MFA',due:'2027-04-01'});
  expect(saved.cmmcWorkspace.posting.score).toBe(73);expect(saved.nativeCmmcReadiness.value).not.toBe(73);
});
test('SSP date-only history keeps the correct local day, and actual timestamps preserve the saved instant',()=>{
  const {context,read}=setup(),state=copy(context.before),packet=read();
  packet.records.history=[{revision:1,section:'ssp',at:'2026-12-21'}];
  overlayCmmcWorkbook(state,packet,context);
  const draft=()=>state.clients[0].progs[0].cmmcSsp[2];
  expect([draft().savedOn.getDate(),draft().savedOn.getHours()]).toEqual([21,0]);
  packet.records.history[0].at='2026-12-21T08:00:00.000Z';overlayCmmcWorkbook(state,packet,context);
  expect(draft().savedOn.toISOString()).toBe('2026-12-21T08:00:00.000Z');
});

test('closing a genuine POA&M gap needs its own evidence and cannot mark the requirement implemented',async()=>{
  const {context,program,read}=setup();
  program.cmmcWorkspace={poamEntries:{'3.5.3':{status:'Closed',closeout:'Verified correction'}}};
  await expect(applyCmmcChanges(context)).rejects.toThrow(/evidence/);
  expect(read().records.revision).toBe(0);
  program.cmmcWorkspace.poamEntries['3.5.3'].evidence='Verified evidence reference';
  await applyCmmcChanges(context);
  expect(read().records.plans['3.5.3'].status).toBe('Closed');
  expect(read().data.assessments.find(a=>a.definition_id==='3.5.3').status).toBe('in_progress');
});
test('stale workbook version or a foreign workbook cannot overwrite later edits',async()=>{
  const {context,program,db,read}=setup();
  cmmcWorkbookRequest(db,'put',{}, {client_id:'native',level:2,revision:0,request_id:'earlier-editor-001',section:'ssp',target:'',values:{system:'Actual saved name'}});
  program.cmmcSsp={2:{system:'Stale edit'}};
  await expect(applyCmmcChanges(context)).rejects.toThrow(/changed/);
  expect(read().records.ssp.system).toBe('Actual saved name');
  context.records.cmmcWorkbook.client.client_id='other';
  await expect(applyCmmcChanges(context)).rejects.toThrow(/client and level/);
});
test('uncertain retries reuse the exact request and its original version',async()=>{
  const {context,program,db,read}=setup();program.cmmcSsp={2:{system:'Actual name'}};
  context.api.put.mockImplementationOnce(async(path,body)=>{cmmcWorkbookRequest(db,'put',{},body);throw Error('Response interrupted');});
  await expect(applyCmmcChanges(context)).rejects.toThrow(/interrupted/);
  await applyCmmcChanges(context);
  expect(context.api.put.mock.calls[0]).toEqual(context.api.put.mock.calls[1]);
  expect(read().records.revision).toBe(1);
});
test('a corrective action is created once on the selected requirement and binds its native finding and task',async()=>{
  const {context}=setup();
  context.after.work.sample.acts.push({id:'a1',title:'Complete MFA',owner:'Taylor',pri:'High',due:{$date:'2027-01-13T08:00:00Z'},detail:'Rollout plan',
    fromItem:'3.5.3',fromProgram:'cmmc:800171r2',source:'CMMC POA&M'});
  const finding={client_id:'native',finding_id:'f1',framework_assessment_id:'req-3.5.3'};
  context.api.post.mockResolvedValue({data:finding});
  context.api.get.mockResolvedValue({data:[{client_id:'native',task_id:'t1',finding_id:'f1'},{client_id:'other',task_id:'wrong',finding_id:'f1'}]});
  const result=await applyCmmcChanges(context);
  expect(context.api.post).toHaveBeenCalledWith('/framework_assessments/req-3.5.3/findings',expect.objectContaining({
    cmmc_gap_version:'origin',remediation_title:'Complete MFA',severity:'high',owner_id:'operator',due_date:'2027-01-13'}));
  expect(result.handled).toEqual({tasks:['a1','t1'],findings:['f1']});
  expect(result.identityMaps.recordIds.native.tasks.a1).toBe('t1');
});
test('SPRS export requires native export authorization and a fresh packet bound to this client',async()=>{
  const {context}=setup();const api=context.api;
  api.post.mockRejectedValueOnce(Error('Report access denied'));
  await expect(downloadApprovedCmmc({kind:'sprs',level:2,clientId:'native',api})).rejects.toThrow(/denied/);
  expect(api.post).toHaveBeenCalledWith(endpoint+'/export',expect.objectContaining({client_id:'native',level:2,kind:'sprs'}));
  const packet=copy(context.records.cmmcWorkbook);packet.client.client_id='foreign';api.post.mockResolvedValue({data:packet});
  await expect(downloadApprovedCmmc({kind:'sprs',level:2,clientId:'native',api})).rejects.toThrow(/for this client/);
});

test('the shipped Cyberdyne data generates readable Office SSP, POA&M and SPRS files from the same saved client and score',async()=>{
  const fs=require('fs'),path=require('path');
  const {records}=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../shared/fixtures/approvedV3Scenario.json'),'utf8'));
  const client=records.clients.find(c=>c.source_client_id==='cyberdyne'),cid=client.client_id;
  const user={user_id:'operator',name:'Operator',role:'super_admin',status:'active'};
  const db={...records,user,users:[user],logs:[],baselines:{[cid]:client.onboarding_baseline}};
  const packet=cmmcWorkbookRequest(db,'get',{client_id:cid},{});
  expect(packet.data.assessments).toHaveLength(110);expect(packet.records.inventory).toHaveLength(6);
  const state={clients:[{id:'cyberdyne',progs:[{k:'cmmc',level:2}]}],records:{cyberdyne:{systems:[]}}};
  overlayCmmcWorkbook(state,packet,{sourceId:'cyberdyne',clientId:cid,records});
  const expectedScore=state.clients[0].progs[0].nativeCmmcReadiness.value;
  expect(typeof expectedScore).toBe('number');
  const api={post:jest.fn().mockResolvedValue({data:packet})}, blobs=[];
  const savedObjectURL=URL.createObjectURL,savedRevoke=URL.revokeObjectURL;
  URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:isolated-export';};URL.revokeObjectURL=jest.fn();
  const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  try{
    for(const kind of ['ssp','poam','sprs']){
      const name=await downloadApprovedCmmc({clientId:cid,level:2,kind,api});
      expect(name.endsWith(kind==='ssp'?'.docx':'.xlsx')).toBe(true);
      const reader=new FileReader();
      const bytes=await new Promise(resolve=>{reader.onload=()=>resolve(new Uint8Array(reader.result));reader.readAsArrayBuffer(blobs.at(-1));});
      const archive=unzipSync(bytes);
      if(kind==='ssp'){
        const body=strFromU8(archive['word/document.xml']);
        expect(body).toContain(client.name);
        for(const asset of packet.records.inventory)expect(body).toContain(asset.name);
        expect(body).toContain('3.12.4');
      }else{
        const sheet=new DOMParser().parseFromString(strFromU8(archive['xl/worksheets/sheet1.xml']),'application/xml');
        expect(sheet.querySelector('parsererror')).toBeNull();
        expect(sheet.querySelector('c[r="B14"] v')?.textContent).toBe(String(expectedScore));
        expect(sheet.querySelector('c[r="B3"]')?.textContent).toContain(client.name);
      }
    }
    expect(api.post).toHaveBeenCalledTimes(3);expect(blobs).toHaveLength(3);
  }finally{click.mockRestore();URL.createObjectURL=savedObjectURL;URL.revokeObjectURL=savedRevoke;}
},15000);
