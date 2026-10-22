import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoDemoRisksGate,riskHorizon,loadRiskRelations,upcomingRiskEvents} from './brawndoDemoRisks';
import {calendarDay} from './managementDates';
import {riskMatches} from './brawndoRisks';

const context={...cisContext(),workspaceMode:'demo',user:{workspace_mode:'demo',role:'super_admin',user_id:'demo-user'},currentClientId:'demo_brawndo',currentClient:cisClient(),pathname:'/risks'};
test('presentation gate requires the complete trusted demo scope and resolved providers',()=>{
  expect(brawndoDemoRisksGate(context)).toBe(true);
  for(const change of [{workspaceMode:'standard'},{user:null},{user:{}},{user:{workspace_mode:'standard',user_id:'demo-user'}},{currentClientId:'other'},{currentClient:null},{currentClient:{client_id:'other',status:'active'}},{currentClient:{...context.currentClient,status:'inactive'}},{currentClient:{...context.currentClient,archived:true}},{currentClient:{...context.currentClient,archived_at:'2026-10-15'}},{pathname:'/risks/one'},{pathname:'/actions'},{authLoading:true},{orgLoading:true},{authError:new Error('auth')},{orgError:new Error('org')}])expect(brawndoDemoRisksGate({...context,...change})).toBe(false);
});

test('UTC review boundaries retain native today and +30 semantics; six calendar months clamp',()=>{
  const now=new Date('2026-10-16T00:30:00Z');
  expect(riskHorizon(now).today).toBe(calendarDay('2026-10-16'));
  for(const [date,due,upcoming] of [['2026-10-15',true,false],['2026-10-16',true,false],['2026-11-15',false,true],['2026-11-16',false,false],[null,false,false]]){
    expect(riskMatches({status:'open',next_review:date},'review_due',now)).toBe(due);
    expect(riskMatches({status:'open',next_review:date},'upcoming',now)).toBe(upcoming);
  }
  expect(riskHorizon(new Date('2027-08-31T12:00:00Z')).until).toBe(calendarDay('2028-02-29'));
  expect(riskHorizon(new Date('2026-08-31T12:00:00Z')).until).toBe(calendarDay('2027-02-28'));
});

test('projection keeps every distinct same-day saved event and excludes closed, foreign and undated records',()=>{
  const risk={client_id:'demo_brawndo',risk_id:'r1',status:'accepted',next_review:'2026-10-16',acceptance_expires_at:'2026-10-16'};
  const task={client_id:risk.client_id,status:'open',due_date:'2026-10-16'};
  const rows=[risk,{...risk,risk_id:'closed',status:'closed'},{...risk,risk_id:'undated',next_review:null,acceptance_expires_at:'invalid'},{...risk,risk_id:'outside',next_review:'2027-04-17',acceptance_expires_at:null}];
  const events=upcomingRiskEvents(rows,{r1:[{...task,task_id:'a'},{...task,task_id:'b'},{...task,task_id:'done',status:'done'},{...task,task_id:'foreign',client_id:'other'},{...task,task_id:'missing',due_date:null}]},new Date('2026-10-16T00:30:00Z'));
  expect(events.map(e=>e.kind).sort()).toEqual(['action','action','expiry','review']);
  expect(new Set(events.map(e=>e.key)).size).toBe(4);
  expect(events.filter(e=>e.kind==='action').map(e=>e.record.task_id).sort()).toEqual(['a','b']);
});

test('related reads bound concurrency and retain successes when individual relationships fail',async()=>{
  let active=0,max=0;
  const rows=Array.from({length:11},(_,i)=>({risk_id:`r${i}`,client_id:'demo_brawndo'}));
  const result=await loadRiskRelations(rows,async row=>{
    active++;max=Math.max(max,active);await Promise.resolve();active--;
    if(row.risk_id==='r2')throw new Error('unavailable');
    if(row.risk_id==='r3')return {};
    return {tasks:[{task_id:'valid',client_id:row.client_id},{task_id:'foreign',client_id:'other'},{client_id:row.client_id}]};
  },new AbortController().signal);
  expect(max).toBe(4);expect(result.unavailable.sort()).toEqual(['r2','r3']);
  expect(Object.keys(result.relations)).toHaveLength(9);
  expect(result.relations.r0).toEqual([{task_id:'valid',client_id:'demo_brawndo'}]);
});

test('cancellation starts no additional relationship reads and rejects an aborted pending read',async()=>{
  const controller=new AbortController(),load=jest.fn(()=>{controller.abort();return Promise.reject(new Error('cancelled'));});
  await expect(loadRiskRelations(Array.from({length:10},(_,i)=>({risk_id:`r${i}`})),load,controller.signal)).rejects.toThrow('cancelled');
  expect(load).toHaveBeenCalledTimes(1);
  const unused=jest.fn();
  expect(await loadRiskRelations([{risk_id:'r'}],unused,controller.signal)).toEqual({relations:{},unavailable:[]});expect(unused).not.toHaveBeenCalled();
});
