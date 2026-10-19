import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewWorkflowOccurrence,ReviewWorkflowActivity,reviewActivityCategory} from './BrawndoReviewWorkflow';

const review={review_id:'r',client_id:'demo_brawndo',status:'upcoming',due_date:'2026-10-31',recurrence:'quarterly',owner_id:'assigned'};
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
  const html=renderToStaticMarkup(<ReviewWorkflowActivity activity={[
    {audit_id:'one',action:'Review started',meta:{occurrence_id:'native-one',period:'Actual period'}},
    {audit_id:'two',action:'Native event without occurrence'},
  ]}/>);
  expect(html).toContain('Actual period');expect(html).toContain('native-one');
  expect(html).toContain('Occurrence not recorded');expect(html).toContain('Native event without occurrence');
});
