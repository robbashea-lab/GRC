import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {AddAssessmentItemDialog,AssessmentItemTaskDialog} from './AssessmentItemDialogs';
import ClientQuestionsDialog from './ClientQuestionsDialog';

jest.mock('./AssigneeSelect',()=>()=>null);

let host,root,style;
const appearance=fs.readFileSync(path.join(__dirname,'BrawndoAssessmentPilot.css'),'utf8');
function approvedRule(selector){
  const start=appearance.indexOf(selector+' {');
  if(start<0)throw new Error('The approved native layer rule must be reconciled');
  return appearance.slice(start,appearance.indexOf('}',start)+1);
}
function NestedAssessment({kind}){
  const [surface,setSurface]=useState(null);
  const shared={open:true,onOpenChange:jest.fn(),portalContainer:surface,busy:false,disabled:false};
  const subject=kind==='add'?<AddAssessmentItemDialog {...shared} draft={{item_type:'gap',text:'Synthetic QA'}} onChange={jest.fn()} onSubmit={jest.fn()}/>
    :kind==='task'?<AssessmentItemTaskDialog {...shared} item={{text:'Synthetic QA'}} draft={{title:'Synthetic QA',description:'',priority:'medium',assignee_id:null,due_date:null}} clientId="synthetic-client" users={[]} onChange={jest.fn()} onSubmit={jest.fn()}/>
      :<ClientQuestionsDialog {...shared} scopeKey="synthetic-scope" clientLabel="Synthetic client" programLabel="Synthetic program"/>;
  return <Dialog open><DialogContent ref={setSurface} className="brawndo-assessment-pilot gn-window">
    <DialogTitle>Native assessment parent</DialogTitle><DialogDescription>Synthetic layer fixture.</DialogDescription>
    {surface&&subject}
  </DialogContent></Dialog>;
}

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  style=document.createElement('style');
  // JSDOM does not apply these qualified rules faithfully through getComputedStyle.
  // Check actual DOM selector binding and source declarations; Browser hit-testing remains required.
  style.textContent=approvedRule(':root body .brawndo-assessment-pilot.brawndo-assessment-pilot.gn-dialog-layer[data-state]')+'\n'
    +approvedRule(':root body .ui-dialog.brawndo-assessment-pilot.brawndo-assessment-pilot[data-state].gn-dialog-box');
  document.head.appendChild(style);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();style.remove();});

test.each(['add','task','questions'])('%s dialog binds its backdrop below the panel using the approved native rules',async kind=>{
  await act(async()=>root.render(<NestedAssessment kind={kind}/>));
  const parent=document.body.querySelector('.gn-window'),content=parent.querySelector('[role="dialog"]');
  expect(content).toBeTruthy();
  const overlay=[...parent.children].find(node=>node.classList.contains('ui-overlay'));
  expect(overlay).toBeTruthy();
  const rules=[...style.sheet.cssRules];
  const panelRule=rules.find(rule=>content.matches(rule.selectorText));
  const backdropRule=rules.find(rule=>overlay.matches(rule.selectorText));
  expect(panelRule).toBeTruthy();expect(backdropRule).toBeTruthy();
  const panelLayer=Number(panelRule.style.getPropertyValue('z-index')),backdropLayer=Number(backdropRule.style.getPropertyValue('z-index'));
  expect(Number.isFinite(panelLayer)&&Number.isFinite(backdropLayer)).toBe(true);
  expect(panelLayer).toBeGreaterThan(backdropLayer);
  expect(content.querySelector('button')).toBeTruthy();
});
