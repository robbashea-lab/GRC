import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewWorkflowContext,ReviewWorkflowOccurrence,ReviewWorkflowActivity,reviewActivityCategory} from './BrawndoReviewWorkflow';

const review={review_id:'r',client_id:'demo_brawndo',status:'upcoming',due_date:'2026-10-31',recurrence:'quarterly',owner_id:'assigned'};
test.each(['Brawndo','Synthetic Portfolio client','<Synthetic & QA>'])('workflow context renders the supplied client name as text: %s',clientName=>{
  const html=renderToStaticMarkup(<ReviewWorkflowContext record={review} clientName={clientName}/>);
  const container=document.createElement('div');container.innerHTML=html;
  expect(container.querySelector('.review-workflow-context > span').textContent).toBe(clientName);
  expect(container.querySelector('synthetic')).toBeNull();
  expect(container.textContent).toContain('Quarterly');
});
test.each([undefined,null,'','   ',42])('workflow context never invents a client name when the name is unavailable: %s',clientName=>{
  const html=renderToStaticMarkup(<ReviewWorkflowContext record={review} clientName={clientName}/>);
  const container=document.createElement('div');container.innerHTML=html;
  expect(container.querySelector('.review-workflow-context > span').textContent).toBe('Client not recorded');
  expect(container.textContent).not.toContain('Brawndo');
});
test('open occurrence keeps the actual last completer separate from its assigned reviewer',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowOccurrence record={review} users={[{user_id:'assigned',name:'Current reviewer'}]} history={[{completed_at:'2026-07-30',completed_by_name:'Actual completer'}]} writable onStart={()=>{}}/>);
  expect(html).toContain('Not started');expect(html).toContain('Actual completer');expect(html).not.toContain('Current reviewer');
  expect(html).toContain('Jan 31, 2027');expect(html).not.toContain('not_started');
});
test('missing history never borrows an assignee as a completed actor',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowOccurrence record={review} users={[{user_id:'assigned',name:'Current reviewer'}]}/>);
  expect(html).toContain('Not recorded');expect(html).not.toContain('Current reviewer');
});
test('overdue scheduling remains visible alongside the in-progress execution state',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowOccurrence record={{...review,status:'in_progress',due_date:'2000-01-01'}}/>);
  expect(html).toContain('Overdue and in progress');expect(html).toContain('aria-pressed="true"');
});
test('native scheduling rejection cannot expose Start merely because a due date exists',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowOccurrence record={{...review,status:'needs_scheduling',recurrence:'custom',custom_recurrence_days:0}} writable/>);
  expect(html).toContain('Needs Scheduling');expect(html).not.toContain('Review execution status');
});
test.each(['completed','cancelled','needs_scheduling'])('terminal or unscheduled %s remains explicit and has no start control',status=>{
  const html=renderToStaticMarkup(<ReviewWorkflowOccurrence record={{...review,status,due_date:status==='needs_scheduling'?null:review.due_date}}/>);
  expect(html).not.toContain('Review execution status');expect(html).not.toContain('onClick');
});
test('unknown native events remain visible in All without being fabricated into changes',()=>{
  expect(reviewActivityCategory({action:'unknown_native_event'})).toBe('other');
  const html=renderToStaticMarkup(<ReviewWorkflowActivity activity={[{audit_id:'actual',action:'unknown_native_event',at:'2026-10-19T12:00:00Z',user_name:'Real actor'}]}/>);
  expect(html).toContain('unknown_native_event');expect(html).toContain('Real actor');
});
test('activity grouping uses actual occurrence identity and retains unknown-source events',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'native-one',period:'Actual period'}]} activity={[
    {audit_id:'one',action:'Review started',meta:{occurrence_id:'native-one',period:'Unverified event label'}},
    {audit_id:'two',action:'Native event without occurrence'},
  ]}/>);
  expect(html).toContain('Actual period');expect(html).not.toContain('native-one');expect(html).not.toContain('Unverified event label');
  expect(html).toContain('Occurrence not recorded');expect(html).toContain('Native event without occurrence');
});

test.each([[0,'no findings','is-success'],[1,'1 finding recorded','is-critical'],[3,'3 findings recorded','is-critical']])('completion activity uses the actual native historical Finding count %s',(finding_count,label,tone)=>{
  const at='2026-10-19T16:10:00Z',history=[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'closed-occurrence',period:'Q3 2026',status:'completed',finding_count}];
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={history} activity={[{audit_id:'saved-completion',action:'Review completed',at,user_name:'Actual native actor',meta:{occurrence_id:'closed-occurrence',finding_count:99}}]}/>);
  const container=document.createElement('div');container.innerHTML=html;
  expect(html).toContain('Q3 2026');expect(container.querySelector('.review-workflow-event strong').textContent).toBe('Review completed');expect(html).toContain(label);
  expect(html).toContain(`review-workflow-event-icon ${tone}`);expect(html).not.toContain('99 findings');expect(html).not.toContain('closed-occurrence');expect(html).not.toContain('No issues');
  expect(html).toContain('Actual native actor');
  const local=new Date(at);expect(html).toContain(`${local.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ${local.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`);
});

