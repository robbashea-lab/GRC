import {Button} from './ui/button';
import {Label} from './ui/label';
import {Textarea} from './ui/textarea';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';
import {RiskTreatmentField} from './BrawndoRiskFields';
import {DateReadonly} from './RegisterCells';
import {riskLevel} from '@/lib/grcWork';
import {actionStatus} from '@/lib/actionItems';
import {displayDay} from '@/lib/managementDates';
import {personLabel} from '@/lib/people';

const LIKELIHOOD_LABELS = { 1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Almost Certain" };
const IMPACT_LABELS = { 1: "Minimal", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Severe" };
const LEVEL_TONE = {
  critical: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  high: "pill-high",
  moderate: "pill-moderate",
  low: "bg-surface-subtle text-ink-secondary border-line",
};

export function RiskAssessmentPanel({form,setForm,riskPilot,canWrite,isPlatformAdmin}) {
  const liveScore = (parseInt(form.likelihood_score) || 0) * (parseInt(form.impact_score) || 0);
  const liveLevel = riskLevel(liveScore || null);
  return (
    <fieldset disabled={riskPilot&&(!canWrite||!isPlatformAdmin)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-ink-secondary">Likelihood (1–5)</Label>
          <Select value={String(form.likelihood_score || "")} onValueChange={(v) => setForm({ ...form, likelihood_score: parseInt(v) })}>
            <SelectTrigger data-testid="field-likelihood_score" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {LIKELIHOOD_LABELS[n]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-secondary">Impact (1–5)</Label>
          <Select value={String(form.impact_score || "")} onValueChange={(v) => setForm({ ...form, impact_score: parseInt(v) })}>
            <SelectTrigger data-testid="field-impact_score" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} · {IMPACT_LABELS[n]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-3 py-2 px-3 border border-line rounded-md bg-surface-subtle" data-testid="risk-live-score">
        <div className="text-xs font-mono uppercase tracking-widest text-ink-help">{riskPilot?"Current assessed risk":"Calculated"}</div>
        <div className="font-mono text-sm text-ink-primary">Score {liveScore || "—"}</div>
        <span className="text-ink-help">→</span>
        {liveLevel ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${LEVEL_TONE[liveLevel]}`}>{liveLevel}</span>
        ) : <span className="text-ink-help text-xs">select both</span>}
      </div>
      <div>
        <Label className="text-xs text-ink-secondary">Impact description</Label>
        <Textarea value={form.impact_description || ""} onChange={(e) => setForm({ ...form, impact_description: e.target.value })} rows={3} className="text-sm" data-testid="field-impact_description" />
      </div>
      {["likelihood_rationale","impact_rationale","assessment_rationale"].map(key=><div key={key}><Label>{key.replaceAll("_"," ")}</Label><Textarea aria-label={key.replaceAll("_"," ")} value={form[key]||""} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
    </fieldset>
  );
}

export function RiskTreatmentPanel({form,setForm,record,users,tasks=[],riskPilot,canWrite,isPlatformAdmin,clientFields,onOpen,onLinkAction}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-sm mb-2">Remediation Action Items</h3>
        {tasks.map(t=><button className="block w-full text-left text-sm border border-line rounded-md p-2 mb-2" key={t.task_id} onClick={()=>onOpen({kind:"tasks",record:t})}>{t.title} · {actionStatus(t.status)}</button>)}
        {!tasks.length&&<p className="text-sm text-ink-secondary mb-2">No linked remediation work yet.</p>}
        {canWrite&&<Button size="sm" variant="outline" className="mb-4" onClick={()=>onOpen({kind:"tasks",record:null,initialValues:{source_type:"risk",source_id:record.risk_id,assignee_id:record.owner_id||null}})}>Create Action Item</Button>}
        {canWrite&&<Button size="sm" variant="outline" className="mb-4 ml-2" onClick={onLinkAction}>Link existing Action Item</Button>}
        {riskPilot?<RiskTreatmentField form={form} setForm={setForm} disabled={!canWrite||!!clientFields&&!clientFields.has("treatment")}/>:<><Label className="text-xs text-ink-secondary">Treatment strategy</Label>
        <Select value={form.treatment || ""} onValueChange={(v) => setForm({ ...form, treatment: v })}>
          <SelectTrigger data-testid="field-treatment" className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {["mitigate", "accept", "transfer", "avoid", "monitor"].map((t) => (
              <SelectItem key={t} value={t} disabled={t === 'accept' && record?.treatment !== 'accept'}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select></>}
      </div>
      <div>
        <Label className="text-xs text-ink-secondary">Acceptance rationale</Label>
        <Textarea readOnly value={record?.acceptance_rationale || ""} rows={3} className="text-sm" data-testid="field-acceptance_rationale" />
        <p className="text-xs text-ink-secondary">Recorded by the acceptance action; renew acceptance to record a new decision.</p>
      </div>
      <div>
        <Label className="text-xs text-ink-secondary">Compensating controls</Label>
        <Textarea disabled={riskPilot&&(!canWrite||!isPlatformAdmin)} value={form.compensating_controls || ""} onChange={(e) => setForm({ ...form, compensating_controls: e.target.value })} rows={3} className="text-sm" data-testid="field-compensating_controls" />
      </div>
      <div>
        <Label className="text-xs text-ink-secondary">Notes / mitigation plan</Label>
        <Textarea disabled={riskPilot&&!canWrite} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="text-sm" data-testid="field-notes" />
        {riskPilot&&record?.treatment_plan&&<p className="text-sm mt-2 whitespace-pre-wrap">Recorded treatment plan: {record.treatment_plan}</p>}
      </div>
      {record?.acceptance_date && (
        <div className="border border-line rounded-md p-3 bg-surface-subtle text-xs space-y-1" data-testid="risk-acceptance-info">
          <div className="text-xs font-mono uppercase tracking-widest text-ink-help">Acceptance</div>
          <div><span className="text-ink-secondary">Approved by:</span> <span className="text-ink-primary font-medium">{record.accepted_by ? personLabel(users, record.accepted_by) : "—"}</span></div>
          <div><span className="text-ink-secondary">Accepted on:</span> <span className="font-mono">{displayDay(record.acceptance_date)}</span></div>
          {record.acceptance_expires_at && <div><span className="text-ink-secondary">Expires:</span> <span className="font-mono">{displayDay(record.acceptance_expires_at)}</span></div>}
        </div>
      )}
    </div>
  );
}

export function RiskHistoryPanel({record,users,riskHistory=[],onOpenOccurrence}) {
  const history = record?.rating_history || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DateReadonly label="Last reviewed" value={record?.last_reviewed} />
        <DateReadonly label="Next review" value={record?.next_review} />
        <DateReadonly label="Date identified" value={record?.date_identified} />
        <DateReadonly label="Created" value={record?.created_at} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Completed Risk Reviews</h3>
        {!riskHistory.length&&<p className="text-sm text-ink-secondary">No completed Risk Reviews recorded.</p>}
        {riskHistory.map(o=><button key={o.occurrence_id} className="block w-full text-left border border-line rounded-md p-3 mb-2 text-sm" onClick={()=>onOpenOccurrence(o)}><strong>{o.period}</strong><div>Scheduled {o.due_date?.slice(0,10)} · Completed {o.completed_at?.slice(0,10)} · {o.completed_by_name||personLabel(users,o.completed_by,'Not recorded')}</div><div>{o.outcome}</div></button>)}
        <div className="text-xs font-mono uppercase tracking-widest text-ink-help mb-2 mt-4">Rating history</div>
        {history.length === 0 ? (
          <div className="text-sm text-ink-muted">No rating changes recorded yet.</div>
        ) : (
          <ul className="space-y-2" data-testid="risk-rating-history">
            {[...history].reverse().map((h, i) => (
              <li key={i} className="border border-line rounded-md p-3 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-ink-primary">{h.by_name || personLabel(users, h.by, 'Not recorded')}</span>
                  <span className="font-mono text-ink-help">{new Date(h.at).toLocaleString()}</span>
                </div>
                <div className="text-ink-secondary">
                  Likelihood {h.prev_likelihood ?? "—"} → <strong>{h.new_likelihood ?? "—"}</strong> · Impact {h.prev_impact ?? "—"} → <strong>{h.new_impact ?? "—"}</strong>
                  {h.prev_score != null && <span className="text-ink-help ml-2">prev score {h.prev_score}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
