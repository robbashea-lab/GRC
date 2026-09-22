import fixture from './managementScenarios.json';
import {aggregateClientDashboard} from './clientDashboard';
import {managementMetrics} from './managementMetrics';
import {portfolioPopulations,portfolioFrameworks,portfolioOrder,latestPortfolioActivity} from './portfolioOverview';
import {tableColumns} from './tableColumns';
import {applyTableFilters} from './tableFilters';

test('exact authoritative populations separate issues from active material Risks without mutation',()=>{
  const records=JSON.parse(JSON.stringify(fixture.records)),today=new Date(fixture.today+'T12:00:00Z');
  const model=managementMetrics(aggregateClientDashboard(records,{clientId:'a',today}),{today});
  const sets=portfolioPopulations(model);
  expect(sets.critical_high_issues.every(r=>r.kind!=='risks')).toBe(true);
  expect(sets.significant_risks).toEqual(model.significantRisks);
  expect([...sets.critical_high_issues,...sets.significant_risks].map(r=>r.key).sort()).toEqual(model.metrics.critical_high_open.map(r=>r.key).sort());
  expect(records).toEqual(fixture.records);
});
test('framework applicability requires finalized tenant records, never names or draft choices',()=>{
  const requirements=[{client_id:'a',baseline_key:'cmmc',baseline_response:'applies'},{client_id:'b',baseline_key:'hipaa',baseline_response:'applies'}];
  expect(portfolioFrameworks('a',{completed:false,requirements:{'cmmc':'applies'}},requirements)).toEqual([]);
  expect(portfolioFrameworks('a',{completed:true},requirements).map(f=>f.key)).toEqual(['cmmc']);
  expect(portfolioFrameworks('a',{completed:true},[{...requirements[0],baseline_response:'does_not_apply'}])).toEqual([]);
});
test('activity uses meaningful named events and rejects noise, invalid and future timestamps',()=>{
  const logs=[{client_id:'a',entity_type:'reviews',action:'Review completed',at:'2026-09-10T12:00:00Z'},
    {client_id:'a',entity_type:'reviews',action:'update',at:'2026-09-12T12:00:00Z'},
    {client_id:'a',entity_type:'reviews',action:'Review completed',at:'2027-01-01T12:00:00Z'},
    {client_id:'b',entity_type:'evidence',action:'upload',at:'invalid'}];
  const result=latestPortfolioActivity(logs,new Date('2026-09-15T12:00:00Z'));
  expect(result.get('a')).toEqual({at:logs[0].at,label:'Review completed'});expect(result.has('b')).toBe(false);
});
const row=(id,fields={})=>({name:id,client_id:id,grc_lead_id:id,assigned_owner_id:id,grc_lead:{name:id},frameworks:[],past_due:0,due_30d:0,critical_high_issues:0,significant_risks:0,unassigned:0,...fields});
test('deterministic attention-first order and numeric column sort',()=>{
  const rows=[row('Z',{critical_high_issues:1}),row('A',{past_due:4}),row('B',{significant_risks:10}),row('D',{unassigned:2}),row('C',{due_30d:4})];
  expect(rows.sort(portfolioOrder).map(r=>r.name)).toEqual(['Z','A','B','D','C']);
  expect(applyTableFilters(rows,tableColumns('portfolio',{rows}),{sort:{key:'significant_risks',dir:'desc'}})[0].name).toBe('B');
});
test('combined framework, lead, issue and unassigned filters use shared AND and OR behavior',()=>{
  const rows=[row('A',{frameworks:[{key:'hipaa',label:'HIPAA'}],past_due:2,unassigned:1,critical_high_issues:1}),row('B',{frameworks:[{key:'cmmc',label:'CMMC'}],critical_high_issues:2})];
  const columns=tableColumns('portfolio',{rows});
  expect(applyTableFilters(rows,columns,{filters:{frameworks:['hipaa'],past_due:['some']}}).map(r=>r.name)).toEqual(['A']);
  expect(applyTableFilters(rows,columns,{filters:{grc_lead_id:['A'],critical_high_issues:['some'],unassigned:['some']}}).map(r=>r.name)).toEqual(['A']);
  expect(applyTableFilters(rows,columns,{filters:{frameworks:['hipaa','cmmc']}})).toHaveLength(2);
  expect(applyTableFilters(rows,columns,{filters:{frameworks:['cmmc'],unassigned:['some']}})).toEqual([]);
});
