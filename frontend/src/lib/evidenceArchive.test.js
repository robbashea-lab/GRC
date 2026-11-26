import {createHash,webcrypto} from 'crypto';
import {unzipSync,strFromU8} from 'fflate';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import api from './api';
import {buildEvidenceArchive,downloadEvidenceArchive,useEvidenceArchive,EVIDENCE_ARCHIVE_LIMITS} from './evidenceArchive';
jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn()},PREVIEW_MODE:false,formatError:error=>error.message}));

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=(id,bytes=Uint8Array.from([0,255,7,128]),overrides={})=>({evidence_id:id,client_id:'client',filename:'Résumé 同名.bin',version:1,size:bytes.length,sha256:sha(bytes),created_at:'2026-11-19T00:00:00Z',program_areas:['Reviews'],folder_paths:['["Reviews","monthly"]'],references:[{kind:'reviews',id:'review',title:'Saved review',available:true}],...overrides});
let rows,contents,request,linkClick;
function install(){api.get.mockImplementation(async(path,{params}={})=>{
  if(path==='/evidence/catalog')return {data:{items:rows.slice((params.page-1)*100,params.page*100),total:rows.length,page_size:100}};
  const id=decodeURIComponent(path.split('/').at(-1)==='download'?path.split('/').at(-2):path.split('/').at(-1)),row=rows.find(row=>row.evidence_id===id);
  if(!row)throw new Error('Evidence not found');
  if(path.endsWith('/download'))return {data:{filename:row.filename,content_base64:contents[id]}};
  return {data:{...row}};
});}
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true}));
beforeEach(()=>{require('./api').PREVIEW_MODE=false;rows=[file('actual-1')];contents={'actual-1':Buffer.from([0,255,7,128]).toString('base64')};request={clientId:'client',isCurrent:()=>true,signal:new AbortController().signal};URL.createObjectURL=jest.fn(()=>'blob:owned-evidence-zip');URL.revokeObjectURL=jest.fn();linkClick=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});install();});
afterEach(()=>{linkClick.mockRestore();jest.clearAllMocks();});

test('report file copies include real bytes and exclude only explicitly reference-only records from the same client',async()=>{
  rows.push({client_id:'client',evidence_id:'ref',filename:'External reference',file_available:false});
  const result=await buildEvidenceArchive({...request,storedOnly:true});
  expect(result.fileCount).toBe(1);
  expect(api.get.mock.calls.some(([path])=>path.startsWith('/evidence/ref'))).toBe(false);
  rows[1].client_id='another';
  await expect(buildEvidenceArchive({...request,storedOnly:true})).rejects.toThrow('different client');
});

