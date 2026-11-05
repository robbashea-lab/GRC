import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AdditionalEvidence from './AdditionalEvidence';
import EvidenceItemDrawer from './EvidenceItemDrawer';
import {EvidenceSource,resolveEvidenceSource} from '@/lib/evidenceContext';
import {sourceReference} from '@/lib/evidenceReferences';
import {cisClientProgram} from '@/lib/cisExperience';
import {frameworkDefinition} from '@/lib/frameworks';
import {evidenceReferences} from '../preview/evidence';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{role:'client_viewer'}})}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>false}));
jest.mock('./ui/sheet',()=>({Sheet:({children})=><div>{children}</div>,SheetContent:({children})=><div>{children}</div>,SheetHeader:({children})=><div>{children}</div>,SheetTitle:({children})=><h2>{children}</h2>,SheetDescription:({children})=><p>{children}</p>}));

let node,root;
const clone=value=>JSON.parse(JSON.stringify(value));
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

test.each([
  ['demo_initech',2,'2.4'],
  ['demo_krusty_krab',3,'2.4'],
  ['demo_krusty_krab',3,'6.8'],
  ['demo_krusty_krab',3,'17.9'],
  ['demo_brawndo',1,'1.1'],
  ['arbitrary_future_client',2,'2.4'],
])('%s %s relationship %s uses its actual program in the library and expanded contexts without changing its destination',async(cid,group,definition)=>{
  const client={client_id:cid,framework_settings:{'cis-ig1':{implementation_group:group}},
    onboarding_baseline:{completed:true,requirements:{'cis-ig1':'applies'}}};
  const program=cisClientProgram(client),assessment={client_id:cid,framework_assessment_id:`fw_${cid}_assessment_${definition}`,
    framework_key:'cis-ig1',framework_version:'8.1',definition_id:definition,status:'addressed',related_links:[]};
  const evidence={client_id:cid,evidence_id:`proof-${definition}`,filename:'Retained proof.csv',
    linked_type:'framework_assessment',linked_id:assessment.framework_assessment_id,relationships:[]};
  const db={framework_assessments:[assessment],clients:[client]},before=clone({db,evidence});
  const references=evidenceReferences(db,evidence),source=references[0];
  expect(source).toMatchObject({kind:'framework_assessments',id:assessment.framework_assessment_id,available:true});
  expect(frameworkDefinition('cis-ig1',definition).implementation_group).toBeLessThanOrEqual(group);
  const file={...evidence,program_areas:['Frameworks'],context:{source},references};
  api.get.mockImplementation(async(path,{params}={})=>{
    if(path==='/evidence/catalog')return {data:{items:[file],total:1,page_size:params.page_size,facets:{},folder_counts:[]}};
    if(path==='/frameworks/cis-ig1')return {data:{selected:true,configured:true,configuration:{implementation_group:group},active_definition_ids:[definition],assessments:[assessment]}};
    if(path==='/reviews')return {data:[]};
    if(path===`/evidence-library/items/${evidence.evidence_id}`)return {data:file};
    if(path===`/framework_assessments/${encodeURIComponent(assessment.framework_assessment_id)}`)return {data:assessment};
    throw new Error(`Unexpected read ${path}`);
  });
  const open=jest.fn(),expected=`CIS IG${group} ${definition} · ${frameworkDefinition('cis-ig1',definition).title}`;
  await act(async()=>root.render(<AdditionalEvidence clientId={cid} cisProgram={program} onOpenSource={open}/>));
  expect(node.querySelector('.bae-links button').textContent).toBe(expected);
  await act(async()=>node.querySelector('.bae-links button').click());expect(open).toHaveBeenLastCalledWith(source);
  const target=await resolveEvidenceSource(open.mock.calls.at(-1)[0],cid);
  expect(target.record).toBe(assessment);expect(target.kind).toBe('framework_assessments');
  await act(async()=>root.render(<EvidenceItemDrawer id={evidence.evidence_id} cisProgram={program} onOpen={open} onChanged={()=>{}}/>));
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Related').click());
  const expanded=node.querySelector('[aria-label="Evidence relationships"] .register-link');
  expect(expanded.textContent).toBe(expected);await act(async()=>expanded.click());expect(open).toHaveBeenLastCalledWith(source);
  expect({db,evidence}).toEqual(before);expect(source.title).toBe(sourceReference('framework_assessments',assessment).title);
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('unresolved programs and unrelated sources retain their labels; library label substitution preserves the native punctuation and reference',async()=>{
  const source={kind:'framework_assessments',framework_key:'cis-ig1',id:'opaque-assessment',available:true,label:'Framework assessment',title:'CIS IG1 2.4 — Utilize Automated Software Inventory Tools'};
  const program={clientId:'client',frameworkKey:'cis-ig1',implementationGroup:2},open=jest.fn(),before=clone(source);
  for(const cisProgram of [null,{...program,implementationGroup:4},{...program,frameworkKey:'soc-2'}]){
    await act(async()=>root.render(<EvidenceSource source={source} cisProgram={cisProgram} onOpen={open}/>));
    expect(node.querySelector('button').textContent).toBe(source.title);
  }
  await act(async()=>root.render(<EvidenceSource source={source} cisProgram={program} onOpen={open}/>));
  expect(node.querySelector('button').textContent).toBe('CIS IG2 2.4 — Utilize Automated Software Inventory Tools');
  await act(async()=>node.querySelector('button').click());expect(open).toHaveBeenCalledWith(source);expect(source).toEqual(before);
  for(const other of [{...source,framework_key:'soc-2'},{...source,kind:'policies'}]){
    await act(async()=>root.render(<EvidenceSource source={other} cisProgram={program}/>));expect(node.querySelector('button').textContent).toBe(source.title);
  }
});

test('a foreign program descriptor cannot relabel the library or its expanded relationship',async()=>{
  const source={kind:'framework_assessments',framework_key:'cis-ig1',id:'assessment',available:true,label:'Framework assessment',title:'CIS 2.4 · Retained title'},
    file={client_id:'client',evidence_id:'retained-proof',filename:'proof.csv',references:[source]},
    program={clientId:'foreign',frameworkKey:'cis-ig1',implementationGroup:3};
  api.get.mockImplementation(async(path,{params}={})=>({data:path==='/evidence/catalog'?{items:[file],total:1,page_size:params.page_size}:path==='/reviews'?[]:file}));
  await act(async()=>root.render(<AdditionalEvidence clientId="client" cisProgram={program}/>));
  expect(node.querySelector('.bae-links button').textContent).toBe(source.title);
  await act(async()=>root.render(<EvidenceItemDrawer id="retained-proof" cisProgram={program}/>));
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Related').click());
  expect(node.querySelector('[aria-label="Evidence relationships"] .register-link').textContent).toBe(source.title);
});
