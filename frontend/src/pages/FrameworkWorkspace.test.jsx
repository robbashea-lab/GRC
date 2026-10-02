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
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.get.mockResolvedValue({data:{configured:true,selected:true,definitions:cis.requirements,assessments:cis.requirements.map((d,i)=>({framework_assessment_id:'a'+i,definition_id:d.id,client_id:'a',status:i===1?'not_assessed':'addressed'})),work:{}}});
});

const brawndo=async(pref)=>{mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo',owner_id:a.definition_id==='1.1'?'u1':undefined,verification:a.definition_id==='1.1'?'verified':undefined}));
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[{user_id:'u1',name:'Pat Analyst'}]:response}));
 if(pref)sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify(pref));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));};
const crumbs=()=>[...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent);
const key=(el,k)=>act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})));
const prestige=async()=>{mockUser.workspace_mode='demo';const definitions=frameworkCatalog('soc-2').requirements,active=definitions.filter(d=>['security','availability','confidentiality'].includes(d.category));
 const assessments=definitions.map((d,i)=>({framework_assessment_id:'soc'+i,definition_id:d.id,client_id:'demo_prestige',status:i<28?'addressed':i<33?'in_progress':['A1.1','A1.2'].includes(d.id)?'needs_attention':'not_assessed',owner_id:d.id==='CC1.1'?'u1':undefined,last_assessed:d.id==='CC1.1'?'2026-09-15T12:00:00Z':null}));
 const response={configured:true,selected:true,definitions,assessments,active_definition_ids:active.map(d=>d.id),configuration:{categories:['security','availability','confidentiality']},organizational_controls:[],work:{}};
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[{user_id:'u1',name:'David Wallace'}]:response}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="soc-2" clientId="demo_prestige"/>));};
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
test('Prestige SOC 2 uses scoped progress and category-first hierarchy without configuration clutter',async()=>{
 await prestige();const workspace=container.querySelector('[data-testid="prestige-soc-workspace"]');expect(workspace).toBeTruthy();
 expect(workspace.querySelector('h1').textContent).toBe('SOC 2');expect(workspace.textContent).not.toMatch(/Scope and observation period settings|Client organizational Controls|Include retained out-of-scope criteria|System boundary and service commitments/);
 const summary=workspace.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent;
 expect(summary).toContain('74%Implemented28 of 38 criteria');expect(summary).toContain('92%Assessed');expect(summary).toContain('3Still to assess');
 const partial=workspace.querySelector('[data-testid="psoc-seg-partial"]');expect(partial.tabIndex).toBe(0);expect(partial.getAttribute('aria-label')).toBe('Partially Implemented: 5 of 38 criteria, 13%');expect(partial.querySelector('.bcis-tip').textContent).toBe('Partially Implemented5 of 38 criteria13%');
 expect(workspace.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(3);expect(workspace.querySelector('[data-testid="soc-category-security"]').textContent).toContain('Security — Common Criteria33');
 expect(workspace.textContent).not.toMatch(/Processing Integrity|Privacy/);
 await act(async()=>buttons('Dark')[0].click());expect(workspace.dataset.theme).toBe('dark');await act(async()=>buttons('Light')[0].click());expect(workspace.dataset.theme).toBe('light');
 await act(async()=>[...workspace.querySelectorAll('.bcis-legend button')].find(b=>b.textContent.startsWith('Not Assessed')).click());
 expect(workspace.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(3);expect(crumbs()).toEqual(['SOC 2','Not yet assessed']);
 await act(async()=>buttons('Clear filter')[0].click());expect(crumbs()).toEqual(['SOC 2']);
});
test('Prestige SOC 2 rows support keyboard navigation, native groups, criteria and breadcrumbs',async()=>{
 await prestige();await key(container.querySelector('[data-testid="soc-category-security"]'),'Enter');expect(crumbs()).toEqual(['SOC 2','Security']);expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(9);
 await key(container.querySelector('[data-testid="soc-group-CC1"]'),' ');expect(crumbs()).toEqual(['SOC 2','Security','CC1']);expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(5);
 const criterion=container.querySelector('[data-testid="requirement-CC1.1"]');expect(criterion.getAttribute('role')).toBe('link');expect(criterion.textContent).toContain('Implemented');expect(criterion.textContent).toContain('David Wallace');
 await act(async()=>criterion.click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('CC1.1');expect(crumbs()).toEqual(['SOC 2','Security','CC1','CC1.1']);
 mockLocation.state=null;await act(async()=>[...container.querySelectorAll('[data-drawer-crumb]')].find(b=>b.textContent==='CC1').click());expect(container.querySelector('[data-testid="opened"]')).toBeNull();expect(crumbs()).toEqual(['SOC 2','Security','CC1']);
 await act(async()=>buttons('SOC 2')[0].click());await act(async()=>container.querySelector('[data-testid="soc-category-availability"]').click());expect(crumbs()).toEqual(['SOC 2','Availability']);expect(container.querySelectorAll('[data-testid^="soc-group-"]')).toHaveLength(1);expect(container.querySelector('[data-testid="soc-group-A1"]')).toBeTruthy();
 await act(async()=>buttons('SOC 2')[0].click());await act(async()=>container.querySelector('[data-testid="soc-category-confidentiality"]').click());expect(container.querySelector('[data-testid="soc-group-C1"]')).toBeTruthy();
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const buttons=label=>[...container.querySelectorAll('button')].filter(b=>b.textContent===label);
test('every client gets the reference workspace: categories start compact; open, resume and Next keep assessment data',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="a"/>));
 const controls=()=>container.querySelectorAll('[data-testid^="control-row-"]'),rows=()=>container.querySelectorAll('[data-testid^="requirement-"]');
 expect(controls()).toHaveLength(15);expect(rows()).toHaveLength(0);
 await act(async()=>controls()[0].click());expect(rows()).toHaveLength(2);
 await act(async()=>buttons('CIS IG1')[0].click());expect(controls()).toHaveLength(15);expect(rows()).toHaveLength(0);
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Continue with')).click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('1.2');
 await act(async()=>buttons('Next')[0].click());expect(container.querySelector('[data-testid="opened"]').textContent).toContain('2.1');
 expect(JSON.parse(sessionStorage.getItem('framework-workspace:u:a:cis-ig1')).lastId).toBe('a2');
});
test('a mismatched client response cannot populate the workspace or resume selection',async()=>{
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="b"/>));
 expect(container.querySelectorAll('[data-testid^="control-row-"]')).toHaveLength(0);expect(container.textContent).toContain('0 of 0 safeguards');
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

test('ISO has five focused workspaces; SoA retains all 93 controls and audit is a separate program',async()=>{
 const definitions=frameworkCatalog('iso-27001').requirements;
 api.get.mockImplementation(async path=>({data:['/reviews','/risks','/findings','/tasks','/policies'].includes(path)||path.endsWith('/members')?[]:path==='/iso-audit'?{program:null,reviews:[]}:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'iso'+i,definition_id:d.id,client_id:'a',status:'addressed',soa_applicability:d.specification==='annex_control'?'included':undefined})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="iso-27001" clientId="a"/>));
 expect(container.querySelector('[aria-label="ISO workspace sections"]').children).toHaveLength(5);
 expect(container.querySelector('[aria-label="ISMS Overview"]')).not.toBeNull();
 expect(container.querySelectorAll('.iso-program-card')).toHaveLength(4);
 expect(container.textContent).not.toContain('Connected programme records');
 await act(async()=>buttons('ISMS Requirements')[0].click());
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent).toContain('30 of 30');
 expect(container.querySelector('.bcis-explain').textContent).toContain('(30 of 30)');
 const panel=container.querySelector('[role="tabpanel"]');
 expect(panel.getAttribute('aria-labelledby')).toBe('iso-tab-isms_clause');
 expect(panel.tabIndex).toBe(0);
 await act(async()=>buttons('Statement of Applicability')[0].click());
 await act(async()=>buttons('All controls')[0].click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(93);
 expect(container.textContent).toContain('Necessary — Implemented');
 await act(async()=>buttons('Annex A Controls')[0].click());
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent).toContain('93 of 93');
 await act(async()=>buttons('Internal Audit')[0].click());
 expect(container.textContent).toContain('Program not activated');
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]')).toBeNull();
});

