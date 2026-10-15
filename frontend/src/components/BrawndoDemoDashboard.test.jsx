import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoDashboard from './BrawndoDemoDashboard';
jest.mock('@/lib/api',()=>({formatError:error=>error.message}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const rows=Array.from({length:32},(_,i)=>({key:`tasks:${i}`,id:String(i),kind:'tasks',title:`Action ${i}`,type:'Action Item',owner:'Alex',status:'in_progress',due_date:'2026-10-15'}));
const queue={as_of:'2026-10-15',groups:{all:{total:32},pastDue:{total:0},due30:{total:32},unassigned:{total:0}}};
const props={queue,client:{client_id:'demo_brawndo',name:'Brawndo'},programs:[],filter:'all',onFilter:jest.fn(),onOpen:jest.fn(),loadDetail:async(key,offset,signal,{limit})=>({items:rows.slice(offset,offset+limit),offset,limit,total:rows.length,has_more:offset+limit<rows.length})};
test('renders eight rows from full work with native identity, full counts and page navigation',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props}><section>CIS IG1 Status</section></BrawndoDemoDashboard>));
 expect(container.querySelectorAll('tbody tr')).toHaveLength(8);expect(container.querySelector('.bdd-summary').textContent).toContain('32');expect(container.textContent).toContain('32 in progress');
 await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Next').click());
 expect(container.querySelector('[role=status]').textContent).toContain('9–16');
 await act(async()=>container.querySelector('tbody button').click());expect(props.onOpen).toHaveBeenCalledWith(rows[8],expect.any(HTMLElement));
 await act(async()=>container.querySelector('.bdd-summary button').click());expect(props.onFilter).toHaveBeenCalledWith('all');
});
test('failed full queue never falls back to a partial preview',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} loadDetail={async()=>{throw new Error('Network unavailable');}}/>));
 expect(container.querySelector('[role=alert]').textContent).toContain('Network unavailable');expect(container.querySelector('tbody')).toBeNull();expect(container.textContent).toContain('Work results unavailable');
});

test('Program-wide needs proven framework arrays and never guesses unknown rows',async()=>{
 const known=rows.map((row,i)=>({...row,framework_membership_known:true,framework_keys:i===0?[]:['cis-ig1']}));
 const loadDetail=async(key,offset,signal,{limit})=>({items:known.slice(offset,offset+limit),offset,limit,total:known.length,has_more:offset+limit<known.length});
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} loadDetail={loadDetail}/>));
 const framework=container.querySelectorAll('select')[0];expect(framework.textContent).toContain('Program-wide');
 await act(async()=>{framework.value='__program_wide';framework.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.querySelectorAll('tbody tr')).toHaveLength(1);expect(container.querySelector('tbody').textContent).toContain('Action 0');
 const unresolved=async(key,offset,signal,{limit})=>({items:known.slice(offset,offset+limit).map(row=>({...row,framework_keys:[],framework_membership_known:false})),offset,limit,total:known.length,has_more:offset+limit<known.length});
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} loadDetail={unresolved} key="unknown"/>));
 expect(container.querySelectorAll('select')[0].textContent).not.toContain('Program-wide');
});


test('visible safeguard associations use authoritative labels without duplicate repeats',async()=>{
 const linked=rows.map(row=>({...row,source_label:'CIS 1.1',safeguard_labels:['CIS 1.1','CIS 2.1']}));
 const loadDetail=async(key,offset,signal,{limit})=>({items:linked.slice(offset,offset+limit),offset,limit,total:linked.length,has_more:offset+limit<linked.length});
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} loadDetail={loadDetail}/>));
 expect(container.querySelector('tbody small').textContent).toBe('Action Item · CIS 1.1 · CIS 2.1');
});
