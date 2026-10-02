// DEMO - SYNTHETIC DATA. Validates the Dunder Mifflin program module against the ISO 27001 catalog.
import iso from '@catalogs/iso27001.json';
import dunder from './dunder';
import {seedStore} from '../store';
import {auditProgress,auditQuarter} from '../../lib/isoAudit';
import {lightweightStore} from '../evidenceStorage';

const STATUSES = ['addressed', 'in_progress', 'needs_attention', 'not_assessed', 'not_applicable'];
const ids = iso.requirements.map(r => r.id);
const annex = new Set(iso.requirements.filter(r => r.specification === 'annex_control').map(r => r.id));
const entries = Object.entries(dunder.assessments);
const clauses = entries.filter(([id]) => !annex.has(id));
const annexEntries = entries.filter(([id]) => annex.has(id));
const count = (list, pred) => list.filter(([, a]) => pred(a)).length;
const near = (actual, target) => expect(Math.abs(actual - target)).toBeLessThanOrEqual(2);

test('covers every catalog id and nothing else', () => {
  expect(ids).toHaveLength(123);
  expect(Object.keys(dunder.assessments).sort()).toEqual([...ids].sort());
  expect(dunder.framework).toBe('iso-27001');
});

test('assessment entries are well formed', () => {
  for (const [id, a] of entries) {
    expect(STATUSES).toContain(a.status);
    expect([0, 1, 2]).toContain(a.owner);
    if (a.status === 'not_assessed') {
      expect(a.assessed_ago).toBeNull();
      expect(a.evidence_ago).toBeNull();
    } else {
      expect(a.assessed_ago).toBeGreaterThan(0);
      expect(a.narrative.length).toBeGreaterThan(20);
    }
    if (!annex.has(id)) expect(a).not.toHaveProperty('soa');
  }
});

test('Statement of Applicability is consistent', () => {
  const justifications = [];
  for (const [id, a] of annexEntries) {
    expect(['included', 'excluded', '']).toContain(a.soa);
    expect(a.soa === 'excluded').toBe(a.status === 'not_applicable');
    if (a.soa) {
      expect(typeof a.justification).toBe('string');
      expect(a.justification.trim().length).toBeGreaterThan(10);
      justifications.push(a.justification.trim().toLowerCase());
    }
  }
  expect(new Set(justifications).size).toBe(justifications.length);
  expect(count(annexEntries, a => a.soa === 'included')).toBe(90);
  expect(annexEntries.filter(([, a]) => a.soa === 'excluded').map(([id]) => id).sort()).toEqual(['A.8.28', 'A.8.4']);
  expect(dunder.assessments['A.8.11']).toMatchObject({ soa: '', status: 'not_assessed' });
});

test('status mix lands in realistic targets', () => {
  expect(count(clauses, a => a.status === 'not_assessed')).toBe(0);
  near(count(clauses, a => a.status === 'addressed'), 24);
  near(count(clauses, a => a.status === 'in_progress'), 6);
  expect(dunder.assessments['4.3'].status).toBe('addressed');
  const included = annexEntries.filter(([, a]) => a.soa === 'included');
  near(count(included, a => a.status === 'addressed'), 70);
  near(count(included, a => a.status === 'in_progress'), 13);
  near(count(included, a => a.status === 'needs_attention'), 4);
  near(count(included, a => a.status === 'not_assessed'), 3);
  const addressed = entries.filter(([, a]) => a.status === 'addressed');
  near(count(addressed, a => a.assessed_ago > 365), 6);
  near(count(addressed, a => a.evidence_ago > 365), 6);
  near(count(addressed, a => a.evidence_ago === null), 10);
});

test('findings, review findings, risks and vendors are valid', () => {
  expect(dunder.findings).toHaveLength(7);
  for (const f of dunder.findings) {
    expect(ids).toContain(f.definition);
    expect([0, 1, 2]).toContain(f.assignee);
    expect(['low', 'medium', 'high', 'critical']).toContain(f.severity);
    if (f.closed_ago != null) expect(f.age).toBeGreaterThan(f.closed_ago);
  }
  expect(dunder.findings.filter(f => f.closed_ago == null)).toHaveLength(3);
  expect(dunder.review_findings).toHaveLength(4);
  dunder.review_findings.forEach(r => { expect(r.title).toBeTruthy(); expect(r.action).toBeTruthy(); });
  for (const r of dunder.risks) {
    expect([0, 1, 2]).toContain(r.owner);
    expect(['in_progress', 'assessed', 'accepted', 'closed']).toContain(r.status);
    expect(['mitigate', 'accept', 'transfer', 'avoid', 'monitor']).toContain(r.treatment);
    expect(r.status === 'accepted').toBe(!!r.acceptance);
    expect(r.status === 'closed').toBe(!!r.closure && r.next_in === null);
  }
  for (const v of dunder.vendors) expect([0, 1, 2]).toContain(v.owner);
  expect(dunder.vendors.some(v => v.assurance.refresh_in < 0)).toBe(true);
});

