import {applyWorkChanges,nativeReviewCompletion} from './workCommands';

const oldReview={id:'r1',nativeOccurrenceId:'occ-1',occurrenceId:'raw-1',st:'Not started',revision:2,
  title:'Asset review',owner:'One',cad:'M',due:{$date:'2026-11-02T08:00:00.000Z'}};
const review={review_id:'native-r',source_record_id:'r1',client_id:'c',current_occurrence_id:'occ-1',updated_at:'v1',status:'upcoming'};
const task={task_id:'native-t',source_record_id:'t1',client_id:'c',updated_at:'t1',finding_id:'native-f'};
const finding={finding_id:'native-f',source_record_id:'f1',client_id:'c',updated_at:'f1',status:'remediated'};
const guide={occurrence_id:'occ-1',contract_token:'a'.repeat(64),expected_updated_at:'v1',
  steps:[{step_id:'inventory',text:'Review the inventory.'}]};
const details={outcome:'Exceptions noted',supportingReference:'Completed review ticket 94',
  checklist:{steps:[{t:'Review the inventory.',result:'Exception',note:'Unassigned server'}]}};
const clone=x=>JSON.parse(JSON.stringify(x));
function input() {
  const before={work:{s:{revs:[clone(oldReview)],hist:[],acts:[{id:'t1',kind:'act',st:'Pending validation',owner:'One',revision:1,findingId:'f1'}],
    done:[],findings:[{id:'f1',actionIds:['t1'],st:'Pending validation'}]}},files:[]};
  return {before,after:clone(before),clientId:'c',sourceId:'s',records:{clients:[],users:[{user_id:'u',name:'One'}],
    reviews:[clone(review)],tasks:[clone(task)],findings:[clone(finding)],evidence:[],framework_assessments:[]},
    api:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},commands:[],pendingRequests:new Map(),identityMaps:{}};
}

test('calendar moves update the selected native occurrence and carry its original revision',async()=>{
  const args=input();
  args.commands=[{name:'rescheduleReview',args:['s','r1','2026-12-02',{calendarMove:true}]}];
  args.after.work.s.revs[0].due={$date:'2026-12-02'};
  args.api.patch.mockResolvedValue({data:{...review,updated_at:'v2'}});
  const result=await applyWorkChanges(args);
  expect(args.api.patch).toHaveBeenCalledTimes(1);
  expect(args.api.patch).toHaveBeenCalledWith('/reviews/native-r',{due_date:'2026-12-02',calendar_move:true,
    expected_occurrence_id:'occ-1',expected_updated_at:'v1'},expect.any(Object));
  expect(result.handled.reviews).toEqual(expect.arrayContaining(['r1','native-r']));
  args.handled={reviews:['r1']};
  await applyWorkChanges(args);
  expect(args.api.patch).toHaveBeenCalledTimes(1);
});

test('completion submits the current server checklist and retries an uncertain response verbatim',async()=>{
  const args=input();
  args.commands=[{name:'completeReview',args:['s','r1',details]}];
  args.api.get.mockResolvedValue({data:guide});
  args.api.post.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({data:{review:{...review,status:'upcoming',current_occurrence_id:'occ-2'}}});
  await expect(applyWorkChanges(args)).rejects.toThrow('response lost');
  args.records.reviews[0].current_occurrence_id='occ-2';
  await applyWorkChanges(args);
  expect(args.api.get).toHaveBeenCalledTimes(1);
  expect(args.api.post).toHaveBeenCalledTimes(2);
  expect(args.api.post.mock.calls[1]).toEqual(args.api.post.mock.calls[0]);
  expect(args.api.post.mock.calls[0]).toEqual(['/reviews/native-r/complete',{outcome:'Exceptions noted',
    occurrence_id:'occ-1',expected_updated_at:'v1',completion_notes:'',supporting_reference:'Completed review ticket 94',
    checklist:{contract_token:guide.contract_token,results:[{step_id:'inventory',result:'Exception',reason:'Unassigned server'}]}},expect.any(Object)]);
});

