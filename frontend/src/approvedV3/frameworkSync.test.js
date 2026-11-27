/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import scenario from '../../../shared/fixtures/approvedV3Scenario.json';
import {overlayApprovedClientAssessments,approvedHipaaSupplement,frameworkKeys,approvedV3Records,approvedV3IdentityMaps} from '../preview/approvedV3Records';
import {overlayApprovedV3Work} from '../preview/approvedV3Work';
import {overlayApprovedV3Registers} from '../preview/approvedV3Registers';
import {activeDefinitions} from '../lib/frameworks';
import {serviceCatalog} from '../lib/r4ServicesTools';
import {overlayGlobalRecords} from './adminCommands';
import {overlayNativeAudit} from './auditProjection';
import {approvedOnboardingPlan} from './clientCommands';

// Load the comparison without starting the browser entry point in this Node test.
global.window={};
const {workspaceMaterial,reconcileView}=require('./nativeWorkspace');
delete global.window;

const clone=value=>JSON.parse(JSON.stringify(value));
const wireView=value=>JSON.parse(JSON.stringify(value,function(key,item){
  return Object.prototype.toString.call(this[key])==='[object Date]'?{$date:this[key].toISOString()}:item;
}));
function openPage(){
  const root=path.join(__dirname,'../../..');
  const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const marker='p16Initialize();\nif (!location.hash)';
  const fixture=`window.prepareGuidedFixture=function(){
    var c=byId(S.clientId),it=curIt(c),g=gState(c,it);
    g.stage='draft';g.draft='Inventory is maintained in the saved client tool.\\n\\nItems requiring confirmation\\n- Confirm the next completed review.';
    g.proposalKey=itemKey(c,it.id);g.proposalRevision=it.mwfRevision||0;g.proposalScope=MWF.scopeFingerprint(c);g.ack=true;
    S.itemTab='assess';renderItem();gnGuideSession.key=itemKey(c,it.id);gnGuideDraw();
  };
  window.prepareMultiFrameworkOnboardingFixture=function(id){
    var c=byId(id),o=onbState(c);o.prog={cis:'applies',nist:'applies',iso:'applies',soc:'applies',hipaa:'applies',cmmc:'applies'};
    o.ig=3;o.cmmc=2;onbPols(o).forEach(function(p){o.pol[p[0]].ans='unsure';});onbRevs(o);o.step=4;
    renderOnboarding(c);return onbRevPlan(o);
  };`;
  return new JSDOM(html.replace(marker,'p16Initialize();\n'+hook+'\n'+fixture+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}
const scope=(records,cid)=>Object.fromEntries(Object.entries(records).filter(([,rows])=>Array.isArray(rows))
  .map(([kind,rows])=>[kind,kind==='users'?rows:rows.filter(row=>row.client_id===cid)]));
const nextRoute=window=>new Promise(resolve=>window.setTimeout(resolve,0));

test('native reconciliation keeps separate contacts that have no email or share one',()=>{
  for(const email of ['', 'office@example.test']){
    const before={contacts:[{name:'First contact',email},{name:'Second contact',email}]};
    const incoming={contacts:[{name:'First contact',email,sourceRecordId:'6'},{name:'Second contact',email,sourceRecordId:'7'}]};
    const displayed=reconcileView(before,incoming);
    expect(displayed.contacts[0]).not.toBe(displayed.contacts[1]);
    expect(displayed.contacts.map(row=>({name:row.name,sourceRecordId:row.sourceRecordId}))).toEqual([
      {name:'First contact',sourceRecordId:'6'},{name:'Second contact',sourceRecordId:'7'}]);
    const edited=clone(displayed);edited.contacts[0].name='Revised first contact';
    reconcileView(displayed,edited);
    expect(displayed.contacts.map(row=>row.name)).toEqual(['Revised first contact','Second contact']);
  }
});

test('contact access follows the saved account identity, status and tenant scope',()=>{
  const cid='v3sample_brawndo';
  const cases=[
    {name:'reference-only link',account:{reference_only:true,status:'reference_only',role:'reference_only'},access:false,invited:false},
    {name:'active linked account with a different email',account:{status:'active',role:'client_grc_manager',client_ids:[cid]},access:true,invited:false},
    {name:'unlinked matching email',account:{status:'active',role:'client_grc_manager',client_ids:[cid]},unlinked:true,access:false,invited:false},
    {name:'disabled account',account:{status:'disabled',role:'client_grc_manager',client_ids:[cid]},access:false,invited:false},
    {name:'revoked membership',account:{status:'active',role:'client_grc_manager',client_ids:[]},access:false,invited:false},
    {name:'all-client provider',account:{status:'active',role:'platform_admin',all_clients:true,client_ids:[]},access:true,invited:false},
    {name:'legacy readonly account',account:{status:'active',role:'client_viewer',client_ids:[cid]},access:true,invited:false},
    {name:'invitation not accepted',account:{status:'invited',role:'client_contributor',client_ids:[cid]},access:false,invited:true},
  ];
  for(const entry of cases){
    const view=clone(scenario.source_state),records=clone(scenario.records),contact=records.contacts.find(row=>row.client_id===cid);
    const account={user_id:'linked-account',name:contact.name,email:entry.unlinked?contact.email:'changed@example.test',...entry.account};
    records.users.push(account);contact.linked_user_id=entry.unlinked?null:account.user_id;
    overlayApprovedClientAssessments(view,records);
    const displayed=view.records.brawndo.contacts.find(row=>row.sourceRecordId===String(contact.source_record_id));
    expect({name:entry.name,access:displayed.access,invited:displayed.invited}).toEqual({name:entry.name,access:entry.access,invited:entry.invited});
  }
});

test('every client/program counts current native outcomes after rendering and framework switches',async()=>{
  const dom=openPage();
  try{
    const api=dom.window.GoverNaraNativePage,view=api.snapshot(),records=clone(scenario.records);
    api.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{}});
    api.actor({user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin'},view.clients.map(c=>c.id));
    const cases=[];
    for(const client of view.clients){
      const cid=records.clients.find(c=>c.source_client_id===client.id).client_id;
      api.prepareClient(view,client.id,scope(records,cid));
      for(const program of client.progs.filter(p=>!p.retired&&!p.ws)){
        const rows=records.framework_assessments.filter(row=>row.client_id===cid&&row.framework_key===frameworkKeys[program.k]);
        expect(rows.length).toBeGreaterThan(0);
        const changed=rows.find(row=>row.status==='addressed')||rows[0];
        changed.status='needs_attention';changed.verification='needs_validation';
        const applicable=rows.filter(row=>row.status!=='not_applicable');
        cases.push({client:client.id,program:program.k,expected:{
          total:applicable.length,impl:applicable.filter(r=>r.status==='addressed').length,
          partial:applicable.filter(r=>r.status==='in_progress').length,
          notImpl:applicable.filter(r=>r.status==='needs_attention').length,
          notAssessed:applicable.filter(r=>r.status==='not_assessed').length,
          assessed:applicable.filter(r=>r.status!=='not_assessed').length,
        }});
      }
      overlayApprovedClientAssessments(view,scope(records,cid));
    }
    expect(cases).toHaveLength(10);
    api.apply(view);
    for(const entry of cases){
      dom.window.location.hash='client-'+entry.client+'-program';await nextRoute(dom.window);
      const pick=dom.window.document.querySelector('#side-client [data-action="prog-switch"][data-val="'+entry.program+'"]');
      if(pick){pick.click();await nextRoute(dom.window);}
      const saved=api.snapshot().clients.find(c=>c.id===entry.client);
      expect(saved.activeProg).toBe(entry.program);
      expect(Object.fromEntries(Object.keys(entry.expected).map(key=>[key,saved[key]]))).toEqual(entry.expected);
      expect(dom.window.document.querySelector('#v-client .page-title').textContent).toBe(saved.program);
      dom.window.location.hash='portfolio';await nextRoute(dom.window);
      const returned=api.snapshot().clients.find(c=>c.id===entry.client);
      expect(returned.impl).toBe(entry.expected.impl);expect(returned.total).toBe(entry.expected.total);
    }
  }finally{dom.window.close();}
},30000);

test('fresh client registers match native active definitions for every selectable framework scope',()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot();
    page.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{}});
    const cases=[['cis-ig1',{implementation_group:1}],['cis-ig1',{implementation_group:2}],['cis-ig1',{implementation_group:3}],
      ['cmmc',{level:1}],['cmmc',{level:2}],['soc-2',{categories:['security']}],
      ['soc-2',{categories:['security','availability']}],
      ['soc-2',{categories:['security','availability','confidentiality','processing_integrity','privacy']}],
      ['iso-27001',{}],['nist-csf-2',{}],['hipaa',{}]];
    for(const [index,[key,configuration]] of cases.entries()){
      const id='new-scope-'+index,cid='native-'+index,client={id,name:id,isNew:true,onboarded:false,status:'Active',progs:[]};state.clients.push(client);
      const tables={clients:[{client_id:cid,source_client_id:id,framework_settings:{[key]:configuration},onboarding_baseline:{completed:true}}],
        requirements:[{client_id:cid,baseline_key:key,baseline_response:'applies'}],users:[]};
      page.prepareClient(state,id,tables);
      expect(client.progs).toHaveLength(1);
      const sourceIds=client.progs[0].reg.items.map(i=>i.id).sort(),nativeIds=activeDefinitions(key,configuration).map(d=>d.id).sort();
      expect({key,configuration,ids:sourceIds}).toEqual({key,configuration,ids:nativeIds});
      expect(client.progs[0].reg.items.every(i=>i.st==='A')).toBe(true);
      const native=approvedV3Records({...state,clients:[client]},{clientFieldsOnly:true,clientIds:{[id]:cid}});
      expect(native.framework_assessments.every(row=>row.client_id===cid&&row.status==='not_assessed')).toBe(true);
      expect(native.framework_assessments).toHaveLength(nativeIds.length);
    }
  }finally{dom.window.close();}
},30000);

