import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { formatError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useCreateIntent } from '@/lib/createIntent';
import { setupDraft, serviceCatalog } from '@/lib/r4ServicesTools';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
export default function IVentureSetup({
  clientId: provided
}) {
  const org = useOrg();
  const {
      currentClientId,
      currentClient,
      recoveryClientId
    } = org,
    clientId = provided || currentClientId || recoveryClientId,
    recoveryOnly = !provided && !currentClientId && !!recoveryClientId,
    {
      user,
      workspaceMode
    } = useAuth(),
    [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [entry, setEntry] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('todo'),
    [query, setQuery] = useState(''),
    [exclusion, setExclusion] = useState(null),
    [exclusionKind, setExclusionKind] = useState('spm'),
    [note, setNote] = useState('');
  const activeClient = useRef(clientId);
  activeClient.current = clientId;
  const editable = ['super_admin', 'platform_admin'].includes(user?.role) && currentClient?.status !== 'archived';
  const command = useCreateIntent(api.post, `${workspaceMode}:${user?.user_id}:r4-setup:${clientId}`, true);
  const load = useCallback(async () => {
    const {
      data
    } = await api.get(`/clients/${clientId}/iv-setup`);
    if(activeClient.current === clientId)setData(data);
    return data;
  }, [clientId]);
  useEffect(() => {
    let live = true;
    setData(null);
    setDraft(null);
    setEntry(null);
    setExclusion(null);
    setError('');
    setBusy(false);
    if (clientId && !recoveryOnly) api.get(`/clients/${clientId}/iv-setup`).then(({
      data
    }) => live && setData(data)).catch(e => live && setError(formatError(e)));
    return () => {
      live = false;
    };
  }, [clientId, recoveryOnly]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await command(`/clients/${clientId}/iv-setup`, draft);
      await load();
      if(activeClient.current !== clientId)return;
      setDraft(null);
      setEntry(null);
    } catch (e) {
      if(activeClient.current === clientId)setError(formatError(e));
    } finally {
      if(activeClient.current === clientId)setBusy(false);
    }
  }
  async function saveExclusion(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await command(`/clients/${clientId}/iv-setup/exclusion/${encodeURIComponent(exclusion.activity_id)}`, {
        expected_updated_at: exclusion.expected_updated_at ?? null,
        expected_client_updated_at: data.expected_client_updated_at ?? null,
        excluded: exclusion.state !== 'removed',
        ...(exclusion.state !== 'removed' ? {kind: exclusionKind, note} : {})
      });
      await load();
      if(activeClient.current !== clientId)return;
      setExclusion(null);
      setExclusionKind('spm');
      setNote('');
    } catch (e) {
      if(activeClient.current === clientId)setError(formatError(e));
    } finally {
      if(activeClient.current === clientId)setBusy(false);
    }
  }
  async function retryRecovery() {
    setBusy(true);
    setError('');
    try {
      await command.retry();
      await load();
      if(activeClient.current !== clientId)return;
      setDraft(null);
      setEntry(null);
      setExclusion(null);
      await org.refresh?.();
    } catch (error) {
      if(activeClient.current === clientId)setError(formatError(error));
    } finally {
      if(activeClient.current === clientId)setBusy(false);
    }
  }
  const all = data?.activities || [],
    technical = all.filter(a => !a.internal && a.provider_relevant),
    list = technical.filter(a => (tab === 'all' || tab === 'todo' ? tab === 'all' || ['todo', 'decide'].includes(a.state) : a.state === tab) && a.title.toLowerCase().includes(query.toLowerCase()));
  if (!clientId) return <p>Select an authorized client to view iVenture Setup.</p>;
  return <div className="space-y-4"><div className="page-head"><div><div className="eyebrow">INTERNAL · OPERATIONAL SETUP</div><h1 className="page-title">iVenture Setup</h1><p className="page-sub">Record recurring work established externally. Setup does not create a ticket, evidence or a completed Review.</p></div><Link className="ghost" to={'/client-profile?client_id=' + encodeURIComponent(clientId) + '&tab=services'}>Services &amp; Tools</Link></div>{error && <p role="alert" className="callout">{error}</p>}{editable&&command.unconfirmed()&&<button type="button" className="cta" disabled={busy} onClick={retryRecovery}>Retry unconfirmed save</button>}{!data ? <p>{recoveryOnly ? 'Client context is unavailable until the unfinished save is recovered.' : 'Loading applicable recurring activities…'}</p> : <><div className="kstrip"><span>To set up <b>{data.outstanding_count}</b></span><span>Set up <b>{technical.filter(a => a.state === 'done').length}</b></span><span>Removed <b>{technical.filter(a => a.state === 'removed').length}</b></span></div><section className="panel"><div className="toolbar"><input className="input" aria-label="Search setup activities" placeholder="Search activities" value={query} onChange={e => setQuery(e.target.value)} /><div className="tabs">{[['todo', 'To set up'], ['done', 'Set up'], ['removed', 'Removed'], ['all', 'All']].map(([id, label]) => <button type="button" className={'tab' + (tab === id ? ' on' : '')} key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div></div>{!list.length ? <p className="empty">No activities in this view.</p> : list.map(a => <div className="gt-row" style={{
          gridTemplateColumns: 'minmax(200px,1.5fr) minmax(120px,1fr) auto'
        }} key={a.activity_id}><div><b>{a.title}</b><p className="sub">{a.drivers.map(d => d.framework_key).join(' · ')} · {serviceCatalog.areas.find(s => s.id === a.area_id)?.name}</p>{a.exclusion && <p className="sub">{a.exclusion.reason}</p>}</div><div>{a.state === 'done' ? 'Set up' : a.state === 'decide' ? 'Who runs it isn’t set' : a.state === 'removed' ? 'Removed' : 'To set up'}<p className="sub">{a.setup?.recurring_ticket_number ? '#' + a.setup.recurring_ticket_number : 'No recurring ticket'}{a.first_next_due ? ' · ' + a.first_next_due : ''}</p></div><div className="flex flex-wrap gap-2">{editable && a.state !== 'removed' && <button className="ghost" type="button" disabled={busy || command.unconfirmed()} onClick={() => {
              setEntry(a);
              setDraft(setupDraft(a, data.expected_client_updated_at));
              setError('');
            }}>Set up / edit</button>}{a.review_id && <Link className="link-btn" to={'/reviews?client_id=' + encodeURIComponent(clientId) + '&review_id=' + encodeURIComponent(a.review_id)}>Open review</Link>}{editable && <button type="button" className="link-btn" disabled={busy || command.unconfirmed()} onClick={() => {
              setExclusion(a);
              setExclusionKind('spm');
              setNote('');
              setError('');
            }}>{a.state === 'removed' ? 'Restore' : 'Remove from setup'}</button>}</div></div>)}</section>{all.some(a => a.internal) && <section className="panel"><h2 className="panel-title">Security Program Manager activities</h2><p className="sub">Governance activities remain in Reviews; they do not require technical ticket setup.</p>{all.filter(a => a.internal).map(a => <p key={a.activity_id}>{a.title}</p>)}</section>}{all.some(a => !a.provider_relevant) && <details className="panel"><summary>Not iVenture-run</summary>{all.filter(a => !a.provider_relevant).map(a => <p key={a.activity_id}>{a.title}</p>)}</details>}</>}
    <Dialog open={!!draft} onOpenChange={open => !open && !busy && !command.unconfirmed() && setDraft(null)}><DialogContent><DialogHeader><DialogTitle>{entry?.title}</DialogTitle><DialogDescription>Saved configuration is shared with Reviews and the relevant guided assessment.</DialogDescription></DialogHeader>{draft && <form onSubmit={submit} className="space-y-3">{error && <p role="alert">{error}</p>}<fieldset disabled={busy || command.unconfirmed()} className="space-y-3"><label className="block">Who runs it<select className="select w-full" required value={draft.responsibility || ''} onChange={e => setDraft({
              ...draft,
              responsibility: e.target.value
            })}><option value="">Choose…</option>{serviceCatalog.responsibilities.filter(r => r.id !== 'un').map(r => <option value={r.id} key={r.id}>{r.label}</option>)}</select></label>{['iv', 'co'].includes(draft.responsibility) && <><label className="block">Recurring ticket number<input className="input w-full" required maxLength={33} value={draft.recurring_ticket_number} onChange={e => setDraft({
                ...draft,
                recurring_ticket_number: e.target.value
              })} /></label><label className="block">Ticket URL<input className="input w-full" type="url" maxLength={2048} value={draft.recurring_ticket_url} onChange={e => setDraft({
                ...draft,
                recurring_ticket_url: e.target.value
              })} /></label><label className="block">Ticket summary<input className="input w-full" maxLength={255} value={draft.recurring_ticket_summary} onChange={e => setDraft({
                ...draft,
                recurring_ticket_summary: e.target.value
              })} /></label><label className="block">Cadence<select className="select w-full" value={draft.cadence} onChange={e => setDraft({
                ...draft,
                cadence: e.target.value
              })}>{[['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['semiannual', 'Every six months'], ['annual', 'Annually'], ['custom', 'Custom interval']].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>{draft.cadence === 'custom' && <label>Interval in days<input className="input" type="number" required min={1} max={3660} step={1} value={draft.custom_days ?? ''} onChange={e => setDraft({
                ...draft,
                custom_days: e.target.value === '' ? null : Number(e.target.value)
              })} /></label>}<label className="block">First / next review<input className="input w-full" type="date" required value={draft.first_next_due || ''} onChange={e => setDraft({
                ...draft,
                first_next_due: e.target.value || null
              })} /></label></>}<label className="block">Internal notes<textarea className="input w-full" rows={3} maxLength={2000} value={draft.notes} onChange={e => setDraft({
              ...draft,
              notes: e.target.value
            })} /></label></fieldset><DialogFooter><button type="button" className="ghost" disabled={busy || command.unconfirmed()} onClick={() => setDraft(null)}>Cancel</button><button type={command.unconfirmed() ? 'button' : 'submit'} className="cta" disabled={busy} onClick={command.unconfirmed() ? retryRecovery : undefined}>{busy ? 'Saving…' : command.unconfirmed() ? 'Retry unconfirmed save' : 'Save setup'}</button></DialogFooter></form>}</DialogContent></Dialog>
    <Dialog open={!!exclusion} onOpenChange={open => !open && !busy && !command.unconfirmed() && setExclusion(null)}><DialogContent><DialogHeader><DialogTitle>{exclusion?.state === 'removed' ? 'Restore activity to setup' : 'Remove from iVenture Setup'}</DialogTitle><DialogDescription>{exclusion?.title} · The Review and its history are retained.</DialogDescription></DialogHeader><form onSubmit={saveExclusion}>{error && <p role="alert">{error}</p>}{exclusion?.state !== 'removed' && <fieldset disabled={busy || command.unconfirmed()} className="space-y-3">
      <legend>Why it doesn’t need a recurring iVenture ticket</legend>
      {[
        ['spm', 'The Security Program Manager performs it'],
        ['client', 'The client or another provider does it'],
        ['na', 'Doesn’t apply to this client']
      ].map(([value, label]) => <label key={value} className="flex gap-2"><input type="radio" name={'setup-removal-kind-' + clientId} value={value} checked={exclusionKind === value} onChange={() => setExclusionKind(value)} />{label}</label>)}
      <label className="block">Note (optional)<textarea className="input w-full" rows={3} maxLength={2000} placeholder="Anything the team should know, for example where the work is tracked" value={note} onChange={e => setNote(e.target.value)} /></label>
    </fieldset>}<DialogFooter><button type="button" className="ghost" disabled={busy || command.unconfirmed()} onClick={() => setExclusion(null)}>Cancel</button><button type={command.unconfirmed() ? 'button' : 'submit'} className="cta" disabled={busy} onClick={command.unconfirmed() ? retryRecovery : undefined}>{busy ? 'Saving…' : command.unconfirmed() ? 'Retry unconfirmed save' : exclusion?.state === 'removed' ? 'Save decision' : 'Remove from setup'}</button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
