import catalog from '@catalogs/cmmc.json';
import {buildCmmcWorkspace,effectiveCmmcPlan} from './cmmcWorkspace';
import {prepareOfficeSnapshot} from './cmmcFiles/snapshot';
import {cmmcWorkbookRequest} from '../preview/cmmcWorkbook';

const client={client_id:'local',name:'Synthetic example',status:'active',profile:{technical:{operating_environment:['IoT']}}};
const actor={user_id:'operator',role:'super_admin',name:'Synthetic operator',status:'active'};
const start=()=>({
  user:actor, clients:[client],users:[actor],logs:[],requirements:[{client_id:'local',baseline_key:'cmmc',baseline_response:'applies'}],
  baselines:{local:{completed:true}},framework_assessments:catalog.requirements.map(def=>({client_id:'local',framework_key:'cmmc',
    framework_assessment_id:'assessment-'+def.id,definition_id:def.id,framework_version:catalog.version,status:'not_assessed',related_links:[]})),
});
const scope={client_id:'local'};
function model(db){
  const packet=cmmcWorkbookRequest(db,'get',scope,{});
  return buildCmmcWorkspace(packet.data,packet.records,packet.client);
}
const change=(db,overrides={})=>cmmcWorkbookRequest(db,'put',{},{
  client_id:'local',level:2,revision:0,request_id:'synthetic-workbook-save-0001',section:'ssp',target:'',values:{system:'System A'},...overrides,
});

test('fresh Demo onboarding supports level-appropriate exports while a new program has no estimated score',async()=>{
  const db=start();
  expect(model(db).score).toMatchObject({available:false,value:null,total:110});
  expect(model(db).profileEnv).toEqual(['IoT']);
  const exportBody={...scope,level:2,kind:'sprs',request_id:'synthetic-export-0001'};
  expect((await cmmcWorkbookRequest(db,'post',{},exportBody)).records.client_id).toBe('local');
  await cmmcWorkbookRequest(db,'post',{},exportBody);
  expect(db.logs).toHaveLength(1);
  expect(db.logs[0]).toMatchObject({action:'prepare-export',user_id:'operator',client_id:'local',entity_id:JSON.stringify(['local',2])});
  db.clients=[{...client,framework_settings:{cmmc:{level:1}}}];
  expect(model(db).rows).toHaveLength(17);
  expect(()=>cmmcWorkbookRequest(db,'post',{},{...exportBody,level:1})).toThrow();
});

test('actual native assessment version scopes exception credit, earlier plan impact stays in history after reassessment',()=>{
  const db=start(),item=db.framework_assessments.find(row=>row.definition_id==='3.13.11');
  Object.assign(item,{status:'needs_attention',last_saved:'v1',implementation:'Encryption gap',assessment_history:[{status:'needs_attention',at:'v1'}]});
  const initial=model(db).rows.find(row=>row.id===item.definition_id);
  expect(initial).toMatchObject({deductionMin:3,deductionMax:5,eligibility:'review'});
  const patch={section:'exceptions',target:item.definition_id,assessed_version:'v1',values:{value:'encrypted-not-fips'}};
  expect(change(db,patch).revision).toBe(1);
  expect(change(db,patch).revision).toBe(1);
  expect(model(db).rows.find(row=>row.id===item.definition_id)).toMatchObject({deductionMin:3,deductionMax:3,eligibility:'candidate'});
  expect(change(db,{section:'plans',target:item.definition_id,assessed_version:'v1',revision:1,request_id:'synthetic-plan-save-0002',
    values:{milestone:'Replace module',status:'In progress'}}).revision).toBe(2);
  item.last_saved='v2';
  expect(()=>change(db,{...patch,revision:2,request_id:'synthetic-new-save-0003'})).toThrow(/changed/);
  expect(model(db).rows.find(row=>row.id===item.definition_id).deductionMax).toBe(5);
  item.status='addressed';
  expect(model(db).rows.find(row=>row.id===item.definition_id).deduction).toBe(0);
  const preserved=model(db).plans.find(row=>row.id===item.definition_id);
  expect(preserved).toMatchObject({deductionMax:3,plan:{assessment:{points:3,narrative:'Encryption gap'}}});
  const close={section:'plans',target:item.definition_id,assessed_version:'v2',revision:2,request_id:'synthetic-close-save-0004'};
  expect(()=>change(db,{...close,values:{status:'Closed'}})).toThrow(/evidence/);
  expect(change(db,{...close,values:{status:'Closed',evidence:'Test record',closeout:'Validated'}}).revision).toBe(3);
  const reopen={...close,revision:3,request_id:'synthetic-reopen-0005'};
  expect(()=>change(db,{...reopen,values:{status:'Open'}})).toThrow(/reason/);
  expect(change(db,{...reopen,values:{status:'Open',closeout:'New evidence requires review'}}).revision).toBe(4);
  expect(model(db).history.find(event=>event.revision===4).after.closeout).toBe('New evidence requires review');
});

