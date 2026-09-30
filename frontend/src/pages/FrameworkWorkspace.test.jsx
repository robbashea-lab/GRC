import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis, frameworkCatalog} from '@/lib/frameworks';
import api from '@/lib/api';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>({record,onNext,onOpenChange,breadcrumb})=><div data-testid="opened">{record.definition_id}<button onClick={onNext}>Next</button><button onClick={()=>onOpenChange(false)}>Close</button>{breadcrumb?.filter(c=>c.onClick).map(c=><button key={c.label} data-drawer-crumb onClick={c.onClick}>{c.label}</button>)}</div>);
let mockNavigate,mockHistory,mockLocation;
jest.mock('react-router-dom',()=>({useSearchParams:()=>{const [p,set]=require('react').useState(mockLocation.params);return [p,(next,options={})=>{mockHistory.push({search:String(next),...options});mockLocation.state=options.state??null;set(new URLSearchParams(next));}];},useLocation:()=>mockLocation,useNavigate:()=>mockNavigate,Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{
 mockUser={user_id:'u',role:'super_admin'};mockNavigate=jest.fn();mockHistory=[];mockLocation={pathname:'/compliance/cis-ig1',search:'',state:null,params:new URLSearchParams()};
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.get.mockResolvedValue({data:{configured:true,selected:true,definitions:cis.requirements,assessments:cis.requirements.map((d,i)=>({framework_assessment_id:'a'+i,definition_id:d.id,client_id:'a',status:i===1?'not_assessed':'addressed'})),work:{}}});
});

const brawndo=async(pref)=>{mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo',owner_id:a.definition_id==='1.1'?'u1':undefined,verification:a.definition_id==='1.1'?'verified':undefined}));
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[{user_id:'u1',name:'Pat Analyst'}]:response}));
 if(pref)sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify(pref));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));};
