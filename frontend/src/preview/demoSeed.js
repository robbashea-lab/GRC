import catalog from '../lib/onboardingCatalog.json';
import { reviewView } from '../lib/reviewOccurrences';
import { assessedRisk } from '../lib/grcWork';

// This module is loaded only by the session-local demo adapter, never by startup.
export const demoOrganizations = [
  {key:'cyberdyne',name:'Cyberdyne System',maturity:0,frameworks:['cmmc','nist-csf-2','iso-27001'],lead:'Sarah Connor',industry:'Research and engineering'},
  {key:'prestige',name:'Prestige World Wide',maturity:1,frameworks:['cis-ig1'],lead:'Alex Morgan',industry:'Professional services'},
  {key:'initech',name:'Initech',maturity:2,frameworks:['iso-27001'],lead:'Peter Gibbons',industry:'Technology'},
  {key:'brawndo',name:'Brawndo',maturity:4,frameworks:['cis-ig1','nist-csf-2'],lead:'Joe Bowers',industry:'Consumer products'},
  {key:'dunder',name:'Dunder Mifflin',maturity:3,frameworks:['hipaa'],lead:'Dwight Schrute',industry:'Business supplies'},
];

export function buildDemoStore(tableNames, clock = new Date()) {
  const date = days => { const d=new Date(clock); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  const db=Object.fromEntries(tableNames.map(key=>[key,[]]));
  db.user={user_id:'demo_admin',name:'Demo Explorer',email:'explorer@omnisciente.example',role:'super_admin',status:'active',workspace_mode:'demo',client_ids:demoOrganizations.map(o=>'demo_'+o.key),favorite_client_ids:[]};
  db.users.push({...db.user});
  db.logs=[]; db.notifications=[]; db.drafts={}; db.baselines={};
  for (const org of demoOrganizations) {
    const cid='demo_'+org.key, owner='demo_owner_'+org.key, poor=org.maturity===4;
    const meta={client_id:cid,created_at:date(-180),updated_at:date(-1),created_by:db.user.user_id};
    db.clients.push({...meta,client_id:cid,name:org.name,industry:org.industry,environment:'Demo',status:'active',assigned_owner_id:owner,notes:'Fictional sample organization. Framework selection demonstrates product functionality, not compliance or certification.'});
    db.users.push({user_id:owner,name:org.lead,email:org.key+'.lead@example.test',role:'client_admin',status:'active',client_ids:[cid],workspace_mode:'demo'});
    const contacts=org.key==='dunder' ? [
      ['Michael Scott','Executive Sponsor','Regional Manager'],['Dwight Schrute','Business Continuity / Disaster Recovery Lead','Security and Continuity'],['Jim Halpert','Vendor / Third-Party Contact','Vendor Relationships'],['Pam Beesly','Primary GRC / Security Contact','Program Coordinator'],['Oscar Martinez','Finance Contact','Finance'],['Angela Martin','Finance Contact','Accounting'],['Toby Flenderson','HR Contact','Human Resources'],['Darryl Philbin','IT Lead','Operations'],
    ] : poor ? [
      ['President Camacho','Executive Sponsor','Executive Sponser'],['Joe Bowers','Information Security Lead','Secuirty Lead'],['Frito Pendejo','IT Lead','IT Manger'],['Rita','Finance Contact','Financ'],
    ] : [[org.lead,'Information Security Lead','Security Program Lead'],['Jordan Lee','Executive Sponsor','Executive Sponsor'],['Casey Ellis','HR Contact','People Operations'],['Morgan Quinn','Legal / Privacy Contact','Privacy Counsel']];
    contacts.forEach(([name,role,title],i)=>db.contacts.push({...meta,contact_id:cid+'_contact_'+i,name,role,title,email:org.key+'.contact'+i+'@example.test',status:'active'}));
    const selected=catalog.reviews.filter(r=>poor||['user-access','awareness','vendor','restore','bcp-dr','policy-review'].includes(r.key));
    const reviews=selected.map((item,i)=>{
      const offset=poor ? -15-i*6 : org.maturity>=2&&i<org.maturity-1 ? -7-i*3 : 35+i*8;
      const r=reviewView({...meta,review_id:cid+'_review_'+item.key,title:item.name,review_type:item.review_type,baseline_key:item.key,baseline_selection:'selected',owner_id:poor&&i%2===0?null:owner,due_date:poor&&i===selected.length-1?null:date(offset),status:i===1?'in_progress':'upcoming',recurrence:'quarterly'});
      const previous={...r,occurrence_id:r.review_id+'_previous',status:'completed',due_date:date(offset-92),completed_at:date(offset-94),completion_date:date(offset-94),completed_by:owner,completed_by_name:org.lead,outcome:'no_findings',finding_count:0,evidence:[]};
      r.occurrences=poor?[]:[previous];
      if(!poor) {
        const eid=r.review_id+'_evidence';
        db.evidence.push({...meta,evidence_id:eid,filename:item.key+'-review-notes.txt',mime_type:'text/plain',content_base64:btoa('Fictional demonstration evidence: '+item.name+'. Review completed and checked by the program owner.'),size:120,linked_type:'review',linked_id:r.review_id,occurrence_id:previous.occurrence_id,uploaded_by:owner,uploaded_by_email:org.key+'.lead@example.test',created_at:previous.completed_at});
        previous.evidence.push({evidence_id:eid,filename:item.key+'-review-notes.txt',version:1});
      }
      return r;
    });
    db.reviews.push(...reviews);
    const completed=reviewView({...meta,review_id:cid+'_implementation_review',title:'Initial governance baseline review',review_type:'management',owner_id:owner,due_date:date(-120),status:'completed',recurrence:'none',completion_date:date(-121),completed_at:date(-121),completed_by:owner});
    completed.occurrences=[{...completed,occurrence_id:completed.current_occurrence_id,completed_by_name:org.lead,outcome:'no_findings',finding_count:0,evidence:[]}];
    db.reviews.push(completed);
    const findingTitles=['Periodic privileged access reviews are overdue.','Backup restore testing has not been completed according to the expected cadence.','Ownership for critical GRC activities is not consistently established.','Vendor assurance evidence requires renewal.','Policy review approvals require management follow-up.','Vulnerability remediation governance requires consistent tracking.'];
    const actionTitles=['Complete the overdue privileged access review','Perform and document backup restore testing','Assign owners for critical governance activities','Obtain current vendor assurance evidence','Obtain policy review decisions from management','Document and track vulnerability remediation'];
    const count=poor?6:org.maturity<2?2:3;
    for(let i=0;i<count;i++) {
      const review=reviews[i%reviews.length], status=poor?['open','in_remediation','open','remediated','open','in_remediation'][i]:i===0?'closed':org.maturity<2?'in_remediation':'open';
      const fid=cid+'_finding_'+i, due=date(poor?-20-i*4:30+i*10), assigned=(poor&&i%2===0)||(org.key==='initech'&&i===2)?null:owner;
      const occurrence=status==='closed'&&review.occurrences.length?review.occurrences[0]:null;
      if(occurrence){occurrence.outcome='findings_raised';occurrence.finding_count++;}
      db.findings.push({...meta,finding_id:fid,title:org.maturity<2?'Documented governance improvement '+(i+1):findingTitles[i],description:'Sample review observation requiring documented ownership, evidence and follow-up.',status,severity:poor?(i%2?'high':'critical'):i===0?'low':'medium',owner_id:assigned,due_date:due,review_id:review.review_id,occurrence_id:occurrence?.occurrence_id||review.current_occurrence_id,...(status==='closed'?{closed_at:date(-30),closed_by:owner,validation_notes:'Evidence reviewed; corrective action verified.'}:{})});
      if(!(poor&&i===2))db.tasks.push({...meta,task_id:cid+'_task_'+i,title:actionTitles[i],title_generated:true,status:['closed','remediated'].includes(status)?'done':i%2?'in_progress':'open',priority:poor?'high':'medium',assignee_id:assigned,due_date:due,source:'finding',source_id:fid,finding_id:fid,review_id:review.review_id,occurrence_id:occurrence?.occurrence_id||review.current_occurrence_id,...(['closed','remediated'].includes(status)?{completed_at:date(-32)}:{})});
    }
    for(let i=0;i<(poor?4:2);i++) {
      const accepted=i===1;
      db.risks.push(assessedRisk({...meta,risk_id:cid+'_risk_'+i,title:['Dependency on a single recovery provider','Residual privileged access exposure','Incomplete recovery validation','Unassessed legacy integration exposure'][i],category:'operational',source_type:'manual',status:i===3?'identified':accepted?'accepted':org.maturity>=2?'in_progress':'assessed',owner_id:poor&&i!==1?null:owner,likelihood_score:i===3?null:poor?4:2,impact_score:i===3?null:poor?5:3,assessment_rationale:i===3?null:'Sample assessment considers exposure, recovery dependency and operating controls.',review_cadence:'quarterly',last_reviewed:i===3?null:date(-60),next_review:date(poor?-15-i:60+i*20),treatment:accepted?'accept':'mitigate',...(accepted?{acceptance_rationale:'Time-limited residual risk acceptance with monitoring and scheduled reassessment.',accepted_by:owner,acceptance_date:date(-60),acceptance_expires_at:date(poor?12:120)}:{})}));
    }
    const policyResponses={};
    catalog.policies.forEach((item,i)=>{
      const missing=poor&&i%3===0, response=missing?'no':'yes'; policyResponses[item.key]=response;
      db.policies.push({...meta,policy_id:cid+'_'+item.key,title:item.name,category:item.category,baseline_key:item.key,baseline_response:response,presence:missing?'reported_missing':'verified_existing',status:missing?'needs_creation':org.maturity>=2&&i===1?'in_review':'approved',version:missing?null:'1.0',owner_id:poor&&i%2===0?null:owner,last_reviewed:missing?null:date(-180),next_review_date:missing?null:date(poor?-30:org.maturity>=2&&i===1?10:180),approved_at:missing?null:date(-180)});
    });
    const requirementResponses={};
    catalog.requirements.forEach(item=>{
      const applies=org.frameworks.includes(item.key); requirementResponses[item.key]=applies?'applies':'does_not_apply';
      db.requirements.push({...meta,requirement_id:cid+'_requirement_'+item.key,title:item.name,category:item.category,baseline_key:item.key,baseline_response:requirementResponses[item.key],applicability:applies?'applicable':'not_applicable',status:'under_review',description:'Fictional demonstration scope only; no legal applicability, compliance or certification claim.'});
    });
    db.baselines[cid]={version:2,step:3,completed:true,policies:policyResponses,requirements:requirementResponses,reviews:selected.map(r=>r.key)};
    for(let i=0;i<2;i++) {
      const vid=cid+'_vendor_'+i,eid=vid+'_assurance',review=i===0?reviews.find(r=>r.review_type==='vendor'):null;
      db.evidence.push({...meta,evidence_id:eid,filename:'sample-vendor-assurance.txt',mime_type:'text/plain',content_base64:btoa('Fictional vendor assurance summary. Not a real audit report or certification.'),size:80,linked_type:'vendor',linked_id:vid,uploaded_by:owner,created_at:date(-90)});
      db.vendors.push({...meta,vendor_id:vid,name:i?'Northstar Payroll':'Sentinel Recovery Services',services:i?'Payroll processing':'Managed backup and recovery',criticality:i?'medium':'critical',status:'active',data_types:i?['Employee Data','Financial']:['Confidential','Operational Data'],owner_id:poor?null:owner,business_owner_id:poor?null:owner,last_review:date(poor?-400:-60),next_review:review?.due_date||date(poor?-25:45),review_frequency:'annual',contract_renewal:date(poor?15:org.maturity===2?25:150),assurance_required:true,assurance_records:[{assurance_id:vid+'_assurance_record',type:'Security Questionnaire',required:true,received_at:date(-90),refresh_due:date(poor?-20:org.maturity===2?20:180),evidence_ids:poor&&i===1?[]:[eid]}]});
      if(review){review.vendor_id=vid;review.vendor_purpose='vendor';}
    }
  }
  return db;
}
