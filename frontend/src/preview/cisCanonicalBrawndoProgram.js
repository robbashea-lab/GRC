import catalog from '@catalogs/onboardingCatalog.json';
import {activeDefinitions,activePlans,reviewDriver} from '../lib/frameworks';
import {catalogForVersion,versionForSafeguard,visibleQuestions,validateGuidedCompletion,generateResult} from '../lib/guidedAssessment';
import {reviewSchedule,reviewView} from '../lib/reviewOccurrences';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {validateAssignment} from './assignmentEligibility';
import {reconcileItems} from './assessmentItems';
import {previousDate} from './demoHistory';
import {cisDemoSelection} from './cisDemoSelection';
import {BRAWNDO_SCENARIO_PROFILE,brawndoSafeguardContent} from './cisCanonicalBrawndoContent';

const CID='demo_brawndo',PREFIX=CID+'_canonical_';
const SOURCE='Explicit fictional Brawndo Demo import; not a browser action or certification.';
const DOCUMENT_PLANS={
  'policy-data-classification-handling-policy':'data-governance',
  'policy-configuration-management-policy':'secure-configuration',
  'policy-access-control-identity-management-policy':'account-authorization',
  'policy-vulnerability-patch-management-policy':'vulnerability-remediation',
  'policy-information-security-policy':'audit-logging',
  'policy-backup-restoration-policy':'data-recovery',
  'policy-security-awareness-training-policy':'awareness',
  'policy-vendor-third-party-risk-management-policy':'provider-inventory',
  'policy-incident-response-policy':'incident-governance'
};
const DUE_OFFSETS={'asset-inventory':24,'software-support':9,'data-governance':34,'secure-configuration':17,
  'account-authorization':14,'vulnerability-remediation':-7,'audit-logging':61,'data-recovery':43,
  awareness:70,'provider-inventory':-12,'incident-governance':88};
const DOCUMENT_SUMMARIES={
  'policy-data-classification-handling-policy':'Office and ERP data-management process covering sensitivity, owners, handling, retention and disposal. A proposed production-file appendix still needs complete ownership and handling decisions; current technical controls do not approve that appendix.',
  'policy-configuration-management-policy':'Draft expansion of the established network-device runbook to office devices, packaging kiosks and ERP/production servers. The complete endpoint/server configuration lifecycle is missing; the retained approved network-only version supports 4.2, not 4.1.',
  'policy-access-control-identity-management-policy':'Account inventory, quarterly authorization reconciliation, event-driven access approval/revocation, dormant-account handling, dedicated administration and MFA for exposed, remote and administrative access.',
  'policy-vulnerability-patch-management-policy':'The complete vulnerability-management process required by 7.1 is missing. An existing risk-prioritized remediation worksheet supports part of 7.2, but its monthly maintenance is overdue. Windows and application patch execution remain separate operating records.',
  'policy-information-security-policy':'The logging appendix defines event collection, source-specific storage/retention and review/escalation ownership for identity, endpoints, ERP and the access gateway. Browser, DNS and endpoint operating settings retain their own supporting records.',
  'policy-backup-restoration-policy':'Recovery priorities, backup scope, protected storage and accountable operators for dispatch, ERP and office records. Approval of this process does not assert that the isolated-copy arrangement in 11.4 has been assessed.',
  'policy-security-awareness-training-policy':'Induction, annual workforce learning, role-relevant subject coverage, roster reconciliation and content maintenance. The delivered insecure-network lesson under 14.8 remains unassessed despite approval of the core program.',
  'policy-vendor-third-party-risk-management-policy':'Service-provider inventory, classifications, accountable enterprise contacts and annual/change reconciliation. The current aggregate inventory reconciliation is overdue; individual Vendor reviews, assurance follow-up and renewals remain distinct.',
  'policy-incident-response-policy':'Named internal coordinator and backup, verified internal/external contacts, and immediate workforce reporting instructions with an email-independent route. No IG2 incident-response exercise or full IG2 response-process mandate is asserted.'
};
const PARTIAL_CRITERIA={'3.1':new Set(['3.1-c6','3.1-c11','3.1-c8','3.1-c4']),
  '7.2':new Set(['7.2-c2']),'15.1':new Set(['15.1-c6'])};