test('new-client onboarding reaches Policies and keeps that step through native draft rehydration',async()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,id='qa-new-onboarding',clientId='native-qa-new-onboarding';
    const state=page.snapshot(),client={id,name:'New onboarding client',isNew:true,onboarded:false,status:'Onboarding',progs:[]};
    state.clients.push(client);
    const records={clients:[{client_id:clientId,source_client_id:id,name:client.name,status:'onboarding',profile:{}}],
      requirements:[],users:[],contacts:[],assets:[],framework_assessments:[]};
    page.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{}});
    page.actor({user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin'},state.clients.map(c=>c.id));
    function hydrate(view){
      page.prepareClient(view,id,records);overlayApprovedClientAssessments(view,records);
      page.apply(wireView(view),reconcileView);
    }
    hydrate(state);dom.window.location.hash='client-'+id+'-profile';await nextRoute(dom.window);
    const cis=dom.window.document.getElementById('onbp-cis');
    expect(cis).not.toBeNull();cis.value='ig1';cis.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    hydrate(page.snapshot());
    expect(page.snapshot().onboarding[id].prog.cis).toBe('applies');
    dom.window.document.querySelector('[data-action="onb-next"]').click();await nextRoute(dom.window);
    expect(page.snapshot().onboarding[id].step).toBe(2);
    expect(dom.window.document.querySelectorAll('[data-action="onb-pol"][data-val="unsure"]').length).toBeGreaterThan(0);
    hydrate(page.snapshot());
    expect(page.snapshot().onboarding[id].step).toBe(2);
    expect(dom.window.document.querySelectorAll('[data-action="onb-pol"][data-val="unsure"]').length).toBeGreaterThan(0);
  }finally{dom.window.close();}
},30000);

