import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoDemoReviewsGate,reviewWorkload,reviewSummary,reviewExecutions} from './brawndoDemoReviews';

const scope={...cisContext(),workspaceMode:'demo',user:{user_id:'viewer',role:'client_readonly',workspace_mode:'demo'},currentClientId:'demo_brawndo',currentClient:cisClient(),clients:[{client_id:'demo_brawndo'}],pathname:'/reviews'};
const now=new Date(2026,9,16,12);
test('Reviews presentation requires exact active authorized Explore demo context',()=>{
  expect(brawndoDemoReviewsGate(scope)).toBe(true);
  expect(brawndoDemoReviewsGate({...scope,user:{...scope.user,role:'client_viewer'}})).toBe(true);
  for(const changed of [{workspaceMode:'standard'},{user:{...scope.user,workspace_mode:'standard'}},{user:{...scope.user,user_id:''}},{user:{...scope.user,role:'unknown'}},{loading:true},{authLoading:true},{error:'Denied'},{authError:'Expired'},{currentClientId:'other'},{currentClient:{client_id:'other',name:'Brawndo'}},{clients:[]},{currentClient:{...scope.currentClient,status:'archived'}},{currentClient:{...scope.currentClient,archived_at:'2026-10-01'}},{pathname:'/calendar'}])expect(brawndoDemoReviewsGate({...scope,...changed})).toBe(false);
});
test('workload uses real completions, current overdue obligation and native anchored future cycles without mutating records',()=>{
  const reviews=[{review_id:'monthly',title:'Month end',status:'upcoming',recurrence:'monthly',due_date:'2026-10-31',occurrences:[{occurrence_id:'old',status:'completed',due_date:'2026-09-30',completed_at:'2026-10-03'}]},
    {review_id:'late',title:'Late review',status:'in_progress',recurrence:'quarterly',due_date:'2026-09-30'},
    {review_id:'cancelled',title:'Cancelled',status:'cancelled',recurrence:'monthly',due_date:'2026-10-10'},
    {review_id:'unscheduled',title:'No date',status:'needs_scheduling',recurrence:'monthly'}];
  const before=JSON.stringify(reviews),months=reviewWorkload(reviews,now);
  expect(months).toHaveLength(12);expect(months[0]).toMatchObject({done:1,due:1,late:1,projected:0});
  expect(months[1].items).toContainEqual({title:'Month end',at:'2026-11-30T00:00:00.000Z',type:'Projected'});
  expect(months[2].due).toBe(2);expect(months[2].projected).toBe(2);
  expect(months.flatMap(month=>month.items).some(item=>item.title==='Cancelled')).toBe(false);
  expect(months.slice(1).every(month=>month.done===0)).toBe(true);expect(JSON.stringify(reviews)).toBe(before);
});
test('genuine completion summary deduplicates current occurrence, excludes cancellation and future dates',()=>{
  const reviews=[{review_id:'done',status:'completed',current_occurrence_id:'execution',completed_at:'2026-10-04',occurrences:[{occurrence_id:'execution',status:'completed',completed_at:'2026-10-04'}]},
    {review_id:'cancel',status:'cancelled',completed_at:'2026-10-04'},
    {review_id:'future',status:'completed',completed_at:'2027-01-01'}];
  expect(reviewExecutions(reviews)).toHaveLength(3);expect(reviewSummary(reviews,now).completed90).toBe(1);expect(reviewWorkload(reviews,now)[0].done).toBe(1);
});
test('ancient custom daily recurrence skips elapsed cycles using native interval without losing the future year',()=>{
  const months=reviewWorkload([{review_id:'ancient',title:'Daily',status:'upcoming',recurrence:'custom',custom_recurrence_days:1,due_date:'2000-01-01'}],now);
  expect(months[0].late).toBe(1);expect(months[0].due).toBe(16);
  expect(months.reduce((sum,month)=>sum+month.due,0)).toBe(350);
  expect(months[0].projectionUnavailable).toBe(0);
});
