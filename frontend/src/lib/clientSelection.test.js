import {selectedClient, rememberClient, clearClientSelection} from './clientSelection';
import * as api from './api';
jest.mock('./api',()=>({__esModule:true,PREVIEW_MODE:false}));
beforeEach(()=>{localStorage.clear();sessionStorage.clear();api.PREVIEW_MODE=false;});
test('Demo selection, reload reads and reset leave normal selection untouched',()=>{
  rememberClient('normal-synthetic-client');
  api.PREVIEW_MODE=true;
  expect(selectedClient()).toBe('');
  rememberClient('demo_initech');
  expect(selectedClient()).toBe('demo_initech');
  expect(localStorage.getItem('grc_client_id')).toBe('normal-synthetic-client');
  clearClientSelection();
  expect(selectedClient()).toBe('');
  api.PREVIEW_MODE=false;
  expect(selectedClient()).toBe('normal-synthetic-client');
});
