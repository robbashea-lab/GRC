/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {applyWorkChanges} from './workCommands';
import {overlayApprovedV3Work} from '../preview/approvedV3Work';

// Run the shipped document and injected hook. The native record delivery below
// mirrors the real API contract verified by test_approved_v3_lifecycle.py.
const root=path.join(__dirname,'../../..');
const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
const marker='p16Initialize();\nif (!location.hash)';
const expose=`window.inspectFindings={
  programs:function(cid){return byId(cid).progs.map(p=>({kind:p.k,ref:p.reg.items[0].id}));},
  open:function(cid,kind,ref){var c=byId(cid);activateProg(c,kind);S.clientId=cid;S.route='client';S.sub='item';S.itemId=ref;S.itemTabKey=null;renderItem();},
  related:function(){var c=byId(S.clientId),it=curIt(c);return {findings:itemFindings(c,it).map(a=>a.id),actions:itemLinked(c,it).acts.map(a=>a.id),status:it.st};}
};`;
const sourceId='synthetic_finding_client',clientId='native-synthetic-finding-client';
const frameworks={cis:'cis-ig1',soc:'soc-2',iso:'iso-27001',hipaa:'hipaa',nist:'nist-csf-2',cmmc:'cmmc'};
const clone=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));
let dom,page,inspect,document,base,records,latest;
beforeAll(()=>{
  dom=new JSDOM(html.replace(marker,'p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  page=dom.window.GoverNaraNativePage;inspect=dom.window.inspectFindings;document=dom.window.document;
  base=page.snapshot();
});
afterAll(()=>dom.window.close());
beforeEach(()=>{
  latest=null;
  records={clients:[{client_id:clientId,source_client_id:sourceId,name:'SYNTHETIC QA client',
    framework_settings:{'cis-ig1':{implementation_group:3},cmmc:{level:2}},onboarding_baseline:{completed:true}}],
    users:[{user_id:'operator',name:'Synthetic operator',role:'super_admin',status:'active'}],
    requirements:Object.values(frameworks).map(baseline_key=>({client_id:clientId,baseline_key,baseline_response:'applies'})),
    reviews:[],tasks:[],findings:[],evidence:[],framework_assessments:[]};
  const state=clone(base);
  state.clients.push({id:sourceId,name:'SYNTHETIC QA client',lead:'Unassigned',onboarded:true,progs:[],activeProg:null});
  page.prepareClient(state,sourceId,records);page.configure({busy:()=>false,command:()=>{},persist:value=>{latest=value;return true;}});
  page.apply(state);page.actor({user_id:'operator',name:'Synthetic operator',role:'super_admin'},[sourceId]);
  records.framework_assessments=inspect.programs(sourceId).map(({kind,ref})=>({client_id:clientId,
    framework_assessment_id:'native-'+kind,framework_key:frameworks[kind],definition_id:ref,status:'not_assessed'}));
});

test.each(Object.keys(frameworks))('%s source Finding form stays linked through native delivery, submission and reload',async kind=>{
  const ref=inspect.programs(sourceId).find(program=>program.kind===kind).ref;
  inspect.open(sourceId,kind,ref);const initialStatus=inspect.related().status,before=clone(page.snapshot());
  document.querySelector('[data-action="item-finding"]').click();
  expect(document.querySelector('#f-pri').value).toBe('High');
  for(const [id,value] of [['finding','SYNTHETIC QA inventory gap'],['title','SYNTHETIC QA reconcile inventory'],
    ['description','Synthetic QA only. No customer deficiency asserted.']])document.getElementById('f-'+id).value=value;
  document.querySelector('[data-action="dlg-run"]').click();
  await Promise.resolve();
  expect(document.querySelector('#fdlg-err')?.textContent || '').toBe('');
  expect(latest).not.toBeNull();
  const after=clone(latest),api={post:jest.fn(async(url,body)=>{
    expect(url).toBe('/framework_assessments/native-'+kind+'/findings');expect(body.severity).toBe('high');
    const finding={...body,finding_id:'native-f',client_id:clientId,framework_assessment_id:'native-'+kind,
      status:'in_remediation',primary_task_id:'native-t',updated_at:'finding-version'};
    const task={task_id:'native-t',client_id:clientId,finding_id:'native-f',title:body.remediation_title,
      priority:body.severity,status:'open',due_date:body.due_date,assignee_id:body.owner_id,updated_at:'task-version'};
    records.findings=[finding];records.tasks=[task];return {data:finding};
  }),patch:jest.fn(async(url,body)=>{
    expect(url).toBe('/tasks/native-t');expect(body).toMatchObject({status:'done',resolution:'Synthetic correction submitted',expected_updated_at:'task-version'});
    Object.assign(records.tasks[0],{status:'done',resolution:body.resolution,completed_by:'operator'});
    records.findings[0].status='remediated';return {data:records.tasks[0]};
  })};
  await applyWorkChanges({before,after,records,clientId,sourceId,api,identityMaps:{},pendingRequests:new Map()});
  function reload(){const state=page.snapshot();overlayApprovedV3Work(state,records,{clientId,sourceId});page.apply(state);inspect.open(sourceId,kind,ref);}
  reload();
  expect(page.snapshot().work[sourceId].acts[0].detail).toBe('Synthetic QA only. No customer deficiency asserted.');
  expect(inspect.related()).toMatchObject({findings:['native-t'],actions:['native-t'],status:initialStatus});
  expect(document.querySelector('#gn-assess-tab-find .n').textContent).toBe('1');
  document.querySelector('#gn-assess-tab-find').click();
  expect(document.querySelector('#v-client').textContent).toContain('SYNTHETIC QA reconcile inventory');
  expect(document.querySelector('#v-client').textContent).not.toContain('it is not part of this mockup sample');
  const current=clone(page.snapshot()),completed=clone(current);
  await applyWorkChanges({before:current,after:completed,records,clientId,sourceId,api,identityMaps:{},
    commands:[{name:'completeAction',args:[sourceId,'native-t',{workNote:'Synthetic correction submitted'}]}]});
  reload();
  const work=page.snapshot().work[sourceId];
  expect(work.acts).toHaveLength(1);expect(work.done).toHaveLength(0);
  expect(work.acts[0]).toMatchObject({id:'native-t',st:'Pending validation',pri:'High',findingId:'native-f'});
  expect(inspect.related()).toMatchObject({findings:['native-t'],actions:['native-t'],status:initialStatus});
  // A corrective submission cannot approve its own Finding or implementation.
  expect(records.findings[0].status).toBe('remediated');expect(records.framework_assessments.every(row=>row.status==='not_assessed')).toBe(true);
  // Deliver the separately authorized native validation response. The API
  // lifecycle test verifies that the submitting operator cannot issue it.
  Object.assign(records.findings[0],{status:'closed',validated_by:'independent-validator'});reload();
  const validated=page.snapshot().work[sourceId];
  expect(validated.acts).toEqual([]);expect(validated.done[0]).toMatchObject({id:'native-t',st:'Completed',findingId:'native-f'});
  expect(validated.findings[0]).toMatchObject({id:'native-f',st:'Closed',actionIds:['native-t']});
  expect(inspect.related()).toMatchObject({findings:['native-t'],actions:['native-t'],status:initialStatus});
  for(const other of inspect.programs(sourceId).filter(program=>program.kind!==kind)){
    inspect.open(sourceId,other.kind,other.ref);expect(inspect.related().findings).toEqual([]);expect(inspect.related().actions).toEqual([]);
  }
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.patch).toHaveBeenCalledTimes(1);
});
