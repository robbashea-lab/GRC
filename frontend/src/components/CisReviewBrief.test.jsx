import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisReviewBrief from './CisReviewBrief';
import {cis,reviewDriver} from '@/lib/frameworks';
import api from '@/lib/api';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),patch:jest.fn()},formatError:e=>e.message}));
let root,container;
const record=cid=>({client_id:cid,recurrence:'semiannual',framework_drivers:[reviewDriver('cis-ig1',cis.review_plans[0])],notes:'Client-written instructions'});
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('current guidance retains historical conclusions and links the exact authorized safeguard with its focus target',async()=>{
 const row={framework_assessment_id:'assessment-a',definition_id:'1.1',client_id:'a'},onOpen=jest.fn(),review=record('a'),before=JSON.stringify(review);
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/frameworks/cis-ig1'?{assessments:[row]}:[]}));
 await act(async()=>root.render(<CisReviewBrief record={review} historical onOpen={onOpen}/>));
 const link=[...container.querySelectorAll('button')].find(b=>b.textContent.startsWith('1.1'));
 await act(async()=>link.click());expect(onOpen).toHaveBeenCalledWith(row,link);
 expect(container.textContent).toContain('not a replacement for the historical conclusion');
 expect(container.textContent).toContain('Expected outcome:');
 expect(JSON.stringify(review)).toBe(before);expect(api.patch).not.toHaveBeenCalled();
});

test('a late workspace response cannot expose the previous client’s safeguard link',async()=>{
 let resolveOld;api.get.mockImplementation((path,{params}={})=>path!=='/frameworks/cis-ig1'?Promise.resolve({data:[]}):params.client_id==='a'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({data:{assessments:[{framework_assessment_id:'b1',definition_id:'1.1',client_id:'b'}]}}));
 const onOpen=jest.fn();
 await act(async()=>root.render(<CisReviewBrief record={record('a')} onOpen={onOpen}/>));
 await act(async()=>root.render(<CisReviewBrief record={record('b')} onOpen={onOpen}/>));
 await act(async()=>resolveOld({data:{assessments:[{framework_assessment_id:'a1',definition_id:'1.1',client_id:'a'}]}}));
 const link=container.querySelector('button');await act(async()=>link.click());
 expect(onOpen.mock.calls[0][0].framework_assessment_id).toBe('b1');
});

test('all 153 safeguards have Review mappings',()=>{
 expect(new Set(cis.review_plans.flatMap(p=>p.safeguards)).size).toBe(153);
});

test.each(cis.review_plans)('$key exposes every prompt, consolidates timing, and preserves records',async plan=>{
 const ids=cis.requirements.map(d=>d.id),rows=ids.map(id=>({framework_assessment_id:'synthetic-'+id,definition_id:id,owner_id:'owner',implementation:'Existing customized method',cis_operation:{confirmed:false}}));
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/frameworks/cis-ig1'?{assessments:rows,active_definition_ids:ids}:[]}));
  const review={client_id:'synthetic',recurrence:'custom',custom_recurrence_days:45,framework_drivers:[reviewDriver('cis-ig1',plan)],occurrences:[{conclusion:'Retained historical conclusion',notes:'Original instructions'}]},before=JSON.stringify(review);
  await act(async()=>root.render(<CisReviewBrief record={review} historical onOpen={jest.fn()}/>));
  for(const id of plan.safeguards){
   const definition=cis.requirements.find(d=>d.id===id);
   const item=[...container.querySelectorAll('button')].find(button=>button.textContent.startsWith(id+' · ')).closest('li');
   for(const question of guidance.requirements[id].review){
    if(question===`${definition.source_cadence} Confirm relevant exceptions and follow-up with the accountable owner.`){
     expect(item.textContent).toContain(definition.source_cadence);
     expect(container.textContent).toContain('Confirm relevant exceptions and follow-up with the accountable owner.');
    }else expect(item.textContent).toContain(question);
   }
   const more=item.querySelector(`[data-testid="cis-review-questions-${id}"]`);
   if(more){expect(more.tagName).toBe('SECTION');expect(more.querySelector('h4').textContent).toContain(id);}
  }
  expect(container.textContent).not.toContain('Arrangement confirmation');
  expect(container.textContent).not.toContain('Responsibility details missing');
  expect(JSON.stringify(review)).toBe(before);
 expect(api.patch).not.toHaveBeenCalled();
});
