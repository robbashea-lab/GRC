import {useMemo,useState} from 'react';
import {Button} from './ui/button';
import {CisStatusPill} from './CisStatus';
import {groupRequirements,sectionSummary,nextAssessment} from '@/lib/frameworkWorkspace';
import {operatorVocabulary} from '@/lib/frameworkOperator';
import CisResultTable from './CisResultTable';

export function SoaTable({rows,onOpen}) {
  const [applicability,setApplicability]=useState('all');
  const visible=rows.filter(r=>applicability==='all'||(r.soa_applicability||'undetermined')===applicability);
  return <section className="space-y-3" aria-label="Statement of Applicability controls">
    <label className="text-sm">Applicability filter <select aria-label="Applicability filter" className="border border-line rounded p-2 bg-surface-card" value={applicability} onChange={e=>setApplicability(e.target.value)}>
      <option value="all">All controls</option><option value="included">Applicable</option><option value="excluded">Not Applicable</option><option value="undetermined">Undetermined</option>
    </select></label>
    <p className="text-xs text-ink-secondary">{visible.length} of {rows.length} controls in this view. Applicability is separate from implementation.</p>
    <div className="cis-results"><table><thead><tr><th>Annex A control</th><th>Applicability</th><th>Implementation</th><th>Supporting work</th></tr></thead>
      <tbody>{visible.map(r=><tr key={r.framework_assessment_id} data-testid={'requirement-'+r.definition_id}>
        <td><button className="cis-results-open" onClick={()=>onOpen(r)}><span className="cis-safeguard-id">{r.definition_id}</span><span>{r.title}</span></button></td>
        <td data-label="Applicability"><p className="text-sm">{({included:'Applicable',excluded:'Not Applicable'})[r.soa_applicability]||'Undetermined'}</p>{r.soa_applicability&&!r.soa_justification?.trim()&&<p className="text-xs text-semantic-critical">Justification needed</p>}</td>
        <td data-label="Implementation"><CisStatusPill status={r.status} framework="iso-27001"/></td>
        <td data-label="Supporting work"><span className="text-xs">{r.work?.evidence_count||0} Evidence · {r.work?.open_findings||0} open Findings</span></td>
      </tr>)}</tbody></table></div>
    {!visible.length&&<p role="status" className="text-sm">No controls match this applicability filter.</p>}
  </section>;
}

// Brawndo CIS IG1: one row per control, read left to right; opening a control keeps the existing drill-in.
function ControlTable({nodes,rows,choose,path}){
  const numbered=nodes.map(n=>{const m=/^Control\s+(\d+)\s*[—-]\s*(.+)$/.exec(n.label);return {n,num:m?Number(m[1]):null,name:m?m[2]:n.label,summary:sectionSummary(n.rows)};});
  const present=new Set(numbered.map(x=>x.num)),absent=[...Array(18)].map((_,i)=>i+1).filter(i=>!present.has(i));
  return <><table className="bcis-table"><thead><tr><th scope="col">#</th><th scope="col">Control</th><th scope="col">Assessed</th><th scope="col">Needs attention</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{numbered.map(({n,num,name,summary:s})=>{const applicable=s.total-(s.excluded||0),tone=!s.attention?'good':s.attention>=applicable?'critical':'attention';
      return <tr key={n.key} data-testid={'control-row-'+(num??n.key)}>
        <td className="bcis-num">{num??'—'}</td><td className="bcis-name">{name}</td>
        <td>{s.assessed} of {applicable}</td>
        <td><span className={`bcis-att is-${tone}`}>{s.attention?`${s.attention} of ${applicable}`:'None'}</span></td>
        <td className="text-right"><button type="button" className="bcis-open" onClick={()=>choose([...path,n.key])} aria-label={`Open ${n.label}`}>Open ›</button></td>
      </tr>;})}</tbody></table>
    <p className="bcis-foot">All {nodes.length} IG1 controls · {rows.length} safeguards.{absent.length&&present.size&&!present.has(null)?` Control${absent.length===1?'':'s'} ${absent.join(', ').replace(/, (\d+)$/,' and $1')} ${absent.length===1?'has':'have'} no IG1 safeguards.`:''}</p></>;
}

export default function FrameworkCategoryNavigator({framework,rows,onOpen,soa=false,preference,onSelect,layout}) {
  const roots=useMemo(()=>{
    const groups=groupRequirements(framework,rows);
    return framework==='iso-27001'&&groups.length===1?groups[0].children:groups;
  },[framework,rows]);
  const [path,setPath]=useState(preference||[]),[all,setAll]=useState(false),v=operatorVocabulary(framework);
  let nodes=roots,selected=null;const trail=[];
  for(const key of path){const match=nodes.find(n=>n.key===key);if(!match)break;trail.push(match);selected=match;nodes=match.children;}
  const choose=value=>{setPath(value);onSelect?.(value);setAll(false);};
  const currentRows=selected?.rows||rows;
  return <section className="space-y-4" aria-label="Framework categories">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {layout==='table'&&<h2 className="bcis-controls-title">Controls</h2>}
      <Button size="sm" variant="ghost" onClick={()=>choose([])}>{layout==='table'?'All controls':'Categories'}</Button>
      {trail.map((n,i)=><Button key={n.key} size="sm" variant="ghost" onClick={()=>choose(path.slice(0,i+1))}>{n.label}</Button>)}
      <Button className="ml-auto" size="sm" variant={all?'default':'outline'} aria-pressed={all} onClick={()=>setAll(!all)}>{all?'Back to categories':'All requirements'}</Button>
    </div>
    {layout==='table'&&!all&&!selected?<div className="bcis-card bcis-controls"><ControlTable nodes={nodes} rows={rows} choose={choose} path={path}/></div>:all||selected&&!nodes.length?(soa?<SoaTable rows={all?rows:currentRows} onOpen={onOpen}/>:<CisResultTable framework={framework} rows={all?rows:currentRows} onOpen={onOpen} label={all?'All requirements':selected.label}/>):<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      {nodes.map(n=>{const summary=sectionSummary(n.rows),next=nextAssessment(n.rows),undetermined=n.rows.filter(r=>!r.soa_applicability).length;return <article key={n.key} className="rounded-lg border border-line bg-surface-card p-4 flex flex-col gap-3">
        <h3 className="font-semibold text-sm leading-relaxed">{n.label}</h3>
        <p className="text-xs text-ink-secondary">{summary.total} {soa?'controls':v.items} · {summary.assessed} assessed{summary.excluded?' · '+summary.excluded+' N/A':''}</p>
        <p className="text-xs text-ink-secondary">{soa?undetermined+' applicability undetermined':summary.attention+' need attention'}{summary.findings?' · '+summary.findings+' open Findings':''}{summary.reviews?' · '+summary.reviews+' Reviews':''}</p>
        <div className="mt-auto flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>choose([...path,n.key])}>Open category</Button>{next&&<Button size="sm" variant="ghost" onClick={()=>onOpen(next)}>Continue assessment</Button>}</div>
      </article>;})}
    </div>}
  </section>;
}
