import cis from '@catalogs/cisIG1.json';
import {catalogForVersion,versionForSafeguard,visibleQuestions} from './guidedAssessment';
import {omniGroups} from './refinedOmni';
import {omniCisSummary} from './omniCisSummary';
import {inventorySummary} from './omniInventorySummary';

const complete=id=>Object.fromEntries(catalogForVersion(versionForSafeguard(id)).safeguards[id].map(q=>[q.id,
  q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):
    q.type==='text'?'':q.type==='date'?'2026-09-01':q.type==='multi'?['Quarantine or isolate']:
      q.id==='frequency'?(id==='1.1'?'Every six months':id==='1.3'?'Daily':'Weekly'):
        q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));

test('15.5 summary uses the visible requirements topic instead of exposing its stored note key',()=>{
  const id='15.5',version=versionForSafeguard(id),answers={...complete(id),requirements_0_detail:'SYNTHETIC QA: retain this exact group note.'};
  const original=JSON.stringify(answers),summary=omniCisSummary(id,answers,version,'Synthetic client').result;
  expect(omniGroups(id,answers,version).find(group=>group.note==='requirements_0').name).toBe('Safeguard requirements');
  expect(summary.narrative).toContain('- Reported context for Safeguard requirements: '+answers.requirements_0_detail);
  expect(summary.narrative).not.toMatch(/Reported requirements 0 context|requirements_0/);
  expect(summary.status).toBe('addressed');expect(JSON.stringify(answers)).toBe(original);
});

test.each(cis.requirements.filter(row=>row.control!==1).map(row=>row.id))('%s labels each matrix note with its visible group and preserves its content and factual outcome',id=>{
  const version=versionForSafeguard(id),answers=complete(id),before=omniCisSummary(id,answers,version,'Synthetic client').result;
  const matrices=visibleQuestions(id,answers,version).filter(q=>q.type==='matrix');
  for(const q of matrices)answers[q.id+'_detail']='Exact operator note for '+id+'\nSecond line: preserve punctuation & content.';
  const original=JSON.stringify(answers),summary=omniCisSummary(id,answers,version,'Synthetic client').result;
  for(const q of matrices){
    const group=omniGroups(id,answers,version).find(group=>group.note===q.id);
    expect(summary.narrative).toContain('- Reported context for '+group.name+': '+answers[q.id+'_detail']);
    expect(summary.narrative).not.toContain('Reported '+q.id.replaceAll('_',' ')+' context:');
  }
  expect(summary.status).toBe(before.status);expect(summary.gaps).toEqual(before.gaps);expect(summary.unknowns).toEqual(before.unknowns);
  expect(JSON.parse(JSON.stringify({implementation:summary.narrative})).implementation).toBe(summary.narrative);
  expect(JSON.stringify(answers)).toBe(original);
});

test('approved 1.1 summary is delegated unchanged, including the established group-note wording',()=>{
  const version=versionForSafeguard('1.1'),answers={...complete('1.1'),inventory_detail:'Inventory operator note.',coverage_detail:'Coverage operator note.',attributes_detail:'Exact attribute note.'};
  expect(omniCisSummary('1.1',answers,version,'Brawndo')).toEqual(inventorySummary(answers,version,'Brawndo'));
});

test('existing named 1.2 note labels and exact operator content remain unchanged',()=>{
  const answers={...complete('1.2'),actions_detail:'Exact response note\nSecond operator line.'},result=omniCisSummary('1.2',answers,versionForSafeguard('1.2'),'Synthetic client').result;
  expect(result.narrative).toContain('- Reported response actions context: '+answers.actions_detail);
  expect(result.status).toBe('addressed');
});