test('a completed new client with no security profile reopens its profile after native hydration',async()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,id='qa-completed-onboarding',clientId='native-qa-completed-onboarding';
    const state=page.snapshot(),client={id,name:'Completed onboarding client',isNew:true,onboarded:true,status:'Active',progs:[]};
    state.clients.push(client);state.onboarding||={};
    state.onboarding[id]={step:4,prog:{cis:'applies'},ig:1,pol:{},rev:{},gen:{},saved:true};
    const records={clients:[{client_id:clientId,source_client_id:id,name:client.name,status:'active',profile:{},
      framework_settings:{'cis-ig1':{implementation_group:1}},onboarding_baseline:{completed:true}}],
      requirements:[{client_id:clientId,baseline_key:'cis-ig1',baseline_response:'applies'}],
      users:[],contacts:[],assets:[],framework_assessments:[]};
    const errors=[];dom.window.addEventListener('error',event=>errors.push(event.error?.message||event.message));
    page.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{}});
    page.actor({user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin'},state.clients.map(c=>c.id));
    page.prepareClient(state,id,records);overlayApprovedClientAssessments(state,records);
    page.apply(wireView(state),reconcileView);
    dom.window.location.hash='client-'+id+'-profile';await nextRoute(dom.window);
    expect(errors).toEqual([]);
    expect(dom.window.document.querySelector('#v-client .page-title').textContent).toBe(client.name+' Client Profile');
    expect(dom.window.document.querySelector('#v-client').textContent).toContain('Unknown');
    page.apply(wireView(page.snapshot()),reconcileView);
    expect(page.snapshot().profile[id].v2.areas).toEqual({});
    expect(page.snapshot().onboarding[id].step).toBe(4);
  }finally{dom.window.close();}
},30000);

