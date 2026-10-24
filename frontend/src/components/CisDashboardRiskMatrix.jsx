import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import api,{formatError} from '@/lib/api';
import {assessedRisk,riskLevel} from '@/lib/grcWork';
import {riskMatches,pilotRiskStatus} from '@/lib/brawndoRisks';
import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {personLabel} from '@/lib/people';
import {riskReviewDate} from '@/lib/brawndoRisksPresentation';
import {riskCoordinates} from './BrawndoRiskMatrix';
import {Dialog,DialogClose,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from './ui/tooltip';
import '@/pages/BrawndoDemoRisks.css';
import './CisDashboardRiskMatrix.css';

const countLabel=count=>`${count} ${count===1?'risk':'risks'}`;
const recordLabel=risk=>risk.display_id||risk.risk_id;

// The concept's literal cell palette is presentation, not another risk-band calculation.
function conceptCellColor(score,occupied){
  if(occupied)return score===12?'#f3c7ac':'#f6dfad';
  return score>=15?'#f8e9ed':score>=10?'#fbefeb':score>=5?'#fcf7ed':'#f3f6f9';
}

// The Risk register's all-active cohort and assessed tuple remain the source of truth.
export function dashboardActiveRisks(rows,clientId){
  if(!Array.isArray(rows)||rows.some(row=>!row||row.client_id!==clientId||typeof row.risk_id!=='string'||!row.risk_id.trim()))throw new Error('Risk register data is unavailable for this client.');
  // The native endpoint returns at most 1,000 complete records, rejecting larger registers.
  if(rows.length>1000)throw new Error('The Risk register response exceeds its supported limit. Open the Risk register for details.');
  return rows.map(assessedRisk).filter(row=>riskMatches(row,'all_active')).sort((a,b)=>
    (b.risk_score||0)-(a.risk_score||0)||String(recordLabel(a)).localeCompare(String(recordLabel(b)),undefined,{numeric:true})||String(a.risk_id).localeCompare(String(b.risk_id)));
}

export default function CisDashboardRiskMatrix({clientId,contextKey,refreshToken=0,theme,concept=false,clientName,members=[]}){
  const [nativeTheme]=useBrawndoTheme();
  const navigate=useNavigate(),registerLink=useRef(null),openingRequest=useRef(null),invoker=useRef(null),navigating=useRef(false);
  const [revision,setRevision]=useState(0),[loaded,setLoaded]=useState(null),[selection,setSelection]=useState(null),[opening,setOpening]=useState(null);
  const [hoveredCell,setHoveredCell]=useState(null);
  const scope=JSON.stringify([clientId,contextKey]),loadKey=JSON.stringify([scope,refreshToken,revision]);
  const currentScope=useRef(scope);currentScope.current=scope;
  usePortfolioRefresh(()=>setRevision(value=>value+1));
  useEffect(()=>{
    const controller=new AbortController();
    if(clientId)api.get('/risks',{params:{client_id:clientId},signal:controller.signal}).then(({data})=>{
      const rows=dashboardActiveRisks(data,clientId);
      if(!controller.signal.aborted&&currentScope.current===scope)setLoaded({key:loadKey,rows});
    }).catch(error=>{if(!controller.signal.aborted&&currentScope.current===scope)setLoaded({key:loadKey,error:formatError(error)});});
    return()=>controller.abort();
  },[clientId,scope,loadKey]);
  useEffect(()=>{setSelection(null);setOpening(null);setHoveredCell(null);openingRequest.current?.abort();return()=>openingRequest.current?.abort();},[scope]);
  const ready=loaded?.key===loadKey&&!loaded.error,loading=!!clientId&&loaded?.key!==loadKey,error=loaded?.key===loadKey?loaded.error:null;
  const rows=useMemo(()=>ready?loaded.rows:[],[ready,loaded]);
  const cells=useMemo(()=>{
    const result={};for(const row of rows){const coordinates=riskCoordinates(row)||'unrated';(result[coordinates]||=[]).push(row);}return result;
  },[rows]);
  const activeSelection=selection?.scope===scope?selection:null,selectedRows=activeSelection?cells[activeSelection.coordinates]||[]:[];
  const [selectedLikelihood,selectedImpact]=activeSelection?.coordinates.split(':')||[];
  const selectedScore=activeSelection?Number(selectedLikelihood)*Number(selectedImpact):null;
  function closeSelection(){openingRequest.current?.abort();setSelection(null);setOpening(null);}
  async function openRisk(risk){
    openingRequest.current?.abort();const controller=new AbortController();openingRequest.current=controller;
    const coordinates=activeSelection.coordinates;setOpening({id:risk.risk_id});
    try{
      const {data}=await api.get(`/risks/${encodeURIComponent(risk.risk_id)}`,{signal:controller.signal});
      if(controller.signal.aborted||currentScope.current!==scope)return;
      if(data?.risk_id!==risk.risk_id||data.client_id!==clientId)throw new Error('This risk is unavailable for the selected client.');
      if(!riskMatches(data,'all_active')||riskCoordinates(data)!==coordinates){
        setRevision(value=>value+1);throw new Error('This risk has changed. The matrix is refreshing; select its current cell to open it.');
      }
      navigating.current=true;setSelection(null);setOpening(null);
      navigate(`/risks?id=${encodeURIComponent(data.risk_id)}&client_id=${encodeURIComponent(clientId)}`);
    }catch(error){if(!controller.signal.aborted&&currentScope.current===scope)setOpening({error:formatError(error)});}
  }
  const selectionContent=<>
    {opening?.error&&<p role="alert">{opening.error}</p>}
    {error&&<p role="alert">Risks unavailable: {error} <button type="button" onClick={()=>setRevision(value=>value+1)}>Retry</button></p>}
    {ready&&!selectedRows.length&&<p>No active risks remain in this cell.</p>}
    <ul className="cis-dashboard-risk-list">{selectedRows.map(risk=><li key={risk.risk_id}><button type="button" disabled={!!opening?.id} onClick={()=>openRisk(risk)}>
      {concept?<>
        <span><b>{risk.title||'Untitled risk'}</b><small>{recordLabel(risk)} · {personLabel(members,risk.owner_id)} · Next review {riskReviewDate(risk.next_review)||(risk.next_review?'Date unavailable':'Not scheduled')}</small></span>
        <span className="cis-dashboard-risk-score" aria-label={`Score ${risk.risk_score}, band ${risk.risk_level}`}>{opening?.id===risk.risk_id?'Opening…':<>{risk.risk_score} <span aria-hidden="true">→</span></>}</span>
      </>:<>
        <span><b>{recordLabel(risk)}</b><strong>{risk.title||'Untitled risk'}</strong><small>{pilotRiskStatus(risk.status)} · L{risk.likelihood_score} × I{risk.impact_score}</small></span>
        <span className="cis-dashboard-risk-score">{opening?.id===risk.risk_id?'Opening…':<>Score {risk.risk_score}<small>{risk.risk_level}</small></>}</span>
      </>}
    </button></li>)}</ul>
  </>;
  return <section className="cis-dashboard-risk bpage brawndo-demo-risks" data-concept={concept?'true':undefined} data-theme={theme||nativeTheme} aria-label="Client risk matrix">
    <header><h2>Risk matrix</h2><Link ref={registerLink} to="/risks">Open risk register {concept?'→':'↗'}</Link></header>
    <p>{concept?'Active risks by current assessed likelihood and impact.':'Active client risks by current assessed likelihood and impact.'}</p>
    {!concept&&<p>Select an occupied cell to see its risks first.</p>}
    {loading&&<p role="status">Loading risks…</p>}
    {error&&<p role="alert">Risks unavailable: {error} <button type="button" onClick={()=>setRevision(value=>value+1)}>Retry</button></p>}
    <div className="bdr-matrix-wrap">
      <div className="bdr-matrix-y" aria-hidden="true">{[5,4,3,2,1].map(n=><span key={n}>{n}</span>)}</div>
      <TooltipProvider delayDuration={200}><div className="bdr-matrix" role="group" aria-label="Risk matrix: likelihood 5 to 1; impact 1 to 5">
        {[5,4,3,2,1].flatMap(l=>[1,2,3,4,5].map(i=>{
          const coordinates=`${l}:${i}`,score=l*i,risks=cells[coordinates]||[],count=risks.length,level=riskLevel(score);
          const cell=<button type="button" className={`bdr-cell is-${level}${count?' has-risks':''}`} disabled={!ready||!count}
            style={concept?{'--cc-risk-cell-fill':conceptCellColor(score,count>0)}:undefined}
            aria-haspopup={count?'dialog':undefined} aria-expanded={activeSelection?.coordinates===coordinates} aria-pressed={activeSelection?.coordinates===coordinates} aria-label={`Likelihood ${l}, impact ${i}, score ${score}, band ${level}: ${ready?countLabel(count):'count unavailable'}`}
            onClick={event=>{invoker.current={scope,element:event.currentTarget};setOpening(null);setSelection({scope,coordinates});}}>
            {count?<><strong>{score}</strong><small>{countLabel(count)}</small></>:<span>{score}</span>}
          </button>;
          return <Tooltip key={coordinates} open={!activeSelection&&hoveredCell===coordinates} onOpenChange={open=>setHoveredCell(previous=>open?coordinates:previous===coordinates?null:previous)}><TooltipTrigger asChild>{cell}</TooltipTrigger>{count>0&&!activeSelection&&<TooltipContent className={`cis-dashboard-risk-tooltip${concept?' cis-dashboard-concept-portal':''}`} data-concept={concept?'true':undefined} data-theme={concept?theme||nativeTheme:undefined} side={concept?'right':undefined} align={concept?'start':undefined} sideOffset={concept?12:4} collisionPadding={concept?10:12}>
            {concept?<><h3>Risk score {score} · {countLabel(count)}</h3><p>Likelihood {l} × impact {i}</p><ul>{risks.map(risk=><li key={risk.risk_id}>{risk.title||'Untitled risk'}</li>)}</ul><p>Select to review the risk list.</p></>:<>
              <strong>Likelihood {l} × impact {i} · score {score}</strong><span>{countLabel(count)}</span>
              <ul>{risks.map(risk=><li key={risk.risk_id}>{recordLabel(risk)} · {risk.title||'Untitled risk'}</li>)}</ul>
            </>}
          </TooltipContent>}</Tooltip>;
        }))}
      </div></TooltipProvider>
      <div className="bdr-matrix-x" aria-hidden="true">{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div>
      <div className="bdr-axis" aria-hidden="true"><span>↑ Likelihood</span><span>Impact →</span></div>
    </div>
    {concept&&<p className="cc-risk-caption">Select an occupied cell to see its risks first.</p>}
    {ready&&<p className={`cis-dashboard-risk-summary${concept&&!cells.unrated?.length?' sr-only':''}`}>{countLabel(rows.length)} · {cells.unrated?.length||0} unrated. Current assessed scores.</p>}
    <Dialog open={!!activeSelection} onOpenChange={open=>{if(!open)closeSelection();}}>
      <DialogContent className={`cis-dashboard-risk-selection${concept?' cis-dashboard-concept-portal':''}`} data-concept={concept?'true':undefined} data-theme={concept?theme||nativeTheme:undefined} showCloseButton={!concept} onCloseAutoFocus={event=>{
        event.preventDefault();if(navigating.current)return;
        const target=currentScope.current===invoker.current?.scope&&invoker.current?.element?.isConnected?invoker.current.element:registerLink.current;
        (target?.disabled?registerLink.current:target)?.focus({preventScroll:true});
      }}>
        {concept?<>
          <header className="cc-risk-selection-head"><div><p className="cc-risk-eyebrow">Current assessed risks</p>
            <DialogTitle>{ready?`${countLabel(selectedRows.length)} at score ${selectedScore}`:'Refreshing current risks…'}</DialogTitle>
            <DialogDescription>Likelihood {selectedLikelihood} × impact {selectedImpact}{clientName?` · ${clientName}`:''}</DialogDescription>
          </div><DialogClose className="cc-risk-close" aria-label="Close">×</DialogClose></header>
          <div className="cc-risk-selection-body">{selectionContent}</div>
        </>:<>
          <DialogTitle>Risks at likelihood {selectedLikelihood}, impact {selectedImpact}</DialogTitle>
          <DialogDescription>Select a risk to open its native register record. {ready?`${countLabel(selectedRows.length)} in this cell.`:'Refreshing current risks…'}</DialogDescription>
          {selectionContent}
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
