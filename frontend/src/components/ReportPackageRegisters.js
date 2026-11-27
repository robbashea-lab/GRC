import {assessedRisk,isOpen} from '../lib/grcWork';
import {actionPendingValidation,actionReturnedForRework} from '../lib/actionItems';
import rules from '../lib/grcRules.json';

const sheet = (name,columns,rows,guide='Saved client records in the selected package scope.') =>
  ({name,rows:[[name],[guide],[],columns,...rows],reportHeaderIndex:3});
const list = value => Array.isArray(value) ? value.filter(item=>typeof item==='string').join('; ') : value ?? '';
const mappedIds = row => (row.related_links || []).filter(link=>link?.kind==='risks').map(link=>link.id).join('; ');
const workbook = (path,...sheets) => ({path,sheets});

function calendarDay(value,format) {
  if(!value)return '';
  const text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const date=new Date(text);
  if(!Number.isFinite(date.getTime()))return '';
  const parts=Object.fromEntries(format.formatToParts(date).map(part=>[part.type,part.value]));
  return [parts.year,parts.month,parts.day].join('-');
}

export function programWork(registers,key) {
  const assignments = new Map(registers.framework_assessments.map(row=>[row.framework_assessment_id,row.framework_key]));
  const links = new Map();
  for(const assessment of registers.framework_assessments)for(const link of assessment.related_links || []) {
    const lookup=link.kind+'|'+link.id;
    if(!links.has(lookup))links.set(lookup,new Set());
    links.get(lookup).add(assessment.framework_key);
  }
  const reviewIds=new Set();
  const reviews=registers.reviews.filter(row=>{
    const explicit=links.get('reviews|'+row.review_id);
    if(row.framework_assessment_id)return assignments.get(row.framework_assessment_id)===key;
    if(explicit)return explicit.has(key);
    if(row.framework_drivers!=null)return row.framework_drivers.some(driver=>driver.framework_key===key);
    return !row.framework_key||row.framework_key===key;
  });
  reviews.forEach(row=>reviewIds.add(row.review_id));
  const findingIds=new Set(registers.findings.filter(row=>{
    if(row.framework_assessment_id)return assignments.get(row.framework_assessment_id)===key;
    const linked=links.get('findings|'+row.finding_id);
    return linked?linked.has(key):!row.review_id||reviewIds.has(row.review_id);
  }).map(row=>row.finding_id));
  const tasks=registers.tasks.filter(row=>{
    if(row.framework_assessment_id)return assignments.get(row.framework_assessment_id)===key;
    const linked=links.get('tasks|'+row.task_id);
    if(linked)return linked.has(key);
    if(row.finding_id)return findingIds.has(row.finding_id);
    return !row.review_id||reviewIds.has(row.review_id);
  });
  return {reviews,tasks,findings:registers.findings.filter(row=>findingIds.has(row.finding_id))};
}

export function packageEvidenceCopies(evidence,config) {
  if(!config.copies)return [];
  const referenceOnly=new Set(config.referenceOnlyEvidenceIds||[]);
  return evidence.filter(row=>row.file_available!==false&&!referenceOnly.has(row.evidence_id));
}