const crumbs=()=>[...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent);
const key=(el,k)=>act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})));
test('Brawndo summary, bar tooltips, and removed sections; Controls follow the summary',async()=>{
 await brawndo();
 const summary=container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent;
 expect(summary).toContain('98%Implemented55 of 56 safeguards');expect(summary).toContain('98%Assessed');expect(summary).toContain('1Still to assessContinue with safeguard 1.2');
 expect(summary).toContain('not a compliance percentage, certification or audit opinion');
 expect(container.querySelector('h1').textContent).toBe('CIS IG1');
 const seg=container.querySelector('[data-testid="bcis-seg-addressed"]');
 expect(seg.getAttribute('tabindex')).toBe('0');expect(seg.getAttribute('aria-label')).toBe('Implemented: 55 of 56 safeguards, 98%');
 expect(seg.querySelector('.bcis-tip').textContent).toBe('Implemented55 of 56 safeguards98%');
 expect(container.querySelector('[data-testid="bcis-seg-notAssessed"]').getAttribute('aria-label')).toBe('Not assessed: 1 of 56 safeguards, 2%');
 for(const gone of ['What to do next','Client organizational Controls','Return to last opened','All requirements'])expect(container.textContent).not.toContain(gone);
 expect(container.querySelector('.bcis-summary').nextElementSibling.classList.contains('bcis-controls')).toBe(true);
 expect(buttons('Open ›')).toHaveLength(0);
 expect(container.querySelectorAll('[data-testid^="control-row-"]')).toHaveLength(15);
 expect(container.querySelector('[data-testid="control-row-1"]').textContent).toContain('1 of 2');
 expect(container.querySelector('.bcis-foot').textContent).toBe('All 15 IG1 controls · 56 safeguards. Controls 13, 16 and 18 have no IG1 safeguards.');
});
test('Brawndo rows are whole-row links; breadcrumb round-trips control and safeguard',async()=>{
 await brawndo();expect(crumbs()).toEqual(['CIS IG1']);
 const row=container.querySelector('[data-testid="control-row-1"]');expect(row.getAttribute('role')).toBe('link');
 await act(async()=>row.click());expect(crumbs()).toEqual(['CIS IG1','Control 1']);
 expect([...container.querySelectorAll('.bcis-table thead th')].map(t=>t.textContent)).toEqual(['Safeguard','Implementation status','Verification','Owner','Last assessed']);
 expect(container.textContent).not.toMatch(/Evidence|Remediation/);
 const sg=container.querySelector('[data-testid="requirement-1.1"]');expect(sg.textContent).toContain('Verified');expect(sg.textContent).toContain('Pat Analyst');
 expect(container.querySelector('[data-testid="requirement-1.2"]').textContent).toContain('Unassigned');expect(container.querySelector('[data-testid="requirement-1.2"]').textContent).toContain('Not verified');
 await key(sg,'Enter');expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.1');
 expect(crumbs()).toEqual(['CIS IG1','Control 1','Safeguard 1.1']);
 mockLocation.state=null;// in-place close path; with workspace history the real router pops back instead
 await act(async()=>container.querySelector('[data-drawer-crumb]:last-of-type').click());expect(container.querySelector('[data-testid="opened"]')).toBeNull();expect(crumbs()).toEqual(['CIS IG1','Control 1']);
 await act(async()=>buttons('CIS IG1')[0].click());expect(crumbs()).toEqual(['CIS IG1']);
 await key(container.querySelector('[data-testid="control-row-2"]'),' ');expect(crumbs()).toEqual(['CIS IG1','Control 2']);
 expect(JSON.parse(sessionStorage.getItem('framework-workspace:u:demo_brawndo:cis-ig1'))['category:all']).toEqual([expect.stringContaining('2')]);
});
test('Brawndo filters are separate from navigation and clear back to controls',async()=>{
 await brawndo();
 await act(async()=>[...container.querySelectorAll('.bcis-legend button')].find(b=>b.textContent.startsWith('Not assessed')).click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(1);expect(crumbs()[0]).toBe('CIS IG1');expect(crumbs()).toHaveLength(2);
 await act(async()=>buttons('Clear filter')[0].click());expect(buttons('Clear filter')).toHaveLength(0);expect(crumbs()).toEqual(['CIS IG1']);
 const search=container.querySelector('[aria-label="Search safeguards"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'no-result');search.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.textContent).toContain('No safeguards match this view.');expect(crumbs()).toEqual(['CIS IG1','Search results']);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const buttons=label=>[...container.querySelectorAll('button')].filter(b=>b.textContent===label);
test('every client gets the reference workspace: categories start compact; open, resume and Next keep assessment data',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="a"/>));
 const toggles=()=>buttons('Open category'),rows=()=>container.querySelectorAll('[data-testid^="requirement-"]');
 expect(toggles()).toHaveLength(15);expect(rows()).toHaveLength(0);
 await act(async()=>buttons('Open category')[0].click());expect(rows()).toHaveLength(2);
 await act(async()=>buttons('All requirements')[0].click());expect(rows()).toHaveLength(56);
 await act(async()=>buttons('Categories')[0].click());expect(rows()).toHaveLength(0);
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Continue with')).click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.2');
 await act(async()=>buttons('Next')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('2.1');
 expect(JSON.parse(sessionStorage.getItem('framework-workspace:u:a:cis-ig1')).lastId).toBe('a2');
});
test('a mismatched client response cannot populate the workspace or resume selection',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="b"/>));
 expect(container.querySelectorAll('.cis-section-toggle')).toHaveLength(0);expect(container.textContent).toContain('0 of 0 applicable safeguards assessed');
 expect([...container.querySelectorAll('button')].some(b=>b.textContent.startsWith('Continue with'))).toBe(false);
});

test('a requirement opened here is one history entry: Next replaces it and closing steps back to the view',async()=>{
 await brawndo();await act(async()=>container.querySelector('[data-testid="control-row-1"]').click());
 await act(async()=>container.querySelector('[data-testid="requirement-1.1"]').click());
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

test('ISO has three primary views; SoA retains all 93 controls and audit is a separate program',async()=>{
 const definitions=frameworkCatalog('iso-27001').requirements;
 api.get.mockImplementation(async path=>({data:path==='/reviews'||path.endsWith('/members')?[]:path==='/iso-audit'?{program:null,reviews:[]}:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'iso'+i,definition_id:d.id,client_id:'a',status:'addressed',soa_applicability:d.specification==='annex_control'?'included':undefined})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="iso-27001" clientId="a"/>));
 expect(container.querySelector('[aria-label="ISO workspace sections"]').children).toHaveLength(3);
 expect(container.querySelector('[aria-labelledby="cis-summary-heading"]').textContent).toContain('30 of 30');
 await act(async()=>buttons('Statement of Applicability')[0].click());
 await act(async()=>buttons('All requirements')[0].click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(93);
 await act(async()=>buttons('Internal Audit Program')[0].click());
 expect(container.textContent).toContain('Program not activated');
 expect(container.querySelector('[aria-labelledby="cis-summary-heading"]')).toBeNull();
});

