import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AdditionalEvidence from './AdditionalEvidence';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{error:jest.fn()}}));

let node,root,files,frameworkFailure;
const clientId='synthetic-evidence';
const cisProgram=group=>({clientId,programId:`${clientId}:cis-ig1`,frameworkKey:'cis-ig1',version:'8.1',implementationGroup:group});
const file=(id,areas)=>({client_id:clientId,evidence_id:id,filename:`${id}.pdf`,created_at:'2026-10-01',program_areas:areas,references:[]});
const framework=group=>({selected:true,configured:true,configuration:{implementation_group:group},active_definition_ids:['1.1'],assessments:[{client_id:clientId,framework_key:'cis-ig1',definition_id:'1.1',framework_assessment_id:'assessment-1'}]});
const figure=()=>node.querySelector('[data-testid="evidence-figure-cis"]');
const browseFrameworks=async()=>act(async()=>[...node.querySelectorAll('.bae-folder')].find(button=>button.textContent.startsWith('Frameworks')).click());
const render=async props=>act(async()=>root.render(<AdditionalEvidence clientId={clientId} onOpenItem={()=>{}} onOpenSource={()=>{}} {...props}/>));
const noWrites=()=>{for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();};

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
  files=[file('framework-one',['Frameworks','Reviews']),file('framework-two',['Frameworks']),file('policy',['Policies'])];frameworkFailure=false;
  api.get.mockImplementation(async(path,{params}={})=>{
    if(path==='/evidence/catalog')return {data:{items:files,total:files.length,page_size:params.page_size,program_counts:{Frameworks:2,Policies:1,Reviews:1},folder_counts:[{area:'Frameworks',key:'hipaa',label:'HIPAA native folder',path:'hipaa-native-path',count:2},{area:'Frameworks',key:'retained',label:'Retained inactive',path:'retained-native-path',count:1}],facets:{}}};
    if(path==='/frameworks/cis-ig1'){
      if(frameworkFailure)throw new Error('Native CIS request failed');
      return {data:framework(2)};
    }
    if(path==='/reviews')return {data:[{client_id:clientId,review_id:'review-1',title:'Actual completed review'}]};
    if(path.endsWith('/sets'))return {data:{items:[{occurrence_id:'closed-1',status:'completed',due_date:'2026-10-01',evidence_count:1}],total:1,page_size:25}};
    throw new Error(`Unexpected read ${path}`);
  });
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();});

test.each(['No framework','General','HIPAA','NIST','CMMC'])('%s uses actual Frameworks files and review coverage without reading or labeling CIS',async name=>{
  await render({clientName:name});
  expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(false);
  expect(figure().textContent).toBe('Framework files2');expect(figure().querySelector('em')).toBeNull();
  expect(node.textContent).not.toContain('CIS');expect(node.textContent).not.toContain('safeguards');
  expect(node.querySelector('[data-testid="evidence-figure-files"]').textContent).toBe('Files3');
  expect(node.querySelector('[data-testid="evidence-figure-coverage"]').textContent).toBe('Review periods with evidence1of 1');
  expect(node.querySelector('.bae-cov-cells button')).not.toBeNull();noWrites();
});

test.each([1,2,3])('enrolled CIS IG%s retains actual safeguard identities, labels and native reads',async group=>{
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path==='/frameworks/cis-ig1'?Promise.resolve({data:framework(group)}):nativeReads(path,options));
  files[0].references=[{kind:'framework_assessments',id:'assessment-1',available:true}];
  await render({cisProgram:cisProgram(group)});
  expect(api.get).toHaveBeenCalledWith('/frameworks/cis-ig1',expect.objectContaining({params:{client_id:clientId},signal:expect.any(AbortSignal)}));
  expect(figure().textContent).toBe(`CIS IG${group} safeguards with evidence1of 1`);noWrites();
});

test('absence is healthy but an enrolled CIS read failure remains unavailable and retryable',async()=>{
  frameworkFailure=true;await render({cisProgram:cisProgram(2)});
  expect(node.textContent).toContain('Overview unavailable: Native CIS request failed');
  expect(figure().querySelector('strong').textContent).toBe('—');
  expect(node.querySelector('.bae-name').textContent).toBe('framework-one.pdf');
  frameworkFailure=false;await act(async()=>node.querySelector('.bae-retry').click());
  expect(node.textContent).not.toContain('Overview unavailable');expect(figure().textContent).toContain('CIS IG2');
  await render({cisProgram:null});expect(figure().textContent).toBe('Framework files2');noWrites();
});