test('the actual six-framework onboarding preview shows thirty-three shared activities',async()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,id='qa-shared-onboarding',clientId='native-qa-shared-onboarding';
    const state=page.snapshot(),client={id,name:'Shared onboarding client',isNew:true,onboarded:false,status:'Onboarding',progs:[]};
    state.clients.push(client);
    const records={clients:[{client_id:clientId,source_client_id:id,name:client.name,status:'onboarding',profile:{}}],requirements:[],users:[],contacts:[],assets:[],framework_assessments:[]};
    page.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{},onboardingPlan:approvedOnboardingPlan});
    page.actor({user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin'},state.clients.map(c=>c.id));
    page.prepareClient(state,id,records);overlayApprovedClientAssessments(state,records);page.apply(wireView(state),reconcileView);
    dom.window.location.hash='client-'+id+'-profile';await nextRoute(dom.window);
    const plan=dom.window.prepareMultiFrameworkOnboardingFixture(id);
    expect(plan).toHaveLength(33);
    expect(dom.window.document.querySelector('#v-client .onb-rail').textContent).toMatch(/Recurring Reviews\s*33/);
    const access=plan.filter(row=>row.t==='Account Authorization & Access Review');
    expect(access).toHaveLength(1);expect(new Set(access[0].maps.map(map=>map.k))).toEqual(new Set(['cis','nist','iso','soc','cmmc','hipaa']));
    expect(plan.find(row=>row.t==='Vulnerability & Remediation Process Review').cad).toBe('monthly');
    expect(Object.values(page.snapshot().onboarding[id].pol).filter(policy=>policy.ans==='unsure')).toHaveLength(17);
  }finally{dom.window.close();}
},30000);

test('applying and saving a reviewed guided proposal includes its reviewed checkpoint in the native save snapshot',async()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,saved=[];
    page.configure({busy:()=>false,persist:state=>{saved.push(state);return true;},command:()=>{}});
    page.actor({user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin'},['brawndo']);
    page.apply(page.snapshot());
    dom.window.location.hash='client-brawndo-item-1.1';await nextRoute(dom.window);
    dom.window.prepareGuidedFixture();
    dom.window.document.querySelector('[data-action="g-apply"]').click();
    expect(dom.window.document.getElementById('it-cur').value).toContain('Inventory is maintained');
    dom.window.document.querySelector('[data-action="item-save"]').click();
    const snapshot=saved.find(state=>state.reg.brawndo.items.find(i=>i.id==='1.1')?.cur?.includes('Inventory is maintained'));
    expect(snapshot).toBeTruthy();
    expect(snapshot.guideSaved['brawndo|cis:8.1|1.1']).toMatchObject({stage:'applied',draft:expect.stringContaining('Inventory is maintained')});
  }finally{dom.window.close();}
},30000);

