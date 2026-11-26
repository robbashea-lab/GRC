import {appendApprovedV3Work,overlayApprovedV3Work} from './approvedV3Work';
import {reviewMapsTo} from '../lib/frameworkReviewLinks';

const tenant = 'client-a';
const ctx = {
  clientId:tenant, sourceId:'a', frameworkKey:'cis-ig1',
  userId:name => name === 'Analyst' ? 'a-user' : null,
  recordId:(kind, sourceId) => tenant + ':' + kind + ':' + sourceId,
  assessmentId:(code, key='cis-ig1') => code === '1.1' && key === 'cis-ig1' ? 'assessment-1' : null,
};
const baseReview = {id:'r1', title:'Review assets', type:'Asset', owner:'Analyst', due:'2026-11-30',
  cad:'M', anchor:'2026-10-31', monthEnd:true, cycleIndex:1,occurrenceId:'r1:occ:2', st:'In progress',
  supportMappings:[{kind:'cis', ids:['1.1','8.8'], explicit:true, relationship:'partial_support'},
    {kind:'soc', ids:['CC1.1'], explicit:false}]};
const history = {id:'h1', reviewId:'r1', title:'Review assets', type:'Asset', owner:'Analyst',
  due:'2026-10-31', done:'2026-11-01', cad:'M', outcome:'No exceptions noted'};
function fixture() {
  return {programs:{a:{risks:[{id:'RISK-004', wfId:'a-risk-4'}]}}, work:{a:{
    revs:[baseReview], hist:[history], cancelledReviews:[], done:[],
    acts:[{id:'t1', title:'Create an inventory', source:'Finding', origin:'Inventory missing', fromItem:'1.1',
      findingId:'f1', st:'Pending validation', pri:'High', owner:'Analyst', due:'2026-11-12'},
    {id:'t2', title:'Contain risk', source:'RISK-004', st:'Open', pri:'Low'}],
    findings:[{id:'f1', title:'Inventory missing', st:'Pending validation', actionIds:['t1'], history:[]}]}},
    evidence:{a:{rows:[
      'Asset report^v3 · 84 KB^Configuration export^Framework requirement^CIS IG1 1.1 · Asset inventory^1^Analyst^4/3',
      'Review file^v1 · 1 KB^Report^Review^Review assets 2026-11-01^1^Analyst^11/1/25',
      'Unnamed item reference^v1 · 1 KB^Report^Vendor^Acme^0^Analyst^11/2',
    ].join('\n')}}};
}
function convert(source, config=ctx) {
  const db={reviews:[],tasks:[],findings:[],evidence:[],vendors:[{client_id:'other',vendor_id:'other-v',name:'Acme'}]};
  const ids=appendApprovedV3Work(db,source,config);
  return {db,ids};
}

test('source work retains its schedule, occurrence, owner, finding and exact per-program support links',()=>{
  const {db,ids}=convert(fixture());
  const [review]=db.reviews, [finding]=db.findings, [task,riskTask]=db.tasks;
  expect(review).toMatchObject({review_id:ids.reviews.r1, current_occurrence_id:ids.occurrences['r1:occ:2'],
    owner_id:'a-user',due_date:'2026-11-30',status:'in_progress',recurrence:'monthly',next_review_date:'2026-12-31T00:00:00.000Z'});
  expect(reviewMapsTo(review,'cis-ig1','1.1')).toBe(true);
  expect(reviewMapsTo(review,'cis-ig1','8.8')).toBe(false);
  expect(reviewMapsTo(review,'soc-2','CC1.1')).toBe(false);
  expect(review.occurrences).toHaveLength(1);
  expect(review.occurrences[0]).toMatchObject({occurrence_id:ids.occurrences.h1, completed_at:'2026-11-01',
    completed_by:null,source_outcome:'No exceptions noted'});
  expect(finding).toMatchObject({finding_id:ids.findings.f1,status:'remediated',framework_assessment_id:'assessment-1'});
  expect(task).toMatchObject({status:'done',source_status:'Pending validation',priority:'high',finding_id:finding.finding_id,
    completed_by:null,assignee_id:'a-user',framework_assessment_id:'assessment-1'});
  expect(task.completed_at).toBeUndefined();
  expect(riskTask.risk_id).toBe(ctx.recordId('risks','a-risk-4'));
});

test('metadata-only evidence keeps recorded dates, references and versions without inventing file or tenant links',()=>{
  const {db,ids}=convert(fixture());
  const [assessment,occurrence,unresolved]=db.evidence;
  expect(assessment).toMatchObject({linked_type:'framework_assessments',linked_id:'assessment-1',version:3,
    evidence_date:'2026-04-03',source_file_metadata:'v3 · 84 KB',file_available:false});
  expect(occurrence).toMatchObject({linked_type:'reviews',linked_id:ids.reviews.r1,occurrence_id:ids.occurrences.h1,evidence_date:'2025-11-01'});
  expect(unresolved.source_subject_title).toBe('Acme');
  expect(unresolved.linked_id).toBeUndefined();
  for(const file of db.evidence){
    expect(file.content_base64).toBeUndefined();
    expect(file.sha256).toBeUndefined();
  }
});

