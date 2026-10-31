import {useEffect,useId,useMemo,useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {SearchField} from './Register';
import {CisBreadcrumb} from './BrawndoCisControls';
import {CisStatusPill} from './CisStatus';
import CisResultTable from './CisResultTable';
import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {groupRequirements,hierarchyPath,sectionSummary} from '@/lib/frameworkWorkspace';
import {isoProgramMetrics} from '@/lib/isoProgramMetrics';
import './IsoProgramNavigator.css';

const VIEW_LABELS={soa:'Statement of Applicability',isms_clause:'ISMS Requirements',annex_control:'Annex A Controls'};
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]);
const activate=callback=>event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();callback();}};

export default function IsoProgramNavigator({clientId,view,rows,visible,filtered,filterLabel,search,onSearch,onClear,path,onPath,onOpen,onManage,selected}){
  const [expanded,setExpanded]=useState([]),[applicability,setApplicability]=useState('all');
  const panelPrefix=useId(),pathKey=JSON.stringify(path||[]);
  const roots=useMemo(()=>{
    const groups=groupRequirements('iso-27001',rows);
    return groups.length===1?groups[0].children:groups;
  },[rows]);
  const allNodes=useMemo(()=>flatten(roots),[roots]);
  const activePath=useMemo(()=>selected?hierarchyPath('iso-27001',selected)
    .map((_,index,parts)=>parts.slice(0,index+1).map(part=>part.id).join('/')):JSON.parse(pathKey),[selected,pathKey]);
  useEffect(()=>{setExpanded([]);setApplicability('all');},[clientId,view]);
  // Existing preferences use full hierarchy keys; selected deep links reveal the same group.
  useEffect(()=>{
    if(activePath.length)setExpanded(current=>activePath.every(key=>current.includes(key))?current:[...new Set([...current,...activePath])]);
  },[clientId,view,activePath]);
  const soa=view==='soa',title=VIEW_LABELS[view]||'ISO 27001 requirements';
  const applicabilityFiltered=soa&&applicability!=='all',filtering=filtered||applicabilityFiltered;
  const matching=visible.filter(row=>!applicabilityFiltered||(row.soa_applicability||'undetermined')===applicability);
  const hitIds=new Set(matching.map(row=>row.framework_assessment_id));
  const shownNodes=allNodes.filter(node=>!filtering||node.rows.some(row=>hitIds.has(row.framework_assessment_id)));
  const allExpanded=shownNodes.length>0&&shownNodes.every(node=>expanded.includes(node.key));
  const clear=()=>{setExpanded([]);setApplicability('all');onClear();onPath([]);};
  const trail=activePath.map(key=>allNodes.find(node=>node.key===key)).filter(Boolean);
  const crumbs=[{label:title,onClick:clear},...(filtering?[{label:applicabilityFiltered?`${filterLabel||'All controls'} · ${applicability==='included'?'Necessary':applicability==='excluded'?'Not Necessary':'Decision needed'}`:filterLabel}]:trail.map((node,index)=>({label:node.label,onClick:()=>onPath(trail.slice(0,index+1).map(part=>part.key))})))];
  const toggle=(node,ancestors)=>{
    const open=expanded.includes(node.key);
    setExpanded(current=>open?current.filter(key=>key!==node.key):[...current,node.key]);
    onPath(open?ancestors:[...ancestors,node.key]);
  };
  const renderNode=(node,ancestors=[])=>{
    const hits=node.rows.filter(row=>hitIds.has(row.framework_assessment_id));
    if(filtering&&!hits.length)return null;
    const open=filtering||expanded.includes(node.key),panelId=`${panelPrefix}-${node.key.replaceAll('/','-')}`;
    return <section className="iso-register-group" key={node.key}>
      <button type="button" className="iso-register-toggle" data-iso-group={node.key} disabled={filtering}
        aria-label={filtering?`${node.label}. Matching results stay expanded; clear filters to collapse.`:`Open ${node.label}`}
        aria-expanded={open} aria-controls={panelId} onClick={filtering?undefined:()=>toggle(node,ancestors)} onKeyDown={filtering?undefined:activate(()=>toggle(node,ancestors))}>
        <ChevronRight className="iso-register-chevron" aria-hidden="true"/>
        <span className="iso-register-name"><strong>{node.label}</strong><GroupInformation rows={node.rows} soa={soa}/></span>
        <GroupStatus rows={node.rows} soa={soa}/>
      </button>
      {open&&<div id={panelId} className="iso-register-panel">{node.children.length?node.children.map(child=>renderNode(child,[...ancestors,node.key])):
        soa?<SoaRows rows={hits} onOpen={onOpen} onManage={onManage} label={node.label}/>:<CisResultTable framework="iso-27001" rows={hits} onOpen={onOpen} onManage={onManage} label={node.label}/>}</div>}
    </section>;
  };
  return <section className="bcis-card iso-program-register" aria-label={`${title} register`}>
    <div className="iso-register-toolbar"><div><h2>{title}</h2><p>Expand groups to inspect requirements and supporting work.</p></div>
      <SearchField label="Search requirements" placeholder="Search by number or title…" value={search} onChange={onSearch}/>
      {soa&&<label className="iso-register-applicability">Applicability filter<select aria-label="Applicability filter" value={applicability} onChange={event=>setApplicability(event.target.value)}><option value="all">All controls</option><option value="included">Necessary</option><option value="excluded">Not Necessary</option><option value="undetermined">Decision needed</option></select></label>}
    </div>
    <div className="iso-register-summary"><CisBreadcrumb items={crumbs} label="ISO category location"/>
      {filtering?<button type="button" className="iso-register-link" onClick={clear}>Clear search and filters</button>:<button type="button" className="iso-register-link" onClick={()=>{setExpanded(allExpanded?[]:shownNodes.map(node=>node.key));if(allExpanded)onPath([]);}}>{allExpanded?'Collapse all':'Expand all'}</button>}
    </div>
    <p className="iso-register-result-count" role="status">{matching.length} of {rows.length} {view==='isms_clause'?'requirements':'records'} in this view.{soa&&' Applicability is separate from implementation.'}</p>
    {roots.map(node=>renderNode(node))}
    {!matching.length&&<p className="iso-register-empty" role="status">No {soa?'controls':'requirements'} match this view.</p>}
  </section>;
}