test('all eight clients retain native business state through fourteen read-only surfaces and program switching',async()=>{
  const dom=openPage();
  try{
    const page=dom.window.GoverNaraNativePage,view=page.snapshot(),records=clone(scenario.records);
    const actor={user_id:'qa-operator',name:'QA Operator',email:'qa@example.test',role:'super_admin',status:'active'};
    // Signed-in imports retain fictional people as references, not accounts.
    records.users.forEach(user=>Object.assign(user,{reference_only:true,assignment_eligible:false,status:'reference_only'}));
    const contact=records.contacts.find(row=>row.client_id==='v3sample_brawndo');
    const contactAccount={user_id:'qa-contact-account',name:contact.name,email:'changed-contact@example.test',role:'client_grc_manager',
      status:'active',assignment_eligible:true,client_ids:['v3sample_brawndo']};
    contact.linked_user_id=contactAccount.user_id;records.users.push(contactAccount);
    const unlinked=records.contacts.filter(row=>row.client_id==='v3sample_brawndo')[1];
    unlinked.linked_user_id=null;unlinked.email=contactAccount.email;
    page.configure({hipaaSupplement:approvedHipaaSupplement,busy:()=>false,persist:()=>true,command:()=>{}});
    page.actor(actor,view.clients.map(c=>c.id));
    const scoped={};
    for(const client of view.clients){const cid=records.clients.find(c=>c.source_client_id===client.id).client_id;
      const tables=scope(records,cid),ctx={clientId:cid,sourceId:client.id,liveDates:true,
        userName:id=>tables.users.find(user=>user.user_id===id)?.name};
      scoped[cid]=tables;
      page.prepareClient(view,client.id,tables);overlayApprovedClientAssessments(view,tables);
      overlayApprovedV3Work(view,tables,ctx);overlayApprovedV3Registers(view,tables,ctx);overlayNativeAudit(view,tables,ctx);}
    overlayGlobalRecords(view,{account:actor,users:[actor,contactAccount],tools:serviceCatalog.tools},approvedV3IdentityMaps(records),scoped);
    page.apply(wireView(view),reconcileView);
    page.apply(wireView(page.snapshot()),reconcileView);
    for(const client of view.clients){
      const cid=records.clients.find(row=>row.source_client_id===client.id).client_id;
      expect(page.snapshot().records[client.id].contacts.map(row=>row.sourceRecordId)).toEqual(
        records.contacts.filter(row=>row.client_id===cid).map(row=>String(row.source_record_id??row.contact_id)));
    }
    function differences(a,b,prefix=''){
      if(JSON.stringify(a)===JSON.stringify(b))return [];
      if(!a||!b||typeof a!=='object'||typeof b!=='object')return [prefix+' '+JSON.stringify(a)+' => '+JSON.stringify(b)];
      return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>differences(a[key],b[key],prefix+'.'+key));
    }
    function businessState(state){
      const material=JSON.parse(workspaceMaterial(state));
      material.clients=Object.fromEntries(material.clients.map(([id,serialized])=>[id,JSON.parse(serialized)]));
      return material;
    }
    const findings=[];
    for(const client of view.clients)for(const route of ['', 'calendar','reviews','actions','program','risks','policies','vendors','ai','iventure','contacts','reports','evidence','profile']){
      const before=businessState(page.snapshot());dom.window.location.hash='client-'+client.id+(route?'-'+route:'');await nextRoute(dom.window);
      const diff=differences(before,businessState(page.snapshot()));if(diff.length)findings.push({client:client.id,route:route||'dashboard',diff});
    }
    expect(findings).toEqual([]);
    const linkedContact=page.snapshot().records.brawndo.contacts.find(row=>row.sourceRecordId===String(contact.source_record_id));
    expect(linkedContact).toMatchObject({access:true,accountStatus:'Active',invited:false});
    expect(page.snapshot().records.brawndo.contacts.find(row=>row.sourceRecordId===String(unlinked.source_record_id)))
      .toMatchObject({access:false,accountStatus:'',invited:false});
    dom.window.location.hash='client-prestige-program';await nextRoute(dom.window);
    for(const program of ['soc','iso','nist']){
      const before=page.snapshot();dom.window.document.querySelector('#side-client [data-action="prog-switch"][data-val="'+program+'"]').click();
      await nextRoute(dom.window);const after=page.snapshot();
      expect(after.clients.find(c=>c.id==='prestige').activeProg).toBe(program);
      expect(after.clients.find(c=>c.id==='prestige').progs.map(p=>p.reg)).toEqual(before.clients.find(c=>c.id==='prestige').progs.map(p=>p.reg));
      expect({program,businessChanged:workspaceMaterial(after)!==workspaceMaterial(before)}).toEqual({program,businessChanged:false});
    }
  }finally{dom.window.close();}
},120000);
