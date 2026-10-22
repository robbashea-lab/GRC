import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoAIConceptFields from './BrawndoAIConceptFields';
import {AI_TEMPLATES,aiTemplateDraft} from './BrawndoAITemplates';
import {AI_DEFAULTS,aiScreening} from '@/lib/aiGovernance';
import {AI_PILOT_DEFAULTS} from '@/lib/brawndoAI';

let node,root,latest,latestLink;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();});
function Editor({template,...props}){
  const [form,setForm]=useState({...AI_DEFAULTS,...AI_PILOT_DEFAULTS,...(template?aiTemplateDraft(template):{})});latest=form;
  const [link,setLink]=useState({kind:'risks',id:'',classification:'Context',source:'',rationale:''});latestLink=link;
  return <BrawndoAIConceptFields {...{template,form}} screen={aiScreening(form)} put={(key,value)=>setForm(previous=>({...previous,[key]:value}))} editable busy={false} admin person={()=> <span>Native owner selector</span>} decision={{status:'',note:''}} setDecision={()=>{}} link={link} setLink={setLink} {...props}/>;
}
test('screening preserves a No answer and supports returning it to unanswered',async()=>{
  await act(async()=>root.render(<Editor/>));
  expect(node.querySelectorAll('.aic-question')).toHaveLength(10);
  const no=node.querySelector('.aic-question .baai-segments button:last-child');
  await act(async()=>no.click());expect(latest.screening.consequential).toBe(false);expect(no.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>no.click());expect(Object.hasOwn(latest.screening,'consequential')).toBe(false);
});
test('template answers are editable draft suggestions and do not mutate the shared template',async()=>{
  const template=AI_TEMPLATES[0],before=JSON.stringify(template);
  await act(async()=>root.render(<Editor template={template}/>));
  expect(latest.environment).toBe(template.plan);expect(node.querySelectorAll('.aic-suggested')).toHaveLength(Object.keys(template.sug).length);
  await act(async()=>node.querySelector('.aic-question .baai-segments button:first-child').click());
  expect(latest.screening.consequential).toBe(true);expect(JSON.stringify(template)).toBe(before);
  expect(node.querySelector('.aic-question').querySelector('.aic-suggested')).toBeNull();
});
test('approved additions keep documented use, permitted data and restrictions distinct',async()=>{
  await act(async()=>root.render(<Editor/>));
  const text=node.textContent;expect(text).toContain('Documented use');expect(text).toContain('Permitted data');expect(text).toContain('Approval conditions / restrictions');
  const groups=[...node.querySelectorAll('[role="group"]')];
  const observed=groups.find(group=>group.getAttribute('aria-label')==='Data it can see');
  const permitted=groups.find(group=>group.getAttribute('aria-label')==='Permitted data');
  await act(async()=>observed.querySelector('button').click());expect(latest.data_types).toEqual(['Public']);expect(latest.permitted_data_types).toEqual([]);
  await act(async()=>permitted.querySelector('button').click());expect(latest.permitted_data_types).toEqual(['Public']);
});
test('save uses the supplied native handler and the concept does not restore old tabs',async()=>{
  const save=jest.fn(event=>event.preventDefault());await act(async()=>root.render(<Editor onSave={save}/>));
  await act(async()=>node.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(save).toHaveBeenCalledTimes(1);expect(node.querySelector('[role="tablist"]')).toBeNull();
});

test('existing Risk choices retain their actual IDs with plain option labels',async()=>{
  await act(async()=>root.render(<Editor id="saved-ai" risks={[{risk_id:'actual-risk',display_id:'RISK-105',title:'Recorded risk'}]}/>));
  const option=node.querySelector('option[value="actual-risk"]');
  expect(option.textContent).toBe('RISK-105 · Recorded risk');expect(option.children).toHaveLength(0);
});

test('primary Vendor selection and clearing edit only the native draft',async()=>{
  const save=jest.fn(event=>event.preventDefault());
  await act(async()=>root.render(<Editor vendors={[{vendor_id:'vendor-native',name:'Native provider'}]} onSave={save}/>));
  const picker=node.querySelector('[aria-label="Vendor record"]');
  await act(async()=>{picker.value='vendor-native';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(latest.vendor_id).toBe('vendor-native');expect(latestLink.id).toBe('');expect(save).not.toHaveBeenCalled();
  await act(async()=>{picker.value='';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(latest.vendor_id).toBeNull();expect(save).not.toHaveBeenCalled();
});

test('an unavailable recorded primary Vendor remains visible and retained',async()=>{
  const put=jest.fn();
  await act(async()=>root.render(<Editor form={{...AI_DEFAULTS,...AI_PILOT_DEFAULTS,vendor_id:'saved-unavailable'}} vendors={[]} put={put} editable={false}/>));
  const picker=node.querySelector('[aria-label="Vendor record"]');
  expect(picker.value).toBe('saved-unavailable');expect(picker.selectedOptions[0].textContent).toBe('Recorded Vendor (unavailable)');
  expect(picker.closest('fieldset').disabled).toBe(true);expect(put).not.toHaveBeenCalled();
});

test('Risk owner note stays a relationship draft and survives choosing a concrete native Risk',async()=>{
  const link=jest.fn();await act(async()=>root.render(<Editor id="saved-ai" risks={[{risk_id:'real-risk',display_id:'RISK-10',title:'Exposure'}]} onLinkRisk={link}/>));
  const note=node.querySelector('[aria-label="Note for the risk owner"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(note,'Exposure and current controls');note.dispatchEvent(new Event('input',{bubbles:true}));});
  const picker=node.querySelector('option[value="real-risk"]').parentElement;
  await act(async()=>{picker.value='real-risk';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(latestLink).toEqual({kind:'risks',id:'real-risk',classification:'Context',source:'',rationale:'Exposure and current controls'});
  expect(link).not.toHaveBeenCalled();
  await act(async()=>[...node.querySelectorAll('button')].find(button=>button.textContent==='Link Risk').click());expect(link).toHaveBeenCalledTimes(1);
});
test('saved Risk rationale is displayed from native relationships and can be loaded as a new relationship draft',async()=>{
  const risk={risk_id:'real-risk',display_id:'RISK-10',title:'Exposure'};
  await act(async()=>root.render(<Editor id="saved-ai" current={{related_links:[{kind:'risks',id:'real-risk',rationale:'Saved relationship note'}]}} relatedRisks={[risk]} risks={[risk]}/>));
  expect(node.querySelector('.aic-block').textContent).toContain('Saved relationship note');
  const picker=node.querySelector('option[value="real-risk"]').parentElement;
  await act(async()=>{picker.value='real-risk';picker.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(latestLink.rationale).toBe('Saved relationship note');
});
