import {act} from 'react';
import {createRoot} from 'react-dom/client';
import V3QuarterLedger from './V3QuarterLedger';

let host,root;
const now=new Date(2026,10,17);
const source=[
  {id:'old',kind:'monthly',title:'Earlier review',date:'2026-09-30'},
  {id:'current',kind:'monthly',title:'November review',date:'2026-11-15'},
  {id:'second',kind:'monthly',title:'<Second> review',date:'2026-11-15'},
  {id:'saved',kind:'annual',title:'Closed annual review',date:'2026-11-14',status:'completed'},
  {id:'next',kind:'quarterly',title:'December review',date:'2026-12-01'},
];
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(props={}){await act(async()=>root.render(<V3QuarterLedger kind="reviews" events={source} now={now} {...props}/>));}
test('uses native quarter counts, retains earlier overdue items separately and opens the exact record in a grouped mark',async()=>{
  const open=jest.fn();await render({onOpen:open});
  const totals=host.querySelector('.ql-totals');expect(totals.dataset.total).toBe('4');expect(totals.dataset.overdue).toBe('2');
  expect(host.querySelector('.ql-earlier-point').dataset.count).toBe('1');
  expect(host.querySelector('.ql-completed').dataset.count).toBe('1');
  const grouped=host.querySelector('.ql-point[data-count="2"]');
  await act(async()=>grouped.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const choice=[...host.querySelectorAll('.v3-ledger-tip button')].find(n=>n.textContent==='<Second> review');
  expect(choice).toBeTruthy();await act(async()=>choice.click());
  expect(open).toHaveBeenCalledWith(source[2],expect.any(Function));
  expect(open.mock.calls[0][1]()).toBe(true);
  expect(document.activeElement).toBe(grouped);
  await act(async()=>host.querySelector('[aria-label="Previous quarter"]').click());
  expect(host.querySelector('.ql-totals').dataset.total).toBe('1');
});
test('does not invent dates or treat an informational vendor anniversary as delinquent',async()=>{
  const item={id:'contract',kind:'ren',date:'2026-10-01',title:'Contract date',outstanding:false};
  await render({kind:'vendors',events:[item,item,{id:'missing',kind:'rev',date:null}],onOpen:jest.fn()});
  expect(host.querySelector('.ql-totals').dataset.total).toBe('1');expect(host.querySelector('.ql-totals').dataset.overdue).toBe('0');
  await render({available:false,onOpen:jest.fn()});
  expect(host.querySelector('.ql-chart')).toBeNull();expect(host.querySelector('[role="status"]').textContent).toContain('unavailable');
});
