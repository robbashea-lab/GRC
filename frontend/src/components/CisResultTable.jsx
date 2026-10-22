import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {CisStatusPill} from './CisStatus';
import {verificationOf,VERIFICATION_LABELS} from './BrawndoCisControls';
import {operatorVocabulary} from '@/lib/frameworkOperator';
import {freshness,evidenceCurrent,directFindings,gapUntracked,verificationLadder} from '@/lib/cisVerification';

// Full-width filtered safeguard set. Assessment status (the conclusion) is shown
// separately from verification quality; one row opens one safeguard.
const SAVED_VERIFICATION_TONE={not_verified:'neutral',needs_validation:'moderate',gap_identified:'critical',verified:'success'};
const validCount=value=>Number.isInteger(value)&&value>=0;
const VERIFY={done:['success','Verified'],partial:['moderate','Not verified'],gap:['critical','Gap identified'],missing:['neutral','Not established']};
function Tag({tone,children}){return <span className={`cis-flag cis-tone-${tone}`}>{children}</span>;}

export default function CisResultTable({rows,onOpen,onManage,label,framework='cis-ig1',nativeFacts=false}){
  const today=new Date(),v=operatorVocabulary(framework),verificationLabel=nativeFacts?'Saved verification':'Verification';
  return <div className="cis-results" role="region" aria-label={`${label}: ${rows.length} ${v.items}`}>
    <table>
      <thead><tr><th scope="col">{v.item.charAt(0).toUpperCase()+v.item.slice(1)}</th><th scope="col">Assessment</th><th scope="col">{verificationLabel}</th><th scope="col">Evidence</th><th scope="col">Last assessed</th><th scope="col">Remediation</th></tr></thead>
      <tbody>{rows.map(r=>{
        const w=r.work||{},fresh=freshness(r,today),verified=nativeFacts?null:verificationLadder(r,{today}).find(s=>s.key==='validated');
        const saved=nativeFacts?verificationOf(r):null,[vt,vl]=nativeFacts?[SAVED_VERIFICATION_TONE[saved],VERIFICATION_LABELS[saved]]:r.status==='not_applicable'?['info','Not applicable']:VERIFY[verified.state];
        // Retained rows may lack the active workspace's joined-work projection.
        const evidenceKnown=!nativeFacts||w.context_complete===true&&validCount(w.evidence_count);
        const remediationKnown=!nativeFacts||w.context_complete===true&&validCount(w.overdue_actions)&&validCount(w.direct_findings??w.open_findings);
        const hasAssessmentDate=r.last_assessed!=null&&r.last_assessed!=='';
        const assessmentDateUnavailable=nativeFacts&&hasAssessmentDate&&!(typeof r.last_assessed==='string'&&Number.isFinite(Date.parse(r.last_assessed)));
        return <tr key={r.framework_assessment_id} data-testid={'requirement-'+r.definition_id}>
          <td><button type="button" className="cis-results-open" onClick={()=>onOpen(r)}><span className="cis-safeguard-id">{r.definition_id}</span><span className="min-w-0"><span className="cis-safeguard-title block">{r.title}</span><span className="block text-xs text-ink-muted">{r.control_name}</span></span></button><FrameworkRecordButton record={r} onManage={onManage}/></td>
          <td data-label="Assessment"><CisStatusPill status={r.status} framework={framework}/></td>
          <td data-label={verificationLabel}><Tag tone={vt}>{vl}</Tag></td>
          <td data-label="Evidence">{!evidenceKnown?<span className="text-xs text-ink-secondary">Unavailable</span>:nativeFacts&&w.evidence_count>0&&!(typeof w.latest_evidence_at==='string'&&Number.isFinite(Date.parse(w.latest_evidence_at)))?<span className="text-xs">{w.evidence_count} · Date unavailable</span>:!w.evidence_count?<Tag tone={r.status==='addressed'?'moderate':'neutral'}>No evidence</Tag>:evidenceCurrent(r,today)?<span className="text-xs">{w.evidence_count} · {w.latest_evidence_at}</span>:<Tag tone="moderate">Over 12 months</Tag>}</td>
          <td data-label="Last assessed">{assessmentDateUnavailable?<span className="text-xs text-ink-secondary">Assessment date unavailable</span>:fresh.state==='stale'?<Tag tone="moderate">{fresh.label}</Tag>:<span className="text-xs text-ink-secondary">{fresh.state==='never'?'Never':r.last_assessed.slice(0,10)}</span>}</td>
          <td data-label="Remediation">{!remediationKnown?<span className="text-xs text-ink-secondary">Unavailable</span>:<span className="cis-results-remediation">{w.overdue_actions>0&&<Tag tone="critical">{w.overdue_actions} overdue</Tag>}{directFindings(w)>0&&<Tag tone="neutral">{directFindings(w)} open Finding{directFindings(w)===1?'':'s'}</Tag>}{gapUntracked(r)&&<Tag tone="critical">Gap not tracked</Tag>}{!w.overdue_actions&&!directFindings(w)&&!gapUntracked(r)&&<span className="text-xs text-ink-muted">—</span>}</span>}</td>
        </tr>;})}</tbody>
    </table>
  </div>;
}
