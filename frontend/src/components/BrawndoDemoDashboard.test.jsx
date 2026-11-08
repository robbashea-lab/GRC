import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoDashboard,{CisDashboardPending} from './BrawndoDemoDashboard';
jest.mock('@/lib/api',()=>({formatError:error=>error.message}));
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const rows=Array.from({length:32},(_,i)=>({key:`tasks:${i}`,id:String(i),kind:'tasks',title:`Action ${i}`,type:'Action Item',owner:'Alex',status:'in_progress',due_date:'2026-10-15'}));
const queue={as_of:'2026-10-15',groups:{all:{total:32},pastDue:{total:0},due30:{total:32},unassigned:{total:0}}};
const props={queue,client:{client_id:'demo_brawndo',name:'Brawndo'},programs:[],filter:'all',onFilter:jest.fn(),onOpen:jest.fn(),loadDetail:async(key,offset,signal,{limit})=>({items:rows.slice(offset,offset+limit),offset,limit,total:rows.length,has_more:offset+limit<rows.length})};

test('concept groups approved presentation while Priority work keeps its native markup and controls',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props}><section data-testid="program">Native CIS</section></BrawndoDemoDashboard>));
 const original=container.querySelector('[aria-labelledby="bdd-work-heading"]').outerHTML;
 expect(container.querySelector('.cis-dashboard-concept-presentation')).toBeNull();
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} concept><section data-testid="program">Native CIS</section></BrawndoDemoDashboard>));
 const presentation=container.querySelector('.cis-dashboard-concept-presentation');
 expect(presentation.querySelector('[data-testid="program"]')).toBeTruthy();
 expect(presentation.querySelector('.bdd-summary')).toBeTruthy();
 expect(presentation.querySelector('#bdd-work-heading')).toBeNull();
 expect(container.querySelector('[aria-labelledby="bdd-work-heading"]').outerHTML).toBe(original);
 await act(async()=>container.querySelector('tbody button').click());
 expect(props.onOpen).toHaveBeenLastCalledWith(rows[0],expect.any(HTMLElement));
});

test('concept loading and error frame has no saved counts or queue requests and reuses native theme preference',async()=>{
 localStorage.setItem('omnisciente:brawndo-dashboard-theme','dark');
 await act(async()=>root.render(<CisDashboardPending client={{name:'Owned CIS'}}><p role="status">Loading dashboard…</p></CisDashboardPending>));
 expect(container.querySelector('[data-cis-dashboard-concept=true]').dataset.theme).toBe('dark');
 expect(container.querySelector('h1').textContent).toBe('Owned CIS Dashboard');
 expect(container.querySelector('.bdd-summary')).toBeNull();
 expect(container.querySelector('.bdd-table-scroll')).toBeNull();
 await act(async()=>container.querySelector('[aria-label="Switch to light theme"]').click());
 expect(localStorage.getItem('omnisciente:brawndo-dashboard-theme')).toBe('light');
 expect(container.querySelector('[data-cis-dashboard-concept=true]').dataset.theme).toBe('light');
 localStorage.clear();
});
test('renders eight rows from full work with native identity, full counts and page navigation',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props}><section>CIS IG1 Status</section></BrawndoDemoDashboard>));
 expect(container.querySelectorAll('tbody tr')).toHaveLength(8);expect(container.querySelector('.bdd-summary').textContent).toContain('32');expect(container.textContent).toContain('32 in progress');
 await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Next').click());
 expect(container.querySelector('nav[aria-label="Priority work pages"]').textContent).toContain('9–16 of 32');
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
 const linked=rows.map(row=>({...row,source_label:'CIS 1.1',safeguard_labels:['CIS Controls v8.1 1.1','CIS Controls v8.1 2.1']}));
 const loadDetail=async(key,offset,signal,{limit})=>({items:linked.slice(offset,offset+limit),offset,limit,total:linked.length,has_more:offset+limit<linked.length});
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} loadDetail={loadDetail}/>));
 expect([...container.querySelector('tbody .bdd-meta').children].map(node=>node.textContent)).toEqual(['Action Item','CIS 1.1','CIS 2.1']);
 expect([...container.querySelectorAll('tbody tr')[0].querySelectorAll('.bdd-framework-chip')].map(node=>node.textContent)).toEqual(['CIS 1.1','CIS 2.1']);
});

test('target row keeps native identity and separates owner, due and lifecycle without mutation controls',async()=>{
 const onOpen=jest.fn();
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} onOpen={onOpen}/>));
 const row=container.querySelector('tbody tr');
 expect(row.querySelector('.bdd-avatar').textContent).toBe('A');
 expect(row.querySelector('.bdd-avatar').getAttribute('aria-hidden')).toBe('true');
 expect([...row.children].map(node=>node.className)).toEqual(['bdd-cell-item','bdd-cell-owner','bdd-cell-due','bdd-cell-status','bdd-chevron']);
 expect(row.querySelector('time').dateTime).toBe('2026-10-15');
 expect(row.querySelector('.bdd-status').textContent).toBe('In progress');
 expect(row.querySelectorAll('button')).toHaveLength(1);
 await act(async()=>row.querySelector('.bdd-cell-owner').click());
 expect(onOpen).toHaveBeenCalledTimes(1);
 expect(onOpen).toHaveBeenCalledWith(rows[0],row.querySelector('button'));
});

test('unknown membership has no invented program-wide chip',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props}/>));
 expect(container.querySelector('tbody .bdd-meta').textContent).toBe('Action Item');
 expect(container.querySelector('tbody .bdd-framework-chip')).toBeNull();
});

test('clean Dashboard copy, compact dates and pagination retain real metadata and accessible table naming',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props}/>));
 expect(container.querySelector('h1').textContent).toBe('Brawndo Dashboard');
 expect(container.querySelector('.bdd-heading p').textContent).toContain('As of Oct 15, 2026');
 expect(container.querySelector('.bdd-heading p').textContent).not.toContain('AM');
 expect(container.querySelector('input[type=search]').placeholder).toBe('Search work…');
 expect(container.querySelector('caption').textContent).toBe('Priority work');expect(container.querySelector('caption').className).toBe('sr-only');
 expect(container.textContent).not.toContain('Authoritative active work');
 expect(container.querySelector('.bdd-cell-due time').textContent).toBe('Oct 15, 2026');
 expect(container.querySelector('.bdd-cell-due time').dateTime).toBe(rows[0].due_date);
 expect(container.querySelector('.bdd-summary button:nth-child(3) small').textContent).toBe('Next due Oct 15');
 expect(container.querySelector('.bdd-results [role=status]').textContent).toBe('32 items');
 expect(container.querySelector('nav[aria-label="Priority work pages"]').textContent).toContain('1–8 of 32');
});

test('snapshot instants show the actual UTC time and filtered emptiness retains clear filters',async()=>{
 await act(async()=>root.render(<BrawndoDemoDashboard {...props} queue={{...queue,as_of:'2026-10-15T23:21:00Z'}}/>));
 expect(container.querySelector('.bdd-heading p').textContent).toContain('Oct 15, 2026, 11:21 PM UTC');
 const input=container.querySelector('input[type=search]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Nothing matches');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.querySelectorAll('tbody tr')).toHaveLength(0);expect(container.querySelector('.bdd-empty h3').textContent).toBe('No work matches these filters');
 await act(async()=>container.querySelector('.bdd-empty button').click());
 expect(input.value).toBe('');expect(container.querySelectorAll('tbody tr')).toHaveLength(8);expect(props.onFilter).toHaveBeenCalledWith('all');
});
