import {vendorOutstandingWork, vendorWorkUnits} from './vendorOutstandingWork';

const now = new Date(2026, 9, 25, 12);
const vendor = {client_id: 'c1', vendor_id: 'v1', name: 'Saved vendor', status: 'active', next_review: '2026-11-04',
  contract_renewal: '2026-11-05', contract_notice_deadline: '2026-10-20',
  assurance_records: [{assurance_id: 'a1', type: 'SOC 2', review_status: 'received', next_follow_up: '2026-11-04'}]};
const review = {client_id: 'c1', vendor_id: 'v1', review_id: 'r1', current_occurrence_id: 'o1', status: 'upcoming', vendor_purpose: 'vendor', due_date: '2026-11-04'};
const task = {client_id: 'c1', vendor_id: 'v1', source_type: 'vendor', source_id: 'v1', assurance_id: 'a1', task_id: 't1', status: 'open', due_date: '2026-11-04'};

test('same-day independent lifecycles count separately; mirrored records deduplicate by exact identity', () => {
  const before = JSON.stringify({vendor, review, task});
  const result = vendorOutstandingWork([vendor], [review, {...review}], [task, {...task}], now);
  expect(result.due30.map(event => event.id).sort()).toEqual(['assurance:c1:v1:a1', 'review:c1:r1:o1', 'task:c1:t1']);
  expect(vendorWorkUnits(result.due30)).toBe('3 items · 1 vendor');
  expect(result.overdue).toHaveLength(0);
  expect(result.events.filter(event => !event.outstanding).map(event => event.label)).toEqual(['Notice deadline', 'Contract renewal']);
  expect(JSON.stringify({vendor, review, task})).toBe(before);
});

test('completing a task or Review does not receive assurance or revive a closed primary schedule', () => {
  const result = vendorOutstandingWork([vendor], [{...review, status: 'completed'}], [{...task, status: 'done'}], now);
  expect(result.outstanding.map(event => event.id)).toEqual(['assurance:c1:v1:a1']);
  expect(result.outstanding[0].document.review_status).toBe('received');
  expect(result.events.some(event => event.id.endsWith(':review'))).toBe(false);
});

test('unrequesting a type does not hide its follow-up; historical document tasks retain exact native source', () => {
  const unrequested = {...vendor, assurance_records: [{...vendor.assurance_records[0], required: false}]};
  expect(vendorOutstandingWork([unrequested], [review], [], now).due30).toHaveLength(2);
  const historical = {...vendor, assurance_records: [{...vendor.assurance_records[0], superseded_by: 'a2'}]};
  const result = vendorOutstandingWork([historical], [], [task], now);
  expect(result.outstanding.find(event => event.task)?.document.assurance_id).toBe('a1');
  expect(result.events.some(event => event.id.startsWith('assurance:'))).toBe(false);
});

test('today/+30 inclusive, +31 and invalid dates excluded; foreign/terminal work never leaks', () => {
  const tasks = [
    {...task, task_id: 'today', due_date: '2026-10-25'}, {...task, task_id: 'plus30', due_date: '2026-11-24'},
    {...task, task_id: 'plus31', due_date: '2026-11-25'}, {...task, task_id: 'invalid', due_date: '2026-02-30'},
    {...task, task_id: 'foreign', client_id: 'other'}, {...task, task_id: 'closed', status: 'cancelled'},
  ];
  const result = vendorOutstandingWork([{...vendor, next_review: null, assurance_records: []}], [], tasks, now);
  expect(result.due30.map(event => event.task.task_id)).toEqual(['today', 'plus30']);
  expect(result.events.filter(event => event.task).map(event => event.task.task_id)).toEqual(['today', 'plus30', 'plus31']);
  expect(result.due30.every(event => event.kind === 'other')).toBe(true);
  expect(vendorOutstandingWork([{...vendor, status: 'inactive'}], [review], [task], now).events).toEqual([]);
});

test('contract Review due date is an outstanding native obligation; raw legal dates remain informational', () => {
  const contract = {...review, vendor_purpose: 'contract', due_date: '2026-10-24'};
  const result = vendorOutstandingWork([vendor], [contract], [], now);
  expect(result.overdue).toHaveLength(1);
  expect(result.overdue[0]).toMatchObject({kind: 'ren', label: 'Contract review', review: contract});
  expect(result.events.filter(event => !event.outstanding)).toHaveLength(2);
});
