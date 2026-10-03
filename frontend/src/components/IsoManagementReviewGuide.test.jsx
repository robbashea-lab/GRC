import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Guide,{isIsoManagementReview} from './IsoManagementReviewGuide';
const driver={framework_key:'iso-27001',framework_plan_key:'iso-management-review',framework_driver_active:true};
let root,container;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('current guidance uses authoritative driver, supports shared multi-framework Review and is not an editable replacement for client content',async()=>{
 const record={client_id:'a',notes:'Leadership minutes v2',framework_drivers:[{framework_key:'soc-2',framework_plan_key:'soc-management-review'},driver]},before=JSON.stringify(record);
 await act(async()=>root.render(<Guide record={record}/>));
 expect(container.textContent).toContain('not official ISO text');expect(container.textContent).toContain('Review evaluation');
 expect(container.textContent).toContain('No separate file or new mandatory field');
 expect(container.textContent).toContain('prior actions');expect(container.querySelector('input,textarea')).toBeNull();expect(JSON.stringify(record)).toBe(before);
});
test('legacy plan works without title matching; ordinary CIS/SOC Reviews and disabled driver do not inherit ISO behavior',()=>{
 expect(isIsoManagementReview({framework_key:'iso-27001',framework_plan_key:'iso-management-review'})).toBe(true);
 for(const record of [{title:'ISMS Management Review',review_type:'management'}, {framework_key:'soc-2',framework_plan_key:'soc-management-review'}, {framework_drivers:[{...driver,framework_driver_active:false}]}, {framework_key:'cis-ig1',framework_plan_key:'cis-policy-review'}])expect(isIsoManagementReview(record)).toBe(false);
});
test('manually associated management Review requires same-client ISO management clauses; historical guide leaves conclusions distinct',async()=>{
 const record={client_id:'a',review_type:'management',conclusion:'Retained decision v1'},related={framework_assessments:[{client_id:'a',framework_key:'iso-27001',definition_id:'9.3.3'}]};
 expect(isIsoManagementReview(record,{framework_assessments:[{...related.framework_assessments[0],client_id:'b'}]})).toBe(false);
 await act(async()=>root.render(<Guide record={record} related={related} historical/>));
 expect(container.textContent).toContain('does not replace the retained historical conclusions');expect(record.conclusion).toBe('Retained decision v1');
});
