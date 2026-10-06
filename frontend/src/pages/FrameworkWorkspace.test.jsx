import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from './FrameworkWorkspace';
import {cis, frameworkCatalog} from '@/lib/frameworks';
import {socConfiguration} from '@/lib/socReadiness';
import api from '@/lib/api';
let mockUser;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
jest.mock('@/components/FrameworkDrawer',()=>({record,onNext,onOpenChange,breadcrumb,recordManagement})=><div data-testid="opened" data-management={recordManagement?'true':'false'}>{record.definition_id}<button onClick={onNext}>Next</button><button onClick={()=>onOpenChange(false)}>Close</button>{breadcrumb?.filter(c=>c.onClick).map(c=><button key={c.label} data-drawer-crumb onClick={c.onClick}>{c.label}</button>)}</div>);
let mockNavigate,mockHistory,mockLocation;
jest.mock('react-router-dom',()=>({useSearchParams:()=>{const [p,set]=require('react').useState(mockLocation.params);return [p,(next,options={})=>{mockHistory.push({search:String(next),...options});mockLocation.state=options.state??null;set(new URLSearchParams(next));}];},useLocation:()=>mockLocation,useNavigate:()=>mockNavigate,Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
let root,container;
beforeEach(()=>{
 mockUser={user_id:'u',role:'super_admin'};mockNavigate=jest.fn();mockHistory=[];mockLocation={pathname:'/compliance/cis-ig1',search:'',state:null,params:new URLSearchParams()};
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();localStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 api.patch.mockReset();api.patch.mockResolvedValue({data:{}});
 api.get.mockResolvedValue({data:{configured:true,selected:true,definitions:cis.requirements.filter(d=>d.implementation_group===1),assessments:cis.requirements.filter(d=>d.implementation_group===1).map((d,i)=>({framework_assessment_id:'a'+i,definition_id:d.id,client_id:'a',status:i===1?'not_assessed':'addressed'})),work:{}}});
});

const brawndo=async(pref)=>{mockUser.workspace_mode='demo';const response=(await api.get()).data;
 response.assessments=response.assessments.map(a=>({...a,client_id:'demo_brawndo',owner_id:a.definition_id==='1.1'?'u1':undefined,verification:a.definition_id==='1.1'?'verified':undefined}));
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[{user_id:'u1',name:'Pat Analyst'}]:response}));
 if(pref)sessionStorage.setItem('framework-workspace:u:demo_brawndo:cis-ig1',JSON.stringify(pref));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId="demo_brawndo"/>));};
