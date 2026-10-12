import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FrameworkWorkspace from '@/pages/FrameworkWorkspace';
import {cis} from '@/lib/frameworks';
import api from '@/lib/api';

// This layer tests the page's selection/context binding. The native drawer is
// an observable boundary, not assessment persistence or unsaved-draft evidence.
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{user_id:'breadcrumb-qa',role:'super_admin'}})}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn(),patch:jest.fn(),post:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('./GuidedAssessor',()=>()=>null);
jest.mock('./SocGuidedAssessor',()=>()=>null);
jest.mock('./FrameworkDrawer',()=>({record,breadcrumb,onNext,onOpenChange})=><section data-testid="selected-criterion" data-criterion={record.definition_id} data-breadcrumb={JSON.stringify(breadcrumb?.map(item=>item.label))}><button onClick={onNext}>Native next test boundary</button><button onClick={()=>onOpenChange(false)}>Native close test boundary</button></section>);
let mockLocation,mockRouteSetter,mockHistory,mockNavigate;
jest.mock('react-router-dom',()=>({
  useSearchParams:()=>{
    const [params,set]=require('react').useState(mockLocation.params);mockRouteSetter=set;
    return [params,(next,options={})=>{const entry={params:new URLSearchParams(next),state:options.state??null};if(options.replace)mockHistory[mockHistory.length-1]=entry;else mockHistory.push(entry);mockLocation.state=entry.state;set(entry.params);}];
  },
  useLocation:()=>mockLocation,useNavigate:()=>mockNavigate,Link:({to,children})=><a href={to}>{children}</a>,
}),{virtual:true});

const clientId='synthetic-breadcrumb-context',preferenceKey='framework-workspace:breadcrumb-qa:'+clientId+':cis-ig1';
let root,container;
const background=()=>container.querySelector('section[aria-label="Controls"]');
const crumbs=()=>[...background().querySelectorAll('.bcis-crumbs li')].map(item=>item.textContent);
const tableIds=()=>[...background().querySelectorAll('tbody tr[data-testid^="requirement-"]')].map(row=>row.dataset.testid);
const selected=()=>container.querySelector('[data-testid="selected-criterion"]');
async function click(target){expect(target).toBeTruthy();await act(async()=>target.click());}
async function render(group=2){
  const definitions=cis.requirements.filter(definition=>definition.implementation_group<=group);
  const assessments=definitions.map(definition=>({framework_assessment_id:'breadcrumb-'+definition.id,client_id:clientId,framework_key:'cis-ig1',definition_id:definition.id,status:definition.id==='1.1'?'not_assessed':'addressed',verification:'not_verified',implementation:''}));
  const data={configured:true,selected:true,configuration:{implementation_group:group},definitions,assessments,active_definition_ids:definitions.map(definition=>definition.id),work:{}};
  api.get.mockImplementation(async path=>({data:path.endsWith('/members')?[]:data}));
  sessionStorage.setItem(preferenceKey,JSON.stringify({'category:all':['3'],lastId:'breadcrumb-3.1'}));
  await act(async()=>root.render(<FrameworkWorkspace frameworkKey="cis-ig1" clientId={clientId}/>));
}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();
  mockLocation={pathname:'/compliance/cis-ig1',search:'',state:null,params:new URLSearchParams()};mockHistory=[{params:new URLSearchParams(),state:null}];
  mockNavigate=jest.fn(amount=>{expect(amount).toBe(-1);mockHistory.pop();const previous=mockHistory[mockHistory.length-1];mockLocation.state=previous.state;mockRouteSetter(previous.params);});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{
  expect(api.put).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();
  await act(async()=>root.unmount());container.remove();jest.clearAllMocks();
});

test.each([1,2,3])('IG%s global Continue preserves the remembered background without a false safeguard ancestor',async group=>{
  await render(group);const before=tableIds();expect(before.length).toBeGreaterThan(0);expect(before.every(id=>id.startsWith('requirement-3.'))).toBe(true);
  expect(crumbs()).toEqual(['CIS IG'+group,'Control 3']);
  await click(container.querySelector('[aria-label^="Continue assessment: 1.1 "]'));
  expect(selected().dataset.criterion).toBe('1.1');expect(JSON.parse(selected().dataset.breadcrumb)).toEqual(['CIS IG'+group,'Control 1','Safeguard 1.1']);
  expect(crumbs()).toEqual(['CIS IG'+group,'Control 3']);expect(tableIds()).toEqual(before);expect(JSON.parse(sessionStorage.getItem(preferenceKey))['category:all']).toEqual(['3']);
  await click(selected().querySelectorAll('button')[1]);expect(selected()).toBeNull();expect(crumbs()).toEqual(['CIS IG'+group,'Control 3']);expect(tableIds()).toEqual(before);expect(mockNavigate).toHaveBeenCalledWith(-1);
});

test('same-control selection and Next retain their complete breadcrumb and original table',async()=>{
  await render();const before=tableIds();await click(background().querySelector('[data-testid="requirement-3.1"]'));
  expect(crumbs()).toEqual(['CIS IG2','Control 3','Safeguard 3.1']);
  await click(selected().querySelectorAll('button')[0]);expect(selected().dataset.criterion).toBe('3.2');expect(crumbs()).toEqual(['CIS IG2','Control 3','Safeguard 3.2']);expect(tableIds()).toEqual(before);
  await click(selected().querySelectorAll('button')[1]);expect(selected()).toBeNull();expect(crumbs()).toEqual(['CIS IG2','Control 3']);expect(tableIds()).toEqual(before);
});

test('a filtered result keeps its existing view breadcrumb and selected safeguard behavior',async()=>{
  await render();await click([...container.querySelectorAll('.bcis-legend button')].find(button=>button.textContent.startsWith('Not assessed')));
  expect(crumbs()).toEqual(['CIS IG2','Not yet assessed']);const before=tableIds();expect(before).toEqual(['requirement-1.1']);
  await click(background().querySelector('[data-testid="requirement-1.1"]'));expect(crumbs()).toEqual(['CIS IG2','Not yet assessed','Safeguard 1.1']);expect(tableIds()).toEqual(before);
});
