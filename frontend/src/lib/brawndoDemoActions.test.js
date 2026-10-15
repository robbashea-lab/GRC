import {unifiedActions} from './brawndoActions';
import {brawndoDemoActionsGate,brawndoTicketMetrics,brawndoDueWindow,brawndoTicketMatches,brawndoEligibleOwnerIds} from './brawndoDemoActions';

const clientId='demo_brawndo';
const user={user_id:'actor',workspace_mode:'demo'};
const gate={workspaceMode:'demo',user,currentClientId:clientId,currentClient:{client_id:clientId,status:'active'},pathname:'/action-items'};
const now=new Date(2026,9,15,23,30);
const task=(id,extra={})=>({client_id:clientId,task_id:id,title:id,status:'open',...extra});
const finding=(id,extra={})=>({client_id:clientId,finding_id:id,title:id,status:'open',...extra});
const rows=records=>unifiedActions(records,clientId);

test('the presentation gate fails closed for normal sign-in, other routes, unresolved, denied and archived clients',()=>{
  expect(brawndoDemoActionsGate(gate)).toBe(true);
  for(const patch of [{workspaceMode:'standard'},{user:{...user,workspace_mode:'standard'}},{user:null},{authLoading:true},{authError:'denied'},{orgLoading:true},{orgError:'denied'},{currentClientId:'other'},{currentClient:null},{currentClient:{client_id:'other',name:'Brawndo'}},{currentClient:{client_id:clientId,status:'archived'}},{pathname:'/findings'}]){
    expect(brawndoDemoActionsGate({...gate,...patch})).toBe(false);
  }
});


test('owner eligibility uses explicit native eligibility and preserves historical identities separately',()=>{
  expect([...brawndoEligibleOwnerIds([{user_id:'active',assignment_eligible:true},{user_id:'disabled',assignment_eligible:false},{user_id:'unknown',status:'active'},{user_id:'removed',name:'Former user'}])]).toEqual(['active']);
  expect(brawndoDemoActionsGate({...gate,currentClient:{client_id:clientId,archived:true}})).toBe(false);
  expect(brawndoDemoActionsGate({...gate,currentClient:{client_id:clientId,archived_at:'2026-01-01'}})).toBe(false);
});

test('runway windows are disjoint and preserve date-only planning boundaries',()=>{
  const cases=[['2026-10-14','overdue'],['2026-10-15','next14'],['2026-10-29','next14'],['2026-10-30','15_30'],['2026-11-14','15_30'],['2026-11-15','31_60'],['2026-12-14','31_60'],['2026-12-15','later'],['2026-02-30','unscheduled'],['bad','unscheduled'],['2026-10-15garbage','unscheduled'],[null,'unscheduled'],['2026-10-15T00:00:00Z','next14']];
  cases.forEach(([due_date,window])=>expect(brawndoDueWindow({due_date},now)).toBe(window));
});

test('unique active metrics count accepted issues with outstanding work, eligible owners, and high severity Findings only',()=>{
  const records={findings:[finding('accepted',{status:'accepted',severity:'high'}),finding('closed',{status:'closed'}),finding('pending',{status:'remediated'}),finding('accepted-terminal',{status:'accepted'})],
    tasks:[task('a',{finding_id:'accepted',due_date:'2026-10-14',assignee_id:'removed'}),task('b',{finding_id:'accepted',status:'blocked'}),task('c',{finding_id:'closed',status:'done'}),task('p',{finding_id:'pending',status:'done'}),task('standalone',{priority:'critical',assignee_id:'eligible'}),task('cancelled',{status:'cancelled'})]};
  const tickets=rows(records),metrics=brawndoTicketMetrics(tickets,new Set(['eligible']),now);
  expect(metrics.active.map(r=>r.ticketId)).toEqual(['finding:accepted','finding:pending','task:standalone']);
  expect(metrics.highSeverity.map(r=>r.ticketId)).toEqual(['finding:accepted']);
  expect(metrics.completed.map(r=>r.ticketId)).toEqual(['finding:closed']);
  expect(metrics.needsOwner).toHaveLength(2);
  expect(Object.values(metrics.windows).flat()).toHaveLength(metrics.active.length);
  expect(brawndoTicketMatches(tickets.find(r=>r.ticketId==='finding:accepted-terminal'),{view:'completed'})).toBe(false);
});


test('register filters use complete ticket search text, stable source IDs and native outcome views',()=>{
  const [row]=rows({tasks:[task('t',{description:'Distinct planned work',source_type:'review',review_id:'original'})]});
  expect(brawndoTicketMatches(row,{q:'planned work',source:'original'},new Set(),now)).toBe(true);
  expect(brawndoTicketMatches(row,{source:'other'},new Set(),now)).toBe(false);
  expect(brawndoTicketMatches(row,{view:'all',unassigned:true},new Set(),now)).toBe(true);
  expect(brawndoTicketMatches(row,{owner:'someone'},new Set(),now)).toBe(false);
});

test('Completed status excludes open work in All records',()=>{
  const tickets=rows({tasks:[task('open'),task('done',{status:'done'})]});
  expect(brawndoTicketMatches(tickets.find(row=>row.ticketId==='task:open'),{view:'all',quick:'completed'})).toBe(false);
  expect(brawndoTicketMatches(tickets.find(row=>row.ticketId==='task:done'),{view:'all',quick:'completed'})).toBe(true);
});