function GroupInformation({rows,soa}){
  const summary=sectionSummary(rows),metrics=isoProgramMetrics(rows),annex=rows.every(row=>row.specification==='annex_control');
  return <small>{soa?`${metrics.soa.decided} of ${metrics.soa.total} applicability decisions recorded`:annex?`${metrics.annex.implemented} of ${metrics.annex.total} applicable controls implemented`:`${metrics.requirements.implemented} of ${metrics.requirements.total} requirements implemented`}
    {(soa||annex)&&<span>{metrics.soa.excluded} excluded · {metrics.soa.undetermined} applicability not determined</span>}
    <span>{summary.assessed} assessed · {summary.attention} need attention</span>
    <span>{summary.findings} open Findings · {summary.reviews} linked Reviews</span>
  </small>;
}

function GroupStatus({rows,soa}){
  const metrics=isoProgramMetrics(rows),annex=rows.every(row=>row.specification==='annex_control'),counts=annex?metrics.annex:metrics.requirements;
  const segments=soa?[[metrics.soa.applicable,'Necessary','good'],[metrics.soa.excluded,'Not Necessary','attention'],[metrics.soa.undetermined,'Decision needed','neutral']]:
    [[counts.implemented,'Implemented','good'],[counts.partial,'Partially implemented','attention'],[counts.notImplemented,'Not implemented','critical'],[counts.notAssessed,'Not assessed','neutral']];
  const total=soa?metrics.soa.total:counts.total;
  return <span className="iso-register-status-bar" role="img" aria-label={segments.map(([count,label])=>`${label}: ${count}`).join(', ')}>{segments.filter(([count])=>count>0).map(([count,label,tone])=><i key={label} className={`is-${tone}`} style={{width:`${count/Math.max(total,1)*100}%`}} title={`${label}: ${count} of ${total}`}/>)}</span>;
}

function SoaRows({rows,onOpen,onManage,label}){
  return <div className="cis-results" role="region" aria-label={`${label}: ${rows.length} controls`}><table><thead><tr><th scope="col">Annex A control</th><th scope="col">Applicability</th><th scope="col">Implementation</th><th scope="col">Supporting work</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.framework_assessment_id} data-testid={`requirement-${row.definition_id}`}>
      <td><button type="button" className="cis-results-open" onClick={()=>onOpen(row)}><span className="cis-safeguard-id">{row.definition_id}</span><span>{row.title}</span></button><FrameworkRecordButton record={row} onManage={onManage}/></td>
      <td data-label="Applicability"><p>{row.soa_applicability==='excluded'?'Not Necessary':row.soa_applicability!=='included'?'Decision needed':row.status==='addressed'?'Necessary — Implemented':row.status==='not_assessed'?'Necessary — Not Implemented':'Necessary — Partially Implemented'}</p>{row.soa_applicability&&!row.soa_justification?.trim()&&<p className="iso-register-warning">Justification needed</p>}</td>
      <td data-label="Implementation"><CisStatusPill status={row.status} framework="iso-27001"/></td>
      <td data-label="Supporting work">{row.work?.evidence_count||0} Evidence · {row.work?.open_findings||0} open Findings</td>
    </tr>)}</tbody></table></div>;
}
