import baseline from '@catalogs/onboardingCatalog.json';
import {activeDefinitions, reviewDriver} from '../lib/frameworks';
import {reviewSchedule, reviewView} from '../lib/reviewOccurrences';
import {CIS_DEMO_SCENARIOS, cisDemoSelection} from './cisDemoSelection';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {previousDate} from './demoHistory';
import {ensurePolicyReview, syncPolicyReview} from './policyReviews';
import {seedCisScenarioHistory} from './cisDemoHistory';
import {seedCisDemoOperations} from './cisDemoOperations';
import {seedCisOperatingEvidence} from './cisDemoOperatingEvidence';
import {prepareTask} from './actionItems';

const clone = value => JSON.parse(JSON.stringify(value));
const RELEASE_DAY = '2024-06-24';
const PROFILES = {
  demo_brawndo: {months:18, partial:['1.1','2.1','3.1','3.2','5.1','6.1','8.1','15.1'], gaps:['4.1','4.2','7.1','7.2'], unknown:['9.1','11.4','14.8'], progress:[5,20,29,35]},
  demo_initech: {months:24, partial:['1.1','13.6','15.4','16.3','17.6'], gaps:['3.8','12.6','16.6'], unknown:['9.6','14.9'], progress:[65,92,106,114]},
  demo_krusty_krab: {months:28, partial:[], gaps:[], unknown:[], progress:[153,153,153,153]}
};
const STATUS = {addressed:'Implemented', in_progress:'Partially implemented', needs_attention:'Not implemented', not_assessed:'Not assessed'};
const TECHNOLOGY = {
  1:'Managed endpoint inventory and DHCP reconciliation', 2:'Managed software inventory and authorized application register',
  3:'Classified data register, managed storage and retention rules', 4:'Managed endpoint and network configuration baselines',
  5:'Microsoft Entra ID account inventory', 6:'Role-based identity administration and approval records',
  7:'Authenticated vulnerability scanning and patch-management queue', 8:'Central log collection and retained operating records',
  9:'Managed browsers, mail filtering and supported software inventory', 10:'Managed endpoint protection',
  11:'Encrypted backup, isolated recovery storage and restoration records', 12:'Managed network devices and approved diagrams',
  13:'Network monitoring and analyst triage', 14:'Role-specific workforce learning and completion register',
  15:'Service-provider register and contract/assurance records', 16:'Version-controlled development and component inventory',
  17:'Incident contacts, reporting procedures and exercise records', 18:'Scoped penetration-test results and remediation register'
};
const dayInstant = day => day + 'T00:00:00.000Z';

function ownerFor(db, client) {
  return db.users.find(user => user.user_id===client.assigned_owner_id && user.status==='active')
    || db.users.find(user => user.user_id===client.client_id+'_user_0') || db.user;
}

