import {useEffect,useState} from 'react';
import {Plus,Search,Sun} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {catalog} from '@/lib/aiGovernance';
import {aiApproval,aiMatches,aiNeedsAttention,AI_VIEWS} from '@/lib/brawndoAI';
import {displayDay} from '@/lib/managementDates';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {AIIntakeView} from './AIIntake';
import './AdditionalAI.css';

const initials=name=>name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
// These reference tiles open the existing blank create form; they do not enroll tools or prefill governance facts.
const TOOL_CHOICES=[['ChatGPT','OpenAI'],['Microsoft 365 Copilot','Microsoft'],['Claude','Anthropic'],['Google Gemini','Google'],['GitHub Copilot','GitHub (Microsoft)']];

export function AdditionalAIOnboarding({data,error,busy,save,onChange,canWrite,clientName,systems,onCreate,canCreate}){
  const no=data?.usage==='no',indicators=data?.indicators||[];
  return <section className="baai-card" aria-labelledby="baai-onboarding"><div className="baai-overview baai-onboarding">
    <div className="baai-section-head"><div><h2 id="baai-onboarding">AI onboarding</h2><p>Three questions to start {clientName}'s AI inventory. Answers can change at any time.</p></div><span className={`baai-pill ${data?.usage==='yes'?'baai-pill-ok':no?'baai-pill-muted':'baai-pill-warn'}`}>{data?.usage==='yes'?`Uses AI · ${systems.length} system${systems.length===1?'':'s'} recorded`:no?'No AI use recorded':'Not confirmed'}</span></div>
    {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading AI intake…</p>}
    {data&&<fieldset disabled={!canWrite||busy} className="baai-intake-fields"><div className="baai-onboarding-step"><span className="baai-step-number">1</span><div className="baai-step-body"><b>Does {clientName} use AI?</b><div className="baai-segments" role="group" aria-label={`Does ${clientName} use AI?`}>{[['yes','Yes'],['no','No'],['unsure','Not sure']].map(([value,label])=><button type="button" key={value} aria-pressed={data.usage===value} onClick={()=>onChange({...data,usage:value})}>{label}</button>)}</div></div></div>
      <div className={`baai-onboarding-step${no?' baai-disabled':''}`}><span className="baai-step-number">2</span><div className="baai-step-body"><b>What does {clientName} use it for?</b><span className="baai-hint">Select all that apply.</span><div className="baai-indicators" role="group" aria-label="AI intake indicators">{catalog.intake_indicators.map(value=><button key={value} type="button" className="baai-toggle" aria-pressed={indicators.includes(value)} disabled={no} onClick={()=>onChange({...data,indicators:indicators.includes(value)?indicators.filter(item=>item!==value):[...indicators,value]})}>{value}</button>)}</div></div></div>
      <div className="baai-intake-save"><button type="button" className="baai-btn" onClick={save}>{busy?'Saving…':'Save AI intake'}</button></div>
    </fieldset>}
    <div className={`baai-onboarding-step${no?' baai-disabled':''}`}><span className="baai-step-number">3</span><div className="baai-step-body"><b>Which AI tools does {clientName} use?</b><span className="baai-hint">Select a tool to open a new AI system form. Confirm its details and screening before saving.</span><div className="baai-tools">{TOOL_CHOICES.map(([name,provider])=><button type="button" key={name} className="baai-tool" disabled={!canCreate||no} onClick={onCreate} aria-label={`Add ${name}: open new AI system form`}><b>{name}</b><small>{provider}</small><span>+ Add</span></button>)}<button type="button" className="baai-tool baai-tool-other" onClick={onCreate} disabled={!canCreate||no}><b>Other tool</b><small>Another AI system or use case</small><span>+ Add</span></button></div></div></div>
  </div></section>;
}

