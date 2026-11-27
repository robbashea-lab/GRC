import {stable,commandRequest} from './commandRequests';

test('canonical bytes retain numeric keys, unknown own prototype keys, Unicode and ordered arrays',()=>{
  const value=JSON.parse('{"z":2,"10":"ten","2":"two","01":"leading","__proto__":{"safe":true},"nested":{"b":"日本語 ✓","a":null},"array":[{"z":2,"a":1},3,2,1]}');
  const before=JSON.stringify(value);
  expect(stable(value)).toBe('{"2":"two","10":"ten","01":"leading","__proto__":{"safe":true},"array":[{"a":1,"z":2},3,2,1],"nested":{"a":null,"b":"日本語 ✓"},"z":2}');
  expect(JSON.stringify(value)).toBe(before);
  expect(Object.hasOwn(value,'__proto__')).toBe(true);
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(stable({undefinedValue:undefined,array:[undefined,NaN,Infinity,-0],missing:null})).toBe('{"array":[null,null,null,0],"missing":null}');
  expect(stable(JSON.parse('{"value":1e999,"duplicate":1,"duplicate":2}'))).toBe('{"duplicate":2,"value":null}');
  expect(()=>stable({unsupported:1n})).toThrow();
});

test('canonicalization preserves getter and toJSON evaluation order',()=>{
  const events=[];
  const value={get b(){events.push('b');return 2;},get a(){events.push('a');return {toJSON(){events.push('nested toJSON');return {z:3,a:1};}};}};
  expect(stable(value)).toBe('{"a":{"a":1,"z":3},"b":2}');
  expect(events).toEqual(['a','b','nested toJSON']);
  expect(stable({toJSON(){return {z:2,a:1};}})).toBe('{"a":1,"z":2}');
});

test('persisted canonical receipts replay exactly, refuse changed intent and separate user client and route scopes',()=>{
  const scope=JSON.stringify(['owner','client-a','/tasks/item','request-1']);
  const db={user:{user_id:'owner'},command_requests:{[scope]:{fingerprint:'{"a":1,"nested":{"a":"✓","z":2},"z":3}',result:{task_id:'saved',details:{retained:true}}}}};
  const execute=jest.fn(()=>({task_id:'new'}));
  const body={z:3,nested:{z:2,a:'✓'},a:1};
  const replay=commandRequest(db,'/tasks/item','client-a','request-1',body,execute);
  expect(replay).toEqual({task_id:'saved',details:{retained:true}});
  expect(execute).not.toHaveBeenCalled();
  replay.details.retained=false;
  expect(db.command_requests[scope].result.details.retained).toBe(true);
  expect(()=>commandRequest(db,'/tasks/item','client-a','request-1',{...body,a:2},execute)).toThrow(expect.objectContaining({status:409}));
  expect(execute).not.toHaveBeenCalled();
  commandRequest(db,'/tasks/item','client-b','request-1',body,execute);
  commandRequest(db,'/tasks/other','client-a','request-1',body,execute);
  db.user.user_id='other';commandRequest(db,'/tasks/item','client-a','request-1',body,execute);
  expect(execute).toHaveBeenCalledTimes(3);
  expect(Object.keys(db.command_requests)).toHaveLength(4);
  expect(db.command_requests[scope].fingerprint).toBe('{"a":1,"nested":{"a":"✓","z":2},"z":3}');
});
