import {DUNDER_EIGHT_YEAR_PLAN} from './dunderEightYear';
import {assessedRisk} from '../../lib/grcWork';
import {AI_DEFAULTS, validateAI} from '../../lib/aiGovernance';
import {questions, proposalFor, screeningScope, onboardingProjection} from '../../lib/aiOnboarding';
import {eligible, validateAssignment} from '../assignmentEligibility';
import {validateVendor} from '../vendors';
import {riskSnapshot} from '../risks';

const CID = 'demo_dunder', PREFIX = CID + '_8y_';
const SOURCE = 'Synthetic eight-year Dunder Mifflin scenario; not an executed browser action or customer activity.';
const id = (kind, key) => PREFIX + kind + '_' + key;
const copy = value => JSON.parse(JSON.stringify(value));
const shifted = (day, offset) => new Date(Date.parse(day.slice(0, 10) + 'T00:00:00.000Z') + offset * 86400000).toISOString().slice(0, 10);
const firstDue = (created, target) => {
  const year = Number(created.slice(0, 4)), candidate = `${year}-${target.slice(5, 10)}`;
  return candidate > created.slice(0, 10) ? candidate : `${year + 1}-${target.slice(5, 10)}`;
};

// Six closed issues, five explicitly accepted residuals, six treatment projects
// and seven assessed operating risks. Four AI risks below complete the population.
const BUSINESS_RISKS = [
  ['shared-erp', 'Shared ERP administrator credentials', 'A shared Dynamics GP administration account prevented reliable attribution of pricing and master-data changes.', 2, 4, 'closed', '2018-11-09', '2019-09-20', 'Named administrator roles, vaulted emergency access and sampled audit trails replaced the shared account.'],
  ['invoice-diversion', 'Supplier bank-detail change diversion', 'An emailed bank-detail change could redirect paper-supplier payments without independent confirmation.', 2, 4, 'closed', '2019-03-18', '2019-10-25', 'Accounting introduced an independently sourced callback and separate payment authorization; Oscar sampled the corrected process.'],
  ['turnover-inventory', 'Unowned warehouse devices after IT turnover', 'The November 2021 departures left scanner and label-printer records without verified custodians or support ownership.', 3, 3, 'closed', '2021-11-19', '2022-07-22', 'Priya and Darryl reconciled the physical devices, purchasing records and network list; independent sampling confirmed ownership.'],
  ['turnover-access', 'Inherited privileged access after IT departures', 'Unreconciled service accounts and inherited administrator memberships outlived the 2021 technology handover.', 3, 4, 'closed', '2021-11-19', '2022-09-16', 'The MSP reconciled named owners and disabled obsolete grants; Oscar validated approval and denied-access evidence.'],
  ['wms-dependency', 'Undocumented order-service recovery dependency', 'The delayed ERP recovery exercise restored its database but omitted the WMS integration and shipping-label dependency.', 3, 4, 'closed', '2022-06-17', '2023-06-23', 'A complete order-to-label retest restored the application dependency set and retained elapsed recovery results.'],
  ['legacy-vault', 'Retired credential-vault deployment', 'Historical LastPass business-vault exposure required a controlled replacement and rotation of business secrets.', 2, 4, 'closed', '2022-12-28', '2023-06-30', 'Vault migration, secret rotation, access checks and the final supplier offboarding record removed this deployment-specific condition.'],
  ['supplier-concentration', 'Primary paper supplier concentration', 'A prolonged outage at the principal stock supplier could delay contracted deliveries despite alternate purchasing arrangements.', 2, 3, 'accepted', '2018-11-12', null, 'Procurement maintains alternate stock sources and a monitored buffer; switching every order would exceed the residual benefit.'],
  ['warehouse-flood', 'Warehouse flood and local access disruption', 'A severe local event could interrupt the Scranton warehouse and safe access to staged paper stock.', 2, 4, 'accepted', '2018-12-03', null, 'Insurance, offsite order records and an agreed alternate dispatch arrangement reduce but do not remove geographic concentration.'],
  ['telecom-concentration', 'Regional telecommunications disruption', 'Primary and backup links may share regional infrastructure during a large-area outage.', 2, 3, 'accepted', '2019-04-08', null, 'Separate carriers and an offline shipping fallback are maintained; residual regional dependency is within the documented tolerance.'],
  ['legacy-erp-support', 'Supported legacy ERP platform dependency', 'Dynamics GP remains dependent on specialist support and a bounded compatibility environment while migration options are evaluated.', 2, 3, 'accepted', '2020-08-17', null, 'The current supported release, restricted administration and tested recovery are retained while a funded replacement decision is evaluated.'],
  ['parcel-network', 'Peak-season carrier disruption', 'Customer deliveries depend on parcel-carrier capacity and weather-related network availability.', 2, 2, 'accepted', '2019-01-14', null, 'UPS and FedEx alternatives, customer communication and dispatch buffers limit the residual commercial impact.'],
  ['alternate-dispatch', 'Alternate shipping-route exercise improvement', 'An additional optional route rehearsal would improve confidence for unusual multi-carrier disruption.', 2, 2, 'in_progress', '2026-08-17', null, 'Exercise the optional route, record travel and order-reconciliation observations, then decide whether the operating guide needs refinement.'],
  ['label-supplies', 'Label-stock supplier resilience improvement', 'A narrow label-stock supply range could complicate an unusually long replenishment interruption.', 2, 2, 'in_progress', '2026-07-13', null, 'Qualify an additional compatible label-stock source without representing the current supported stock as an implementation failure.'],
  ['archive-retrieval', 'Paper-archive retrieval efficiency', 'A low-frequency request for older paper contracts may take longer than the internal target despite intact retention and custody controls.', 2, 2, 'in_progress', '2026-06-08', null, 'Measure retrieval samples and improve the index; existing retention and authorized access remain in force.'],
  ['visitor-wayfinding', 'Warehouse visitor-route clarity', 'Unfamiliar delivery personnel may require repeated escort instructions near a restricted stock area.', 2, 2, 'in_progress', '2026-08-03', null, 'Trial clearer visitor directions while maintaining the existing escort and access-control arrangement.'],
  ['recovery-metrics', 'Recovery measurement granularity', 'Current successful order-service tests could benefit from finer observations on the optional reporting service.', 2, 2, 'in_progress', '2026-09-07', null, 'Add measurement checkpoints to the next planned exercise; required service recovery has already been demonstrated.'],
  ['supplier-dashboard', 'Supplier assurance evidence navigation', 'Owners may spend unnecessary time locating already reviewed supplier evidence across contract and assurance records.', 2, 2, 'in_progress', '2026-09-14', null, 'Improve internal cross-references without merging supplier review, assurance follow-up or legal renewal decisions.'],
  ['sales-export', 'Authorized customer-price export misuse', 'An authorized salesperson could mishandle an exported customer-pricing file outside its controlled library.', 2, 3, 'assessed', '2020-06-15', null, 'Maintain access restrictions, recipient verification, handling training and exception monitoring for legitimate exports.'],
  ['phishing', 'Business-email phishing and session theft', 'A convincing supplier or customer message may target a managed user session despite MFA and filtering.', 3, 3, 'assessed', '2018-11-16', null, 'Maintain phishing-resistant practices, suspicious-message reporting, monitored sign-ins and verified payment-change procedures.'],
  ['warehouse-device-loss', 'Portable warehouse-device loss', 'A scanner or portable laptop could be lost during a loading or delivery activity.', 2, 3, 'assessed', '2018-11-23', null, 'Keep assigned custodians, encrypted supported devices, session restrictions and prompt loss reporting.'],
  ['hr-confidentiality', 'Misdelivery of HR or payroll information', 'An authorized HR or payroll communication could be addressed to the wrong internal recipient.', 2, 4, 'assessed', '2019-02-18', null, 'Use restricted HR locations, recipient checks and documented payroll-provider handling with a separately recorded incident route.'],
  ['contract-term-change', 'Customer contract confidentiality change', 'A new customer confidentiality obligation could be missed if sales and document control do not reconcile the signed terms.', 2, 3, 'assessed', '2020-03-09', null, 'Require contract intake and owner review of changed commitments before operational use.'],
  ['supplier-remote-access', 'Approved MSP remote-session exposure', 'An authorized support session could expose systems beyond its approved purpose if its scope is not checked.', 2, 4, 'assessed', '2022-03-14', null, 'Maintain named support users, MFA, time-bound authorization and retained session evidence; no blanket provider access is assumed.'],
  ['utility-outage', 'Extended utility outage', 'A lengthy power interruption may exceed local UPS runtime and delay warehouse order processing.', 2, 3, 'assessed', '2018-12-10', null, 'Maintain safe shutdown, protected order records and customer communication with tested recovery once utility service returns.'],
];