test('a late abandoned CIS response cannot restore the CIS metric after enrollment is withdrawn',async()=>{
  const nativeReads=api.get.getMockImplementation();let finish;
  api.get.mockImplementation((path,options)=>path==='/frameworks/cis-ig1'?new Promise(resolve=>{finish=resolve;}):nativeReads(path,options));
  await render({cisProgram:cisProgram(2)});
  const signal=api.get.mock.calls.find(([path])=>path==='/frameworks/cis-ig1')[1].signal;
  await render({cisProgram:null});expect(signal.aborted).toBe(true);expect(figure().textContent).toBe('Framework files2');
  await act(async()=>finish({data:framework(2)}));expect(figure().textContent).toBe('Framework files2');
  expect(node.textContent).not.toContain('CIS');noWrites();
});

test('framework folders retain enabled zero counts, exact native paths and inactive evidence guidance',async()=>{
  await render({frameworkItems:[{key:'hipaa',label:'HIPAA'},{key:'nist-csf',label:'NIST CSF'}]});await browseFrameworks();
  const folders=[...node.querySelectorAll('.bae-subfolders button')];
  expect(folders.map(button=>button.textContent)).toEqual(['HIPAA native folder2','NIST CSF0']);
  expect(node.textContent).toContain('Evidence from inactive or unrecorded frameworks remains available in search and All files below.');
  await act(async()=>folders[1].click());
  const request=api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===25).at(-1)[1].params;
  expect(JSON.parse(request.state).filters.folder_paths).toEqual([JSON.stringify(['Frameworks','nist-csf'])]);
  expect(node.querySelector('[aria-current="page"]').textContent).toBe('NIST CSF');noWrites();
});

test('framework configuration failure is explicit and never invents enabled framework folders',async()=>{
  await render({frameworkItems:[],frameworkError:'Configuration denied'});await browseFrameworks();
  expect(node.textContent).toContain('Framework configuration could not be loaded: Configuration denied');
  expect(node.querySelector('.bae-subfolders')).toBeNull();expect(node.querySelector('.bae-name')).not.toBeNull();
  expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(false);noWrites();
});

test('generic counts refresh from the complete authorized files after a native evidence revision',async()=>{
  await render();expect(figure().textContent).toBe('Framework files2');
  files=[...files,file('new-upload',['Frameworks'])];await render({revision:1});
  expect(figure().textContent).toBe('Framework files3');
  expect(api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===100)).toHaveLength(2);noWrites();
});

test('foreign evidence or framework assessment data is withheld rather than shown as zero coverage',async()=>{
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path==='/frameworks/cis-ig1'?Promise.resolve({data:{...framework(2),assessments:[{...framework(2).assessments[0],client_id:'foreign'}]}}):nativeReads(path,options));
  await render({cisProgram:cisProgram(2)});expect(node.textContent).toContain('Client data mismatch');expect(figure().querySelector('strong').textContent).toBe('—');
  files=[{...file('foreign-file',['Frameworks']),client_id:'foreign'}];await render({revision:1,cisProgram:null});
  expect(node.textContent).not.toContain('foreign-file.pdf');expect(figure().querySelector('strong').textContent).toBe('—');noWrites();
});

test.each([null,{assessments:[],selected:true,configured:true}])('an incomplete enrolled CIS response remains an error rather than an absent program (%p)',async incomplete=>{
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path==='/frameworks/cis-ig1'?Promise.resolve({data:incomplete}):nativeReads(path,options));
  await render({cisProgram:cisProgram(2)});
  expect(node.textContent).toContain('Overview unavailable: Framework context is incomplete');
  expect(figure().querySelector('strong').textContent).toBe('—');expect(figure().querySelector('em')).toBeNull();noWrites();
});

test('Framework files counts the complete authorized native area rather than the first catalog page',async()=>{
  files=Array.from({length:102},(_,index)=>file(`paged-${index}`,index%2===0?['Frameworks']:['Policies']));
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,options={})=>{
    if(path!=='/evidence/catalog')return nativeReads(path,options);
    const {page,page_size}=options.params;
    return {data:{items:files.slice((page-1)*page_size,page*page_size),total:files.length,page_size,folder_counts:[],facets:{}}};
  });
  await render();expect(figure().textContent).toBe('Framework files51');expect(node.querySelectorAll('.bae-row')).toHaveLength(25);
  expect(api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===100).map(([,options])=>options.params.page)).toEqual([1,2]);
  expect(api.get.mock.calls.some(([path])=>path==='/frameworks/cis-ig1')).toBe(false);noWrites();
});

test('a failed paged catalog cannot invent zero-count enabled framework folders',async()=>{
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation((path,options)=>path==='/evidence/catalog'&&options.params.page_size===25?Promise.reject(new Error('Catalog denied')):nativeReads(path,options));
  await render({frameworkItems:[{key:'hipaa',label:'HIPAA native'}]});await browseFrameworks();
  expect(node.textContent).toContain('Evidence could not be loaded: Catalog denied');expect(node.querySelector('.bae-subfolders')).toBeNull();
  expect(figure().textContent).toBe('Framework files2');noWrites();
});
