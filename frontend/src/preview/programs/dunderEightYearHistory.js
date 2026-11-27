import {isoAuditCatalog, initialAuditState} from '../../lib/isoAudit';
import {isoCompletionSnapshot} from '../isoAudit';
import criteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import {DUNDER_EIGHT_YEAR_PLAN as plan} from './dunderEightYear';
import {DUNDER_ID as CID, EIGHT_YEAR_ANCHOR, EIGHT_YEAR_START, fixtureId, at, copy, assessmentAt} from './isoSocEightYearSupport';

const person = index => `${CID}_user_${index}`;
const practice = {category:'organizational',cadence_source:'organization_defined',cadence_rationale:'Dunder selected annual review and review after material changes; this is not a universal framework cadence.'};

function findingChain(db, tools, {key, title, description, created, done, validated, remediation, validation,
  review_id, occurrence_id, framework_assessment_id, risk_id, severity = 'high'}) {
  const actor = db.user.user_id, fid = fixtureId('finding',key), tid = fixtureId('task',key);
  const finding = {finding_id:fid,client_id:CID,title,description,severity,status:'closed',owner_id:person(0),
    created_at:at(created),created_by:actor,updated_at:at(validated),due_date:done,
    review_id,occurrence_id,framework_assessment_id,risk_id,remediation_plan:remediation,primary_task_id:tid,
    validated_at:at(validated),validated_by:actor,closed_at:at(validated),closed_by:actor,
    decision_history:[{action:'validated',by:actor,at:at(validated),rationale:validation}]};
  const task = {task_id:tid,client_id:CID,title:remediation,description,source:'Finding remediation',
    source_type:'finding',source_id:fid,finding_id:fid,review_id,occurrence_id,framework_assessment_id,
    assignee_id:person(0),priority:severity,status:'done',due_date:done,created_at:at(created),created_by:actor,
    updated_at:at(done),completed_at:at(done),completion_date:at(done),completed_by:person(0),title_generated:false};
  db.findings.push(finding);db.tasks.push(task);
  if(risk_id){
    const risk=db.risks.find(row=>row.risk_id===risk_id&&row.client_id===CID);
    if(!risk)throw new Error('Historical Finding needs its saved same-client Risk');
    risk.related_links.push({kind:'findings',id:fid},{kind:'tasks',id:tid});
    finding.related_links=[{kind:'risks',id:risk_id}];
    task.risk_id=risk_id;
  }
  tools.addLog('findings',fid,created,actor,'Finding raised',{review_id,occurrence_id});
  tools.addLog('tasks',tid,done,person(0),'Action completed',{finding_id:fid});
  tools.addLog('findings',fid,validated,actor,'validate',{rationale:validation});
  const evidence = tools.addEvidence({key:'validation_'+key,title:title+' — independent validation',linked_type:'finding',linked_id:fid,
    at:validated,owner:actor,content:`Original gap: ${description}\nCorrective action completed ${done}: ${remediation}\nValidation ${validated}: ${validation}\nCompletion and validation are separate retained events.`,
    extra:{relationships:[{kind:'tasks',id:tid},...(review_id?[{kind:'reviews',id:review_id,occurrence_id}]:[])]}});
  return {finding,task,evidence};
}

