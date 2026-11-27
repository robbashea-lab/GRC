import {strToU8, zipSync} from 'fflate';
import api from '@/lib/api';
import {buildEvidenceArchive} from '@/lib/evidenceArchive';
import {recordUuid} from '@/lib/recordUuid';
import {collectEvidencePages} from '@/lib/brawndoAdditionalEvidence';
import packageFields from '@/lib/reportPackageFields.json';
import {verifiedPreview} from './NativeReportCatalog';
import {packageEvidenceCopies,registerWorkbooks} from './ReportPackageRegisters';

const types = ['assessment','scope','executive','risks','vendors','policies'];
const slug = value => String(value).replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,100) || 'Report';
export const dayString = value => String(value || '').slice(0,10);
export const evidenceParams = frameworkKey => ({state:JSON.stringify({filters:{frameworks:[frameworkKey]}})});
export function csvRows(rows) {
  return rows.map(row=>row.map(value=>{
    let cell=String(value ?? '');
    if (/^\s*[=+@-]/.test(cell)) cell="'"+cell;
    return '"'+cell.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}

export async function loadReportMaterials(clientId, frameworkKey, end, signal, isCurrent=()=>!signal?.aborted) {
  const params={client_id:clientId,framework_key:frameworkKey};
  const [bundle,history,evidence,cmmc]=await Promise.all([
    api.get('/reports/materials',{params:{...params,as_of:end},signal}),
    api.get('/reports/history',{params,signal}),
    collectEvidencePages(async page=>(await api.get('/evidence/catalog',{params:{client_id:clientId,...evidenceParams(frameworkKey),page,page_size:100},signal})).data,{signal}),
    frameworkKey==='cmmc'?import('./ReportPackageCmmc').then(adapter=>adapter.loadCmmcPackageMaterials({clientId,frameworkKey,asOf:end,signal,isCurrent})):null
  ]);
  if(bundle.data?.client_id!==clientId||bundle.data?.framework_key!==frameworkKey||!Array.isArray(bundle.data.register_history)||
    bundle.data.register_history.some(row=>!['Policies','Risks','Vendors','Reviews'].includes(row.register)||typeof row.record!=='string'||typeof row.at!=='string'||typeof row.event!=='string'))
    throw new Error('The report materials could not be verified for this client and program.');
  const reports=Object.fromEntries(types.map(type=>{
    const preview=verifiedPreview(bundle.data.reports?.[type],clientId,frameworkKey);
    if(preview.header.as_of!==end)throw new Error('The report service returned a different reporting date.');
    return [type,preview];
  }));
  if(!Array.isArray(history.data?.exports)||history.data.exports.some(row=>row.client_id!==clientId||row.framework_key!==frameworkKey||typeof row.export_id!=='string')) throw new Error('The saved export history could not be verified.');
  const registers=bundle.data.registers;
  if(!registers||[...Object.keys(packageFields),'users','framework_units'].some(name=>!Array.isArray(registers[name]))||
      registers.clients.length!==1||registers.clients[0].client_id!==clientId)throw new Error('The saved governance registers could not be verified.');
  if(evidence.some(row=>row.client_id!==clientId||!row.frameworks?.includes(frameworkKey)||!row.evidence_id)||new Set(evidence.map(row=>row.evidence_id)).size!==evidence.length)
    throw new Error('The framework evidence selection could not be verified.');
  return {reports,registers,cmmc,registerHistory:bundle.data.register_history,history:history.data.exports,evidence,
    evidenceCount:evidence.filter(row=>row.file_available!==false).length};
}

export const packageFiles = registerWorkbooks;

export function readiness(materials) {
  const assessment=materials.reports.assessment.sections.find(section=>section.title==='Items needing attention');
  const policies=materials.reports.policies.sections[0];
  const status=policies?.columns.findIndex(value=>value.toLowerCase()==='status');
  if(!assessment || !(status>=0)) throw new Error('Readiness data is incomplete for this program.');
  return [
    {key:'assessment',title:'Assessment coverage',open:assessment.rows.length>0,detail:assessment.rows.length+' applicable items needing attention',items:assessment.rows.map(row=>row.slice(0,3).join(' · '))},
    {key:'policies',title:'Policy approvals',open:policies.rows.some(row=>String(row[status]).toLowerCase()==='draft'),detail:'Review the status of recorded policy versions.',items:policies.rows.filter(row=>String(row[status]).toLowerCase()==='draft').map(row=>String(row[0]))},
    {key:'evidence',title:'Framework evidence',open:materials.evidenceCount===0,detail:materials.evidenceCount+' stored files linked to this framework.',items:[]}
  ];
}

export async function auditedDownload({content,name,type,clientId,frameworkKey,kind,workbook,from,to,pending,signal,isCurrent}) {
  const bytes=typeof content==='string'?strToU8(content):content;
  if(signal?.aborted||!isCurrent())return;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if(signal?.aborted||!isCurrent())return;
  const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  const payload={client_id:clientId,framework_key:frameworkKey,kind,sha256,bytes:bytes.length,period_start:from,period_end:to};
  if(workbook)payload.workbook=workbook;
  const fingerprint=JSON.stringify(payload);
  if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,key:recordUuid()};
  const {data}=await api.post('/reports/deliveries',payload,{headers:{'Idempotency-Key':pending.current.key},signal});
  if(signal?.aborted||!isCurrent())return;
  if(!data?.delivery_id||data.client_id!==clientId||data.framework_key!==frameworkKey||data.kind!==kind||data.sha256!==sha256||workbook&&data.workbook!==workbook)throw new Error('The report download could not be confirmed for this program.');
  pending.current=null;
  const href=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=href;link.download=name;
  document.body.appendChild(link);
  try {link.click();} finally {link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);}
}

export async function downloadAuditPackage({clientId,frameworkKey,materials,config,decisions,files,signal,isCurrent,pending}) {
  const source=materials.reports.assessment.header;
  const entries=Object.create(null);
  const separate=Object.entries(decisions).filter(([,value])=>value==='Provided separately').map(([key])=>key);
  const {reportWorkbook}=await import('./ReportPackageXlsx');
  for(const file of files)if(!file.cmmc)entries[file.path]=reportWorkbook(file.sheets);
  if(materials.cmmc) {
    const {buildCmmcPackageFiles}=await import('./ReportPackageCmmc');
    Object.assign(entries,await buildCmmcPackageFiles(materials.cmmc,{signal,isCurrent}));
  }
  const selectedFiles=packageEvidenceCopies(materials.evidence,config);
  if(selectedFiles.length) {
    const archive=await buildEvidenceArchive({clientId,params:evidenceParams(frameworkKey),storedOnly:true,selectedFiles,signal,isCurrent});
    if(archive.fileCount!==selectedFiles.length) throw new Error('The evidence selection changed. Refresh the package.');
    entries['08_Evidence/Stored-files.zip']=archive.bytes;
  }
  for(const [key,value] of Object.entries(decisions)) {
    if(value instanceof File) {
      const path='09_Attachments/'+slug(key)+'-'+slug(value.name.replace(/\.[^.]+$/,''))+'.'+slug(value.name.split('.').pop());
      if(Object.hasOwn(entries,path))throw new Error('Two package attachments have the same output filename. Rename one before downloading.');
      entries[path]=new Uint8Array(await value.arrayBuffer());
    }
  }
  const {reportBasicPdf}=await import('./ReportPackagePdf');
  entries['00_Start-here.pdf']=reportBasicPdf(source.client.name+' · Audit package',[
    {heading:source.program.name,lines:['Activity period: '+config.start+' through '+config.end,
      'Register snapshot as of: '+source.as_of,'Prepared by: '+(source.prepared_by?.name || 'Not recorded'),
      'Auditor or firm: '+(config.auditor.trim()||'Not specified'),'Provided separately: '+(separate.join(', ')||'None'),
      'The activity period applies to saved history. Registers describe the saved position on the reporting date.']},
    {heading:'File index',lines:['00_Start-here.pdf',...Object.keys(entries)]}
  ]);
  if(signal.aborted||!isCurrent())return;
  // Stable archive metadata lets a retry reuse the same audit receipt for identical contents.
  const content=zipSync(entries,{level:3,mtime:new Date(2000,0,1)});
  await auditedDownload({content,name:slug(source.client.name)+'-'+slug(source.program.name)+'-Audit-package-'+config.end+'.zip',type:'application/zip',
    kind:'audit-package',clientId,frameworkKey,from:config.start,to:config.end,signal,isCurrent,pending});
}
