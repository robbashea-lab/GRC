/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {approvedV3Records} from '../preview/approvedV3Records';

function openApprovedPage(){
  const root=path.join(__dirname,'../../..');
  const page=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const marker='p16Initialize();\nif (!location.hash)';
  return new JSDOM(page.replace(marker,'p16Initialize();\n'+hook+'\nwindow.nativeOwners=ownerOptions;\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

test('a freshly loaded native client gets empty approved registers, exact selected program levels and eligible owner choices',()=>{
  const dom=openApprovedPage();
  try{
    const api=dom.window.GoverNaraNativePage,state=api.snapshot(),id='fresh-client',cid='cli_real';
    state.clients.push({id,name:'Reopened client',status:'Active',isNew:true,progs:[]});
    const config={'cis-ig1':{implementation_group:2},'soc-2':{categories:['security','processing_integrity']},cmmc:{level:1}};
    const requirements=['cis-ig1','soc-2','cmmc','iso-27001','hipaa','nist-csf-2'].map(baseline_key=>({client_id:cid,baseline_key,baseline_response:'applies'}));
    const records={clients:[{client_id:cid,source_client_id:id,framework_settings:config,onboarding_baseline:{completed:true}}],
      requirements,users:[{name:'Eligible',status:'active',role:'super_admin'},{name:'Sample',status:'active',role:'platform_admin',reference_only:true},
        {name:'Same name',status:'active',role:'client_contributor',email:'first@example.test'},
        {name:'Same name',status:'active',role:'client_contributor',email:'second@example.test'},
        {name:'Historical owner',status:'active',role:'client_contributor',assignment_eligible:false}]};
    api.configure({busy:()=>false,command:()=>{},persist:()=>true});
    api.prepareClient(state,id,records);
    api.actor({user_id:'actual-user',name:'Taylor Jordan',email:'tj@example.test',role:'platform_admin'},[id]);
    expect(dom.window.document.querySelector('[data-menu="user"]').textContent).toBe('TJ');
    expect(dom.window.document.getElementById('pop-user').textContent).toContain('tj@example.test');
    expect(dom.window.document.getElementById('pop-user').textContent).not.toContain('explorer@omnisciente.example');
    const client=state.clients.at(-1),program=key=>client.progs.find(p=>p.k===key);
    expect(state.work[id].revs).toEqual([]);expect(state.programs[id].risks).toEqual([]);
    expect(state.records[id]).toMatchObject({contacts:[],systems:[],ai:[]});
    expect(client.progs).toHaveLength(6);expect(program('cis').ig).toBe(2);expect(program('cmmc').level).toBe(1);
    expect(program('soc').cats).toEqual(['security','processing']);
    expect(program('soc').reg.items.some(i=>i.id.startsWith('PI'))).toBe(true);
    expect(client.progs.every(p=>p.reg.items.every(i=>i.st==='A'))).toBe(true);
    expect(dom.window.nativeOwners(id)).toEqual(['Eligible','first@example.test','second@example.test','Unassigned']);
    const projected=approvedV3Records({...state,clients:[client]}, {clientIds:{[id]:cid},clientFieldsOnly:true});
    expect(projected.framework_assessments.filter(a=>a.framework_key==='soc-2').some(a=>a.definition_id.startsWith('PI'))).toBe(true);
    program('cis').reg.items[0].st='P';
    api.prepareClient(state,id,records);
    expect(program('cis').reg.items[0].st).toBe('P');expect(client.progs).toHaveLength(6);
    requirements[1].baseline_response='retired';
    api.prepareClient(state,id,records);
    expect(program('soc').retired).toBe(true);
  }finally{dom.window.close();}
});

test('the approved user dialog captures an explicit role change for the actual account and blocks reference-person edits',async()=>{
  const dom=openApprovedPage();
  try{
    const {document,GoverNaraNativePage:page}=dom.window,state=page.snapshot();
    const command=jest.fn(),persist=jest.fn(()=>true);
    state.users=[{name:'Reference person',email:'ref@example.test',role:'owner',referenceOnly:true,status:'Reference only',clients:'all'},
      {name:'Writer',email:'writer@example.test',id:'actual-writer',nativeUserId:'actual-writer',role:'ccontrib',status:'Active',clients:['brawndo']}];
    page.configure({busy:()=>false,command,persist});page.apply(state);
    page.actor({user_id:'actual-admin',email:'admin@example.test',name:'Administrator',role:'super_admin'},['brawndo']);
    const click=(action,index)=>{
      const b=document.createElement('button');b.dataset.action=action;b.dataset.idx=String(index);
      document.body.append(b);b.click();b.remove();
    };
    click('u-role',1);
    const field=document.getElementById('ur-role');
    expect(field).toBeTruthy();field.value='cmgr';
    document.querySelector('[data-action="save-role"]').click();
    await Promise.resolve();
    expect(command).toHaveBeenCalledWith('adminAction',['save-role','actual-writer']);
    expect(persist.mock.calls.at(-1)[0].users.find(u=>u.nativeUserId==='actual-writer').role).toBe('cmgr');
    const calls=command.mock.calls.length;
    click('save-role',0);await Promise.resolve();
    expect(command).toHaveBeenCalledTimes(calls);
    expect(page.snapshot().users[0].role).toBe('owner');
  }finally{dom.window.close();}
});
