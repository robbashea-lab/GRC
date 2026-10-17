import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import AdditionalEvidence from './AdditionalEvidence';
import api from '@/lib/api';
import {dateMatches} from '@/lib/tableFilters';
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()},formatError:error=>error.message}));
jest.mock('sonner',()=>({toast:{error:jest.fn()}}));
let node,root;
const row={client_id:'demo_brawndo',evidence_id:'e1',filename:'Check.pdf',evidence_type:'Report',created_at:'2026-10-01',program_areas:['Reviews'],references:[{kind:'reviews',id:'r1',occurrence_id:'period-1',title:'Monthly check',label:'Review',available:true}]};
beforeEach(()=>{jest.useFakeTimers('modern');jest.setSystemTime(new Date('2026-10-16T12:00:00Z'));global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);api.get.mockImplementation(async(path,{params}={})=>({data:path==='/evidence/catalog'?{items:[row],total:1,page_size:params.page_size,program_counts:{Reviews:1},facets:{evidence_type:['Report'],years:['2026']},folder_counts:[]}:path==='/frameworks/cis-ig1'?{assessments:[],active_definition_ids:[],selected:false,configured:false}:path==='/reviews'?[{client_id:'demo_brawndo',review_id:'r1',title:'Monthly check',recurrence:'monthly'}]:path.endsWith('/sets')?{items:[{occurrence_id:'period-1',period:'October',status:'completed',due_date:'2026-10-01',evidence_count:1},{occurrence_id:'cancelled',status:'cancelled',due_date:'2026-09-01',evidence_count:0}],total:2,page_size:25}:path.endsWith('/download')?{content_base64:'cGRm',mime_type:'application/pdf',filename:'Check.pdf'}:[]}));});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();jest.clearAllMocks();jest.useRealTimers();});
test('download uses native file bytes without opening a record; completed coverage opens its exact occurrence',async()=>{
  const open=jest.fn(),source=jest.fn(),download=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={open} onOpenSource={source}/>));
  expect(node.querySelectorAll('.bae-folder')).toHaveLength(10);expect(node.textContent).not.toContain('Build audit package');expect(node.querySelectorAll('.bae-cov-cells button')).toHaveLength(1);
  const axis=[...node.querySelectorAll('.bae-cov-axis span')];
  expect(axis.map(month=>month.textContent)).toEqual(['Oct ’25','Nov','Dec','Jan ’26','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct']);
  expect(axis.filter(month=>month.classList.contains('bae-year')).map(month=>month.title)).toEqual(['Oct 2025','Jan 2026']);expect(axis[1].title).toBe('Nov 2025');
  await act(async()=>node.querySelector('[aria-label="Download Check.pdf"]').click());expect(open).not.toHaveBeenCalled();expect(download).toHaveBeenCalled();expect(api.get).toHaveBeenCalledWith('/evidence/e1/download');
  await act(async()=>node.querySelector('.bae-cov-cells button').click());expect(source).toHaveBeenCalledWith({kind:'reviews',id:'r1',occurrence_id:'period-1',available:true});
  await act(async()=>node.querySelector('.bae-name').click());expect(open).toHaveBeenCalledWith('e1');download.mockRestore();
});
test('query facets use native server filters and paging, and a mismatched client response is withheld',async()=>{
  const upload=jest.fn();await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={()=>{}} onOpenSource={()=>{}} canUpload onUpload={upload}/>));
  await act(async()=>[...node.querySelectorAll('.bae-folder')].find(button=>button.textContent.startsWith('Policies')).click());await act(async()=>node.querySelector('[data-testid="add-evidence"]').click());expect(upload).toHaveBeenCalledWith('Policies');
  const select=node.querySelector('[aria-label="Evidence type"]');await act(async()=>{select.value='Report';select.dispatchEvent(new Event('change',{bubbles:true}));});
  const calls=api.get.mock.calls.filter(([path])=>path==='/evidence/catalog');expect(JSON.parse(calls.at(-1)[1].params.state).filters.evidence_type).toEqual(['Report']);expect(calls.at(-1)[1].params.page_size).toBe(25);
  api.get.mockImplementation(async path=>({data:path==='/evidence/catalog'?{items:[{...row,client_id:'other-client',filename:'Private.pdf'}],total:1,page_size:25}:[]}));
  await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" revision={1} onOpenItem={()=>{}} onOpenSource={()=>{}}/>));
  expect(node.textContent).not.toContain('Private.pdf');expect(node.textContent).toContain('Client data mismatch');
});

const lastCatalogRequest=()=>api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===25).at(-1)[1].params;
const catalogFilters=()=>JSON.parse(lastCatalogRequest().state).filters;