function programReviews(db, client, scenario, selection, dates, owner, origin) {
  const cid=client.client_id, kept=[];
  // These native tracking series began in the recent operating year. Earlier
  // program progression is retained in assessments and organizational documents.
  const reviewOrigin=[origin,dates.month(-12)].sort().at(-1);
  for(const [index, plan] of selection.framework_reviews.filter(plan=>plan.include).entries()) {
    const source=db.reviews.find(row=>row.client_id===cid && (row.framework_plan_key===plan.key
      ||row.framework_drivers?.some(driver=>driver.framework_plan_key===plan.key)));
    if(!source) throw new Error('Canonical CIS Demo is missing Review '+plan.key);
    const offset=scenario.implementation_group===3?10+index*3:[-5,0,5,12,25,40][index%6];
    // The current occurrence must be the next unfinished cycle. Later dates
    // belong to the native forecast, not skipped future monthly occurrences.
    const due=dates.day(Math.min(offset,{monthly:25,quarterly:85,semiannual:175,annual:355}[plan.default_cadence]||offset));
    const row={review_id:source.review_id,client_id:cid,title:plan.title,review_type:plan.review_type,
      framework_key:'cis-ig1',framework_version:'8.1',framework_plan_key:plan.key,framework_driver_active:true,
      framework_safeguards:plan.safeguards,framework_basis:plan.basis,framework_source_cadence:plan.source_cadence,
      framework_default_cadence:plan.default_cadence,framework_drivers:[reviewDriver('cis-ig1',plan)],
      framework_purpose:plan.purpose,framework_evidence_expectations:plan.evidence_expectations,framework_completion_criteria:plan.completion_criteria,
      scope:`${scenario.service}: ${plan.safeguards.join(', ')} within the selected cumulative IG.`,
      owner_id:owner.user_id,reviewer_id:owner.user_id,recurrence:plan.default_cadence,
      custom_recurrence_days:plan.default_custom_recurrence_days,due_date:due,
      status:index===1?'in_progress':'upcoming',created_at:dayInstant(reviewOrigin),created_by:source.created_by||owner.user_id,
      updated_at:dates.instant(-2),current_occurrence_id:'occ_'+source.review_id,occurrences:[],
      notes:`Fictional ${scenario.name}: inspect scope, record exceptions and dated results. ${plan.ig2_operating_context||''}`.trim(),
      governance_context:{category:'organizational',rationale:'Selected CIS plan; linked safeguards retain their operating and change duties.',
        cadence_source:plan.source_minimum?'organization_defined':'recommended',
        cadence_rationale:plan.source_minimum?'Catalog governance minimum; faster operating duties have separate samples.':'Organization-selected validation, not a CIS minimum.'}};
    Object.assign(row,reviewSchedule(row,true));
    const months={monthly:1,quarterly:3,semiannual:6,annual:12}[row.recurrence];
    if(months) for(let count=1;count<=40;count++) {
      const scheduled=previousDate(due,months*count,row.schedule_anchor.month_end);
      if(scheduled<reviewOrigin) break;
      if(scheduled>=dates.day(0)) continue;
      const completion=dayInstant(scheduled);
      const occurrence=row.review_id+'_'+scheduled;
      row.occurrences.unshift({...row,...reviewSchedule({...row,due_date:scheduled,recurrence_due_date:null}),occurrences:undefined,occurrence_id:occurrence,current_occurrence_id:occurrence,
        status:'completed',due_date:scheduled,completed_at:completion,completion_date:completion,updated_at:completion,
        completed_by:owner.user_id,completed_by_name:owner.name,outcome:'no_findings',finding_count:0,
        evidence:[],conclusion:'Fictional governance execution; operating and change duties remain distinct.',
        tested_scope:scenario.service,checklist_confirmed:true,no_evidence_reason:'Illustrative summary; see linked operating samples.'});
    }
    if(row.status==='in_progress')Object.assign(row,{started_at:dates.instant(-2),started_by:owner.user_id});
    kept.push(reviewView(row));
    db.baselines[cid].framework_reviews[plan.key]={enabled:true,recurrence:row.recurrence,due_date:due};
  }
  db.reviews=db.reviews.filter(row=>row.client_id!==cid).concat(kept);
  return kept;
}

