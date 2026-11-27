import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {unzipSync,strFromU8} from 'fflate';
import Reports from '@/pages/Reports';
import api from '@/lib/api';
import {reportToday} from './NativeReportCatalog';
import {auditedDownload,downloadAuditPackage,packageFiles,readiness,loadReportMaterials} from './ReportPackageFiles';

jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'client_readonly',name:'Owner',user_id:'member'}})}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>({currentClientId:'client-a',currentClient:{name:'A'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},PREVIEW_MODE:false,formatError:error=>error.message}));

let host,root,files,anchor;
const asOf=reportToday('UTC');
const group=(title,columns,rows)=>({title,columns,rows});
const detail={
  assessment:[group('Results by domain',['Domain','Addressed','Total','Rate'],[['Assets',1,2,'50%']]),group('Items needing attention',['ID','Title','Status','Verification'],[['A2','Network inventory','Partial','Pending']])],
  scope:[group('Scope',['Control'],[['A2']])],
  executive:[group('Position',['Position','Overdue work','Risks'],[['In progress',0,0]]),group('Overdue work',['Title','Kind'],[['Check inventory','Review']])],
  risks:[group('Risk register',['Risk'],[['=formula']])],vendors:[group('Vendor register',['Vendor'],[['Partner']])],
  policies:[group('Policy register',['Policy','Status'],[['Active','approved'],['Draft policy','draft']])]
};
function report(type,key='framework-a'){return {header:{client:{id:'client-a',name:'A'},program:{key,name:'Program A'},as_of:asOf,title:type,prepared_by:{name:'Owner'}},sections:detail[type],stats:[{label:'Addressed',value:'50%'}],allowed_formats:['pdf']};}
const registers={clients:[{client_id:'client-a',name:'A',timezone:'UTC',profile:{scope:{statement:'Accounts payable',systems:'Billing platform',exclusions:'Historic billing appliance'}},isms_scope:'Prior boundary'}],assets:[{name:'Unclassified device'}],contacts:[],ai_systems:[{name:'Approved AI'}],users:[],findings:[],framework_assessments:[],framework_units:[],
  reviews:[{review_id:'r1',title:'Previous period',status:'completed',completion_date:'2000-01-01'},
    {review_id:'r2',title:'Past-due review',due_date:'2000-01-01',status:'in_progress'}],risks:[{risk_id:'rr',title:'=formula'}],vendors:[],
  tasks:[{task_id:'a1',title:'Future task',due_date:'2099-07-10',status:'open'},{task_id:'a2',title:'Undated open task',status:'open'},
    {task_id:'a3',title:'Closed in period',status:'done',completed_at:asOf},{task_id:'a4',title:'Cancelled work',status:'cancelled'}],
  policies:[{policy_id:'p1',title:'Active',status:'approved'},{policy_id:'p2',title:'Draft policy',status:'draft'}]};
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{configurable:true,value:require('crypto').webcrypto.subtle});
  window.history.replaceState(null,'','/reports');files=[];URL.createObjectURL=jest.fn(blob=>{files.push(blob);return 'blob:report';});URL.revokeObjectURL=jest.fn();
  anchor=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  api.get.mockReset().mockImplementation(async(path,{params})=>{
    if(path==='/reports/frameworks')return {data:{frameworks:[{key:'framework-a',name:'Program A'},{key:'framework-b',name:'Program B'}]}};
    if(path==='/reports/materials')return {data:{client_id:'client-a',framework_key:params.framework_key,registers,reports:Object.fromEntries(Object.keys(detail).map(type=>[type,report(type,params.framework_key)])),
      register_history:[{register:'Policies',record:'Active',event:'Approved',at:asOf,version:'2'},
        {register:'Reviews',record:'Previous period',event:'Review completed',at:'2000-01-01'}]}};
    if(path==='/reports/history')return {data:{exports:[]}};
    if(path==='/evidence/catalog')return {data:{total:0,page_size:100,items:[]}};
    if(path==='/dashboard')return {data:{client_id:'client-a',recent_activity:[],upcoming_reviews:[]}};
    if(path==='/portfolio/reporting/history')return {data:{client_id:'client-a',program_key:params.program_key,snapshots:[]}};
    throw Error('Unexpected '+path);
  });
  api.post.mockReset().mockImplementation(async(path,body)=>({data:{...body,delivery_id:'delivery_test'}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();anchor.mockRestore();});
const click=async label=>act(async()=>{const button=[...host.querySelectorAll('button')].find(item=>item.textContent.trim()===label);if(!button)throw Error('Missing '+label);button.click();});
function readBlob(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result));reader.onerror=reject;reader.readAsArrayBuffer(blob);});}

