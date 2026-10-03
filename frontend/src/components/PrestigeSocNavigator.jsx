import {useEffect,useMemo,useState} from 'react';
import api from '@/lib/api';
import {SearchField} from './Register';
import {CIS_TONE} from './CisStatus';
import {CisBreadcrumb,VERIFICATION_LABELS,verificationOf} from './BrawndoCisControls';
import {groupRequirements,needsAttention,sectionSummary} from '@/lib/frameworkWorkspace';
import {socAssessmentDate} from '@/lib/socAssessmentDates';

// The SOC 2 reference workspace's conclusion labels (also used by its dashboard programme card).
export const SOC_STATUS_LABELS={addressed:'Implemented',in_progress:'Partially Implemented',needs_attention:'Not Implemented',not_assessed:'Not Assessed',not_applicable:'Not Applicable'};
const VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
const CATEGORY_LABELS={security:'Security — Common Criteria',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
const CATEGORY_CRUMBS={security:'Security',availability:'Availability',confidentiality:'Confidentiality',processing_integrity:'Processing Integrity',privacy:'Privacy'};
const activate=fn=>e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};
export const socCategoryLabel=key=>CATEGORY_LABELS[key]||key?.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export const socCategoryCrumb=key=>CATEGORY_CRUMBS[key]||socCategoryLabel(key);
export function SocStatusPill({status}){return <span className={`cis-pill cis-tone-${CIS_TONE[status]||'neutral'}`}><span className="cis-dot" aria-hidden="true"/>{SOC_STATUS_LABELS[status]||'Not Assessed'}</span>;}

export default function PrestigeSocNavigator({clientId,rows,visible,filtered,filterLabel,search,onSearch,onClear,path,onPath,onOpen,selected}){
  const [members,setMembers]=useState([]);
  useEffect(()=>{const c=new AbortController();if(clientId)api.get(`/clients/${encodeURIComponent(clientId)}/members`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setMembers(Array.isArray(r.data)?r.data:[]);}).catch(()=>{});return()=>c.abort();},[clientId]);
  const categories=useMemo(()=>groupRequirements('soc-2',rows||[]),[rows]);
  const category=!filtered&&categories.find(g=>g.id===path?.[0]);
  const group=category?.children?.find(g=>g.id===path?.[1]);
  const owner=id=>{const m=members.find(u=>u.user_id===id);return m?(m.name||m.email):id?'Owner unavailable':'Unassigned';};
  const crumbs=[{label:'SOC 2',onClick:()=>{onClear();onPath([]);}}];
  if(filtered)crumbs.push({label:filterLabel});
  else if(category){crumbs.push({label:socCategoryCrumb(category.id),onClick:()=>onPath([category.id])});if(group)crumbs.push({label:group.id,onClick:()=>onPath([category.id,group.id])});}
  if(selected)crumbs.push({label:selected.definition_id});
  const list=filtered?visible:group?.rows;
  return <section className="bcis-card bcis-controls" aria-label="Trust Services Categories">
    <div className="bcis-controls-bar"><CisBreadcrumb items={crumbs} label="SOC 2 location"/><div className="bcis-controls-tools">{filtered&&<button type="button" className="bcis-chip-clear" onClick={onClear}>Clear filter</button>}<SearchField value={search} onChange={onSearch} label="Search criteria" placeholder="Search by number or title…"/></div></div>
    {group&&<p className="bcis-control-name">{group.label.replace(/^\S+\s*[—-]\s*/,'').trim()}</p>}
    {list?<CriterionRows rows={list} owner={owner} onOpen={onOpen} label={filtered?filterLabel:group.label}/>:category?<GroupRows category={category} onPath={onPath}/>:<CategoryRows categories={categories} onPath={onPath} total={rows.length}/>}</section>;
}

function attentionLabel(rows){const count=rows.filter(needsAttention).length;return count?`${count} need${count===1?'s':''} attention`:'None';}
function CategoryRows({categories,onPath,total}){
  return <><table className="bcis-table"><thead><tr><th scope="col">Trust Services Category</th><th scope="col">Criteria</th><th scope="col">Assessed</th><th scope="col">Needs attention</th></tr></thead><tbody>{categories.map(c=>{const s=sectionSummary(c.rows),applicable=s.total-s.excluded;
    return <tr key={c.id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open ${socCategoryLabel(c.id)}`} data-testid={`soc-category-${c.id}`} onClick={()=>onPath([c.id])} onKeyDown={activate(()=>onPath([c.id]))}>
      <td className="bcis-name">{socCategoryLabel(c.id)}</td><td>{s.total}</td><td>{s.assessed} of {applicable}</td><td className={s.attention?'bcis-att is-attention':'bcis-att is-good'}>{attentionLabel(c.rows)}</td></tr>;})}</tbody></table><p className="bcis-foot">{total} in-scope criteria across {categories.length} Trust Services Categories.</p></>;
}
function GroupRows({category,onPath}){
  return <><table className="bcis-table"><thead><tr><th scope="col">Group</th><th scope="col">Criteria Group</th><th scope="col">Assessed</th><th scope="col">Needs attention</th></tr></thead><tbody>{category.children.map(g=>{const s=sectionSummary(g.rows),applicable=s.total-s.excluded;
    return <tr key={g.id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open ${g.label}`} data-testid={`soc-group-${g.id}`} onClick={()=>onPath([category.id,g.id])} onKeyDown={activate(()=>onPath([category.id,g.id]))}>
      <td className="bcis-num">{g.id}</td><td className="bcis-name">{g.label.replace(/^\S+\s*[—-]\s*/,'').trim()}</td><td>{s.assessed} of {applicable}</td><td className={s.attention?'bcis-att is-attention':'bcis-att is-good'}>{attentionLabel(g.rows)}</td></tr>;})}</tbody></table><p className="bcis-foot">{category.rows.length} criteria in {socCategoryLabel(category.id)}.</p></>;
}
function CriterionRows({rows,owner,onOpen,label}){
  if(!rows.length)return <p className="bcis-foot" role="status">No criteria match this view.</p>;
  return <table className="bcis-table bcis-safeguards" aria-label={`${label}: ${rows.length} criteria`}><thead><tr><th scope="col">Criterion</th><th scope="col">Implementation status</th><th scope="col">Verification</th><th scope="col">Owner</th><th scope="col">Last assessed</th></tr></thead><tbody>{rows.map(r=>{const v=verificationOf(r);
    return <tr key={r.framework_assessment_id} className="bcis-row" tabIndex={0} role="link" aria-label={`Open criterion ${r.definition_id} ${r.title}`} data-testid={`requirement-${r.definition_id}`} onClick={()=>onOpen(r)} onKeyDown={activate(()=>onOpen(r))}>
      <td><span className="bcis-sg"><span className="bcis-sg-id">{r.definition_id}</span><span className="bcis-name">{r.title}</span></span></td><td><SocStatusPill status={r.status}/></td><td><span className={`cis-flag cis-tone-${VERIFICATION_TONE[v]}`}>{VERIFICATION_LABELS[v]}</span></td><td>{owner(r.owner_id)}</td><td className="bcis-muted">{socAssessmentDate(r)}</td></tr>;})}</tbody></table>;
}