export function addDunderOperatingHistory(db, tools) {
  const actor = db.user.user_id;
  for(const [key,name,asset_type,criticality,location,created,description] of [
    ['identity','Corporate identity and productivity tenant','saas','high','US hosted boundary','2018-11-02','Office 365, later Microsoft 365/Entra; named access and controlled business libraries.'],
    ['office-endpoints','Managed office endpoint fleet','workstation','high','Scranton office and approved remote locations','2018-11-02','Assigned encrypted Windows laptops; Intune management introduced in 2020 and independently reconciled after IT turnover.'],
    ['warehouse-devices','Warehouse scanner and label-printer fleet','workstation','high','Scranton warehouse','2018-11-02','Custodians reconciled in 2022 against physical devices, purchasing and network observations; support and disposal records retained.'],
    ['erp','Dynamics GP order and finance service','application','critical','Scranton supported server boundary','2018-11-02','Named ERP roles, controlled supplier support and application-consistent backup; order processing and pricing dependency.'],
    ['wms','Warehouse and shipping-label integration','application','critical','Scranton warehouse server boundary','2018-11-02','ERP-to-dispatch dependency corrected and validated in 2023. The March 2024 label-gateway change receives its own new validation sample.'],
    ['backup','Veeam application recovery platform','saas','high','Protected backup and recovery boundary','2022-03-14','Separate recovery credentials, protected retention and timed complete order-service restoration.'],
    ['monitoring','Defender and MSP monitoring service','saas','high','Managed endpoint and service boundary','2024-03-18','Managed alerts and named escalation; WMS integration and alternate-owner sample corrected and independently validated in September 2024.'],
  ])db.assets.push({asset_id:fixtureId('asset',key),client_id:CID,name,asset_type,criticality,location,
    created_at:at(created),updated_at:at('2024-09-20'),created_by:person(0),status:'active',owner_id:person(0),description});
  for (const milestone of plan.milestones) {
    const key = milestone.date;
    const review = tools.addReview({key:'milestone_'+key,title:milestone.stage,review_type:'requirements',
      owner_id:person(0),recurrence:'none',due_date:key,created_at:key,scope:plan.business.scope,
      notes:milestone.narrative+' '+milestone.outcome,
      governance_context:{...practice,rationale:milestone.date<'2024-02-23'?'Historical ISMS and security work; no current-edition mappings.':'Current ISMS governance; internal implementation is not certification.'},
      evidenceAt:(when,{occurrenceId})=>[tools.addEvidence({key:'milestone_'+key,title:milestone.stage+' — retained operating record',
        linked_type:'review',linked_id:fixtureId('review','milestone_'+key),at:when,owner:person(0),
        content:`Scope: ${plan.business.scope}\nWork: ${milestone.narrative}\nRetained basis: ${milestone.retainedArtifacts.join('; ')}\nOutcome: ${milestone.outcome}`,
        extra:{occurrence_id:occurrenceId}})]});
    if (milestone.date === '2018-11-02') db.assessments.push({assessment_id:fixtureId('assessment','initial-isms'),client_id:CID,
      title:'Initial historical ISMS security baseline',name:'Initial historical ISMS security baseline',date:at(milestone.date),
      scope:plan.business.scope,summary:milestone.narrative,status:'completed',owner_id:person(0),created_at:at(milestone.date),
      notes:'Synthetic archived security work imported into the Demo; no ISO/IEC 27001:2022 or 2024-amendment assessment is claimed.',
      related_links:[{kind:'reviews',id:review.review_id}]});
  }
  const historic = tools.addReview({key:'historical-isms',title:'Historical ISMS annual operating review (2018–2023 archive)',
    review_type:'requirements',owner_id:person(0),recurrence:'annual',due_date:'2019-10-18',created_at:EIGHT_YEAR_START,
    status:'cancelled',ends_at:'2024-03-18',cancelled_at:'2024-03-18',governance_context:practice,
    notesAt:when=>{
      const milestone=[...plan.milestones].reverse().find(item=>item.date<=when.slice(0,10))||plan.milestones[0];
      return `${milestone.narrative} ${milestone.outcome} Archived ISMS work; no current-edition control mapping.`;
    }});
  const access = tools.addReview({key:'historical-access',title:'Historical named-account recertification (archived)',review_type:'access',
    owner_id:person(0),recurrence:'quarterly',due_date:'2019-01-15',created_at:EIGHT_YEAR_START,
    status:'cancelled',ends_at:'2024-03-18',cancelled_at:'2024-03-18',governance_context:{...practice,cadence_rationale:'Quarterly client-selected named-account review.'},
    completions:{'2022-01-15':{completed_at:'2022-04-08',outcome:'findings_raised',finding_count:1,
      notes:'Original 15 January deadline retained. The staff-turnover backlog delayed the signed owner decision; replacement IT reconciled accounts and removed inherited access. Validation followed separately.'}},
    notesAt:when=>when<'2021-11-01'?'HR employment list compared with named ERP and directory accounts; differences documented and assigned. Historical security work without current-edition mapping.':'Replacement IT and Dwight reconcile employment, privileged groups and service accounts; dated decisions and removal tickets retained. Historical security work without current-edition mapping.'});
  const historicalChains = [
    {key:'invoice-callback',title:'Supplier payment changes lacked independent verification',created:'2019-03-18',done:'2019-09-20',validated:'2019-10-25',risk_id:fixtureId('risk','invoice-diversion'),
      description:'The fictional attempted invoice diversion exposed reliance on an emailed request without an independently obtained callback number.',
      remediation:'Introduce independent bank-change callback and separate payment authorization',validation:'Oscar sampled five changes against supplier master records and separate payment approvals; no unsupported change remained.'},
    {key:'warehouse-inventory',title:'Staff-turnover warehouse device ownership backlog',created:'2021-11-19',done:'2022-05-20',validated:'2022-06-03',risk_id:fixtureId('risk','turnover-inventory'),
      description:'After three IT departures, scanner and label-printer inventories disagreed with purchasing and network observations.',
      remediation:'Reconcile physical warehouse devices and record named custodians',validation:'Darryl and the independent reviewer sampled twelve devices against the reconciled asset register; custodians and disposal records matched.'},
    {key:'privileged-access',title:'Delayed privileged-account owner decision',created:'2022-01-15',done:'2022-04-08',validated:'2022-04-22',risk_id:fixtureId('risk','turnover-access'),
      description:'The original quarterly review fell due during IT turnover; the required signed owner decision and inherited-access removal sample were missing.',
      remediation:'Complete the overdue account review and revoke unnecessary inherited privileges',validation:'The independent reviewer reconciled the signed list with HR and removal tickets after action completion.',review_id:access.review_id,
      occurrence_id:access.occurrences.find(row=>row.due_date==='2022-01-15').occurrence_id},
    {key:'restore-evidence',title:'Delayed ERP and WMS restore-test evidence',created:'2021-12-03',done:'2022-06-17',validated:'2022-07-01',
      description:'The staffing handover delayed a scheduled restore test. Successful backup-job logs did not prove restoration failure or success.',
      remediation:'Execute the original overdue restore exercise and record application dependencies',validation:'The independent reviewer checked timed ERP restoration and honestly retained the separate WMS integration dependency finding.'},
    {key:'wms-dependency',title:'WMS integration missing from order-service recovery plan',created:'2022-06-17',done:'2023-05-19',validated:'2023-06-02',risk_id:fixtureId('risk','wms-dependency'),
      description:'The recovery exercise omitted the label-service integration needed to complete dispatch; the original ERP restore alone did not establish complete order recovery.',
      remediation:'Add WMS label-service dependencies and independently retest complete dispatch recovery',validation:'The retest restored ERP, WMS and labels and completed a controlled dispatch within the documented recovery objective.'},
  ];
  for (const chain of historicalChains) findingChain(db,tools,chain);
  // Record late work honestly rather than changing the original scheduled deadline.
  const restore = tools.addReview({key:'historical-restore',title:'Historical ERP/WMS recovery exercise',review_type:'requirements',
    owner_id:person(0),recurrence:'annual',due_date:'2019-12-03',created_at:EIGHT_YEAR_START,
    status:'cancelled',ends_at:'2024-03-18',cancelled_at:'2024-03-18',governance_context:practice,
    completions:{'2021-12-03':{completed_at:'2022-06-17',outcome:'findings_raised',finding_count:1,
      notes:'Original 3 December deadline retained. ERP restore executed after staff replacement; WMS integration dependency opened as a separate finding, not hidden by action completion.'}},
    notesAt:when=>when<'2022-06-17'?'Retained backup and restore sample with observed order-service limitations; follow-up tracked separately.':when<'2023-06-02'?'ERP restore completed; the WMS integration dependency remains open pending full retest and independent validation.':'Complete order-service dependency retest and independent validation retained; prior limited exercise remains unchanged.'});
  const restoreFinding=db.findings.find(row=>row.finding_id===fixtureId('finding','restore-evidence'));
  Object.assign(restoreFinding,{review_id:restore.review_id,occurrence_id:restore.occurrences.find(row=>row.due_date==='2021-12-03').occurrence_id});
  const restoreTask=db.tasks.find(row=>row.finding_id===restoreFinding.finding_id);
  Object.assign(restoreTask,{review_id:restoreFinding.review_id,occurrence_id:restoreFinding.occurrence_id});
  const latestHistoric=historic.occurrences.at(-1);
  latestHistoric.notes+=' The 2023 recovery validation closed the original staffing backlog; this does not close residual supplier or flood risks.';
  const currentWork = [
    ['supplier-refresh','Complete routine supplier assurance refresh','2026-11-16','in_progress','medium',person(0),'Current accepted assurance remains valid; this follow-up is separate from the annual service review and contract renewal.'],
    ['alternate-shipping','Exercise optional alternate shipping route','2026-12-04','open','low',null,'Optional resilience improvement beyond the tested current recovery arrangement; ownership gap remains visible.'],
    ['ai-guide-editorial','Reconcile optional AI guide wording','2026-10-26','open','low',person(2),'Overdue editorial consolidation of already approved instructions; no mandatory implementation control is missing.'],
    ['acceptance-review','Prepare supplier concentration acceptance review','2027-01-08','open','high',person(0),'Prepare evidence for the separate native acceptance decision before its expiry; completing this task will not renew acceptance.'],
  ];
  for(const [key,title,due,status,priority,assignee_id,description] of currentWork)db.tasks.push({task_id:fixtureId('task',key),client_id:CID,
    title,description,status,priority,assignee_id,due_date:due,created_at:at('2026-10-12'),updated_at:at('2026-10-26'),created_by:actor,title_generated:false,source:'ISMS operational improvement'});
  const editorial=db.tasks.find(row=>row.task_id===fixtureId('task','ai-guide-editorial'));
  const observationId=fixtureId('finding','ai-guide-navigation');
  editorial.finding_id=observationId;
  Object.assign(editorial,{source:'Finding remediation',source_type:'finding',source_id:observationId});
  db.findings.push({finding_id:observationId,client_id:CID,title:'Improvement observation — optional AI guide navigation',
    description:'Existing approved handling instructions are effective, but their optional consolidated guide could make source navigation easier. This editorial observation is not a missing mandatory ISO implementation control.',
    status:'in_remediation',severity:'low',owner_id:person(2),primary_task_id:editorial.task_id,
    remediation_plan:editorial.title,due_date:editorial.due_date,created_at:at('2026-10-12'),updated_at:at('2026-10-26'),created_by:actor,decision_history:[]});
}

