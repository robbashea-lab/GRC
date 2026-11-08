import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RefinedOmniInterview from './RefinedOmniInterview';
import {omniGroups} from '@/lib/refinedOmni';
import {versionForSafeguard} from '@/lib/guidedAssessment';

let root,host,put,onNext,onSaveClose,setStep;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);put=jest.fn();onNext=jest.fn();onSaveClose=jest.fn();setStep=jest.fn();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render({id='1.1',answers={inventory:'Yes'},step='coverage',safeguard11=true,blocked=false,focusScopeKey='client:assessment:actor:version',visualReference=true}={}){
  await act(async()=>root.render(<RefinedOmniInterview {...{id,answers,step,safeguard11,blocked,put,onNext,onSaveClose,setStep,focusScopeKey,visualReference}} version={versionForSafeguard(id,true)} detail={()=>{}} boundedGuideCorrections/>));
}

test('pilot matrix retains native row-specific choices and toggles only the actual selected row',async()=>{
  const version=versionForSafeguard('1.1',true),question=omniGroups('1.1',{inventory:'Yes'},version)[1].questions.find(q=>q.type==='matrix');
  const [first,second]=question.rows,answers={inventory:'Yes',[question.id]:{[first]:'Yes',[second]:'Not sure'}};
  await render({answers,step:question.id});
  const rows=[...host.querySelectorAll('.sg11-matrix-options')];
  expect(rows.map(row=>row.getAttribute('aria-label'))).toEqual(question.rows);
  for(const row of rows){
    const label=row.getAttribute('aria-label');
    expect([...row.querySelectorAll('button')].map(button=>button.dataset.answer)).toEqual(question.row_choices?.[label]||question.choices);
  }
  const firstChoice=rows[0].querySelector('[data-answer="Yes"]');
  expect(firstChoice.getAttribute('aria-pressed')).toBe('true');
  await act(async()=>firstChoice.click());
  expect(put).toHaveBeenLastCalledWith(question,{[first]:'',[second]:'Not sure'});
  expect(answers[question.id]).toEqual({[first]:'Yes',[second]:'Not sure'});
  const secondChoice=rows[1].querySelector('[data-answer="No"]');
  await act(async()=>secondChoice.click());
  expect(put).toHaveBeenLastCalledWith(question,{[first]:'Yes',[second]:'No'});
});

test('group strip is informative and only native Save/Close callbacks advance workflow',async()=>{
  await render();
  const strip=host.querySelector('.sg11-group-strip');
  expect(strip.querySelectorAll('li')).toHaveLength(5);
  expect(strip.querySelectorAll('button,a,[tabindex]')).toHaveLength(0);
  expect(strip.querySelector('[aria-current="step"]')).toBeTruthy();
  const earlier=strip.querySelector('.sg11-earlier-group');
  expect(earlier.getAttribute('aria-label')).toContain('earlier saved group');
  expect(earlier.querySelector('.sg11-group-check').getAttribute('aria-hidden')).toBe('true');
  expect(strip.querySelector('[aria-current="step"]').classList.contains('sg11-earlier-group')).toBe(false);
  const next=[...host.querySelectorAll('button')].find(button=>button.textContent==='Save & next');
  await act(async()=>next.click());
  expect(onNext).toHaveBeenCalledWith(1,expect.arrayContaining([expect.objectContaining({name:'Asset coverage'})]));
  expect(setStep).not.toHaveBeenCalled();
  const close=[...host.querySelectorAll('button')].find(button=>button.textContent==='Save & close');
  await act(async()=>close.click());expect(onSaveClose).toHaveBeenCalledTimes(1);
  await render({blocked:true});
  expect(host.querySelector('fieldset').disabled).toBe(true);
  expect([...host.querySelectorAll('button')].find(button=>button.textContent==='Save & next').disabled).toBe(true);
});

