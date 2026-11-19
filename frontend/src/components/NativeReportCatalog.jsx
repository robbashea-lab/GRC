import {useEffect,useRef,useState} from 'react';
import {Download,Eye,FileText} from 'lucide-react';
import api,{formatError,PREVIEW_MODE} from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

const types=[['assessment','Assessment report','Assessment results, domain coverage and items needing attention.'],['executive','Executive summary','Current position, significant risks and overdue work.'],['scope','Requirement gap list','Applicable requirements and saved assessment gaps.'],['risks','Risk register','Current risk scores, ownership and review dates.'],['vendors','Vendor register','Criticality, data access, assurance and renewal dates.'],['policies','Policy register','Document status, versions, owners and framework alignment.']];
function today(timeZone='UTC') {
  try {
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value=type=>parts.find(part=>part.type===type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch { return ''; }
}
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const formatsFor=(type,key)=>['risks','vendors','policies'].includes(type)?['pdf','csv']:type==='scope'&&key!=='soc-2'?['pdf','xlsx']:['pdf'];
const titleFor=(type,framework)=>type==='assessment'?`${framework.name} assessment report`:type==='scope'?framework.key==='iso-27001'?'Statement of Applicability':framework.key==='soc-2'?'SOC 2 readiness summary':framework.key==='cis-ig1'?'Safeguard gap list':'Requirement gap list':types.find(row=>row[0]===type)?.[1];
const safeCell=value=>value===null?'Not recorded':typeof value==='boolean'?value?'Yes':'No':String(value);

function verifiedPreview(data,clientId,frameworkKey){
  if(data?.header?.client?.id!==clientId||data.header.program?.key!==frameworkKey||typeof data.header.title!=='string'
    ||!Array.isArray(data.stats)||data.stats.some(stat=>typeof stat?.label!=='string'||stat.value!==null&&stat.value!==undefined&&!['string','number','boolean'].includes(typeof stat.value))
    ||!Array.isArray(data.sections)||!Array.isArray(data.allowed_formats)||data.allowed_formats.some(format=>!['pdf','csv','xlsx'].includes(format))
    ||data.sections.some(section=>typeof section.title!=='string'||!Array.isArray(section.columns)||!section.columns.every(value=>typeof value==='string')||!Array.isArray(section.rows)||section.rows.some(row=>!Array.isArray(row)||row.length!==section.columns.length||row.some(value=>value!==null&&!['string','number','boolean'].includes(typeof value)))))throw new Error('The report preview could not be verified for this client and program.');
  return data;
}

export default function NativeReportCatalog({clientId,framework,scopeKey,activeScope,clientTimeZone='UTC'}){
  const [asOf,setAsOf]=useState(()=>today(clientTimeZone)),[selection,setSelection]=useState(null),[preview,setPreview]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [history,setHistory]=useState(null),[historyError,setHistoryError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
  const request=useRef(null),exportRequest=useRef(null),exportIntent=useRef(null),mounted=useRef(false),previewRevision=useRef(0);
  const live=useRef(null);live.current={scopeKey,frameworkKey:framework.key,asOf};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();exportRequest.current?.abort();};},[]);
  useEffect(()=>{setHistory(null);setHistoryError('');const controller=new AbortController();
    api.get('/reports/history',{params:{client_id:clientId,framework_key:framework.key},signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted||activeScope.current!==scopeKey)return;
      if(!Array.isArray(data?.exports)||data.exports.some(row=>row.client_id!==clientId||row.framework_key!==framework.key||typeof row.export_id!=='string'))throw new Error('Export history could not be verified for this client.');
      setHistory(data.exports);
    }).catch(failure=>{if(!controller.signal.aborted&&activeScope.current===scopeKey)setHistoryError(formatError(failure));});
    return()=>controller.abort();
  },[clientId,framework.key,scopeKey,activeScope,revision]);
  useEffect(()=>{request.current?.abort();previewRevision.current++;setSelection(null);setPreview(null);setError('');setMessage('');setLoading(false);},[framework.key,asOf]);
  const valid=validDay(asOf)&&asOf<=today(clientTimeZone);
  const preferredFormat=type=>formatsFor(type,framework.key).find(format=>!PREVIEW_MODE||format!=='pdf')||'pdf';
  async function openPreview(type){
    if(!valid||activeScope.current!==scopeKey)return;
    request.current?.abort();const controller=new AbortController(),version=++previewRevision.current;request.current=controller;
    setSelection({type,format:'pdf'});setPreview(null);setError('');setLoading(true);
    try{const {data}=await api.get('/reports/preview',{params:{client_id:clientId,framework_key:framework.key,type,as_of:asOf},signal:controller.signal});
      if(!controller.signal.aborted&&activeScope.current===scopeKey&&version===previewRevision.current)setPreview(verifiedPreview(data,clientId,framework.key));
    }catch(failure){if(!controller.signal.aborted&&activeScope.current===scopeKey&&version===previewRevision.current)setError(formatError(failure));}
    finally{if(request.current===controller)request.current=null;if(!controller.signal.aborted&&version===previewRevision.current)setLoading(false);}
  }
  function close(){request.current?.abort();previewRevision.current++;setSelection(null);setPreview(null);setLoading(false);setError('');}
  async function download(row,controller){
    if(row.client_id!==clientId||row.framework_key!==framework.key||typeof row.export_id!=='string'||!['pdf','csv','xlsx'].includes(row.format))throw new Error('Export metadata could not be verified.');
    const {data}=await api.get(`/reports/exports/${encodeURIComponent(row.export_id)}/download`,{responseType:'blob',signal:controller.signal});
    if(controller.signal.aborted||!mounted.current||activeScope.current!==scopeKey)return;
    if(!(data instanceof Blob)||!data.size)throw new Error('The report service returned an empty file.');
    if(row.format==='pdf'&&data.type.split(';')[0]!=='application/pdf')throw new Error('The report service did not return a PDF.');
    const href=URL.createObjectURL(data),link=document.createElement('a');link.href=href;link.download=String(row.filename||`${row.type}.${row.format}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),1000);
    setMessage(`${row.format.toUpperCase()} download started.`);
  }
  async function exportReport(type,format='pdf',existing=null){
    if(exportRequest.current||!existing&&!valid||activeScope.current!==scopeKey||PREVIEW_MODE&&format==='pdf')return;
    const controller=new AbortController();exportRequest.current=controller;setBusy(true);setError('');setMessage('');const captured={scopeKey,frameworkKey:framework.key,asOf};
    try{
      const payload={client_id:clientId,framework_key:framework.key,type,format,as_of:asOf},intent=JSON.stringify(payload);
      if(!existing&&exportIntent.current?.intent!==intent)exportIntent.current={intent,key:recordUuid()};
      const row=existing||(await api.post('/reports/exports',payload,{headers:{'Idempotency-Key':exportIntent.current.key},signal:controller.signal})).data;
      if(controller.signal.aborted||activeScope.current!==scopeKey||live.current.frameworkKey!==captured.frameworkKey||!existing&&JSON.stringify(live.current)!==JSON.stringify(captured))return;
      if(row.type!==type||row.format!==format)throw new Error('The export service returned a different report or format.');
      await download(row,controller);if(!controller.signal.aborted&&activeScope.current===scopeKey){if(!existing)exportIntent.current=null;setRevision(value=>value+1);}
    }catch(failure){if(!controller.signal.aborted&&mounted.current&&activeScope.current===scopeKey)setError(formatError(failure));}
    finally{if(exportRequest.current===controller)exportRequest.current=null;if(mounted.current&&activeScope.current===scopeKey)setBusy(false);}
  }
  const allowed=preview?.allowed_formats||formatsFor(selection?.type,framework.key);
  return <section className="native-report-catalog" aria-label="Available reports">
    <div className="native-report-options"><label>As of<input type="date" aria-label="Report as of" value={asOf} max={today(clientTimeZone)} onChange={event=>setAsOf(event.target.value)}/></label><p>Preview and export saved records at a cutoff supported by the report service. Historical dates may be unavailable when a complete saved snapshot has not been retained.</p></div>
    {!valid&&<p role="alert">Choose a valid as-of date on or before today.</p>}
    {PREVIEW_MODE&&<p role="status" className="note">PDF reports are unavailable in Explore Demo. Native previews and supported data exports use the current Demo records.</p>}
    <div className="rep-grid">{types.map(([type,,description])=><article className="rep-card" key={type}><div className="rep-icon"><FileText size={20} aria-hidden="true"/></div><h2>{titleFor(type,framework)}</h2><p>{description}</p><div className="rep-format">{formatsFor(type,framework.key).map(format=>format.toUpperCase()).join(' · ')}</div><div className="rep-actions"><button type="button" className="ghost" disabled={!valid||busy} onClick={()=>openPreview(type)}><Eye size={15} aria-hidden="true"/>Preview</button><button type="button" className="ghost" disabled={!valid||busy} onClick={()=>{setError('');setSelection({type,format:preferredFormat(type),exportOnly:true});}}>Export</button></div></article>)}</div>
    {error&&!selection&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <section className="panel native-report-history" aria-labelledby="native-report-history"><div className="panel-head"><div><h2 className="panel-title" id="native-report-history">Export history</h2><p className="panel-desc">Actual generated exports for this client and program.</p></div></div>{historyError?<p role="alert" className="note">{historyError} <button type="button" onClick={()=>setRevision(value=>value+1)}>Retry history</button></p>:!history?<p role="status" className="note">Loading export history…</p>:history.length?<div className="table-scroll"><table><thead><tr>{['Report','Format','As of','Generated','Prepared by','Download'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{history.map(row=><tr key={row.export_id}><td>{row.title}</td><td>{row.format?.toUpperCase()}</td><td>{row.as_of}</td><td>{row.created_at}</td><td>{row.prepared_by?.name||'Not recorded'}</td><td><button type="button" className="ghost" disabled={busy||PREVIEW_MODE&&row.format==='pdf'} onClick={()=>exportReport(row.type,row.format,row)} aria-label={`Download ${row.title}`}><Download size={15}/></button></td></tr>)}</tbody></table></div>:<p className="note">No exports have been generated for this program.</p>}</section>
    <Dialog open={!!selection} onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent className={'native-report-dialog '+(selection?.exportOnly?'native-report-export':'')}><div className="m-head"><div><DialogTitle>{selection?.exportOnly?'Export report':'Report preview'}</DialogTitle><DialogDescription>{selection?.exportOnly?titleFor(selection.type,framework):'Generated from the current saved assessment'}</DialogDescription></div></div><div className="m-body">
      {selection?.exportOnly?<div className="native-report-export-options"><p>{titleFor(selection.type,framework)} · As of {asOf}</p><label>Format<select aria-label="Report export format" value={selection.format} disabled={busy} onChange={event=>setSelection({...selection,format:event.target.value})}>{formatsFor(selection.type,framework.key).map(format=><option key={format} value={format} disabled={PREVIEW_MODE&&format==='pdf'}>{format.toUpperCase()}{PREVIEW_MODE&&format==='pdf'?' — unavailable in Explore Demo':''}</option>)}</select></label>{PREVIEW_MODE&&formatsFor(selection.type,framework.key).every(format=>format==='pdf')&&<p role="status">PDF delivery requires an authenticated client workspace. Use Preview to inspect the saved Demo records.</p>}</div>:loading?<p role="status">Preparing the saved report preview…</p>:preview?<article className="rp-document"><header className="rp-head"><span className="rp-draft">DRAFT PREVIEW</span><p>{preview.header.client.name} · {preview.header.program.name} {preview.header.program.version}</p><h2>{preview.header.title}</h2><div className="rp-meta"><span>As of {preview.header.as_of}</span><span>Prepared by {preview.header.prepared_by?.name||'Not recorded'}</span><span>Lead {preview.header.lead?.name||'Not recorded'}</span></div></header><div className="rp-stats">{preview.stats.map((stat,index)=><div key={index}><span>{stat.label}</span><b>{stat.value??'Not recorded'}</b><small>{stat.detail}</small></div>)}</div>{preview.sections.map((section,index)=><section className="rp-section" key={index}><h3>{section.title}</h3><div className="table-scroll"><table><thead><tr>{section.columns.map((column,index)=><th scope="col" key={index}>{column}</th>)}</tr></thead><tbody>{section.rows.map((row,index)=><tr key={index}>{row.map((value,index)=><td key={index}>{safeCell(value)}</td>)}</tr>)}{!section.rows.length&&<tr><td colSpan={Math.max(1,section.columns.length)}>No saved records in this selection.</td></tr>}</tbody></table></div></section>)}<footer className="rp-footer"><p>{preview.header.qualifier||'Assessment progress and readiness, not a certification, attestation or auditor opinion.'}</p><p>Saved source cutoff: {preview.provenance?.framework_source_cutoff||'Not recorded'} · Read completed: {preview.provenance?.read_completed_at||'Not recorded'}</p><p>{preview.provenance?.consistency}</p></footer></article>:null}
      {error&&<p role="alert">{error}</p>}</div><footer className="m-foot"><button type="button" className="ghost" disabled={busy} onClick={close}>Close</button>{selection?.exportOnly?<button type="button" className="cta" disabled={busy||PREVIEW_MODE&&selection.format==='pdf'} onClick={()=>exportReport(selection.type,selection.format)}>{busy?'Preparing export…':'Export '+selection.format.toUpperCase()}</button>:<button type="button" className="cta" disabled={!preview||busy||PREVIEW_MODE||!allowed.includes('pdf')} onClick={()=>exportReport(selection.type,'pdf')}>{busy?'Preparing export…':'Export PDF'}</button>}</footer></DialogContent></Dialog>
  </section>;
}