function auditSampleExtract(db,pack,when) {
  const year=when.slice(0,4);
  if(pack.key==='governance-risk'){
    const risk=db.risks.find(row=>row.risk_id===fixtureId('risk','supplier-concentration'));
    const review=db.reviews.find(row=>row.risk_id===risk.risk_id);
    const saved=review.occurrences.filter(row=>row.completed_at<=when).at(-1);
    return `CONTEXT / RESPONSIBILITY SAMPLE\nScope: ${plan.business.scope}\nInterested parties: customer contract pricing and confidentiality, employee payroll, suppliers and insurer. Relevant climate issue: warehouse flooding and delivery interruption; treatment and continuity planning retained.\nRACI: David Wallace resources/acceptance sponsorship; Dwight accountable ISMS owner; Pam controlled publication; Darryl warehouse custodians; MSP service lead Sam coordinates technical evidence.\nRISK TRACE\nSaved Risk ${risk.risk_id}; latest retained review ${saved.occurrence_id}, due ${saved.due_date}, completed ${saved.completed_at}. Likelihood ${saved.risk_after.likelihood_score}, impact ${saved.risk_after.impact_score}; no later acceptance is implied. SoA has 93 native Annex decisions, with two justified source-code/coding exclusions; partial implementation is recorded independently.`;
  }
  if(pack.key==='people-access-suppliers'){
    const access=db.reviews.find(row=>row.review_id===fixtureId('review','historical-access'));
    const leavers=db.users.filter(row=>row.user_id.startsWith(CID+'_8y_former_user_'));
    const msp=db.vendors.find(row=>row.vendor_id===fixtureId('vendor','scranton-msp'));
    const supplierReview=db.reviews.find(row=>row.vendor_id===msp.vendor_id&&row.vendor_purpose==='vendor').occurrences.filter(row=>row.completed_at<=when).at(-1);
    return `ACCESS / LEAVER SAMPLE\n${leavers.map(row=>`${row.user_id} | ${row.name} | disabled ${row.disabled_at.slice(0,10)}`).join('\n')}\nHistorical late Review ${access.review_id}: original 2022-01-15 due, completed 2022-04-08; separate validation 2022-04-22. Current named access remains with eligible Dwight, David and Pam accounts; Michael retains read-only business access.\nSUPPLIER SAMPLE\n${msp.vendor_id} | ${msp.name} | service owner ${msp.business_owner_id}; historical supplier Review ${supplierReview.occurrence_id}, due ${supplierReview.due_date}, completed ${supplierReview.completed_at}. Assurance refresh and contract notice remain separate; no 2026 assurance document is asserted received in ${year}.`;
  }
  if(pack.key==='physical-technology'){
    const assets=db.assets.filter(row=>row.client_id===CID&&row.created_at<=when);
    return `INVENTORY SAMPLE\n${assets.map(row=>`${row.asset_id} | ${row.name} | owner ${row.owner_id} | ${row.location}`).join('\n')}\nPHYSICAL / DISPOSAL SAMPLE\nSynthetic sample PHYS-${year}-01: escorted maintenance in the warehouse equipment area, sign-in and key return reconciled by Darryl. Synthetic sample DISP-${year}-01: retired office disk erased before supplier collection; paper-record destruction receipt checked against the authorized retention list. Legal-hold exclusions remain protected. These are small illustrative sample extracts, not real customer documents.`;
  }
  return `OPERATING SAMPLE\n${year==='2024'?'March label-gateway change: prior 2023 recovery scope remains validated, but the changed integration lacks a complete backup/recovery sample; the alternate WMS monitoring escalation is also unproven. Two linked nonconformities remain open at this report date.':`Synthetic timed exercise REC-${year}-01 restored ERP, WMS and labels in ${year==='2025'?'3h 41m':'3h 32m'}, against the four-hour objective. Separate control sample MON-${year}-01 traced a WMS alert through the MSP queue and named alternate without automatic incident or Action closure.`}\nCHANGE / PATCH SAMPLE\nSynthetic change CHG-${year}-01 retains business approval, test and rollback instructions before release. Device reconciliation distinguishes supported patched endpoints and separately isolated/replaced warehouse equipment. Monitoring and recovery outcomes do not themselves accept or close a native Risk.\nCORRECTIVE TRACE\n${year==='2024'?'Corrective work is assigned with a 2024-08-30 target; independent validation must follow completion and remains unperformed at this report date.':'2024 Actions completed 2024-08-30; independent validation followed 2024-09-20. The original June 2024 report retains its then-open position.'}`;
}

