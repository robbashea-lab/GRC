/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {applyGlobalChanges,overlayGlobalRecords} from './adminCommands';

function openPage(route='users-access',expose=''){
  const root=path.join(__dirname,'../../..');
  const source=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  return new JSDOM(source.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#'+route,runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

test('Security & Auth describes native enforcement without claiming unimplemented protections',()=>{
  const dom=openPage('security-auth');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot();
    const actor={user_id:'owner',name:'Owner',email:'owner@example.test',role:'super_admin',status:'active'};
    page.configure({busy:()=>false,command:()=>{},persist:()=>true});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    const cards=Array.from(dom.window.document.querySelectorAll('#sec-grid .sec-card'));
    expect(cards.map(card=>card.querySelector('.sec-title').textContent)).toEqual([
      'Authentication','Password policy','Password storage','Session lifetime','Abuse protection','Transport security']);
    expect(cards.every(card=>card.querySelector('svg')&&card.querySelector('.sec-tag'))).toBe(true);
    const text=cards.map(card=>card.querySelector('.sec-text').textContent);
    expect(text[0]).toMatch(/Accounts must be active/);
    expect(text[0]).toMatch(/MFA and automatic account disabling for inactivity are not available/);
    expect(text[1]).toMatch(/15–128 characters/);
    expect(text[1]).toMatch(/password expiration and password history checks are not available/);
    expect(text[2]).toMatch(/scrypt; existing bcrypt credentials remain supported/);
    expect(text[3]).toMatch(/Seven-day sessions; no inactivity timeout/);
    expect(text[3]).toMatch(/HttpOnly cookies/);
    expect(text[4]).toMatch(/30 requests per source IP and endpoint per minute/);
    expect(text[4]).toMatch(/account lockout is not available/);
    expect(text[5]).toBe('Hosted server configuration requires HTTPS origins and Secure cookies.');
    expect(text.join(' ')).not.toMatch(/12–128|every 60 days|last 12 passwords|after 15 minutes|after 5 failed/);
  }finally{dom.window.close();}
});

test('account security describes native password requirements and does not simulate a successful password save',()=>{
  const dom=openPage('account');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot(),persist=jest.fn();
    const actor={user_id:'owner',name:'Owner',email:'owner@example.test',role:'super_admin',status:'active'};
    page.configure({busy:()=>false,command:()=>{},persist});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    dom.window.document.querySelector('[data-action="ac-tab"][data-val="security"]').click();
    const help=dom.window.document.querySelector('#ac-conf + .help');
    expect(help.textContent).toMatch(/Existing records → My Account/);
    expect(help.textContent).toMatch(/15–128 characters/);
    expect(help.textContent).not.toMatch(/12–128|one letter/);
    dom.window.document.querySelector('[data-action="ac-pwd"]').click();
    expect(dom.window.document.querySelector('#toast').textContent).toContain('This password form has not been submitted.');
    expect(persist).not.toHaveBeenCalled();
  }finally{dom.window.close();}
});

test('finishing an archive cannot close a different unsaved dialog in the same client',async()=>{
  const dom=openPage('client-prestige-evidence',`window.openIntegrityDialog=function(){
    openDlg('Unsaved client edit','Current client','<input id="unsaved-review-note" value="Operator draft">','');
  };`);
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot();
    const actor={user_id:'owner',name:'Owner',email:'owner@example.test',role:'super_admin',status:'active'};
    let finish;
    const archive=jest.fn(()=>new Promise(resolve=>{finish=resolve;}));
    page.configure({busy:()=>false,command:()=>{},persist:()=>true,downloadEvidenceArchive:archive});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    dom.window.document.querySelector('#v-client [data-action="ev-zip"][data-val="__all"]').click();
    dom.window.document.querySelector('#dlg [data-action="ev-zip-go"]').click();
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(archive).toHaveBeenCalledTimes(1);
    dom.window.document.querySelector('#dlg [data-action="dlg-close"]').click();
    dom.window.openIntegrityDialog();
    finish({downloaded:true,fileCount:1,message:'ZIP download started: 1 verified file.'});
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(false);
    expect(dom.window.document.getElementById('dlg-title').textContent).toBe('Unsaved client edit');
    expect(dom.window.document.getElementById('unsaved-review-note').value).toBe('Operator draft');
  }finally{dom.window.close();}
});

