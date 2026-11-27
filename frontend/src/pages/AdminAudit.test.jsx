import React,{act,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Link,Route,Routes} from 'react-router-dom';
import AdminAudit from './AdminAudit';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
let root,container;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  window.history.replaceState(null,'','/start');
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();api.get.mockReset();window.history.replaceState(null,'','/');});

test('opening Tool Catalog as the Audit heading mounts keeps the chosen route through late responses',async()=>{
  let clicked=false;
  const pending=[];
  api.get.mockImplementation((path,config)=>new Promise(resolve=>pending.push({path,resolve,signal:config?.signal})));
  function OpeningAudit() {
    useLayoutEffect(()=>{
      if(clicked)return;
      expect(container.querySelector('h1').textContent).toBe('Audit Log');
      clicked=true;
      container.querySelector('a[href="/admin/tools"]').click();
    },[]);
    return <AdminAudit/>;
  }
  await act(async()=>root.render(<BrowserRouter>
    <Link to="/admin/audit">Audit Log</Link><Link to="/admin/tools">Tool Catalog</Link>
    <Routes><Route path="/start" element={<h1>Administration</h1>}/>
      <Route path="/admin/audit" element={<OpeningAudit/>}/><Route path="/admin/tools" element={<h1>Tool Catalog</h1>}/></Routes>
  </BrowserRouter>));
  await act(async()=>container.querySelector('a[href="/admin/audit"]').click());
  expect(clicked).toBe(true);
  expect(window.location.pathname).toBe('/admin/tools');
  expect(pending.map(item=>item.path).sort()).toEqual(['/audit-logs','/audit-logs/facets']);
  expect(pending.every(item=>item.signal.aborted)).toBe(true);
  await act(async()=>pending.forEach(item=>item.resolve({data:item.path.endsWith('/facets')?{}:{items:[],total:0}})));
  expect(window.location.pathname).toBe('/admin/tools');
  expect(container.querySelector('h1').textContent).toBe('Tool Catalog');
});

test('bookmarked custom dates and query load directly; editing the search debounces the server request',async()=>{
  jest.useFakeTimers();
  try {
    const bookmark=new URLSearchParams({client:'client-a',action:'approve',date:'custom',start:'2026-11-01',end:'2026-11-20',q:'policy',from:'navigation'});
    window.history.replaceState(null,'','/admin/audit?'+bookmark);
    api.get.mockResolvedValue({data:{items:[],total:0}});
    await act(async()=>root.render(<BrowserRouter><AdminAudit/></BrowserRouter>));
    const queries=()=>api.get.mock.calls.filter(([path])=>path==='/audit-logs').map(([,config])=>config.params);
    expect(queries()).toEqual([expect.objectContaining({client_id:'client-a',action:'approve',start_date:'2026-11-01',end_date:'2026-11-20',q:'policy'})]);
    const search=container.querySelector('[data-testid="audit-search"]');
    expect(search.value).toBe('policy');
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'updated policy');
      search.dispatchEvent(new Event('input',{bubbles:true}));
    });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('updated policy');
    expect(queries()).toHaveLength(1);
    await act(async()=>jest.advanceTimersByTime(350));
    expect(queries().at(-1)).toEqual(expect.objectContaining({q:'updated policy',start_date:'2026-11-01',end_date:'2026-11-20'}));
    await act(async()=>container.querySelector('[data-testid="audit-reset"]').click());
    expect(window.location.search).toBe('?from=navigation');
  } finally {jest.useRealTimers();}
});