test('another safeguard retains the existing matrix select and progress DOM',async()=>{
  await render({id:'1.2',answers:{process:'Yes'},step:'inventory_dependency',safeguard11:false});
  expect(host.querySelector('.sg11-group-strip')).toBeNull();
  expect(host.querySelector('.sg11-matrix')).toBeNull();
  expect(host.querySelector('.omni-group-progress')).toBeTruthy();
});

test('same editable appearance withdrawal retains Known gaps text and focus selection without commands',async()=>{
  const answers={inventory:'Yes',coverage_detail:'Retained unsaved coverage context'};
  await render({answers});
  const previous=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{previous.focus();previous.setSelectionRange(3,12,'backward');});
  await render({answers,safeguard11:false});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  expect(native.value).toBe(answers.coverage_detail);expect(document.activeElement).toBe(native);
  expect(native.selectionStart).toBe(3);expect(native.selectionEnd).toBe(12);expect(native.selectionDirection).toBe('backward');
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();expect(setStep).not.toHaveBeenCalled();
});

test('same editable matrix withdrawal focuses the exact native row and retains every answer',async()=>{
  const question=omniGroups('1.1',{inventory:'Yes'},versionForSafeguard('1.1',true))[1].questions.find(q=>q.type==='matrix');
  const [first,second]=question.rows,answers={inventory:'Yes',[question.id]:{[first]:'Yes',[second]:'Not sure'}};
  await render({answers,step:question.id});
  const row=[...host.querySelectorAll('.sg11-matrix-options')].find(node=>node.getAttribute('aria-label')===second);
  await act(async()=>row.querySelector('[data-answer="Not sure"]').focus());
  await render({answers,step:question.id,safeguard11:false});
  const native=[...host.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===second);
  expect(document.activeElement).toBe(native);expect(native.value).toBe('Not sure');
  expect([...host.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===first).value).toBe('Yes');
  expect(answers[question.id]).toEqual({[first]:'Yes',[second]:'Not sure'});
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});

test.each(['changed scope','blocked','missing scope'])('%s withdrawal does not transfer focus into native controls',async condition=>{
  const answers={inventory:'Yes',coverage_detail:'Keep original context'};
  await render({answers,focusScopeKey:condition==='missing scope'?null:'original'});
  const previous=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{previous.focus();previous.setSelectionRange(1,4);});
  await render({answers,safeguard11:false,blocked:condition==='blocked',focusScopeKey:condition==='changed scope'?'different':condition==='missing scope'?null:'original'});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  expect(document.activeElement).not.toBe(native);expect(native.value).toBe(answers.coverage_detail);
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});

test('same editable withdrawal preserves the exact native answer-choice focus without answering again',async()=>{
  const answers={inventory:'Yes'};await render({answers,step:'inventory'});
  const previous=[...host.querySelectorAll('.omni-answer-choices button')].find(node=>node.textContent==='Yes');
  await act(async()=>previous.focus());
  await render({answers,step:'inventory',safeguard11:false});
  const native=[...host.querySelectorAll('.omni-answer-choices button')].find(node=>node.textContent==='Yes');
  expect(document.activeElement).toBe(native);expect(native.getAttribute('aria-pressed')).toBe('true');
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});

test('same editable withdrawal preserves native toolbar focus without executing its command',async()=>{
  await render();
  const previous=[...host.querySelectorAll('.omni-action-bar button')].find(node=>node.textContent==='Save & close');
  await act(async()=>previous.focus());
  await render({safeguard11:false});
  const native=[...host.querySelectorAll('.omni-action-bar button')].find(node=>node.textContent==='Save & close');
  expect(document.activeElement).toBe(native);
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();expect(setStep).not.toHaveBeenCalled();
});

test('changed text is not treated as the retained field selection',async()=>{
  await render({answers:{inventory:'Yes',coverage_detail:'Original local context'}});
  const previous=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{previous.focus();previous.setSelectionRange(1,4);});
  await render({answers:{inventory:'Yes',coverage_detail:'A different accepted context'},safeguard11:false});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  expect(native.value).toBe('A different accepted context');expect(document.activeElement).not.toBe(native);expect(put).not.toHaveBeenCalled();
});

