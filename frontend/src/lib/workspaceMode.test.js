let api, setWorkspaceMode, http;
beforeEach(()=>{
  jest.resetModules();localStorage.clear();sessionStorage.clear();
  process.env.REACT_APP_PREVIEW='true';
  process.env.REACT_APP_STANDARD_SIGN_IN='true';
  ({default:api,setWorkspaceMode}=require('./api'));
  http=jest.fn(async config=>({data:{standard:true},status:200,statusText:'OK',headers:{},config}));
  api.defaults.adapter=http;
});
test('deferred preview blocks standard requests even with a stale real token',async()=>{
  jest.resetModules();process.env.REACT_APP_STANDARD_SIGN_IN='false';
  const deferred=require('./api');deferred.default.defaults.adapter=http;
  localStorage.setItem('grc_token','stale-test-token');
  for(const endpoint of ['/auth/login','/auth/me','/clients','/auth/register','/auth/session']) {
    await expect(deferred.default.post(endpoint,{})).rejects.toMatchObject({code:'ERR_STANDARD_AUTH_DEFERRED'});
  }
  expect(http).not.toHaveBeenCalled();
  deferred.setWorkspaceMode('demo');await deferred.default.post('/demo/enter');
  expect((await deferred.default.get('/clients')).data).toHaveLength(7);
  await deferred.default.post('/auth/logout');deferred.setWorkspaceMode('standard');
  await expect(deferred.default.get('/auth/me')).rejects.toMatchObject({code:'ERR_STANDARD_AUTH_DEFERRED'});
  expect(localStorage.getItem('grc_token')).toBeNull();
});
test('standard mode uses HTTP; demo has no bearer token or HTTP writes',async()=>{
  require('./api').setAccessToken('generated-test-token');
  await api.get('/clients');expect(http).toHaveBeenCalledTimes(1);
  expect(http.mock.calls[0][0].headers.Authorization).toBe('Bearer generated-test-token');
  expect(localStorage.getItem('grc_token')).toBeNull();
  setWorkspaceMode('demo');await api.post('/demo/enter');
  const {data:clients}=await api.get('/clients');expect(clients).toHaveLength(7);
  await api.post('/clients',{name:'Isolated test client'});
  expect(http).toHaveBeenCalledTimes(1);expect(localStorage.getItem('grc_token')).toBeNull();
  setWorkspaceMode('standard');expect((await api.get('/clients')).data).toEqual({standard:true});
  expect(http).toHaveBeenCalledTimes(2);
  expect(http.mock.calls[1][0].headers.Authorization).toBeUndefined();
});
test('mode transitions clear client selection and demo entry; refresh preserves explicit mode',async()=>{
  setWorkspaceMode('demo');await api.post('/demo/enter');
  localStorage.setItem('grc_client_id','demo_brawndo');
  jest.resetModules();expect(require('./api').PREVIEW_MODE).toBe(true);
  require('./api').setWorkspaceMode('standard');
  expect(sessionStorage.getItem('grc_demo_entered')).toBeNull();
  expect(localStorage.getItem('grc_client_id')).toBeNull();
  jest.resetModules();expect(require('./api').PREVIEW_MODE).toBe(false);
});
test('demo adapter cannot authenticate an email/password request',async()=>{
  setWorkspaceMode('demo');
  await expect(api.post('/auth/login',{email:'test@example.test',password:'test-only-invalid'})).rejects.toMatchObject({response:{status:401}});
  expect(http).not.toHaveBeenCalled();
});