test('canonical Dunder seed operates as one connected Year-2 ISMS',()=>{
  const db=seedStore(new Date('2030-05-15T12:00:00Z')),cid='demo_dunder',own=kind=>db[kind].filter(r=>r.client_id===cid);
  expect(own('requirements').filter(r=>r.baseline_response==='applies').map(r=>r.baseline_key)).toEqual(['iso-27001']);
  expect(own('contacts')).toHaveLength(9);
  expect(own('contacts').every(c=>c.name&&c.title&&c.email&&!('role' in c)&&!('grc_roles' in c))).toBe(true);
  expect(own('contacts').filter(c=>c.linked_user_id)).toHaveLength(4);
  const annexAssessments=own('framework_assessments').filter(a=>a.framework_key==='iso-27001'&&a.definition_id.startsWith('A.'));
  expect(annexAssessments).toHaveLength(93);
  expect(annexAssessments.filter(a=>a.soa_applicability==='excluded')).toHaveLength(2);
  expect(annexAssessments.filter(a=>!a.soa_applicability)).toHaveLength(1);
  const objectiveReview=own('reviews').find(r=>r.isms_objectives);
  expect(objectiveReview.isms_objectives).toHaveLength(4);
  expect(objectiveReview.isms_objectives.every(o=>o.target&&o.method&&o.owner_id&&o.history.length===2)).toBe(true);
  expect(new Set(objectiveReview.isms_objectives.map(o=>o.status))).toEqual(new Set(['on_track','attention']));
  expect(objectiveReview.occurrences.length).toBeGreaterThan(0);
  const management=own('reviews').find(r=>(r.framework_drivers||[r]).some(d=>d.framework_plan_key==='iso-management-review'));
  expect(management.management_review.inputs.some(([,state])=>state==='attention')).toBe(true);
  expect(management.participants).toContain('David Wallace');
  expect(management.governance_context.cadence_rationale).toContain('does not prescribe annual');
  const linkedReviews=id=>own('framework_assessments').find(a=>a.definition_id===id).related_links.filter(l=>l.kind==='reviews').map(l=>l.id);
  expect(linkedReviews('9.3.2')).toContain(management.review_id);
  expect(linkedReviews('6.2')).toContain(objectiveReview.review_id);
  const policyReviews=own('reviews').filter(r=>r.policy_ids?.length);
  expect(policyReviews).toHaveLength(1);
  expect(policyReviews[0].policy_ids).toHaveLength(own('policies').length);
  for(const policy of own('policies')){
    const linked=policyReviews.find(r=>r.policy_ids.includes(policy.policy_id));
    expect(policy).toMatchObject({schedule_from_reviews:true,next_review_date:linked.due_date});
  }
  const audits=own('reviews').filter(r=>r.iso_audit);
  expect(audits).toHaveLength(4);
  expect(new Set(audits.map(r=>auditQuarter(r.due_date))).size).toBe(4);
  expect(audits.some(r=>r.status==='in_progress')).toBe(true);
  expect(audits.reduce((n,r)=>n+r.occurrences.length,0)).toBe(1);
  for(const r of audits)for(const o of r.occurrences)expect(auditProgress(o.iso_audit).complete).toBe(auditProgress(o.iso_audit).total);
  expect(own('findings').some(f=>f.review_id?.startsWith(cid+'_audit_'))).toBe(true);
  expect(own('risks').every(r=>r.treatment_reference&&r.control_refs?.length&&r.related_links?.some(l=>l.kind==='framework_assessments'))).toBe(true);
  expect(own('evidence').map(e=>e.display_name)).toEqual(expect.arrayContaining(['ISO 27001 / Clauses / approved ISMS scope statement','ISO 27001 / SoA / approved Statement of Applicability v4','ISO 27001 / Management Review / approved minutes']));
  expect(JSON.stringify(lightweightStore(db)).length).toBeLessThan(4.5*1024*1024);
});
