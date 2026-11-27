import {selectedClient, rememberClient, clearClientSelection, clientDestination} from './clientSelection';
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

test('native deep links retain the exact client identity and existing workspace parameters',()=>{
  expect(clientDestination('client b','/compliance/soc-2?view=addressed')).toBe('/compliance/soc-2?view=addressed&client_id=client+b');
  expect(clientDestination('a','/dashboard?client_id=old')).toBe('/dashboard?client_id=a');
});

test('client links retain fragments and complete query values without changing selection',()=>{
  rememberClient('remembered-client');
  expect(clientDestination('g','/client-profile?tab=program&origin=review#history')).toBe('/client-profile?tab=program&origin=review&client_id=g#history');
  expect(clientDestination('g','/dashboard#work')).toBe('/dashboard?client_id=g#work');
  expect(clientDestination('g','/contacts?open=a?b&client_id=old#contact')).toBe('/contacts?open=a%3Fb&client_id=g#contact');
  expect(selectedClient()).toBe('remembered-client');
});