export function registerWorkbooks(materials,config) {
  const {registers:r,reports,evidence}=materials;
  const header=reports.assessment.header, key=header.program.key;
  const client=r.clients[0], owners=new Map(r.users.map(row=>[row.user_id,row.name]));
  const scope=client.profile?.scope||{};
  const person=id=>owners.get(id)||id||'';
  const calendar=new Intl.DateTimeFormat('en-US',{timeZone:client.timezone||client.time_zone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
  const day=value=>calendarDay(value,calendar),within=value=>Boolean(day(value)&&day(value)>=config.start&&day(value)<=config.end);
  const {reviews,tasks}=r;
  const policyRows=r.policies.filter(row=>config.drafts||['approved','published','active'].includes(row.status));
  const includedPolicies=new Set(policyRows.map(row=>row.title));
  const history=(name,group,extra=()=>true)=>config.history?[sheet(name,['Date','Record','Event','Version'],materials.registerHistory
    .filter(row=>row.register===group&&within(row.at)&&extra(row)).map(row=>[row.at,row.record,row.event,row.version]))]:[];
  const files=[];
  files.push(workbook('01_Scope-and-governance/Scope-and-roles.xlsx',
    sheet('Organization',['Item','Recorded value'],[['Client',header.client.name],['Industry',client.industry],['Environment',client.environment],
      ['Framework',header.program.name],['GRC program lead',person(client.assigned_owner_id)],['Recorded scope',scope.statement||client.isms_scope||client.iso_scope],
      ['Locations',scope.locations],['Data in scope',scope.data],['Exclusions and rationale',scope.exclusions],
      ['Scope confirmed on',client.profile_scope_confirmation?.at],['Scope confirmed by',client.profile_scope_confirmation?.by],
      ['Activity period',config.start+' to '+config.end]].map(([label,value])=>[label,value||'Not recorded'])),
    sheet('In-scope systems',['Recorded systems and boundaries'],scope.systems?[[scope.systems]]:[],
      'Systems and boundaries documented in the Client Profile scope.'),
    sheet('Asset register',['System','Type','Criticality','Owner','Location'],r.assets.map(a=>[a.name,a.asset_type,a.criticality,person(a.owner_id),a.location])),
    sheet('Roles and contacts',['Name','Role','Primary contact'],r.contacts.filter(c=>c.status!=='inactive').map(c=>[c.name,list(c.grc_roles)||c.role||c.title,c.contact_id===client.primary_contact_id?'Yes':''])),
    sheet('Key service providers',['Vendor','Criticality','Data access','Assurance'],r.vendors.filter(v=>['high','critical'].includes(v.criticality)&&!['offboarded','inactive','archived'].includes(v.status))
      .map(v=>[v.name,v.criticality,list(v.data_relationship)||list(v.data_types),v.assurance_status]))));
  const policyAlignments=new Map(reports.policies.sections[0].rows.map(row=>[row[0],row.at(-1)]));
  files.push(workbook('02_Policies/Policy-register.xlsx',sheet('Policies',['ID','Policy','Owner','Version','Status','Approved','Last review','Next review','Framework alignment'],
    policyRows.map(p=>[p.policy_id,p.title,person(p.owner_id),p.version,p.status,p.approved_at,p.last_reviewed_at,p.next_review_date,policyAlignments.get(p.title)])),
    ...history('Approval and review history','Policies',row=>includedPolicies.has(row.record))));
  const riskNames=new Map(r.risks.map(row=>[row.risk_id,row.title]));
  const riskHistory=materials.registerHistory.filter(row=>row.register==='Risks'&&within(row.at))
    .map(row=>[row.at,row.record,row.event,row.version,'','','']);
  const occurrences=[];
  const exceptions=[];
  const currentTickets=review=>[review.activity_setup?.recurring_ticket_number,
    review.r4_current_checklist?.occurrence_id===review.current_occurrence_id?review.r4_current_checklist?.cycle_ticket_number:null];
  for(const review of reviews) {
    const saved=(review.occurrences||[]).filter(o=>o.completed_at||o.completion_date);
    if(!saved.length&&review.status==='completed'&&review.completion_date)saved.push({...review,completed_at:review.completion_date});
    for(const o of saved) {
      const completed=o.completed_at||o.completion_date, due=day(o.due_date);
      if(!within(completed))continue;
      const status=due&&day(completed)>due?'Completed late':'Completed';
      const row=[o.occurrence_id||'',o.title||review.title,person(o.owner_id||review.owner_id),o.due_date,completed,status,o.outcome,
        o.activity_setup?.recurring_ticket_number,o.activity_setup?.cycle_ticket_number];
      occurrences.push(row);if(status==='Completed late')exceptions.push(row);
      if(config.history&&riskNames.has(review.risk_id))riskHistory.push([
        completed,riskNames.get(review.risk_id),'Review completed','',o.occurrence_id||'',o.title||review.title,o.outcome]);
    }
    if(config.open&&isOpen('reviews',review)&&day(review.due_date)&&day(review.due_date)<config.end) {
      const row=[review.current_occurrence_id,review.title,person(review.owner_id),review.due_date,'','Overdue','',...currentTickets(review)];
      occurrences.push(row);exceptions.push(row);
    }
  }
  files.push(workbook('03_Risk-management/Risk-register.xlsx',sheet('Risk register',['ID','Risk','Owner','Likelihood','Impact','Score','Rating','Treatment','Status','Accepted by','Accepted on','Next review'],
    r.risks.map(assessedRisk).map(s=>[s.display_id||s.risk_id,s.title,person(s.owner_id),s.likelihood_score,s.impact_score,s.risk_score,s.risk_level,s.treatment,s.status,person(s.accepted_by),s.acceptance_date,s.next_review])),
    ...(config.history?[sheet('Risk review history',['Date','Record','Event','Version','Occurrence ID','Review','Outcome'],
      riskHistory.sort(([left],[right])=>String(left).localeCompare(String(right))))]:[]),
    sheet('Rating method',['Minimum score','Rating'],rules.riskBands,'Likelihood × impact. Both inputs must be recorded on the native 1–5 scale.')));
  const ticketColumns=['Recurring ticket','Cycle ticket'];
  const occurrenceColumns=['Occurrence ID','Review','Owner','Due date','Completed','Status','Outcome',...ticketColumns];
  const horizon=new Date(header.as_of+'T12:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+90);
  const scheduleColumns=['ID','Review','Type','Frequency','Owner','Due date','Status',...ticketColumns];
  const schedule=reviews.map(v=>[v.review_id,v.title,v.review_type,v.recurrence,person(v.owner_id),v.due_date,v.status,...currentTickets(v)]);
  files.push(workbook('04_Recurring-reviews/Review-schedule-and-log.xlsx',
    sheet('Occurrences in period',occurrenceColumns,occurrences),
    sheet('Review schedule',scheduleColumns,schedule),
    sheet('Next 90 days',scheduleColumns,schedule.filter(row=>day(row[5])>=header.as_of&&day(row[5])<=horizon.toISOString().slice(0,10)&&isOpen('reviews',{status:row[6]})))));
  files.push(workbook('05_Vendor-management/Vendor-register.xlsx',sheet('Vendor register',['Vendor','Status','Criticality','Data access','Assurance','Next review','Renewal'],
    r.vendors.map(v=>[v.name,v.status,v.criticality_provisional?[v.criticality,'provisional'].filter(Boolean).join(' · '):v.criticality,list(v.data_relationship)||list(v.data_types),v.assurance_status,v.next_review,v.contract_renewal])),
    sheet('Assurance records',['Vendor','Document','Required','Received','Refresh due'],r.vendors.flatMap(v=>(v.assurance_records||[]).map(a=>[v.name,a.document_name||a.type,a.required,a.received_at,a.refresh_due]))),
    ...history('Vendor review history','Vendors')));
  const aiNames=new Map(r.ai_systems.map(s=>[s.ai_system_id,s.name]));
  files.push(workbook('06_AI-governance/AI-register.xlsx',sheet('AI systems',['AI system','Provider','Use case','Owner','Screening tier','Status','Approval','Data types','Restrictions','Linked risks'],
    r.ai_systems.map(s=>[s.name,s.provider,list(s.purposes),person(s.owner_id),s.risk_tier,s.status,s.approval_status,s.no_client_data===true?'No client data':list(s.data_types),s.restrictions,mappedIds(s)])),
    ...(config.history?[sheet('Review history',['Date','AI system','Review','Outcome'],reviews.filter(row=>aiNames.has(row.ai_system_id)).flatMap(row=>(row.occurrences||[])
      .filter(o=>within(o.completed_at||o.completion_date)).map(o=>[o.completed_at||o.completion_date,aiNames.get(row.ai_system_id),row.title,o.outcome])))]:[])));
  const ig=/IG[123]/i.exec(header.program.name)?.[0].toUpperCase();
  const frameworkPath=({'cis-ig1':'07_CIS-safeguard-register/CIS-'+(ig?ig+'-':'')+'safeguard-register.xlsx',
    'soc-2':'07_SOC-2-criteria-matrix/SOC-2-criteria-matrix.xlsx','iso-27001':'07_ISO-27001-SoA-and-clauses/Statement-of-Applicability-and-clauses.xlsx',
    cmmc:'07_CMMC-SSP-POAM-and-score/Requirement-evidence-matrix.xlsx'})[key]||'07_Framework-requirements/Requirement-evidence-matrix.xlsx';
  const saved=new Map(r.framework_assessments.filter(row=>row.framework_key===key).map(row=>[row.definition_id,row]));
  files.push(workbook(frameworkPath,sheet('Assessment register',['Reference','Title','Status','Verification','Implementation','Applicability','Justification','Supporting policies'],
    r.framework_units.map(unit=>{const a=saved.get(unit.id);return [unit.id,unit.title,unit.status_label,unit.verification_state,a?.implementation,unit.soa_applicability,unit.soa_justification,list(a?.policy_link_ids)];})),
    ...reports.scope.sections.map((section,index)=>sheet(index?'Scope '+(index+1):'Program scope',section.columns,section.rows))));
  const includedEvidence=new Set(packageEvidenceCopies(evidence,config).map(row=>row.evidence_id));
  const evidenceSheet=sheet('Evidence references',['ID','Filename','Version','Checksum','Frameworks','Created','Delivery'],
    evidence.map(row=>[row.evidence_id,row.filename,row.version,row.sha256,list(row.frameworks),row.created_at,
      includedEvidence.has(row.evidence_id)?'Stored copy included':'Reference only']));
  files.push(workbook('08_Evidence/Evidence-index.xlsx',evidenceSheet));
  const actionsPath=key==='iso-27001'?'09_Nonconformities-and-corrective-actions/Corrective-actions.xlsx':
    key==='soc-2'?'09_Exceptions-and-remediation/Exceptions-and-remediation.xlsx':'09_Open-items/Open-items.xlsx';
  const findings=new Map(r.findings.map(finding=>[finding.finding_id,finding]));
  const pendingValidation=task=>actionPendingValidation(task,findings.get(task.finding_id));
  const validatedAt=task=>{
    const finding=findings.get(task.finding_id);
    return finding?(finding.status==='closed'&&!actionReturnedForRework(task,finding)?finding.validated_at:null):task.validated_at;
  };
  const actionRows=tasks.filter(task=>isOpen('tasks',task)||pendingValidation(task)?config.open:
    task.status==='done'&&(within(task.completed_at)||within(validatedAt(task))));
  files.push(workbook(actionsPath,sheet('Action items',['Action ID','Action','Source','Owner','Priority','Due','Status','Work submitted/completed','Validated'],
    actionRows.map(task=>[task.display_id||task.task_id,task.title,task.finding_id||task.source,person(task.assignee_id||task.owner_id),
      task.priority,task.due_date,pendingValidation(task)?'Pending validation':task.status,task.completed_at,validatedAt(task)])),
    sheet('Review exceptions',occurrenceColumns,exceptions)));
  const supplemental=materials.cmmc?.files||[];
  files.push(...supplemental.map(file=>({path:file.path,cmmc:true})));
  const indexPath='00_Package-index.xlsx';
  files.unshift(workbook(indexPath,sheet('Package contents',['File'],['00_Start-here.pdf',indexPath,...files.map(f=>f.path),...(includedEvidence.size?['08_Evidence/Stored-files.zip']:[])].map(path=>[path])),
    ...(config.history?[sheet('Report export history',['Report','Format','As of','Generated','Prepared by'],materials.history.filter(row=>within(row.created_at)).map(h=>[h.title,h.format,h.as_of,h.created_at,h.prepared_by?.name]))]:[])));
  return files;
}
