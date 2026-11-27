import api,{setWorkspaceMode} from './api';
let current,adapter,events;
const guard=()=>{if(!current)throw new Error('Synthetic assessment authority ended');};
beforeEach(()=>{
  sessionStorage.clear();current=true;setWorkspaceMode('standard');
  adapter=jest.fn(async config=>({data:{saved:true},status:200,statusText:'OK',headers:{},config}));
  events=jest.spyOn(window,'dispatchEvent');
});
afterEach(()=>jest.restoreAllMocks());
test('the queued Axios interceptor refuses a command whose owner ended before transport dispatch',async()=>{
  const request=api.post('/comments',{body:'synthetic'},{adapter,assessmentAuthority:guard});
  current=false;
  await expect(request).rejects.toThrow('authority ended');
  expect(adapter).not.toHaveBeenCalled();
  expect(events.mock.calls.some(([event])=>event.type==='grc:portfolio-changed')).toBe(false);
});
test('the last transform checks authority after caller serialization and before the adapter',async()=>{
  await expect(api.patch('/framework_assessments/synthetic',{implementation:'draft'},{
    adapter,assessmentAuthority:guard,
    transformRequest:[data=>{current=false;return data;}],
  })).rejects.toThrow('authority ended');
  expect(adapter).not.toHaveBeenCalled();
});
test.each(['success','rejection'])('an ended transport %s cannot publish a portfolio event or expose a rejected receipt header',async outcome=>{
  let settle,started;
  const entered=new Promise(resolve=>{started=resolve;});
  adapter.mockImplementation(config=>new Promise((resolve,reject)=>{
    settle=()=>outcome==='success'?resolve({data:{saved:true},status:200,headers:{},config}):
      reject(Object.assign(new Error('Native rejection'),{config,response:{headers:{'x-create-rejected':'true'},data:{detail:'Native rejection'}}}));
    started();
  }));
  const result=api.patch('/framework_assessments/synthetic',{implementation:'draft'},{adapter,assessmentAuthority:guard}).catch(error=>error);
  await entered;current=false;settle();
  const error=await result;
  expect(error.message).toBe('Synthetic assessment authority ended');
  expect(error.response).toBeUndefined();
  expect(events.mock.calls.some(([event])=>event.type==='grc:portfolio-changed')).toBe(false);
});
test('same-owner authoritative rejections keep their native receipt semantics',async()=>{
  const rejection=Object.assign(new Error('Native rejection'),{response:{headers:{'x-create-rejected':'true'}}});
  adapter.mockImplementation(async config=>{rejection.config=config;throw rejection;});
  await expect(api.post('/comments',{body:'synthetic'},{adapter,assessmentAuthority:guard})).rejects.toBe(rejection);
  expect(adapter).toHaveBeenCalledTimes(1);
});
