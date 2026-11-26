import {eligiblePeople,nativeTransport,reviewForAction,startNativeWorkspace,workspaceMaterial,reviveState} from './nativeWorkspace';
import {applyClientChanges} from './clientCommands';
import {applyRegisterChanges} from './registerCommands';
import {applyWorkChanges} from './workCommands';
import {applyCmmcChanges} from './cmmcCommands';
import {loadGlobalRecords,applyGlobalChanges} from './adminCommands';
import fixture from '../../../shared/fixtures/approvedV3Scenario.json';

jest.mock('./clientCommands',()=>({applyClientChanges:jest.fn()}));
jest.mock('./registerCommands',()=>({applyRegisterChanges:jest.fn()}));
jest.mock('./workCommands',()=>({applyWorkChanges:jest.fn()}));
jest.mock('./cmmcCommands',()=>({applyCmmcChanges:jest.fn(),overlayCmmcWorkbook:jest.fn(),downloadApprovedCmmc:jest.fn()}));
jest.mock('./workGuidance',()=>({prepareReviewGuide:jest.fn(),downloadApprovedEvidence:jest.fn()}));
jest.mock('./adminCommands',()=>({
  loadGlobalRecords:jest.fn(async(api)=>({account:(await api.get('/auth/me')).data,users:[],tools:[]})),
  overlayGlobalRecords:jest.fn(),applyGlobalChanges:jest.fn(async()=>({didWrite:false,message:''})),
}));
jest.mock('./reportDownloads',()=>({createApprovedReportDownloader:()=>jest.fn()}));

const clone=x=>JSON.parse(JSON.stringify(x));
const cid='v3sample_brawndo',actor={user_id:'actual-owner',name:'Actual owner',email:'actual@example.test',role:'super_admin'};
const scoped=()=>Object.fromEntries(Object.entries(fixture.records).map(([key,rows])=>[key,
  rows.filter(row=>key==='users'?row.client_ids?.includes(cid):row.client_id===cid)]));
test('saved projection retains live dates as well as transported date envelopes',()=>{
  const at=new Date(2026,10,26);
  const view=reviveState({due:at,history:[{at:{$date:at.toISOString()}}]});
  expect(view.due).toEqual(at);expect(view.due).toBeInstanceOf(Date);expect(view.history[0].at).toEqual(at);
});

test('eligible assignments reject fictional, disabled, read-only and ambiguous display names',()=>{
  const rows=[{user_id:'one',name:'Alex',email:'one@example.test',status:'active',role:'client_contributor'},
    {user_id:'two',name:'Alex',email:'two@example.test',status:'active',role:'client_grc_manager'},
    {user_id:'ref',name:'Reference',reference_only:true,status:'active',role:'super_admin'},
    {user_id:'reader',name:'Reader',status:'active',role:'client_readonly'},
    {user_id:'off',name:'Disabled',status:'disabled',role:'super_admin'}];
  const eligible=eligiblePeople(rows,actor);
  expect(eligible.Alex).toBeUndefined();expect(eligible.Reference).toBeUndefined();expect(eligible.Reader).toBeUndefined();
  expect(eligible['one@example.test']).toBe('one');expect(eligible['Actual owner']).toBe('actual-owner');
});

test('transport retains one request key for a retry and separates different commands',async()=>{
  const base={patch:jest.fn().mockResolvedValue({data:{}}),post:jest.fn(),put:jest.fn()},pending=new Map();
  const api=nativeTransport(base,pending);
  await api.patch('/records/one',{title:'First'});await api.patch('/records/one',{title:'First'});
  await api.patch('/records/one',{title:'Changed'});
  const keys=base.patch.mock.calls.map(call=>call[2].headers['Idempotency-Key']);
  expect(keys[0]).toBe(keys[1]);expect(keys[2]).not.toBe(keys[0]);
});

test('linked risk completion resolves only its scoped native review',()=>{
  const element=document.createElement('button');element.dataset.action='risk-review-dlg';element.dataset.id='RISK-001';
  expect(reviewForAction(element,{risks:[{display_id:'RISK-001',linked_review_id:'native-r'}],
    reviews:[{review_id:'native-r',source_record_id:'r2'}]})).toBe('r2');
});