export default function AdditionalAI({clientId,clientName,rows,users,intake,canCreate,onOpen,onCreate,error,onRetry,query,view,showInactive,onSearch,onView,onShowInactive,intakeEditor}){
  const [theme,setTheme]=useBrawndoTheme();
  const [riskState,setRiskState]=useState({});
  useEffect(()=>{
    const controller=new AbortController();setRiskState({});
    api.get('/risks',{params:{client_id:clientId},signal:controller.signal}).then(({data})=>{
      if(!Array.isArray(data)||data.some(row=>row.client_id!==clientId))throw new Error('Client data mismatch');
      if(!controller.signal.aborted)setRiskState({clientId,rows:data});
    }).catch(loadError=>{if(!controller.signal.aborted)setRiskState({clientId,error:formatError(loadError)});});
    return()=>controller.abort();
  },[clientId,rows]);
  const risks=riskState.clientId===clientId?riskState.rows:null;
  const matches=(row,preset)=>preset==='attention'?aiNeedsAttention(row):aiMatches(row,preset,showInactive);
  const visible=rows.filter(row=>matches(row,view)&&[row.display_id,row.name,row.provider,row.description,row.product_model,row.environment,...(row.purposes||[])].join(' ').toLowerCase().includes(query.toLowerCase()));
  const figures=[['Systems','active'],['High risk','high'],['Pending approval','pending'],['Needing attention','attention']].map(([label,preset])=>[label,rows.filter(row=>matches(row,preset)).length,preset]);
  return <div className="brawndo-additional baai-page">
    <header className="baai-page-head"><div><h1>{clientName} AI Governance</h1><p>AI systems and use cases, screened for governance attention. Not a legal classification.</p></div><div className="baai-head-actions"><button type="button" className="baai-btn baai-ghost" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>setTheme(theme==='dark'?'light':'dark')}><Sun size={15} aria-hidden="true"/>{theme==='dark'?'Light':'Dark'}</button>{canCreate&&<button className="baai-btn baai-primary" type="button" data-testid="new-ai-system" onClick={onCreate}><Plus size={15} aria-hidden="true"/>New AI system</button>}</div></header>
    <AIIntakeView state={intakeEditor} render={state=><AdditionalAIOnboarding {...state} clientName={clientName} systems={rows} onOpen={onOpen} onCreate={onCreate} canCreate={canCreate}/>}/>
    {intake.usage==='no'&&<p className="baai-notice">AI usage is marked No. Historical records remain accessible; save updated intake before adding systems.</p>}
    {rows.length>0&&<section className="baai-card" aria-label="AI summary"><div className="baai-overview"><div className="baai-metrics">{figures.map(([label,count,preset])=><button type="button" key={label} aria-pressed={view===preset} onClick={()=>onView(preset)}><span>{label}</span><strong>{count}</strong></button>)}</div></div></section>}
    <section className="baai-card" aria-label="AI register"><div className="baai-filters"><label className="baai-search"><Search size={15} aria-hidden="true"/><span className="sr-only">Search AI systems</span><input type="search" placeholder="Search AI systems…" value={query} onChange={e=>onSearch(e.target.value)} data-testid="ai-system-search"/></label><div className="baai-segments" role="group" aria-label="Show AI systems">{AI_VIEWS.map(([key,label])=><button key={key} type="button" data-testid={`ai-system-view-${key}`} aria-pressed={view===key} onClick={()=>onView(key)}>{label}<span>{rows.filter(row=>matches(row,key)).length}</span></button>)}</div></div>
      {error&&<p role="alert" className="baai-empty">{error}<button type="button" onClick={onRetry}>Retry</button></p>}
      <div className="baai-table" role="table" aria-label="AI systems">{visible.length>0&&<div className="baai-thead" role="row">{['ID','AI system','Screening','Approval','Owner','Risk register',''].map((label,index)=><span role="columnheader" key={index}>{label||<span className="sr-only">Open record</span>}</span>)}</div>}
        {!visible.length&&<div className="baai-empty"><h3>{rows.length?'No AI systems match':'No AI systems recorded yet'}</h3><p>{rows.length?'Choose another view or clear the search.':'Record the tools and use cases the organization confirms. Each system keeps its native screening and approval workflow.'}</p>{!rows.length&&canCreate&&<button type="button" className="baai-btn baai-primary" onClick={onCreate}>New AI system</button>}{rows.length>0&&<button type="button" className="baai-btn" onClick={()=>{onSearch('');onView('active');onShowInactive(false);}}>Clear filters</button>}</div>}
        {visible.map(row=>{const owner=users.find(person=>person.user_id===row.owner_id),ownerName=owner?.name||owner?.email||(row.owner_id?'Owner unavailable':'Unassigned'),decision=row.approval_history?.at(-1),riskLinks=(row.related_links||[]).filter(link=>link.kind==='risks');return <div role="row" className="baai-row" key={row.ai_system_id} data-testid={`ai-system-row-${row.display_id}`} onClick={()=>onOpen(row)}>
          <div role="cell" className="baai-id">{row.display_id||'—'}</div><div role="cell" className="baai-item"><button className="baai-name" type="button" onClick={event=>{event.stopPropagation();onOpen(row);}}>{row.name}</button><div className="baai-meta">{[row.provider,row.status?.replaceAll('_',' '),row.purposes?.slice(0,2).join(', ')].filter(Boolean).join(' · ')}{row.alerts?.length>0&&<span className="baai-warn"> · {row.alerts.length} attention item{row.alerts.length===1?'':'s'}</span>}</div></div>
          <div role="cell" className="baai-screening"><span className={`baai-tier baai-tier-${row.risk_tier||'none'}`}><i aria-hidden="true"/>{row.risk_tier?row.risk_tier[0].toUpperCase()+row.risk_tier.slice(1):'Incomplete'}</span></div>
          <div role="cell" className="baai-approval"><span>{aiApproval(row)}</span>{decision&&<small>{[displayDay(decision.at),decision.by_name].filter(Boolean).join(' · ')}</small>}{row.approval_status==='pending_assessment'&&row.approval_history?.length>0&&<small className="baai-warn">Reassessment pending</small>}</div>
          <div role="cell" className="baai-owner"><i aria-hidden="true">{owner?initials(ownerName):'—'}</i><span>{ownerName}</span></div><div role="cell" className="baai-risks">{riskLinks.length?riskLinks.map(link=>{const risk=risks?.find(record=>record.risk_id===link.id);return <span key={link.id}>{risk?.display_id||(!risks&&!riskState.error?'Linked Risk':'Risk unavailable')}{risk&&<small>{risk.title||risk.name||'Linked'}</small>}</span>;}):<><span>Not linked</span><small>No Risk relationship recorded</small></>}</div><span className="baai-chevron" aria-hidden="true">›</span>
        </div>;})}
      </div>
      <div className="baai-summary"><span>{visible.length} of {rows.length} AI systems</span><label><input type="checkbox" checked={showInactive} onChange={e=>onShowInactive(e.target.checked)}/>Show Archived/Inactive</label></div>
    </section>
  </div>;
}