test.each([undefined,null,'0',-1])('unknown or invalid historical count %s remains a neutral completion event',finding_count=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'old',period:'Q2 2026',finding_count}]} activity={[{audit_id:'actual',action:'Review completed',meta:{occurrence_id:'old',finding_count:0}}]}/>);
  expect(html).toContain('Q2 2026');expect(html).not.toContain('no findings');expect(html).not.toContain('is-success');expect(html).not.toContain('is-critical');
});

test.each([
  {client_id:'different-client',review_id:review.review_id},
  {client_id:review.client_id,review_id:'different-review'}
])('an occurrence ID collision cannot borrow another client/review period or outcome: %j',scope=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{...scope,occurrence_id:'collision',period:'Private foreign period',finding_count:0}]} activity={[{audit_id:'actual',action:'Review completed',meta:{occurrence_id:'collision'}}]}/>);
  expect(html).toContain('Review completed');expect(html).not.toContain('Private foreign period');expect(html).not.toContain('no findings');expect(html).not.toContain('is-success');
});

test('an explicitly foreign event cannot adopt a matching local occurrence outcome',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'same-id',period:'Local period',finding_count:0}]} activity={[{audit_id:'foreign',client_id:'other-client',action:'Review completed',meta:{occurrence_id:'same-id'}}]}/>);
  expect(html).not.toContain('Local period');expect(html).not.toContain('no findings');
});

test('mixed qualified and foreign/conflicting events sharing an occurrence ID stay in separate groups',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'shared-id',period:'Q3 2026',finding_count:0}]} activity={[
    {audit_id:'local',action:'Review completed',user_name:'Local actor',meta:{occurrence_id:'shared-id'}},
    {audit_id:'foreign',client_id:'foreign-client',action:'Review completed',user_name:'Foreign actor',meta:{occurrence_id:'shared-id'}},
    {audit_id:'conflict',action:'Review completed',user_name:'Conflicting actor',occurrence_id:'shared-id',meta:{occurrence_id:'different-id'}}
  ]}/>);
  const container=document.createElement('div');container.innerHTML=html;
  const groups=container.querySelectorAll('.review-workflow-event-group');expect(groups).toHaveLength(2);
  expect(groups[0].querySelector('h4').textContent).toBe('Q3 2026');expect(groups[0].textContent).toContain('Local actor');
  expect(groups[0].textContent).not.toContain('Foreign actor');expect(groups[0].textContent).not.toContain('Conflicting actor');expect(groups[0].textContent).not.toContain('shared-id');
  expect(groups[1].querySelector('h4').textContent).toBe('shared-id');expect(groups[1].textContent).toContain('Foreign actor');expect(groups[1].textContent).toContain('Conflicting actor');
  expect(groups[1].textContent).not.toContain('Q3 2026');expect(groups[1].textContent).not.toContain('no findings');expect(groups[1].querySelector('.is-success')).toBeNull();
});

test('an Action completion does not acquire its Review occurrence Finding outcome',()=>{
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={review} history={[{client_id:review.client_id,review_id:review.review_id,occurrence_id:'old',period:'Q3 2026',finding_count:0}]} activity={[{audit_id:'action',action:'Action Item completed',meta:{occurrence_id:'old',task_id:'native-task'}}]}/>);
  expect(html).toContain('Action Item completed');expect(html).toContain('native-task');expect(html).not.toContain('no findings');expect(html).not.toContain('is-success');
});

test.each([['native-current',true],['occ_'+review.review_id,false]])('current period joins exact native occurrence %s without borrowing a current aggregate Finding count',(id,explicit)=>{
  const current={...review,period:'Q4 2026',finding_count:0,...(explicit?{current_occurrence_id:id}:{})};
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={current} history={[]} activity={[
    {audit_id:'started',client_id:review.client_id,entity_id:review.review_id,entity_type:'reviews',action:'Review started',user_name:'Actual actor',meta:{occurrence_id:id}},
    {audit_id:'not-yet-joined',client_id:review.client_id,entity_id:review.review_id,entity_type:'reviews',action:'Review completed',meta:{occurrence_id:id,finding_count:0}}
  ]}/>);
  const container=document.createElement('div');container.innerHTML=html;
  expect(container.querySelector('.review-workflow-event-group h4').textContent).toBe('Q4 2026');
  expect(container.textContent).not.toContain(id);expect(container.textContent).toContain('Actual actor');
  expect(container.textContent).not.toContain('no findings');expect(container.querySelector('.is-success')).toBeNull();
});

test('explicitly foreign events cannot borrow the loaded current period through a colliding occurrence ID',()=>{
  const current={...review,current_occurrence_id:'current-collision',period:'Q4 2026'};
  const html=renderToStaticMarkup(<ReviewWorkflowActivity record={current} history={[]} activity={[
    {audit_id:'foreign',client_id:'other-client',entity_id:review.review_id,action:'Review started',meta:{occurrence_id:'current-collision'}}
  ]}/>);
  expect(html).not.toContain('Q4 2026');expect(html).toContain('current-collision');
});