test('switching the visible framework is presentation; a changed control remains a save',()=>{
  const before=clone(fixture.source_state),after=clone(before);
  after.clients.find(c=>c.id==='prestige').activeProg='iso';
  after.clients.find(c=>c.id==='prestige').program='ISO 27001';
  after.reg.prestige=after.clients.find(c=>c.id==='prestige').progs.find(p=>p.k==='iso').reg;
  expect(workspaceMaterial(after)).toBe(workspaceMaterial(before));
  after.clients.find(c=>c.id==='prestige').progs.find(p=>p.k==='iso').reg.items[0].st='N';
  expect(workspaceMaterial(after)).not.toBe(workspaceMaterial(before));
});

test('checkpoint-only changes are saved, unaffected clients are skipped, and a partial write reloads canonical state',async()=>{
  jest.useFakeTimers();
  let current,callbacks;
  const source=clone(fixture.source_state);source.clients=source.clients.filter(row=>row.id==='brawndo');
  const records=scoped();records.approved_v3_guidance=[];records.audit_logs=[];
  const packet={initialized:true,source_state:source,records:{[cid]:records},drafts:{},actor};
  const api={get:jest.fn(async(path)=>{
    if(path.endsWith('/bootstrap'))return {data:clone(packet)};
    if(path==='/auth/me')return {data:actor};
    if(path.endsWith('/members'))return {data:[{...actor,status:'active'}]};
    if(path.endsWith('/records'))return {data:{client_id:cid,records:clone(records)}};
    throw Error('Unexpected read '+path);
  }),post:jest.fn(),put:jest.fn(),patch:jest.fn()};
  const page={configure:options=>{callbacks=options;},snapshot:()=>clone(current),
    apply:state=>{current=state;},actor:jest.fn(),status:jest.fn(),finish:jest.fn(),context:()=>({sourceId:'brawndo'})};
  loadGlobalRecords.mockImplementation(async()=>({account:actor,users:[],tools:[]}));
  applyGlobalChanges.mockResolvedValue({didWrite:false,message:''});
  applyClientChanges.mockImplementation(async context=>({clientId:context.clientId,identityMaps:context.identityMaps,handled:{}}));
  applyRegisterChanges.mockResolvedValue({handled:{}});applyCmmcChanges.mockResolvedValue({handled:{}});applyWorkChanges.mockResolvedValue({handled:{}});
  const controller=await startNativeWorkspace(page,api);
  callbacks.persist(clone(current),'brawndo');await controller.flush();
  expect(applyClientChanges).not.toHaveBeenCalled();expect(page.finish).not.toHaveBeenCalled();
  const reverted=clone(current);reverted.clients[0].name='Temporary edit';
  callbacks.persist(reverted,'brawndo');callbacks.persist(clone(current),'brawndo');await controller.flush();
  expect(applyClientChanges).not.toHaveBeenCalled();
  const changed=clone(current);changed.guideSaved||={};changed.guideSaved['brawndo|cis:8.1|1.1']={stage:'q',idx:2,ans:{freq:'Every six months'}};
  callbacks.persist(changed,'brawndo');await controller.flush();
  expect(applyClientChanges).toHaveBeenCalledTimes(1);
  expect(applyClientChanges.mock.calls[0][0].after.guideSaved['brawndo|cis:8.1|1.1'].idx).toBe(2);
  expect(applyWorkChanges).toHaveBeenCalledTimes(1);expect(page.finish).toHaveBeenLastCalledWith(true,undefined);
  const saved=clone(current);saved.clients[0].name='Unconfirmed local value';
  applyClientChanges.mockRejectedValueOnce(Object.assign(Error('Save interrupted'),{clientId:cid,applied:['profile']}));
  records.clients[0].name='Saved on the native server';
  callbacks.persist(saved,'brawndo');await controller.flush();
  expect(api.get.mock.calls.filter(([path])=>path.endsWith('/bootstrap'))).toHaveLength(2);
  expect(current.clients[0].name).toBe('Saved on the native server');
  expect(page.finish).toHaveBeenLastCalledWith(false,'Save interrupted');
  jest.clearAllTimers();jest.useRealTimers();
});
