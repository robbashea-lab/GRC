import {brawndoAssessmentPilotEligible,brawndoAssessmentQuestionGuidance} from './brawndoAssessmentPilot';
import current from '@catalogs/guidedControl1V5.json';

function context() {
  const record={client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1',framework_assessment_id:'native-assessment-1.1'};
  return {demoMode:true,workspaceMode:'demo',user:{workspace_mode:'demo'},pathname:'/compliance/cis-ig1',safeguard11:true,directProgramOpener:true,record,current:{...record},
    ctx:{configuration:{implementation_group:1},current:{...record},visualOrigin:{selected:true,configured:true,programId:'demo_brawndo:cis-ig1',framework:{key:'cis-ig1',version:'8.1'}}}};
}
test('only the joined canonical Demo IG1 1.1 identity opts into the presentation',()=>{
  expect(brawndoAssessmentPilotEligible(context())).toBe(true);
  const mutations=[
    value=>value.demoMode=false,value=>value.workspaceMode='standard',value=>value.user.workspace_mode='standard',
    value=>value.pathname='/action-items',value=>value.directProgramOpener=false,
    value=>delete value.directProgramOpener,value=>value.directProgramOpener='true',
    value=>value.safeguard11=false,value=>value.record.client_id='demo_initech',
    value=>value.ctx.configuration.implementation_group=2,value=>value.ctx.configuration.implementation_group=3,
    value=>value.ctx.visualOrigin.selected=false,value=>value.ctx.visualOrigin.configured=false,
    value=>value.ctx.visualOrigin.programId='other:cis-ig1',value=>value.ctx.visualOrigin.framework.key='soc-2',
    value=>value.ctx.visualOrigin.framework.version='8',value=>value.record.framework_assessment_id=' ',
    ...['record','current'].flatMap(key=>[
      value=>value[key].definition_id='1.2',value=>value[key].framework_version='8',
      value=>value[key].framework_key='iso-27001',value=>value[key].framework_assessment_id='foreign',
    ]),
    value=>value.ctx.current.client_id='foreign',value=>value.ctx.current.framework_assessment_id='foreign',
  ];
  for(const mutate of mutations){const value=context();mutate(value);expect(brawndoAssessmentPilotEligible(value)).toBe(false);}
  expect(brawndoAssessmentPilotEligible({})).toBe(false);
});
test('guidance covers the complete native question set without changing it or assigning responses',()=>{
  const before=JSON.stringify(current);
  for(const question of current.safeguards['1.1'])expect(brawndoAssessmentQuestionGuidance(question.id)).toBeTruthy();
  expect(brawndoAssessmentQuestionGuidance('frequency')).toMatchObject({highlight:'at least every six months'});
  expect(brawndoAssessmentQuestionGuidance('system')).toEqual({context:expect.stringContaining('does not prescribe')});
  expect(brawndoAssessmentQuestionGuidance('other')).toBeNull();
  expect(JSON.stringify(current)).toBe(before);
});
