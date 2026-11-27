import {frameworkKeys} from '../preview/approvedV3Records';
import {reportToday,validDay} from '../components/NativeReportCatalog';
import {loadReportMaterials,packageFiles,readiness,auditedDownload,downloadAuditPackage,csvRows} from '../components/ReportPackageFiles';
import {executiveModel,startFor,endFor} from '../components/ReportExecutiveModel';
import {clientDestination} from '../lib/clientSelection';
import {formatError} from '../lib/api';

const sheetType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const requiredOptions=['open','drafts','history','copies'];
const cmmcDocuments={'System-Security-Plan_working-draft.docx':'ssp','SPRS-score.xlsx':'sprs','Plan-of-action-and-milestones.xlsx':'poam'};

function workbench(clientId,frameworkKey,tab,reason) {
  const query=new URLSearchParams({reports_tab:tab});
  if(frameworkKey)query.set('framework_key',frameworkKey);
  return {workbench:{reason,url:clientDestination(clientId,'/reports?'+query)}};
}

export function approvedReportEvidence(records,clientId,program) {
  const frameworkKey=Object.hasOwn(frameworkKeys,program)?frameworkKeys[program]:null;
  return frameworkKey&&clientId?(records?.evidenceCatalog||[]).filter(row=>
    row.client_id===clientId&&!row.archived_at&&row.frameworks?.includes(frameworkKey)):[];
}

function packageSelections(request,config,materials) {
  const choices=Object.create(null), attachments=new Map(), used=new Set();
  for(const row of request.attachments || []) {
    if(attachments.has(row.key)||!(row.file instanceof File)||!row.file.size||row.file.size>8*1024*1024||
       !/\.(pdf|docx|xlsx|csv|txt|png|jpe?g)$/i.test(row.file.name))
      throw Error('Choose one supported file up to 8 MB for each package attachment.');
    attachments.set(row.key,row.file);
  }
  for(const item of request.decisions || []) {
    if(!item.label||!item.key)throw Error('Reopen Reports to check the package decisions.');
    if(item.group==='ev-copies'&&item.key.startsWith('ev-copies|')) {
      const evidenceId=item.key.slice('ev-copies|'.length);
      if(!materials.evidence.some(row=>row.evidence_id===evidenceId))
        throw Error('The framework evidence selection changed. Reopen the package before downloading.');
      if(item.status==='Reference only'||item.status==='Attached'){
        (config.referenceOnlyEvidenceIds||=[]).push(evidenceId);
        if(item.status==='Reference only')continue;
      }
    }
    if(['Comment added','Ticket linked'].includes(item.status))continue; // Preparation-only notes are excluded from the auditor package.
    if(Object.hasOwn(choices,item.label)&&!(choices[item.label]==='Provided separately'&&item.status==='Provided separately'))return null;
    // Where a policy-level choice cannot be represented, do not broaden the disclosure.
    if(item.status==='Provided separately' && !(config.copies&&materials.evidenceCount&&['ev-copies','pol-docs'].includes(item.group))) {
      choices[item.label]='Provided separately';
    }else if(item.status==='Attached'&&attachments.has(item.key)) {
      const file=attachments.get(item.key);
      if(Object.hasOwn(choices,item.label))return null;
      choices[item.label]=file;used.add(item.key);
    }else if(['Not included','Left out'].includes(item.status)&&item.group==='pol-draft'&&!config.drafts) {
      continue;
    }else return null;
  }
  return used.size===attachments.size?choices:null;
}