function relationship(row, kind, recordId) {
  row.related_links ||= [];
  if (!row.related_links.some(link => link.kind === kind && link.id === recordId)) row.related_links.push({kind, id: recordId});
}

export function addDunderRegisters(db, {dates, addReview, addEvidence, addLog}) {
  if (db.user?.workspace_mode !== 'demo' || dates.anchor !== DUNDER_EIGHT_YEAR_PLAN.interval.anchor
    || db.clients.filter(client => client.client_id === CID && client.environment === 'Demo').length !== 1)
    throw new Error('Dunder registers require the exact canonical Demo client and frozen scenario anchor.');
  const arrays = ['risks', 'vendors', 'ai_systems', 'users', 'contacts'];
  for (const kind of arrays) {
    if (!Array.isArray(db[kind])) throw new Error('Dunder registers require native ' + kind + ' records.');
    if (db[kind].some(row => Object.values(row).some(value => typeof value === 'string' && value.startsWith(PREFIX))))
      throw new Error('Dunder eight-year register identities already exist; refusing a duplicate import.');
  }
  const account = name => {
    const result = db.users.find(user => user.name === name && eligible(user, CID));
    if (!result) throw new Error('An existing eligible Dunder account is required for ' + name + '.');
    return result;
  };
  const owners = [account('Dwight Schrute'), account('Pam Beesly'), account('David Wallace')];
  const actor = db.user;
  if (!eligible(actor, CID) || !['super_admin', 'platform_admin'].includes(actor.role))
    throw new Error('A native platform actor must record fictional acceptance and closure decisions.');
  const start = dates.start || DUNDER_EIGHT_YEAR_PLAN.interval.start;
  const stamp = day => dates.at(day.slice(0, 10));
  const governance = rationale => ({category: 'organizational', cadence_source: 'organization_defined', cadence_rationale: rationale, rationale: SOURCE});

  for (const person of DUNDER_EIGHT_YEAR_PLAN.contacts.filter(item => item.departedOn)) {
    const userId = id('former_user', person.key), contactId = id('former_contact', person.key);
    db.users.push({user_id: userId, name: person.name, email: person.key + '.former@dunder.example.test',
      role: 'client_contributor', workspace_mode: 'demo', status: 'disabled', client_ids: [CID],
      created_at: start, disabled_at: stamp(person.departedOn), title: person.role});
    db.contacts.push({contact_id: contactId, client_id: CID, name: person.name,
      email: person.key + '.former@dunder.example.test', status: 'inactive', title: person.role,
      created_at: start, updated_at: stamp(person.departedOn), notes: 'Fictional former employee; departed ' + person.departedOn + '. No active access is granted.'});
    addLog('users', userId, stamp(person.departedOn), actor.user_id, 'Fictional IT departure and account disabled', {client_id: CID, contact_id: contactId, provenance: SOURCE});
  }
  const replacement = DUNDER_EIGHT_YEAR_PLAN.contacts.find(person => person.key === 'priya');
  db.contacts.push({contact_id: id('contact', 'priya'), client_id: CID, name: replacement.name,
    email: 'priya.desai@dunder.example.test', status: 'active', title: replacement.role,
    created_at: stamp(replacement.joinedOn), updated_at: stamp(replacement.joinedOn),
    notes: 'Fictional replacement employee; operating contact only. Account ownership remains with existing eligible Dunder users.'});
  addLog('contacts', id('contact', 'priya'), stamp(replacement.joinedOn), actor.user_id, 'Replacement IT contact recorded', {provenance: SOURCE});
  const serviceLead=DUNDER_EIGHT_YEAR_PLAN.contacts.find(person=>person.key==='sam');
  db.contacts.push({contact_id:id('contact','sam'),client_id:CID,name:serviceLead.name,
    email:'sam.okafor@managedtechnology.example.test',status:'active',title:serviceLead.role,
    created_at:stamp(serviceLead.joinedOn),updated_at:stamp(serviceLead.joinedOn),
    notes:'Fictional MSP service lead and operating Contact. No new active platform account or approval authority is granted.'});

  const addRisk = (spec, index, assignedOwner = owners[index % owners.length]) => {
    const [key, title, description, likelihood, impact, status, identified, closedOn, plan] = spec;
    const owner = assignedOwner, assessedAt = stamp(shifted(identified, 7));
    const row = assessedRisk({risk_id: id('risk', key), client_id: CID, display_id: 'RISK-' + String(index + 1).padStart(3, '0'),
      title, description, category: 'operational', source_type: 'manual', status, owner_id: owner.user_id,
      likelihood_score: likelihood, impact_score: impact,
      likelihood_rationale: 'Likelihood reflects the documented exposure and frequency in this fictional paper-distribution scope: ' + description,
      impact_rationale: title + ': the consequence described in the saved scenario is ' + description + ' The selected impact is ' + impact + ' on the existing five-point scale, considering the affected service rather than assuming every system fails together.',
      assessment_rationale: description + ' Treatment basis: ' + plan,
      treatment: status === 'accepted' ? 'accept' : status === 'assessed' ? 'monitor' : 'mitigate',
      treatment_plan: plan, date_identified: stamp(identified), created_at: stamp(identified), created_by: actor.user_id,
      updated_at: closedOn ? stamp(closedOn) : dates.at('2026-10-16'), review_cadence: 'annual',
      next_review: closedOn ? null : dates.day(index === 18 ? -4 : 25 + index * 3),
      rating_history: [{event: 'Risk assessed', at: assessedAt, by: owner.user_id,
        new_likelihood: likelihood, new_impact: impact, new_score: likelihood * impact,
        rationale: 'Initial observed exposure: ' + description + ' The owner will evaluate the proposed response and retain separate decision evidence.'}],
      decision_history: [], related_links: [], notes: SOURCE});
    if (status === 'accepted') {
      const at = dates.at('2026-10-16'), expiry = dates.day(90 + index);
      Object.assign(row, {accepted: true, accepted_by: actor.user_id, acceptance_date: at,
        acceptance_expires_at: expiry, acceptance_rationale: plan + ' David Wallace sponsors the business tolerance; the platform actor records the fictional decision.',
        compensating_controls: plan});
      row.decision_history.push({action: 'accepted', by: actor.user_id, at, rationale: row.acceptance_rationale, expires_at: expiry});
    }
    if (closedOn) {
      Object.assign(row, {closed_at: stamp(closedOn), closed_by: actor.user_id,
        closure_reason: key === 'legacy-vault' ? 'system_process_retired' : 'remediated', closure_note: plan});
      row.decision_history.push({action: 'closed', by: actor.user_id, at: stamp(closedOn), reason: row.closure_reason, note: plan});
    }
    validateAssignment(db, 'risks', row);
    db.risks.push(row);
    const review = addReview({key: 'risk_' + key, title: 'Risk Review — ' + title, review_type: 'risk_assessment',
      owner_id: owner.user_id, risk_id: row.risk_id, recurrence: 'annual',
      created_at: stamp(identified), due_date: closedOn ? shifted(identified, 365) : firstDue(identified, row.next_review),
      completionAt: due => index === 18 && due === row.next_review ? dates.day(3) : due,
      ...(closedOn ? {ends_at: stamp(closedOn), cancelled_at: stamp(closedOn), status: 'cancelled'} : {}),
      snapshotAt: at => {
        const accepted = row.acceptance_date && at >= row.acceptance_date;
        const closed = row.closed_at && at >= row.closed_at;
        const snapshot = {risk_id: row.risk_id, title: row.title, owner_id: row.owner_id,
          status: closed ? 'closed' : accepted ? 'accepted' : status === 'closed' ? 'in_progress' : status === 'accepted' ? 'assessed' : status,
          likelihood_score: likelihood, impact_score: impact, risk_score: likelihood * impact,
          treatment: accepted ? 'accept' : status === 'accepted' ? 'monitor' : row.treatment,
          risk_level: row.risk_level, likelihood_rationale: 'Observed exposure: ' + description,
          impact_rationale: 'Potential consequence: ' + description, assessment_rationale: description,
          notes: 'Historical assessment of the recorded exposure; later treatment, acceptance and closure evidence remains separately dated.',
          treatment_plan: at < dates.at('2026-10-16') && !closed ? 'Treatment is planned or being monitored; the later current decision is not projected backward.' : plan,
          ...(accepted ? {acceptance_date: row.acceptance_date, acceptance_expires_at: row.acceptance_expires_at,
            acceptance_rationale: row.acceptance_rationale, accepted_by: row.accepted_by} : {}),
          ...(closed ? {closed_at: row.closed_at, closure_reason: row.closure_reason} : {})};
        return {notes: snapshot.treatment_plan, risk_before: riskSnapshot(snapshot), risk_after: riskSnapshot(snapshot),
          risk_review_recommendation: 'Reviewed — No Change', outcome: 'Reviewed — No Change'};
      },
      governance_context: governance('Annual risk review is an organization-selected practice; it does not close or accept the Risk.')});
    row.linked_review_id = review.review_id;
    row.next_review = closedOn ? null : review.due_date;
    row.last_reviewed = review.occurrences?.filter(item => item.status === 'completed').at(-1)?.completed_at || null;
    relationship(row, 'reviews', review.review_id);
    const evidence = addEvidence({key: 'risk_' + key, title: title + ' — treatment decision record', linked_type: 'risk',
      linked_id: row.risk_id, at: closedOn ? stamp(closedOn) : dates.at('2026-10-16'), owner: owner.user_id,
      content: SOURCE + '\n' + description + '\nAssessment: likelihood ' + likelihood + ', impact ' + impact + '.\n' + plan
        + (closedOn ? '\nClosure separately recorded on ' + closedOn + '.' : '\nResidual exposure and future review remain visible.')});
    relationship(row, 'evidence', evidence.evidence_id);
    addLog('risks', row.risk_id, stamp(identified), owner.user_id, 'Risk identified', {provenance: SOURCE});
    if (closedOn || status === 'accepted') addLog('risks', row.risk_id, closedOn ? stamp(closedOn) : row.acceptance_date,
      actor.user_id, closedOn ? 'Risk closed' : 'Risk accepted', {provenance: SOURCE});
    return row;
  };
  const risks = BUSINESS_RISKS.map((spec, index) => addRisk(spec, index)), vendors = [];

  for (const [index, plan] of DUNDER_EIGHT_YEAR_PLAN.vendors.entries()) {
    const owner = owners[index % owners.length], inactive = !!plan.inactiveOn;
    const next = dates.day(35 + index * 4), renewal = dates.day(120 + index * 7), notice = shifted(renewal, -45);
    const row = {vendor_id: id('vendor', plan.key), client_id: CID, name: plan.name, service: plan.service,
      business_owner_id: owner.user_id, criticality: plan.criticality, status: inactive ? 'inactive' : 'active',
      created_at: stamp(plan.introducedOn), updated_at: inactive ? stamp(plan.inactiveOn) : dates.at('2026-10-16'),
      review_frequency: 'annual', next_review: inactive ? null : next,
      data_types: ['adp'].includes(plan.key) ? ['Employee Data', 'Financial'] : ['microsoft', 'scranton-msp'].includes(plan.key) ? ['Confidential', 'Network / System Access'] : ['Internal'],
      assurance_required: !inactive && ['critical', 'high'].includes(plan.criticality), assurance_records: [],
      separate_assurance_review: !inactive && ['critical', 'high'].includes(plan.criticality),
      assurance_review_date: inactive ? null : dates.day(14 + index), assurance_cadence: 'annual',
      contract_renewal: inactive ? null : renewal, contract_notice_deadline: inactive ? null : notice,
      contract_review_enabled: !inactive, contract_lead_days: 45,
      offboarded_at: inactive ? stamp(plan.inactiveOn) : null,
      related_links: [], notes: SOURCE + ' Annual relationship review, assurance follow-up and legal renewal are separate events.'};
    const review = addReview({key: 'vendor_' + plan.key, title: 'Vendor Review — ' + plan.name, review_type: 'vendor',
      vendor_id: row.vendor_id, vendor_purpose: 'vendor', vendor_business_owner_id: owner.user_id,
      owner_id: owner.user_id, recurrence: 'annual', created_at: stamp(plan.introducedOn),
      due_date: inactive ? shifted(plan.introducedOn, 365) : firstDue(plan.introducedOn, next),
      ...(inactive ? {ends_at: stamp(plan.inactiveOn), cancelled_at: stamp(plan.inactiveOn), status: 'cancelled'} : {}),
      snapshotAt: when => ({notes: `${row.name}; accountable owner ${owner.name}; criticality ${row.criticality}. `
        + (plan.key === 'microsoft' && when < stamp('2020-06-15') ? 'Office 365 and directory services.'
          : plan.key === 'adobe' && when < stamp('2025-02-17') ? 'PDF preparation and contract document handling.' : row.service)
        + ' Historical supplier relationship review; later assurance documents and future contract terms are not projected backward.'}),
      governance_context: governance('Management-selected annual supplier relationship review; it does not renew a contract or certify supplier controls.')});
    row.last_review = review.occurrences?.filter(item => item.status === 'completed').at(-1)?.completed_at || null;
    row.next_review = inactive ? null : review.due_date;
    relationship(row, 'reviews', review.review_id);
    if (row.assurance_required) {
      const evidence = addEvidence({key: 'vendor_assurance_' + plan.key, title: plan.name + ' — internal supplier assurance evaluation',
        linked_type: 'vendor', linked_id: row.vendor_id, at: dates.at('2026-10-01'), owner: owner.user_id,
        content: SOURCE + '\nSupplier service: ' + plan.service + '\nInternal management evaluation of scope, dependencies, access and unanswered questions. This small synthetic record is not a supplier-issued questionnaire, certificate or CPA report. Assurance follow-up does not change the contract renewal date.'});
      row.assurance_records.push({assurance_id: id('assurance', plan.key), type: 'Other', required: true,
        document_name: 'Internal supplier assurance evaluation (synthetic)', review_status: 'reviewed',
        received_at: '2026-10-01', reviewed_on: '2026-10-16', reviewed_by: owner.name,
        next_follow_up: row.assurance_review_date, refresh_due: '2027-10-01', evidence_ids: [evidence.evidence_id], history: []});
      relationship(row, 'evidence', evidence.evidence_id);
      const assurance = addReview({key: 'assurance_' + plan.key, title: 'Security Assurance Review — ' + plan.name,
        review_type: 'vendor', vendor_id: row.vendor_id, vendor_purpose: 'assurance', owner_id: owner.user_id,
        recurrence: 'annual', due_date: firstDue(plan.introducedOn, row.assurance_review_date), created_at: stamp(plan.introducedOn),
        snapshotAt: when => ({notes: `${row.name}; internal assurance follow-up recorded ${when.slice(0,10)}. `
          + 'Management inspected the supplier dependency, authorized access and outstanding questions. No later questionnaire, certificate or report is asserted as received.'}),
        governance_context: governance('Separate management-selected supplier assurance follow-up; not an annual certification requirement or a legal renewal.')});
      relationship(row, 'reviews', assurance.review_id);
    }
    if (!inactive) {
      const contract = addReview({key: 'contract_' + plan.key, title: 'Contract Renewal Review — ' + plan.name,
        review_type: 'vendor', vendor_id: row.vendor_id, vendor_purpose: 'contract', owner_id: owner.user_id,
        recurrence: 'none', due_date: notice, created_at: dates.at('2026-10-16'),
        governance_context: governance('Review the actual notice deadline before the saved future renewal. A completed supplier review does not renew this contract.')});
      relationship(row, 'reviews', contract.review_id);
    }
    validateVendor(db, row, {...row, assurance_records: []});
    db.vendors.push(row);vendors.push(row);
    addLog('vendors', row.vendor_id, stamp(plan.introducedOn), owner.user_id, 'Supplier relationship established', {provenance: SOURCE});
    if (inactive) addLog('vendors', row.vendor_id, stamp(plan.inactiveOn), actor.user_id, 'Supplier offboarding completed', {provenance: SOURCE});
  }

  const aiSystems = [];
  for (const [index, plan] of DUNDER_EIGHT_YEAR_PLAN.aiSystems.entries()) {
    if (plan.introducedOn < plan.availableOn) throw new Error('Dunder AI use predates verified product availability.');
    const owner = plan.owner === 'pam' ? owners[1] : plan.owner === 'angela' ? owners[2] : owners[0];
    const vendor = vendors.find(row => row.vendor_id === id('vendor', plan.vendorKey));
    const sensitive = plan.key !== 'chatgpt-enterprise';
    const row = {...copy(AI_DEFAULTS), ai_system_id: id('ai', plan.key), client_id: CID,
      display_id: 'AI-' + String(index + 1).padStart(3, '0'), name: plan.name, provider: vendor.name,
      vendor_id: vendor.vendor_id, owner_id: owner.user_id, technical_owner_id: owners[0].user_id,
      oversight_owner_id: owner.user_id, status: 'active', product_model: plan.name,
      catalog_key: ({copilot: 'm365', 'chatgpt-enterprise': 'chatgpt', 'zoom-ai': 'zoomai'})[plan.key] || null,
      environment: 'Organization-managed business deployment; fictional scoped operating use',
      description: plan.dataUse, restrictions: 'Human validation before reliance; no autonomous business actions. ' + plan.dataUse,
      purposes: ['Internal Productivity', 'Decision Support'], data_types: sensitive ? ['Internal', 'Confidential'] : ['Public', 'Internal'],
      permitted_data_types: sensitive ? ['Internal', 'Confidential'] : ['Public', 'Internal'],
      access: plan.key === 'copilot' ? ['API / Integration Access'] : [], roles: ['User / Deployer'],
      risk_topics: ['Privacy / Data Exposure', 'Inaccurate Output / Hallucination', 'Human Overreliance'],
      human_review_required: true, human_approval_required: true, oversight_notes: plan.dataUse,
      governance_notes: SOURCE + ' Business sponsor: ' + (plan.owner === 'angela' ? 'Angela Martin' : plan.owner === 'jim' ? 'Jim Halpert' : owner.name)
        + '. Saved accountable ownership remains with an existing eligible account. Current reviewed screening is dated 2026-10-30, not backdated to initial adoption.',
      created_at: stamp(plan.introducedOn), created_by: actor.user_id, updated_at: dates.at('2026-10-30'), related_links: []};
    const answers = Object.fromEntries(questions.map(question => [question.id, false]));
    Object.assign(answers, {managed: true, sensitive, connected: plan.key === 'copilot',
      external: true, consequential: plan.key === 'acrobat-ai', harm: plan.key === 'copilot' || plan.key === 'acrobat-ai',
      oversight: true, settings: true});
    row.onboarding_screening = {schema_version: 1, catalog_version: '2026-10-25', answers,
      scope: screeningScope(row), recorded_at: dates.at('2026-10-30'), recorded_by: actor.user_id};
    const proposal = proposalFor({...row, answers});
    const risk = addRisk(['ai_' + plan.key, 'AI information handling — ' + plan.name, plan.risk,
      proposal.likelihood, proposal.impact, index < 2 ? 'in_progress' : 'assessed', plan.introducedOn, null,
      'Retain deployment restrictions, reviewed access and settings, source verification and human approval. ' + plan.risk], 24 + index, owner);
    relationship(row, 'risks', risk.risk_id);relationship(risk, 'ai_systems', row.ai_system_id);
    row.related_links.find(link => link.kind === 'risks').classification = 'Context';
    const review = addReview({key: 'ai_' + plan.key, title: 'AI Governance Review — ' + plan.name, review_type: 'ai_governance',
      ai_system_id: row.ai_system_id, ai_review_purpose: 'periodic', owner_id: owner.user_id,
      recurrence: 'annual', created_at: stamp(plan.introducedOn), due_date: firstDue(plan.introducedOn, dates.day(50 + index * 7)),
      snapshotAt: when => ({notes: `${row.name}; accountable owner ${owner.name}; provider ${vendor.name}. ${plan.dataUse} `
        + `Linked native Risk ${risk.risk_id}. Human source validation and existing data restrictions retained. `
        + (when >= row.onboarding_screening.recorded_at ? 'Current screening was separately recorded on 2026-10-30.'
          : 'Historical operating-use review; the current 2026-10-25 screening questionnaire had not yet been recorded.')}),
      governance_context: governance('Organization-selected annual AI review. Historic use reviews do not claim the current 2026 screening questionnaire existed before its publication.')});
    relationship(row, 'reviews', review.review_id);relationship(row, 'vendors', vendor.vendor_id);
    validateAI(db, row);validateAssignment(db, 'ai_systems', row);
    if (!onboardingProjection(row).screening_complete) throw new Error('Dunder AI current onboarding screening is incomplete.');
    db.ai_systems.push(row);aiSystems.push(row);risks.push(risk);
    const evidence = addEvidence({key: 'ai_screening_' + plan.key, title: plan.name + ' — current deployment screening',
      linked_type: 'ai_system', linked_id: row.ai_system_id, at: dates.at('2026-10-30'), owner: owner.user_id,
      content: SOURCE + '\nIntroduced ' + plan.introducedOn + '; product available from ' + plan.availableOn
        + '.\nCurrent screening catalog: 2026-10-25, reviewed on 2026-10-30.\nUse: ' + plan.dataUse
        + '\nRisk: ' + plan.risk + '\nAll ten current answers are recorded. This is not an approval signature, a provider certification or a historical use of the current questionnaire.'});
    relationship(row, 'evidence', evidence.evidence_id);
    addLog('ai_systems', row.ai_system_id, stamp(plan.introducedOn), owner.user_id, 'Fictional AI deployment introduced', {provenance: SOURCE});
    addLog('ai_systems', row.ai_system_id, dates.at('2026-10-30'), actor.user_id, 'Current AI onboarding screening recorded', {provenance: SOURCE, risk_id: risk.risk_id});
  }
  db.riskSequences ||= {};
  db.riskSequences[CID] = 28;
  db.ai_counters ||= {};
  db.ai_counters[CID] = 4;
  return {risks, vendors, aiSystems, formerUserIds: DUNDER_EIGHT_YEAR_PLAN.contacts.filter(person => person.departedOn).map(person => id('former_user', person.key))};
}
