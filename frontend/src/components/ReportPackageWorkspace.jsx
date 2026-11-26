import {useEffect,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,Download,FileText,Folder} from 'lucide-react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import api,{formatError} from '@/lib/api';
import NativeReportCatalog,{reportToday,validDay} from './NativeReportCatalog';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import {executiveModel,summaries,startFor,endFor} from './ReportExecutiveModel';
import {auditedDownload,csvRows,downloadAuditPackage,loadReportMaterials,packageFiles,readiness} from './ReportPackageFiles';
import './ReportPackageWorkspace.css';

const options=[
  ['open','Open action items and review exceptions','Include the outstanding work disclosed in the saved report.'],
  ['drafts','Draft policies','Approved policy versions are included by default.'],
  ['history','History tabs in each register','Approvals, review completions and decisions for the selected period.'],
  ['copies','Stored files','Evidence copies linked to the selected framework.']
];
function Panel({title,description,step,badge,children}) {
  return <section className="rp-panel"><header className="rp-head"><div><h2>{step&&<span className="rp-step">{step}</span>}{title}</h2>{description&&<p>{description}</p>}</div>{badge&&<span className="rp-chip">{badge}</span>}</header><div className="rp-body">{children}</div></section>;
}
function ExecutiveReport({materials,client,clientId,framework,actor,scopeKey,activeScope,today,current,files,setFiles}) {
  const [period,setPeriod]=useState('90'),[recipient,setRecipient]=useState('Client leadership'),[note,setNote]=useState('');
  const [sections,setSections]=useState(Object.fromEntries(summaries.map(([key])=>[key,true])));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[context,setContext]=useState(null),[positionsHistory,setPositionsHistory]=useState([]);
  const mounted=useRef(false),intent=useRef(null),request=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  useEffect(()=>{
    const abort=new AbortController();setContext(null);setPositionsHistory([]);
    api.get('/dashboard',{params:{client_id:clientId,scope:'org'},signal:abort.signal}).then(({data})=>{
      if(!abort.signal.aborted&&activeScope.current===scopeKey&&data?.client_id===clientId)setContext(data);
    }).catch(()=>{/* The executive report can still use its authorized saved report data. */});
    api.get('/portfolio/reporting/history',{params:{client_id:clientId,program_key:framework.key,range:'12m',include_archived:false},signal:abort.signal}).then(({data})=>{
      if(!abort.signal.aborted&&activeScope.current===scopeKey&&data?.client_id===clientId&&data?.program_key===framework.key&&Array.isArray(data.snapshots))setPositionsHistory(data.snapshots);
    }).catch(()=>{/* Historical positions can be unavailable to this report reader. */});
    return()=>abort.abort();
  },[clientId,framework.key,scopeKey,activeScope]);
  if(!materials)return null;
  const from=startFor(today,period),through=endFor(today,period);
  const {model,available,enabled}=executiveModel({materials,client,framework,actor,today,from,through,recipient,note,sections,context,positionsHistory});
  async function generate(){
    if(request.current||!current())return;
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');
    try{const {reportExecutivePdf}=await import('./ReportPackagePdf');if(!mounted.current||!current())return;
      const name='Executive-summary-'+today+'.pdf';await auditedDownload({content:reportExecutivePdf(model),name,type:'application/pdf',clientId,frameworkKey:framework.key,kind:'executive-summary',from,to:through,pending:intent,signal:controller.signal,isCurrent:()=>mounted.current&&current()});
      if(mounted.current&&current())setFiles(list=>[{name,when:new Date().toLocaleTimeString(),who:model.preparedBy},...list]);
    }catch(failure){if(mounted.current&&current())setError(formatError(failure));}finally{if(request.current===controller)request.current=null;if(mounted.current&&current())setBusy(false);}
  }
  return <div className="rp-layout rp-layout-internal"><div className="rp-stack">
    <Panel title="Executive summary" description="Program status, completed work, decisions and progress for leadership." badge="PDF">
      <div className="rp-control"><label htmlFor="exec-period">Period</label><select className="input" id="exec-period" value={period} onChange={e=>setPeriod(e.target.value)}>{[['90','Last 90 days'],['q','Last full quarter'],['ytd','Year to date'],['12','Last 12 months']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      <div className="rp-control"><label htmlFor="exec-for">Prepared for</label><input className="input" maxLength={120} id="exec-for" value={recipient} onChange={e=>setRecipient(e.target.value)}/></div>
      <div className="rp-group-label">Sections</div>{summaries.map(([key,label,help])=><label className="rp-check-field" key={key}><input type="checkbox" checked={enabled[key]} disabled={!available[key]} onChange={e=>setSections({...sections,[key]:e.target.checked})}/><span>{label}<small>{help}</small></span></label>)}
      <div className="rp-control"><label htmlFor="exec-note">Note from your GRC lead</label><textarea className="input" id="exec-note" placeholder="Add context for leadership" maxLength={650} value={note} onChange={e=>setNote(e.target.value)}/></div>
      <button type="button" className="cta" onClick={generate} disabled={busy}><Download size={15}/> Download PDF</button>{error&&<p role="alert">{error}</p>}
    </Panel><Panel title="History" description="Executive summaries downloaded in this session.">{files.length?<ul className="rp-history">{files.map((row,index)=><li key={index}>{row.name}<small>{row.who} · {row.when}</small></li>)}</ul>:<p className="rp-hint">No downloads in this session.</p>}</Panel>
    </div><Panel title="Preview" description={model.clientName+' · '+model.framework+' · '+model.period}><p>{model.headline}</p>{note&&<p>{note}</p>}<div className="rp-kpis">{model.kpis.map(([value,label])=><div className="rp-kpi" key={label}><b>{value}</b>{label}</div>)}</div>{enabled.readiness&&<><h3>Readiness by area</h3>{model.readiness.map(([name,[done,total]])=><p key={name}>{name} · {done} of {total}</p>)}</>}</Panel></div>;
}

export default function ReportPackageWorkspace({clientId,framework,scopeKey,activeScope,clientTimeZone,tab}) {
  const {user}=useAuth(),{currentClient}=useOrg(),today=reportToday(clientTimeZone);
  const [config,setConfig]=useState(()=>({start:startFor(today),end:today,auditor:'',open:true,drafts:false,history:true,copies:false}));
  const [materials,setMaterials]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [decisions,setDecisions]=useState({}),[opened,setOpened]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [summaryHistory,setSummaryHistory]=useState([]);
  const [showSingles,setShowSingles]=useState(false),[showCover,setShowCover]=useState(false);
  const mounted=useRef(false),exporting=useRef(null),auditIntent=useRef(null),prepIntent=useRef(null);
  const valid=validDay(config.start)&&validDay(config.end)&&config.start<=config.end&&config.end<=today;
  const cutoff=today;
  const current=()=>mounted.current&&activeScope.current===scopeKey;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;exporting.current?.abort();};},[]);
  useEffect(()=>()=>{exporting.current?.abort();},[tab]);
  useEffect(()=>{
    const controller=new AbortController();setMaterials(null);setError('');setMessage('');setDecisions({});setOpened({});
    if(validDay(cutoff)&&cutoff<=today)loadReportMaterials(clientId,framework.key,cutoff,controller.signal,()=>!controller.signal.aborted&&activeScope.current===scopeKey).then(value=>{
      readiness(value);if(!controller.signal.aborted&&activeScope.current===scopeKey)setMaterials(value);
    }).catch(failure=>{if(!controller.signal.aborted&&activeScope.current===scopeKey)setError(formatError(failure));});
    return()=>{controller.abort();exporting.current?.abort();};
  },[clientId,framework.key,scopeKey,activeScope,cutoff,today,revision]);
  const files=materials?packageFiles(materials,config):[],checks=materials?readiness(materials):[];
  const addressed=checks.filter(check=>!check.open||decisions[check.key]).length;
  const grouped=files.filter(file=>file.path.includes('/')).reduce((groups,file)=>{(groups[file.path.split('/')[0]]||=[]).push(file);return groups;},{});
  const count=materials?1+files.length+Object.values(decisions).filter(value=>value instanceof File).length+(config.copies&&materials.evidenceCount>0?1:0):null;
  function setting(key,value){setConfig(old=>({...old,[key]:value}));setMessage('');}
  function decide(key,value){setDecisions(old=>({...old,[key]:value}));setMessage('');}
  async function savePackage(preparation=false){
    if(exporting.current||!current()||!valid||!materials)return;
    const controller=new AbortController();exporting.current=controller;setBusy(true);setMessage('');setError('');
    try{
      const fresh=await loadReportMaterials(clientId,framework.key,cutoff,controller.signal,current);
      if(controller.signal.aborted||!current())return;
      if(checks.some((item,index)=>JSON.stringify(item)!==JSON.stringify(readiness(fresh)[index])) || JSON.stringify(files)!==JSON.stringify(packageFiles(fresh,config))||materials.cmmc?.materialStamp!==fresh.cmmc?.materialStamp) {
        setMaterials(fresh);setDecisions({});throw new Error('Saved records changed. Review the refreshed package before downloading.');
      }
      if(preparation) {
        const content=csvRows([['Check','Details','Response'],...checks.map(c=>[c.title,c.detail,decisions[c.key] instanceof File?'Attached '+decisions[c.key].name:decisions[c.key] || (c.open?'Open':'Ready')])]);
        await auditedDownload({content,name:'Preparation-checklist.csv',type:'text/csv;charset=utf-8',clientId,frameworkKey:framework.key,kind:'prep-checklist',from:config.start,to:config.end,pending:prepIntent,signal:controller.signal,isCurrent:current});
      } else await downloadAuditPackage({clientId,frameworkKey:framework.key,materials:{...fresh,cmmc:materials.cmmc},config,decisions,files,signal:controller.signal,isCurrent:current,pending:auditIntent});
      if(!controller.signal.aborted&&current())setMessage(preparation?'Preparation checklist download started.':'Audit package download started.');
    }catch(failure){if(!controller.signal.aborted&&current())setError(formatError(failure));}finally{if(exporting.current===controller)exporting.current=null;if(current())setBusy(false);}
  }
  const errors=error&&<p role="alert" className="rp-note">{error} <button type="button" className="link-btn" onClick={()=>setRevision(value=>value+1)}>Refresh</button></p>;
  if(tab==='internal')return <>{errors}{!materials&&!error?<p role="status">Loading saved report records…</p>:<ExecutiveReport {...{materials,client:currentClient,clientId,framework,actor:user?.name,scopeKey,activeScope,today,current}} files={summaryHistory} setFiles={setSummaryHistory}/>}</>;
  return <fieldset className="rp-workspace-fields" disabled={busy}>{errors}<div className="rp-layout"><div className="rp-stack">
    <Panel title="Scope" description="Set the reporting period, recipient and materials to include." step={1} badge={framework.name}>
      <div className="rp-two-fields"><div className="rp-control"><label htmlFor="rp-from">Activity period from</label><input className="input" type="date" id="rp-from" max={config.end} value={config.start} onChange={e=>setting('start',e.target.value)}/></div>
      <div className="rp-control"><label htmlFor="rp-through">Through</label><input className="input" type="date" id="rp-through" min={config.start} max={today} value={config.end} onChange={e=>setting('end',e.target.value)}/></div></div>
      <div className="rp-two-fields"><div className="rp-control"><label htmlFor="rp-auditor">Auditor or firm <small>(optional)</small></label><input className="input" id="rp-auditor" maxLength={120} placeholder="Assessor or firm name" value={config.auditor} onChange={e=>setting('auditor',e.target.value)}/></div><div className="rp-control"><label htmlFor="rp-prepared">Prepared by</label><input className="input" id="rp-prepared" readOnly value={materials?.reports.assessment.header.prepared_by?.name || user?.name || ''}/></div></div>
      <div className="rp-group-label">Include</div>{options.map(([key,label,help])=><label className="rp-check-field" key={key}><input type="checkbox" checked={config[key]} onChange={e=>setting(key,e.target.checked)}/><span>{label}<small>{help}</small></span></label>)}
      {!valid&&<p role="alert">Choose a valid reporting period ending on or before today.</p>}
    </Panel><Panel title="Readiness check" description="Review gaps and record how each item will be addressed for this package." step={2} badge={materials?addressed+' of '+checks.length+' checks addressed':''}>
      {!materials&&!error&&<p className="rp-hint" role="status">Loading saved report records…</p>}
      {checks.map(check=><div key={check.key} className="rp-check"><div className="rp-check-head">{check.open&&!decisions[check.key]?<AlertCircle size={19}/>:<CheckCircle2 size={19}/>}<div><b>{check.title}</b><p>{check.detail}</p></div>
        <div className="rp-actions rp-actions-end">{check.items.length>0&&<button type="button" className="ghost" aria-expanded={!!opened[check.key]} onClick={()=>setOpened({...opened,[check.key]:!opened[check.key]})}>{opened[check.key]?'Hide':'View'} {check.items.length}</button>}
        {check.open&&(decisions[check.key]?<><span>{decisions[check.key] instanceof File?'Attached':decisions[check.key]}</span><button className="link-btn" type="button" onClick={()=>decide(check.key,null)}>Undo</button></>:<><label className="ghost rp-attach">Attach file<input type="file" aria-label={'Attach file for '+check.title} accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8*1024*1024||!f.size||!(/\.(pdf|docx|xlsx|csv|txt|png|jpe?g)$/i.test(f.name))){setError('Choose a supported file up to 8 MB.');return;}decide(check.key,f);}}/></label><button type="button" className="ghost" onClick={()=>decide(check.key,'Provided separately')}>Provided separately</button></>)}</div></div>
        {opened[check.key]&&<ul className="rp-items">{check.items.map((item,index)=><li key={index}>{item}</li>)}</ul>}</div>)}
    </Panel><Panel title="Package contents" step={3} badge={count!==null?count+' files':''}>{materials&&<><p><FileText size={15}/> 00_Start-here.pdf</p>{files.filter(file=>!file.path.includes('/')).map(file=><p key={file.path}><FileText size={15}/> {file.path}</p>)}{Object.entries(grouped).map(([folder,records])=><details className="rp-folder" key={folder}><summary><Folder size={15}/> {folder} · {records.length} files</summary>{records.map(file=><p className="rp-file" key={file.path}><FileText size={15}/>{file.path.slice(folder.length+1)}<span className="rp-chip">Generated</span></p>)}</details>)}{config.copies&&materials.evidenceCount>0&&<p>08_Evidence/Stored-files.zip · {materials.evidenceCount} stored files</p>}{Object.entries(decisions).filter(([,value])=>value instanceof File).map(([key,value])=><p key={key}>09_Attachments · {value.name}</p>)}</>}</Panel>
    <details className="rp-panel rp-more" onToggle={event=>setShowSingles(event.currentTarget.open)}><summary className="rp-head"><div><h2>Single reports</h2><p>Download an individual register for a follow-up request.</p></div><span className="rp-chip">6 reports</span></summary>
      {showSingles&&<NativeReportCatalog {...{clientId,framework,scopeKey,activeScope,clientTimeZone}} singleReports/>}</details>
    </div><aside className="rp-stack rp-sticky"><Panel title="Audit package" description={[framework.name,config.start+' – '+config.end].join(' · ')}>
      {materials&&<div className="rp-progress"><div className="rp-meter"><span style={{width:100*addressed/checks.length+'%'}}/></div><b>{Math.round(100*addressed/checks.length)}%</b></div>}
      <dl className="rp-facts">{[['Files',count??'—'],['Size','Calculated on download'],['Provided separately',Object.values(decisions).filter(v=>v==='Provided separately').length],['Data as of',materials?.reports.assessment.header.as_of||'—']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><hr className="rp-rule"/>
      <button type="button" className="cta rp-full" disabled={!materials||!valid} onClick={()=>savePackage()}><Download size={15}/> {busy?'Preparing download…':'Download package (.zip)'}</button>
      <button type="button" className="ghost rp-full" disabled={!materials||!valid} onClick={()=>savePackage(true)}>Download prep checklist (.csv)</button><p className="rp-hint">Preparation comments and the prep checklist stay separate from the auditor package.</p>{message&&<p role="status">{message}</p>}
    </Panel><Panel title="Start here" description="The first file the auditor opens."><button type="button" className="rp-page" disabled={!materials} onClick={()=>setShowCover(true)}><FileText size={26}/> <span>00_Start-here.pdf</span></button><p className="rp-hint">Scope, file index, framework requests and items provided separately.</p></Panel></aside>
  </div><Dialog open={showCover} onOpenChange={setShowCover}><DialogContent><DialogTitle>Start here</DialogTitle><DialogDescription>{materials?.reports.assessment.header.client.name} · {framework.name}</DialogDescription><p>Activity period: {config.start} – {config.end}</p><p>Data as of: {materials?.reports.assessment.header.as_of}</p>{config.auditor&&<p>Auditor or firm: {config.auditor}</p>}<ul>{files.map(file=><li key={file.path}>{file.path}</li>)}</ul></DialogContent></Dialog></fieldset>;
}
