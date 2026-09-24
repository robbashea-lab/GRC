import { demoDates, demoOrganizations } from './demoPortfolio';
import { reviewView, reviewSchedule } from '../lib/reviewOccurrences';
import { frameworkDefinition, CATALOGS } from '../lib/frameworks';
import { approvalSnapshot } from './policyProvenance';
import { BRAWNDO_CIS, BRAWNDO_CIS_FINDINGS } from './brawndoProgram';
function previousDate(value, months) {
  const d = new Date(value + 'T12:00:00Z'),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
}
function evidence(db, client, key, title, kind, id, at, owner, extra = {}) {
  const text = ['DEMO - SYNTHETIC DATA', client.name, title, 'Collected: ' + at, 'Scope: fictional internal operating environment.', 'Procedure: sample owner inspected the defined population and retained this demonstration summary.', 'Result: operating evidence retained; exceptions are tracked in linked Findings and Actions.', 'This document is not a real audit, certification, legal assessment or client artifact.'].join('\n');
  const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    encoded = btoa(bytes);
  const item = {
    evidence_id: client.client_id + '_evidence_' + key,
    client_id: client.client_id,
    filename: key + '.txt',
    display_name: title,
    mime_type: 'text/plain',
    size: bytes.length,
    content_base64: encoded,
    evidence_type: 'Report',
    linked_type: kind,
    linked_id: id,
    uploaded_by: owner,
    uploaded_by_email: db.users.find(u => u.user_id === owner).email,
    created_at: at,
    evidence_date: at,
    version: 1,
    notes: 'DEMO - SYNTHETIC DATA',
    ...extra
  };
  db.evidence.push(item);
  return item;
}

