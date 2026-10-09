import {omniGroups,refinedSummary,recordedOmniReasons,multipleOmniSources} from './refinedOmni';
import {visibleQuestions,versionForSafeguard,validateAnswers} from './guidedAssessment';
import {focusedResult} from './focusedOmni';

const complete=id=>Object.fromEntries(visibleQuestions(id,{[id==='1.1'?'inventory':'process']:'Yes'},versionForSafeguard(id,true)).map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?'2026-10-01':q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':'Yes']));
test.each(['1.1','1.2'])('%s groups retain every active production question exactly once, including exclusions and notes',id=>{
  const version=versionForSafeguard(id,true);
  for(const value of ['Yes','Partially','No','Not sure']){
    const a={[id==='1.1'?'inventory':'process']:value,...(id==='1.1'?{coverage:{Servers:'Not applicable'}}:{})};
    const grouped=omniGroups(id,a,version).flatMap(g=>g.questions.map(q=>q.id));
    expect(grouped.slice().sort()).toEqual(visibleQuestions(id,a,version).map(q=>q.id).sort());expect(new Set(grouped).size).toBe(grouped.length);
  }
  expect(omniGroups('1.1',{},versionForSafeguard('1.1',true)).map(g=>g.name)).toEqual(['Inventory','Asset coverage','Inventory details','Keeping it current','Review and reconciliation']);
});
test('multiple-source explanations use the accepted versioned detail field and inactive source data does not enter a summary',()=>{
  const version=versionForSafeguard('1.1',true),a={...complete('1.1'),sources:'Multiple reconciled sources',sources_detail:'Synthetic devices export — endpoints; network log — network assets.'};
  expect(validateAnswers('1.1',a,version)).toBe(a);expect(multipleOmniSources(a)).toBe(true);
  expect(refinedSummary('1.1',a,version).narrative).toContain(a.sources_detail);
  const switched={...a,sources:'One source'};expect(multipleOmniSources(switched)).toBe(false);expect(refinedSummary('1.1',switched,version).narrative).not.toContain(a.sources_detail);expect(switched.sources_detail).toBe(a.sources_detail);
});

test('group context keys are valid versioned details and never alias a production question',()=>{
  for(const id of ['1.1','1.2']){
    const version=versionForSafeguard(id,true),answers=complete(id),questions=visibleQuestions(id,answers,version);
    for(const group of omniGroups(id,answers,version)){const key=group.note+'_detail';expect(questions.map(q=>q.id)).not.toContain(key);answers[key]='Synthetic contextual note';}
    expect(validateAnswers(id,answers,version)).toBe(answers);expect(refinedSummary(id,answers,version).status).toBe(focusedResult(id,complete(id),version).status);
  }
});
test.each(['1.1','1.2'])('%s optional group context is retained without inventing a deficiency or new scoring rule',id=>{
  const version=versionForSafeguard(id,true),a={...complete(id),evidence_detail:'Synthetic supporting context: ask the backup owner about the report format.'};
  const output=refinedSummary(id,a,version);expect(output.narrative).toContain(a.evidence_detail);expect(output.status).toBe(focusedResult(id,complete(id),version).status);expect(output.verification).toBeUndefined();expect(output.narrative).toContain('Recorded implementation');expect(output.narrative).toContain('Items to address or confirm');
  if(id==='1.2'){expect(output.narrative).toContain('Handling and confirmation');expect(output.narrative).not.toContain('Required asset details');}
});
test('matrix summary distinguishes missing coverage from uncertainty and does not change exclusions or requirement meaning',()=>{
  const v=versionForSafeguard('1.1',true),a={...complete('1.1'),coverage:{...complete('1.1').coverage,Servers:'Partially','Cloud-hosted assets':'Not sure'}};
  const output=refinedSummary('1.1',a,v);expect(output.narrative).toContain('Servers are only partially inventoried');expect(output.narrative).toContain('Cloud-hosted assets coverage is not confirmed');expect(output.status).not.toBe('addressed');
});
test('recommendation reasons describe only saved native source and linked records, deduplicate, cap at five and refresh after resolution',()=>{
  const v=versionForSafeguard('1.1',true),a=complete('1.1'),row={definition_id:'1.1',status:'in_progress',guided_assessment_source:{answers:{...a,coverage:{...a.coverage,Servers:'Partially','Cloud-hosted assets':'Not sure'}},version:v},work:{context_complete:true,open_findings:1}};
  const reasons=recordedOmniReasons(row,true);
  expect(reasons).toContain('Servers are not fully included in the inventory.');expect(reasons).toContain('Cloud-hosted assets coverage needs confirmation.');expect(reasons.join(' ')).not.toContain('UNAPPLIED');expect(reasons.length).toBeLessThanOrEqual(5);
  const resolved={...row,status:'addressed',verification:'verified',guided_assessment_source:{answers:a,version:v},work:{context_complete:true}};
  expect(recordedOmniReasons(resolved,true).join(' ')).not.toContain('Servers');
  expect(recordedOmniReasons({...row,status:'not_assessed'},false)).toEqual(['This safeguard has not been assessed yet.']);
  expect(recordedOmniReasons(row,false)[0]).toContain('unavailable');
});