test('the completion footer describes validation only for the exact linked Finding action',()=>{
  const dom=openPage('client-brawndo-actions');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot(),command=jest.fn();
    const actor={user_id:'owner',name:'Operator',email:'owner@example.test',role:'super_admin',status:'active'};
    const work=state.work.brawndo;
    work.findings.push({id:'qa-finding',title:'Confirmed gap',st:'Open',actionIds:['qa-finding-action']});
    for(const [id,findingId] of [['qa-finding-action','qa-finding'],['qa-manual-action',null]])
      work.acts.push({id,title:'Action '+id,source:'Manual',findingId,owner:actor.name,st:'Open',kind:'act',
        due:work.acts[0].due,pri:'Medium',detail:'Recorded work',evidence:[]});
    page.configure({busy:()=>false,command,persist:()=>true});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    for(const [id,label] of [['qa-finding-action','Submit for validation'],['qa-manual-action','Complete and close']]){
      dom.window.document.querySelector('[data-action="open-act"][data-id="'+id+'"]').click();
      dom.window.document.querySelector('#drawer [data-action="act-complete-dlg"]').click();
      expect(dom.window.document.querySelector('#dlg [data-action="dlg-run"]').textContent).toBe(label);
      expect(page.snapshot().work.brawndo.acts.find(row=>row.id===id).st).toBe('Open');
      dom.window.document.querySelector('#dlg [data-action="dlg-close"]').click();
      dom.window.document.querySelector('#drawer [data-action="drawer-close"]').click();
    }
    expect(command).not.toHaveBeenCalled();
  }finally{dom.window.close();}
});

test('audit-only readback preserves an open operator draft and its valid Save',()=>{
  const dom=openPage('client-brawndo-policies');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot(),persist=jest.fn(()=>true);
    const actor={user_id:'owner',name:'Operator',email:'owner@example.test',role:'super_admin',status:'active'};
    page.configure({busy:()=>false,command:()=>{},persist});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    const policy=page.snapshot().programs.brawndo.pols[0];
    [...dom.window.document.querySelectorAll('[data-action="open-pol"]')].find(node=>node.dataset.id===policy.name).click();
    dom.window.document.querySelector('#drawer [data-action="pol-description"]').click();
    const input=dom.window.document.getElementById('f-description');input.value='Operator draft survives audit readback';
    persist.mockClear();
    page.audit(state.audit.concat([{i:999,t:{$date:'2026-11-26T17:00:00Z'},client:'brawndo',user:actor.name,
      action:'prepare-export',entity:'cmmc_workbook',title:'Synthetic SSP export',eid:'native-client',native:true,nativeLogId:'native-export'}]),state.activity);
    expect(input.value).toBe('Operator draft survives audit readback');
    expect(dom.window.document.getElementById('dlg-scrim').hidden).toBe(false);expect(persist).not.toHaveBeenCalled();
    dom.window.document.querySelector('#dlg [data-action="dlg-run"]').click();
    expect(persist).toHaveBeenCalled();
    expect(page.snapshot().programs.brawndo.pols.find(row=>row.wfId===policy.wfId).description).toBe('Operator draft survives audit readback');
  }finally{dom.window.close();}
});

test('audit-only readback adds native actions and preserves the current Audit filter',()=>{
  const dom=openPage('audit-log');
  try{
    const page=dom.window.GoverNaraNativePage,state=page.snapshot();
    page.configure({busy:()=>false,command:()=>{},persist:()=>true});
    page.actor({user_id:'owner',name:'Operator',email:'owner@example.test',role:'super_admin',status:'active'},state.clients.map(client=>client.id));
    page.apply(state);
    const entries=state.audit.concat([{i:999,t:{$date:'2026-11-26T17:00:00Z'},client:'brawndo',user:'Operator',
      action:'prepare-export',entity:'cmmc_workbook',title:'Synthetic SSP export',eid:'native-client',native:true,nativeLogId:'native-export'}]);
    page.audit(entries,state.activity);
    const filter=dom.window.document.getElementById('al-action');
    expect([...filter.options].some(option=>option.value==='prepare-export')).toBe(true);
    filter.value='prepare-export';filter.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    page.audit(entries,state.activity);
    expect(dom.window.document.getElementById('al-action').value).toBe('prepare-export');
  }finally{dom.window.close();}
});

