import {strToU8, zipSync} from 'fflate';
import api from '@/lib/api';
import {buildEvidenceArchive} from '@/lib/evidenceArchive';
import {recordUuid} from '@/lib/recordUuid';
import {verifiedPreview} from './NativeReportCatalog';

const types = ['assessment','scope','executive','risks','vendors','policies'];
const folders = {assessment:'01_Assessment',scope:'02_Requirements',executive:'03_Open-work',risks:'04_Risks',vendors:'05_Vendors',policies:'06_Policies'};
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

export async function loadReportMaterials(clientId, frameworkKey, end, signal) {
  const params={client_id:clientId,framework_key:frameworkKey};
  const [bundle,history,evidence]=await Promise.all([
    api.get('/reports/materials',{params:{...params,as_of:end},signal}),
    api.get('/reports/history',{params,signal}),
    api.get('/evidence/catalog',{params:{client_id:clientId,...evidenceParams(frameworkKey),page:1,page_size:1},signal})
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
  if(!Number.isSafeInteger(evidence.data?.total)||evidence.data.total<0||!Array.isArray(evidence.data.items)||evidence.data.items.some(row=>row.client_id!==clientId||!row.frameworks?.includes(frameworkKey))) throw new Error('The framework evidence selection could not be verified.');
  return {reports,registerHistory:bundle.data.register_history,history:history.data.exports,evidenceCount:evidence.data.total};
}

export function packageFiles(materials, config) {
  const files=[];
  for(const type of types) {
    const dto=materials.reports[type];
    for(const section of dto.sections) {
      if(type==='executive' && (section.title!=='Overdue work'||!config.open)) continue;
      let rows=section.rows;
      if(type==='policies' && !config.drafts) {
        const status=section.columns.findIndex(column=>column.toLowerCase()==='status');
        if(status<0) throw new Error('The policy register is missing its approval status.');
        rows=rows.filter(row=>['approved','published','active'].includes(String(row[status]).toLowerCase()));
      }
      files.push({path:folders[type]+'/'+slug(section.title)+'.csv',rows:[section.columns,...rows]});
    }
  }
  if(config.history) {
    const inPeriod=value=>dayString(value)>=config.start&&dayString(value)<=config.end;
    for(const register of ['Policies','Risks','Vendors','Reviews']) {
      const rows=materials.registerHistory.filter(row=>row.register===register&&inPeriod(row.at));
      if(rows.length)files.push({path:'07_History/'+register+'.csv',rows:[
        ['Date','Record','Event','Version'],...rows.map(row=>[row.at,row.record,row.event,row.version])
      ]});
    }
    files.push({path:'07_History/Report-exports.csv',rows:[
      ['Report','Format','As of','Generated','Prepared by'],
      ...materials.history.filter(row=>inPeriod(row.created_at)).map(row=>[row.title,row.format,row.as_of,row.created_at,row.prepared_by?.name])
    ]});
  }
  return files;
}

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

export async function auditedDownload({content,name,type,clientId,frameworkKey,kind,from,to,pending,signal,isCurrent}) {
  const bytes=typeof content==='string'?strToU8(content):content;
  if(signal?.aborted||!isCurrent())return;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if(signal?.aborted||!isCurrent())return;
  const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  const payload={client_id:clientId,framework_key:frameworkKey,kind,sha256,bytes:bytes.length,period_start:from,period_end:to};
  const fingerprint=JSON.stringify(payload);
  if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,key:recordUuid()};
  const {data}=await api.post('/reports/deliveries',payload,{headers:{'Idempotency-Key':pending.current.key},signal});
  if(signal?.aborted||!isCurrent())return;
  if(!data?.delivery_id||data.client_id!==clientId||data.framework_key!==frameworkKey||data.kind!==kind||data.sha256!==sha256)throw new Error('The report download could not be confirmed for this program.');
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
  for(const file of files) entries[file.path]=strToU8(csvRows(file.rows));
  if(config.copies && materials.evidenceCount) {
    const archive=await buildEvidenceArchive({clientId,params:evidenceParams(frameworkKey),signal,isCurrent});
    if(archive.fileCount!==materials.evidenceCount) throw new Error('The evidence selection changed. Refresh the package.');
    entries['08_Evidence/Stored-files.zip']=archive.bytes;
  }
  for(const [key,value] of Object.entries(decisions)) {
    if(value instanceof File) entries['09_Attachments/'+slug(key)+'-'+slug(value.name.replace(/\.[^.]+$/,''))+'.'+slug(value.name.split('.').pop())]=new Uint8Array(await value.arrayBuffer());
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
