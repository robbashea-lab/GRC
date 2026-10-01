import cis from './cisIG1.json';
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