test('the real access dialog retains a native client lead while revoking account membership',async()=>{
  const dom=openPage();
  try{
    const actor={user_id:'actual-owner',name:'Operator',email:'operator@example.test',role:'super_admin',status:'active'};
    const writer={user_id:'writer',name:'Writer',email:'writer@example.test',role:'client_contributor',status:'active',
      client_ids:['native-brawndo','other-tenant'],updated_at:'v4'};
    const globals={account:actor,users:[actor,writer],tools:[]},identityMaps={clientIds:{brawndo:'native-brawndo'}};
    const page=dom.window.GoverNaraNativePage,state=page.snapshot(),commands=[];
    state.users=[];state.clients.find(client=>client.id==='brawndo').lead='Writer';
    overlayGlobalRecords(state,globals,identityMaps);
    page.configure({busy:()=>false,command:(name,args)=>commands.push({name,args}),persist:()=>true});
    page.actor(actor,state.clients.map(client=>client.id));page.apply(state);
    const before=page.snapshot(),index=before.users.findIndex(user=>user.nativeUserId==='writer');
    const click=selector=>{const button=dom.window.document.querySelector(selector);expect(button).not.toBeNull();button.click();};
    click('[data-action="user-menu"][data-idx="'+index+'"]');
    click('[data-action="u-access"][data-idx="'+index+'"]');
    click('#ux-c-brawndo');click('[data-action="save-access"]');
    await Promise.resolve();
    const after=page.snapshot();
    expect(after.clients.find(client=>client.id==='brawndo').lead).toBeNull(); // Confirm the reference handler's automatic side effect.
    const api={patch:jest.fn(async()=>({data:{user_id:'writer'}}))};
    await applyGlobalChanges({before,after,globals,actor,api,identityMaps,commands});
    expect(api.patch.mock.calls).toEqual([['/users/writer/client-memberships',{
      client_ids:['other-tenant'],expected_updated_at:'v4'}]]);
    expect(after.clients.find(client=>client.id==='brawndo').lead).toBe('Writer');
    expect(after.users.find(user=>user.nativeUserId==='writer').clients).toEqual([]);
  }finally{dom.window.close();}
});

test('an explicit client lead clear without an access command remains unchanged',async()=>{
  const actor={user_id:'owner',role:'super_admin'};
  const before={account:{},users:[],toolCatalog:[],clients:[{id:'brawndo',lead:'Writer'}]};
  const after={...before,clients:[{id:'brawndo',lead:null}]};
  const result=await applyGlobalChanges({before,after,globals:{account:actor,users:[],tools:[]},actor,api:{},identityMaps:{clientIds:{}}});
  expect(result.didWrite).toBe(false);expect(after.clients[0].lead).toBeNull();
});

test('historical client_viewer accounts retain the native readonly role in administration',()=>{
  const account={user_id:'owner',role:'super_admin',name:'Owner',status:'active'};
  const viewer={user_id:'legacy-reader',role:'client_viewer',name:'Read-only contact',status:'active',client_ids:['native-brawndo']};
  const state=overlayGlobalRecords({users:[],account:{},toolCatalog:[]},{account,users:[account,viewer],tools:[]},{clientIds:{brawndo:'native-brawndo'}});
  expect(state.users.find(user=>user.id==='legacy-reader')).toMatchObject({role:'cread',status:'Active',clients:['brawndo']});
  expect(viewer.role).toBe('client_viewer');
});

test('refreshing the actor keeps account-action indexes attached to the displayed user in either render order',()=>{
  const outcomes=[];
  for(const bindBefore of [false,true]){
    const dom=openPage();
    try{
      const page=dom.window.GoverNaraNativePage,state=page.snapshot();
      const actor={user_id:'owner',name:'Verified owner',email:'owner@example.test',role:'super_admin',status:'active'};
      const writer={user_id:'writer',name:'Writer',email:'writer@example.test',role:'client_contributor',status:'active',client_ids:['native-brawndo']};
      state.account.role=actor.role; // The real bootstrap transports the native role key.
      state.users=[];overlayGlobalRecords(state,{account:actor,users:[actor,writer],tools:[]},{clientIds:{brawndo:'native-brawndo'}});
      page.configure({busy:()=>false,command:()=>{},persist:()=>true});
      if(bindBefore)page.actor(actor,state.clients.map(c=>c.id));
      page.apply(state);
      if(!bindBefore)page.actor(actor,state.clients.map(c=>c.id));
      const button=dom.window.document.querySelector('[aria-label="Actions for Writer"]');
      outcomes.push({bindBefore,selected:page.snapshot().users[Number(button.dataset.idx)].nativeUserId});
      expect(page.snapshot().account.role).not.toBe('super_admin');
    }finally{dom.window.close();}
  }
  expect(outcomes).toEqual([{bindBefore:false,selected:'writer'},{bindBefore:true,selected:'writer'}]);
});