test('recent figure keeps the native date filter on every page; Files returns to the complete paged catalog',async()=>{
  const nativeReads=api.get.getMockImplementation();
  const files=[...Array.from({length:14},(_,index)=>({...row,evidence_id:`old-${index}`,filename:`Check old ${index}.pdf`,created_at:'2026-01-01'})),...Array.from({length:26},(_,index)=>({...row,evidence_id:`recent-${index}`,filename:`Check recent ${index}.pdf`}))];
  api.get.mockImplementation(async(path,options={})=>{
    if(path!=='/evidence/catalog')return nativeReads(path,options);
    const {params}=options,state=params.state?JSON.parse(params.state):{},ranges=state.filters?.created_at||[];
    const filtered=ranges.length?files.filter(file=>ranges.some(range=>dateMatches(file.created_at,range,new Date()))):files;
    return {data:{items:filtered.slice((params.page-1)*params.page_size,params.page*params.page_size),total:filtered.length,page_size:params.page_size,program_counts:{Reviews:40},facets:{evidence_type:['Report'],years:['2026']},folder_counts:[]}};
  });
  await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={()=>{}} onOpenSource={()=>{}}/>));
  const figure=key=>node.querySelector(`[data-testid="evidence-figure-${key}"]`);
  expect(figure('files').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>figure('recent').click());
  expect(figure('files').getAttribute('aria-pressed')).toBe('false');expect(figure('recent').getAttribute('aria-pressed')).toBe('true');
  expect(catalogFilters()).toEqual({created_at:['last90']});expect(node.querySelectorAll('.bae-row')).toHaveLength(25);expect(node.textContent).not.toContain('Check old');
  await act(async()=>[...node.querySelectorAll('[aria-label="Evidence pagination"] button')].find(button=>button.textContent==='Next').click());
  expect(lastCatalogRequest().page).toBe(2);expect(catalogFilters().created_at).toEqual(['last90']);expect(node.querySelector('.bae-name').textContent).toBe('Check recent 25.pdf');
  await act(async()=>figure('files').click());
  expect(lastCatalogRequest().page).toBe(1);expect(catalogFilters().created_at).toBeUndefined();expect(figure('files').getAttribute('aria-pressed')).toBe('true');expect(node.textContent).toContain('Check old');
  expect(api.get.mock.calls.filter(([path,{params}={}])=>path==='/evidence/catalog'&&params.page_size===100)).toHaveLength(1);
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('figure scope changes clear native folder selection while retaining search, type and year',async()=>{
  const nativeReads=api.get.getMockImplementation();
  api.get.mockImplementation(async(path,options)=>{
    const response=await nativeReads(path,options);
    return path==='/evidence/catalog'?{data:{...response.data,folder_counts:[{area:'Policies',path:'Policies/policy-fixture',label:'Policy fixture',count:1}]}}:response;
  });
  await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={()=>{}} onOpenSource={()=>{}}/>));
  const search=node.querySelector('[data-testid="evidence-search"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Check');search.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const [label,value] of [['Evidence type','Report'],['Evidence year','2026']]){
    const select=node.querySelector(`[aria-label="${label}"]`);
    await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
  }
  await act(async()=>[...node.querySelectorAll('.bae-folder')].find(button=>button.textContent.startsWith('Policies')).click());
  await act(async()=>node.querySelector('.bae-subfolders button').click());
  expect(catalogFilters().folder_paths).toEqual(['Policies/policy-fixture']);
  await act(async()=>node.querySelector('[data-testid="evidence-figure-recent"]').click());
  expect(catalogFilters()).toEqual({created_at:['last90'],evidence_type:['Report'],years:['2026']});expect(lastCatalogRequest().q).toBe('Check');
  await act(async()=>node.querySelector('[data-testid="evidence-figure-files"]').click());
  expect(catalogFilters()).toEqual({evidence_type:['Report'],years:['2026']});expect(lastCatalogRequest().q).toBe('Check');
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test('CIS and recent selections toggle exclusively and keep the selected native upload area',async()=>{
  const upload=jest.fn();await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={()=>{}} onOpenSource={()=>{}} canUpload onUpload={upload}/>));
  const figure=key=>node.querySelector(`[data-testid="evidence-figure-${key}"]`);
  await act(async()=>figure('recent').click());await act(async()=>figure('cis').click());
  expect(catalogFilters()).toEqual({program_areas:['Frameworks']});expect(figure('cis').getAttribute('aria-pressed')).toBe('true');expect(figure('recent').getAttribute('aria-pressed')).toBe('false');
  await act(async()=>node.querySelector('[data-testid="add-evidence"]').click());expect(upload).toHaveBeenLastCalledWith('Frameworks');
  await act(async()=>figure('cis').click());expect(catalogFilters().program_areas).toBeUndefined();expect(figure('files').getAttribute('aria-pressed')).toBe('true');
  await act(async()=>figure('recent').click());await act(async()=>[...node.querySelectorAll('.bae-folder')].find(button=>button.textContent.startsWith('Policies')).click());
  expect(catalogFilters().created_at).toBeUndefined();await act(async()=>node.querySelector('[data-testid="add-evidence"]').click());expect(upload).toHaveBeenLastCalledWith('Policies');
  for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
});

test.each([false,true])('coverage figure scrolls the existing section without filtering or writing, reduced motion %s',async reduced=>{
  await act(async()=>root.render(<AdditionalEvidence clientId="demo_brawndo" onOpenItem={()=>{}} onOpenSource={()=>{}}/>));
  const mediaDescriptor=Object.getOwnPropertyDescriptor(window,'matchMedia'),scroll=jest.fn(),calls=api.get.mock.calls.length;
  Object.defineProperty(window,'matchMedia',{configurable:true,value:jest.fn(()=>({matches:reduced}))});
  node.querySelector('#bae-review-coverage').scrollIntoView=scroll;
  try{
    await act(async()=>node.querySelector('[data-testid="evidence-figure-coverage"]').click());
    expect(scroll).toHaveBeenCalledWith({behavior:reduced?'auto':'smooth',block:'start'});expect(api.get).toHaveBeenCalledTimes(calls);
    expect(node.querySelector('[data-testid="evidence-figure-files"]').getAttribute('aria-pressed')).toBe('true');
    for(const method of ['post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
  }finally{if(mediaDescriptor)Object.defineProperty(window,'matchMedia',mediaDescriptor);else delete window.matchMedia;}
});
