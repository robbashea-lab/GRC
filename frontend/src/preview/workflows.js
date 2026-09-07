import { list, record, write, now, audit } from './store';
export function nextDue(base, recurrence, custom) {
  if (!base || !recurrence || recurrence === 'none') return null;
  const date = new Date(base);
  const months = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    annual: 12
  }[recurrence];
  if (months) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    return date.toISOString();
  }
  return recurrence === 'custom' && Number(custom) > 0 ? new Date(date.getTime() + Number(custom) * 86400000).toISOString() : null;
}
export function onboard(db, body) {
  const cid = body.client_id;
  record(db, 'clients', cid);
  const counters = Object.fromEntries(['policies_created', 'policies_updated', 'requirements_created', 'requirements_updated', 'contacts_saved', 'assessments_created', 'known_issues_promoted', 'reviews_created', 'tasks_created', 'findings_created'].map(k => [k, 0]));
  const find = (k, name) => list(db, k, cid).find(r => (r.title || r.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  for (const p of body.policy_responses || []) {
    if (!['yes', 'no', 'unsure', 'na'].includes(p.response)) throw new Error('Unknown policy response.');
    if (p.response === 'na' && !p.applicability_rationale?.trim()) throw new Error(`Rationale required for ${p.name}.`);
    const old = find('policies', p.name);
    const lifecycle = {
      yes: 'needs_verification',
      no: 'needs_creation',
      unsure: 'needs_verification',
      na: 'not_applicable'
    }[p.response];
    const r = write(db, 'policies', {
      client_id: cid,
      title: p.name,
      category: p.category,
      presence: {
        yes: 'reported_existing',
        no: 'reported_missing',
        unsure: 'needs_confirmation',
        na: 'not_applicable'
      }[p.response],
      status: old && !['draft', 'needs_verification', 'needs_creation', 'not_applicable', ''].includes(old.status || '') ? old.status : lifecycle,
      onboarding_note: p.note || old?.onboarding_note,
      applicability_rationale: p.applicability_rationale || old?.applicability_rationale,
      is_client_reported: true
    }, old?.policy_id);
    counters[old ? 'policies_updated' : 'policies_created']++;
    if (['no', 'unsure'].includes(p.response) && !list(db, 'tasks', cid).some(t => t.policy_id === r.policy_id && t.status !== 'done' && t.source === 'GRC Program Onboarding')) {
      write(db, 'tasks', {
        client_id: cid,
        title: p.response === 'no' ? `Develop and approve ${p.name}` : `Confirm whether ${p.name} exists`,
        policy_id: r.policy_id,
        source: 'GRC Program Onboarding'
      });
      counters.tasks_created++;
    }
  }
  for (const r of body.requirement_responses || []) {
    const status = {
      applicable: 'active',
      potentially_applicable: 'under_review',
      needs_review: 'under_review',
      not_applicable: 'retired'
    }[r.applicability];
    if (!status) throw new Error('Unknown applicability.');
    const old = find('requirements', r.name);
    write(db, 'requirements', {
      ...r,
      title: r.name,
      client_id: cid,
      status,
      is_client_reported: true,
      source: 'GRC Program Onboarding'
    }, old?.requirement_id);
    counters[old ? 'requirements_updated' : 'requirements_created']++;
  }
  for (const c of body.contacts || []) {
    const old = list(db, 'contacts', cid).find(r => r.role?.toLowerCase() === c.role?.toLowerCase());
    write(db, 'contacts', {
      ...c,
      client_id: cid
    }, old?.contact_id);
    counters.contacts_saved++;
  }
  for (const a of body.assessments || []) {
    const old = list(db, 'assessments', cid).find(r => r.name?.toLowerCase() === a.name?.toLowerCase() && (r.date || '') === (a.date || ''));
    // Assessments are onboarding records, not fabricated reviews.
    write(db, 'assessments', {
      ...a,
      title: a.name,
      client_id: cid,
      source: 'GRC Program Onboarding'
    }, old?.assessment_id);
    if (!old) counters.assessments_created++;
  }
  for (const i of body.known_issues || []) {
    const kind = i.classification === 'verified_finding' ? 'findings' : 'tasks';
    if (find(kind, i.title)) continue;
    write(db, kind, {
      client_id: cid,
      title: i.title,
      description: i.notes,
      due_date: i.due_date,
      owner_id: kind === 'findings' ? i.owner_id : null,
      assignee_id: kind === 'tasks' ? i.owner_id : null,
      severity: i.priority || 'medium',
      priority: i.priority || 'medium',
      source: `GRC Program Onboarding · ${kind === 'findings' ? 'Existing Finding' : 'Known Issue'}`
    });
    counters.known_issues_promoted++;
    counters[kind === 'findings' ? 'findings_created' : 'tasks_created']++;
  }
  for (const r of body.recurring_reviews || []) {
    if (list(db, 'reviews', cid).some(x => x.title?.toLowerCase() === r.title?.toLowerCase() && !['completed', 'cancelled'].includes(x.status))) continue;
    const d = r.due_date || new Date(Date.now() + (r.due_days || 30) * 86400000).toISOString();
    write(db, 'reviews', {
      ...r,
      client_id: cid,
      owner_id: r.owner_id || db.user.user_id,
      due_date: d,
      next_review_date: nextDue(d, r.recurrence || 'annual'),
      source: 'GRC Program Onboarding'
    });
    counters.reviews_created++;
  }
  audit(db, 'onboarding-complete', 'clients', record(db, 'clients', cid));
  return {
    ok: true,
    counters,
    validation_errors: []
  };
}
export function action(db, kind, id, name, body) {
  const r = record(db, kind, id),
    cid = r.client_id;
  const patch = b => write(db, kind, b, id);
  if (kind === 'reviews' && name === 'complete') {
    if (r.status === 'completed') throw new Error('Review already completed');
    patch({
      status: 'completed',
      completion_date: body.completion_date || now(),
      notes: body.completion_notes ? `${r.notes || ''}\n\n— Completed by ${db.user.name} —\n${body.completion_notes}` : r.notes
    });
    let spawned = null;
    const d = body.spawn_next && nextDue(r.next_review_date || r.due_date, r.recurrence, r.custom_recurrence_days);
    if (d) {
      spawned = write(db, 'reviews', {
        title: r.title,
        client_id: cid,
        review_type: r.review_type,
        recurrence: r.recurrence,
        custom_recurrence_days: r.custom_recurrence_days,
        owner_id: r.owner_id,
        reviewer_id: r.reviewer_id,
        scope: r.scope,
        period: r.period,
        due_date: d,
        next_review_date: nextDue(d, r.recurrence, r.custom_recurrence_days),
        parent_review_id: id
      });
      patch({
        next_occurrence_id: spawned.review_id
      });
    }
    return {
      review: r,
      spawned
    };
  }
  if (kind === 'reviews' && name === 'create-finding') return write(db, 'findings', {
    ...body,
    title: body.title || `Finding from: ${r.title}`,
    client_id: cid,
    review_id: id,
    owner_id: body.owner_id || r.owner_id
  });
  if (kind === 'findings' && name === 'create-task') {
    const task = write(db, 'tasks', {
      ...body,
      title: body.title || `Remediate: ${r.title}`,
      client_id: cid,
      finding_id: id,
      assignee_id: body.assignee_id || r.owner_id,
      priority: body.priority || r.severity,
      due_date: body.due_date || r.due_date,
      description: body.description || r.remediation_plan
    });
    if (r.status === 'open') patch({
      status: 'in_remediation'
    });
    return task;
  }
  if (kind === 'findings' && name === 'raise-risk') {
    if (r.risk_id) throw new Error('Risk already linked to this finding');
    const score = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      info: 3
    }[r.severity] || 3;
    const risk = write(db, 'risks', {
      client_id: cid,
      title: `Risk raised from finding: ${r.title}`,
      owner_id: r.owner_id,
      description: r.description,
      likelihood_score: score,
      impact_score: score,
      source: `Finding ${id}`,
      related_finding_ids: [id],
      treatment: 'mitigate',
      category: 'Compliance'
    });
    patch({
      risk_id: risk.risk_id
    });
    return {
      risk,
      finding: r
    };
  }
  if (kind === 'risks' && name === 'mark-reviewed') return patch({
    last_reviewed: now(),
    next_review: nextDue(now(), 'annual')
  });
  if (kind === 'risks' && name === 'accept') {
    if (!body.rationale?.trim()) throw new Error('Acceptance rationale is required.');
    return patch({
      status: 'accepted',
      treatment: 'accept',
      accepted: true,
      accepted_by: body.approver_id || db.user.user_id,
      acceptance_date: now(),
      acceptance_rationale: body.rationale,
      next_review: body.expiry_date,
      last_reviewed: now(),
      compensating_controls: body.compensating_controls
    });
  }
  if (kind === 'vendors' && name === 'schedule-review') {
    const recurrence = body.recurrence || {
      biennial: 'custom',
      as_needed: 'none'
    }[r.review_frequency] || r.review_frequency || 'annual';
    const d = body.due_date || r.next_review || nextDue(now(), 'annual');
    const review = write(db, 'reviews', {
      ...body,
      title: body.title || `Vendor review · ${r.name}`,
      client_id: cid,
      review_type: 'vendor',
      vendor_id: id,
      owner_id: body.owner_id || r.business_owner_id || db.user.user_id,
      recurrence,
      custom_recurrence_days: r.review_frequency === 'biennial' ? 730 : null,
      due_date: d,
      next_review_date: nextDue(d, recurrence, r.review_frequency === 'biennial' ? 730 : null)
    });
    patch({
      next_review: d
    });
    return {
      review,
      vendor_id: id
    };
  }
  if (kind === 'policies' && name === 'verify') return patch({
    ...Object.fromEntries(Object.entries(body).filter(([, v]) => v != null && v !== '')),
    presence: 'verified_existing',
    verified_at: now(),
    verified_by: db.user.user_id
  });
  if (kind === 'policies' && ['submit-review', 'approve', 'reject'].includes(name)) {
    if (name === 'reject' && !body.reason?.trim()) throw new Error('Rejection reason is required.');
    const status = {
      'submit-review': 'in_review',
      approve: 'approved',
      reject: 'draft'
    }[name];
    return patch({
      status,
      ...(name === 'approve' ? {
        approver_id: db.user.user_id,
        approved_at: now()
      } : {}),
      approval_history: [...(r.approval_history || []), {
        at: now(),
        action: {
          'submit-review': 'submitted',
          approve: 'approved',
          reject: 'rejected'
        }[name],
        by: db.user.user_id,
        by_email: db.user.email,
        ...body
      }]
    });
  }
  if (kind === 'contacts' && name === 'invite') {
    if (!r.email) throw new Error('Contact needs an email address before invite');
    let user = db.users.find(u => u.email.toLowerCase() === r.email.toLowerCase());
    const linked = !!user;
    if (!user) user = write(db, 'users', {
      name: r.name || r.email,
      email: r.email,
      role: 'client_contributor',
      client_ids: [cid],
      status: 'invited',
      simulated: true
    });
    patch({
      linked_user_id: user.user_id
    });
    return {
      user,
      linked,
      simulated: true,
      message: 'Simulated invitation — no email was sent.'
    };
  }
  throw new Error('This action is not implemented in the demo. No changes were saved.');
}