const copy=value=>JSON.parse(JSON.stringify(value));
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const statusFor=id=>BRAWNDO_SCENARIO_PROFILE.partial.includes(id)?'in_progress'
  :BRAWNDO_SCENARIO_PROFILE.gaps.includes(id)?'needs_attention'
    :BRAWNDO_SCENARIO_PROFILE.unknown.includes(id)?'not_assessed':'addressed';
const reject=message=>{throw new Error('Brawndo program: '+message);};
const scoped=(db,kind)=>(db[kind]||[]).filter(row=>row.client_id===CID);

function contactFor(db,role,processOwners,client) {
  const supplied=processOwners[role],id=typeof supplied==='string'?supplied:supplied?.contact_id;
  const contact=id?db.contacts.find(row=>row.contact_id===id):db.contacts.find(row=>row.contact_id===client.primary_contact_id);
  if(!contact||contact.client_id!==CID||contact.status!=='active')reject('use an existing active Brawndo Contact for '+role+'.');
  return contact;
}

function interview(id,status,content,at,inventoryReview) {
  const version=versionForSafeguard(id),questionSet=catalogForVersion(version).safeguards[id],answers={};
  const absent=status==='needs_attention',partial=status==='in_progress';
  for(const question of questionSet) {
    if(question.type==='matrix')answers[question.id]=Object.fromEntries(question.rows.map((row,index)=>{
      let answer=absent?'No':'Yes';
      if(id==='1.1'&&question.id==='attributes'&&['Hardware address','Asset owner'].includes(row))answer='Partially';
      if(PARTIAL_CRITERIA[id]?.has(question.criterion_ids?.[index]))answer=id==='3.1'?'Partially':'No';
      if(id==='1.1'&&question.id==='coverage'&&['Non-computing and IoT devices','Cloud-hosted assets','Regularly connected assets outside enterprise control'].includes(row))answer='Not applicable';
      return [row,answer];
    }));
    else if(question.type==='multi')answers[question.id]=['Remove from network','Deny remote connection','Quarantine or isolate'].filter(value=>question.choices.includes(value));
    else if(question.type==='date')answers[question.id]=previousDate(inventoryReview.due_date,6,inventoryReview.schedule_anchor.month_end);
    else if(question.type==='text')answers[question.id]=({system:content.technology_process,owner:content.owner_role+' / '+content.process_owner_role,
      operation:content.current_implementation,existing:content.current_implementation,evidence:content.evidence_check,
      maintenance_detail:'IT reconciles purchasing, disposal and provider exports; six kiosk ownership/address attributes remain open.',
      scope_reason:'No separate data-capable IoT devices, cloud-hosted machines or regularly connected externally owned assets exist in this fictional scope. Portable office Windows devices and remote laptops are included; Microsoft 365 service ownership is retained in the provider register.',
      gaps:content.remediation,unknowns:''})[question.id]||'';
    else {
      const choices={practice:absent?'No':partial?'Partially':'Yes',inventory:partial?'Partially':'Yes',process:'Yes',
        sources:'Multiple reconciled sources',frequency:id==='1.1'?'Every six months':'Weekly',unresolved:'No',
        additional_gap:content.remediation?'Yes':'No',additional_confirmation:'No'};
      const value=choices[question.id]??'Yes';
      if(!question.choices.includes(value))reject('unmapped guided choice '+id+'/'+question.id+'.');
      answers[question.id]=value;
    }
  }
  const visible=new Set(visibleQuestions(id,answers,version).map(question=>question.id));
  const current=Object.fromEntries(Object.entries(answers).filter(([key])=>visible.has(key)));
  validateGuidedCompletion(id,current,version);
  const [year,month,day]=at.slice(0,10).split('-').map(Number);
  const result=generateResult(id,current,new Date(year,month-1,day),version);
  if(result.status!==status)reject('guided answers disagree with the scenario for '+id+'.');
  return {version,answers:current,result,narrative:content.current_implementation,step:visible.size,
    completed:true,revision:1,updated_at:at,generated_at:at,fixture_provenance:SOURCE};
}

