import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError,PREVIEW_MODE} from '@/lib/api';
import {canExportReports} from '@/lib/permissions';
import {BrawndoSurface,BrawndoPageHeader} from '@/components/BrawndoPage';
import {Button} from '@/components/ui/button';
import RegisterLoadError from '@/components/RegisterLoadError';
import './Reports.css';

function ReportForm({clientId,scopeKey,activeScope}){
  const [frameworks,setFrameworks]=useState(null),[frameworkKey,setFrameworkKey]=useState('');
  const [detail,setDetail]=useState('full'),[trendPeriod,setTrendPeriod]=useState('6m');
  const [loadError,setLoadError]=useState(''),[revision,setRevision]=useState(0);
  const [generating,setGenerating]=useState(false),[generateError,setGenerateError]=useState(''),[message,setMessage]=useState('');
  const downloadRequest=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    setFrameworks(null);setLoadError('');
    api.get('/reports/frameworks',{params:{client_id:clientId},signal:controller.signal})
      .then(({data})=>{
        if(controller.signal.aborted||activeScope.current!==scopeKey)return;
        if(!Array.isArray(data?.frameworks)||!data.frameworks.every(f=>typeof f?.key==='string'&&f.key&&typeof f?.name==='string'&&f.name))throw new Error('Enabled frameworks could not be verified.');
        setFrameworks(data.frameworks);setFrameworkKey(data.frameworks[0]?.key||'');
      }).catch(error=>{if(!controller.signal.aborted&&activeScope.current===scopeKey)setLoadError(formatError(error));});
    return()=>{controller.abort();downloadRequest.current?.abort();};
  },[clientId,scopeKey,activeScope,revision]);

  async function generate(event){
    event.preventDefault();
    if(downloadRequest.current||activeScope.current!==scopeKey||!frameworks?.some(f=>f.key===frameworkKey))return;
    const controller=new AbortController();downloadRequest.current=controller;
    setGenerating(true);setGenerateError('');setMessage('');
    try{
      const {data,headers}=await api.get('/reports/framework',{params:{client_id:clientId,framework_key:frameworkKey,detail,trend_period:trendPeriod},responseType:'blob',signal:controller.signal});
      if(controller.signal.aborted||activeScope.current!==scopeKey)return;
      if(!(data instanceof Blob)||!data.size||data.type.split(';')[0]!=='application/pdf')throw new Error('The report service did not return a PDF. Please try again.');
      const filename=/filename="?([^";]+)"?/i.exec(headers?.['content-disposition']||'')?.[1]||`${frameworkKey}-report.pdf`;
      const url=URL.createObjectURL(data),link=document.createElement('a');
      link.href=url;link.download=filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage('PDF download started.');
    }catch(error){
      let text=formatError(error);
      if(error?.response?.data instanceof Blob){
        try{const body=JSON.parse(await error.response.data.text());if(typeof body.detail==='string')text=body.detail;}catch{/* Keep the transport error when the response is not JSON. */}
      }
      if(!controller.signal.aborted&&activeScope.current===scopeKey)setGenerateError(text);
    }finally{
      if(downloadRequest.current===controller)downloadRequest.current=null;
      if(!controller.signal.aborted&&activeScope.current===scopeKey)setGenerating(false);
    }
  }
  const selected=frameworks?.find(f=>f.key===frameworkKey);
  return <div className="reports-body">
    <RegisterLoadError error={loadError} onRetry={()=>setRevision(n=>n+1)} name="enabled frameworks"/>
    {!frameworks&&!loadError&&<p role="status">Loading enabled frameworks…</p>}
    {frameworks?.length===0&&<p role="status">No supported framework is enabled for this client.</p>}
    {!!frameworks?.length&&<form onSubmit={generate} className="reports-form" aria-label="Generate framework report" aria-busy={generating}>
      <fieldset disabled={generating} className="reports-fields">
        {frameworks.length===1?<div><span className="reports-label">Framework/program</span><p className="reports-framework" data-testid="report-framework">{selected.name}</p></div>
        :<label htmlFor="reports-framework">Framework/program<select id="reports-framework" className="ui-control" value={frameworkKey} onChange={e=>{setFrameworkKey(e.target.value);setGenerateError('');setMessage('');}}>{frameworks.map(f=><option key={f.key} value={f.key}>{f.name}</option>)}</select></label>}
        {selected&&(selected.version||selected.scope)&&<p className="reports-scope">{[selected.version&&`Version ${selected.version}`,selected.scope].filter(Boolean).join(' · ')}</p>}
        <label htmlFor="reports-detail">Report detail<select id="reports-detail" className="ui-control" value={detail} onChange={e=>{setDetail(e.target.value);setMessage('');}}><option value="executive">Executive summary</option><option value="full">Full assessment</option></select></label>
        <label htmlFor="reports-trend">Trend period<select id="reports-trend" className="ui-control" value={trendPeriod} onChange={e=>{setTrendPeriod(e.target.value);setMessage('');}}><option value="30d">30 days</option><option value="6m">6 months</option><option value="12m">12 months</option></select></label>
      </fieldset>
      {generateError&&<p role="alert" className="reports-error">{generateError}</p>}
      <Button type="submit" disabled={generating||!selected} data-testid="generate-framework-report"><Download aria-hidden="true"/>{generating?'Generating PDF…':'Generate/download PDF'}</Button>
      {(generating||message)&&<p role="status">{generating?'Preparing the saved assessment snapshot…':message}</p>}
    </form>}
  </div>;
}

export default function Reports(){
  const {currentClientId,currentClient}=useOrg(),{user}=useAuth();
  const scopeKey=`${currentClientId}:${user?.user_id||user?.email}:${user?.role}:${!!user?.password_change_required}:${!!user?.all_clients}:${(user?.client_ids||[]).join(',')}`;
  const activeScope=useRef(scopeKey);activeScope.current=scopeKey;
  return <BrawndoSurface className="reports-page">
    <BrawndoPageHeader eyebrow={`${currentClient?.name||'Client'} · Framework reports`} title="Reports"/>
    {!canExportReports(user)?<p role="alert" className="reports-body">You do not have access to reports.</p>
      :!currentClientId?<p role="status" className="reports-body">Select a client to generate a report.</p>
      :PREVIEW_MODE?<p role="status" className="reports-body">PDF reports are unavailable in Explore Demo. Use an authenticated client workspace to export saved assessments.</p>
      :<ReportForm key={scopeKey} clientId={currentClientId} scopeKey={scopeKey} activeScope={activeScope}/>}
  </BrawndoSurface>;
}
