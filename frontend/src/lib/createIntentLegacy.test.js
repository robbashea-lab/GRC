import {createIntent, clearPendingCommands, syncPendingCommandIdentity} from './createIntent';

const prefix='grc_pending_command_v1:', identityKey='grc_pending_command_identity_v1';
const actor='user_012345abcdef', other='user_abcdef012345', client='synthetic-client';
const record='synthetic:framework:finding';
const update={notes:'SYNTHETIC QA ONLY',expected_updated_at:'original-cas'};
const cases=[
  ...['framework_assessments','ai_systems','reviews','findings','risks','policies','vendors','assets','tasks','exceptions','contacts','requirements']
    .map(kind=>[kind,`${actor}:${client}:${kind}:${record}:update`,`/${kind}/${record}`,update]),
  ['encoded record',`${actor}:${client}:findings:${record}:update`,`/findings/${encodeURIComponent(record)}`,update],
  ['review drawer',`${actor}:${client}:${record}:update`,`/reviews/${record}`,{...update,expected_occurrence_id:'original-occurrence'}],
  ['task work',`${actor}:${client}:${record}`,`/tasks/${record}`,update],
  ['finding decision',`${actor}:${client}:decision:${record}`,`/findings/${record}/validate`,{...update,rationale:'Synthetic adequate response'}],
  ['task-root decision',`${actor}:${client}:decision:task:synthetic`, `/findings/${record}/accept`,{...update,rationale:'Synthetic accepted decision'}],
  ['task-root reopen',`${actor}:${client}:reopen:task:synthetic`,`/findings/${record}/reopen`,update],
  ['calendar',`calendar:${actor}:${client}`,`/tasks/${record}`,{due_date:'2026-10-12',expected_updated_at:'original-cas'}],
  ['calendar finding',`calendar:${actor}:${client}`,`/findings/${record}`,{due_date:'2026-10-12',expected_updated_at:'original-cas'}],
  ['calendar review',`calendar:${actor}:${client}`,`/reviews/${record}`,{due_date:'2026-10-12',expected_updated_at:'original-cas',calendar_move:true,expected_occurrence_id:'original-occurrence'}],
  ['bulk',`bulk:${actor}:${client}:tasks`,'/bulk',{kind:'tasks',ids:[record],action:'status',payload:{status:'open'},expected_versions:{[record]:'original-cas'}}],
];
function store(scope,path,body=update){
  const key=prefix+scope;
  const raw=JSON.stringify({key:'synthetic-stable-command',snapshot:JSON.stringify([path,body])});
  sessionStorage.setItem(key,raw);return {key,raw};
}
beforeAll(()=>Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto}));
beforeEach(()=>{clearPendingCommands();sessionStorage.clear();localStorage.clear();});

test.each(cases)('same-actor legacy %s retains exact command, body and CAS for retry',async(name,scope,path,body)=>{
  const {key,raw}=store(scope,path,body);
  syncPendingCommandIdentity(actor,'standard');
  expect(sessionStorage.getItem(key)).toBe(raw);
  const post=jest.fn().mockResolvedValue({});
  await createIntent(post,scope).retry();
  expect(post).toHaveBeenCalledWith(path,body,expect.objectContaining({headers:{'Idempotency-Key':'synthetic-stable-command'}}));
  expect(sessionStorage.getItem(key)).toBeNull();
});

test.each(cases)('different-actor legacy %s is retired before current adoption', (name,scope,path,body)=>{
  const {key}=store(scope,path,body);
  syncPendingCommandIdentity(other,'standard');
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(sessionStorage.getItem(identityKey)).toBe(JSON.stringify(['standard',other]));
});

test('mixed legacy actors preserve the current actor exactly and retire only the other actor',()=>{
  const same=store(`${actor}:${client}:contacts:${record}:update`,`/contacts/${record}`);
  const old=store(`${other}:${client}:contacts:${record}:update`,`/contacts/${record}`);
  sessionStorage.setItem('unrelated-preference','keep');
  syncPendingCommandIdentity(actor,'standard');
  expect(sessionStorage.getItem(same.key)).toBe(same.raw);
  expect(sessionStorage.getItem(old.key)).toBeNull();
  expect(sessionStorage.getItem('unrelated-preference')).toBe('keep');
});

test.each([
  ['unsupported scope','unbound-scope','/contacts/record',update],
  ['record mismatch',`${actor}:${client}:contacts:record:update`,'/contacts/other',update],
  ['wrong route',`${actor}:${client}:contacts:record:update`,'https://other.invalid/contacts/record',update],
  ['bulk kind mismatch',`bulk:${actor}:${client}:tasks`,'/bulk',{kind:'findings',ids:['record'],action:'delete'}],
  ['invalid body',`${actor}:${client}:contacts:record:update`,'/contacts/record',[]],
  ['invalid CAS type',`${actor}:${client}:contacts:record:update`,'/contacts/record',{...update,expected_updated_at:42}],
  ['unknown action',`${actor}:${client}:decision:record`,'/findings/record/unknown',update],
  ['malformed escape',`${actor}:${client}:contacts:record:update`,'/contacts/%ZZ',update],
  ['unbound actor',`undefined:${client}:contacts:record:update`,'/contacts/record',update],
  ['unbound client',`${actor}:undefined:contacts:record:update`,'/contacts/record',update],
  ['unbound Calendar',`calendar:${actor}:null`,'/tasks/record',{...update,due_date:'2026-10-12'}],
])('unverifiable legacy %s blocks adoption without deleting or blessing its body',(name,scope,path,body)=>{
  const {key,raw}=store(scope,path,body);
  localStorage.setItem('grc_user',JSON.stringify({user_id:actor}));
  expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('recovery ownership');
  expect(sessionStorage.getItem(key)).toBe(raw);
  expect(sessionStorage.getItem(identityKey)).toBeNull();
});