test('denied withdrawal receipt cannot reactivate when an earlier scope returns after native remount',async()=>{
  const answers={inventory:'Yes',coverage_detail:'Retained context across the denied scope'};
  await render({answers,focusScopeKey:'original'});
  const previous=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{previous.focus();previous.setSelectionRange(2,6);});
  await render({answers,safeguard11:false,focusScopeKey:'different'});
  expect(document.activeElement).not.toBe(host.querySelector('[aria-label="Known gaps or uncertainties"]'));
  // Removing the optional visual section remounts native fields without reopening the pilot.
  await render({answers,safeguard11:false,focusScopeKey:'original',visualReference:false});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  expect(native.value).toBe(answers.coverage_detail);expect(document.activeElement).not.toBe(native);
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});

test('same editable appearance round trip preserves Known gaps focus and caret in both directions',async()=>{
  const answers={inventory:'Yes',coverage_detail:'Retained round trip notes'};
  await render({answers});
  const original=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{original.focus();original.setSelectionRange(2,10,'backward');});
  await render({answers,safeguard11:false});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  expect(document.activeElement).toBe(native);expect(native.selectionStart).toBe(2);expect(native.selectionEnd).toBe(10);
  await render({answers,safeguard11:true});
  const returned=host.querySelector('.sg11-question-card [aria-label="Known gaps or uncertainties"]');
  expect(document.activeElement).toBe(returned);expect(returned.value).toBe(answers.coverage_detail);
  expect(returned.selectionStart).toBe(2);expect(returned.selectionEnd).toBe(10);expect(returned.selectionDirection).toBe('backward');
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();expect(setStep).not.toHaveBeenCalled();
});

test('same editable matrix round trip returns focus to the actual selected row answer',async()=>{
  const question=omniGroups('1.1',{inventory:'Yes'},versionForSafeguard('1.1',true))[1].questions.find(q=>q.type==='matrix');
  const [first,second]=question.rows,answers={inventory:'Yes',[question.id]:{[first]:'Yes',[second]:'Not sure'}};
  await render({answers,step:question.id});
  const row=()=>[...host.querySelectorAll('.sg11-matrix-options')].find(node=>node.getAttribute('aria-label')===second);
  await act(async()=>row().querySelector('[data-answer="Not sure"]').focus());
  await render({answers,step:question.id,safeguard11:false});
  const native=[...host.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===second);
  expect(document.activeElement).toBe(native);expect(native.value).toBe('Not sure');
  await render({answers,step:question.id,safeguard11:true});
  const returned=row().querySelector('[data-answer="Not sure"]');
  expect(document.activeElement).toBe(returned);expect(returned.getAttribute('aria-pressed')).toBe('true');
  expect(answers[question.id]).toEqual({[first]:'Yes',[second]:'Not sure'});
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});

test.each(['blocked','changed scope'])('%s appearance return does not transfer native field focus into the pilot',async condition=>{
  const answers={inventory:'Yes',coverage_detail:'Same notes under guarded return'};
  await render({answers});
  await render({answers,safeguard11:false});
  const native=host.querySelector('[aria-label="Known gaps or uncertainties"]');
  await act(async()=>{native.focus();native.setSelectionRange(1,5);});
  await render({answers,safeguard11:true,blocked:condition==='blocked',focusScopeKey:condition==='changed scope'?'different':'client:assessment:actor:version'});
  const returned=host.querySelector('.sg11-question-card [aria-label="Known gaps or uncertainties"]');
  expect(document.activeElement).not.toBe(returned);expect(returned.value).toBe(answers.coverage_detail);
  expect(put).not.toHaveBeenCalled();expect(onNext).not.toHaveBeenCalled();expect(onSaveClose).not.toHaveBeenCalled();
});