function assessments(db, client, scenario, dates, owner, reviews, origin) {
  const cid=client.client_id, profile=PROFILES[cid], definitions=activeDefinitions('cis-ig1',{implementation_group:scenario.implementation_group});
  const existing=db.framework_assessments.filter(row=>row.client_id===cid&&row.framework_key==='cis-ig1');
  if(existing.length!==definitions.length) throw new Error('Canonical CIS Demo assessment coverage is incomplete.');
  const implemented=definitions.filter(def=>![...profile.partial,...profile.gaps,...profile.unknown].includes(def.id));
  const rows=definitions.map((definition,index)=>{
    const old=existing.find(row=>row.definition_id===definition.id);
    if(!old) throw new Error('Canonical CIS Demo safeguard identity is missing.');
    const status=profile.partial.includes(definition.id)?'in_progress':profile.gaps.includes(definition.id)?'needs_attention':profile.unknown.includes(definition.id)?'not_assessed':'addressed';
    const notes=status==='not_assessed'?'':`Fictional ${scenario.name} ${definition.id}: ${status==='addressed'?'Owner sampled the scoped process and records.':status==='in_progress'?'Partial population coverage; approval and execution gaps remain.':'Required process not established; planned work is not implementation.'} ${definition.source_cadence||'Reassess relevant changes'}. Not certification.`;
    const implementation=status==='not_assessed'?'':`${TECHNOLOGY[definition.control]}. ${STATUS[status]} for ${scenario.service.toLowerCase()}; safeguard ${definition.id}.`;
    const history=[];
    if(status!=='not_assessed') {
      history.push({at:dayInstant(origin),by:owner.user_id,status:'not_assessed',implementation:'',notes:'Fictional v8.1 intake; no earlier assessment claim.',source:'Fictional Demo import'});
      for(const [step,month] of [12,6,3,1].entries()) {
        const historical=status==='addressed'&&implemented.indexOf(definition)<profile.progress[step]?'addressed'
          :month<=6&&status!=='needs_attention'?'in_progress':'needs_attention';
        history.push({at:dayInstant(dates.month(-month)),by:owner.user_id,status:historical,
          implementation:historical==='addressed'?'Scoped operating sample accepted.':'Staged rollout; execution or coverage incomplete.',
          notes:`Fictional ${definition.id}: ${STATUS[historical]}.`,source:'Fictional Demo import'});
      }
      history.push({at:dates.instant(-3-index%9),by:owner.user_id,status,implementation,notes,source:'Fictional Demo import'});
    }
    const saved=history.at(-1)?.at||null;
    return {framework_assessment_id:old.framework_assessment_id,client_id:cid,framework_key:'cis-ig1',framework_version:'8.1',definition_id:definition.id,
      created_at:old.created_at,created_by:old.created_by||owner.user_id,updated_at:saved||old.created_at,fixture_history_origin_at:dayInstant(origin),
      owner_id:owner.user_id,process_owner_id:db.contacts.find(contact=>contact.client_id===cid&&contact.status==='active')?.contact_id||null,
      status,implementation,notes,technology:TECHNOLOGY[definition.control],na_rationale:'',
      last_assessed:saved?.slice(0,10)||null,last_saved:saved,
      verification:status==='not_assessed'?'not_verified':status==='needs_attention'?'gap_identified':status==='in_progress'||index%7===0?'needs_validation':'verified',
      related_links:reviews.filter(review=>review.framework_safeguards.includes(definition.id)).map(review=>({kind:'reviews',id:review.review_id})),assessment_history:history};
  });
  db.framework_assessments=db.framework_assessments.filter(row=>row.client_id!==cid||row.framework_key!=='cis-ig1').concat(rows);
}

function policySubject(policy, approver, owner, at, version=policy.version) {
  return {subject_id:policy.policy_id+'_subject_'+version.replaceAll('.','_'),captured_at:at,client_id:policy.client_id,policy_id:policy.policy_id,
    title:policy.title,version,summary:policy.summary,owner_id:owner.user_id,named_approver:{contact_id:approver.contact_id,name:approver.name},
    basis:{type:'external',reference:`Fictional controlled document register / ${policy.title}`,document_version:version,verification:'Fictional external approval metadata; not an in-app signature or verified external document.'}};
}

function remainingCisWork(db, scenario, dates, owner) {
  const cid=scenario.client_id;
  if(scenario.implementation_group===3) return;
  const definition=cid==='demo_brawndo'?'4.1':'16.6';
  const assessment=db.framework_assessments.find(row=>row.client_id===cid&&row.definition_id===definition);
  const title=cid==='demo_brawndo'?'Establish the missing secure-configuration process':'Complete the application vulnerability testing process';
  const finding={finding_id:cid+'_finding_cis_'+definition.replace('.','_'),client_id:cid,title,
    description:'Fictional assessed CIS implementation gap. An approved supporting policy alone does not establish this operating process.',
    framework_assessment_id:assessment.framework_assessment_id,definition_id:definition,source:'CIS Controls v8.1 '+definition,
    severity:'high',status:'in_remediation',owner_id:owner.user_id,created_by:owner.user_id,
    created_at:assessment.last_saved,identified_at:assessment.last_saved,updated_at:assessment.last_saved,due_date:dates.day(18)};
  const task={task_id:cid+'_task_cis_'+definition.replace('.','_'),client_id:cid,title,
    description:'Record the defined process and its implementation evidence, then request independent Finding validation. Work completion alone does not close the gap.',
    finding_id:finding.finding_id,framework_assessment_id:assessment.framework_assessment_id,source_type:'finding',source_id:finding.finding_id,
    priority:'high',status:'open',assignee_id:owner.user_id,created_by:owner.user_id,created_at:finding.created_at,updated_at:finding.updated_at,due_date:finding.due_date};
  finding.primary_task_id=task.task_id;db.findings.push(finding);
  prepareTask(db,task);db.tasks.push(task);
  assessment.related_links.push({kind:'findings',id:finding.finding_id},{kind:'tasks',id:task.task_id});
}

