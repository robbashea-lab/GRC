import api from './api';
import {resolveEvidenceSource} from './evidenceContext';

jest.mock('./api',()=>({__esModule:true,default:{get:jest.fn()}}));

const clientId='synthetic-client-a';
const target={ai_system_id:'synthetic-ai-1',client_id:clientId,name:'Synthetic AI system'};
const source={kind:'ai_systems',id:target.ai_system_id,available:true};

beforeEach(()=>jest.clearAllMocks());

test('AI Evidence uses the shared authorized collection contract and selects the exact same-client record',async()=>{
  api.get.mockResolvedValue({data:[null,{...target,client_id:'synthetic-client-b'},
    {...target,ai_system_id:'another-ai'},target]});

  const resolved=await resolveEvidenceSource(source,clientId);

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/ai_systems',{params:{client_id:clientId}});
  expect(resolved).toEqual({kind:'ai_systems',record:target,initialValues:{}});
  expect(resolved.record).toBe(target);
});

test.each([
  ['missing record',[]],
  ['foreign record',[{...target,client_id:'synthetic-client-b'}]],
  ['missing client identity',[{ai_system_id:target.ai_system_id}]],
  ['ambiguous identity',[target,{...target}]],
  ['malformed collection',{items:[target]}],
  ['absent collection',null],
])('AI Evidence refuses a %s',async(_label,data)=>{
  api.get.mockResolvedValue({data});
  await expect(resolveEvidenceSource(source,clientId)).rejects.toThrow('Source not found for this client.');
});

test.each([
  ['missing client',source,undefined],
  ['empty client',source,''],
  ['missing record ID',{...source,id:undefined},clientId],
  ['empty record ID',{...source,id:''},clientId],
])('AI Evidence refuses %s before requesting a collection',async(_label,ref,cid)=>{
  await expect(resolveEvidenceSource(ref,cid)).rejects.toThrow('Source not found for this client.');
  expect(api.get).not.toHaveBeenCalled();
});

test.each([401,403])('AI Evidence preserves the native %s denial',async status=>{
  const denial=Object.assign(new Error('Native access denied'),{response:{status}});
  api.get.mockRejectedValue(denial);
  await expect(resolveEvidenceSource(source,clientId)).rejects.toBe(denial);
});

test('unavailable Evidence sources remain unavailable without a request',async()=>{
  await expect(resolveEvidenceSource({...source,available:false},clientId)).rejects.toThrow('Source unavailable.');
  expect(api.get).not.toHaveBeenCalled();
});

test('other native sources retain their single-record routes and exact records',async()=>{
  const record={control_id:'control/1',client_id:clientId};
  api.get.mockResolvedValue({data:record});
  await expect(resolveEvidenceSource({kind:'organizational_controls',id:record.control_id,available:true},clientId))
    .resolves.toEqual({kind:'organizational_controls',record,initialValues:{}});
  expect(api.get).toHaveBeenCalledWith('/organizational-controls/control%2F1');
});

test('other native sources retain their client boundary',async()=>{
  api.get.mockResolvedValue({data:{risk_id:'risk-1',client_id:'synthetic-client-b'}});
  await expect(resolveEvidenceSource({kind:'risks',id:'risk-1',available:true},clientId))
    .rejects.toThrow('Source not found for this client.');
  expect(api.get).toHaveBeenCalledWith('/risks/risk-1');
});

test('Review sources retain the exact saved historical occurrence',async()=>{
  const occurrence={occurrence_id:'saved-occurrence',status:'completed',due_date:'2022-01-15'};
  const record={review_id:'review-1',client_id:clientId,occurrences:[occurrence]};
  api.get.mockResolvedValue({data:record});
  const resolved=await resolveEvidenceSource({kind:'reviews',id:record.review_id,
    occurrence_id:occurrence.occurrence_id,available:true},clientId);
  expect(resolved).toEqual({kind:'reviews',record,initialValues:{occurrence}});
  expect(resolved.initialValues.occurrence).toBe(occurrence);
  expect(api.get).toHaveBeenCalledWith('/reviews/review-1');
});
