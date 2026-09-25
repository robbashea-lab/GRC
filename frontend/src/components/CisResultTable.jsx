import {CisStatusPill} from './CisStatus';
import {freshness,evidenceCurrent,directFindings,gapUntracked,verificationLadder} from '@/lib/cisVerification';

// Full-width filtered safeguard set. Assessment status (the conclusion) is shown
// separately from verification quality; one row opens one safeguard.
const VERIFY={done:['success','Verified'],partial:['moderate','Not verified'],gap:['critical','Gap identified'],missing:['neutral','Not established']};
function Tag({tone,children}){return <span className={`cis-flag cis-tone-${tone}`}>{children}</span>;}

export default function CisResultTable({rows,onOpen,label}){
  const today=new Date();
  return <div className="cis-results" role="region" aria-label={`${label}: ${rows.length} safeguards`}>
    <table>
      <thead><tr><th scope="col">Safeguard</th><th scope="col">Assessment</th><th scope="col">Verification</th><th scope="col">Evidence</th><th scope="col">Last assessed</th><th scope="col">Remediation</th></tr></thead>
      <tbody>{rows.map(r=>{
        const w=r.work||{},fresh=freshness(r,today),verified=verificationLadder(r,{today}).find(s=>s.key==='validated');
        const [vt,vl]=r.status==='not_applicable'?['info','Not applicable']:VERIFY[verified.state];
        return <tr key={r.framework_assessment_id} data-testid={'requirement-'+r.definition_id}>
          <td><button type="button" className="cis-results-open" onClick={()=>onOpen(r)}><span className="cis-safeguard-id">{r.definition_id}</span><span className="min-w-0"><span className="cis-safeguard-title block">{r.title}</span><span className="block text-xs text-ink-muted">{r.control_name}</span></span></button></td>
          <td><CisStatusPill status={r.status}/></td>
          <td><Tag tone={vt}>{vl}</Tag></td>
          <td>{!w.evidence_count?<Tag tone={r.status==='addressed'?'moderate':'neutral'}>No evidence</Tag>:evidenceCurrent(r,today)?<span className="text-xs">{w.evidence_count} · {w.latest_evidence_at}</span>:<Tag tone="moderate">Over 12 months</Tag>}</td>
          <td>{fresh.state==='stale'?<Tag tone="moderate">{fresh.label}</Tag>:<span className="text-xs text-ink-secondary">{fresh.state==='never'?'Never':r.last_assessed.slice(0,10)}</span>}</td>
          <td><span className="cis-results-remediation">{w.overdue_actions>0&&<Tag tone="critical">{w.overdue_actions} overdue</Tag>}{directFindings(w)>0&&<Tag tone="neutral">{directFindings(w)} open Finding{directFindings(w)===1?'':'s'}</Tag>}{gapUntracked(r)&&<Tag tone="critical">Gap not tracked</Tag>}{!w.overdue_actions&&!directFindings(w)&&!gapUntracked(r)&&<span className="text-xs text-ink-muted">—</span>}</span></td>
        </tr>;})}</tbody>
    </table>
  </div>;
}