test('regular Reports opens the audit workspace, scopes every native data read, and switches to Internal and Detailed reports',async()=>{
  await act(async()=>root.render(<Reports/>));
  expect(host.querySelector('#rp-tab-audit').getAttribute('aria-selected')).toBe('true');
  expect(host.querySelector('.rp-layout aside').textContent).toContain('Audit package');
  expect(host.textContent).toContain('1 applicable items needing attention');
  expect(host.textContent).toContain('00_Start-here.pdf');
  await click('Internal reports');expect(host.querySelector('#exec-period')).not.toBeNull();
  let downloaded;
  const delivery=new Promise(resolve=>{downloaded=resolve;});
  URL.createObjectURL.mockImplementationOnce(blob=>{files.push(blob);downloaded();return 'blob:report';});
  await click('Download PDF');await act(async()=>{await delivery;});expect(strFromU8(await readBlob(files[0])).slice(0,5)).toBe('%PDF-');
  await click('Detailed reports');expect(host.querySelectorAll('.rep-card')).toHaveLength(6);
  expect(api.get.mock.calls.every(([,options])=>options.params.client_id==='client-a')).toBe(true);
});

test('audit handoff restores validated dates only for the linked client and framework',async()=>{
  window.history.replaceState(null,'','/reports?client_id=client-a&framework_key=framework-a&period_start=2026-11-01&period_end=2026-11-15');
  await act(async()=>root.render(<Reports/>));
  expect(host.querySelector('#rp-from').value).toBe('2026-11-01');
  expect(host.querySelector('#rp-through').value).toBe('2026-11-15');
  const selected=host.querySelector('#reports-framework');
  await act(async()=>{selected.value='framework-b';selected.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.querySelector('#rp-through').value).toBe(asOf);
  expect(api.post).not.toHaveBeenCalled();
});

test('the package exports only chosen native materials, current report values and a real PDF introduction',async()=>{
  const signal=new AbortController().signal;
  const materials=await loadReportMaterials('client-a','framework-a',asOf,signal);
  const config={start:asOf,end:asOf,auditor:'Acme',open:false,drafts:false,copies:false,history:false};
  expect(readiness(materials).find(row=>row.key==='policies').items).toEqual(['Draft policy']);
  const entries=packageFiles(materials,config);
  await downloadAuditPackage({clientId:'client-a',frameworkKey:'framework-a',materials,config,decisions:{evidence:'Provided separately'},files:entries,signal,isCurrent:()=>true,pending:{current:null}});
  const archive=unzipSync(await readBlob(files[0]));
  expect(strFromU8(archive['00_Start-here.pdf']).slice(0,5)).toBe('%PDF-');
  const xml=(path,sheet)=>strFromU8(unzipSync(archive[path])['xl/worksheets/sheet'+sheet+'.xml']);
  const policy=xml('02_Policies/Policy-register.xlsx',1),risk=xml('03_Risk-management/Risk-register.xlsx',1);
  expect(policy).toContain('Active');expect(policy).not.toContain('Draft policy');
  expect(risk).toContain('=formula');expect(risk).not.toContain('<f>');
  expect(xml('06_AI-governance/AI-register.xlsx',1)).toContain('Approved AI');
  expect(xml('09_Open-items/Open-items.xlsx',1)).toContain('Closed in period');
  expect(xml('09_Open-items/Open-items.xlsx',1)).not.toMatch(/Undated open task|Future task|Cancelled work/);
  expect(xml('09_Open-items/Open-items.xlsx',2)).not.toContain('Past-due review');
  expect(strFromU8(unzipSync(archive['01_Scope-and-governance/Scope-and-roles.xlsx'])['xl/workbook.xml'])).toContain('Roles and contacts');
  expect(xml('01_Scope-and-governance/Scope-and-roles.xlsx',1)).toContain('Accounts payable');
  expect(xml('01_Scope-and-governance/Scope-and-roles.xlsx',1)).not.toContain('Prior boundary');
  expect(xml('01_Scope-and-governance/Scope-and-roles.xlsx',2)).toContain('Billing platform');
  expect(xml('01_Scope-and-governance/Scope-and-roles.xlsx',2)).not.toContain('Unclassified device');
  expect(JSON.stringify(packageFiles(materials,{...config,drafts:true}).find(file=>file.path.startsWith('02_')).sheets)).toContain('Draft policy');
  const open=packageFiles(materials,{...config,open:true}).find(file=>file.path.startsWith('09_')).sheets;
  expect(JSON.stringify(open[0].rows)).toMatch(/Future task/);expect(JSON.stringify(open[0].rows)).toContain('Undated open task');
  expect(JSON.stringify(open[1].rows)).toContain('Past-due review');
  const historical=packageFiles(materials,{...config,history:true});
  expect(historical.find(file=>file.path.startsWith('02_')).sheets[1].rows).toContainEqual([asOf,'Active','Approved','2']);
  expect(JSON.stringify(historical.find(file=>file.path.startsWith('04_')).sheets[0].rows)).not.toContain('Previous period');
});

test('an unconfirmed audit receipt prevents download and a retry reuses the original request key',async()=>{
  const request={content:'header\r\n',name:'test.csv',type:'text/csv',clientId:'client-a',frameworkKey:'framework-a',kind:'prep-checklist',from:asOf,to:asOf,pending:{current:null},isCurrent:()=>true};
  api.post.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(auditedDownload(request)).rejects.toThrow('Audit unavailable');expect(files).toHaveLength(0);
  await auditedDownload(request);expect(files).toHaveLength(1);
  expect(api.post.mock.calls[1][2].headers).toEqual(api.post.mock.calls[0][2].headers);
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('content');
  await auditedDownload(request);expect(api.post.mock.calls[2][2].headers).not.toEqual(api.post.mock.calls[0][2].headers);
});

test('a mismatched native program fails visibly and cannot be downloaded',async()=>{
  api.get.mockImplementation(async(path)=>path==='/reports/frameworks'?{data:{frameworks:[{key:'framework-a',name:'Program A'}]}}:
    path==='/evidence/catalog'?{data:{total:0,page_size:100,items:[]}}:{data:{client_id:'other'}});
  await act(async()=>root.render(<Reports/>));
  expect(host.querySelector('[role="alert"]').textContent).toContain('could not be verified');
  expect([...host.querySelectorAll('button')].find(item=>item.textContent.includes('Download package')).disabled).toBe(true);
  expect(files).toHaveLength(0);
});

test('the ZIP preserves outstanding independent validation and exact scoped risk completion history',async()=>{
  const signal=new AbortController().signal;
  const materials=await loadReportMaterials('client-a','framework-a',asOf,signal);
  materials.registers={...materials.registers,
    findings:[{finding_id:'qa-finding',status:'remediated',decision_history:[{action:'rejected',at:'2000-01-02'}]},
      {finding_id:'closed-finding',status:'closed',validated_at:asOf+'T10:00:00Z'}],
    tasks:[...materials.registers.tasks,{task_id:'qa-action',finding_id:'qa-finding',title:'Synthetic High correction',priority:'high',status:'done',completed_at:asOf},
      {task_id:'returned-work',finding_id:'qa-finding',title:'Returned first attempt',status:'done',completed_at:'2000-01-01'},
      {task_id:'prior-work',finding_id:'closed-finding',title:'Validated today',status:'done',completed_at:'2000-01-01'}],
    reviews:[...materials.registers.reviews,{review_id:'risk-review',risk_id:'rr',title:'Asset Inventory Risk Review',
      occurrences:[{occurrence_id:'qa-risk-occurrence',outcome:'Confirmed',completed_at:asOf},
        {occurrence_id:'old-risk-occurrence',outcome:'Prior',completed_at:'2000-01-01'}]}]
  };
  materials.registerHistory=[...materials.registerHistory,{register:'Risks',record:'=formula',event:'Closed',at:asOf}];
  const config={start:asOf,end:asOf,auditor:'Acme',open:true,drafts:false,copies:false,history:true};
  await downloadAuditPackage({clientId:'client-a',frameworkKey:'framework-a',materials,config,decisions:{},files:packageFiles(materials,config),signal,isCurrent:()=>true,pending:{current:null}});
  const archive=unzipSync(await readBlob(files[0]));
  const xml=(path,sheet)=>strFromU8(unzipSync(archive[path])['xl/worksheets/sheet'+sheet+'.xml']);
  const risk=xml('03_Risk-management/Risk-register.xlsx',2),work=xml('09_Open-items/Open-items.xlsx',1);
  expect(work).toMatch(/Synthetic High correction[\s\S]*Pending validation/);
  expect(work).not.toContain('Returned first attempt');
  expect(work).toMatch(/Validated today[\s\S]*T10:00:00Z/);
  expect(JSON.stringify(packageFiles(materials,{...config,open:false}).find(file=>file.path.startsWith('09_')).sheets))
    .not.toContain('Synthetic High correction');
  expect(risk.match(/qa-risk-occurrence/g)).toHaveLength(1);
  expect(risk).toContain('Asset Inventory Risk Review');
  expect(risk).toContain('Closed');
  expect(risk).not.toContain('old-risk-occurrence');
});

test('Reference only keeps the exact evidence ID in the package index without including its stored bytes',async()=>{
  const get=api.get.getMockImplementation();
  const data=Uint8Array.from([7,37,211]);
  const sha256=require('crypto').createHash('sha256').update(data).digest('hex');
  const evidence=['keep','reference'].map(evidence_id=>({evidence_id,client_id:'client-a',filename:evidence_id+'.bin',
    version:1,sha256,size:data.length,frameworks:['framework-a'],file_available:true,program_areas:['Frameworks','Reviews']}));
  api.get.mockImplementation(async(path,options)=>{
    if(path==='/evidence/catalog')return {data:{total:2,page_size:100,items:evidence}};
    if(path==='/evidence-library/items/keep')return {data:evidence[0]};
    if(path==='/evidence/keep/download')return {data:{filename:'keep.bin',content_base64:Buffer.from(data).toString('base64')}};
    return get(path,options);
  });
  const signal=new AbortController().signal;
  const materials=await loadReportMaterials('client-a','framework-a',asOf,signal);
  const config={start:asOf,end:asOf,auditor:'Acme',open:true,drafts:false,copies:true,history:true,referenceOnlyEvidenceIds:['reference']};
  await downloadAuditPackage({clientId:'client-a',frameworkKey:'framework-a',materials,config,
    decisions:{'Assessment records':'Provided separately'},files:packageFiles(materials,config),signal,isCurrent:()=>true,pending:{current:null}});
  const archive=unzipSync(await readBlob(files[0]));
  const stored=unzipSync(archive['08_Evidence/Stored-files.zip']);
  const kept=Object.keys(stored).filter(path=>path!=='index.csv');
  expect(kept).toEqual([expect.stringContaining('keep--keep')]);
  expect([...stored[kept[0]]]).toEqual([...data]);
  expect(strFromU8(stored['index.csv'])).not.toContain('reference');
  const evidenceIndex=strFromU8(unzipSync(archive['08_Evidence/Evidence-index.xlsx'])['xl/worksheets/sheet1.xml']);
  expect(evidenceIndex).toMatch(/reference.bin[\s\S]*Reference only/);
  expect(evidenceIndex).toMatch(/keep.bin[\s\S]*Stored copy included/);
  expect(api.post.mock.calls[0][1]).toMatchObject({period_start:asOf,period_end:asOf,client_id:'client-a',framework_key:'framework-a'});
});
