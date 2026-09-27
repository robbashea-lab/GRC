import { seedStore, saveStore, readStore, resetStore } from '../store';
import { portfolio } from '../summaries';
import { evidenceReferences } from '../evidence';
import { assessedRisk } from '../../lib/grcWork';
import { reviewDrivers, reviewConfig, sharedFrameworkPlans } from '../../lib/frameworks';
import { auditProgress, auditPackage, auditQuarter } from '../../lib/isoAudit';
import axios from 'axios';
import { previewAdapter } from '../adapter';
import { demoOrganizations } from '../demoPortfolio';
const api = axios.create({
  adapter: previewAdapter
});
const CID = 'demo_initech',
  clock = new Date('2030-05-15T12:00:00Z');
test.each(['2028-02-29T00:00:00Z', '2030-01-01T23:59:59Z', '2030-12-31T00:00:00Z'])('Initech dates remain ordered at %s', value => {
  const db = seedStore(new Date(value));
  const reviews = db.reviews.filter(r => r.client_id === CID);
  expect(new Set(reviews.filter(r => r.iso_audit).map(r => auditQuarter(r.due_date))).size).toBe(4);
  for (const r of reviews) for (const o of r.occurrences || []) {
    expect(r.created_at <= o.completed_at).toBe(true);
    expect(o.completed_at <= value.slice(0, 10)).toBe(true);
  }
  expect(db.evidence.reduce((n, e) => n + (e.content_base64?.length || 0) * 2, 0)).toBeLessThanOrEqual(256 * 1024);
});
test('Initech is a deterministic connected three-framework operating client', () => {
  const db = seedStore(clock),
    again = seedStore(clock),
    own = k => db[k].filter(r => r.client_id === CID);
  expect(again).toEqual(db);
  expect(own('clients')[0].assigned_owner_id).toBe(CID + '_user_0');
  expect(own('requirements').filter(r => r.baseline_response === 'applies').map(r => r.baseline_key).sort()).toEqual(['cis-ig1', 'iso-27001', 'soc-2']);
  expect(own('framework_assessments').filter(a => a.framework_key === 'cis-ig1')).toHaveLength(56);
  expect(own('framework_assessments').filter(a => a.framework_key === 'iso-27001' && a.definition_id.startsWith('A.'))).toHaveLength(93);
  const access = own('reviews').filter(r => r.baseline_key === 'user-access');
  expect(access).toHaveLength(1);
  expect(new Set(reviewDrivers(access[0]).map(d => d.framework_key)).size).toBe(3);
  const group = sharedFrameworkPlans(db.baselines[CID]).find(p => p.baseline_key === 'user-access');
  expect(reviewConfig(db.baselines[CID], group)).toMatchObject({
    recurrence: 'quarterly',
    conflict: false
  });
  expect(group.drivers.filter(d => d.source_minimum)).toHaveLength(1);
  const control = own('organizational_controls').find(c => c.name === 'Access authorization and recertification');
  expect(own('organizational_controls')).toHaveLength(8);
  expect(new Set(control.assessment_ids.map(id => db.framework_assessments.find(a => a.framework_assessment_id === id).framework_key)).size).toBe(3);
  expect(own('framework_assessments').find(a => a.framework_key === 'soc-2' && a.definition_id === 'CC6.2').status).toBe('needs_attention');
  expect(own('framework_assessments').find(a => a.framework_key === 'cis-ig1' && a.definition_id === '5.1').status).toBe('addressed');
  expect(control.observations[0].design_snapshot.description).not.toBe(control.description);
  const eid = control.related_links.find(l => l.kind === 'evidence').id,
    refs = evidenceReferences(db, db.evidence.find(e => e.evidence_id === eid));
  expect(refs.map(r => r.kind)).toEqual(expect.arrayContaining(['reviews', 'organizational_controls', 'framework_assessments']));
  expect(refs.some(r => r.kind === 'reviews' && r.occurrence_id)).toBe(true);
  expect(refs.some(r => r.kind === 'organizational_controls')).toBe(true);
  expect(new Set(refs.filter(r => r.kind === 'framework_assessments').map(r => r.framework_key)).size).toBe(3);
  const audits = own('reviews').filter(r => r.iso_audit);
  expect(audits).toHaveLength(4);
  for (const r of audits) {
    expect(r.occurrences).toHaveLength(3);
    for (const o of r.occurrences) expect(auditProgress(o.iso_audit).complete).toBe(auditProgress(o.iso_audit).total);
  }
  expect(audits[2].status).toBe('in_progress');
  expect(audits[3].status).toBe('upcoming');
  expect(new Set(audits.map(r => auditQuarter(r.due_date))).size).toBe(4);
  const supplier = auditPackage(audits[1].iso_audit.package_key).items.find(i => i.definition_id === 'A.5.19');
  expect(audits[1].occurrences.at(-1).iso_audit.items[supplier.key]).toMatchObject({
    result: 'observation',
    finding_ids: [CID + '_finding_audit-supplier']
  });
  for (const r of own('risks')) expect({
    score: r.risk_score,
    level: r.risk_level
  }).toEqual({
    score: assessedRisk(r).risk_score,
    level: assessedRisk(r).risk_level
  });
  const findingStates = new Set(own('findings').map(f => f.status));
  for (const s of ['open', 'in_remediation', 'remediated', 'closed']) expect(findingStates.has(s)).toBe(true);
  for (const f of own('findings')) expect(own('tasks').filter(t => t.finding_id === f.finding_id)).toHaveLength(1);
  const soa = own('reviews').find(r => r.framework_plan_key === 'iso-soa-review');
  expect(soa.occurrences[0].iso_soa_snapshot.assessments).toHaveLength(93);
  expect(access[0].occurrences[0].completed_at < '2027-01-01').toBe(true);
  const counts = Object.fromEntries(['reviews', 'evidence', 'findings', 'tasks', 'policies', 'risks', 'vendors', 'assets', 'organizational_controls'].map(k => [k, own(k).length]));
  const metrics = portfolio(db, false, clock).clients.find(c => c.client_id === CID);
  console.info('INITECH_SCENARIO', JSON.stringify({
    counts,
    storeCharacters: JSON.stringify(db).length,
    payloadBytes: db.evidence.reduce((n, e) => n + (e.content_base64?.length || 0) * 2, 0),
    metrics: Object.fromEntries(['past_due', 'due_30d', 'unassigned', 'significant_risks', 'critical_high_findings'].map(k => [k, metrics[k]]))
  }));
  expect(metrics.past_due).toBeGreaterThanOrEqual(2);
  expect(metrics.past_due).toBeLessThanOrEqual(4);
  expect(metrics.unassigned).toBeGreaterThanOrEqual(1);
  expect(metrics.unassigned).toBeLessThanOrEqual(3);
  expect(metrics.significant_risks).toBe(1);
  expect(own('risks').map(r => r.status)).toEqual(['in_progress', 'assessed', 'accepted', 'closed']);
  expect(db.evidence.reduce((n, e) => n + (e.content_base64?.length || 0) * 2, 0)).toBeLessThanOrEqual(256 * 1024);
  saveStore(db);
  expect(readStore()).toEqual(db);
  // Optional local browser fixture: never imported by a deployed application.
  if(process.env.INITECH_QA_EXPORT_DIR){
    const fs=require('fs'),path=require('path'),dir=process.env.INITECH_QA_EXPORT_DIR,exported=seedStore();
    fs.mkdirSync(dir,{recursive:true});
    for(const [key,cid] of [['cis-ig1','demo_brawndo'],['iso-27001','demo_dunder'],['soc-2','demo_prestige'],['multi-framework',CID]]){
      const store=Object.fromEntries(Object.entries(exported).map(([k,v])=>[k,Array.isArray(v)&&k!=='users'?v.filter(r=>r.client_id===cid):v]));
      fs.writeFileSync(path.join(dir,key+'.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,store,
        ...(cid===CID?{qa_personas:{provider:CID+'_user_0',contributor:CID+'_user_2',reader:CID+'_user_6'}}:{})}));
    }
  }
});
test('reset restores Initech without mutating standard session material', () => {
  sessionStorage.clear();
  localStorage.setItem('standard-sentinel', 'unchanged');
  const db = seedStore();
  db.clients.find(c => c.client_id === CID).name = 'Changed';
  db.assets = db.assets.filter(a => a.client_id !== CID);
  saveStore(db);
  resetStore();
  const restored = readStore();
  expect(restored.clients.find(c => c.client_id === CID).name).toBe('Initech');
  expect(restored.assets.filter(a => a.client_id === CID)).toHaveLength(7);
  expect(localStorage.getItem('standard-sentinel')).toBe('unchanged');
  localStorage.clear();
  sessionStorage.clear();
});
test('adding Initech leaves reference-client records unchanged', () => {
  const combined = seedStore(clock),
    org = demoOrganizations.pop();
  let original;
  try {
    original = seedStore(clock);
  } finally {
    demoOrganizations.push(org);
  }
  for (const kind of ['clients', 'contacts', 'requirements', 'reviews', 'policies', 'risks', 'findings', 'tasks', 'evidence', 'framework_assessments', 'organizational_controls', 'assets', 'vendors']) {
    expect(combined[kind].filter(r => r.client_id !== CID)).toEqual(original[kind]);
  }
});
test('multi-year decisions and evidence retain original periods and design', () => {
  const db = seedStore(clock),
    own = k => db[k].filter(r => r.client_id === CID);
  for (const r of own('reviews')) for (const o of r.occurrences || []) {
    expect(r.created_at <= o.completed_at).toBe(true);
    expect(db.users.find(u => u.user_id === o.completed_by).role).not.toBe('client_readonly');
    for (const [kind, key] of [['risks', 'risk_id'], ['vendors', 'vendor_id'], ['policies', 'policy_id']]) if (r[key]) expect(own(kind).find(s => s[key] === r[key]).created_at <= o.completed_at).toBe(true);
  }
  const changed = own('framework_assessments').find(a => a.definition_id === 'A.8.30');
  expect(changed.soa_applicability).toBe('included');
  expect(changed.assessment_history[0].soa_applicability).toBe('excluded');
  const policy = own('policies').find(p => p.version === '3.0');
  expect(policy.baseline_key).toBe('policy-access-control-identity-management-policy');
  expect(policy.governance_context.cadence_rationale).toContain(own('reviews').find(r => r.baseline_key === 'policy-review').recurrence);
  expect(policy.decision_history.map(h => h.subject.version)).toEqual(['1.0', '2.0', '3.0']);
  expect(policy.decision_history.every(h => h.action === 'external_approval_recorded')).toBe(true);
  const access = own('reviews').find(r => r.baseline_key === 'user-access');
  const evidence = own('evidence').filter(e => e.linked_id === access.review_id && e.occurrence_id);
  expect(new Set(evidence.map(e => e.evidence_date.slice(0, 4))).size).toBeGreaterThanOrEqual(4);
  for (const e of evidence) {
    const o = access.occurrences.find(o => o.occurrence_id === e.occurrence_id);
    expect(o).toBeTruthy();
    expect(e.evidence_date).toBe(o.completed_at);
  }
  const gap = own('findings').find(f => f.finding_id === CID + '_finding_audit-supplier');
  expect(gap.status).toBe('in_remediation');
  expect(own('tasks').find(t => t.finding_id === gap.finding_id).status).toBe('in_progress');
});
test('Initech Risk and Vendor completions use ordinary central Review propagation', async () => {
  sessionStorage.clear();
  await api.post('/demo/enter');
  let db = readStore();
  for (const kind of ['risks', 'vendors']) {
    const source = db[kind].find(r => r.client_id === CID && r.status !== 'closed'),
      field = kind === 'risks' ? 'risk_id' : 'vendor_id';
    const r = db.reviews.find(r => r[field] === source[field] && (!r.vendor_id || r.vendor_purpose === 'vendor'));
    const frozen = JSON.parse(JSON.stringify(r.occurrences));
    const result = (await api.post('/reviews/' + r.review_id + '/complete', {
      occurrence_id: r.current_occurrence_id
    })).data;
    db = readStore();
    const saved = db[kind].find(s => s[field] === source[field]);
    expect(saved.next_review).toBe(result.review.due_date);
    expect(saved[kind === 'risks' ? 'last_reviewed' : 'last_review']).toBe(result.occurrence.completed_at);
    expect(db.reviews.find(x => x.review_id === r.review_id).occurrences.slice(0, frozen.length)).toEqual(frozen);
    expect(db.reviews.filter(x => x[field] === source[field] && (!x.vendor_id || x.vendor_purpose === 'vendor'))).toHaveLength(1);
  }
});
test.each([0, 2, 6])('Initech persona %s is scoped and cannot gain another client', async index => {
  sessionStorage.clear();
  await api.post('/demo/enter');
  const db = readStore();
  db.user = db.users.find(u => u.user_id === CID + '_user_' + index);
  saveStore(db);
  expect((await api.get('/reviews', {
    params: {
      client_id: CID
    }
  })).data.length).toBeGreaterThan(0);
  for (const path of ['/reviews', '/evidence/library', '/organizational-controls']) await expect(api.get(path, {
    params: {
      client_id: 'demo_dunder'
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  const foreign = db.risks.find(r => r.client_id === 'demo_dunder');
  await expect(api.patch('/risks/' + foreign.risk_id, {
    title: 'Forbidden'
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  if (index === 6) {
    const a = db.framework_assessments.find(a => a.client_id === CID);
    await expect(api.patch('/framework_assessments/' + a.framework_assessment_id, {
      implementation: 'Forbidden'
    })).rejects.toMatchObject({
      response: {
        status: 403
      }
    });
  }
});
