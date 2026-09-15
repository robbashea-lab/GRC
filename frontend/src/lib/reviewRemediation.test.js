import {reviewRemediation} from './remediation';

test('one Finding groups all current Actions, including completed work, without copying status',()=>{
  const finding={finding_id:'f',client_id:'a',status:'remediated'};
  const tasks=[{task_id:'t1',finding_id:'f',client_id:'a',status:'done'},{task_id:'t2',finding_id:'f',client_id:'a',status:'in_progress'},{task_id:'manual',client_id:'a',status:'open'}];
  const result=reviewRemediation({findings:[finding],tasks});
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0].finding).toBe(finding);
  expect(result.groups[0].actions).toEqual(tasks.slice(0,2));
  expect(result.groups[0].actions[0]).toBe(tasks[0]);
  expect(result.standaloneTasks).toEqual([tasks[2]]);
  tasks[1].status='done';
  expect(reviewRemediation({findings:[finding],tasks}).groups[0].actions.every(t=>t.status==='done')).toBe(true);
});

test('grouping requires explicit matching Finding and client IDs; closed history remains intact',()=>{
  const finding={finding_id:'f',client_id:'a',status:'closed',title:'Same title'};
  const tasks=[{task_id:'foreign',finding_id:'f',client_id:'b'},{task_id:'unlinked',client_id:'a',title:'Same title'}];
  expect(reviewRemediation({findings:[finding],tasks})).toEqual({groups:[{finding,actions:[]}],standaloneTasks:tasks});
  expect(reviewRemediation({})).toEqual({groups:[],standaloneTasks:[]});
});