test('ISO default presentation preserves SoA scope and uses native category buttons and guarded drawer breadcrumbs',async()=>{
 const definitions=frameworkCatalog('iso-27001').requirements;
 const annex=definitions.filter(d=>d.specification==='annex_control');
 mockLocation.params=new URLSearchParams('iso_view=soa');
 api.get.mockImplementation(async path=>({data:['/reviews','/risks','/findings','/tasks','/policies'].includes(path)||path.endsWith('/members')?[]:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'iso'+i,definition_id:d.id,client_id:'new-client',status:d.id===annex[0].id?'not_assessed':'addressed',soa_applicability:d.id===annex[1].id?'excluded':'included'})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="iso-27001" clientId="new-client"/>));
 expect(container.querySelector('.framework-presentation')).not.toBeNull();
 expect(container.querySelector('[aria-label="Statement of Applicability status"]').textContent).toContain('93 of 93 necessity decisions recorded');
 expect(container.querySelector('.framework-category-row').tagName).toBe('BUTTON');
 await act(async()=>buttons('All controls')[0].click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(93);
 await act(async()=>container.querySelector(`[data-testid="requirement-${annex[0].id}"] button`).click());
 expect(container.querySelector('[aria-label="ISO workspace sections"] [aria-selected="true"]').textContent).toBe('Statement of Applicability');
 expect(container.querySelector('[data-testid="opened"]').textContent).toContain('Statement of Applicability');
 await act(async()=>[...container.querySelectorAll('[data-drawer-crumb]')].find(b=>b.textContent==='Statement of Applicability').click());
 expect(container.querySelector('[data-testid="opened"]')).toBeNull();
 expect(mockHistory.at(-1).search).toBe('iso_view=soa');
 await act(async()=>buttons('Annex A Controls')[0].click());
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent).toContain('91 of 92');
 expect(container.querySelector('.bcis-explain').textContent).toContain('Only Annex A controls marked Necessary are counted in this view.');
 expect(container.querySelector('.bcis-explain').textContent).toContain('(91 of 92)');
 expect(container.querySelector('.bcis-explain').textContent).toContain('controls concluded');
 expect(container.querySelector('.bcis-explain').textContent).toContain('(1 excluded)');
});

test.each(['cis-ig1','hipaa'])('%s with all records N/A explains why readiness is not calculated',async frameworkKey=>{
 const definitions=frameworkCatalog(frameworkKey).requirements;
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'na'+i,definition_id:d.id,client_id:'a',status:'not_applicable'})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey={frameworkKey} clientId="a"/>));
 const figures=[...container.querySelectorAll('.bcis-figure,.cis-measure-value')].slice(0,2);
 expect(figures.map(n=>n.textContent)).toEqual(['—','—']);
 const disclosure=container.querySelector('details');
 expect(disclosure.querySelector('summary').textContent).toBe('How is this calculated?');
 expect(disclosure.textContent).toContain('readiness is not calculated');
});
