import axios from 'axios';
import {previewAdapter} from './adapter';
import {aggregateClientDashboard} from '../lib/clientDashboard';
import {dashboardPosture} from '../lib/dashboardPosture';
import {validateFrameworkConfig} from './frameworks';

const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test('framework cadence configuration rejects impossible dates instead of rolling them forward',()=>{
  const config=due_date=>({framework_reviews:{'account-authorization':{due_date,recurrence:'annual'}}});
  for(const date of ['2027-02-29','2028-02-30','2028-04-31','2028-13-01'])
    expect(()=>validateFrameworkConfig(config(date))).toThrow('Invalid Review date');
  expect(()=>validateFrameworkConfig(config('2028-02-29'))).not.toThrow();
});

test.each([['monthly',1],['quarterly',3],['semiannual',6],['annual',12]])(
  '%s remains stable over 36 months with immutable history and exact Calendar entries',async(cadence,step)=>{
    const {data:client}=await api.post('/clients',{name:'Multi-year QA'});
    let {data:review}=await api.post('/reviews',{client_id:client.client_id,title:cadence,review_type:'access',recurrence:cadence,due_date:'2027-01-31'});
    const frozen=[];
    for(let elapsed=0;elapsed<36;elapsed+=step){
      const year=2027+Math.floor(elapsed/12),month=elapsed%12;
      const expected=new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);
      expect(review.due_date.slice(0,10)).toBe(expected);
      const occurrence_id=review.current_occurrence_id;
      const {data:result}=await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id,completion_notes:`Period ${elapsed}`});
      frozen.push(JSON.parse(JSON.stringify(result.occurrence)));review=result.review;
      expect(review.occurrences).toEqual(frozen);
      const {data:retry}=await api.post(`/reviews/${review.review_id}/complete`,{occurrence_id});
      expect(retry.review.occurrences).toEqual(frozen);
      expect(retry.review.current_occurrence_id).toBe(review.current_occurrence_id);
      const {data:calendar}=await api.get('/calendar',{params:{client_id:client.client_id,start:expected,end:review.due_date.slice(0,10),scope:'all'}});
      const entries=Object.values(calendar.reviews).flat();
      expect(entries).toHaveLength(2);expect(new Set(entries.map(e=>e.key)).size).toBe(2);
      expect(entries.filter(e=>!e.historical)).toHaveLength(1);
    }
    expect(review.due_date.slice(0,10)).toBe('2030-01-31');
    expect(new Set(frozen.map(o=>o.occurrence_id)).size).toBe(36/step);
    expect((await api.get('/reviews',{params:{client_id:client.client_id}})).data).toHaveLength(1);
  }
);

test('multi-framework relationships do not inflate operational counts or silently close work',()=>{
  const today=new Date('2028-03-01T12:00:00Z');
  const task={task_id:'one-action',client_id:'a',title:'Enforce MFA',status:'open',due_date:'2028-02-29',assignee_id:'u',finding_id:'one-gap',priority:'high'};
  const finding={finding_id:'one-gap',client_id:'a',title:'MFA gap',status:'in_remediation',due_date:'2028-02-29',owner_id:'u',severity:'high'};
  const records={tasks:[task],findings:[finding],reviews:[],risks:[],vendors:[],policies:[],exceptions:[],requirements:[]};
  const posture=()=>dashboardPosture(aggregateClientDashboard(records,{clientId:'a',today}),{today});
  expect(posture().pastDue).toHaveLength(1);
  expect(posture().materialFindings).toHaveLength(1);
  task.status='done';finding.status='remediated';
  expect(posture().materialFindings).toHaveLength(1);
  finding.status='closed';
  expect(posture().pastDue).toHaveLength(0);
  expect(posture().materialFindings).toHaveLength(0);
});
