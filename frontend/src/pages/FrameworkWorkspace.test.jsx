import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis} from '@/lib/frameworks';
import api from '@/lib/api';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>({record,onNext,onOpenChange})=><div data-testid="opened">{record.definition_id}<button onClick={onNext}>Next</button><button onClick={()=>onOpenChange(false)}>Close</button></div>);
let mockNavigate,mockHistory,mockLocation;
jest.mock('react-router-dom',()=>({useSearchParams:()=>{const [p,set]=require('react').useState(mockLocation.params);return [p,(next,options={})=>{mockHistory.push({search:String(next),...options});mockLocation.state=options.state??null;set(new URLSearchParams(next));}];},useLocation:()=>mockLocation,useNavigate:()=>mockNavigate,Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{
 mockUser={user_id:'u',role:'super_admin'};mockNavigate=jest.fn();mockHistory=[];mockLocation={pathname:'/compliance/cis-ig1',search:'',state:null,params:new URLSearchParams()};
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.get.mockResolvedValue({data:{configured:true,selected:true,definitions:cis.requirements,assessments:cis.requirements.map((d,i)=>({framework_assessment_id:'a'+i,definition_id:d.id,client_id:'a',status:i===1?'not_assessed':'addressed'})),work:{}}});
});

test('only Brawndo Demo gets the program summary, derived views, automatic expansion and reset',async()=>{
 mockUser.workspace_mode='demo';
 const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 const summary=container.querySelector('[aria-labelledby="cis-summary-heading"]').textContent;
 expect(summary).toContain('Assessment coverage98%');expect(summary).toContain('Implemented98%');expect(summary).toContain('Neither measure is a compliance percentage');
 expect(buttons('In Progress')).toHaveLength(0);
 await act(async()=>[...container.querySelectorAll('.cis-legend button')].find(b=>b.textContent.startsWith('Not Assessed')).click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);
 expect(container.textContent).toContain('Showing 1 of 56 safeguards');
 await act(async()=>buttons('Clear search and filters')[0].click());
 expect(buttons('Clear search and filters')).toHaveLength(0);
 const search=container.querySelector('[aria-label="Search safeguards"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'no-result');search.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.textContent).toContain('Showing 0 of 56 safeguards');
 expect(container.querySelector('a[href="/client-profile?tab=program"]')).toBeTruthy();
});

test('Brawndo can reopen last viewed implemented safeguard without changing next-work logic',async()=>{
 mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify({lastId:'a0'}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 const back=[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Return to last opened: 1.1'));
 expect(back).toBeTruthy();await act(async()=>back.click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.1');
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const buttons=label=>[...container.querySelectorAll('button')].filter(b=>b.textContent===label);
test('Brawndo stale and unevidenced views are derived from dates and links, not stored flags',async()=>{
 mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map((a,i)=>({...a,client_id:'demo_brawndo',last_assessed:i===0?'2020-01-01':new Date().toISOString()}));
 response.work={a2:{evidence_count:1,latest_evidence_at:new Date().toISOString()}};
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 const signal=label=>[...container.querySelectorAll('.cis-signal')].find(b=>b.textContent.startsWith(label));
 expect(signal('Validation older than 12 months').textContent).toMatch(/1$/);
 expect(signal('Implemented without evidence').textContent).toMatch(/54$/);
 await act(async()=>signal('Validation older than 12 months').click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);expect(container.querySelector('[data-testid="requirement-1.1"]')).toBeTruthy();
});
test('native groups start collapsed and expand/collapse all without changing assessment data',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="a"/>));
 expect(buttons('Expand')).toHaveLength(15);expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(0);
 await act(async()=>buttons('Expand all')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(56);
 await act(async()=>buttons('Needs Attention')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);
 expect(container.querySelector('[data-testid="requirement-1.2"]')).toBeTruthy();
 await act(async()=>buttons('All')[0].click());await act(async()=>buttons('Collapse all')[0].click());expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(0);
 await act(async()=>buttons('Continue Assessment')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.2');
 await act(async()=>buttons('Next')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('2.1');
 expect(JSON.parse(sessionStorage.getItem('framework-workspace:u:a:cis-ig1')).lastId).toBe('a2');
});
test('a mismatched client response cannot populate the workspace or resume selection',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="b"/>));
 expect(buttons('Expand')).toHaveLength(0);expect(container.textContent).toContain('No pending assessments');
});

test('a requirement opened here is one history entry: Next replaces it and closing steps back to the view',async()=>{
 mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify({lastId:'a0'}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Return to last opened: 1.1')).click());
 expect(mockHistory.at(-1)).toMatchObject({search:'assessment=a0',replace:false,state:{fromWorkspace:true}});
 await act(async()=>buttons('Next')[0].click());
 expect(mockHistory.at(-1)).toMatchObject({replace:true,state:{fromWorkspace:true}});
 await act(async()=>buttons('Close')[0].click());
 expect(mockNavigate).toHaveBeenCalledWith(-1);
});

test('a deep-linked requirement closes in place without leaving the workspace',async()=>{
 mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo'}));
 mockLocation.params=new URLSearchParams('assessment=a0');
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));
 expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.1');
 await act(async()=>buttons('Close')[0].click());
 expect(mockNavigate).not.toHaveBeenCalled();
 expect(mockHistory.at(-1)).toMatchObject({search:'',replace:true});
});
