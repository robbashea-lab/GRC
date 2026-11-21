import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import GenericGuidedAssessor from './GenericGuidedAssessor';
import api from '@/lib/api';
import {genericGuidedVersion,genericQuestions} from '@/lib/genericGuidedAssessment';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser,workspaceMode:'demo'})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
let root,host;
const button=name=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
async function click(name){expect(button(name)).toBeTruthy();expect(button(name).disabled).toBe(false);await act(async()=>button(name).click());}
async function choose(name){const label=[...host.querySelectorAll('label')].find(node=>node.textContent.trim()===name);expect(label).toBeTruthy();await act(async()=>label.querySelector('input').click());}
async function text(value){const node=host.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{mockUser={user_id:'synthetic-guide-operator',role:'super_admin'};global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});
test('an unfamiliar client records unknowns in a checkpoint and Apply stages without saving an assessment',async()=>{
  const record={client_id:'unfamiliar-client',framework_key:'nist-csf-2',definition_id:'GV.OC-01',framework_assessment_id:'native-assessment'},onUpdateImplementation=jest.fn(()=>true),onDraftChange=jest.fn();
  const draft={version:'r4-guided-v1:nist-csf-2',answers:{},step:0,revision:0,base_assessment_token:null,base_scope_fingerprint:'a'.repeat(64)};
  api.get.mockResolvedValue({data:draft});
  api.put.mockImplementation(async(_path,body)=>({data:{...body,revision:body.expected_revision+1,generated_at:body.completed?'2026-11-19T00:00:00Z':null}}));
  await act(async()=>root.render(<GenericGuidedAssessor {...{record,onUpdateImplementation,onDraftChange}}/>));
  await click('Start guided assessment');await choose('Not sure');await click('Next');
  await text('The actual scoped practice needs confirmation.');
  await click('Minimize guide');expect(host.querySelector('textarea')).toBeNull();
  await click('Start guided assessment');expect(host.querySelector('textarea').value).toBe('The actual scoped practice needs confirmation.');
  await click('Save progress');
  expect(api.put.mock.calls[0][1].completed).toBe(false);expect(onUpdateImplementation).not.toHaveBeenCalled();
  await click('Next');for(let i=0;i<3;i++)await click('Next');
  await choose('Not sure');await click('Next');await choose('No');
  const beforeReview=api.put.mock.calls.length;await click('Review responses');
  expect(host.querySelector('[aria-label="Review responses"]')).toBeTruthy();expect(api.put).toHaveBeenCalledTimes(beforeReview);
  await click('Review implementation');
  expect(host.querySelector('[aria-label="Review implementation draft"]')).toBeTruthy();
  const completed=api.put.mock.calls.at(-1)[1];
  expect(completed.result.status).toBe('not_assessed');expect(completed.result.gaps).toEqual([]);
  expect(completed.result.unknowns.length).toBeGreaterThan(0);expect(api.patch).not.toHaveBeenCalled();
  await click('Apply draft');expect(onUpdateImplementation).toHaveBeenCalled();
  expect(onUpdateImplementation).toHaveBeenCalledWith(expect.any(String),'',expect.objectContaining({
    client_id:record.client_id,assessment_id:record.framework_assessment_id,actor_id:'synthetic-guide-operator',
    completed:true,version:draft.version,revision:expect.any(Number),generated_at:'2026-11-19T00:00:00Z',
    narrative:api.put.mock.calls.at(-1)[1].narrative,result:expect.objectContaining({status:'not_assessed'})}));
  expect(api.patch).not.toHaveBeenCalled();
});

const completedAnswers={practice:'Not sure',implementation:'SYNTHETIC implementation α',scope:'SYNTHETIC scoped team',
  operation:'SYNTHETIC recurring practice',evidence:'SYNTHETIC reported record',gap:'No',unknown:'No'};
function checkpointFixture(record,overrides={}){
  return {version:genericGuidedVersion(record.framework_key),answers:{...completedAnswers},step:0,revision:3,
    completed:true,base_assessment_token:null,base_scope_fingerprint:'b'.repeat(64),...overrides};
}
async function clickLabel(label){
  const node=host.querySelector(`[aria-label="${label}"]`);expect(node).toBeTruthy();expect(node.disabled).toBe(false);
  await act(async()=>node.click());
}