function approvalSubject(policy,approver,at,version,summary=policy.summary,title=policy.title) {
  return {subject_id:policy.policy_id+'_subject_'+version.replaceAll('.','_'),captured_at:at,client_id:CID,policy_id:policy.policy_id,
    title,version,summary,owner_id:policy.owner_id,named_approver:{contact_id:approver.contact_id,name:approver.name},
    basis:{type:'external',reference:'Fictional Brawndo controlled document register / '+title,
      document_version:version,verification:'Reference recorded; external bytes not verified'}};
}
function approvalDecision(subject,owner,approver) {
  return {action:'external_approval_recorded',recorded_by:owner.user_id,recorded_by_name:owner.name,
    recorded_at:subject.captured_at,reported_approver_id:approver.contact_id,reported_approved_at:subject.captured_at,
    provenance:SOURCE+' Fictional external approval metadata; not an in-app signature.',subject};
}

// Enrich only the untouched rows just created by the native onboarding factory.
// Retained visitor sessions must never call this historical fixture constructor.
export function seedBrawndoProgram(db,{dates,owner,processOwners={}}={}) {
  const clients=(db.clients||[]).filter(row=>row.client_id===CID),client=clients[0];
  if(db.user?.workspace_mode!=='demo'||clients.length!==1||client.environment!=='Demo'||client.status!=='active'
    ||client.framework_settings?.['cis-ig1']?.implementation_group!==1||!db.baselines?.[CID]?.completed
    ||!scoped(db,'requirements').some(row=>row.baseline_key==='cis-ig1'&&row.baseline_response==='applies'))
    reject('complete native CIS IG1 onboarding for the canonical Demo client first.');
  if(!dates||!/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)||!['day','month','instant'].every(key=>typeof dates[key]==='function'))
    reject('provide the frozen canonical UTC date helpers.');
  const origin=dates.month(-18)+'T00:00:00.000Z';
  if(origin<'2024-06-25T00:00:00.000Z')reject('the 18-month v8.1 program must begin after its release.');
  const account=typeof owner==='string'?db.users.find(row=>row.user_id===owner):db.users.find(row=>row.user_id===owner?.user_id);
  if(!account)reject('use an existing accountable application user.');
  const definitions=activeDefinitions('cis-ig1',{implementation_group:1}),plans=activePlans('cis-ig1',{implementation_group:1}).filter(plan=>!!plan.source_minimum);
  const selection=cisDemoSelection(1),policyKeys=selection.selected_policy_keys.filter(key=>key!=='policy-data-retention-secure-disposal-policy');
  // One selected container houses the actual retention/disposal content. Keep
  // that explicit fixture relationship without changing global catalog mappings.
  const documentSafeguards=Object.fromEntries(policyKeys.map(key=>[key,[...new Set([
    ...selection.policies.find(item=>item.policy_key===key).mappings.flatMap(item=>item.safeguards),
    ...(key==='policy-data-classification-handling-policy'?['3.4','3.5']:[])
  ])]]));
  const oldAssessments=scoped(db,'framework_assessments'),oldPolicies=scoped(db,'policies'),oldReviews=scoped(db,'reviews');
  if(policyKeys.length!==9||plans.length!==11||policyKeys.some(key=>!own(DOCUMENT_PLANS,key))||plans.some(plan=>!own(DUE_OFFSETS,plan.key)))
    reject('the supported document/Review catalog changed; review the scenario mapping.');
  if(oldAssessments.length!==definitions.length||definitions.some(definition=>oldAssessments.filter(row=>row.definition_id===definition.id&&row.framework_key==='cis-ig1').length!==1)
    ||oldAssessments.some(row=>row.framework_assessment_id!==`fw_${CID}_assessment_${row.definition_id}`)
    ||oldAssessments.some(row=>row.status!=='not_assessed'||row.implementation||row.assessment_history?.length)
    ||oldPolicies.length!==9||policyKeys.some(key=>oldPolicies.filter(row=>row.baseline_key===key).length!==1)
    ||oldPolicies.some(row=>row.presence!=='reported_missing'||row.approval_history?.length||row.decision_history?.length)
    ||oldReviews.length!==11||plans.some(plan=>oldReviews.filter(row=>row.framework_plan_key===plan.key).length!==1)
    ||oldReviews.some(row=>row.status!=='needs_scheduling'||row.occurrences?.length))reject('requires untouched native onboarding records.');
  if(['findings','tasks','evidence'].some(kind=>scoped(db,kind).length)
    ||Object.entries(db.guided_assessment_pilot||{}).some(([key,value])=>value.client_id===CID||oldAssessments.some(row=>key.startsWith(row.framework_assessment_id+':')))
    ||oldPolicies.some(row=>!row.policy_id)||new Set(oldPolicies.map(row=>row.policy_id)).size!==9
    ||oldReviews.some(row=>!row.review_id)||new Set(oldReviews.map(row=>row.review_id)).size!==11)
    reject('requires untouched native onboarding records.');
  const approver=contactFor(db,'Executive sponsor',processOwners,client),reviewIds={},policyIds={};
  const reviews=plans.map(plan=>{
    const original=oldReviews.find(row=>row.framework_plan_key===plan.key),review_id=PREFIX+'review_'+plan.key;
    reviewIds[original.review_id]=review_id;
    const row={review_id,client_id:CID,title:plan.title,review_type:plan.review_type,framework_key:'cis-ig1',framework_version:'8.1',
      framework_plan_key:plan.key,framework_driver_active:true,framework_safeguards:plan.safeguards,framework_basis:plan.basis,
      framework_source_cadence:plan.source_cadence,framework_default_cadence:plan.default_cadence,framework_drivers:[reviewDriver('cis-ig1',plan)],
      framework_purpose:plan.purpose,framework_evidence_expectations:plan.evidence_expectations,framework_completion_criteria:plan.completion_criteria,
      owner_id:account.user_id,reviewer_id:account.user_id,recurrence:plan.default_cadence,due_date:dates.day(DUE_OFFSETS[plan.key]),
      status:plan.key==='data-governance'?'in_progress':'upcoming',created_at:origin,created_by:account.user_id,updated_at:dates.instant(-2),
      current_occurrence_id:'occ_'+review_id,occurrences:[],scope:'Brawndo bottling site and warehouse: '+plan.safeguards.join(', '),
      notes:SOURCE+' Inspect the actual mapped process, scope, changes and dated operating results. Faster operational duties retain their own evidence.',
      governance_context:{category:'organizational',rationale:'Native CIS plan for the selected cumulative IG1 safeguards.',
        cadence_source:'organization_defined',cadence_rationale:'Uses the native explicit source interval. Combined plans use the most frequent applicable source duty; operating/event duties are not converted into extra manual Reviews.'}};
    if(row.status==='in_progress')Object.assign(row,{started_at:dates.instant(-2),started_by:account.user_id});
    Object.assign(row,reviewSchedule(row,true));
    validateAssignment(db,'reviews',row);validateGovernanceContext(row.governance_context);
    return reviewView(row);
  });
  const policies=policyKeys.map(key=>{
    const original=oldPolicies.find(row=>row.baseline_key===key),item=catalog.policies.find(row=>row.key===key),policy_id=CID+'_'+key;
    policyIds[original.policy_id]=policy_id;
    const mapping=selection.policies.find(row=>row.policy_key===key),missing=key==='policy-vulnerability-patch-management-policy',
      draft=key==='policy-configuration-management-policy',pending=key==='policy-data-classification-handling-policy';
    const policy={policy_id,client_id:CID,title:item.name,category:item.category,baseline_key:key,owner_id:account.user_id,
      approver_contact_id:approver.contact_id,status:missing?'needs_creation':draft?'draft':pending?'in_review':'approved',
      presence:missing?'reported_missing':draft||pending?'reported_existing':'verified_existing',baseline_response:missing?'no':'yes',
      version:missing?'':draft?'2.0-draft':pending?'2.1-draft':'2.0',summary:'Fictional Brawndo: '+DOCUMENT_SUMMARIES[key],
      created_at:origin,created_by:account.user_id,updated_at:dates.instant(-8),approved_at:null,approval_subject:null,
      approval_history:[],decision_history:[],governance_context:{category:'organizational',
        rationale:mapping.mappings.some(row=>row.basis==='Required Document')?'Contains applicable CIS process contents; the template title itself is not mandated.':'Supports the selected safeguards; approval alone does not prove operating implementation.',
        cadence_source:'organization_defined',cadence_rationale:'Document contents are maintained through the linked native CIS process Review and relevant changes, without a second generic annual obligation.'}};
    if(!missing) {
      const summary=draft?'Approved network-device runbook only: management protocols, named administrators, settings backup, change approval and annual/change maintenance. It does not cover the missing endpoint/server process.'
        :pending?'Approved office and ERP data-management process only. Temporary production-file handling and ownership remain outside this approved version.':policy.summary;
      const prior=approvalSubject(policy,approver,dates.month(-17)+'T00:00:00.000Z','1.0',summary,draft?'Network Device Configuration Runbook':policy.title);
      policy.decision_history.push(approvalDecision(prior,account,approver));
      if(!draft) {
        const at=pending?dates.instant(-8):dates.month(-4)+'T00:00:00.000Z';
        const subject=approvalSubject(policy,approver,at,policy.version);
        policy.approval_source={version:policy.version,external_reference:subject.basis.reference,external_version:policy.version};
        policy.approval_subject=subject;
        if(pending) {
          policy.approval_request_id=policy_id+'_submission_2_1';policy.submitted_at=at;policy.submitted_by=account.user_id;
          policy.approval_history.push({action:'submitted',at,by:account.user_id,by_name:account.name,by_email:account.email,
            approval_request_id:policy.approval_request_id,subject:copy(subject),provenance:SOURCE});
        } else {
          policy.approved_at=at;policy.effective_date=at.slice(0,10);policy.updated_at=at;
          policy.decision_history.push(approvalDecision(subject,account,approver));
        }
      }
    }
    const review=reviews.find(row=>row.framework_plan_key===DOCUMENT_PLANS[key]);
    review.policy_id=policy_id;
    policy.next_review_date=review.due_date;policy.schedule_from_reviews=true;
    validateAssignment(db,'policies',policy);validateGovernanceContext(policy.governance_context);
    return policy;
  });
  const drafts={},assessments=definitions.map((definition,index)=>{
    const original=oldAssessments.find(row=>row.definition_id===definition.id),status=statusFor(definition.id),
      content=brawndoSafeguardContent(definition.id,status),contact=contactFor(db,content.process_owner_role,processOwners,client),
      unassessed=status==='not_assessed',at=unassessed?null:dates.instant(definition.id==='15.1'?-6:-6-index%14);
    const row={framework_assessment_id:original.framework_assessment_id,client_id:CID,framework_key:'cis-ig1',framework_version:'8.1',
      definition_id:definition.id,status,owner_id:account.user_id,process_owner_id:contact.contact_id,
      implementation:content.current_implementation,technology:content.technology_process,
      notes:'Scope: '+content.scope+'\n'+(unassessed?'Assessment plan: '+content.assessment_plan:content.assessment_notes),na_rationale:'',
      created_at:origin,created_by:account.user_id,updated_at:at||origin,fixture_history_origin_at:origin,
      last_assessed:at,last_saved:at,assessed_by:unassessed?null:account.user_id,
      verification:unassessed?null:status==='addressed'?(definition.id==='9.1'?'needs_validation':'verified'):'gap_identified',
      verification_checklist:null,assessment_history:[],items_to_address:[],items_revision:0,
      related_links:[...reviews.filter(review=>review.framework_safeguards.includes(definition.id)).map(review=>({kind:'reviews',id:review.review_id})),
        ...policies.filter(policy=>documentSafeguards[policy.baseline_key].includes(definition.id)).map(policy=>({kind:'policies',id:policy.policy_id}))]};
    if(!unassessed) {
      const draft=interview(definition.id,status,content,at,reviews.find(review=>review.framework_plan_key==='asset-inventory'));
      Object.assign(draft,{client_id:CID,assessment_id:row.framework_assessment_id,user_id:account.user_id});
      drafts[row.framework_assessment_id+':'+account.user_id]=draft;
      row.guided_assessment_source={origin:'fictional-demo-fixture',version:draft.version,revision:draft.revision,
        generated_at:at,by:account.user_id,answers:copy(draft.answers),provenance:SOURCE};
      // Supply an evaluation day to native item generation without persisting
      // date-question metadata on questionnaires that have no date question.
      row.items_to_address=reconcileItems(row,{...draft,result:{...draft.result,evaluation_date:at.slice(0,10)}},account.user_id,at);
      row.items_revision=row.items_to_address.length?1:0;
    }
    validateAssignment(db,'framework_assessments',row);
    return row;
  });
  for(const [kind,values,key] of [['policies',policies,'policy_id'],['reviews',reviews,'review_id']])
    if((db[kind]||[]).some(row=>row.client_id!==CID&&values.some(value=>value[key]===row[key])))reject('fixture identity collides with another client.');
  const baseline={...copy(db.baselines[CID]),updated_at:dates.instant(-2),selected_policy_keys:policyKeys,
    policies:Object.fromEntries(policies.map(policy=>[policy.baseline_key,policy.baseline_response])),reviews:[],
    framework_reviews:Object.fromEntries(activePlans('cis-ig1',{implementation_group:1}).map(plan=>{
      const review=reviews.find(row=>row.framework_plan_key===plan.key);
      return [plan.key,{enabled:!!review,recurrence:plan.default_cadence,due_date:review?.due_date||null}];
    }))};
  db.framework_assessments=(db.framework_assessments||[]).filter(row=>row.client_id!==CID).concat(assessments);
  db.policies=(db.policies||[]).filter(row=>row.client_id!==CID).concat(policies);
  db.reviews=(db.reviews||[]).filter(row=>row.client_id!==CID).concat(reviews);
  db.guided_assessment_pilot={...db.guided_assessment_pilot,...drafts};
  db.baselines={...db.baselines,[CID]:baseline};client.onboarding_baseline=copy(baseline);
  const mapping=policies.map(policy=>({policy_id:policy.policy_id,policy_key:policy.baseline_key,
    review_id:reviews.find(review=>review.policy_id===policy.policy_id).review_id,plan_key:DOCUMENT_PLANS[policy.baseline_key],
    safeguards:documentSafeguards[policy.baseline_key],
    document_state:policy.status,rationale:policy.governance_context.rationale}));
  return {assessments,policies,reviews,mapping,history_outline:{origin,anchor:dates.anchor,months:18,
    current_assessments:assessments.map(row=>({assessment_id:row.framework_assessment_id,definition_id:row.definition_id,status:row.status,at:row.last_saved})),
    current_reviews:reviews.map(row=>({review_id:row.review_id,plan_key:row.framework_plan_key,recurrence:row.recurrence,due_date:row.due_date}))},
    initial_normalization:{origin,actor_id:account.user_id,policy_ids:policyIds,review_ids:reviewIds,
      provenance:SOURCE+' Normalize only initial native-factory logs and baseline events, before any visitor session.'}};
}
