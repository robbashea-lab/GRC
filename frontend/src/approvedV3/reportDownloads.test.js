import {createApprovedReportDownloader} from './reportDownloads';
import {loadReportMaterials,downloadAuditPackage,auditedDownload} from '../components/ReportPackageFiles';
import {strFromU8,unzipSync} from 'fflate';

jest.mock('../components/ReportPackageFiles',()=>({...jest.requireActual('../components/ReportPackageFiles'),
  loadReportMaterials:jest.fn(),downloadAuditPackage:jest.fn(),auditedDownload:jest.fn()}));
const register='03_Risk-management/Risk-register.xlsx';
function setup() {
  const client={client_id:'c17',source_client_id:'br',timezone:'UTC',name:'Actual client'};
  const scope={actorId:'native-me',clientId:'c17',sourceId:'br',records:{clients:[client]},ready:true};
  const header={client:{id:'c17',name:client.name},program:{key:'cis-ig1',name:'CIS IG1'},prepared_by:{id:'native-me',name:'Actual user'},as_of:'2026-01-19'};
  const report={header,stats:[],sections:[]};
  const registers=Object.fromEntries(['assets','contacts','users','framework_units','framework_assessments','risks','vendors','policies','reviews','tasks','findings','ai_systems'].map(key=>[key,[]]));
  registers.clients=[client];registers.contacts=[{name:'Saved contact'}];
  registers.risks=[{risk_id:'rk71',title:'Native-only risk'}];
  const materials={registers,history:[],registerHistory:[],evidence:[],evidenceCount:0,reports:{executive:report,
    assessment:{...report,sections:[{title:'Items needing attention',columns:[],rows:[]}]},
    scope:report,policies:{...report,sections:[{title:'Policies',columns:['Status'],rows:[]}]}}};
  loadReportMaterials.mockResolvedValue(materials);
  const api={get:jest.fn(path=>Promise.resolve({data:path==='/dashboard'?{client_id:'c17',recent_activity:[],upcoming_reviews:[]}:
    {client_id:'c17',program_key:'cis-ig1',snapshots:[]}}))};
  const status=jest.fn(),run=createApprovedReportDownloader({api,getScope:()=>scope,status});
  const request={sourceId:'br',program:'cis',kind:'zip',start:'2025-12-01',end:'2026-01-19',auditor:'Audit firm',options:{open:true,drafts:false,history:true,copies:true},
    decisions:[],attachments:[],executive:{period:'q',forWho:'Saved contact',sections:{work:true},note:'Chosen by actual user'}};
  return {scope,api,status,materials,request,run};
}
beforeEach(()=>jest.clearAllMocks());
test('ZIP passes saved framework materials, package options, dates, auditor and separate items to the audited package builder',async()=>{
  const {run,request,materials}=setup();
  request.decisions=[{key:'x|1',group:'pol-docs',label:'Access policy',status:'Provided separately'}];
  await run(request,()=>true);
  expect(loadReportMaterials).toHaveBeenCalledWith('c17','cis-ig1',expect.stringMatching(/^\d{4}-/),expect.anything(),expect.any(Function));
  expect(downloadAuditPackage).toHaveBeenCalledWith(expect.objectContaining({clientId:'c17',frameworkKey:'cis-ig1',materials,
    decisions:{'Access policy':'Provided separately'},config:{...request.options,start:request.start,end:request.end,auditor:'Audit firm'},
    files:expect.arrayContaining([expect.objectContaining({path:register})])}));
});
test('single register download produces real native XLSX and attaches correct type and name to its receipt',async()=>{
  const {run,request}=setup();
  const saved=await run({...request,kind:'single',path:register},()=>true);
  const delivery=auditedDownload.mock.calls[0][0];
  expect(saved.name).toBe('Risk-register.xlsx');expect(delivery).toMatchObject({kind:'register-workbook',frameworkKey:'cis-ig1',workbook:saved.name});
  expect(Object.values(unzipSync(delivery.content)).map(bytes=>strFromU8(bytes)).join('\n')).toContain('Native-only risk');
});
test('executive PDF uses actual native author, selected recipient and relative reporting period, and records its digest via the native delivery function',async()=>{
  const {run,request,api}=setup();await run({...request,kind:'exec'},()=>true);
  expect(api.get).toHaveBeenCalledTimes(2);
  const delivery=auditedDownload.mock.calls[0][0];
  expect(delivery.kind).toBe('executive-summary');expect(strFromU8(delivery.content.slice(0,5))).toBe('%PDF-');
  expect(delivery.from<=delivery.to).toBe(true);
});
test('checklist combines saved readiness with the selected preparation response, with native receipt',async()=>{
  const {run,request}=setup();
  await run({...request,kind:'prep',decisions:[{key:'x',label:'Policy gap',status:'Comment added',text:'=quoted'}]},()=>true);
  expect(auditedDownload.mock.calls[0][0]).toMatchObject({kind:'prep-checklist',content:expect.stringContaining("'=quoted")});
});
test('an individual exclusion cannot accidentally broaden a package that contains real files',async()=>{
  const {run,request,materials}=setup();materials.evidenceCount=2;
  request.decisions=[{key:'x|1',group:'pol-docs',label:'Access policy',status:'Provided separately'}];
  const result=await run(request,()=>true);
  expect(result.workbench.url).toBe('/reports?reports_tab=audit&framework_key=cis-ig1&client_id=c17');
  expect(downloadAuditPackage).not.toHaveBeenCalled();
});
test('a stale source selection, a foreign preparer, and a missing actual recipient cannot trigger a download',async()=>{
  const {run,request,materials}=setup();
  await expect(run(request,()=>false)).rejects.toThrow(/Reopen/);
  await expect(run({...request,kind:'exec',executive:{...request.executive,forWho:'Removed person'}},()=>true)).rejects.toThrow(/recipient/);
  materials.reports.assessment.header.prepared_by.id='foreign-user';
  await expect(run(request,()=>true)).rejects.toThrow(/account/);
  expect(auditedDownload).not.toHaveBeenCalled();expect(downloadAuditPackage).not.toHaveBeenCalled();
});
test('switching clients after requesting a report suppresses delivery',async()=>{
  const {run,request,scope,materials}=setup();
  loadReportMaterials.mockImplementationOnce(async()=>{scope.clientId='other';return materials;});
  await expect(run(request,()=>true)).rejects.toThrow(/selection changed/);
  expect(downloadAuditPackage).not.toHaveBeenCalled();
});
