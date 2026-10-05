import {loadClientDashboard} from './loadClientDashboard';
import {activeDefinitions,frameworkCatalog} from './frameworks';
import {matchesAssessment,workspaceScope} from './frameworkWorkspace';
import {cisSummary} from './cisVerification';

const clientId='isolated-cis-dashboard';
const definitions=frameworkCatalog('cis-ig1').requirements;
const ids=rows=>rows.map(r=>r.definition_id||r.id);

function fixture(group){
  const cases={
    '1.1':{status:'needs_attention',work:{direct_findings:0,open_findings:1}},
    '1.2':{status:'in_progress',work:{direct_findings:1}},
    '1.3':{status:'addressed',last_assessed:'2025-01-01',work:{evidence_count:0}},
    '1.4':{status:'not_applicable'},
    '1.5':{status:'addressed',last_assessed:'2025-10-05T12:00:00Z',work:{evidence_count:1}},
  };
  const assessments=definitions.map(d=>({client_id:clientId,framework_key:'cis-ig1',definition_id:d.id,
    framework_assessment_id:`${clientId}:${d.id}`,status:'not_assessed',...cases[d.id]}));
  return {configuration:{implementation_group:group},definitions,assessments,
    active_definition_ids:activeDefinitions('cis-ig1',{implementation_group:group}).map(d=>d.id),
    work:Object.fromEntries(assessments.map(a=>[a.framework_assessment_id,a.work||{}]))};
}

function apiFor(data){
  return {get:jest.fn(async path=>({data:path==='/frameworks/cis-ig1'?data:
    path.endsWith('/members')?[]:path==='/onboarding/baseline'?{state:{completed:true}}:
    path==='/frameworks/summary'?{client_id:clientId,items:[]}:
    {contract_version:2,client_id:clientId,posture:{},groups:{},applicable_requirements:[
      {client_id:clientId,baseline_key:'cis-ig1',baseline_response:'applies'}]}}))};
}

beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00Z')));
afterEach(()=>jest.useRealTimers());

test.each([[1,56],[2,130],[3,153]])('IG%i dashboard contains exactly %i active workspace destinations',async(group,total)=>{
  const data=fixture(group),before=JSON.stringify(data),api=apiFor(data);
  const dashboard=await loadClientDashboard(api,{clientId,user:{role:'super_admin'},scope:{kind:'org'},workQueue:true});
  const rows=dashboard.programRows['cis-ig1'];
  expect(rows).toHaveLength(total);
  expect(ids(rows)).toEqual(activeDefinitions('cis-ig1',{implementation_group:group}).map(d=>d.id));
  expect(rows.every(r=>workspaceScope('cis-ig1',data,r))).toBe(true);
  expect(dashboard.programs[0].to).toBe('/compliance/cis-ig1');
  const summary=cisSummary(rows);
  // Inherited Review Findings cannot conceal an untracked safeguard gap. The
  // freshness boundary and NA population stay identical to workspace filters.
  for(const [view,metric,expected] of [
    ['unremediated','unremediated',['1.1']],['needs_attention','gap',['1.1']],
    ['in_progress','partial',['1.2']],['stale','stale',group>=2?['1.3']:[]],
    ['unevidenced','unevidenced',group>=2?['1.3']:[]],['not_applicable','na',group>=2?['1.4']:[]],
  ]){
    expect(ids(rows.filter(r=>matchesAssessment(r,view)))).toEqual(expected);
    expect(summary[metric]).toBe(expected.length);
  }
  expect(summary.total).toBe(total);expect(summary.applicable).toBe(total-(group>=2?1:0));
  expect(JSON.stringify(data)).toBe(before);
  expect(api.get).toHaveBeenCalledWith('/frameworks/cis-ig1',expect.objectContaining({params:{client_id:clientId}}));
});

test('CIS dashboard rejects foreign assessment rows even when definition IDs collide',async()=>{
  const data=fixture(1);
  data.assessments.push({...data.assessments[0],client_id:'another-client',framework_assessment_id:'foreign'});
  await expect(loadClientDashboard(apiFor(data),{clientId,user:{role:'super_admin'},scope:{kind:'org'},workQueue:true}))
    .rejects.toThrow('Assessment belongs to another client.');
});

test('CIS attention is operational work or incomplete assessment, without changing conclusions',()=>{
  const rows=[
    {definition_id:'unassessed',status:'not_assessed'},
    {definition_id:'review',status:'addressed',work:{overdue_reviews:1}},
    {definition_id:'finding',status:'addressed',work:{open_findings:1}},
    {definition_id:'action',status:'addressed',work:{overdue_actions:1}},
    {definition_id:'implemented',status:'addressed',work:{}},
    {definition_id:'excluded',status:'not_applicable',work:{}},
  ],before=JSON.stringify(rows);
  expect(ids(rows.filter(r=>matchesAssessment(r,'attention')))).toEqual(['unassessed','review','finding','action']);
  expect(ids(rows.filter(r=>matchesAssessment(r,'needs_attention')))).toEqual([]);
  expect(JSON.stringify(rows)).toBe(before);
});