const crumbs=()=>[...container.querySelectorAll('.bcis-crumbs li')].map(l=>l.textContent);
const key=(el,k)=>act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})));
const prestige=async({clientId='demo_prestige',selected=true}={})=>{mockUser.workspace_mode='demo';const definitions=frameworkCatalog('soc-2').requirements,active=definitions.filter(d=>['security','availability','confidentiality'].includes(d.category));
 const assessments=definitions.map((d,i)=>({framework_assessment_id:'soc'+i,definition_id:d.id,client_id:clientId,status:i<28?'addressed':i<33?'in_progress':['A1.1','A1.2'].includes(d.id)?'needs_attention':'not_assessed',owner_id:d.id==='CC1.1'?'u1':undefined,last_assessed:d.id==='CC1.1'?'2026-09-15T12:00:00Z':null}));
 const response={configured:true,selected,definitions,assessments,active_definition_ids:active.map(d=>d.id),configuration:{...socConfiguration(),categories:['security','availability','confidentiality']},organizational_controls:[],work:{}};
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[{user_id:'u1',name:'David Wallace'}]:response}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="soc-2" clientId={clientId}/>));return response;};
const socSettings=()=>[...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Scope and observation period settings');

test.each(['cis-ig1','soc-2','iso-27001'])('%s requirement rows expose exact contextual management separately from assessment',async frameworkKey=>{
 const definition=frameworkCatalog(frameworkKey).requirements[0];
 const row={framework_assessment_id:'exact-assessment',framework_key:frameworkKey,definition_id:definition.id,client_id:'a',status:'not_assessed'};
 if(frameworkKey==='iso-27001')mockLocation.params=new URLSearchParams('iso_view=isms_clause');
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:{configured:true,selected:true,definitions:[definition],assessments:[row],active_definition_ids:[definition.id],configuration:{implementation_group:1,categories:['security']},work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey={frameworkKey} clientId="a"/>));
 const search=container.querySelector('input[aria-label^="Search"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,definition.id);search.dispatchEvent(new Event('input',{bubbles:true}));});
 const manage=container.querySelector(`button[aria-label="Manage ${definition.id} ${definition.title}"]`);
 expect(manage).toBeTruthy();await act(async()=>manage.click());
 expect(container.querySelectorAll('[data-testid="opened"]')).toHaveLength(1);
 expect(container.querySelector('[data-management="true"]').textContent).toContain(definition.id);
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Close').click());
 expect(container.querySelector('[data-testid="opened"]')).toBeNull();
});

test.each(['demo_prestige','new-soc-client','later-enabled-soc'])('SOC workspace preserves criterion navigation without preparation or control panels for %s',async clientId=>{
 await prestige({clientId});
 const description=[...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='System-description preparation');
 const controls=[...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Client organizational Controls');
 expect(description).toBeUndefined();expect(controls).toBeUndefined();
 expect(container.textContent).not.toContain('Program-level preparation guidance');
 expect(container.querySelector('[data-testid="soc-category-security"]')).toBeTruthy();
 expect(api.patch).not.toHaveBeenCalled();
});
test.each(['demo_prestige','new-soc-client'])('SOC workspace has no configuration or program date inputs for %s',async clientId=>{
 await prestige({clientId});expect(socSettings()).toBeUndefined();
 expect(container.querySelector('[aria-label="Security / Common Criteria"]')).toBeNull();
 expect(container.querySelector('input[type="date"]')).toBeNull();
 expect(buttons('Save SOC 2 scope')).toHaveLength(0);expect(api.patch).not.toHaveBeenCalled();
});

test('Brawndo summary, bar tooltips, and removed sections; Controls follow the summary',async()=>{
 await brawndo();
 const summary=container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent;
 expect(summary).toContain('Implemented98%55 of 56');expect(summary).toContain('Assessed98%');expect(summary).toContain('1 still to assess · Continue with safeguard 1.2');
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
test('Prestige SOC 2 uses scoped progress and category-first hierarchy without program settings',async()=>{
 await prestige();const workspace=container.querySelector('[data-testid="prestige-soc-workspace"]');expect(workspace).toBeTruthy();
 expect(workspace.querySelector('h1').textContent).toBe('SOC 2');expect(workspace.textContent).not.toContain('Client organizational Controls');expect(workspace.textContent).toContain('Include retained out-of-scope criteria');expect(socSettings()).toBeUndefined();
 const summary=workspace.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent;
 expect(summary).toContain('Implemented74%28 of 38');expect(summary).toContain('Assessed92%');expect(summary).toContain('3 still to assess');
 const partial=workspace.querySelector('[data-testid="psoc-seg-partial"]');expect(partial.tabIndex).toBe(0);expect(partial.getAttribute('aria-label')).toBe('Partially Implemented: 5 of 38 criteria, 13%');expect(partial.querySelector('.bcis-tip').textContent).toBe('Partially Implemented5 of 38 criteria13%');
 expect(workspace.querySelectorAll('[data-testid^="soc-category-"]')).toHaveLength(3);expect(workspace.querySelector('[data-testid="soc-category-security"]').textContent).toContain('Security — Common Criteria33');
 expect(workspace.querySelector('[aria-label="Trust Services Categories"]').textContent).not.toMatch(/Processing Integrity|Privacy/);
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
 expect(container.querySelectorAll('[data-testid^="control-row-"]')).toHaveLength(0);expect(container.querySelector('.assessment-metrics').textContent).toContain('0 of 0');
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

test.each(['demo_dunder','new-iso-client','later-enabled-iso'])('ISO keeps approved sections without setup or redundant shortcuts for %s',async clientId=>{
 const definitions=frameworkCatalog('iso-27001').requirements;
 api.get.mockImplementation(async path=>({data:['/reviews','/risks','/findings','/tasks','/policies'].includes(path)||path.endsWith('/members')?[]:path==='/iso-audit'?{program:null,reviews:[]}:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'iso'+i,definition_id:d.id,client_id:clientId,status:'addressed',soa_applicability:d.specification==='annex_control'?'included':undefined})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey="iso-27001" clientId={clientId}/>));
 expect(container.querySelector('[aria-label="ISO workspace sections"]').children).toHaveLength(5);
 expect([...container.querySelector('[aria-label="ISO workspace sections"]').children].map(t=>t.textContent)).toEqual(['Overview','Statement of Applicability','ISMS Requirements','Annex A Controls','Internal Audit']);
 expect(container.textContent).not.toContain('ISO establishment checklist');
 expect(container.querySelector('[aria-label="Related ISMS work"]')).toBeNull();
 expect(container.querySelector('[aria-label="ISMS Overview"]')).not.toBeNull();
 expect(container.querySelectorAll('.iso-program-card')).toHaveLength(4);
 expect(container.textContent).not.toContain('Connected program records');
 await act(async()=>buttons('ISMS Requirements')[0].click());
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent).toContain('30 of 30');
 expect(container.querySelector('.assessment-metrics').textContent).toContain('30 of 30');
 expect(container.querySelector('.bcis-explain')).toBeNull();
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
  expect(container.querySelector('[aria-label="Statement of Applicability status"]').textContent).toContain('93 of 93 decisions recorded');
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
 await act(async()=>container.querySelector('.bcis-legend .is-good').click());
 expect(container.querySelectorAll('[data-testid^="requirement-"]')).toHaveLength(91);
 expect(container.querySelector(`[data-testid="requirement-${annex[1].id}"]`)).toBeNull();
});

test.each(['cis-ig1','hipaa'])('%s with all records N/A keeps undefined progress without calculation explanations',async frameworkKey=>{
 const definitions=frameworkCatalog(frameworkKey).requirements;
 api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:{configured:true,selected:true,definitions,assessments:definitions.map((d,i)=>({framework_assessment_id:'na'+i,definition_id:d.id,client_id:'a',status:'not_applicable'})),work:{}}}));
 await act(async()=>root.render(<FrameworkWorkspace frameworkKey={frameworkKey} clientId="a"/>));
 const figures=[...container.querySelectorAll('.assessment-metric strong')].slice(0,2);
 expect(figures.map(n=>n.textContent)).toEqual(['—','—']);
 expect(container.textContent).not.toMatch(/How is this calculated|excluded from progress denominators/);
 expect(container.querySelector('.bcis-explain')).toBeNull();
});

test('retained SOC criteria keep contextual management reachable after scope reduction',async()=>{
 const response=await prestige();
 const retained=response.definitions.find(d=>d.category==='privacy');
 const summary=container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent;
 const continueLabel=[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Continue with')).textContent;
 const toggle=[...container.querySelectorAll('label')].find(l=>l.textContent==='Include retained out-of-scope criteria').querySelector('input');
 await act(async()=>toggle.click());
 expect(container.querySelector('[aria-labelledby="bcis-summary-heading"]').textContent).toBe(summary);
 expect([...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('Continue with')).textContent).toBe(continueLabel);
 const search=container.querySelector('input[aria-label="Search criteria"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,retained.id);search.dispatchEvent(new Event('input',{bubbles:true}));});
 const manage=container.querySelector(`button[aria-label="Manage ${retained.id} ${retained.title}"]`);
 expect(manage).not.toBeNull();await act(async()=>manage.click());
 expect(container.querySelector('[data-management="true"]').textContent).toContain(retained.id);
});
