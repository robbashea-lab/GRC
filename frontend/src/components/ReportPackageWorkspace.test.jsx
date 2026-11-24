import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {unzipSync,strFromU8} from 'fflate';
import Reports from '@/pages/Reports';
import api from '@/lib/api';
import {reportToday} from './NativeReportCatalog';
import {auditedDownload,csvRows,downloadAuditPackage,packageFiles,readiness,loadReportMaterials} from './ReportPackageFiles';

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
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{configurable:true,value:require('crypto').webcrypto.subtle});
  window.history.replaceState(null,'','/reports');files=[];URL.createObjectURL=jest.fn(blob=>{files.push(blob);return 'blob:report';});URL.revokeObjectURL=jest.fn();
  anchor=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  api.get.mockReset().mockImplementation(async(path,{params})=>{
    if(path==='/reports/frameworks')return {data:{frameworks:[{key:'framework-a',name:'Program A'},{key:'framework-b',name:'Program B'}]}};
    if(path==='/reports/materials')return {data:{client_id:'client-a',framework_key:params.framework_key,reports:Object.fromEntries(Object.keys(detail).map(type=>[type,report(type,params.framework_key)])),
      register_history:[{register:'Policies',record:'Active',event:'Approved',at:asOf,version:'2'},
        {register:'Reviews',record:'Previous period',event:'Review completed',at:'2000-01-01'}]}};
    if(path==='/reports/history')return {data:{exports:[]}};
    if(path==='/evidence/catalog')return {data:{total:0,items:[]}};
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

test('the package exports only chosen native materials, current report values and a real PDF introduction',async()=>{
  const signal=new AbortController().signal;
  const materials=await loadReportMaterials('client-a','framework-a',asOf,signal);
  const config={start:asOf,end:asOf,auditor:'Acme',open:false,drafts:false,copies:false,history:false};
  expect(readiness(materials).find(row=>row.key==='policies').items).toEqual(['Draft policy']);
  const entries=packageFiles(materials,config);
  await downloadAuditPackage({clientId:'client-a',frameworkKey:'framework-a',materials,config,decisions:{evidence:'Provided separately'},files:entries,signal,isCurrent:()=>true,pending:{current:null}});
  const archive=unzipSync(await readBlob(files[0]));
  expect(strFromU8(archive['00_Start-here.pdf']).slice(0,5)).toBe('%PDF-');
  expect(strFromU8(archive['06_Policies/Policy-register.csv'])).toContain('"Active","approved"');
  expect(strFromU8(archive['06_Policies/Policy-register.csv'])).not.toContain('Draft policy');
  expect(strFromU8(archive['04_Risks/Risk-register.csv'])).toContain("'=formula");
  expect(Object.keys(archive).some(key=>key.startsWith('03_Open-work/')||key.startsWith('07_History/'))).toBe(false);
  expect(csvRows(packageFiles(materials,{...config,drafts:true}).find(file=>file.path.startsWith('06_')).rows)).toContain('Draft policy');
  const historical=packageFiles(materials,{...config,history:true});
  expect(historical.find(file=>file.path==='07_History/Policies.csv').rows[1]).toEqual([asOf,'Active','Approved','2']);
  expect(historical.some(file=>file.path==='07_History/Reviews.csv')).toBe(false);
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
  api.get.mockImplementation(async(path)=>path==='/reports/frameworks'?{data:{frameworks:[{key:'framework-a',name:'Program A'}]}}:{data:{client_id:'other'}});
  await act(async()=>root.render(<Reports/>));
  expect(host.querySelector('[role="alert"]').textContent).toContain('could not be verified');
  expect([...host.querySelectorAll('button')].find(item=>item.textContent.includes('Download package')).disabled).toBe(true);
  expect(files).toHaveLength(0);
});