function connectProgramContext(db, cid, reviews) {
  const rows=db.framework_assessments.filter(row=>row.client_id===cid&&row.framework_key==='cis-ig1');
  for(const row of rows.filter(row=>row.definition_id.startsWith('15.'))){
    const providers=db.vendors.filter(vendor=>vendor.client_id===cid&&(row.definition_id==='15.7'?vendor.status==='inactive':vendor.status!=='inactive'));
    row.related_links.push(...providers.map(vendor=>({kind:'vendors',id:vendor.vendor_id})));
  }
  for(const review of reviews)for(const occurrence of review.occurrences){
    const unresolved=rows.filter(row=>review.framework_safeguards.includes(row.definition_id)).filter(row=>{
      const previous=(row.assessment_history||[]).filter(event=>event.at<=occurrence.completed_at).at(-1);
      return previous?.status!=='addressed';
    });
    if(unresolved.length)occurrence.conclusion=`Fictional governance review: no additional Finding was raised. ${unresolved.map(row=>row.definition_id).join(', ')} remained tracked in the assessment register; this completion did not implement or close those gaps.`;
  }
}

function policies(db, client, scenario, selection, dates, owner, originals) {
  const cid=client.client_id, approver=db.contacts.find(contact=>contact.client_id===cid&&contact.name===scenario.people[1])||db.contacts.find(contact=>contact.client_id===cid);
  for(const [index,item] of baseline.policies.filter(item=>selection.selected_policy_keys.includes(item.key)).entries()) {
    const old=originals.find(row=>row.baseline_key===item.key),id=old?.policy_id||cid+'_'+item.key;
    const status=cid!=='demo_brawndo'?'approved':item.key==='policy-configuration-management-policy'?'needs_creation'
      :item.key==='policy-vulnerability-patch-management-policy'?'draft':item.key==='policy-data-classification-handling-policy'?'pending_approval':'approved';
    const missing=status==='needs_creation',approved=dates.month(cid==='demo_krusty_krab'?-18:-14),at=dayInstant(approved);
    const mappings=selection.policies.find(row=>row.policy_key===item.key).mappings;
    const policy={policy_id:id,client_id:cid,title:item.name,category:item.category,baseline_key:item.key,
      baseline_response:missing?'no':'yes',presence:missing?'reported_missing':status==='approved'?'verified_existing':'reported_existing',status,
      version:missing?'':status==='approved'?'2.0':'2.1-draft',owner_id:owner.user_id,approver_contact_id:approver.contact_id,
      created_at:old?.created_at||dates.instant(-400),created_by:old?.created_by||owner.user_id,updated_at:dates.instant(-5),
      summary:missing?'Required secure-configuration process documentation has not been established. No approved document is asserted.'
        :`${scenario.name}: ${item.name} is the fictional document container for ${[...new Set(mappings.flatMap(mapping=>mapping.safeguards))].join(', ')}. Its title is not a CIS-mandated document name; the mapped process contents and execution records establish coverage.`,
      governance_context:{category:'organizational',rationale:mappings.some(mapping=>mapping.basis==='Required Document')?'Contains applicable CIS-required documented process contents; the template title is not mandated.':'Supporting document for applicable CIS duties; an approved template alone is not implementation proof.',cadence_source:'organization_defined',cadence_rationale:'Annual individual-document maintenance chosen by the organization; preserve source-specific operational cadences and significant-change duties.'},decision_history:[]};
    if(status==='approved') {
      const subject=policySubject(policy,approver,owner,at);
      Object.assign(policy,{approved_at:at,effective_date:approved,approval_source:{version:policy.version,external_reference:subject.basis.reference,external_version:policy.version},approval_subject:subject});
      if(cid==='demo_krusty_krab') {
        const original=dayInstant(dates.month(-96)),prior=policySubject(policy,approver,owner,original,'1.0');
        policy.decision_history.push({action:'external_approval_recorded',recorded_by:owner.user_id,recorded_by_name:owner.name,recorded_at:original,reported_approver_id:approver.contact_id,reported_approved_at:original,
          provenance:'Fictional organizational security-program document approval. Predates v8.1; no historical CIS assessment or legacy-framework support is asserted.',subject:prior});
      }
      policy.decision_history.push({action:'external_approval_recorded',recorded_by:owner.user_id,recorded_by_name:owner.name,recorded_at:at,reported_approver_id:approver.contact_id,reported_approved_at:at,provenance:'Explicit fictional external approval metadata; not an in-app signature',subject});
      policy.next_review_date=dates.day(30+index*6);
    } else if(status==='pending_approval') {
      const subject=policySubject(policy,approver,owner,dates.instant(-5));
      Object.assign(policy,{status:'in_review',approval_source:{version:policy.version,external_reference:subject.basis.reference,external_version:policy.version},
        approval_subject:subject,approval_request_id:id+'_request_2_1',submitted_at:dates.instant(-5),submitted_by:owner.user_id,
        approval_history:[{action:'submitted',at:dates.instant(-5),by:owner.user_id,by_name:owner.name,by_email:owner.email,
          approval_request_id:id+'_request_2_1',subject:clone(subject)}]});
    }
    db.policies.push(policy);db.baselines[cid].policies[item.key]=missing?'no':'yes';
    if(status==='approved') {
      const review=ensurePolicyReview(db,policy);
      if(review) {
        review.created_at=policy.created_at;review.updated_at=dates.instant(-5);
        if(cid==='demo_krusty_krab')review.created_at=[review.created_at,dayInstant(previousDate(review.due_date,96,review.schedule_anchor.month_end))].sort()[0];
        review.occurrences=[];
        for(let year=cid==='demo_krusty_krab'?8:1;year>=1;year--) {
          const due=previousDate(review.due_date,12*year,review.schedule_anchor.month_end),completed=dayInstant(due);
          const reviewedVersion=due<approved?'1.0':'2.0';
          const occurrence=review.review_id+'_'+due;
          review.occurrences.push({...review,...reviewSchedule({...review,due_date:due,recurrence_due_date:null}),occurrences:undefined,occurrence_id:occurrence,current_occurrence_id:occurrence,status:'completed',due_date:due,
            completed_at:completed,completion_date:completed,updated_at:completed,completed_by:owner.user_id,completed_by_name:owner.name,outcome:'no_changes',finding_count:0,evidence:[],
            conclusion:`Fictional organization-selected document maintenance retained approved version ${reviewedVersion}; this is distinct from its original approval. ${due<RELEASE_DAY?'This organizational review predates v8.1 and makes no historical CIS assessment claim.':''}`.trim()});
        }
        syncPolicyReview(db,review);
      }
    }
  }
}