test('complete multi-page selection preserves binary bytes, Unicode and same-name identities in every authorized folder',async()=>{
  rows=Array.from({length:101},(_,index)=>file('actual-'+index));
  rows[0].program_areas=['Reviews','Frameworks'];rows[0].folder_paths.push('["Frameworks","cis-ig1"]');
  contents=Object.fromEntries(rows.map(row=>[row.evidence_id,Buffer.from([0,255,7,128]).toString('base64')]));
  contents[rows[1].evidence_id]='data:application/octet-stream;base64,'+contents[rows[1].evidence_id];
  const result=await buildEvidenceArchive({...request,params:{q:'captured query',state:'{"include_archived":true}'}}),zip=unzipSync(result.bytes);
  expect(result.fileCount).toBe(101);expect(result.entryCount).toBe(102);expect(Object.keys(zip)).toHaveLength(103);
  const paths=Object.keys(zip).filter(name=>name!=='index.csv');expect(new Set(paths).size).toBe(102);
  expect(paths.some(name=>name.includes('Résumé 同名--actual-0-v1-0001.bin'))).toBe(true);
  for(const name of paths){expect([...zip[name]]).toEqual([0,255,7,128]);expect(name.split('/')).not.toContain('..');}
  const index=strFromU8(zip['index.csv']);expect(index).toContain('Recorded SHA-256');expect(index).toContain('Saved review');expect(index).toContain(rows[0].sha256);
  const catalog=api.get.mock.calls.filter(([path])=>path==='/evidence/catalog');expect(catalog.map(([,options])=>options.params.page)).toEqual([1,2,1,2]);
  expect(catalog.every(([,options])=>options.params.q==='captured query'&&options.params.state==='{"include_archived":true}')).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('folder archive uses its complete captured filter and one chosen folder; index cells cannot become spreadsheet formulas',async()=>{
  rows=[file('actual-1',Uint8Array.from([0,255,7,128]),{filename:'=Résumé 同名.bin',program_areas:['Reviews','Findings']})];
  const result=await buildEvidenceArchive({...request,folderArea:'Reviews',params:{state:'{"filters":{"program_areas":["Reviews"]}}'}}),zip=unzipSync(result.bytes);
  expect(Object.keys(zip).filter(name=>name!=='index.csv')).toHaveLength(1);expect(Object.keys(zip).some(name=>name.startsWith('Findings/'))).toBe(false);
  expect(strFromU8(zip['index.csv'])).toContain("'=Résumé 同名.bin");
});
test.each(['denied','missing','unavailable bytes','checksum mismatch','version changed before','version changed after'])('%s fails the whole archive without a partial-success download',async failure=>{
  const read=api.get.getMockImplementation();let detailReads=0;
  api.get.mockImplementation(async(path,options)=>{
    if(path.includes('/items/')){detailReads++;if(failure==='missing')throw new Error('Evidence not found');const response=await read(path,options);if(failure==='version changed before'||failure==='version changed after'&&detailReads===2)response.data.version=2;return response;}
    if(path.endsWith('/download')){if(failure==='denied')throw new Error('Forbidden');if(failure==='unavailable bytes')return {data:{filename:rows[0].filename}};if(failure==='checksum mismatch')return {data:{filename:rows[0].filename,content_base64:Buffer.from([1,1,1,1]).toString('base64')}};}
    return read(path,options);
  });
  await expect(downloadEvidenceArchive(request)).rejects.toThrow();expect(linkClick).not.toHaveBeenCalled();expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test.each(['user','mode','client','AbortSignal'])('a changed %s while file bytes are pending cannot produce an archive',async change=>{
  let finish,current=true;const controller=new AbortController(),read=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path.endsWith('/download')?new Promise(resolve=>{finish=resolve;}):read(path,options));
  const pending=downloadEvidenceArchive({...request,signal:controller.signal,isCurrent:()=>current});
  for(let count=0;count<10&&!finish;count++)await Promise.resolve();expect(finish).toBeDefined();
  if(change==='AbortSignal')controller.abort();else if(change==='mode')require('./api').PREVIEW_MODE=true;else current=false;
  finish({data:{filename:rows[0].filename,content_base64:contents['actual-1']}});
  await expect(pending).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();expect(linkClick).not.toHaveBeenCalled();
});
test('catalog changes after byte validation and incomplete/duplicate pagination never silently truncate the archive',async()=>{
  const read=api.get.getMockImplementation();let catalogs=0;
  api.get.mockImplementation(async(path,options)=>{if(path==='/evidence/catalog'&&++catalogs===2)return {data:{items:[],total:0,page_size:100}};return read(path,options);});
  await expect(downloadEvidenceArchive(request)).rejects.toThrow('selection changed');expect(URL.createObjectURL).not.toHaveBeenCalled();
  api.get.mockImplementation(async()=>({data:{items:rows,total:2,page_size:100}}));
  await expect(buildEvidenceArchive(request)).rejects.toThrow('duplicate file identities');
  api.get.mockResolvedValue({data:{items:[],total:1,page_size:100}});await expect(buildEvidenceArchive(request)).rejects.toThrow('ended before all records');
});
test.each(['files','sourceBytes','entryBytes','indexBytes'])('the %s memory bound fails visibly without emitting partial ZIP bytes',async bound=>{
  const limits={...EVIDENCE_ARCHIVE_LIMITS,[bound]:bound==='files'?0:1};
  await expect(downloadEvidenceArchive({...request,limits})).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();expect(linkClick).not.toHaveBeenCalled();
});
test('standard unknown checksums and unqualified Demo computed checksums remain unavailable',async()=>{
  delete rows[0].sha256;await expect(buildEvidenceArchive(request)).rejects.toThrow('checksum');
  require('./api').PREVIEW_MODE=true;await expect(buildEvidenceArchive(request)).rejects.toThrow('checksum');
});
test('a verified immutable Demo delivery checksum is independently checked and labeled as computed at download',async()=>{
  delete rows[0].sha256;require('./api').PREVIEW_MODE=true;const read=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,options)=>{const response=await read(path,options);if(path.endsWith('/download'))Object.assign(response.data,{computed_sha256:sha(Buffer.from([0,255,7,128])),computed_sha256_source:'verified_immutable_fixture_bytes'});return response;});
  const result=await buildEvidenceArchive(request),zip=unzipSync(result.bytes);expect(strFromU8(zip['index.csv'])).toContain('Computed at download from verified immutable fixture bytes');expect(rows[0].sha256).toBeUndefined();
});
test('only the completed archive creates a Blob URL, and cancellation or a blocked click revokes that owned URL',async()=>{
  await downloadEvidenceArchive(request);expect(linkClick).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owned-evidence-zip');
  linkClick.mockClear();const controller=new AbortController();URL.createObjectURL.mockImplementation(()=>{controller.abort();return 'blob:cancelled-owned';});
  await expect(downloadEvidenceArchive({...request,signal:controller.signal})).rejects.toThrow('cancelled');expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cancelled-owned');expect(linkClick).not.toHaveBeenCalled();
  URL.createObjectURL.mockReturnValue('blob:blocked-owned');linkClick.mockImplementationOnce(()=>{throw new Error('Blocked download');});
  await expect(downloadEvidenceArchive(request)).rejects.toThrow('Blocked download');expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:blocked-owned');
});
test.each(['user','mode','client'])('the shared UI hook aborts a pending archive on a real %s identity change',async change=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;let clientId='client',identity='actor:demo',finish,archive;
  const read=api.get.getMockImplementation();api.get.mockImplementation((path,options)=>path.endsWith('/download')?new Promise(resolve=>{finish=resolve;}):read(path,options));
  const node=document.createElement('div');document.body.appendChild(node);const root=createRoot(node);
  function Harness(){archive=useEvidenceArchive(clientId,identity);return React.createElement('button',{onClick:()=>archive.run()},archive.busy?'Busy':'Download');}
  try{
    await act(async()=>root.render(React.createElement(Harness)));await act(async()=>node.querySelector('button').click());expect(finish).toBeDefined();
    const signal=api.get.mock.calls.find(([path])=>path.endsWith('/download'))[1].signal;
    if(change==='client')clientId='other-client';else identity=change==='user'?'other-actor:demo':'actor:standard';
    await act(async()=>root.render(React.createElement(Harness)));expect(signal.aborted).toBe(true);
    await act(async()=>finish({data:{filename:rows[0].filename,content_base64:contents['actual-1']}}));
    expect(URL.createObjectURL).not.toHaveBeenCalled();expect(archive.busy).toBe(false);
  }finally{await act(async()=>root.unmount());node.remove();}
});