export function createApprovedReportDownloader({api,getScope,status}) {
  let active=false;
  const pending={current:null};
  return async function downloadReport(request,stillSelected) {
    const initial=getScope();
    const {actorId,clientId,sourceId,records}=initial;
    const currentClient=records?.clients?.find(client=>client.client_id===clientId&&client.source_client_id===sourceId);
    function isCurrent() {
      const scope=getScope();
      return scope.ready && scope.actorId===actorId && scope.clientId===clientId && scope.sourceId===sourceId && stillSelected();
    }
    function verifyScope(){if(!isCurrent())throw Error('The report selection changed. Reopen the selected client and framework.');}
    if(!actorId||!currentClient||sourceId!==request.sourceId||!isCurrent())
      throw Error('Reopen Reports for the selected saved client.');
    if(active)throw Error('Wait for the current report to finish.');
    const frameworkKey=Object.hasOwn(frameworkKeys,request.program)?frameworkKeys[request.program]:null;
    const tab=request.kind==='exec'?'internal':'audit';
    const fallback=reason=>workbench(clientId,frameworkKey,tab,reason);
    if(request.kind==='details')return workbench(clientId,frameworkKey,'details','Open the detailed report catalog for this saved client and framework.');
    if(!frameworkKey)return fallback('Choose an enabled framework in this client’s saved Reports workspace.');
    if(!['exec','zip','single','prep'].includes(request.kind))return fallback('Choose the report in this client’s saved Reports workspace.');
    const today=reportToday(currentClient.timezone||currentClient.time_zone||'UTC');
    const config={start:request.start,end:request.end,auditor:request.auditor||'',...Object.fromEntries(requiredOptions.map(key=>[key,request.options?.[key]]))};
    if(request.kind!=='exec'&&(!validDay(config.start)||!validDay(config.end)||config.start>config.end||config.end>today||
       requiredOptions.some(key=>typeof config[key]!=='boolean')))throw Error('Choose a valid reporting period and package options.');
    active=true;
    const signal=new AbortController().signal;
    try {
      status('Preparing the report from saved client records…');
      const materials=await loadReportMaterials(clientId,frameworkKey,today,signal,isCurrent);
      verifyScope();
      const header=materials.reports.assessment.header;
      if(header.client.id!==clientId||header.program.key!==frameworkKey||header.prepared_by?.id!==actorId)
        throw Error('The saved report does not match this client, program and account.');
      const delivery={clientId,frameworkKey,from:config.start,to:config.end,signal,isCurrent,pending};
      let name;
      if(request.kind==='exec') {
        const executive=request.executive||{},recipient=executive.forWho;
        if(!['90','q','12','ytd'].includes(executive.period)||!recipient||!executive.sections)
          throw Error('Choose a report period, recipient and sections.');
        if(recipient!=='Client leadership'&&!materials.registers.contacts.some(row=>row.name===recipient))
          throw Error('This recipient is no longer recorded in Contacts. Reopen Reports to choose a current recipient.');
        const from=startFor(today,executive.period),through=endFor(today,executive.period);
        const [dashboard,history]=await Promise.all([
          api.get('/dashboard',{params:{client_id:clientId,scope:'org'},signal}),
          api.get('/portfolio/reporting/history',{params:{client_id:clientId,program_key:frameworkKey,range:'12m',include_archived:false},signal})
        ]);
        verifyScope();
        if(dashboard.data?.client_id!==clientId || history.data?.client_id!==clientId ||
           history.data.program_key!==frameworkKey || !Array.isArray(history.data.snapshots))
          throw Error('The executive report context did not match the selected client and program.');
        const {model}=executiveModel({materials,client:currentClient,framework:header.program,actor:header.prepared_by.name,
          today,from,through,recipient,note:executive.note||'',sections:executive.sections,context:dashboard.data,positionsHistory:history.data.snapshots});
        const {reportExecutivePdf}=await import('../components/ReportPackagePdf');
        verifyScope();
        name='Executive-summary-'+today+'.pdf';
        await auditedDownload({...delivery,from,to:through,kind:'executive-summary',name,type:'application/pdf',content:reportExecutivePdf(model)});
      } else if(request.kind==='prep') {
        const checks=readiness(materials);
        const choices=(request.decisions||[]).map(d=>[d.label,d.text||'',d.status]);
        const content=csvRows([['Check','Details','Response'],...checks.map(c=>[c.title,c.detail,c.open?'Open':'Ready']),
          ...(choices.length?[[],['Package preparation choices','Note','Decision'],...choices]:[])]);
        name='Preparation-checklist.csv';
        await auditedDownload({...delivery,kind:'prep-checklist',name,type:'text/csv;charset=utf-8',content});
      } else {
        if(request.kind==='single'){
          const selected=packageFiles(materials,config).find(file=>file.path===request.path);
          const filename=selected?.path.split('/').pop();
          if(filename==='Policy-register.xlsx'&&config.drafts&&request.decisions?.some(d=>d.group==='pol-draft'&&['Not included','Left out'].includes(d.status)))
            return fallback('Confirm the individual draft policy exclusions in saved Reports before downloading this register.');
          if(selected?.cmmc&&frameworkKey==='cmmc'&&materials.cmmc?.level===2&&Object.hasOwn(cmmcDocuments,filename)){
            const {downloadApprovedCmmc}=await import('./cmmcCommands');
            await downloadApprovedCmmc({clientId,level:2,kind:cmmcDocuments[filename],api,isCurrent});
            verifyScope();status('Download started.');return {name:filename};
          }
          if(!selected?.sheets||!selected.path.endsWith('.xlsx'))return fallback('Open this client’s saved Reports workspace to select the available report or CMMC document.');
          const {reportWorkbook}=await import('../components/ReportPackageXlsx');
          verifyScope();
          name=selected.path.split('/').pop();
          await auditedDownload({...delivery,kind:'register-workbook',name,workbook:name,type:sheetType,content:reportWorkbook(selected.sheets)});
        }else {
          const decisions=packageSelections(request,config,materials);
          if(!decisions)return fallback('These item-level selections require a review in the saved Reports workspace. Confirm the package contents there before downloading.');
          await downloadAuditPackage({...delivery,materials,config,decisions,files:packageFiles(materials,config)});
        }
      }
      verifyScope();
      status('Download started.');
      return {name:name||'Audit package.zip'};
    }catch(error){if(error.response)throw Error(formatError(error));throw error;}
    finally{active=false;}
  };
}