// Historical fixtures are explicit snapshots. Live workflows below still enforce
// remediation creation/validation; generated identifiers are canonicalized locally.
export function finishDemoStore(db, clock, {
  action,
  write,
  frameworkRequest
}) {
  const date = demoDates(clock);
  for (const org of demoOrganizations) {
    const cid = 'demo_' + org.key,
      client = db.clients.find(c => c.client_id === cid),
      users = db.users.filter(u => u.client_ids?.length === 1 && u.client_ids[0] === cid),
      owner = users[0].user_id;
    const reviews = db.reviews.filter(r => r.client_id === cid),
      policies = db.policies.filter(p => p.client_id === cid),
      risks = db.risks.filter(r => r.client_id === cid);
    for (const [i, r] of reviews.entries()) {
      r.owner_id ||= users[i % 3].user_id;
      r.reviewer_id = users[(i + 1) % 3].user_id;
      r.created_at = date(-580);
      r.updated_at = date(-3);
      if (!r.due_date) r.due_date = date(80 + i * 2);
      Object.assign(r, reviewView(r));
      const months = {
        monthly: 1,
        quarterly: 3,
        semiannual: 6,
        annual: 12
      }[r.recurrence] || 3;
      let due = previousDate(r.due_date.slice(0, 10), months);
      r.occurrences = [];
      while (due >= date(-570)) {
        if (due < date(-2)) {
          const complete = new Date(Date.parse(due) - 86400000).toISOString().slice(0, 10),
            {
              occurrences,
              ...snapshot
            } = r;
          r.occurrences.unshift({
            ...snapshot,
            ...reviewSchedule({
              ...r,
              due_date: due
            }, true),
            occurrence_id: r.review_id + '_' + due,
            due_date: due,
            status: 'completed',
            completed_at: complete,
            completion_date: complete,
            completed_by: r.reviewer_id,
            completed_by_name: db.users.find(u => u.user_id === r.reviewer_id).name,
            outcome: 'no_findings',
            finding_count: 0,
            evidence: []
          });
        }
        due = previousDate(due, months);
      }
      if (r.risk_id) {
        const risk = risks.find(risk => risk.risk_id === r.risk_id);
        if (risk && r.occurrences.length) risk.last_reviewed = r.occurrences.at(-1).completed_at;
      }
    }
    const primary = reviews.find(r => r.baseline_key === 'user-access');
    for (const [i, o] of primary.occurrences.slice(-4).entries()) {
      const e = evidence(db, client, 'access-' + i, primary.title + ' - ' + o.period, 'review', primary.review_id, o.completed_at, o.completed_by, {
        occurrence_id: o.occurrence_id
      });
      o.evidence.push({
        evidence_id: e.evidence_id,
        filename: e.filename,
        version: 1
      });
    }
    for (const [i, r] of ['restore', 'vendor'].map(key => reviews.find(r => r.baseline_key === key)).entries()) {
      const o = r.occurrences.at(-1);
      if (!o) continue;
      const e = evidence(db, client, 'operation-' + i, r.title + ' - ' + o.period, 'review', r.review_id, o.completed_at, o.completed_by, {
        occurrence_id: o.occurrence_id
      });
      o.evidence.push({
        evidence_id: e.evidence_id,
        filename: e.filename,
        version: 1
      });
    }
    for (const [i, p] of policies.entries()) {
      if (i < 3) evidence(db, client, 'policy-' + i, p.title + ' - revision 2.0', 'policy', p.policy_id, date(-260), p.owner_id, {
        evidence_type: 'Policy / Procedure'
      });
      if (p.status === 'approved') {
        const subject = approvalSnapshot(db, p);
        subject.subject_id = p.policy_id + '_subject_2';
        subject.captured_at = date(-260);
        p.approval_subject = subject;
        p.approved_at = date(-260);
        p.effective_date = date(-255);
        p.decision_history = [{
          action: 'external_approval_recorded',
          recorded_by: owner,
          recorded_by_name: users[0].name,
          recorded_at: date(-260),
          reported_approver_id: users[1].user_id,
          reported_approved_at: date(-260),
          provenance: 'Synthetic external approval metadata; not an in-app approval',
          subject
        }];
      }
    }
    for (const v of db.vendors.filter(v => v.client_id === cid)) {
      const r = reviews.find(r => r.vendor_id === v.vendor_id && r.vendor_purpose === 'vendor'),
        o = r?.occurrences.at(-1);
      const e = evidence(db, client, v.vendor_id.slice(cid.length + 1), v.name + ' security assurance review', 'vendor', v.vendor_id, o?.completed_at || date(-250), v.business_owner_id, {
        refresh_date: v.assurance_records[0].refresh_due
      });
      v.assurance_records[0].evidence_ids = [e.evidence_id];
      if (o) {
        v.last_review = o.completed_at;
        v.assurance_records[0].received_at = o.completed_at;
        e.relationships = [{
          kind: 'reviews',
          id: r.review_id,
          occurrence_id: o.occurrence_id
        }];
        o.evidence.push({
          evidence_id: e.evidence_id,
          filename: e.filename,
          version: 1
        });
      }
    }
    evidence(db, client, 'risk-assessment', 'Risk assessment and treatment summary', 'risk', risks[0].risk_id, date(-45), owner);
    const assessment = db.assessments.find(a => a.client_id === cid);
    const frameworkAssessment = db.framework_assessments.find(a => a.client_id === cid);
    evidence(db, client, 'program-assessment', assessment.name, frameworkAssessment ? 'framework_assessment' : 'risk', frameworkAssessment?.framework_assessment_id || risks[0].risk_id, date(-45), owner, {
      evidence_type: 'Assessment'
    });
    const findingTitles = ['Access termination evidence was incomplete', 'Backup restoration test omitted a critical application dependency', 'Supplier review documentation lacked approval', 'Asset inventory contained stale ownership records'];
    const actionTitles = ['Complete access termination evidence', 'Validate backup restoration dependencies', 'Record supplier review approval', 'Update asset ownership records'];
    for (let i = 0; i < 4; i++) {
      const r = reviews.find(r => r.baseline_key === ['user-access', 'restore', 'vendor', 'inventory'][i]),
        o = r.occurrences.at(i >= 2 ? -2 : -1),
        fid = cid + '_finding_' + i;
      const f = {
        finding_id: fid,
        client_id: cid,
        title: findingTitles[i],
        description: 'Recorded during ' + r.title + '. Follow-up is retained separately from the completed Review occurrence.',
        status: 'open',
        severity: i === 1 ? 'high' : 'low',
        owner_id: users[i % 3].user_id,
        review_id: r.review_id,
        occurrence_id: o.occurrence_id,
        due_date: i < 2 ? date(15 + i * 10) : date(-35),
        created_at: o.completed_at,
        updated_at: date(-3),
        created_by: o.completed_by
      };
      db.findings.push(f);
      o.outcome = 'findings_raised';
      o.finding_count++;
      const t = action(db, 'findings', fid, 'create-task', {
          title: actionTitles[i]
        }),
        old = t.task_id;
      t.task_id = cid + '_task_' + i;
      // Only references to this just-created seed task can exist in these events.
      for (const l of db.logs) {
        if (l.entity_id === old) l.entity_id = t.task_id;
        if (l.meta?.task_id === old) l.meta.task_id = t.task_id;
      }
      write(db, 'tasks', {
        status: i === 0 ? 'in_progress' : 'done'
      }, t.task_id);
      if (i >= 2) action(db, 'findings', fid, 'validate', {
        rationale: 'Synthetic validation: corrective evidence inspected and the observed deficiency resolved.'
      });
      Object.assign(t, {
        created_at: o.completed_at,
        updated_at: date(i < 2 ? -3 : -36),
        created_by: owner
      });
      if (t.started_at) t.started_at = date(-5);
      f.updated_at = date(-3);
      if (t.status === 'done') {
        t.completed_at = date(i === 1 ? -3 : -36);
        t.completed_by = users[2].user_id;
      }
      if (i >= 2) {
        Object.assign(f, {
          closed_at: date(-34),
          validated_at: date(-34),
          updated_at: date(-34)
        });
        f.decision_history.forEach(h => h.at = date(-34));
      }
      const e = db.evidence.find(e => e.client_id === cid && e.linked_id === r.review_id && e.occurrence_id === o.occurrence_id);
      if (e) e.relationships = [...(e.relationships || []), {
        kind: 'findings',
        id: fid
      }];
    }
    const riskTask = write(db, 'tasks', {
      client_id: cid,
      title: 'Validate critical application recovery dependencies',
      source_type: 'risk',
      source_id: risks[0].risk_id,
      assignee_id: users[2].user_id,
      due_date: date(55),
      governance_context: {
        category: 'risk',
        rationale: 'Execute the documented recovery treatment plan.'
      }
    });
    riskTask.task_id = cid + '_risk_treatment';
    riskTask.created_at = date(-45);
    riskTask.updated_at = date(-3);
    risks[0].related_task_ids = [riskTask.task_id];
    const manual = write(db, 'tasks', {
      client_id: cid,
      title: 'Confirm next management review participants',
      source_type: 'manual',
      assignee_id: owner,
      due_date: date(75),
      governance_context: {
        category: 'management',
        rationale: 'Leadership requested representation from Operations, Finance and People.'
      }
    });
    manual.task_id = cid + '_management_action';
    manual.created_at = date(-5);
    manual.updated_at = date(-3);
    const followup = write(db, 'tasks', {
      client_id: cid,
      title: 'Document annual assessment scope decisions',
      source_type: 'audit',
      source_id: assessment.assessment_id,
      assignee_id: owner,
      due_date: date(-20)
    });
    followup.task_id = cid + '_assessment_action';
    write(db, 'tasks', {
      status: 'done'
    }, followup.task_id);
    followup.created_at = date(-45);
    followup.updated_at = date(-22);
    followup.completed_at = date(-22);
    const baseline = reviewView({
      review_id: cid + '_initial_program_review',
      client_id: cid,
      title: 'Initial program baseline verification',
      review_type: 'management',
      status: 'completed',
      recurrence: 'none',
      owner_id: owner,
      created_at: date(-590),
      due_date: date(-560),
      completed_at: date(-561),
      completion_date: date(-561),
      completed_by: users[2].user_id
    });
    baseline.occurrences = [{
      ...baseline,
      occurrence_id: baseline.current_occurrence_id,
      completed_by_name: users[2].name,
      outcome: 'no_findings',
      finding_count: 0,
      evidence: []
    }];
    db.reviews.push(baseline);
    for (const [i, a] of db.framework_assessments.filter(a => a.client_id === cid).entries()) {
      const d = frameworkDefinition(a.framework_key, a.definition_id),
        status = i % 20 === 0 ? 'needs_attention' : i % 20 === 1 ? 'in_progress' : i % 20 === 2 ? 'not_assessed' : 'addressed';
      const patch = {
        status,
        owner_id: users[i % 3].user_id,
        process_owner_id: cid + '_contact_' + i % org.people.length,
        implementation: 'Synthetic management assessment of ' + d.title + '. The defined process is operated by the accountable owner; supporting records and exceptions are retained below.',
        technology: 'Managed identity, endpoint and service environment.',
        notes: 'DEMO - SYNTHETIC DATA. Assessment progress is not certification.'
      };
      const reference = cid === 'demo_brawndo' && a.framework_key === 'cis-ig1' ? BRAWNDO_CIS[a.definition_id] : null;
      if (reference) Object.assign(patch, {
        status: reference[0],
        technology: reference[2],
        implementation: reference[3],
        notes: ''
      });
      if (d.specification === 'annex_control') Object.assign(patch, {
        soa_applicability: 'included',
        soa_justification: 'Included for the documented service boundary and identified information risks.'
      });
      if (d.specification === 'addressable') Object.assign(patch, {
        addressable_decision: 'as_written',
        addressable_rationale: 'The specification is reasonable and appropriate for this synthetic environment; implemented as written.'
      });
      if (a.framework_key === 'nist-csf-2') patch.csf_profile = {
        target_selected: true,
        target_outcome: d.title,
        priority: 'medium',
        gap_state: status === 'addressed' ? 'aligned' : 'gap',
        gap_notes: status === 'addressed' ? 'Operating process matches the selected target.' : 'Document and validate the remaining operating evidence.'
      };
      if (a.framework_key === 'soc-2') patch.management_controls = [{
        control_id: cid + '_control_' + a.definition_id,
        name: d.title,
        description: 'Management-defined operating implementation; not a new AICPA criterion.',
        design: 'adequate',
        operating: status === 'addressed' ? 'effective' : 'gap',
        frequency: 'Quarterly',
        period_start: date(-180),
        period_end: date(185),
        expected_instances: 2,
        collected_instances: status === 'addressed' ? 2 : 1,
        population_notes: 'Two elapsed quarterly operating samples.',
        testing_notes: 'Synthetic readiness review only.'
      }];
      frameworkRequest(db, '/framework-assessments/' + a.framework_assessment_id, 'patch', {}, patch);
      a.created_at = date(-580);
      a.last_assessed = date(-10);
      a.assessment_history.forEach(h => h.at = date(-10));
      if (reference) {
        a.last_assessed = reference[1] == null ? null : date(-reference[1]);
        if (reference[1] == null) a.assessment_history = [];
        a.assessment_history.forEach(h => h.at = a.last_assessed);
        if (reference[4] != null) evidence(db, client, 'cis-' + a.definition_id, 'CIS ' + a.definition_id + ' ' + d.title + ' - validation record', 'framework_assessment', a.framework_assessment_id, date(-reference[4]), owner);
      }
      for (const m of CATALOGS[a.framework_key].policy_mappings.filter(m => m.safeguards.includes(a.definition_id))) {
        const p = policies.find(p => p.baseline_key === m.policy_key);
        if (p) a.related_links.push({
          kind: 'policies',
          id: p.policy_id
        });
      }
      const linked = a.related_links.filter(l => l.kind === 'reviews').map(l => l.id);
      for (const e of db.evidence.filter(e => e.client_id === cid && linked.includes(e.linked_id))) a.related_links.push({
        kind: 'evidence',
        id: e.evidence_id
      });
      const restore = reviews.find(r => r.baseline_key === 'restore');
      if (restore && linked.includes(restore.review_id)) a.related_links.push({
        kind: 'risks',
        id: risks[0].risk_id
      });
      const access = reviews.find(r => r.baseline_key === 'user-access');
      if (access && linked.includes(access.review_id)) a.related_links.push({
        kind: 'risks',
        id: risks[1].risk_id
      });
    }
    if (cid === 'demo_brawndo') for (const [id, title, severity, remediation, who, due, age] of BRAWNDO_CIS_FINDINGS) {
      const a = db.framework_assessments.find(a => a.client_id === cid && a.framework_key === 'cis-ig1' && a.definition_id === id);
      const f = frameworkRequest(db, '/framework-assessments/' + a.framework_assessment_id + '/findings', 'post', {}, {
        title, severity, remediation_title: remediation, request_id: 'brawndo-cis-' + id,
        description: a.implementation
      });
      Object.assign(f, {created_by: owner, due_date: date(due + 14), created_at: date(-age), updated_at: date(-Math.min(age, 7)), status: due < 0 ? 'in_remediation' : 'open'});
      for (const t of db.tasks.filter(t => t.finding_id === f.finding_id)) {
        const old = t.task_id;
        t.task_id = cid + '_cis_action_' + id;
        for (const l of db.logs) {
          if (l.entity_id === old) l.entity_id = t.task_id;
          if (l.meta?.task_id === old) l.meta.task_id = t.task_id;
        }
        Object.assign(t, {
        assignee_id: users[who].user_id, due_date: date(due), created_by: owner, created_at: date(-age), updated_at: date(-Math.min(age, 7)),
        status: due < 0 ? 'in_progress' : 'open'
      });
      }
    }
  }
  // Replace wall-clock workflow telemetry with explicit, internally consistent
  // historical simulation events. Never used for standard workspace audit data.
  db.logs = [];
  const log = (kind, id, cid, at, user, action, meta = {}) => db.logs.push({
    audit_id: 'demo_activity_' + db.logs.length,
    entity_type: kind,
    entity_id: id,
    client_id: cid,
    at: at + 'T12:00:00Z',
    user_id: user.user_id,
    user_name: user.name,
    user_email: user.email,
    action,
    meta: {
      simulated: true,
      ...meta
    }
  });
  for (const c of db.clients) {
    const u = db.users.find(u => u.user_id === c.assigned_owner_id);
    log('clients', c.client_id, c.client_id, date(-590), u, 'onboarding-complete');
    for (const r of db.reviews.filter(r => r.client_id === c.client_id)) for (const o of r.occurrences) log('reviews', r.review_id, c.client_id, o.completed_at, db.users.find(user => user.user_id === o.completed_by), 'Review completed', {
      occurrence_id: o.occurrence_id,
      outcome: o.outcome
    });
    for (const a of db.framework_assessments.filter(a => a.client_id === c.client_id && a.last_assessed)) log('framework_assessments', a.framework_assessment_id, c.client_id, a.last_assessed.slice(0, 10), db.user, 'Framework assessment updated', {
      status: a.status
    });
    for (const t of db.tasks.filter(t => t.client_id === c.client_id)) log('tasks', t.task_id, c.client_id, t.completed_at || date(-3), db.users.find(user => user.user_id === (t.completed_by || t.created_by)) || db.user, t.status === 'done' ? 'Action Item completed' : 'Action Item updated');
    for (const e of db.evidence.filter(e => e.client_id === c.client_id)) log('evidence', e.evidence_id, c.client_id, e.created_at, db.users.find(u => u.user_id === e.uploaded_by), 'upload');
    for (const f of db.findings.filter(f => f.client_id === c.client_id)) {
      log('findings', f.finding_id, c.client_id, f.created_at, db.users.find(u => u.user_id === f.created_by), 'create');
      if (f.closed_at) log('findings', f.finding_id, c.client_id, f.closed_at, db.user, 'validate');
    }
    for (const p of db.policies.filter(p => p.client_id === c.client_id && p.status === 'approved')) log('policies', p.policy_id, c.client_id, p.approved_at, u, 'External approval recorded', {
      provenance: 'Synthetic external decision, not in-app approval'
    });
    log('risks', c.client_id + '_risk_0', c.client_id, date(-2), u, 'Risk updated');
  }
  db.logs.sort((a, b) => b.at.localeCompare(a.at) || a.audit_id.localeCompare(b.audit_id));
  return db;
}