test.each(['{bad json',JSON.stringify({key:'synthetic-legacy-key',snapshot:'bad json'}),JSON.stringify({snapshot:JSON.stringify(['/contacts/record',update])}),
  ...['short','x'.repeat(129),'synthetic-key-invalid!'].map(key=>JSON.stringify({key,snapshot:JSON.stringify(['/contacts/record',update])}))])(
  'malformed stored command blocks adoption unchanged: %s',raw=>{
    const key=prefix+`${actor}:${client}:contacts:record:update`;
    sessionStorage.setItem(key,raw);
    expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('recovery ownership');
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(sessionStorage.getItem(identityKey)).toBeNull();
  });

test.each([['demo_admin','standard'],[actor,'demo'],['opaque-legacy-actor','standard']])(
  'ambiguous legacy mode attribution blocks exact same actor %s in %s unchanged',(current,mode)=>{
    const {key,raw}=store(`${current}:${client}:contacts:record:update`,'/contacts/record');
    expect(()=>syncPendingCommandIdentity(current,mode)).toThrow('recovery ownership');
    expect(sessionStorage.getItem(key)).toBe(raw);expect(sessionStorage.getItem(identityKey)).toBeNull();
  });

test('normal seeded Demo recovery is retained exactly in Demo only',async()=>{
  const scope=`demo_admin:${client}:contacts:record:update`,{key,raw}=store(scope,'/contacts/record');
  syncPendingCommandIdentity('demo_admin','demo');
  expect(sessionStorage.getItem(key)).toBe(raw);
  const post=jest.fn().mockResolvedValue({});await createIntent(post,scope).retry();
  expect(post.mock.calls[0][2].headers['Idempotency-Key']).toBe('synthetic-stable-command');
});

test('an unversioned legacy record retains its explicit null CAS for exact retry',async()=>{
  const scope=`${actor}:${client}:contacts:record:update`,body={...update,expected_updated_at:null};
  store(scope,'/contacts/record',body);syncPendingCommandIdentity(actor,'standard');
  const post=jest.fn().mockResolvedValue({});await createIntent(post,scope).retry();
  expect(post.mock.calls[0][1].expected_updated_at).toBeNull();
});

test('blocked migration invalidates callbacks before they can restore or dispatch the retained body',async()=>{
  store('unbound-scope','/contacts/record');
  const post=jest.fn(),old=createIntent(post,'unbound-scope');
  expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('recovery ownership');
  expect(old.pendingRequest()).toBeNull();await expect(old.retry()).rejects.toThrow('ended workspace');
  expect(post).not.toHaveBeenCalled();
});

test('legacy adoption invalidates an already queued pre-attribution callback even for the same actor',async()=>{
  const scope=`${actor}:${client}:contacts:record:update`,post=jest.fn();
  const old=createIntent(post,scope),pending=old('/contacts/record',update);
  syncPendingCommandIdentity(actor,'standard');
  await expect(pending).rejects.toThrow('ended workspace');expect(post).not.toHaveBeenCalled();
  expect(createIntent(post,scope).pendingRequest()).toEqual(['/contacts/record',update]);
});

test('unknown entry is retained even when a known incompatible entry can be removed',()=>{
  const unknown=store('unknown-scope','/contacts/record');
  const prior=store(`${other}:${client}:contacts:record:update`,'/contacts/record');
  expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('recovery ownership');
  expect(sessionStorage.getItem(prior.key)).toBeNull();expect(sessionStorage.getItem(unknown.key)).toBe(unknown.raw);
  expect(sessionStorage.getItem(identityKey)).toBeNull();
});

test('same modern identity retains existing recovery and does not impose legacy identity restrictions',()=>{
  const current='opaque-existing-modern-user';syncPendingCommandIdentity(current,'standard');
  const {key,raw}=store('existing-modern-scope','/contacts/record');
  syncPendingCommandIdentity(current,'standard');
  expect(sessionStorage.getItem(key)).toBe(raw);
});

test('no legacy entries introduces no new authentication user-id restriction',()=>{
  syncPendingCommandIdentity('opaque-existing-user','standard');
  expect(sessionStorage.getItem(identityKey)).toBe(JSON.stringify(['standard','opaque-existing-user']));
});

test('failed incompatible removal blocks adoption and invalidates callbacks without a success marker',async()=>{
  const {key,raw}=store(`${other}:${client}:contacts:record:update`,'/contacts/record');
  const post=jest.fn(),old=createIntent(post,`${other}:${client}:contacts:record:update`);
  const remove=jest.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('Synthetic storage unavailable');});
  try{
    expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('Synthetic storage unavailable');
    expect(sessionStorage.getItem(key)).toBe(raw);expect(sessionStorage.getItem(identityKey)).toBeNull();
    await expect(old.retry()).rejects.toThrow('ended workspace');expect(post).not.toHaveBeenCalled();
  }finally{remove.mockRestore();}
});

test('failed identity-marker read still invalidates a cached callback before the blocked handoff',async()=>{
  const post=jest.fn(),old=createIntent(post);
  const read=jest.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Synthetic storage unreadable');});
  try{
    expect(()=>syncPendingCommandIdentity(actor,'standard')).toThrow('Synthetic storage unreadable');
    await expect(old('/contacts/record',update)).rejects.toThrow('ended workspace');
    expect(post).not.toHaveBeenCalled();
  }finally{read.mockRestore();}
});
