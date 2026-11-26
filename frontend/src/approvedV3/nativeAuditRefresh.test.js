/** @jest-environment node */
import {JSDOM} from 'jsdom';
import fixture from '../../../shared/fixtures/approvedV3Scenario.json';
import {downloadApprovedCmmc} from './cmmcCommands';

jest.mock('./cmmcCommands',()=>({applyCmmcChanges:jest.fn(),overlayCmmcWorkbook:jest.fn(),downloadApprovedCmmc:jest.fn()}));
global.window={};
const {startNativeWorkspace}=require('./nativeWorkspace');
delete global.window;
const clone=value=>JSON.parse(JSON.stringify(value));

test.each(['success','failed','stale'])('a completed export refreshes only current audit activity: %s readback',async mode=>{
  const dom=new JSDOM('<body><button data-action="cmmc-ssp-export">Download SSP</button></body>',{url:'https://governara.example.test/clients'});
  const savedGlobals=new Map();
  for(const key of ['window','document','sessionStorage','localStorage']){
    savedGlobals.set(key,Object.getOwnPropertyDescriptor(global,key));
    Object.defineProperty(global,key,{value:dom.window[key],configurable:true,writable:true});
  }
  try{
    const cid='v3sample_cyberdyne',sourceId='cyberdyne',actor={user_id:'operator',name:'Operator',email:'operator@example.test',role:'super_admin',status:'active',updated_at:'account-before'};
    let savedActor=clone(actor),auditEvents=[],releaseAudit,auditStarted;
    const delayedAudit=new Promise(resolve=>{releaseAudit=resolve;});
    const started=new Promise(resolve=>{auditStarted=resolve;});
    const source=clone(fixture.source_state);source.clients=source.clients.filter(client=>client.id===sourceId);
    const records=Object.fromEntries(Object.entries(clone(fixture.records)).map(([kind,rows])=>[kind,
      rows.filter(row=>kind==='users'?row.client_ids?.includes(cid):row.client_id===cid)]));
    records.audit_logs=[];records.approved_v3_guidance=[];
    const event={log_id:'native-export',client_id:cid,entity_type:'cmmc_workbook',entity_id:cid,entity_name:'SSP',
      action:'prepare-export',user_id:actor.user_id,at:'2026-11-26T16:05:00Z'};
    const newerEvent={...event,log_id:'native-later-save',entity_type:'client',entity_name:'Saved native record',
      action:'update',at:'2026-11-26T16:06:00Z'};
    const api={get:jest.fn(async endpoint=>{
      if(endpoint.endsWith('/bootstrap'))return {data:{initialized:true,source_state:clone(source),records:{[cid]:{...clone(records),audit_logs:clone(auditEvents)}},drafts:{},actor:clone(savedActor)}};
      if(endpoint==='/auth/me')return {data:clone(savedActor)};
      if(endpoint==='/users')return {data:[clone(savedActor)]};
      if(endpoint==='/service-catalog')return {data:{tools:[]}};
      if(endpoint==='/evidence/catalog')return {data:{items:[],total:0,page_size:100}};
      if(endpoint==='/clients/'+cid+'/iv-setup')return {data:{client_id:cid,expected_client_updated_at:records.clients[0].updated_at??null,activities:[]}};
      if(endpoint==='/frameworks/cmmc/workbook')return {data:{client:{client_id:cid},records:{client_id:cid}}};
      if(endpoint.endsWith('/records')){
        if(mode==='failed')throw Error('Synthetic audit readback unavailable');
        auditEvents=[event];auditStarted();
        if(mode==='stale')return delayedAudit;
        return {data:{client_id:cid,records:{...clone(records),audit_logs:clone(auditEvents)}}};
      }
      throw Error('Unexpected read '+endpoint);
    }),post:jest.fn(),patch:jest.fn(async(endpoint,body)=>{
      expect(endpoint).toBe('/me');
      savedActor={...savedActor,job_title:body.job_title,updated_at:'account-after'};
      auditEvents=[event,newerEvent];return {data:clone(savedActor)};
    }),put:jest.fn()};
    let current;
    const page={configure:jest.fn(),snapshot:()=>clone(current),apply:jest.fn(state=>{current=state;}),
      actor:jest.fn(),status:jest.fn(),finish:jest.fn(),context:()=>({sourceId,program:'cmmc'}),
      audit:jest.fn((audit,activity)=>{current.audit=audit;current.activity=activity;})};
    downloadApprovedCmmc.mockReset().mockResolvedValue(true);
    const clicks=[];
    const add=dom.window.addEventListener.bind(dom.window);
    const spy=jest.spyOn(dom.window,'addEventListener').mockImplementation((name,callback,options)=>{
      if(name==='click')clicks.push(callback);return add(name,callback,options);
    });
    const controller=await startNativeWorkspace(page,api);spy.mockRestore();
    const businessBefore=clone(current.clients),button=dom.window.document.querySelector('button');
    const exporting=clicks.at(-1)({target:button,preventDefault:()=>{},stopImmediatePropagation:()=>{}});
    if(mode==='stale'){
      await started;
      const edit=clone(current);edit.account.title='Saved after export';
      expect(page.configure.mock.calls[0][0].persist(edit,sourceId)).toBe(true);
      await controller.flush();
      expect(page.finish).toHaveBeenLastCalledWith(true,undefined);
      expect(current.account.title).toBe('Saved after export');
      expect(current.audit.some(row=>row.nativeLogId==='native-later-save')).toBe(true);
      expect(api.patch).toHaveBeenCalledWith('/me',{job_title:'Saved after export',expected_updated_at:'account-before'},expect.any(Object));
      // The earlier export read was captured before the account save/rebootstrap.
      // It must not replace the newer native cache or its already-projected audit.
      releaseAudit({data:{client_id:cid,records:{...clone(records),audit_logs:[event]}}});
    }
    await exporting;
    expect(downloadApprovedCmmc).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/v3/approved-portfolio/records',{params:{client_id:cid}});
    expect(page.apply).toHaveBeenCalledTimes(mode==='stale'?2:1);expect(current.clients).toEqual(businessBefore);
    expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
    if(mode!=='stale')expect(api.patch).not.toHaveBeenCalled();
    if(mode==='failed'){
      expect(page.audit).not.toHaveBeenCalled();
      expect(page.status).toHaveBeenLastCalledWith(expect.stringMatching(/^Downloaded.*Recent audit activity could not be refreshed/));
    }else if(mode==='stale'){
      expect(page.audit).not.toHaveBeenCalled();
      expect(current.audit.some(row=>row.nativeLogId==='native-later-save')).toBe(true);
      expect(current.audit.some(row=>row.nativeLogId==='native-export')).toBe(true);
      expect(current.account.title).toBe('Saved after export');
      expect(page.status).not.toHaveBeenLastCalledWith(expect.stringContaining('could not be refreshed'));
    }else{
      expect(page.audit).toHaveBeenCalledTimes(1);
      expect(current.audit.find(row=>row.nativeLogId==='native-export')).toMatchObject({action:'prepare-export',client:sourceId,user:'Operator'});
      expect(page.status).toHaveBeenLastCalledWith('Downloaded the current saved CMMC SSP.');
    }
  }finally{
    dom.window.close();
    for(const [key,descriptor] of savedGlobals)if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];
  }
});