test('missing, ambiguous, or unexplained checklist results never become default passes',()=>{
  expect(()=>nativeReviewCompletion(guide,{...details,checklist:{steps:[]}},'occ-1')).toThrow('current native checklist');
  expect(()=>nativeReviewCompletion(guide,{...details,checklist:{steps:[...details.checklist.steps,...details.checklist.steps]}},'occ-1')).toThrow('current native checklist');
  expect(()=>nativeReviewCompletion(guide,{...details,checklist:{steps:[{t:'Review the inventory.',result:'Exception'}]}},'occ-1')).toThrow('explanation');
  expect(()=>nativeReviewCompletion(guide,details,'different')).toThrow('occurrence changed');
});

test.each(['Low','Medium','High','Critical'])('an assessment finding preserves %s priority and the primary action identity returned by the native workflow',async priority=>{
  const args=input();
  args.records.framework_assessments=[{client_id:'c',framework_assessment_id:'b-1.1',definition_id:'1.1',framework_key:'cis-ig1'},
    {client_id:'other',framework_assessment_id:'other-1.1',definition_id:'1.1',framework_key:'cis-ig1'}];
  args.after.work.s.findings.push({id:'new-f',title:'Inventory missing',actionIds:['new-t'],fromItem:'1.1',fromProgram:'cis:8.1'});
  args.after.work.s.acts.push({id:'new-t',findingId:'new-f',title:'Collect inventory',owner:'One',pri:priority,st:'Open',due:'2026-12-01'});
  args.api.post.mockResolvedValue({data:{client_id:'c',finding_id:'saved-f',primary_task_id:'saved-t'}});
  const {identityMaps,handled}=await applyWorkChanges(args);
  expect(args.api.post).toHaveBeenCalledTimes(1);
  expect(args.api.post.mock.calls[0][0]).toBe('/framework_assessments/b-1.1/findings');
  expect(args.api.post.mock.calls[0][1]).toMatchObject({title:'Inventory missing',remediation_title:'Collect inventory',
    due_date:'2026-12-01',owner_id:'u',severity:priority.toLowerCase(),request_id:expect.any(String)});
  expect(identityMaps.recordIds.c.findings['new-f']).toBe('saved-f');
  expect(identityMaps.recordIds.c.tasks['new-t']).toBe('saved-t');
  args.handled=handled;await applyWorkChanges(args);
  expect(args.api.post).toHaveBeenCalledTimes(1);
  expect(identityMaps.recordIds.c.tasks['new-t']).toBe('saved-t');
});

test('independent validation uses native authentication and never records another named validator',async()=>{
  const args=input();
  args.commands=[{name:'validateFinding',args:['s','t1',{result:'Validated',validator:'Reviewer',rationale:'Retest passed.'}]}];
  args.api.get.mockResolvedValue({data:{name:'Operator',user_id:'operator'}});
  await expect(applyWorkChanges(args)).rejects.toThrow('selected validator must sign in');
  expect(args.api.post).not.toHaveBeenCalled();
  args.api.get.mockResolvedValue({data:{name:'Reviewer',user_id:'validator'}});
  args.api.post.mockResolvedValue({data:{...finding,status:'closed'}});
  await applyWorkChanges(args);
  expect(args.api.post.mock.calls[0][0]).toBe('/findings/native-f/validate');
  expect(args.api.post.mock.calls[0][1]).toMatchObject({rationale:'Retest passed.',expected_updated_at:'f1'});
  expect(args.api.patch).not.toHaveBeenCalled();
});

