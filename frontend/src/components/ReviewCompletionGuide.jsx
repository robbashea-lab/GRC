import { useEffect, useRef, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { resultOptions, completionPayload, parseReviewCompletionGuide } from '@/lib/r4ReviewCompletion';
import { useCreateIntent } from '@/lib/createIntent';
import { useAuth } from '@/context/AuthContext';
function ServiceContext({ areas }) {
  return areas.map(area => (
    <p key={area.area_id}>
      {area.name} · {area.responsibility_label} · {area.tools.map(tool => tool.name).join(', ') || 'No tools recorded'}
    </p>
  ));
}

function RecordedTicket({ setup }) {
  if (!setup.recurring_ticket_number) return null;
  return (
    <p>
      Recurring ticket: #{setup.recurring_ticket_number}
      {setup.recurring_ticket_summary ? ' · ' + setup.recurring_ticket_summary : ''}
      {setup.recurring_ticket_url && <a href={setup.recurring_ticket_url} target="_blank" rel="noopener noreferrer"> · Open recorded ticket</a>}
    </p>
  );
}

function RecordedCheck({ step }) {
  return (
    <div className="border border-line rounded p-3">
      <p>{step.text || step.t}</p>
      <b>{resultOptions.find(([id]) => id === step.result)?.[1] || 'Not recorded'}</b>
      {(step.reason || step.note) && <p className="whitespace-pre-wrap">{step.reason || step.note}</p>}
    </div>
  );
}

function AnnualCoverageRecord({ occurrence }) {
  const source = occurrence.coverage_evaluation;
  return (
    <section className="space-y-3" aria-label="Annual policy coverage">
      <h3 className="panel-title">Covered by the annual policy-set Review</h3>
      <p>Source Review: {source.source_review_id} · occurrence {source.source_occurrence_id}</p>
      <p>The source Review’s recorded checks and support cover the listed policy versions.</p>
      {(occurrence.policy_coverage || []).map((member, index) => (
        <p key={member.policy_id || index}>Policy {member.policy_id} · version {member.version || 'Not recorded'} · approved subject {member.subject_id || 'Not recorded'}</p>
      ))}
      <RetainedCompletionDetails occurrence={source} />
    </section>
  );
}

export function ReviewCompletionRecord({ occurrence }) {
  return occurrence?.coverage_evaluation ? <AnnualCoverageRecord occurrence={occurrence} /> : <RetainedCompletionDetails occurrence={occurrence} />;
}

function RetainedCompletionDetails({ occurrence }) {
  const checklist = occurrence?.checklist || {},
    steps = occurrence?.checklist_results || checklist.steps || [],
    context = checklist.service_context || [],
    setup = occurrence?.activity_setup || {};
  if (!steps.length && !context.length && !occurrence?.checklist_outcome && !occurrence?.supporting_reference && !checklist.supporting_reference && !Object.keys(setup).length) return <p>No checklist or support context was recorded for this historical occurrence.</p>;
  return (
    <section className="space-y-3" aria-label="Retained completion record">
      <h3 className="panel-title">Completion record</h3>
      {occurrence?.checklist_outcome && <p>Review outcome: {occurrence.checklist_outcome}</p>}
      <ServiceContext areas={context} />
      <RecordedTicket setup={setup} />
      {steps.map((step, index) => <RecordedCheck key={step.step_id || index} step={step} />)}
      {!!checklist.required_support?.length && <p>Support recorded: {checklist.required_support.join('; ')}</p>}
      {(occurrence.supporting_reference || checklist.supporting_reference) && (
        <p className="whitespace-pre-wrap">Supporting result reference: {occurrence.supporting_reference || checklist.supporting_reference}</p>
      )}
    </section>
  );
}

function ChecklistStep({ step, value, disabled, onResult }) {
  return (
    <fieldset disabled={disabled} className="border border-line rounded p-3 space-y-2">
      <legend className="text-sm">{step.text}</legend>
      <div className="flex flex-wrap gap-3">
        {resultOptions.map(([id, label]) => (
          <label key={id}>
            <input type="radio" name={step.step_id} checked={value?.result === id} onChange={() => onResult(step, 'result', id)} /> {label}
          </label>
        ))}
      </div>
      {value && value.result !== 'Pass' && (
        <label className="block">
          {value.result === 'NMI' ? 'Who runs it and the handoff' : 'Reason'}
          <textarea className="input w-full" rows={2} maxLength={4000} value={value.reason || ''} onChange={event => onResult(step, 'reason', event.target.value)} />
        </label>
      )}
    </fieldset>
  );
}

function RequiredSupport({ labels }) {
  if (!labels.length) return null;
  return (
    <div>
      <span className="occ-l">SUPPORT TO RECORD</span>
      <div className="chip-row">{labels.map(label => <span className="mini-chip" key={label}>{label}</span>)}</div>
      <p className="sub">One current-occurrence attachment or explicit completed-result reference can support these checks. A recurring ticket schedules work; its number alone does not prove completion.</p>
    </div>
  );
}

function AcceptedCompletionProgress({ retry, guide }) {
  const request = retry.request;
  const sameContract = request.checklist?.contract_token === guide.contract_token;
  return (
    <div className="space-y-3" aria-label="Accepted completion awaiting recovery">
      <p>This completion was accepted on {retry.completed_at} by {retry.completed_by}. Its original results are retained. Use the completion control to retry the accepted save.</p>
      {!request.checklist && <p>This accepted completion predates the current checklist. Its original recorded result will be preserved.</p>}
      {request.outcome && <p>Review outcome: {request.outcome}</p>}
      {(request.checklist?.results || []).map(result => (
        <RecordedCheck key={result.step_id} step={{ ...result, text: sameContract ? guide.steps.find(step => step.step_id === result.step_id)?.text || result.step_id : result.step_id }} />
      ))}
      {request.completion_notes && <p className="whitespace-pre-wrap">{request.completion_notes}</p>}
      {request.supporting_reference && <p className="whitespace-pre-wrap">Supporting result reference: {request.supporting_reference}</p>}
    </div>
  );
}

function ChecklistEditor({ guide, disabled, busy, unconfirmed, onResult, onReference, onSave }) {
  if (guide.accepted_completion_retry) return <AcceptedCompletionProgress retry={guide.accepted_completion_retry} guide={guide} />;
  const readOnly = disabled || busy || guide.read_only;
  return (
    <>
      {!!guide.service_context.length && <div><span className="occ-l">WHERE TO LOOK</span><ServiceContext areas={guide.service_context} /></div>}
      {!guide.steps.length && <p>No supplied checklist for this Review. Its existing outcome and native requirements still apply.</p>}
      {guide.steps.map(step => (
        <ChecklistStep key={step.step_id} step={step} value={guide.results.find(result => result.step_id === step.step_id)} disabled={readOnly} onResult={onResult} />
      ))}
      <RequiredSupport labels={guide.required_support} />
      <label className="block">
        Supporting result reference
        <textarea className="input w-full" rows={3} maxLength={4000} disabled={readOnly} value={guide.supporting_reference} onChange={event => onReference(event.target.value)} />
      </label>
      {!disabled && !guide.read_only && <button type="button" className="cta" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : unconfirmed ? 'Retry unconfirmed checklist save' : 'Save checklist progress'}</button>}
    </>
  );
}
export default function ReviewCompletionGuide({
  reviewId,
  record,
  guide: controlled,
  onChange,
  onSaved,
  disabled = false
}) {
  const id = reviewId || record?.review_id,
    {
      user,
      workspaceMode
    } = useAuth();
  const [loaded, setLoaded] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const activeReview = useRef(id), latestGuide = useRef(null);
  const changeCallback = useRef(onChange);
  activeReview.current = id;
  useEffect(() => {changeCallback.current = onChange;}, [onChange]);
  const command = useCreateIntent(api.put, `${workspaceMode}:${user?.user_id}:r4-guide:${id}`, true);
  let guide = null, contractError = '';
  try {
    if (controlled || loaded) guide = parseReviewCompletionGuide(controlled || loaded);
  } catch (e) {
    contractError = e.message;
  }
  latestGuide.current = guide;
  useEffect(() => {
    let live = true;
    activeReview.current = id;
    setLoaded(null);
    setError('');
    setBusy(false);
    changeCallback.current?.(null);
    if (id) api.get(`/reviews/${id}/completion-guide`).then(({
      data
    }) => {
      if (live) {
        const parsed = parseReviewCompletionGuide(data);
        setLoaded(parsed);
        changeCallback.current?.(parsed);
      }
    }).catch(e => {
      if (live) {
        setLoaded(null);
        changeCallback.current?.(null);
        setError(formatError(e));
      }
    });
    return () => {
      live = false;
      if (activeReview.current === id) activeReview.current = null;
    };
  }, [id]); // A new parent callback must not reload the selected occurrence or erase its draft.
  function update(next) {
    const parsed = parseReviewCompletionGuide(next);
    setLoaded(parsed);
    changeCallback.current?.(parsed);
  }
  function result(step, key, value) {
    const current = guide.results.find(r => r.step_id === step.step_id) || {
      step_id: step.step_id,
      result: null,
      reason: ''
    };
    const results = guide.results.filter(r => r.step_id !== step.step_id);
    update({
      ...guide,
      results: [...results, {
        ...current,
        [key]: value
      }]
    });
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const payload = completionPayload(guide);
      delete payload.outcome;
      const retrying = command.unconfirmed();
      const submitted = retrying ? command.pendingRequest()?.[1] : payload;
      if (!submitted) throw new Error('The original checklist save could not be read. Reopen this Review before retrying.');
      const response = retrying ? await command.retry() : await command(`/reviews/${id}/completion-guide`, payload);
      // A receipt for an old Review/cycle must not overwrite its replacement or a closed drawer.
      if (activeReview.current !== id || latestGuide.current?.occurrence_id !== submitted.occurrence_id) return;
      let parsed;
      try {
        parsed = parseReviewCompletionGuide(response.data);
        if (parsed.occurrence_id !== submitted.occurrence_id) throw new Error('The saved checklist belongs to another occurrence. Reopen this Review before continuing.');
      } catch (e) {
        setLoaded(null);
        changeCallback.current?.(null);
        throw e;
      }
      const latest = latestGuide.current;
      const newerDraft = JSON.stringify([latest.results, latest.supporting_reference]) !==
        JSON.stringify([submitted.checklist?.results || [], submitted.supporting_reference || '']);
      // Retrying A acknowledges A. Edits B remain local and use the confirmed revision for their next explicit save.
      update(newerDraft ? {...latest, expected_updated_at: parsed.expected_updated_at} : parsed);
      onSaved?.(parsed);
    } catch (e) {
      if (activeReview.current === id) setError(formatError(e));
    } finally {
      if (activeReview.current === id) setBusy(false);
    }
  }
  if (!id) return null;
  return (
    <section className="panel space-y-4" aria-label="Review guide">
      <h3 className="panel-title">Review guide</h3>
      {(error || contractError) && <p role="alert">{error || contractError}</p>}
      {guide ? <ChecklistEditor guide={guide} disabled={disabled} busy={busy} unconfirmed={command.unconfirmed()} onResult={result} onReference={value => update({ ...guide, supporting_reference: value })} onSave={save} /> : (
        <p>{error || contractError ? 'The checklist is unavailable. Reopen this Review to try again.' : 'Loading the current checklist…'}</p>
      )}
    </section>
  );
}
