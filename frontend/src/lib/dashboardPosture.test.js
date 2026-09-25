import {aggregateClientDashboard} from './clientDashboard';
import {dashboardPosture} from './dashboardPosture';
import {complianceProgress} from './complianceProgress';

const today=new Date(2026,8,15,12);
const date=n=>new Date(Date.UTC(2026,8,15+n)).toISOString().slice(0,10);
const task=(id,n,extra={})=>({client_id:'a',task_id:id,title:id,status:'open',due_date:n===null?null:date(n),priority:'medium',...extra});
const risk=(id,extra={})=>({client_id:'a',risk_id:id,title:id,status:'assessed',likelihood_score:2,impact_score:5,...extra});
const posture=(records,scope={kind:'org'})=>dashboardPosture(aggregateClientDashboard(records,{clientId:'a',today,scope,user:{user_id:'u'}}),{today});

test('exact date boundaries, completed exclusions and disjoint work distribution',()=>{
  const result=posture({tasks:[task('past',-1),task('today',0),task('30',30),task('31',31),task('done',-2,{status:'done'}),task('progress',2,{status:'in_progress'}),task('undated',null)]});
  expect(result.pastDue.map(r=>r.id)).toEqual(['past']);
  expect(result.due30.map(r=>r.id)).toEqual(['today','30','progress']);
  const grouped=result.buckets.flatMap(g=>g.items.map(r=>r.key));
  expect(new Set(grouped).size).toBe(result.work.length);
  expect(grouped).toHaveLength(result.work.length);
});

test('accepted material risks count; closed risks and unassessed scores do not',()=>{
  const result=posture({risks:[risk('accepted',{status:'accepted'}),risk('closed',{status:'closed'}),risk('unknown',{likelihood_score:null}),risk('low',{impact_score:1})]});
  expect(result.significantRisks.map(r=>r.id)).toEqual(['accepted']);
  expect(result.acceptedRisks.map(r=>r.id)).toEqual(['accepted']);
  expect(result.riskLevels.find(g=>g.key==='unassessed').items.map(r=>r.id)).toEqual(['unknown']);
  expect(result.riskLevels.flatMap(g=>g.items)).toHaveLength(3);
});

test('linked remediation counts once as work but retains the material finding card',()=>{
  const finding={client_id:'a',finding_id:'f',title:'Gap',status:'in_remediation',severity:'high',due_date:date(-1)};
  const records={findings:[finding,{...finding,finding_id:'closed',status:'closed'}],tasks:[task('action',-1,{finding_id:'f'})],reviews:[{client_id:'a',review_id:'completed',title:'Completed review',status:'completed',due_date:date(-10)}]};
  const original=JSON.stringify(records);
  const result=posture(records);
  expect(result.pastDue.map(r=>r.kind)).toEqual(['tasks']);
  expect(result.materialFindings.map(r=>r.id)).toEqual(['f']);
  expect(JSON.stringify(records)).toBe(original);
  expect(posture({...records,tasks:[task('action',-2,{finding_id:'f'})]}).pastDue).toHaveLength(2);
});

test('linked reviews and acceptance expiry suppress fallback duplicates; projected recurrence excluded',()=>{
  const result=posture({reviews:[{client_id:'a',review_id:'r',title:'Review',risk_id:'risk',status:'upcoming',due_date:date(1),recurrence:'monthly',next_review_date:date(20)}],
    risks:[risk('risk',{next_review:date(1)}),risk('accepted',{status:'accepted',next_review:date(50),acceptance_expires_at:date(2)})],
    exceptions:[{client_id:'a',exception_id:'e',risk_id:'accepted',title:'Acceptance',status:'approved',expires_at:date(2)}]});
  expect(result.due30.map(r=>r.id)).toEqual(['r','e']);
  expect(result.work.some(r=>r.event==='next')).toBe(false);
});

test('priority is rule-driven and record-unique; person scope and tenant rejection preserved',()=>{
  const records={tasks:[task('other',-1),task('high',-1,{priority:'high',assignee_id:'u'}),task('critical',-1,{priority:'critical'}),task('future',5,{priority:'high'})]};
  expect(posture(records).priority.map(r=>r.id)).toEqual(['critical','high','other','future']);
  expect(posture(records,{kind:'mine'}).work.map(r=>r.id)).toEqual(['high']);
  expect(()=>posture({tasks:[task('foreign',1,{client_id:'b'})]})).toThrow('different client');
});

test('program cards follow finalized client selections, with no fabricated assessment progress',()=>{
  const records=['hipaa','iso-27001'].map(key=>({client_id:'a',baseline_key:key,baseline_response:'applies'}));
  expect(complianceProgress('a',null,records)).toEqual([]);
  expect(complianceProgress('b',{completed:true},records)).toEqual([]);
  const programs=complianceProgress('a',{completed:true},records);
  expect(programs.map(p=>p.key)).toEqual(['hipaa','iso-27001']);
  for(const p of programs)expect(p).toMatchObject({progress:null,denominator:null,trackingAvailable:true});
  expect(complianceProgress('a',{completed:true},records.slice(0,1))).toHaveLength(1);
  expect(complianceProgress('a',{completed:true},[])).toEqual([]);
});

test('vendor health reuses review, assurance and contract windows and excludes inactive vendors',()=>{
  const vendor={client_id:'a',vendor_id:'v',name:'Provider',status:'active',criticality:'critical',next_review:date(5),contract_renewal:date(40),assurance_required:true,assurance_records:[{type:'Security Questionnaire',required:true,refresh_due:date(-1),received_at:date(-100),evidence_ids:['e']}]};
  const result=posture({vendors:[vendor,{...vendor,vendor_id:'inactive',status:'inactive'}],reviews:[{client_id:'a',review_id:'vr',vendor_id:'v',title:'Vendor review',status:'upcoming',due_date:date(5)}]});
  expect(Object.fromEntries(result.vendorHealth.map(g=>[g.key,g.items.map(r=>r.id)]))).toEqual({vendorReviewsPast:[],vendorReviewsSoon:['vr'],assurance:['v'],contracts:['v'],criticalVendors:['v'],missingAssurance:[]});
  expect(result.due30.filter(r=>r.type==='Vendor Review')).toHaveLength(0);
  expect(result.due30.filter(r=>r.id==='vr')).toHaveLength(1);
});

test('a Finding whose own open Action is listed appears once, as the Action',()=>{
  const {dashboardPosture}=require('./dashboardPosture');
  const {aggregateClientDashboard}=require('./clientDashboard');
  const f={finding_id:'f',client_id:'c',title:'Gap',severity:'high',status:'open',due_date:'2020-01-10',owner_id:'a'};
  const t={task_id:'t',client_id:'c',title:'Fix gap',finding_id:'f',status:'open',due_date:'2020-01-01',assignee_id:'b'};
  const records={reviews:[],findings:[f],tasks:[t],risks:[],vendors:[],policies:[],requirements:[],exceptions:[],assets:[]};
  const agg=aggregateClientDashboard(records,{clientId:'c',members:[],user:{user_id:'x'},today:new Date('2026-01-01'),scope:{kind:'org'}});
  const rows=dashboardPosture(agg,{today:new Date('2026-01-01')}).priority;
  expect(rows.map(r=>`${r.kind}:${r.id}`)).toEqual(['tasks:t']);
});