test('review evidence uses selected occurrence, explicit relationships and the scoped Action; prior periods and other tenants stay separate',()=>{
  const db=start(),item=db.framework_assessments[0];
  db.reviews=[{client_id:'local',review_id:'r',current_occurrence_id:'phase2',framework_drivers:[{framework_key:'cmmc',framework_safeguards:[item.definition_id]}]}];
  db.tasks=[{client_id:'local',task_id:'t',framework_assessment_id:item.framework_assessment_id}];
  db.evidence=[
    {evidence_id:'old',linked_type:'review',linked_id:'r',occurrence_id:'phase1'},
    {evidence_id:'current',relationships:[{kind:'reviews',id:'r',occurrence_id:'phase2'}]},
    {evidence_id:'old-unbound',linked_type:'review',linked_id:'r'},
    {evidence_id:'linked-task',linked_type:'task',linked_id:'t'},
    {evidence_id:'unrelated',linked_type:'review',linked_id:'different'},
  ].map(row=>({...row,client_id:'local'}));
  db.evidence.push({...db.evidence[1],client_id:'other',evidence_id:'foreign'});
  db.reviews[0].framework_drivers.push({framework_key:'cis-ig1',framework_plan_key:'unmapped-local-plan'});
  db.reviews.push({client_id:'local',review_id:'unmapped',framework_key:'cmmc',framework_plan_key:'legacy-plan-with-no-template',framework_safeguards:[item.definition_id]});
  const selected=model(db).rows[0];
  expect(selected.reviews.map(review=>review.review_id)).toEqual(['r','unmapped']);
  expect(selected.evidence.map(row=>row.evidence_id)).toEqual(['current','linked-task']);
  expect(selected.tools).toEqual([]);
});

test('shared Review remediation follows its Finding assignment and supplies evidence to both the register and exports',()=>{
  const db=start(), item=db.framework_assessments[0];
  item.status='needs_attention';
  db.reviews=[{...scope,review_id:'r',framework_key:'cmmc',framework_safeguards:[item.definition_id]}];
  db.findings=['shared-finding','other-finding'].map(finding_id=>({...scope,review_id:'r',finding_id}));
  db.framework_assessments.push({...scope,framework_key:'soc2',framework_assessment_id:'other-program-assessment',
    related_links:[{kind:'findings',id:'other-finding'}]});
  db.tasks=[{...scope,task_id:'one',review_id:'r',finding_id:'shared-finding',title:'Restore validated media',assignee_id:'operator',due_date:'2027-01-02'},
    {...scope,task_id:'other-action',review_id:'r',finding_id:'other-finding',title:'Different assessment'}];
  db.evidence=[{...scope,evidence_id:'action-file',filename:'Validation.pdf',linked_type:'task',linked_id:'one'}];
  let m=model(db),row=m.plans[0];
  expect(row.actions.map(t=>t.task_id)).toEqual(['one']);
  expect(row.evidence.map(t=>t.evidence_id)).toEqual(['action-file']);
  expect(effectiveCmmcPlan(row,m.client)).toMatchObject({owner:'Synthetic operator',milestone:'Restore validated media',due_date:'2027-01-02'});
  expect(prepareOfficeSnapshot(m).workbook.rows[0]).toMatchObject({owner:'Synthetic operator',milestone:'Restore validated media',due:'2027-01-02'});
  db.tasks.push({...scope,task_id:'two',review_id:'r',title:'Separate Review action',due_date:'2028-03-10'});
  m=model(db);row=m.plans[0];
  expect(row.actions.map(t=>t.task_id)).toEqual(['one','two']);
  expect(effectiveCmmcPlan(row,m.client)).toMatchObject({owner:'',milestone:'',due_date:''});
  db.tasks.pop();
  change(db,{section:'plans',target:item.definition_id,values:{milestone:'',due_date:'',owner:'Quality lead'}});
  m=model(db);
  expect(prepareOfficeSnapshot(m).workbook.rows[0]).toMatchObject({owner:'Quality lead',milestone:'',due:''});
});

test('server-shaped Demo edits preserve prior scope, deny readers and isolate client history',()=>{
  const db=start();
  db.user={...actor,role:'client_readonly',client_ids:['local']};
  expect(()=>change(db)).toThrow(/read-only/);
  db.user={...actor,role:'client_contributor',client_ids:['local']};
  expect(()=>change(db)).toThrow(/manager/);
  db.user=actor;
  expect(change(db).revision).toBe(1);
  expect(()=>change(db,{request_id:'synthetic-stale-save-0009'})).toThrow(/changed/);
  expect(model(db).ssp.system).toBe('System A');
  db.user={...actor,role:'client_readonly',client_ids:['foreign']};
  expect(()=>model(db)).toThrow(/Forbidden/);
});