test('conversion preserves a completed one-time review when the active slot disappears',()=>{
  const src=fixture();
  const before=convert(src);
  src.work.a.revs=[];
  src.work.a.hist=[{...history,cad:'1',occurrenceId:baseReview.occurrenceId,completedBy:'Analyst',
    evidence:[{name:'Retained reference'}],checklist:{steps:[{result:'Pass'}]}}];
  const after=convert(src);
  const [review]=after.db.reviews;
  expect(review).toMatchObject({review_id:before.ids.reviews.r1,current_occurrence_id:before.ids.occurrences['r1:occ:2'],
    status:'completed',recurrence:'none',completion_date:'2026-11-01'});
  expect(review.completion_snapshot).toMatchObject({completed_by:'a-user',source_checklist:{steps:[{result:'Pass'}]},
    source_evidence:[{name:'Retained reference'}]});
  expect(convert(src)).toEqual(after);
});

test('reloading native changes updates dates, closed actions, finding links and historical occurrences together',()=>{
  const src=fixture(),{db,ids}=convert(src);
  const [review]=db.reviews;
  const nextId='native-next-occurrence';
  db.users=[{user_id:'new-owner',name:'Reviewer'}];
  db.framework_assessments=[{client_id:tenant,framework_assessment_id:'assessment-1',definition_id:'1.1'}];
  review.occurrences.push({client_id:tenant,occurrence_id:review.current_occurrence_id,status:'completed',
    title:review.title,completed_at:'2026-11-30',due_date:'2026-11-30',completed_by_name:'Reviewer',outcome:'no_findings'});
  Object.assign(review,{owner_id:'new-owner',status:'upcoming',current_occurrence_id:nextId,due_date:'2026-12-31'});
  Object.assign(db.tasks[0],{status:'done',completed_at:'2026-12-03',assignee_id:'new-owner'});
  db.findings[0].status='closed';
  db.evidence.push({client_id:'other',evidence_id:'other-file',filename:'Other client document'});
  db.tasks.push({client_id:'other',task_id:'other-task',title:'Other client work'});
  const view=JSON.parse(JSON.stringify(src));
  view.work.a.revs[0].due={$date:baseReview.due};
  overlayApprovedV3Work(view,db,ctx);
  const work=view.work.a;
  expect(work.revs[0]).toMatchObject({id:'r1',nativeId:ids.reviews.r1,owner:'Reviewer',st:'Not started',
    due:{$date:'2026-12-31T00:00:00.000Z'},occurrenceId:nextId,occurrenceSequence:1});
  expect(work.hist).toHaveLength(2);
  expect(work.hist[1]).toMatchObject({reviewId:'r1',outcome:'No exceptions noted',completedBy:'Reviewer'});
  expect(work.findings[0]).toMatchObject({id:'f1',st:'Closed',actionIds:['t1'],fromItem:'1.1'});
  expect(work.done[0]).toMatchObject({id:'t1',findingId:'f1',st:'Completed',owner:'Reviewer'});
  expect(work.acts.map(a=>a.id)).toEqual(['t2']);
  expect(view.evidence.a.rows).not.toContain('Other client document');
  overlayApprovedV3Work(view,db,ctx);
  expect(work.hist).toHaveLength(2);
  expect(work.revs[0].occurrenceSequence).toBe(1);
  expect(work.done.map(a=>a.id)).toEqual(['t1']);
});

test('a partial native response cannot clear active work or overwrite another client',()=>{
  const src=fixture(),before=JSON.stringify(src);
  expect(()=>overlayApprovedV3Work(src,{reviews:[]},ctx)).toThrow('full native work register');
  expect(JSON.stringify(src)).toBe(before);
});

test('a moved calendar occurrence retains its recurrence anchor and a new client starts with empty work',()=>{
  const src=fixture();
  src.work.a.revs=[{...baseReview,cycleIndex:0,anchor:'2026-10-31',due:'2026-11-02'}];
  const [review]=convert(src).db.reviews;
  expect(review).toMatchObject({due_date:'2026-11-02',recurrence_due_date:'2026-10-31',next_review_date:'2026-11-30T00:00:00.000Z'});
  const blank={work:{a:{revs:[],hist:[],acts:[],done:[],ven:[]}}};
  const {db}=convert(blank);
  for(const table of ['reviews','tasks','findings','evidence']) expect(db[table]).toEqual([]);
});

test('a new client’s first scheduled date is usable by the live calendar and the real submitter survives reload',()=>{
  const src=fixture(),{db}=convert(src);
  const view={...src,work:{a:{revs:[],hist:[],acts:[],done:[],findings:[]}}};
  db.users=[{user_id:'a-user',name:'Analyst',email:'analyst@example.test'}];
  db.reviews[0].due_date='2026-11-30T00:00:00Z';
  Object.assign(db.tasks[0],{completed_by:'a-user',completed_at:'2026-11-02',submission_history:[{by:'a-user',at:'2026-11-02'}]});
  overlayApprovedV3Work(view,db,{...ctx,liveDates:true});
  expect(view.work.a.revs[0].due).toEqual(new Date(2026,10,30));
  expect(view.work.a.acts[0].workSubmittedBy).toMatchObject({id:'a-user',email:'analyst@example.test'});
  expect(view.work.a.acts[0].history.at(-1).detail.submittedBy.id).toBe('a-user');
});
