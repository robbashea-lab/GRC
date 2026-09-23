import catalog from '../lib/onboardingCatalog.json';
import { CATALOGS } from '../lib/frameworks';
import { reviewView } from '../lib/reviewOccurrences';
import { assessedRisk } from '../lib/grcWork';
import { demoOrganizations, demoDates, demoProfile } from './demoPortfolio';
export { demoOrganizations } from './demoPortfolio';

// Explicit Demo initialization/reset only; no persistent backend writes.
export function buildDemoStore(tableNames, clock = new Date()) {
  const date = demoDates(clock),
    db = Object.fromEntries(tableNames.map(k => [k, []]));
  db.user = {
    user_id: 'demo_admin',
    name: 'Demo Explorer',
    email: 'explorer@omnisciente.example',
    role: 'super_admin',
    status: 'active',
    workspace_mode: 'demo',
    client_ids: demoOrganizations.map(o => 'demo_' + o.key),
    favorite_client_ids: []
  };
  db.users.push({
    ...db.user
  });
  Object.assign(db, {
    logs: [],
    notifications: [],
    drafts: {},
    baselines: {}
  });
  for (const org of demoOrganizations) {
    const cid = 'demo_' + org.key,
      owner = 'demo_owner_' + org.key,
      users = [owner, cid + '_user_1', cid + '_user_2'];
    const meta = {
      client_id: cid,
      created_at: date(-600),
      updated_at: date(-3),
      created_by: owner
    };
    org.people.forEach((name, i) => {
      const user_id = users[i],
        contact_id = cid + '_contact_' + i;
      if (user_id) db.users.push({
        user_id,
        name,
        email: org.key + '.person' + i + '@example.test',
        role: i === 0 ? 'platform_admin' : 'client_contributor',
        status: 'active',
        client_ids: [cid],
        workspace_mode: 'demo'
      });
      db.contacts.push({
        ...meta,
        contact_id,
        name,
        email: org.key + '.person' + i + '@example.test',
        status: 'active',
        ...(user_id ? {
          linked_user_id: user_id
        } : {}),
        role: ['Information Security Lead', 'Executive Sponsor', 'IT Lead', 'Finance Contact', 'Vendor / Third-Party Contact', 'HR Contact', 'Legal / Privacy Contact', 'HR Contact', 'Business Continuity / Disaster Recovery Lead'][i % 9],
        title: ['Security Program Lead', 'Executive Sponsor', 'Operations and Technology Lead', 'Business Stakeholder'][i % 4]
      });
    });
    const client = {
      ...meta,
      client_id: cid,
      name: org.name,
      industry: org.industry,
      status: 'active',
      environment: 'Demo',
      assigned_owner_id: owner,
      primary_contact_id: cid + '_contact_0',
      profile: demoProfile(org, date),
      notes: 'Fictional Year-2 program. Progress is not certification or a determination of compliance.'
    };
    if (org.frameworks.includes('soc-2')) client.framework_settings = {
      'soc-2': {
        categories: ['security', 'availability'],
        system_description: 'Synthetic service boundary: identity, endpoints, service platform, backup and support operations.',
        period_start: date(-180),
        period_end: date(185)
      }
    };
    db.clients.push(client);
    const policyResponses = {},
      requirementResponses = {};
    catalog.policies.forEach((p, i) => {
      policyResponses[p.key] = 'yes';
      db.policies.push({
        ...meta,
        policy_id: cid + '_' + p.key,
        title: p.name,
        category: p.category,
        baseline_key: p.key,
        baseline_response: 'yes',
        presence: 'verified_existing',
        status: i === 3 ? 'draft' : 'approved',
        version: i === 3 ? '2.1-draft' : '2.0',
        owner_id: users[i % 3],
        approver_contact_id: cid + '_contact_1',
        summary: 'Defines ' + p.name.toLowerCase() + ' responsibilities, operating expectations and evidence retention for ' + org.name + '.',
        last_reviewed_at: date(-260),
        next_review_date: date(i === 1 ? 20 : 105 + i * 3),
        governance_context: {
          category: 'organizational',
          rationale: 'Management-approved direction for the operating program; catalog mappings explain external support.',
          cadence_source: 'organization_defined',
          cadence_rationale: 'Annual governance review and reassessment following material changes.'
        },
        approval_source: {
          version: '2.0',
          external_reference: 'Synthetic controlled policy register / ' + p.name,
          external_version: 'Revision 2.0'
        }
      });
    });
    catalog.requirements.forEach(item => {
      const applies = org.frameworks.includes(item.key);
      requirementResponses[item.key] = applies ? 'applies' : 'does_not_apply';
      db.requirements.push({
        ...meta,
        requirement_id: cid + '_requirement_' + item.key,
        title: item.name,
        category: item.category,
        baseline_key: item.key,
        baseline_response: requirementResponses[item.key],
        applicability: applies ? 'applicable' : 'not_applicable',
        status: applies ? 'active' : 'retired',
        owner_id: owner,
        description: 'Synthetic applicability decision only; no legal or certification claim.'
      });
    });
    const selected = catalog.reviews.filter(r => ['user-access', 'user-lifecycle', 'inventory', 'awareness', 'vendor', 'restore', 'bcp-dr', 'policy-review'].includes(r.key));
    const plans = org.frameworks.flatMap(key => (CATALOGS[key]?.review_plans || []).map(p => ({
      ...p,
      framework_key: key
    })));
    const configs = {};
    for (const p of [...selected.map(r => ({
      key: r.key,
      baseline_key: r.key,
      title: r.name,
      review_type: r.review_type,
      default_cadence: 'quarterly'
    })), ...plans]) {
      if (db.reviews.some(r => r.client_id === cid && (p.baseline_key ? r.baseline_key === p.baseline_key : r.framework_plan_key === p.key))) continue;
      const index = db.reviews.filter(r => r.client_id === cid).length;
      db.reviews.push(reviewView({
        ...meta,
        review_id: cid + '_review_' + (p.baseline_key || p.key),
        title: p.title,
        review_type: p.review_type,
        baseline_key: p.baseline_key,
        baseline_selection: 'selected',
        framework_plan_key: p.framework_key ? p.key : undefined,
        owner_id: users[index % 3],
        reviewer_id: users[(index + 1) % 3],
        status: index === 1 ? 'in_progress' : 'upcoming',
        due_date: date(index === 0 ? -8 : index === 1 ? 12 : index === 2 ? 24 : 45 + index * 3),
        recurrence: p.default_cadence,
        governance_context: {
          category: 'organizational',
          rationale: 'Recurring operating verification with retained occurrence evidence and management follow-up.',
          cadence_source: 'organization_defined',
          cadence_rationale: 'Management selected this operating interval; source-prescribed intervals are displayed separately.'
        }
      }));
    }
    for (const p of plans) {
      const r = db.reviews.find(r => r.client_id === cid && (p.baseline_key ? r.baseline_key === p.baseline_key : r.framework_plan_key === p.key));
      configs[p.key] = {
        enabled: true,
        recurrence: r.recurrence,
        due_date: r.due_date
      };
    }
    db.baselines[cid] = {
      version: 3,
      step: 3,
      completed: true,
      policies: policyResponses,
      requirements: requirementResponses,
      reviews: selected.map(r => r.key),
      framework_reviews: configs
    };
    client.initial_program_baseline = {
      completed_at: date(-590),
      completed_by: owner,
      state: JSON.parse(JSON.stringify(db.baselines[cid])),
      counts: {
        policies: catalog.policies.length,
        reviews: db.reviews.filter(r => r.client_id === cid).length
      },
      note: 'Synthetic initial onboarding baseline; current operational records evolve independently.'
    };
    Object.values(client.initial_program_baseline.state.framework_reviews).forEach((config, i) => {
      config.due_date = date(-580 + i);
    });
    ['Identity and productivity tenant', 'Managed endpoint fleet', 'Backup and recovery platform', org.key === 'sacred' ? 'Clinical records application' : org.key === 'cyberdyne' ? 'Restricted engineering workspace' : 'Core service application', 'Finance and payroll application', 'Security monitoring platform'].forEach((name, i) => db.assets.push({
      ...meta,
      asset_id: cid + '_asset_' + i,
      name,
      asset_type: i === 1 ? 'workstation' : i === 3 ? 'application' : 'saas',
      criticality: i === 3 ? 'critical' : 'high',
      location: i === 1 ? 'Managed sites' : 'US hosted boundary',
      status: 'active',
      owner_id: users[i % 3],
      description: 'Synthetic inventory. ' + (org.key === 'cyberdyne' ? 'Restricted engineering/CUI context; formal CMMC asset categorization is not implemented.' : org.frameworks.includes('hipaa') && i === 3 ? 'ePHI application boundary.' : 'In the defined organizational service scope.')
    }));
    ['Recovery testing has not validated application dependencies', 'Cloud administrative permissions exceed least-privilege requirements', 'Supplier recovery concentration remains within accepted tolerance', 'Legacy unsupported endpoints were removed from production'].forEach((title, i) => db.risks.push(assessedRisk({
      ...meta,
      risk_id: cid + '_risk_' + i,
      title,
      description: 'Scoped systems and operating reviews inform this treatment decision.',
      category: 'operational',
      source_type: 'manual',
      status: ['in_progress', 'assessed', 'accepted', 'closed'][i],
      owner_id: users[i % 3],
      likelihood_score: [3, 2, 2, 1][i],
      impact_score: [4, 3, 3, 2][i],
      assessment_rationale: 'Management evaluated exposure, operating safeguards and recovery impact.',
      treatment: i === 2 ? 'accept' : 'mitigate',
      treatment_plan: i === 0 ? 'Validate recovery dependencies and retain exercise evidence.' : 'Maintain controls and verify at the next governance review.',
      last_reviewed: date(i === 3 ? -90 : -45),
      next_review: i === 3 ? null : date(65 + i * 20),
      review_cadence: 'quarterly',
      ...(i === 2 ? {
        acceptance_rationale: 'Time-limited acceptance with quarterly monitoring; alternative provider evaluated.',
        accepted_by: users[1],
        acceptance_date: date(-45),
        acceptance_expires_at: date(140)
      } : {}),
      ...(i === 3 ? {
        closed_at: date(-80),
        closed_by: owner,
        closure_reason: 'remediated',
        closure_rationale: 'Asset retirement verified and exposure removed.'
      } : {})
    })));
    for (let i = 0; i < 3; i++) db.vendors.push({
      ...meta,
      vendor_id: cid + '_vendor_' + i,
      name: ['Sentinel Recovery Services', 'Northstar Payroll', 'Harbor Collaboration Services'][i],
      services: ['Managed backup and recovery', 'Payroll processing', 'Business collaboration'][i],
      criticality: ['critical', 'medium', 'low'][i],
      status: 'active',
      business_owner_id: users[i],
      owner_id: users[i],
      data_types: i === 1 ? ['Employee Data', 'Financial'] : ['Confidential'],
      last_review: date(-200),
      next_review: date(i === 0 ? org.key === 'cyberdyne' ? -6 : 18 : 140 + i * 20),
      review_frequency: 'annual',
      contract_renewal: date(i === 1 ? 55 : 180 + i * 30),
      contract_lead_days: 30,
      assurance_required: true,
      assurance_records: [{
        assurance_id: cid + '_assurance_' + i,
        type: 'Security Questionnaire',
        required: true,
        received_at: date(-250),
        refresh_due: date(i === 0 ? org.key === 'cyberdyne' ? -6 : 18 : 115 + i * 20),
        evidence_ids: []
      }],
      notes: 'Fictional provider. ' + (org.frameworks.includes('hipaa') && i === 0 ? 'Business Associate oversight and agreement review recorded as program context.' : 'Assurance reviewed by internal relationship owner.')
    });
    db.assessments.push({
      ...meta,
      assessment_id: cid + '_annual_assessment',
      name: org.key === 'sacred' ? 'Security Risk Analysis' : org.key === 'cyberdyne' ? 'Engineering Boundary Readiness Review' : 'Annual Program Assessment',
      date: date(-45),
      status: 'completed',
      summary: 'Synthetic Year-2 scope, operating evidence and residual risk review. Follow-up remains in authoritative Risks and Action Items.'
    });
  }
  return db;
}
