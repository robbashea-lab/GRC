import {Link} from 'react-router-dom';
import PageHeader from './PageHeader';
import {Button} from './ui/button';
import ClientRelationshipValue from './ClientRelationshipValue';
import {grcLead, primaryContact} from '@/lib/clientRelationships';
import {APPLICABILITY, currentHandoff, SETUP_FILTERS} from '@/lib/onboardingHandoff';

export default function OnboardingHandoff({snapshot, state, catalog, clientId, canManage}) {
  const data = currentHandoff(snapshot, clientId);
  const settings = canManage ? '/client-settings?tab=compliance' : '/requirements';
  const lead = grcLead(data.client), contact = primaryContact(data.client);
  return <div data-testid="onboarding-handoff">
    <PageHeader title="Onboarding complete" subtitle={`${data.client.name} · Current operational setup`} action={<Button asChild><Link to="/dashboard">Open Dashboard</Link></Button>}/>
    <div className="page-content max-w-7xl space-y-5">
      <p className="text-sm text-ink-secondary">Your baseline is configured. Complete the remaining setup in the operational modules; onboarding does not need to be repeated.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {['reviews','policies'].map(kind => <section key={kind} className="rounded-lg border border-line bg-surface-card p-5 space-y-3">
          <h2 className="font-semibold text-base">{kind === 'reviews' ? 'Reviews' : 'Policies'}</h2>
          <p className="text-sm text-ink-secondary">{kind === 'reviews' ? `${data.activeReviews} current Reviews · ${data.activeReviews-data.counts.reviews.scheduling} scheduled` : `${data.records.policies.length} Policy records · ${data.records.policies.filter(p=>p.presence==='verified_existing').length} verified existing`}</p>
          {Object.entries(SETUP_FILTERS[kind]).map(([key,f]) => !!data.counts[kind][key] && <div key={key} className="flex justify-between items-center gap-3 text-sm">
            <span data-testid={`handoff-${kind}-${key}`}><strong className="font-semibold tabular-nums">{data.counts[kind][key]}</strong> {f.label}</span>
            <Link className="text-link underline shrink-0" to={`/${kind}?setup=${key}`} aria-label={`Open ${f.label.toLowerCase()}`}>Open {kind === 'reviews' ? 'Reviews' : 'Policies'}</Link>
          </div>)}
          {!Object.values(data.counts[kind]).some(Boolean) && <p className="text-sm text-ink-secondary">{data.records[kind].length ? 'No outstanding setup in these categories.' : `No ${kind} configured. Add them when needed in the register.`}</p>}
          <Link className="inline-block text-sm text-link underline" to={`/${kind}`}>View all {kind === 'reviews' ? 'Reviews' : 'Policies'}</Link>
          {kind === 'policies' && <p className="text-xs text-ink-secondary">Reported existing is not verified. Verification and document follow-up remain in Policies.</p>}
        </section>)}
        <section className="rounded-lg border border-line bg-surface-card p-5 space-y-3">
          <h2 className="font-semibold text-base">People & ownership</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-ink-secondary">Primary Contact</p><ClientRelationshipValue client={data.client} primary/></div><div><p className="text-ink-secondary">GRC Lead</p><ClientRelationshipValue client={data.client}/></div></div>
          <p className="text-sm text-ink-secondary">{data.people.contacts} business Contacts · {data.people.active_client_users} active client platform Users</p>
          <p className="text-xs text-ink-secondary">Contacts do not require platform accounts. Internal GRC Users may own work where eligible.</p>
          {!!data.counts.reviews.ownership && !data.people.eligible_assignees_available && <p role="status" className="text-sm">No eligible users available for the unassigned Reviews. An administrator can review access; no accounts are created automatically.</p>}
          <div className="flex flex-wrap gap-4 text-sm"><Link className="text-link underline" to="/contacts">Manage people</Link>
            {(!data.client.assigned_owner_id || !data.client.primary_contact_id || lead.notice || contact.notice) && (canManage ? <Link className="text-link underline" to="/admin/clients">Configure client relationships</Link> : <span className="text-ink-secondary">Ask an administrator to review client relationships.</span>)}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-surface-card p-5 space-y-3">
          <h2 className="font-semibold text-base">Compliance & requirements</h2>
          {!data.programs.length && <p className="text-sm text-ink-secondary">No formal compliance programs apply. Continue with your general GRC program.</p>}
          {data.programs.map(f => <div key={f.key} className="text-sm"><Link className="font-medium text-link underline" to={`/compliance/${f.key}`}>{f.name}</Link><p className="text-ink-secondary mt-1">{f.implemented ? (f.assessments ? `${f.assessments} requirement assessments · ${f.not_assessed} not yet assessed` : 'Assessments not configured. Review program configuration.') : 'Program configured. Detailed requirement tracking is not yet available.'}</p></div>)}
          {!!data.unsurePrograms.length && <p className="text-sm">Confirm applicability: {data.unsurePrograms.map(f=>f.name).join(' · ')}.</p>}
          <Link className="text-link underline text-sm inline-block" to={settings}>Adjust program configuration</Link>
        </section>
      </div>
      <p className="text-xs text-ink-secondary">These counts reflect current client records, including later operational changes—not a completion-time snapshot or a compliance score.</p>
      <details className="rounded-lg border border-line bg-surface-card p-4"><summary className="cursor-pointer text-sm font-medium">View onboarding baseline</summary>
        <p className="text-xs text-ink-secondary mt-3">Saved intake responses. Current Policies and program applicability may differ; manage changes in their normal modules.</p>
        <div className="grid md:grid-cols-2 gap-5 mt-4 text-sm"><div><h3 className="font-semibold mb-2">Policies</h3>{catalog.policies.map(p=><p key={p.key}>{p.name} — {{yes:'Reported Existing',no:'Reported Missing',unsure:'Needs Confirmation'}[state.policies[p.key]] || 'Not recorded'}</p>)}</div><div><h3 className="font-semibold mb-2">Compliance</h3>{catalog.requirements.map(f=><p key={f.key}>{f.name} — {APPLICABILITY.find(([v])=>v===state.requirements[f.key])?.[1] || 'Not recorded'}</p>)}<h3 className="font-semibold mt-4 mb-2">General Review selections</h3>{catalog.reviews.filter(r=>state.reviews.includes(r.key)).map(r=><p key={r.key}>{r.name}</p>)}</div></div>
      </details>
    </div>
  </div>;
}
