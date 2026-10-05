import cis from '@catalogs/cisIG1.json';
import {activePlans} from './frameworks';
import {recurrencePresentation} from './frameworkWorkspace';
const def=id=>cis.requirements.find(r=>r.id===id);
const days={monthly:30,quarterly:91,semiannual:182,annual:365};
test('CIS 2.1 and 7.1 carry their own explicit intervals inside the more frequent shared Reviews',()=>{
  expect(recurrencePresentation(def('2.1'),cis)).toMatchObject({basis:'REQUIRED_EXPLICIT',explicit:[{interval:'semiannual'}]});
  expect(recurrencePresentation(def('7.1'),cis)).toMatchObject({basis:'REQUIRED_EXPLICIT',explicit:[{interval:'annual'}]});
  // Schedules are unchanged: both plans still run monthly.
  for(const key of ['software-support','vulnerability-remediation'])expect(cis.review_plans.find(p=>p.key===key)).toMatchObject({default_cadence:'monthly',source_minimum:'monthly'});
});
test('every recurring CIS safeguard with a stated interval is labelled explicit, never as a recommendation',()=>{
  for(const r of cis.requirements.filter(r=>r.type==='recurring'&&/month|year|annual|quarter|six months/i.test(r.source_cadence)&&!/see 14\.1/i.test(r.source_cadence)))
    expect([r.id,recurrencePresentation(r,cis).basis]).toEqual([r.id,'REQUIRED_EXPLICIT']);
  for(const p of cis.review_plans.filter(p=>p.cadence_class==='A'))for(const ref of p.cadence_references)expect(days[ref.interval]).toBeGreaterThanOrEqual(days[p.source_minimum]);
});


test.each([1,2,3])('IG%i cadence references belong to the returned plan safeguards',group=>{
  const original=JSON.stringify(cis.review_plans);
  const plans=activePlans('cis-ig1',{implementation_group:group});
  for(const plan of plans){
    const source=cis.review_plans.find(p=>p.key===plan.key);
    expect(plan.cadence_references).toEqual(source.cadence_references.filter(r=>plan.safeguards.includes(r.definition_id)));
  }
  const refs=plans.flatMap(p=>p.cadence_references.map(r=>r.definition_id));
  for(const id of ['6.8','17.9'])expect(refs.includes(id)).toBe(group===3);
  expect(JSON.stringify(cis.review_plans)).toBe(original);
});
