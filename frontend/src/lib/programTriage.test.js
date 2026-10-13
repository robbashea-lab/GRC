import {rankProgramRows,normalizedPriority} from './programTriage';
const row=(id,status='needs_attention',extra={})=>({client_id:'a',framework_key:'cis-ig1',framework_assessment_id:'a:'+id,definition_id:id,status,verification:'verified',items_to_address:[{item_id:'i:'+id,question_id:'requirements_0',kind:'gap',state:'open',source_version:'test'}],...extra});
const map=(tier,extra={})=>({discovery:{dependency:1,importance:tier,rationale:'Reviewed fixture'},gaps:{requirements_0:{tier,rationale:'Reviewed precise gap'}},...extra});
const mapping={'cis-ig1':{'1.1':map(2),'1.2':map(2),'6.5':map(3),'10.1':map(1)}};
test('discovery always precedes gaps; material partial precedes routine absent and equivalent status ties are deterministic',()=>{
  const input=[row('10.1'),row('6.5','in_progress'),row('1.2','in_progress'),row('1.1'),row('99.1','not_assessed')],before=JSON.stringify(input);
  expect(rankProgramRows(input,{mapping}).map(r=>r.definition_id)).toEqual(['99.1','6.5','1.1','1.2','10.1']);
  expect(JSON.stringify(input)).toBe(before);
});
test('highest exact linked severity wins; unrelated evidence findings and task priority do not manufacture an implementation gap',()=>{
  const important=row('1.2','in_progress');important.items_to_address[0].finding_id='f';
  important.work={priority_records:[{kind:'findings',id:'f',severity:'Critical',client_id:'a',framework_assessment_id:'a:1.2',assessment_item_id:'i:1.2',risk_id:'r'},
    {kind:'risks',id:'r',client_id:'a',risk_level:'high'}, {kind:'tasks',id:'t',client_id:'a',finding_id:'f',priority:'low',due_date:'2026-11-01'}]};
  const clean=row('2.1','addressed',{items_to_address:[],work:{open_findings:1,priority_records:[{kind:'findings',id:'evidence',severity:'critical',open_gap:true}]}});
  const result=rankProgramRows([clean,row('6.5'),important],{mapping});
  expect(result.map(r=>r.definition_id)).toEqual(['1.2','6.5','2.1']);
  expect(result[0].triage).toMatchObject({priority:4,basis:'linked_native_severity'});
  expect(result[2].triage.bucket).toBe(2);
  important.work.priority_records[0].assessment_item_id='other';
  expect(rankProgramRows([important],{mapping})[0].triage.priority).toBe(2);
});
test('closing a Finding never hides a still-open gap; resolved items do not falsely implement a saved absent requirement',()=>{
  const record=row('1.1');record.items_to_address[0].finding_id='f';record.work={priority_records:[{kind:'findings',id:'f',status:'closed',severity:'critical',client_id:'a',framework_assessment_id:'a:1.1',assessment_item_id:'i:1.1'}]};
  expect(rankProgramRows([record],{mapping})[0].triage).toMatchObject({bucket:1,priority:2});
  record.items_to_address[0].state='resolved';expect(rankProgramRows([record],{mapping})[0].status).toBe('needs_attention');
});
test('implemented with real gap joins remediation, while verification alone and old optional prose do not',()=>{
  const gap=row('1.1','addressed'),partial=row('1.2','in_progress');
  const evidence=row('3.1','addressed',{items_to_address:[{state:'open',kind:'verification'}],verification:'gap_identified'});
  const oldNote=row('CC1.1','addressed',{framework_key:'soc-2',items_to_address:[{state:'open',kind:'gap',question_id:'gaps'}]});
  expect(rankProgramRows([gap,partial,evidence],{mapping}).map(r=>r.definition_id)).toEqual(['1.2','1.1','3.1']);
  expect(rankProgramRows([oldNote],{frameworkKey:'soc-2',mapping})).toEqual([]);
});
test('scope, applicability, duplicate identities, neutral fallbacks and approved native scale normalization',()=>{
  const input=[row('1.1'),row('1.1'),row('1.2','not_applicable'),row('3.1','not_assessed',{client_id:'b'}),row('CC1.1','not_assessed',{framework_key:'soc-2'}),row('4.1','not_assessed',{in_active_scope:false}),row('99.1')];
  const output=rankProgramRows(input,{clientId:'a',frameworkKey:'cis-ig3',mapping});
  expect(output.map(r=>r.definition_id)).toEqual(['1.1','99.1']);
  expect(output[1].triage).toMatchObject({priority:2,unmapped:true});
  expect(['critical','Immediate','HIGH','moderate','medium','low','unsupported'].map(normalizedPriority)).toEqual([4,4,3,2,2,1,null]);
});

test('only actually unresolved matrix rows contribute priority, and deadlines break equivalent native status ties',()=>{
  const local={'cis-ig1':{'1.1':map(4,{gaps:{requirements_0:{tier:4,rationale:'Highest actual row only',criteria:{routine:{tier:1,rationale:'Reviewed routine row'},material:{tier:4,rationale:'Reviewed material row'}}}}}),'1.2':map(1)}};
  const a=row('1.1'),b=row('1.2');a.guided_assessment_source={version:'test',answers:{requirements_0:{routine:'No',material:'Yes'}}};
  expect(rankProgramRows([a],{mapping:local})[0].triage.priority).toBe(1);
  for(const record of [a,b]){const fid='f:'+record.definition_id;record.items_to_address[0].finding_id=fid;record.work={priority_records:[{kind:'findings',id:fid,client_id:'a',framework_assessment_id:record.framework_assessment_id,assessment_item_id:record.items_to_address[0].item_id,severity:'low',due_date:record===a?'2026-12-01':'2026-11-01'}]};}
  expect(rankProgramRows([a,b],{mapping:local}).map(record=>record.definition_id)).toEqual(['1.2','1.1']);
});