test('inline completed checkpoint opens response review and editing or pausing preserves every other answer without saving',async()=>{
  const record={client_id:'synthetic-client',framework_key:'hipaa',definition_id:'synthetic-addressable',framework_assessment_id:'synthetic-native'},
    onUpdateImplementation=jest.fn(),onInlineOpenChange=jest.fn(),onDraftChange=jest.fn();
  api.get.mockResolvedValue({data:checkpointFixture(record)});
  await act(async()=>root.render(<GenericGuidedAssessor inline {...{record,onUpdateImplementation,onInlineOpenChange,onDraftChange}}/>));
  await click('Resume guided assessment');
  const questions=genericQuestions(completedAnswers),review=host.querySelector('[aria-label="Review responses"]');
  expect(review).toBeTruthy();expect(review.querySelectorAll('ol li')).toHaveLength(questions.length);
  for(const question of questions)expect(review.textContent).toContain(completedAnswers[question.id]||'Not recorded');
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  const implementationIndex=questions.findIndex(question=>question.id==='implementation');expect(implementationIndex).toBeGreaterThanOrEqual(0);
  await clickLabel(`Edit response ${implementationIndex+1}`);await text('SYNTHETIC revised implementation β');
  await click('Pause & return');expect(document.activeElement).toBe(button('Resume guided assessment'));
  expect(onInlineOpenChange).toHaveBeenLastCalledWith(false);expect(api.put).not.toHaveBeenCalled();
  await click('Resume guided assessment');expect(host.querySelector('textarea').value).toBe('SYNTHETIC revised implementation β');
  for(let index=implementationIndex;index<questions.length-1;index++)await click('Continue');
  await click('Review responses');
  const revised=host.querySelector('[aria-label="Review responses"]');expect(revised.textContent).toContain('SYNTHETIC revised implementation β');
  for(const question of questions.filter(item=>item.id!=='implementation'))expect(revised.textContent).toContain(completedAnswers[question.id]||'Not recorded');
  expect(onUpdateImplementation).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('response review retains native required-answer validation and a withdrawn write permission blocks checkpoint commands',async()=>{
  const record={client_id:'synthetic-client',framework_key:'cmmc',definition_id:'synthetic-requirement',framework_assessment_id:'synthetic-native'},
    answers={...completedAnswers},onUpdateImplementation=jest.fn();
  delete answers.practice; // A missing required answer differs from an invalid saved choice.
  api.get.mockResolvedValue({data:checkpointFixture(record,{answers,completed:false,step:genericQuestions(answers).length-1})});
  await act(async()=>root.render(<GenericGuidedAssessor inline {...{record,onUpdateImplementation}}/>));
  await click('Resume guided assessment');await click('Review responses');
  expect(host.querySelector('[role="alert"]').textContent).toContain('Record each required answer');
  expect(host.querySelector('[aria-label="Review responses"]')).toBeNull();expect(api.put).not.toHaveBeenCalled();
  await act(async()=>root.render(<GenericGuidedAssessor inline disabled {...{record,onUpdateImplementation}}/>));
  expect(button('Save progress').disabled).toBe(true);expect(button('Review responses').disabled).toBe(true);
  await act(async()=>{button('Save progress').click();button('Review responses').click();});
  expect(api.put).not.toHaveBeenCalled();expect(onUpdateImplementation).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

function HistoryHarness({record,onHistoryClose,...props}){
  const [open,setOpen]=React.useState(false),trigger=React.useRef(null);
  return <><button ref={trigger} onClick={()=>setOpen(true)}>Show history</button><GenericGuidedAssessor inline record={record} {...props}
    interviewHistoryOpen={open} onInterviewHistoryOpenChange={setOpen}
    onInterviewHistoryCloseAutoFocus={event=>{onHistoryClose?.(event);event.preventDefault();trigger.current?.focus();}}/></>;
}
const historyRecord=(framework='hipaa')=>({client_id:'synthetic-history-client',framework_key:framework,definition_id:'synthetic-native-definition',framework_assessment_id:'synthetic-history-assessment'});
const historySnapshot=(record,revision,overrides={})=>({client_id:record.client_id,assessment_id:record.framework_assessment_id,user_id:mockUser.user_id,
  revision,version:genericGuidedVersion(record.framework_key),completed:true,updated_at:'2026-11-20T00:00:00Z',answers:{practice:'Not sure'},
  narrative:'SYNTHETIC saved personal revision '+revision,...overrides});
const historyPage=(items,more=false)=>({items,has_more:more,next_before_revision:more?items.at(-1).revision:null});
const historyRequests=()=>api.get.mock.calls.filter(([path])=>path.endsWith('/history'));
const historyWindow=()=>document.querySelector('[role="dialog"]');
async function renderHistory(record,props={}){await act(async()=>root.render(<HistoryHarness record={record} {...props}/>));}
async function historyClick(name){const node=[...historyWindow().querySelectorAll('button')].find(item=>item.textContent.trim()===name);expect(node).toBeTruthy();expect(node.disabled).toBe(false);await act(async()=>node.click());}
const heldHistory=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('personal history paginates and retries without saving or disturbing unsaved interview answers',async()=>{
  const record=historyRecord(),first=historySnapshot(record,3),earlier=historySnapshot(record,2,{version:'SYNTHETIC retained older question set',result:null}),
    onDraftChange=jest.fn(),onHistoryClose=jest.fn();let reads=0;
  api.get.mockImplementation(async path=>{
    if(!path.endsWith('/history'))return {data:checkpointFixture(record,{completed:false,revision:0,step:1,answers:{practice:'Not sure'}})};
    reads++;if(reads===1)return {data:historyPage([first],true)};
    if(reads===2)throw new Error('SYNTHETIC earlier page unavailable');return {data:historyPage([earlier])};
  });
  await renderHistory(record,{onDraftChange,onHistoryClose});await click('Begin guided assessment');await text('SYNTHETIC unsaved personal wording λ');
  const draftCalls=onDraftChange.mock.calls.length;expect(historyRequests()).toHaveLength(0);
  await click('Show history');expect(historyWindow().textContent).toContain(first.narrative);
  expect(historyRequests()[0][0]).toBe('/framework_assessments/'+record.framework_assessment_id+'/guided-assessment/history');
  expect(historyRequests()[0][1].params).toEqual({limit:25});
  await historyClick('Load earlier interviews');expect(historyWindow().textContent).toContain('SYNTHETIC earlier page unavailable');
  expect(historyWindow().textContent).toContain(first.narrative);
  await historyClick('Retry');expect(historyWindow().textContent).toContain(earlier.narrative);
  expect(historyWindow().textContent).toContain('SYNTHETIC retained older question set');
  expect(historyRequests().slice(1).map(([,options])=>options.params)).toEqual([{limit:25,before_revision:3},{limit:25,before_revision:3}]);
  expect(historyWindow().querySelectorAll('details')).toHaveLength(2);
  await historyClick('Close');
  // Native Radix FocusScope dispatches unmount autofocus on the next timer turn.
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  expect(onHistoryClose).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(button('Show history'));
  expect(host.querySelector('textarea').value).toBe('SYNTHETIC unsaved personal wording λ');expect(onDraftChange).toHaveBeenCalledTimes(draftCalls);
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('a failed first history read is distinct from a verified empty available-history result',async()=>{
  const record=historyRecord('nist-csf-2');let reads=0;
  api.get.mockImplementation(async path=>{
    if(!path.endsWith('/history'))return {data:checkpointFixture(record)};
    if(++reads===1)throw new Error('SYNTHETIC history read denied');return {data:historyPage([])};
  });
  await renderHistory(record);await click('Show history');expect(historyWindow().querySelector('[role="alert"]').textContent).toContain('SYNTHETIC history read denied');
  expect(historyWindow().textContent).not.toContain('No available archived interview snapshots.');
  await historyClick('Retry');expect(historyWindow().textContent).toContain('No available archived interview snapshots. This does not establish that no older interview ever existed.');
  expect(historyWindow().querySelector('[role="alert"]')).toBeNull();expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test.each(['user_id','client_id','assessment_id'])('history refuses a response with a different %s without exposing its contents',async field=>{
  const record=historyRecord(),foreign=historySnapshot(record,4,{[field]:'SYNTHETIC different scope',narrative:'SYNTHETIC foreign private content'});
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?historyPage([foreign]):checkpointFixture(record)}));
  await renderHistory(record);await click('Show history');
  expect(historyWindow().querySelector('[role="alert"]').textContent).toContain('Interview history could not be verified');
  expect(historyWindow().textContent).not.toContain(foreign.narrative);expect(historyWindow().querySelectorAll('details')).toHaveLength(0);
  expect(historyRequests()[0][1].params).toEqual({limit:25});expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});

test('actor A to B to A fences cached rows and late page/error receipts while the fresh A read is pending',async()=>{
  const record=historyRecord('cmmc'),actorA={...mockUser},first=historySnapshot(record,3,{narrative:'SYNTHETIC old A first page'}),
    stale=historySnapshot(record,2,{narrative:'SYNTHETIC late old A page'}),oldPage=heldHistory(),actorB=heldHistory(),freshA=heldHistory();let reads=0;
  api.get.mockImplementation(async path=>{
    if(!path.endsWith('/history'))return {data:checkpointFixture(record)};
    reads++;if(reads===1)return {data:historyPage([first],true)};if(reads===2)return oldPage.promise;if(reads===3)return actorB.promise;return freshA.promise;
  });
  try{
    await renderHistory(record);await click('Show history');await historyClick('Load earlier interviews');
    mockUser={...mockUser,user_id:'SYNTHETIC actor B'};await renderHistory(record);
    expect(historyWindow().textContent).not.toContain(first.narrative);
    mockUser=actorA;await renderHistory(record);expect(historyWindow().textContent).not.toContain(first.narrative);
    await act(async()=>{oldPage.resolve({data:historyPage([stale])});actorB.reject(new Error('SYNTHETIC retired B error'));await Promise.allSettled([oldPage.promise,actorB.promise]);});
    expect(historyWindow().textContent).toContain('Loading interview history…');expect(historyWindow().querySelector('[role="alert"]')).toBeNull();
    expect(historyWindow().textContent).not.toContain(stale.narrative);
    const current=historySnapshot(record,5,{narrative:'SYNTHETIC current A history'});
    await act(async()=>{freshA.resolve({data:historyPage([current])});await freshA.promise;});
    expect(historyWindow().textContent).toContain(current.narrative);expect(historyWindow().textContent).not.toContain(first.narrative);
    expect(historyRequests()).toHaveLength(4);expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{oldPage.resolve({data:historyPage([])});actorB.resolve({data:historyPage([])});freshA.resolve({data:historyPage([])});await act(async()=>{await Promise.allSettled([oldPage.promise,actorB.promise,freshA.promise]);});}
});

test('closing and reopening history fences the former read even for the same actor and assessment',async()=>{
  const record=historyRecord(),former=heldHistory(),current=historySnapshot(record,7);let reads=0;
  api.get.mockImplementation(async path=>{
    if(!path.endsWith('/history'))return {data:checkpointFixture(record)};
    return ++reads===1?former.promise:{data:historyPage([current])};
  });
  try{
    await renderHistory(record);await click('Show history');expect(historyWindow().textContent).toContain('Loading interview history…');
    await historyClick('Close');await click('Show history');expect(historyWindow().textContent).toContain(current.narrative);
    await act(async()=>{former.reject(new Error('SYNTHETIC closed read failure'));await Promise.allSettled([former.promise]);});
    expect(historyWindow().textContent).toContain(current.narrative);expect(historyWindow().querySelector('[role="alert"]')).toBeNull();
    expect(historyRequests()).toHaveLength(2);expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
  }finally{former.resolve({data:historyPage([])});await act(async()=>{await Promise.allSettled([former.promise]);});}
});

test('a read-only operator can inspect their personal history without gaining an interview or native save command',async()=>{
  const record=historyRecord('nist-csf-2');mockUser={...mockUser,role:'client_readonly'};
  api.get.mockImplementation(async path=>({data:path.endsWith('/history')?historyPage([historySnapshot(record,2)]):checkpointFixture(record)}));
  await renderHistory(record,{disabled:true});expect(button('Resume guided assessment').disabled).toBe(true);
  await click('Show history');expect(historyWindow().querySelectorAll('details')).toHaveLength(1);
  expect(historyWindow().textContent).not.toContain('Apply draft');expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();
});