// Only fresh canonical fixtures are rewritten. Compact legacy fingerprints cannot
// prove that a retained visitor's records are untouched, so retain them verbatim.
export function refreshCanonicalCisDemo(db,{clock=new Date(),fresh=false}={}) {
  if(db.user?.workspace_mode!=='demo') return false;
  if(db.cis_demo_refresh?.version===CIS_SHOWCASE_VERSION) return false;
  const dates=cisDemoFixtureDates(clock), targets=CIS_DEMO_SCENARIOS.filter(scenario=>db.clients?.some(client=>client.client_id===scenario.client_id&&client.environment==='Demo'));
  if(!targets.length) return false;
  db.cis_demo_refresh={version:CIS_SHOWCASE_VERSION,anchor:dates.anchor,timezone:'UTC',clients:{},reconciliation_required:[]};
  for(const scenario of targets) {
    const cid=scenario.client_id,client=db.clients.find(row=>row.client_id===cid);
    if(!fresh) {
      const records=Object.entries({framework_assessments:'framework_assessment_id',policies:'policy_id',reviews:'review_id',risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',tasks:'task_id',findings:'finding_id',evidence:'evidence_id'})
        .flatMap(([kind,field])=>(db[kind]||[]).filter(row=>row.client_id===cid).map(row=>({kind,id:row[field]})));
      db.cis_demo_refresh.reconciliation_required.push({client_id:cid,reason:'Retained fixture ownership is not sufficient to replace records safely. All original records, visitor edits, dates and history remain unchanged.',records});
      db.cis_demo_refresh.clients[cid]={version:CIS_SHOWCASE_VERSION,state:'retained_without_rewrite'};
      continue;
    }
    const owner=ownerFor(db,client),selection=cisDemoSelection(scenario.implementation_group),originalPolicies=db.policies.filter(row=>row.client_id===cid);
    db.cis_demo_refresh.clients[cid]={version:CIS_SHOWCASE_VERSION,state:'fresh_fixture'};
    for(const kind of ['policies','risks','vendors','ai_systems','tasks','findings','evidence','comments','exceptions','assessments','notifications','logs'])
      if(Array.isArray(db[kind]))db[kind]=db[kind].filter(row=>row.client_id!==cid||(kind==='tasks'&&row.task_id===cid+'_handover_action'));
    const origin=[dates.month(-PROFILES[cid].months),RELEASE_DAY].sort().at(-1);
    const reviews=programReviews(db,client,scenario,selection,dates,owner,origin);
    assessments(db,client,scenario,dates,owner,reviews,origin);
    policies(db,client,scenario,selection,dates,owner,originalPolicies);
    remainingCisWork(db,scenario,dates,owner);
    seedCisDemoOperations(db,scenario,dates);
    seedCisOperatingEvidence(db,scenario,dates);
    connectProgramContext(db,cid,reviews);
    client.notes=cid==='demo_krusty_krab'
      ?`Fictional security program established ${dates.month(-96)}. Organizational document decisions retain earlier history; v8.1 assessment history starts ${origin}. The model has no legacy-framework assessment support. 100% implemented is not certification or zero risk.`
      :`Fictional ${PROFILES[cid].months}-month CIS v8.1 program. Status, history and remaining work derive from the saved safeguards; not a certification or compliance determination.`;
    client.onboarding_baseline=clone(db.baselines[cid]);
    Object.assign(db.cis_demo_refresh.clients[cid],{assessment_origin:origin,history_months:PROFILES[cid].months,organizational_history_start:cid==='demo_krusty_krab'?dates.month(-96):origin});
    if(db.portfolio_reporting) {
      db.portfolio_reporting.snapshots=db.portfolio_reporting.snapshots.filter(row=>row.client_id!==cid);
      db.portfolio_reporting.identities=db.portfolio_reporting.identities.filter(row=>row.program_id!==cid+':cis-ig1');
      if(cid==='demo_brawndo'&&db.portfolio_reporting.fixture_versions)delete db.portfolio_reporting.fixture_versions['brawndo-cis-ig1-history-v2'];
    }
    delete db.cis_demo_scenario_history?.[cid];
    seedCisScenarioHistory(db,client,new Date(dates.anchor),{version:CIS_SHOWCASE_VERSION});
    if(db.cis_demo_rollout?.clients?.[cid]) {
      // The old stage marker prevents its retained v1 rollout from replaying.
      // Its copied selection/fingerprints describe superseded fresh seed rows,
      // not visitor history or sufficient authority for future reconciliation.
      db.cis_demo_rollout.clients[cid]={revision:db.cis_demo_rollout.clients[cid].revision,
        // Keep ownership for the native retired-fixture visibility contract.
        ownership:db.cis_demo_rollout.clients[cid].ownership,superseded_by:CIS_SHOWCASE_VERSION,applied_at:dates.anchor};
    }
  }
  return true;
}
