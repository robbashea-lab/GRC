import {loadPortfolioRecord} from './portfolioRecord';
test.each([['review','reviews'],['finding','findings'],['task','tasks'],['risk','risks']])('opens the authoritative %s instead of a generic register',async(entity_type,kind)=>{
  const record={client_id:'a',title:'Current record',status:'open'};
  const api={get:jest.fn().mockResolvedValue({data:record})};
  expect(await loadPortfolioRecord(api,{entity_type,entity_id:'record-1',client_id:'a'})).toEqual({kind,record});
  expect(api.get).toHaveBeenCalledWith('/'+kind+'/record-1');
});
test('rejects wrong-client responses and unsupported records',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:{client_id:'b'}})};
  await expect(loadPortfolioRecord(api,{entity_type:'finding',id:'f',client_id:'a'})).rejects.toThrow('another client');
  api.get.mockClear();
  await expect(loadPortfolioRecord(api,{entity_type:'unknown',id:'f',client_id:'a'})).rejects.toThrow('cannot be opened');
  expect(api.get).not.toHaveBeenCalled();
});
