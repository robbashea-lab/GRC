import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Catalog from './NativeReportCatalog';
import api from '@/lib/api';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()},formatError:error=>error.message,PREVIEW_MODE:false}));
let root,node,scope,clickDownload;
const framework={key:'iso-27001',name:'ISO/IEC 27001',version:'2022'};
const preview=()=>({header:{client:{id:'c1',name:'Saved client'},program:framework,title:'Saved assessment',as_of:'2026-11-19',prepared_by:{name:'Saved reader'},lead:{name:null},qualifier:'Assessment progress and readiness, not a certification, attestation or auditor opinion.'},stats:[{label:'Implemented',value:0}],sections:[{title:'Saved results',columns:['ID','Status'],rows:[['A.5.1','Not assessed'],['A.5.2',null]]}],allowed_formats:['pdf','xlsx'],provenance:{framework_source_cutoff:'2026-11-19',read_completed_at:'2026-11-19',consistency:'Current saved records'}});
const exportRow={export_id:'actual-1',client_id:'c1',framework_key:'iso-27001',type:'risks',format:'csv',title:'Risk register',as_of:'2026-11-19',created_at:'2026-11-19',filename:'risks.csv'};
const button=(text,host=document)=>[...host.querySelectorAll('button')].find(node=>node.textContent===text);
const click=node=>act(async()=>node.click());
const render=(props={})=>act(async()=>root.render(<Catalog clientId="c1" framework={framework} scopeKey="scope" activeScope={scope} {...props}/>));
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true}));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;scope={current:'scope'};node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);api.get.mockImplementation(async path=>({data:path==='/reports/history'?{exports:[]}:path==='/reports/preview'?preview():new Blob(['id,title\r\nR1,Saved risk'],{type:'text/csv'})}));api.post.mockResolvedValue({data:exportRow});URL.createObjectURL=jest.fn(()=>'blob:real-export');URL.revokeObjectURL=jest.fn();clickDownload=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();clickDownload.mockRestore();jest.clearAllMocks();});
test('six native report cards preview actual authorized records, preserve unknowns and expose the selected cutoff',async()=>{await render();expect(node.querySelectorAll('.rep-card')).toHaveLength(6);expect(node.textContent).toContain('Statement of Applicability');expect(node.textContent).toContain('No exports have been generated');await click(node.querySelector('.rep-card button'));const dialog=document.querySelector('[role="dialog"]');expect(dialog.textContent).toContain('Saved client');expect(dialog.textContent).toContain('A.5.1');expect(dialog.textContent).toContain('Not assessed');expect(dialog.textContent).toContain('Not recorded');expect(dialog.textContent).toContain('DRAFT PREVIEW');expect(api.get).toHaveBeenCalledWith('/reports/preview',{params:{client_id:'c1',framework_key:'iso-27001',type:'assessment',as_of:node.querySelector('[aria-label="Report as of"]').value},signal:expect.any(AbortSignal)});expect(api.post).not.toHaveBeenCalled();});
test('mismatched preview data is withheld and a closing dialog ignores the pending response',async()=>{await render();api.get.mockResolvedValueOnce({data:{...preview(),header:{...preview().header,client:{id:'other',name:'Private client'}}}});await click(node.querySelector('.rep-card button'));expect(document.querySelector('[role="alert"]').textContent).toContain('could not be verified');expect(document.body.textContent).not.toContain('Private client');await click(button('Close'));let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await click(node.querySelector('.rep-card button'));const signal=api.get.mock.calls.at(-1)[1].signal;await click(button('Close'));await act(async()=>finish({data:preview()}));expect(signal.aborted).toBe(true);expect(document.querySelector('[role="dialog"]')).toBeNull();});
test('CSV export creates one native immutable export and downloads the returned identifier; Demo keeps PDF delivery disabled',async()=>{require('@/lib/api').PREVIEW_MODE=true;try{await render();await click(node.querySelectorAll('.rep-card')[3].querySelectorAll('button')[1]);let dialog=document.querySelector('[role="dialog"]');expect(dialog.querySelector('select').value).toBe('csv');await click(button('Export CSV',dialog));expect(api.post).toHaveBeenCalledWith('/reports/exports',expect.objectContaining({client_id:'c1',framework_key:'iso-27001',type:'risks',format:'csv'}),expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)}}));expect(api.get).toHaveBeenCalledWith('/reports/exports/actual-1/download',expect.objectContaining({responseType:'blob'}));expect(clickDownload).toHaveBeenCalledTimes(1);await click(button('Close'));await click(node.querySelector('.rep-card button'));dialog=document.querySelector('[role="dialog"]');expect(button('Export PDF',dialog).disabled).toBe(true);}finally{require('@/lib/api').PREVIEW_MODE=false;}});
test('a permission-scope change cannot download a late export response',async()=>{await render();await click(node.querySelectorAll('.rep-card')[3].querySelectorAll('button')[1]);const select=document.querySelector('[aria-label="Report export format"]');await act(async()=>{select.value='csv';select.dispatchEvent(new Event('change',{bubbles:true}));});let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await click(button('Export CSV'));scope.current='new-scope';await act(async()=>finish({data:exportRow}));expect(clickDownload).not.toHaveBeenCalled();expect(api.get.mock.calls.filter(([path])=>path.endsWith('/download'))).toHaveLength(0);});
test('an unconfirmed export retry retains its idempotency key while a later deliberate export uses a fresh intent',async()=>{await render();await click(node.querySelectorAll('.rep-card')[3].querySelectorAll('button')[1]);const select=document.querySelector('[aria-label="Report export format"]');await act(async()=>{select.value='csv';select.dispatchEvent(new Event('change',{bubbles:true}));});api.post.mockRejectedValueOnce(new Error('Delivery unconfirmed'));await click(button('Export CSV'));expect(document.querySelector('[role="alert"]').textContent).toContain('Delivery unconfirmed');await click(button('Export CSV'));expect(api.post.mock.calls[1][2].headers['Idempotency-Key']).toBe(api.post.mock.calls[0][2].headers['Idempotency-Key']);await click(button('Export CSV'));expect(api.post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(api.post.mock.calls[1][2].headers['Idempotency-Key']);expect(clickDownload).toHaveBeenCalledTimes(2);});

test('the initial cutoff uses the actual client reporting day rather than UTC',async()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-11-19T02:00:00Z'));
  try {
    await render({clientTimeZone:'Pacific/Honolulu'});
    const input=node.querySelector('[aria-label="Report as of"]');
    expect(input.value).toBe('2026-11-18');expect(input.max).toBe('2026-11-18');
    await click(node.querySelector('.rep-card button'));
    expect(api.get).toHaveBeenCalledWith('/reports/preview',expect.objectContaining({params:expect.objectContaining({as_of:'2026-11-18'})}));
  } finally {jest.useRealTimers();}
});

test('an immutable historical download is independent of an invalid new generation date',async()=>{
  api.get.mockImplementation(async path=>({data:path==='/reports/history'?{exports:[exportRow]}:new Blob(['Retained CSV'],{type:'text/csv'})}));
  await render();
  const input=node.querySelector('[aria-label="Report as of"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2999-01-01');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(node.querySelector('[aria-label="Download Risk register"]'));
  expect(api.post).not.toHaveBeenCalled();expect(clickDownload).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/reports/exports/actual-1/download',expect.objectContaining({responseType:'blob'}));
});

test('Demo scope exports choose the supported workbook while PDF-only reports remain unavailable',async()=>{
  require('@/lib/api').PREVIEW_MODE=true;
  try {
    await render();await click(node.querySelectorAll('.rep-card')[2].querySelectorAll('button')[1]);
    expect(document.querySelector('[aria-label="Report export format"]').value).toBe('xlsx');
    expect(button('Export XLSX').disabled).toBe(false);
  } finally {require('@/lib/api').PREVIEW_MODE=false;}
});
