import axios from 'axios';
import {previewAdapter} from './adapter';
import {namedDemoClient} from '../lib/demoClients';
import {readStore} from './store';
import {brawndoDemoProgram} from '../lib/brawndoDemoDashboard';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});

test.each([['demo_brawndo',1,56],['demo_initech',2,130],['demo_krusty_krab',3,153]])('native reporting and dashboard agree on %s IG%i %i identity',async(cid,group,total)=>{
  const overview=(await api.get('/portfolio/reporting/overview')).data;
  const program=overview.programs.find(row=>row.client_id===cid&&row.framework_key==='cis-ig1');
  expect(program.program_key).toBe(`cis-ig${group}`);
  const db=readStore(),assessments=db.framework_assessments.filter(row=>row.client_id===cid&&row.framework_key==='cis-ig1');
  const card=brawndoDemoProgram([{id:program.program_id,key:'cis-ig1',implementation_position:program.current}],
    {'cis-ig1':{selected:true,configured:true,configuration:{implementation_group:group},framework:{key:'cis-ig1',version:'8.1'},assessments}},cid);
  expect(card.program_key).toBe(program.program_key);
  const history=(await api.get('/portfolio/reporting/history',{params:{client_id:cid,program_key:card.program_key,range:'12m',demo_scenario:namedDemoClient(cid).historyVersion}})).data;
  expect(history.current.denominator).toBe(total);
  expect(history.scenario_context).toBeTruthy();
  // A second native request reloads the serialized store, not the seed object.
  const reloaded=(await api.get('/portfolio/reporting/history',{params:{client_id:cid,program_key:card.program_key,range:'12m',demo_scenario:namedDemoClient(cid).historyVersion}})).data;
  expect(reloaded.scenario_context.point_ids).toEqual(history.scenario_context.point_ids);
  expect(reloaded.snapshots.filter(row=>row.observation_kind==='demo_fixture').map(row=>row.snapshot_id)).toEqual(history.snapshots.filter(row=>row.observation_kind==='demo_fixture').map(row=>row.snapshot_id));
  expect(history.snapshots.some(row=>row.observation_kind==='demo_fixture')).toBe(true);
});
