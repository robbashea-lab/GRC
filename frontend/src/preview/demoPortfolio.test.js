import axios from 'axios';
import { previewAdapter } from './adapter';
import { seedStore, ids, saveStore, readStore, STORE_KEY } from './store';
import { demoOrganizations, demoDates } from './demoPortfolio';
import { frameworkDefinition } from '../lib/frameworks';
import { validateProfile } from '../lib/clientProfile';
import { evidenceReferences } from './evidence';
import { lightweightStore } from './evidenceStorage';
import { validateAssignment } from './assignmentEligibility';
import { validateClientRelationships } from './clientRelationships';
import { portfolio } from './summaries';
import {latestPortfolioActivity} from '../lib/portfolioOverview';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {CIS_SHOWCASE_VERSION,cisDemoFixtureDates} from './cisDemoFixtureDates';
const api = axios.create({
  adapter: previewAdapter
});
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-13T17:00:00.000Z'));
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(()=>jest.useRealTimers());
test('same day produces byte-identical seed and dates advance with the clock', () => {
  const a = seedStore(new Date('2028-02-29T12:00:00Z')),
    b = seedStore(new Date('2028-02-29T18:00:00Z'));
  expect(b).toEqual(a);
  const c = seedStore(new Date('2030-01-01T12:00:00Z'));
  expect(c.clients.map(c => c.client_id)).toEqual(a.clients.map(c => c.client_id));
  const reference=c.reviews.find(r=>r.client_id==='demo_prestige'&&r.baseline_key==='policy-review');
  expect(reference).toBeTruthy();
  expect(reference.due_date).toBe(demoDates(new Date('2030-01-01'))(-8));
  if(process.env.CIS_DEMO_QA_DIAGNOSTICS==='true')console.info('CIS_STORE_SIZE',JSON.stringify(Object.fromEntries(Object.entries(a).map(([key,value])=>[key,JSON.stringify(value).length]))));
  expect(JSON.stringify(a).length).toBeLessThan(4000000);
});
test('canonical framework programs, real profiles, scoped people and valid assessments', () => {
  const db = seedStore();
  for (const org of demoOrganizations) {
    const cid = 'demo_' + org.key,
      c = db.clients.find(c => c.client_id === cid);
    expect(db.requirements.filter(r => r.client_id === cid && r.baseline_response === 'applies').map(r => r.baseline_key).sort()).toEqual([...org.frameworks].sort());
    for (const [section, values] of Object.entries(c.profile)) expect(() => validateProfile(section, values)).not.toThrow();
    expect(() => validateClientRelationships(db, c)).not.toThrow();
    expect(db.contacts.filter(p => p.client_id === cid).map(p => p.name)).toEqual(org.people);
    // A departed employee's disabled account keeps the work it owned (never reassigned automatically);
    // every other seeded assignment must be one the product would accept today.
    const former = cid + '_former';
    for (const [kind, field] of Object.entries(ids)) for (const r of db[kind].filter(r => r.client_id === cid)) {
      if (![r.owner_id, r.assignee_id].includes(former)) expect(() => validateAssignment(db, kind, r)).not.toThrow();
      expect(r[field]).toBeTruthy();
    }
    expect(db.users.find(u => u.user_id === former)).toMatchObject({status: 'disabled', client_ids: [cid]});
    expect(db.tasks.filter(t => t.client_id === cid && t.assignee_id === former && t.status !== 'done')).toHaveLength(1);
    expect(db.users.filter(u => u.client_ids?.includes(cid)).map(u => u.role).sort()).toEqual(expect.arrayContaining(['client_grc_manager', 'client_contributor', 'client_readonly', 'platform_admin']));
    for (const a of db.framework_assessments.filter(a => a.client_id === cid)) {
      const d = frameworkDefinition(a.framework_key, a.definition_id);
      expect(d).toBeTruthy();
      for (const l of a.related_links) expect(db[l.kind].some(r => r[ids[l.kind]] === l.id && r.client_id === cid)).toBe(true);
      if (d.specification === 'addressable' && a.status === 'addressed') {
        expect(a.addressable_decision).toBe('as_written');
        expect(a.addressable_rationale).toBeTruthy();
      }
      if (d.specification === 'annex_control' && a.status === 'addressed') expect(a.soa_applicability).toBe('included');
    }
  }
  expect(db.framework_assessments.some(a => a.framework_key === 'cmmc')).toBe(false);
});
test('historical occurrences, remediation chronology and downloadable evidence reconcile', () => {
  const db = seedStore();
  expect(db.reviews.some(r => r.occurrences.length)).toBe(true);
  for (const r of db.reviews) {
    for (const o of r.occurrences) {
      expect(Date.parse(o.completed_at)).toBeLessThanOrEqual(Date.now());
      const resolvedLate=['demo_brawndo','demo_initech','demo_krusty_krab'].includes(r.client_id)&&(r.risk_id||r.vendor_id||r.ai_system_id);
      // New operational examples intentionally retain a one-day late completion;
      // untouched programs and required governance retain their original timing.
      if(resolvedLate)expect(Date.parse(o.completed_at)-Date.parse(o.due_date)).toBe(86400000);
      else expect(Date.parse(o.completed_at)).toBeLessThanOrEqual(Date.parse(o.due_date));
      expect(o.finding_count).toBe(db.findings.filter(f => f.review_id === r.review_id && f.occurrence_id === o.occurrence_id).length);
    }
  }
  for (const f of db.findings) {
    const tasks = db.tasks.filter(t => t.finding_id === f.finding_id);
    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.title.startsWith('Remediate:')).toBe(false);
    if (t.completed_at) expect(t.completed_at >= f.created_at).toBe(true);
    if (f.status === 'closed') {
      expect(t.status).toBe('done');
      expect(f.closed_at >= t.completed_at).toBe(true);
    }
  }
  for (const e of db.evidence) {
    const references = evidenceReferences(db, e);
    expect(atob(e.content_base64)).toContain('DEMO - SYNTHETIC DATA');
    expect(atob(e.content_base64).length).toBe(e.size);
    expect(references.filter(r => !r.available)).toEqual([]);
    expect(references.length).toBeGreaterThan(0);
    expect(atob(e.content_base64)).toContain('Collected: ' + e.evidence_date);
  }
  for (const risk of db.risks.filter(r => r.status === 'closed')) expect(risk.last_reviewed <= risk.closed_at).toBe(true);
  for (const c of db.clients.filter(c=>['demo_dunder','demo_prestige'].includes(c.client_id))) expect(db.evidence.filter(e => e.client_id === c.client_id).length).toBeGreaterThanOrEqual(8);
  // CIS samples are compact bundles rather than duplicate per-duty files. Each
  // refreshed client still has real bytes across all three native parent types.
  for(const cid of ['demo_brawndo','demo_initech','demo_krusty_krab']){
    const types=new Set(db.evidence.filter(row=>row.client_id===cid).map(row=>row.linked_type));
    expect(types).toEqual(new Set(['framework_assessment','vendor','task']));
  }
  // The current CIS cohort uses three operating bundles, with native assessment
  // and current Review links. The old single-file v1 graph is tested at its legacy stage.
  for(const clientId of ['demo_brawndo','demo_initech','demo_krusty_krab']){
    for(const key of ['periodic','event','configuration']){
      const samples=db.evidence.filter(e=>e.evidence_id===clientId+'_showcase_evidence_operating_'+key);
      expect(samples).toHaveLength(1);
      const sample=samples[0];
      expect(sample).toMatchObject({client_id:clientId,filename:'cis-operating_'+key+'.csv',mime_type:'text/csv',linked_type:'framework_assessment'});
      const assessment=db.framework_assessments.find(row=>row.framework_assessment_id===sample.linked_id);
      expect(assessment.client_id).toBe(clientId);
      expect(assessment.related_links).toContainEqual({kind:'evidence',id:sample.evidence_id});
      for(const link of sample.relationships.filter(row=>row.kind==='framework_assessments')){
        const linked=db.framework_assessments.find(row=>row.framework_assessment_id===link.id);
        expect(linked.client_id).toBe(clientId);
        expect(linked.related_links).toContainEqual({kind:'evidence',id:sample.evidence_id});
        expect(atob(sample.content_base64)).toContain('\n'+linked.definition_id+',');
      }
      for(const link of sample.relationships.filter(row=>row.kind==='reviews')){
        const review=db.reviews.find(row=>row.review_id===link.id);
        expect(review.client_id).toBe(clientId);
        expect(link.occurrence_id).toBe(review.current_occurrence_id);
      }
    }
  }
});
test('reset recovers creations edits deletions completions and baseline without touching standard storage', async () => {
  await api.post('/demo/enter');
  const original = readStore(),
    cid = original.clients[0].client_id;
  localStorage.setItem('standard-sentinel', 'unchanged');
  const created = (await api.post('/tasks', {
    client_id: cid,
    title: 'Temporary demo action'
  })).data;
  await api.patch('/clients/' + cid, {
    name: 'Temporary name'
  });
  const r = original.reviews.find(r => r.client_id === cid);
  await api.post('/reviews/' + r.review_id + '/complete', {
    occurrence_id: r.current_occurrence_id
  });
  const modified = readStore();
  modified.assets = modified.assets.filter(a => a.client_id !== cid);
  saveStore(modified);
  const beforeReset=JSON.parse(sessionStorage.getItem(STORE_KEY));
  expect(Object.values(beforeReset.portfolio_reporting.activity_proofs).some(proof=>proof.eligible)).toBe(true);
  const resetAt='2026-10-13T18:00:00.000Z';jest.setSystemTime(new Date(resetAt));
  await api.post('/demo/reset');
  const restored = readStore();
  // Canonical source records remain exact; prospective reports begin at the new reset commit.
  const {portfolio_reporting:reporting,...restoredSources}=JSON.parse(JSON.stringify(lightweightStore(restored)));
  const {portfolio_reporting:seedReporting,...canonicalSources}=JSON.parse(JSON.stringify(lightweightStore(seedStore())));
  // Raw construction includes explicit new-scenario imports, not a native accepted baseline.
  expect(seedReporting.snapshots.every(point=>point.observation_kind==='demo_fixture')).toBe(true);
  expect(restoredSources).toEqual(canonicalSources);
  expect(reporting).toMatchObject({started_at:resetAt,last_captured_at:resetAt,activity_proofs:{}});
  expect(reporting.activity_proofs).toEqual({});
  expect(reporting.snapshots).toHaveLength(original.portfolio_reporting.snapshots.length);
  const currentSnapshots=reporting.snapshots.filter(snapshot=>snapshot.observation_kind!=='demo_fixture');
  const allFixtures=reporting.snapshots.filter(snapshot=>snapshot.observation_kind==='demo_fixture');
  expect(currentSnapshots.length).toBeGreaterThan(0);
  expect(currentSnapshots.every(snapshot=>snapshot.captured_at===resetAt&&snapshot.current.captured_at===resetAt)).toBe(true);
  expect(allFixtures).toHaveLength(original.portfolio_reporting.snapshots.filter(snapshot=>snapshot.observation_kind==='demo_fixture').length);
  expect(allFixtures).toHaveLength(18);
  // Fixture history uses the persisted UTC initialization day. Native reset
  // observations above retain the exact later reset commit timestamp.
  const fixtureAnchor=cisDemoFixtureDates(new Date(resetAt)).anchor;
  expect(restored.cis_demo_refresh).toMatchObject({version:CIS_SHOWCASE_VERSION,anchor:fixtureAnchor,timezone:'UTC'});
  expect(reporting.fixture_versions?.['brawndo-cis-ig1-history-v2']).toBeUndefined();
  const oldIds=new Set(beforeReset.portfolio_reporting.snapshots.map(snapshot=>snapshot.snapshot_id));
  const canonicalIds=new Set();
  const canonical=seedStore();
  for(const [clientId,total] of [['demo_brawndo',56],['demo_initech',130],['demo_krusty_krab',153]]){
    const context=getCisDemoScenarioContext(restored,clientId,resetAt);
    expect(context).toBeTruthy();
    expect(context).toMatchObject({version:CIS_SHOWCASE_VERSION,client_id:clientId,program_id:clientId+':cis-ig1',anchor:fixtureAnchor});
    expect(context.point_ids).toHaveLength(6);
    const expected=getCisDemoScenarioContext(canonical,clientId,resetAt);
    expect(context).toEqual(expected);
    const points=reporting.snapshots.filter(point=>context.point_ids.includes(point.snapshot_id));
    expect(points).toEqual(canonical.portfolio_reporting.snapshots.filter(point=>expected.point_ids.includes(point.snapshot_id)));
    expect(points).toHaveLength(6);
    expect(points.every(point=>point.observation_kind==='demo_fixture'&&point.program_id===clientId+':cis-ig1'
      &&point.current.provenance.fixture_revision===CIS_SHOWCASE_VERSION&&point.current.scenario_anchor===fixtureAnchor)).toBe(true);
    expect(points.slice(0,-1).every(point=>point.captured_at<fixtureAnchor)).toBe(true);
    expect(points.at(-1).captured_at).toBe(fixtureAnchor);
    const nativeRows=restored.framework_assessments.filter(row=>row.client_id===clientId&&row.framework_key==='cis-ig1');
    expect(nativeRows).toHaveLength(total);
    const references=points.at(-1).current.provenance.source_references;
    expect(references).toHaveLength(total);
    expect(references.map(row=>row.id).sort()).toEqual(nativeRows.map(row=>row.framework_assessment_id).sort());
    expect(references.every(row=>row.framework_version==='8.1')).toBe(true);
    expect(Object.fromEntries(references.map(row=>[row.definition_id,row.status])))
      .toEqual(Object.fromEntries(nativeRows.map(row=>[row.definition_id,row.status])));
    context.point_ids.forEach(id=>canonicalIds.add(id));
  }
  expect(reporting.snapshots.filter(snapshot=>oldIds.has(snapshot.snapshot_id)).every(snapshot=>canonicalIds.has(snapshot.snapshot_id))).toBe(true);
  expect(currentSnapshots.some(snapshot=>oldIds.has(snapshot.snapshot_id))).toBe(false);
  expect(restored.tasks.some(t => t.task_id === created.task_id)).toBe(false);
  expect(localStorage.getItem('standard-sentinel')).toBe('unchanged');
  const metrics = portfolio(restored, false);
  expect(metrics.clients.filter(c=>['demo_dunder','demo_prestige'].includes(c.client_id)).every(c=>c.last_activity)).toBe(true);
  const nativeActivity=latestPortfolioActivity(restored.logs,new Date(resetAt),reporting.activity_proofs);
  for(const clientId of ['demo_brawndo','demo_initech','demo_krusty_krab']){
    const activity=metrics.clients.find(client=>client.client_id===clientId).last_activity;
    expect(activity).toEqual(nativeActivity.get(clientId)||null);
    if(activity)expect(restored.logs.some(log=>log.client_id===clientId&&log.at===activity.at)).toBe(true);
  }
});
test('scoped demo actors cannot read or mutate another client or evidence', async () => {
  await api.post('/demo/enter');
  const db = readStore(),
    [a, b] = db.clients;
  db.user = db.users.find(u => u.client_ids?.length === 1 && u.client_ids[0] === a.client_id && u.role === 'client_contributor');
  saveStore(db);
  for (const path of ['/reviews', '/evidence/library', '/frameworks/nist-csf-2']) await expect(api.get(path, {
    params: {
      client_id: b.client_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  const risk = db.risks.find(r => r.client_id === b.client_id);
  await expect(api.patch('/risks/' + risk.risk_id, {
    title: 'Unauthorized'
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  expect(readStore().risks.find(r => r.risk_id === risk.risk_id).title).toBe(risk.title);
  expect((await api.get('/risks')).data.every(r => r.client_id === a.client_id)).toBe(true);
  await expect(api.get('/related', {
    params: {
      entity_type: 'risks',
      entity_id: risk.risk_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  await expect(api.post('/tasks', {
    client_id: b.client_id,
    title: 'Unauthorized'
  }, {
    params: {
      client_id: a.client_id
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
  await expect(api.post('/bulk', {
    kind: 'risks',
    ids: [risk.risk_id],
    action: 'update',
    payload: {
      title: 'Unauthorized'
    }
  })).rejects.toMatchObject({
    response: {
      status: 403
    }
  });
});
