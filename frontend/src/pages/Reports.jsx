import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {Link} from 'react-router-dom';
import {clientDestination} from '@/lib/clientSelection';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError,PREVIEW_MODE} from '@/lib/api';
import {canExportReports} from '@/lib/permissions';
import {BrawndoSurface} from '@/components/BrawndoPage';
import V3WorkspaceHeading from '@/components/V3WorkspaceHeading';
import ReportPackageWorkspace from '@/components/ReportPackageWorkspace';
import {Button} from '@/components/ui/button';
import RegisterLoadError from '@/components/RegisterLoadError';
import NativeReportCatalog from '@/components/NativeReportCatalog';
import './Reports.css';

function ReportForm({clientId,scopeKey,activeScope,clientTimeZone}){
  const [tab,setTab]=useState(()=>{
    const target=new URLSearchParams(window.location.search).get('reports_tab');
    return ['internal','details'].includes(target)?target:'audit';
  });
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
        const requested=new URLSearchParams(window.location.search).get('framework_key');
        const selected=data.frameworks.find(program=>program.key===requested)||data.frameworks[0];
        setFrameworks(data.frameworks);setFrameworkKey(selected?.key||'');
      }).catch(error=>{if(!controller.signal.aborted&&activeScope.current===scopeKey)setLoadError(formatError(error));});
    return()=>{controller.abort();downloadRequest.current?.abort();};
  },[clientId,scopeKey,activeScope,revision]);

  async function generate(event){
    event.preventDefault();
    if(PREVIEW_MODE||downloadRequest.current||activeScope.current!==scopeKey||!frameworks?.some(f=>f.key===frameworkKey))return;
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
  const entryQuery=new URLSearchParams(window.location.search);
  const initialPeriod=entryQuery.get('client_id')===clientId&&entryQuery.get('framework_key')===frameworkKey?
    {start:entryQuery.get('period_start'),end:entryQuery.get('period_end')}:null;
  return <div className="reports-body">
    <RegisterLoadError error={loadError} onRetry={()=>setRevision(n=>n+1)} name="enabled frameworks"/>
    {!frameworks&&!loadError&&<p role="status">Loading enabled frameworks…</p>}
    {frameworks?.length===0&&<p role="status">No supported framework is enabled for this client.</p>}
    {!!frameworks?.length&&<div className="approved-reports"><div className="rp-tabs" role="tablist" aria-label="Reports views">{[['internal','Internal reports'],['audit','Audit packages'],['details','Detailed reports']].map(([key,label],index)=><button type="button" key={key} id={'rp-tab-'+key} aria-controls="rp-view" className="rp-tab" role="tab" tabIndex={tab===key?0:-1} aria-selected={tab===key} onKeyDown={event=>{
      const keys={ArrowRight:(index+1)%3,ArrowLeft:(index+2)%3,Home:0,End:2};
      if(Object.hasOwn(keys,event.key)){event.preventDefault();event.currentTarget.parentElement.children[keys[event.key]].focus();setTab(['internal','audit','details'][keys[event.key]]);}
    }} onClick={()=>setTab(key)}>{label}{key==='audit'&&<small className="rp-chip">{selected?.name}</small>}</button>)}</div>
    {frameworks.length>1&&<div className="rp-framework"><label htmlFor="reports-framework">Framework</label><select id="reports-framework" className="input" value={frameworkKey} onChange={event=>{setFrameworkKey(event.target.value);setGenerateError('');setMessage('');}}>{frameworks.map(f=><option key={f.key} value={f.key}>{f.name}</option>)}</select></div>}
    <section id="rp-view" role="tabpanel" aria-labelledby={'rp-tab-'+tab}>{tab!=='details' ? <ReportPackageWorkspace key={frameworkKey} {...{clientId,scopeKey,activeScope,clientTimeZone,tab,initialPeriod}} framework={selected}/> : <><form onSubmit={generate} className="reports-form" aria-label="Generate framework report" aria-busy={generating}>
      <fieldset disabled={generating} className="reports-fields">
        {frameworks.length===1&&<div><span className="reports-label">Framework/program</span><p className="reports-framework" data-testid="report-framework">{selected.name}</p></div>}
        {selected&&(selected.version||selected.scope)&&<p className="reports-scope">{[selected.version&&`Version ${selected.version}`,selected.scope].filter(Boolean).join(' · ')}</p>}
        <label htmlFor="reports-detail">Report detail<select id="reports-detail" className="ui-control" value={detail} onChange={e=>{setDetail(e.target.value);setMessage('');}}><option value="executive">Executive summary</option><option value="full">Full assessment</option></select></label>
        <label htmlFor="reports-trend">Trend period<select id="reports-trend" className="ui-control" value={trendPeriod} onChange={e=>{setTrendPeriod(e.target.value);setMessage('');}}><option value="30d">30 days</option><option value="6m">6 months</option><option value="12m">12 months</option></select></label>
      </fieldset>
      {generateError&&<p role="alert" className="reports-error">{generateError}</p>}
      <Button type="submit" disabled={PREVIEW_MODE||generating||!selected} data-testid="generate-framework-report"><Download aria-hidden="true"/>{generating?'Generating PDF…':'Generate/download PDF'}</Button>
      {(generating||message)&&<p role="status">{generating?'Preparing the saved assessment snapshot…':message}</p>}
    </form>
    {selected?.key==='cmmc'&&<nav className="reports-fields" aria-label="CMMC working documents">
      {(selected.unit_name==='mapped checks'?[['ssp','System Security Plan']]:[['ssp','System Security Plan'],['poam','POA&M'],['sprs','SPRS Score']]).map(([key,label])=>
        <Link key={key} className="text-link underline" to={clientDestination(clientId,'/compliance/cmmc?cmmc_tab='+key)}>{label}</Link>)}
    </nav>}
    {selected&&<NativeReportCatalog key={frameworkKey+':'+clientTimeZone} clientId={clientId} framework={selected} scopeKey={scopeKey} activeScope={activeScope} clientTimeZone={clientTimeZone}/>}</>}</section></div>}
  </div>;
}

export default function Reports(){
  const {currentClientId,currentClient}=useOrg(),{user,workspaceMode}=useAuth();
  const scopeKey=JSON.stringify([currentClientId,user?.user_id||user?.email,user?.role,!!user?.password_change_required,!!user?.all_clients,user?.client_ids||[],workspaceMode,user?.workspace_mode]);
  const activeScope=useRef(scopeKey);activeScope.current=scopeKey;
  return <BrawndoSurface className="reports-page">
    <V3WorkspaceHeading clientName={currentClient?.name} title="Reports" subtitle="Executive summaries for leadership and audit packages for auditors"/>
    {!canExportReports(user)?<p role="alert" className="reports-body">You do not have access to reports.</p>
      :!currentClientId?<p role="status" className="reports-body">Select a client to generate a report.</p>
      :<ReportForm key={scopeKey} clientId={currentClientId} scopeKey={scopeKey} activeScope={activeScope} clientTimeZone={currentClient?.timezone||currentClient?.time_zone||'UTC'}/>}
  </BrawndoSurface>;
}