export function addDunderAuditHistory(db, tools) {
  const client=db.clients.find(row=>row.client_id===CID),actor=db.user.user_id;
  const scope=plan.business.scope;
  const independence='Independent provider consultant audits Dwight’s operating controls and Finance; Oscar supplies accounting records without auditing his own work. Business owners attest records; the reviewer independently evaluates samples.';
  const dueDays={'governance-risk':'04-26','people-access-suppliers':'05-24','physical-technology':'07-19','operations-improvement':'06-21'};
  client.iso_audit_program={status:'active',activated_at:at('2024-03-18'),activated_by:actor,
    configuration:{client_id:CID,start_date:'2024-03-18',first_package:isoAuditCatalog.packages[0].key,auditor_id:'demo_provider_consultant',scope,independence},
    schedule:isoAuditCatalog.packages.map(pack=>({package_key:pack.key,title:pack.title,due_date:'2024-'+dueDays[pack.key]}))};
  for(const pack of isoAuditCatalog.packages){
    const key='audit_'+pack.key,rid=fixtureId('review',key);
    const review=tools.addReview({key,title:'Internal Audit — '+pack.title,review_type:'requirements',owner_id:'demo_provider_consultant',reviewer_id:'demo_provider_consultant',
      recurrence:'annual',due_date:'2024-'+dueDays[pack.key],created_at:'2024-03-18',framework_key:'iso-27001',
      framework_safeguards:[...new Set(pack.items.map(item=>item.definition_id))],scope,audit_independence:independence,audit_program_start:'2024-03-18',
      iso_audit:initialAuditState(pack.key,4),governance_context:{...practice,rationale:'Four scoped annual packages; unscheduled quarters are not failures.'},
      snapshotAt:(when,{cycle,occurrenceId})=>{
        const state=initialAuditState(pack.key,cycle),nonconforming=pack.key==='operations-improvement'&&when.slice(0,4)==='2024';
        const findings={};
        if(nonconforming)for(const [definition,keySuffix,description,remediation,validation] of [
          ['A.8.13','transition-backup','The March 2024 label-gateway change introduced a dependency whose backup and complete order-service recovery sample was not validated.','Complete the changed label-gateway backup and timed order-service recovery sample','The independent reviewer traced changed backup coverage, recovery credentials and a timed full order-service retest.'],
          ['A.8.16','transition-monitoring','The monitoring sample lacked an alternate owner and WMS integration escalation evidence.','Document the alternate escalation owner and exercise WMS alert routing','The independent reviewer traced a controlled alert through the MSP queue, alternate escalation and retained incident record.'],
        ]){
          const assessment=db.framework_assessments.find(row=>row.client_id===CID&&row.definition_id===definition);
          const result=findingChain(db,tools,{key:keySuffix,title:'Transition audit nonconformity — '+definition,
            description,created:when,done:'2024-08-30',validated:'2024-09-20',remediation,validation,review_id:rid,occurrence_id:occurrenceId,framework_assessment_id:assessment.framework_assessment_id});
          findings[definition]=result.finding.finding_id;
          assessment.related_links.push({kind:'findings',id:result.finding.finding_id},{kind:'tasks',id:result.task.task_id},{kind:'evidence',id:result.evidence.evidence_id});
        }
        if(nonconforming)findings['A.5.30']=findings['A.8.13'];
        const report=tools.addEvidence({key:key+'_'+when.slice(0,4),title:pack.title+' — issued internal audit report '+when.slice(0,4),
          linked_type:'review',linked_id:rid,at:when,owner:'demo_provider_consultant',
          content:`Scope: ${scope}\nMethod: independent records inspection and traced sample of ${pack.items.length} workpaper items.\nResult: ${nonconforming?'Two nonconformities, A.8.13 and A.8.16; corrective action and later validation are separate.':'Applicable workpaper samples conform; retained historical findings remain visible.'}\n${auditSampleExtract(db,pack,when)}\nNo certificate or independent external audit opinion is issued.`,extra:{occurrence_id:occurrenceId,evidence_type:'Audit Report'}});
        state.report_evidence_id=report.evidence_id;
        for(const item of pack.items){
          const assessment=db.framework_assessments.find(row=>row.client_id===CID&&row.definition_id===item.definition_id);
          const saved=assessmentAt(assessment,when),excluded=saved.soa_applicability==='excluded',criterion=criteria.requirements[item.definition_id];
          state.items[item.key]={status:excluded?'not_applicable':'reviewed',result:excluded?'':findings[item.definition_id]?'nonconformity':'conforming',
            notes:excluded?'':`Inspected ${saved.technology}. ${saved.implementation}`,na_rationale:excluded?saved.soa_justification:'',
            evidence_ids:[report.evidence_id],finding_ids:findings[item.definition_id]?[findings[item.definition_id]]:[],
            assessment_checks:excluded||findings[item.definition_id]||criterion?.coverage!=='verified'?[]:criterion.criteria.map(check=>check.id),updated_at:when,updated_by:'demo_provider_consultant'};
        }
        return isoCompletionSnapshot(db,{client_id:CID,review_id:rid,current_occurrence_id:occurrenceId,iso_audit:state});
      },evidenceAt:when=>db.evidence.filter(row=>row.evidence_id===fixtureId('evidence',key+'_'+when.slice(0,4))),
      notesAt:when=>`${when.slice(0,4)} ${pack.title}: scoped sample complete; full workpapers, issued report and occurrence-specific findings retained. Corrective action completion and independent validation remain separate.`});
    for(const occurrence of review.occurrences){
      const count=new Set(Object.values(occurrence.iso_audit.items).flatMap(item=>item.finding_ids)).size;
      if(count)Object.assign(occurrence,{outcome:'findings_raised',finding_count:count});
    }
    for(const assessment of db.framework_assessments.filter(row=>row.client_id===CID&&review.framework_safeguards.includes(row.definition_id)))assessment.related_links.push({kind:'reviews',id:rid});
  }
  // Evidence relationships are created only after both target records exist.
  for(const row of db.framework_assessments.filter(row=>row.client_id===CID)){
    const review=db.reviews.find(item=>item.client_id===CID&&item.iso_audit&&item.framework_safeguards.includes(row.definition_id));
    const report=db.evidence.find(item=>item.linked_id===review.review_id&&item.evidence_date.startsWith('2026'));
    row.related_links.push({kind:'evidence',id:report.evidence_id});
  }
  if(db.logs.some(row=>row.client_id===CID&&row.at>EIGHT_YEAR_ANCHOR))throw new Error('Historical log exceeds the fixed anchor');
}
