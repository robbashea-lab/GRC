import axios from 'axios';
import {webcrypto} from 'crypto';
import {previewAdapter} from './adapter';
import {buildLegacyDemoStore,readStore,STORE_KEY} from './store';
import {clearFileCache} from './evidenceStorage';

// Separate from the focused archive fixture: the real fresh Explore initializer
// must remain compatible with every native command rule added by R4.
test('explicit fictional workers remain distinct from validators and departed-worker history stays intact',()=>{
  const db=buildLegacyDemoStore(new Date('2026-11-19T12:00:00Z'));
  for(const clientId of ['demo_dunder','demo_prestige']){
    const client=db.clients.find(row=>row.client_id===clientId);
    const action=db.tasks.find(row=>row.task_id===clientId+'_task_2');
    const finding=db.findings.find(row=>row.primary_task_id===action?.task_id);
    expect(action).toBeDefined();expect(finding.status).toBe('closed');
    expect(action.completed_by).not.toBe(finding.validated_by);
    expect(finding.validated_by).toBe(client.assigned_owner_id);
    expect(action.submission_history).toEqual([expect.objectContaining({by:action.completed_by,at:action.completed_at})]);
    const followup=db.tasks.find(row=>row.task_id===clientId+'_assessment_action');
    const former=db.users.find(row=>row.user_id===clientId+'_former');
    expect(former.status).toBe('disabled');
    expect(followup.completed_by).toBe(former.user_id);
    expect(followup.submission_history).toEqual([expect.objectContaining({by:former.user_id,at:followup.completed_at})]);
  }
},180000);

test('fresh Explore Demo enters through its real initializer without bypassing native validation',async()=>{
  const keys=['REACT_APP_PREVIEW','REACT_APP_DUNDER_EIGHT_YEAR_QA','REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA','REACT_APP_PRESTIGE_EIGHT_YEAR_ONBOARDING_QA'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  jest.useFakeTimers({doNotFake:['performance']});jest.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  sessionStorage.clear();localStorage.clear();clearFileCache();
  process.env.REACT_APP_PREVIEW='true';for(const key of keys.slice(1))delete process.env[key];
  try{
    const api=axios.create({adapter:previewAdapter}),response=await api.post('/demo/enter');
    expect(response.data.user.workspace_mode).toBe('demo');expect(sessionStorage.getItem('grc_demo_entered')).toBe('true');
    const db=readStore();expect(db.clients.length).toBeGreaterThanOrEqual(5);expect(db.evidence.length).toBeGreaterThan(0);expect(sessionStorage.getItem(STORE_KEY)).toBeTruthy();
    const saved=sessionStorage.getItem(STORE_KEY),retainedHistory=JSON.stringify(db.tasks.map(row=>({
      id:row.task_id,completed_by:row.completed_by,completed_at:row.completed_at,submission_history:row.submission_history
    })));
    const reloaded=readStore();
    expect(sessionStorage.getItem(STORE_KEY)).toBe(saved);
    expect(JSON.stringify(reloaded.tasks.map(row=>({
      id:row.task_id,completed_by:row.completed_by,completed_at:row.completed_at,submission_history:row.submission_history
    })))).toBe(retainedHistory);
  }finally{for(const key of keys)if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];sessionStorage.clear();localStorage.clear();clearFileCache();jest.useRealTimers();}
},180000);
