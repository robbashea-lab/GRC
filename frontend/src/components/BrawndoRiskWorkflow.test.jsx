import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoRiskWorkflow from './BrawndoRiskWorkflow';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(async()=>({data:[]}))},formatError:error=>error.message}));

jest.mock('./ui/dialog',()=>({DialogTitle:require('react').forwardRef(({children,...props},ref)=><h2 {...props} ref={ref}>{children}</h2>),DialogDescription:({children,...props})=><p {...props}>{children}</p>}));
jest.mock('./AssigneeSelect',()=>({__esModule:true,default:({disabled})=><button type="button" aria-label="Owner" disabled={disabled}>Unassigned</button>}));
let root,container,props;
const render=extra=>act(async()=>root.render(<BrawndoRiskWorkflow {...props} {...extra}/>));
beforeEach(()=>{
  api.get.mockResolvedValue({data:[]});
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const risk={risk_id:'native-risk',client_id:'demo_brawndo',display_id:'RISK-105',title:'Restore dependencies',status:'open',likelihood_score:3,impact_score:4,treatment:'mitigate',source_type:'review',source_id:'native-review',review_id:'native-review',framework_assessment_id:'native-assessment'};
  props={record:risk,form:{...risk},setForm:jest.fn(),users:[],clientId:risk.client_id,tab:'overview',setTab:jest.fn(),canWrite:true,isPlatformAdmin:true,
    related:{reviews:[{review_id:'native-review',client_id:risk.client_id,title:'Original review'}],framework_assessments:[{framework_assessment_id:'native-assessment',client_id:risk.client_id,framework_key:'CIS',definition_id:'1.1'}]},
    tasks:[{task_id:'native-task',client_id:risk.client_id,title:'Validate recovery',status:'open'}],history:[{occurrence_id:'original-occurrence',review_id:'native-review',completed_at:'2026-09-22',risk_after:{likelihood_score:3,impact_score:4}}],
    onOpen:jest.fn(),onOpenOccurrence:jest.fn(),onLinkAction:jest.fn(),onClose:jest.fn(),onSave:jest.fn(),saving:false,dirty:true};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.clearAllMocks();});

test('proposed Accept remains an ordinary native draft choice, separate from acceptance',async()=>{
  await render({tab:'treatment'});
  const accept=[...container.querySelectorAll('.rw-treatment button')].find(button=>button.textContent.startsWith('Accept'));
  expect(accept.disabled).toBe(false);
  await act(async()=>accept.click());
  expect(props.setForm).toHaveBeenCalledWith({...props.form,treatment:'accept'});
  expect(props.onSave).not.toHaveBeenCalled();
});

test.each(['overview','assessment','treatment','history'])('native pending decision locks %s background controls while its command body stays usable',async tab=>{
  const decision=jest.fn();
  await render({tab,commandPending:true,decisionControls:<button type="button" disabled>Accept risk</button>,decisionBody:<button type="button" data-testid="native-command" onClick={decision}>Confirm native decision</button>});
  const background=[...container.querySelectorAll('button,input,textarea,select')].filter(node=>!node.closest('.rw-decide'));
  expect(background.length).toBeGreaterThan(0);
  expect(background.every(node=>node.disabled||node.closest('fieldset')?.disabled)).toBe(true);
  for(const button of container.querySelectorAll('.rw-tabs button,.rw-link'))await act(async()=>button.click());
  expect(props.setTab).not.toHaveBeenCalled();expect(props.onOpen).not.toHaveBeenCalled();expect(props.onOpenOccurrence).not.toHaveBeenCalled();
  if(tab==='overview'){
    const confirm=container.querySelector('[data-testid="native-command"]');
    expect(confirm.disabled).toBe(false);
    await act(async()=>confirm.click());expect(decision).toHaveBeenCalledTimes(1);
  }
});

test('history dates use the reference calendar-day format and preserve the original occurrence opener',async()=>{
  await render({tab:'history'});
  const occurrence=container.querySelector('tbody button');
  expect(occurrence.textContent).toBe('Sep 22, 2026');
  await act(async()=>occurrence.click());
  expect(props.onOpenOccurrence).toHaveBeenCalledWith(props.history[0]);
});

test.each([['manual','Manual entry'],['annual_assessment','Risk assessment'],['review','Recurring review'],['vendor','Vendor review'],['audit','Audit / assessment'],['other','Other']])('saved workflow uses reference %s source wording without changing native values',async(source_type,label)=>{
  const record={...props.record,status:'in_progress',source_type};
  await render({record,form:{...record}});
  expect([...container.querySelectorAll('.rw-sub .rw-chip')].some(node=>node.textContent==='In treatment')).toBe(true);
  expect([...container.querySelectorAll('.rw-meta .rw-chip')].some(node=>node.textContent===`Source: ${label}`)).toBe(true);
  expect(record.status).toBe('in_progress');expect(record.source_type).toBe(source_type);
  expect(props.setForm).not.toHaveBeenCalled();
});

test('saved next-review hint uses the real current deadline and last-reviewed date in reference wording',async()=>{
  const record={...props.record,last_reviewed:'2026-09-22',next_review:new Date().toISOString().slice(0,10)};
  await render({record,form:{...record}});
  expect([...container.querySelectorAll('.rw-help')].some(node=>node.textContent==='In 0 days · last reviewed Sep 22, 2026')).toBe(true);
  expect(container.querySelector('#risk-next-review').value).toBe(record.next_review);
  await render({record:{...record,status:'closed'},form:{...record,status:'closed'}});
  expect([...container.querySelectorAll('.rw-help')].some(node=>node.textContent==='Closed risks are not reviewed.')).toBe(true);
});

test('supporting records follow native Treatment actions and remain absent from other tabs',async()=>{
  const supportingRecords=<div data-testid="native-supporting-records">Native evidence, comments and linked records</div>;
  await render({tab:'overview',supportingRecords});
  expect(container.querySelector('[data-testid="native-supporting-records"]')).toBeNull();
  await render({tab:'treatment',supportingRecords});
  const wrapper=container.querySelector('.rw-supporting');
  const actions=[...container.querySelectorAll('button')].find(button=>button.textContent==='+ Add action item').closest('section');
  expect(actions.nextElementSibling).toBe(wrapper);
  expect(wrapper.querySelector('[data-testid="native-supporting-records"]')).not.toBeNull();
  expect(wrapper.disabled).toBe(false);expect(wrapper.hasAttribute('inert')).toBe(false);
  for(const tab of ['assessment','history','activity']){
    await render({tab,supportingRecords});
    expect(container.querySelector('[data-testid="native-supporting-records"]')).toBeNull();
  }
});

test.each([{saving:true},{commandPending:true}])('pending native work makes supporting records inert and disables native controls: %j',async pending=>{
  await render({tab:'treatment',supportingRecords:<><button type="button">Native supporting command</button><div role="button" tabIndex={0}>Native upload dropzone</div></>,...pending});
  const wrapper=container.querySelector('.rw-supporting');
  expect(wrapper.disabled).toBe(true);
  expect(wrapper.getAttribute('inert')).toBe('');
});