test('new evidence requires the selected file and is attached to the scoped review occurrence',async()=>{
  const args=input();
  args.after.files.push({id:'new-file',clientId:'s',kind:'Review',recordId:'r1',occurrenceId:'raw-1',name:'support.txt'});
  await expect(applyWorkChanges(args)).rejects.toThrow('Select the actual file');
  expect(args.api.post).not.toHaveBeenCalled();
  args.files=new Map([['support.txt',new File(['sample'],'support.txt',{type:'text/plain'})]]);
  args.api.post.mockResolvedValue({data:{client_id:'c',evidence_id:'file-id'}});
  await applyWorkChanges(args);
  expect(args.api.post).toHaveBeenCalledWith('/evidence',expect.objectContaining({client_id:'c',linked_id:'native-r',
    occurrence_id:'occ-1',filename:'support.txt',content_base64:'data:text/plain;base64,c2FtcGxl'}),expect.any(Object));
});

test('manual Reviews use the native series and existing records display its saved description',async()=>{
  const args=input();
  args.after.work.s.revs.push({id:'new',title:'Board review',description:'Review board papers.',cad:'1',due:'2027-01-05',type:'Access',owner:'One'});
  args.api.post.mockResolvedValue({data:{review_id:'new-id',client_id:'c'}});
  await applyWorkChanges(args);
  expect(args.api.post).toHaveBeenCalledWith('/reviews',expect.objectContaining({title:'Board review',scope:'Review board papers.',
    owner_id:'u',review_type:'access',recurrence:'none'}),expect.any(Object));
});

test('creating work from an assessment confirmation preserves the native item relationship and revision',async()=>{
  const args=input();
  args.records.framework_assessments=[{client_id:'c',framework_assessment_id:'aid',definition_id:'1.1',framework_key:'cis-ig1',
    items_revision:4,items_to_address:[{item_id:'iid',request_id:'approved_v3_item_src-item'}]}];
  args.after.work.s.acts.push({id:'new-t',title:'Confirm inventory',detail:'Ask owner',source:'Items to address',owner:'One',st:'Open',
    fromItem:'1.1',fromProgram:'cis:8.1',due:'2026-12-03'});
  args.after.ita={'s|cis:8.1|1.1':[{id:'src-item',act:'new-t'}]};
  args.api.post.mockResolvedValue({data:{client_id:'c',task_id:'native-new'}});
  await applyWorkChanges(args);
  expect(args.api.post).toHaveBeenCalledWith('/framework_assessments/aid/items/iid/task',
    expect.objectContaining({title:'Confirm inventory',expected_revision:4,description:'Ask owner'}),expect.any(Object));
  expect(args.api.post).toHaveBeenCalledTimes(1);
  expect(args.after.ita['s|cis:8.1|1.1'][0].act).toBe('native-new');
});

test('checklist progress is written against the native guide revision and can be continued after reload',async()=>{
  const args=input(),key='s|r1|raw-1';
  args.after.checklists={[key]:{st:{0:'Pass'},note:{},steps:[{step_id:'inventory'}],nativeContractToken:guide.contract_token,nativeGuideRevision:'v1'}};
  args.api.get.mockResolvedValue({data:guide});
  args.api.put=jest.fn().mockResolvedValue({data:{...guide,expected_updated_at:'v2'}});
  await applyWorkChanges(args);
  expect(args.api.put).toHaveBeenCalledWith('/reviews/native-r/completion-guide',{occurrence_id:'occ-1',expected_updated_at:'v1',
    checklist:{contract_token:guide.contract_token,results:[{step_id:'inventory',result:'Pass',reason:''}]},supporting_reference:''},expect.any(Object));
  expect(args.after.checklists[key].nativeGuideRevision).toBe('v2');
});

