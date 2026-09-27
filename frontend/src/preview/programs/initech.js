// DEMO - SYNTHETIC DATA. Permanent, deterministic multi-framework operating scenario.
// Only invoked by explicit Demo initialization/reset, never by production startup.
import { demoDates } from '../demoPortfolio';
import { previousDate, evidence } from '../demoHistory';
import { reviewView, reviewSchedule } from '../../lib/reviewOccurrences';
import { CATALOGS, frameworkDefinition, reviewDrivers } from '../../lib/frameworks';
import { assessedRisk } from '../../lib/grcWork';
import { riskSnapshot } from '../risks';
import { approvalSnapshot } from '../policyProvenance';
import { organizationalControlRequest } from '../organizationalControls';
import { isoCompletionSnapshot } from '../isoAudit';
import { isoAuditCatalog, initialAuditState, blankAuditItem } from '../../lib/isoAudit';
import { VENDOR_PURPOSES } from '../../lib/vendorGovernance';
const CID = 'demo_initech';
const copy = value => JSON.parse(JSON.stringify(value));
const person = index => CID + '_user_' + index;
const months = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12
};
const design = c => Object.fromEntries(['name', 'description', 'frequency', 'design', 'owner_id', 'assessment_ids', 'related_links'].map(k => [k, copy(c[k])]));
function log(db, kind, id, at, action, who = person(0), meta = {}) {
  const user = db.users.find(u => u.user_id === who);
  db.logs.push({
    audit_id: CID + '_event_' + db.logs.filter(l => l.client_id === CID).length,
    entity_type: kind,
    entity_id: id,
    client_id: CID,
    at: at.slice(0, 10) + 'T12:00:00Z',
    user_id: who,
    user_name: user.name,
    user_email: user.email,
    action,
    meta: {
      simulated: true,
      ...meta
    }
  });
}
function snapshot(r, due, client) {
  const completed = demoDates(new Date(due))(-1);
  const completedBy = r.reviewer_id || r.owner_id;
  return {
    ...Object.fromEntries(['review_id', 'client_id', 'title', 'review_type', 'recurrence', 'owner_id', 'reviewer_id', 'scope', 'framework_drivers', 'baseline_key', 'framework_key', 'framework_safeguards', 'framework_plan_key', 'governance_context', 'risk_id', 'vendor_id', 'policy_id'].filter(k => r[k] !== undefined).map(k => [k, copy(r[k])])),
    ...reviewSchedule({
      ...r,
      due_date: due
    }, true),
    occurrence_id: r.review_id + '_' + due,
    due_date: due,
    status: 'completed',
    completed_at: completed,
    completion_date: completed,
    completed_by: completedBy,
    completed_by_name: client.users.find(u => u.user_id === completedBy).name,
    outcome: 'no_findings',
    finding_count: 0,
    evidence: [],
    notes: 'DEMO - SYNTHETIC DATA. Scoped population inspected; exceptions are separate Findings.'
  };
}
function addPeriodEvidence(db, client, r, o, key = String(o.due_date).slice(0, 10), title) {
  const e = evidence(db, client, r.review_id + '-' + key, title || r.title + ' — ' + o.period, 'review', r.review_id, o.completed_at, o.completed_by, {
    occurrence_id: o.occurrence_id
  });
  o.evidence.push({
    evidence_id: e.evidence_id,
    filename: e.filename,
    version: e.version
  });
  return e;
}
function auditProgram(db, client, date, createGap) {
  // Fixtures describe past synthetic executions; live activation remains prospective.
  const scope = 'Initech managed service: identity, endpoints, service application, suppliers and business governance.';
  const start = date(-1380),
    keys = isoAuditCatalog.packages;
  client.iso_audit_program = {
    status: 'active',
    activated_at: start,
    activated_by: person(0),
    configuration: {
      client_id: CID,
      start_date: start,
      first_package: keys[0].key,
      auditor_id: person(5),
      scope,
      independence: 'Bob Slydell audits operating teams; Bob Porter has read-only access for independent review of audit-program governance. Neither approves their own operating work.'
    },
    schedule: []
  };
  // The first two packages have completed this annual cycle. Their next current
  // occurrences are next year; the completed occurrence, not a fake status, proves it.
  const today = new Date(date(0) + 'T12:00:00Z');
  const quarterEnd = offset => new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 + 3 * (offset + 1), 0, 12)).toISOString().slice(0, 10);
  const quarterOffsets = [2, 3, 0, 1];
  for (const [index, pack] of keys.entries()) {
    const due = quarterEnd(quarterOffsets[index]),
      rid = CID + '_audit_' + pack.key;
    const r = reviewView({
      review_id: rid,
      client_id: CID,
      title: 'Internal Audit — ' + pack.title,
      review_type: 'requirements',
      recurrence: 'annual',
      due_date: due,
      status: index === 2 ? 'in_progress' : 'upcoming',
      owner_id: person(5),
      scope,
      created_at: start,
      updated_at: date(-3),
      created_by: person(0),
      iso_audit: initialAuditState(pack.key, 4),
      occurrences: [],
      audit_program_start: start,
      audit_independence: client.iso_audit_program.configuration.independence,
      framework_key: 'iso-27001',
      framework_safeguards: [...new Set(pack.items.map(i => i.definition_id))],
      governance_context: {
        category: 'organizational',
        rationale: 'Planned ISMS audit coverage using four packages.',
        cadence_source: 'organization_defined',
        cadence_rationale: 'Management selected staggered annual packages; ISO does not prescribe this quarterly rotation.'
      }
    });
    db.reviews.push(r);
    client.iso_audit_program.schedule.push({
      package_key: pack.key,
      title: pack.title,
      due_date: previousDate(due, 36)
    });
    for (let back = 3; back >= 1; back--) {
      const o = snapshot(r, previousDate(due, back * 12), {
        users: db.users
      });
      o.iso_audit = initialAuditState(pack.key, 4 - back);
      const report = addPeriodEvidence(db, client, r, o, 'cycle-' + (4 - back), 'Issued audit report — ' + pack.title + ' — ' + o.period);
      o.iso_audit.report_evidence_id = report.evidence_id;
      for (const item of pack.items) o.iso_audit.items[item.key] = {
        ...blankAuditItem(),
        status: 'reviewed',
        result: 'conforming',
        notes: ['A.7.6', 'A.8.11'].includes(item.definition_id) ? 'Documented scope exclusion reviewed; no implementation assertion. See issued report.' : 'Synthetic test; see issued report.',
        evidence_ids: item === pack.items[0] ? [report.evidence_id] : [],
        updated_at: o.completed_at,
        updated_by: person(5)
      };
      r.occurrences.push(o);
      if (index === 1 && back === 1) {
        const gap = createGap('audit-supplier', 'Supplier assurance approval was not retained for one renewal', 'Obtain the current supplier assurance and document approval', {
          review: r,
          occurrence: o,
          at: o.completed_at,
          severity: 'medium',
          due: date(25),
          assignee: person(2),
          state: 'in_progress'
        });
        const supplier = pack.items.find(item => item.definition_id === 'A.5.19');
        o.iso_audit.items[supplier.key] = {
          ...o.iso_audit.items[supplier.key],
          result: 'observation',
          evidence_ids: [report.evidence_id],
          finding_ids: [gap.finding_id]
        };
      }
      o.iso_audit = isoCompletionSnapshot(db, {
        ...r,
        ...o,
        current_occurrence_id: o.occurrence_id
      }).iso_audit;
    }
    if (index === 2) for (const item of pack.items.slice(0, 9)) r.iso_audit.items[item.key] = {
      ...blankAuditItem(),
      status: 'reviewed',
      result: 'conforming',
      notes: item.definition_id === 'A.7.6' ? 'Documented secure-area exclusion reviewed against the scoped facilities; no implementation assertion.' : 'Current-cycle synthetic sample confirmed.',
      updated_at: date(-4),
      updated_by: person(5)
    };
    if (index === 2) r.iso_audit.items[pack.items[9].key] = {
      ...blankAuditItem(),
      status: 'in_progress',
      notes: 'Awaiting the current cabling route and segregation sample.'
    };
    for (const a of db.framework_assessments.filter(a => a.client_id === CID && a.framework_key === 'iso-27001' && r.framework_safeguards.includes(a.definition_id))) a.related_links.push({
      kind: 'reviews',
      id: rid
    });
  }
  const old = db.reviews.find(r => r.client_id === CID && r.framework_plan_key === 'iso-internal-audit');
  if (old) Object.assign(old, {
    status: 'cancelled',
    cancelled_at: date(-1),
    notes: 'Replaced prospectively by four audit package Reviews; original occurrence history retained.'
  });
}
export function finishInitech(db, clock, {
  action,
  frameworkRequest
}) {
  const client = db.clients.find(c => c.client_id === CID);
  if (!client) return db;
  const date = demoDates(clock),
    explorer = db.user;
  db.user = db.users.find(u => u.user_id === person(0));
  const own = kind => db[kind].filter(r => r.client_id === CID);
  const review = key => own('reviews').find(r => r.baseline_key === key || r.framework_plan_key === key);
  const assessment = (key, id) => own('framework_assessments').find(a => a.framework_key === key && a.definition_id === id);
  const link = (row, kind, id) => {
    row.related_links ||= [];
    if (!row.related_links.some(l => l.kind === kind && l.id === id)) row.related_links.push({
      kind,
      id
    });
  };
  Object.assign(client, {
    created_at: date(-1460),
    notes: 'DEMO - SYNTHETIC DATA. Four-year integrated GRC program; shared operation, independent framework judgments.'
  });
  client.profile.organization.notes = client.notes;
  client.profile.organization.business_units = 'Managed Services; Engineering; Business Operations; Finance';
  Object.assign(client.profile.security, {
    develops: 'Yes',
    hosts: 'Yes',
    secure_development: 'Implemented'
  });
  client.framework_settings = {
    'soc-2': {
      categories: ['security', 'availability'],
      period_start: date(-365),
      period_end: date(0),
      system_description: 'Initech managed business service: cloud application, identity, endpoint administration, monitoring, backup and supplier operations. Supplier development added one year ago.'
    }
  };
  client.initial_program_baseline.completed_at = date(-1450);
  client.initial_program_baseline.note = 'Synthetic four-year onboarding baseline. Current scope and ownership changes are retained separately.';
  for (const kind of ['policies', 'risks', 'vendors', 'contacts']) for (const row of own(kind)) row.created_at = date(-1450);
  for (const user of db.users.filter(u => u.user_id.startsWith(CID + '_'))) user.created_at = date(-1450);
  for (const risk of own('risks')) risk.date_identified = date(-1440);
  Object.values(client.initial_program_baseline.state.framework_reviews).forEach(c => c.due_date = date(-1430));
  const titles = ['GRC / Security Program Lead', 'Executive Sponsor', 'IT Operations Lead', 'Systems / Infrastructure Lead', 'Business Operations Owner', 'Internal Auditor', 'Independent Audit Reviewer (read only)', 'Workforce stakeholder'];
  const responsibilities = ['Information Security Lead', 'Executive Sponsor', 'IT Lead', 'Business Continuity / Disaster Recovery Lead', 'Vendor / Third-Party Contact', 'Other', 'Risk Management Contact', 'Other'];
  own('contacts').forEach((c, i) => {
    c.title = titles[i];
    c.role = responsibilities[i];
    c.notes = 'Fictional Office Space persona; Demo responsibilities only.';
  });
  // Keep operational work with qualified operators rather than the executive sponsor.
  for (const kind of ['reviews', 'policies', 'risks', 'assets', 'framework_assessments']) for (const row of own(kind)) if (row.owner_id === person(1)) row.owner_id = person(3);
  own('assets').forEach((a, i) => {
    a.description = 'Synthetic ISMS / SOC 2 system boundary: ' + a.name;
    a.owner_id = person(i % 2 ? 3 : 2);
    a.created_at = date(-1450);
  });
  const retired = own('assets')[4];
  Object.assign(retired, {
    name: 'Retired legacy finance application',
    status: 'retired',
    description: 'Decommissioned ' + date(-360) + '. Historical evidence retains the prior boundary.'
  });
  db.assets.push({
    ...copy(own('assets')[3]),
    asset_id: CID + '_asset_new',
    name: 'Supplier-developed service extension',
    created_at: date(-360),
    owner_id: person(3),
    description: 'Added to current scope after supplier development began; prior SoA and control designs retained.'
  });
  client.profile_history = [{
    at: date(-360),
    by: person(0),
    changes: {
      scope: {
        before: 'Core service; no outsourced development',
        after: client.framework_settings['soc-2'].system_description
      },
      owner: {
        before: person(2),
        after: person(3)
      }
    }
  }];

  // Extend actual occurrence snapshots, retaining all existing IDs and evidence links.
  for (const r of own('reviews')) {
    r.created_at = date(-1440);
    r.scope ||= 'Initech identity, endpoints and managed service; supplier extension included after ' + date(-360) + '.';
    if (r.risk_id || !months[r.recurrence] || !r.occurrences?.length) continue;
    // Historical fixtures retain operational state, not a duplicate of every
    // present-day form/guidance field on each monthly occurrence.
    r.occurrences = r.occurrences.map(o => ({
      ...snapshot(r, o.due_date.slice(0, 10), {
        users: db.users
      }),
      ...Object.fromEntries(['occurrence_id', 'title', 'owner_id', 'reviewer_id', 'scope', 'framework_drivers', 'completed_at', 'completion_date', 'completed_by', 'completed_by_name', 'outcome', 'finding_count', 'evidence', 'notes'].filter(k => o[k] !== undefined).map(k => [k, copy(o[k])]))
    }));
    if (!['user-access', 'inventory', 'awareness', 'vendor', 'policy-review', 'management-review', 'iso-soa-review', 'backup'].includes(r.baseline_key || r.framework_plan_key) && !r.vendor_id) continue;
    let due = previousDate(r.occurrences[0].due_date.slice(0, 10), months[r.recurrence]);
    const older = [];
    while (due >= date(-1400)) {
      older.unshift(snapshot(r, due, {
        users: db.users
      }));
      due = previousDate(due, months[r.recurrence]);
    }
    r.occurrences = [...older, ...r.occurrences];
    for (const o of older) if (['user-access', 'inventory', 'awareness', 'restore', 'vendor', 'policy-review', 'management-review'].includes(r.baseline_key) || r.risk_id || r.vendor_id) addPeriodEvidence(db, client, r, o);
  }
  const access = review('user-access'),
    inventory = review('inventory');
  access.title = 'User and Privileged Access Review';
  access.owner_id = person(2);
  access.reviewer_id = person(0);
  access.governance_context.cadence_rationale = 'CIS account inventory has an explicit quarterly minimum. ISO does not prescribe an exact interval here; management designs the SOC 2 access Control quarterly. One quarterly Review retains each driver.';
  // One current gap, supported state elsewhere; no conclusion is inherited from a Control.
  const gaps = {
    'cis-ig1': new Set(['1.2', '7.3', '14.2']),
    'iso-27001': new Set(['6.2', '10.2', 'A.5.19', 'A.8.30']),
    'soc-2': new Set(['CC6.2', 'CC7.2', 'A1.3'])
  };
  for (const [i, a] of own('framework_assessments').entries()) {
    const d = frameworkDefinition(a.framework_key, a.definition_id),
      status = gaps[a.framework_key].has(a.definition_id) ? 'in_progress' : i % 41 === 0 ? 'not_assessed' : 'addressed';
    const statement = a.related_links.filter(l => l.kind === 'reviews').map(l => db.reviews.find(r => r.review_id === l.id)?.title).filter(Boolean);
    Object.assign(a, {
      status,
      owner_id: person(i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 3),
      process_owner_id: CID + '_contact_' + (i % 2 ? 4 : 2),
      created_at: date(-1435),
      implementation: status === 'not_assessed' ? '' : statement.length ? statement[0] + ': owner inspects the scoped population, retains samples and tracks exceptions.' : d.title + ': responsibilities and supporting records are documented in scoped operating procedures.',
      technology: ['Managed identity and service desk', 'Endpoint configuration register', 'Controlled policy and audit register'][i % 3],
      notes: 'Synthetic management assessment.',
      last_assessed: status === 'not_assessed' ? null : date(-14 - i % 48),
      assessed_by: person(0),
      assessment_history: [],
      management_controls: [],
      controls_migrated: true
    });
    if (d.specification === 'annex_control') Object.assign(a, {
      soa_applicability: 'included',
      soa_justification: 'Included for scoped service commitments and risk treatment.'
    });
    if (a.last_assessed) {
      const state = {
        status: a.status,
        implementation: a.implementation,
        technology: a.technology,
        soa_applicability: a.soa_applicability,
        soa_justification: a.soa_justification
      };
      a.assessment_history = [{
        ...state,
        at: a.last_assessed,
        by: person(0)
      }];
      if (['5.1', 'A.8.30', 'CC6.2'].includes(a.definition_id)) a.assessment_history.unshift({
        ...state,
        at: date(-780),
        by: person(2)
      });
    }
  }
  for (const [id, why] of [['A.7.6', 'No Initech-operated secure rooms exist in the defined service boundary; hosted facility assurance is assessed under supplier and physical-entry controls. Reassess when facilities change.'], ['A.8.11', 'No production information is used in development or test; synthetic datasets replace it. Reassess masking needs if that boundary changes.']]) {
    const a = assessment('iso-27001', id);
    Object.assign(a, {
      status: 'not_applicable',
      soa_applicability: 'excluded',
      soa_justification: why,
      implementation: why
    });
    a.assessment_history.forEach(h => Object.assign(h, {
      status: a.status,
      soa_applicability: 'excluded',
      soa_justification: why,
      implementation: why
    }));
  }
  Object.assign(assessment('iso-27001', 'A.8.12'), {
    status: 'not_assessed',
    soa_applicability: '',
    soa_justification: 'Current data-flow discovery is evaluating an additional loss-prevention treatment; management decision pending.',
    last_assessed: null,
    assessment_history: []
  });
  const scopeChange = assessment('iso-27001', 'A.8.30');
  Object.assign(scopeChange.assessment_history[0], {
    status: 'not_applicable',
    soa_applicability: 'excluded',
    soa_justification: 'No outsourced development within the earlier boundary.',
    implementation: 'Earlier core service was internally developed.'
  });
  scopeChange.soa_justification = 'Supplier-developed extension entered scope ' + date(-360) + '; contract and acceptance checks are being completed.';
  for (const a of [assessment('cis-ig1', '1.2'), assessment('soc-2', 'CC6.2'), assessment('iso-27001', 'A.5.19'), assessment('iso-27001', '10.2')]) {
    a.status = 'needs_attention';
    a.assessment_history.at(-1).status = a.status;
  }
  Object.assign(scopeChange.assessment_history.at(-1), {
    soa_justification: scopeChange.soa_justification
  });
  const createGap = (key, title, remediation, {
    review: r,
    occurrence: o,
    assessment: a,
    at = date(-20),
    severity = 'medium',
    due = date(25),
    assignee = person(2),
    state = 'open'
  }) => {
    let f;
    if (a) f = frameworkRequest(db, '/framework-assessments/' + a.framework_assessment_id + '/findings', 'post', {}, {
      title,
      description: a.implementation || title,
      severity,
      remediation_title: remediation,
      request_id: CID + '-' + key
    });else {
      f = {
        finding_id: CID + '_finding_' + key,
        client_id: CID,
        title,
        description: title,
        review_id: r?.review_id,
        vendor_id: r?.vendor_id,
        occurrence_id: o?.occurrence_id,
        severity,
        status: 'open',
        owner_id: assignee,
        created_by: person(0),
        created_at: at
      };
      db.findings.push(f);
      action(db, 'findings', f.finding_id, 'create-task', {
        title: remediation
      });
    }
    Object.assign(f, {
      created_at: at,
      updated_at: at,
      created_by: person(0),
      due_date: due,
      owner_id: assignee
    });
    const t = db.tasks.find(t => t.finding_id === f.finding_id);
    Object.assign(t, {
      task_id: CID + '_action_' + key,
      assignee_id: assignee,
      owner_id: assignee,
      due_date: due,
      created_at: at,
      updated_at: at,
      created_by: person(0),
      status: state
    });
    f.status = state === 'in_progress' ? 'in_remediation' : state === 'done' ? 'remediated' : 'open';
    if (state === 'done') Object.assign(t, {
      completed_at: date(-3),
      completed_by: assignee
    });
    if (o) {
      o.finding_count = (o.finding_count || 0) + 1;
      o.outcome = 'findings_raised';
    }
    return f;
  };
  const shared = own('findings').find(f => f.finding_id === CID + '_finding_0');
  shared.title = 'Privileged access recertification omitted one supplier account population';
  shared.severity = 'high';
  const sharedTask = own('tasks').find(t => t.finding_id === shared.finding_id);
  Object.assign(sharedTask, {
    title: 'Complete the supplier privileged-access review and resolve exceptions',
    priority: 'high',
    due_date: date(-6),
    assignee_id: person(2)
  });
  shared.due_date = date(-6);
  shared.owner_id = person(2);
  createGap('cis', 'Unauthorized endpoint disposition was not recorded', 'Record unauthorized endpoint containment and disposition', {
    assessment: assessment('cis-ig1', '1.2'),
    severity: 'medium'
  });
  createGap('iso', 'Information-security objective measurement lacks an accountable reviewer', 'Assign objective review ownership and validate the measure', {
    assessment: assessment('iso-27001', '6.2'),
    assignee: person(0),
    due: date(30)
  });
  createGap('soc', 'One quarterly access approval is absent from period evidence', 'Reconstruct the missing approval and validate completeness', {
    assessment: assessment('soc-2', 'CC6.2'),
    state: 'done',
    at: date(-24),
    due: date(20)
  });
  const unassigned = own('tasks').find(t => t.task_id === CID + '_action_iso');
  unassigned.assignee_id = null;
  unassigned.owner_id = null;
  // Existing closed Findings and completed Actions remain as prior remediation history.
  for (const a of [assessment('cis-ig1', '5.1'), assessment('iso-27001', 'A.5.18'), assessment('soc-2', 'CC6.2')]) link(a, 'findings', shared.finding_id);
  const risks = own('risks');
  const riskPlans = [['Supplier privileged permissions exceed the approved access population', 3, 4, 'in_progress', 'Complete supplier access recertification and verify least privilege.'], ['Recovery testing omitted a dependent reporting workload', 2, 3, 'assessed', 'Validate dependent workload recovery in the next exercise.'], ['Single-region recovery concentration remains within accepted tolerance', 2, 3, 'accepted', 'Maintain monitored, time-limited acceptance and recovery testing.'], ['Unsupported finance servers have been retired', 1, 2, 'closed', 'Retirement verified; retain historical exposure and remediation evidence.']];
  risks.forEach((r, i) => {
    const [title, likelihood_score, impact_score, status, treatment_plan] = riskPlans[i];
    Object.assign(r, assessedRisk({
      ...r,
      title,
      likelihood_score,
      impact_score,
      status,
      treatment_plan,
      review_cadence: 'annual',
      owner_id: person(i === 0 ? 2 : 0)
    }));
    const rr = own('reviews').find(x => x.risk_id === r.risk_id);
    if (rr) {
      rr.title = 'Risk Review — ' + r.display_id + ' — ' + title;
      rr.recurrence = 'annual';
      rr.owner_id = r.owner_id;
      rr.governance_context = {
        category: 'risk',
        rationale: 'Reassess this documented risk and its treatment.',
        cadence_source: 'organization_defined',
        cadence_rationale: 'Management retained the product annual default; this is not a numerical framework requirement.'
      };
      rr.occurrences = [];
      rr.schedule_anchor = null;
      Object.assign(rr, reviewView(rr));
      for (let y = 3; y >= 1; y--) rr.occurrences.push(snapshot(rr, previousDate(rr.due_date.slice(0, 10), 12 * y), {
        users: db.users
      }));
      rr.occurrences.forEach((o, j) => {
        o.risk_before = riskSnapshot(assessedRisk({
          ...r,
          likelihood_score: i === 1 && j === 0 ? 4 : r.likelihood_score
        }));
        o.risk_after = riskSnapshot(r);
        o.outcome = j === 0 && i === 1 ? 'Assessment Updated' : 'Reviewed — No Change';
        addPeriodEvidence(db, client, rr, o);
      });
      r.last_reviewed = rr.occurrences.at(-1).completed_at;
    }
  });
  // The original treatment Action is retained and now points at the matching Risk.
  const treatment = own('tasks').find(t => t.task_id === CID + '_risk_treatment');
  treatment.title = 'Complete supplier privilege reduction and validate authorization';
  const vendorNames = ['Synthetic Meridian Cloud Services', 'Synthetic Beacon Security Operations', 'Synthetic Harbor Payroll'];
  own('vendors').forEach((v, i) => {
    const oldName = v.name;
    v.name = vendorNames[i];
    v.services = ['Managed application hosting', 'Managed detection and monitoring', 'Payroll processing'][i];
    v.category = ['Cloud / Infrastructure', 'Security Services', 'Business Services'][i];
    v.data_types = i === 2 ? ['Employee Data', 'Financial'] : ['Confidential'];
    if (i === 2) v.criticality = 'moderate';
    v.business_owner_id = person(i === 2 ? 4 : 3);
    v.owner_id = v.business_owner_id;
    v.notes = 'Fictional provider; no claims about real technology companies.';
    const reviews = own('reviews').filter(r => r.vendor_id === v.vendor_id);
    for (const r of reviews) for (const o of r.occurrences || []) o.title = o.title.replaceAll(oldName, v.name);
    for (const e of own('evidence').filter(e => e.linked_id === v.vendor_id || reviews.some(r => r.review_id === e.linked_id))) for (const field of ['display_name', 'title', 'name', 'description']) if (e[field]) e[field] = e[field].replaceAll(oldName, v.name);
  });
  for (const r of own('reviews').filter(r => r.vendor_id)) {
    const v = own('vendors').find(v => v.vendor_id === r.vendor_id);
    r.title = VENDOR_PURPOSES[r.vendor_purpose || 'vendor'] + ' — ' + v.name;
    r.owner_id = v.business_owner_id;
    r.vendor_business_owner_id = v.business_owner_id;
  }
  const staleVendor = own('vendors')[0];
  staleVendor.assurance_records[0].refresh_due = date(-9);
  for (const e of own('evidence').filter(e => staleVendor.assurance_records[0].evidence_ids.includes(e.evidence_id))) e.refresh_date = date(-9);
  const vendorReview = own('reviews').find(r => r.vendor_id === staleVendor.vendor_id && r.vendor_purpose === 'vendor');
  const vendorGap = createGap('assurance', 'Critical hosting provider assurance has expired', 'Obtain current provider assurance and record the risk decision', {
    review: vendorReview,
    occurrence: vendorReview.occurrences.at(-1),
    at: vendorReview.occurrences.at(-1).completed_at,
    due: date(14),
    state: 'in_progress',
    assignee: person(3)
  });
  link(assessment('iso-27001', 'A.5.19'), 'findings', vendorGap.finding_id);
  link(assessment('soc-2', 'CC9.2'), 'findings', vendorGap.finding_id);
  const controlSpecs = [['access', 'Access authorization and recertification', access, 'Review workforce, privileged and supplier access against approved business need.'], ['assets', 'Asset inventory governance', inventory, 'Reconcile managed and discovered assets, ownership and unauthorized connections.'], ['vulnerability', 'Vulnerability remediation', review('vulnerability'), 'Review vulnerability age, remediation evidence and approved exceptions.'], ['awareness', 'Workforce security awareness', review('awareness'), 'Validate assigned training, participation and role-based follow-up.'], ['suppliers', 'Supplier security assurance', review('vendor'), 'Review critical supplier assurance, service scope and risk decisions.'], ['recovery', 'Backup and restoration validation', review('backup'), 'Validate recoverability and dependencies against service commitments.'], ['incident', 'Incident readiness', review('incident-response'), 'Exercise response roles, escalation and post-incident learning.'], ['logging', 'Audit-log governance', review('audit-logging'), 'Verify logging coverage, retention, access and investigation support.']];
  const originalEvidence = db.evidence.find(e => e.client_id === CID && e.linked_id === access.review_id && e.occurrence_id === access.occurrences.at(-1).occurrence_id);
  const sharedEvidence = originalEvidence || addPeriodEvidence(db, client, access, access.occurrences.at(-1));
  for (const [key, name, r, description] of controlSpecs) {
    if (!r) throw new Error('Initech fixture requires validated Review mapping: ' + key);
    const frequency = r.recurrence[0].toUpperCase() + r.recurrence.slice(1);
    const mapped = own('framework_assessments').filter(a => reviewDrivers(r).some(d => d.framework_key === a.framework_key && d.framework_safeguards.includes(a.definition_id)));
    const related_links = [{
      kind: 'reviews',
      id: r.review_id
    }];
    const supporting = key === 'access' ? sharedEvidence : own('evidence').filter(e => e.linked_id === r.review_id && e.occurrence_id).sort((a, b) => b.evidence_date.localeCompare(a.evidence_date))[0] || addPeriodEvidence(db, client, r, r.occurrences.at(-1));
    related_links.push({
      kind: 'evidence',
      id: supporting.evidence_id
    });
    const policies = own('policies').filter(p => mapped.some(a => CATALOGS[a.framework_key].policy_mappings.some(m => m.policy_key === p.baseline_key && m.safeguards.includes(a.definition_id))));
    related_links.push(...policies.map(p => ({
      kind: 'policies',
      id: p.policy_id
    })));
    if (key === 'access') related_links.push({
      kind: 'findings',
      id: shared.finding_id
    }, {
      kind: 'tasks',
      id: sharedTask.task_id
    }, {
      kind: 'risks',
      id: risks[0].risk_id
    }, {
      kind: 'vendors',
      id: staleVendor.vendor_id
    });
    const c = organizationalControlRequest(db, ['organizational-controls'], 'post', {}, {
      client_id: CID,
      request_id: key,
      name,
      description,
      frequency,
      design: 'adequate',
      owner_id: person(key === 'access' ? 2 : 3),
      assessment_ids: mapped.map(a => a.framework_assessment_id),
      related_links
    });
    c.created_at = date(-1400);
    c.updated_at = date(-360);
    const old = {
      ...design(c),
      related_links: [{
        kind: 'reviews',
        id: r.review_id
      }],
      description: key === 'access' ? 'Review workforce access to the original internally managed service.' : description,
      owner_id: person(2),
      at: date(-1400),
      superseded_at: date(-360),
      changed_by: person(0),
      conflicts: [],
      reconciliation_note: ''
    };
    c.history = [old];
    c.observations = [{
      request_id: 'prior-period',
      period_start: date(-1095),
      period_end: date(-731),
      operating: 'effective',
      expected_instances: frequency === 'Quarterly' ? 4 : frequency === 'Monthly' ? 12 : 1,
      collected_instances: frequency === 'Quarterly' ? 4 : frequency === 'Monthly' ? 12 : 1,
      notes: 'Synthetic prior-period inspection; original design and owner retained.',
      at: date(-730),
      by: person(5),
      control_revision: old.at,
      design_snapshot: copy(old)
    }, {
      request_id: 'current-period',
      period_start: date(-365),
      period_end: date(-1),
      operating: key === 'access' ? 'gap' : 'effective',
      expected_instances: frequency === 'Quarterly' ? 4 : frequency === 'Monthly' ? 12 : 1,
      collected_instances: key === 'access' ? 3 : frequency === 'Quarterly' ? 4 : frequency === 'Monthly' ? 12 : 1,
      notes: key === 'access' ? 'Supplier access population and one approval are incomplete; linked Findings retain corrective work.' : 'Synthetic operating samples inspected.',
      at: date(-1),
      by: person(5),
      control_revision: c.updated_at,
      design_snapshot: design(c)
    }];
    for (const a of mapped) link(a, 'evidence', supporting.evidence_id);
  }
  // Historical policy versions retain their own evidence and approval subjects.
  const policy = own('policies').find(p => p.baseline_key === 'policy-access-control-identity-management-policy');
  evidence(db, client, 'access-policy-v1', policy.title + ' — historical revision 1.0', 'policy', policy.policy_id, date(-1100), person(0), {
    evidence_type: 'Policy / Procedure'
  });
  evidence(db, client, 'access-policy-v3', policy.title + ' — revision 3.0', 'policy', policy.policy_id, date(-50), person(0), {
    evidence_type: 'Policy / Procedure',
    version: 3
  });
  const oldSubject = {
    ...copy(policy.approval_subject),
    subject_id: CID + '_policy_subject_1',
    version: '1.0',
    captured_at: date(-1100),
    basis: {
      type: 'external',
      reference: 'Synthetic controlled policy register',
      document_version: 'Revision 1.0',
      verification: 'Reference recorded; external bytes not verified'
    }
  };
  const externalApproval = (subject, at) => ({
    action: 'external_approval_recorded',
    recorded_by: person(0),
    recorded_by_name: 'Peter Gibbons',
    recorded_at: at,
    reported_approver_id: person(1),
    reported_approved_at: at,
    provenance: 'Synthetic external approval metadata; not an in-app approval',
    subject: copy(subject)
  });
  policy.decision_history.unshift(externalApproval(oldSubject, date(-1095)));
  Object.assign(policy, {
    version: '3.0',
    status: 'approved',
    approved_at: date(-45),
    effective_date: date(-44),
    approval_source: {
      version: '3.0',
      external_reference: 'Synthetic controlled policy register',
      external_version: 'Revision 3.0'
    },
    owner_id: person(0)
  });
  policy.approval_subject = approvalSnapshot(db, policy);
  policy.approval_subject.subject_id = CID + '_policy_subject_3';
  policy.approval_subject.captured_at = date(-45);
  policy.decision_history.push(externalApproval(policy.approval_subject, date(-45)));
  const policyReview = review('policy-review');
  policy.governance_context.cadence_rationale = 'Management selected ' + policyReview.recurrence + ' review and reassessment following material changes; the linked Review owns the schedule.';
  policyReview.policy_id = policy.policy_id;
  policy.last_reviewed_at = policyReview.occurrences.at(-1).completed_at;
  policy.next_review_date = policyReview.due_date;
  const soa = review('iso-soa-review');
  for (const [i, o] of soa.occurrences.entries()) o.iso_soa_snapshot = {
    captured_at: o.completed_at,
    profile: {
      scope: i < soa.occurrences.length - 1 ? 'Original service; no outsourced development' : client.framework_settings['soc-2'].system_description
    },
    assessments: own('framework_assessments').filter(a => a.framework_key === 'iso-27001' && a.definition_id.startsWith('A.')).map(a => ({
      framework_assessment_id: a.framework_assessment_id,
      definition_id: a.definition_id,
      status: i < soa.occurrences.length - 1 && a === scopeChange ? 'not_applicable' : a.status,
      soa_applicability: i < soa.occurrences.length - 1 && a === scopeChange ? 'excluded' : a.soa_applicability,
      soa_justification: i < soa.occurrences.length - 1 && a === scopeChange ? 'No outsourced development in the earlier boundary' : a.soa_justification
    }))
  };
  auditProgram(db, client, date, createGap);
  for (const r of own('reviews').filter(r => !r.iso_audit && r.status !== 'cancelled' && r.occurrences?.length && reviewDrivers(r).length)) {
    const o = r.occurrences.at(-1),
      e = own('evidence').find(e => e.linked_id === r.review_id && e.occurrence_id === o.occurrence_id) || addPeriodEvidence(db, client, r, o);
    for (const a of own('framework_assessments').filter(a => reviewDrivers(r).some(d => d.framework_key === a.framework_key && d.framework_safeguards.includes(a.definition_id)))) link(a, 'evidence', e.evidence_id);
  }
  // Tiny synthetic files accompany complete metadata; history must not consume the
  // file cache budget or make reset discard canonical artifact payloads.
  for (const e of own('evidence')) {
    const text = 'DEMO - SYNTHETIC DATA\nInitech\nCollected: ' + e.evidence_date;
    e.content_base64 = btoa(text);
    e.size = text.length;
  }
  // Management representations are separate from period operating samples.
  // This snapshot records the named criteria only; it never changes their judgments.
  const readiness = own('framework_assessments').filter(a => a.framework_key === 'soc-2' && a.status === 'addressed' && !a.related_links.some(l => l.kind === 'evidence') && !['CC1.5', 'CC2.3'].includes(a.definition_id));
  if (readiness.length) {
    const e = evidence(db, client, 'soc-readiness-register', 'Management readiness register — governance and control design', 'framework_assessment', readiness[0].framework_assessment_id, date(-1), person(0));
    const text = ['DEMO - SYNTHETIC DATA', 'Collected: ' + e.evidence_date, 'Initech management representations; not an audit opinion or proof of operating effectiveness.', ...readiness.map(a => a.definition_id + ' | ' + a.status + ' | ' + a.implementation)].join('\n');
    const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    e.content_base64 = btoa(bytes);
    e.size = bytes.length;
    e.notes = 'Synthetic design/readiness workpaper. Period evidence and independent criterion judgments remain separate.';
    readiness.forEach(a => link(a, 'evidence', e.evidence_id));
  }
  const management = review('management-review');
  for (const o of management.occurrences) if (!o.evidence.length) addPeriodEvidence(db, client, management, o);
  const managementAction = own('tasks').find(t => t.task_id === CID + '_management_action');
  Object.assign(managementAction, {
    title: 'Approve recovery objective funding and accountable owners',
    source_type: 'review',
    source_id: management.review_id,
    review_id: management.review_id,
    occurrence_id: management.occurrences.at(-1).occurrence_id,
    assignee_id: person(1),
    created_at: management.occurrences.at(-1).completed_at
  });
  // Rebuild only this client's synthetic activity, never other clients' records.
  db.logs = db.logs.filter(l => l.client_id !== CID);
  for (const r of own('reviews').filter(r => r.iso_audit || r.risk_id || r.vendor_id || ['user-access', 'management-review', 'iso-soa-review'].includes(r.baseline_key || r.framework_plan_key))) for (const o of r.occurrences || []) log(db, 'reviews', r.review_id, o.completed_at, 'Review completed', o.completed_by, {
    occurrence_id: o.occurrence_id,
    outcome: o.outcome
  });
  for (const f of own('findings')) {
    log(db, 'findings', f.finding_id, f.created_at, 'create');
    if (f.closed_at) log(db, 'findings', f.finding_id, f.closed_at, 'validate');
  }
  for (const t of own('tasks')) log(db, 'tasks', t.task_id, t.completed_at || t.updated_at, 'Action Item ' + (t.status === 'done' ? 'completed' : 'updated'), t.completed_by || person(0));
  for (const e of own('evidence')) log(db, 'evidence', e.evidence_id, e.created_at, 'upload', e.uploaded_by);
  log(db, 'clients', CID, date(-1450), 'onboarding-complete');
  log(db, 'risks', risks[0].risk_id, date(-2), 'Risk updated');
  db.logs.sort((a, b) => b.at.localeCompare(a.at) || a.audit_id.localeCompare(b.audit_id));
  db.user = explorer;
  return db;
}
