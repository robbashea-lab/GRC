import api from './api';
import {assertPendingCommandGeneration} from './createIntent';

jest.mock('axios',()=>({__esModule:true,default:{create:()=>({interceptors:{request:{use:jest.fn()},response:{use:jest.fn()}}})}}));
jest.mock('./createIntent',()=>({clearPendingCommands:jest.fn(),assertPendingCommandGeneration:jest.fn()}));
const [success,failure]=api.interceptors.response.use.mock.calls[0];

test('only successful business writes publish portfolio invalidation after the identity fence',()=>{
  const changed=jest.fn();
  window.addEventListener('grc:portfolio-changed',changed);
  try {
    success({config:{method:'get',url:'/frameworks/cis-ig1'}});
    success({config:{method:'post',url:'/auth/login'}});
    success({config:{method:'post',url:'/demo/enter'}});
    expect(changed).not.toHaveBeenCalled();
    success({config:{method:'patch',url:'/framework-assessments/a'}});
    expect(changed).toHaveBeenCalledTimes(1);
    assertPendingCommandGeneration.mockImplementationOnce(()=>{throw new Error('Identity replaced');});
    expect(()=>success({config:{method:'patch',url:'/clients/a'}})).toThrow('Identity replaced');
    expect(changed).toHaveBeenCalledTimes(1);
    return expect(failure({message:'Rejected write',config:{method:'patch'}})).rejects.toMatchObject({message:'Rejected write'});
  } finally {window.removeEventListener('grc:portfolio-changed',changed);}
});