test('a cycle ticket saves against the same occurrence and keeps its checklist after a recurring ticket save',async()=>{
  const args=input(),key='s|r1|raw-1';
  const results=[{step_id:'inventory',result:'N/A',reason:'Test record has no devices.'}];
  args.before.checklists={[key]:{st:{0:'N/A'},note:{0:results[0].reason},steps:[{step_id:'inventory'}],
    nativeContractToken:guide.contract_token,nativeGuideRevision:'v1'}};
  args.after.checklists={[key]:{...args.before.checklists[key],occ:'836502'}};
  args.handled={reviews:['r1']};
  args.reviewSetupVersions=new Map([['native-r','v2']]);
  Object.assign(args.records.reviews[0],{activity_setup:{recurring_ticket_number:'836501'},
    r4_current_checklist:{occurrence_id:'occ-1',results,supporting_reference:''}});
  const current={...guide,expected_updated_at:'v2',results,cycle_ticket_number:''};
  args.api.get.mockResolvedValueOnce({data:{...current,cycle_ticket_number:'other saved ticket'}}).mockResolvedValue({data:current});
  args.api.put=jest.fn().mockResolvedValue({data:{...current,expected_updated_at:'v3',cycle_ticket_number:'836502'}});
  await expect(applyWorkChanges(args)).rejects.toThrow('The saved checklist changed');
  expect(args.api.put).not.toHaveBeenCalled();
  await applyWorkChanges(args);
  expect(args.api.put).toHaveBeenCalledWith('/reviews/native-r/completion-guide',{occurrence_id:'occ-1',expected_updated_at:'v2',
    checklist:{contract_token:guide.contract_token,results},supporting_reference:'',cycle_ticket_number:'836502'},expect.any(Object));
  expect(args.after.checklists[key].nativeGuideRevision).toBe('v3');
});

test('a schedule form persists its other changed fields with the new date',async()=>{
  const args=input();
  args.commands=[{name:'rescheduleReview',args:['s','r1','2026-12-08',{expectedRevision:2}]}];
  Object.assign(args.after.work.s.revs[0],{owner:'Unassigned',cad:'Q',due:'2026-12-08',description:'Revised scope'});
  args.api.patch.mockResolvedValue({data:{...review,updated_at:'v2'}});
  await applyWorkChanges(args);
  expect(args.api.patch).toHaveBeenCalledTimes(1);
  expect(args.api.patch.mock.calls[0][1]).toMatchObject({due_date:'2026-12-08',scope:'Revised scope',recurrence:'quarterly',owner_id:null});
});

test('register assessment and next date are saved in the same risk review completion',async()=>{
  const args=input();args.records.reviews[0].risk_id='native-risk';
  const assessment={outcome:'Risk review recorded',assessment:{L:2,I:3,note:'Annual review.'},notes:'Annual review.',
    checklist:{steps:[{t:'Review the inventory.',result:'Pass'}]},supportingReference:'Ticket result 52.'};
  args.commands=[{name:'completeReview',args:['s','r1',assessment]},{name:'rescheduleReview',args:['s','r1','2027-12-05',{}]}];
  args.api.get.mockResolvedValue({data:guide});
  args.api.post.mockResolvedValue({data:{review:{...review,current_occurrence_id:'occ-2',risk_id:'native-risk'}}});
  await applyWorkChanges(args);
  expect(args.api.post.mock.calls[0][1]).toMatchObject({outcome:'No exceptions noted',risk_next_review:'2027-12-05',
    risk_assessment:{likelihood_score:2,impact_score:3,assessment_rationale:'Annual review.'}});
  expect(args.api.patch).not.toHaveBeenCalled();
});

test('library framework upload resolves the selected requirement and preserves the file type',async()=>{
  const args=input();
  args.records.framework_assessments=[{framework_assessment_id:'aid',framework_key:'cis-ig1',definition_id:'1.1',client_id:'c'}];
  args.after.itemExtra={'s|cis:8.1|1.1':[{id:'e1',name:'proof.txt'}]};
  args.after.evidence={s:{rows:'proof.txt^v1 · new^Export^Framework requirement^1.1^0^One^12/2^framework-projection^e1'}};
  args.files=new Map([['proof.txt',new File(['abc'],'proof.txt',{type:'text/plain'})]]);
  args.api.post.mockResolvedValue({data:{evidence_id:'stored',client_id:'c'}});
  await applyWorkChanges(args);
  expect(args.api.post.mock.calls[0][1]).toMatchObject({linked_type:'framework_assessments',linked_id:'aid',
    filename:'proof.txt',evidence_type:'Export',content_base64:'data:text/plain;base64,YWJj'});
});
