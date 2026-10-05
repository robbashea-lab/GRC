import cis from '@catalogs/cisIG1.json';
import criteria from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';
import guides from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import {activePlans,reviewConfig} from './frameworks';

const ids='1.5 2.7 3.13 3.14 4.12 6.8 8.12 9.7 12.8 13.7 13.8 13.9 13.10 13.11 15.5 15.6 15.7 16.12 16.13 16.14 17.9 18.4 18.5'.split(' ');
test('all actual IG3 definitions have stable criteria, review/evidence/outcome and five guide answers',()=>{
 expect(cis.requirements.filter(d=>d.implementation_group===3).map(d=>d.id)).toEqual(ids);
 expect(cis.available_implementation_groups).toEqual([1,2,3]);
 for(const id of ids){
  const entry=criteria.requirements[id];
  const retained=[...entry.criteria,...(entry.legacy_criteria||[])].map(c=>c.id);
  for(const suffix of [1,2,3])expect(retained).toContain(id+'-c'+suffix);
  expect(entry.criteria.length).toBeGreaterThan(0);
  for(const field of ['review','evidence','outcome'])expect(guidance.requirements[id][field].length).toBeGreaterThanOrEqual(2);
  expect(Object.keys(guides.requirements[id])).toEqual(['plain','start','evidence','ask','gaps']);
  expect(cis.review_plans.some(p=>p.default_enabled!==false&&p.safeguards.includes(id))).toBe(true);
 }
});

test.each([
 ['1.5',/at least weekly/i],['2.7',/every six months/i],['3.13',/stored, processed and transmitted/i],
 ['3.14',/access, modification and disposal/i],['4.12',/supported/i],['6.8',/at least annually/i],
 ['8.12',/supported/i],['9.7',/email servers/i],['12.8',/no internet/i],['13.7',/appropriate and\/or supported/i],
 ['13.8',/where appropriate/i],['13.9',/authentication/i],['13.10',/application.layer/i],['13.11',/monthly/i],
 ['15.5',/new\/renewed contracts/i],['15.6',/policy defines/i],['15.7',/decommissioning/i],
 ['16.12',/static and dynamic/i],['16.13',/authenticated/i],['16.14',/before coding/i],
 ['17.9',/significant/i],['18.4',/after each test/i],['18.5',/at least annually/i],
])('%s retains its distinct scope/timing obligation',(id,pattern)=>expect(JSON.stringify(guidance.requirements[id])).toMatch(pattern));

test('optional timing templates retain seven-day weekly selection and do not select themselves',()=>{
 const state={requirements:{'cis-ig1':'applies'},framework_settings:{'cis-ig1':{implementation_group:3}}};
 const plans=activePlans('cis-ig1',state.framework_settings['cis-ig1']);
 const optional=plans.filter(p=>p.default_enabled===false);
 expect(optional).toHaveLength(5);
 expect(optional.every(p=>!reviewConfig(state,p).enabled)).toBe(true);
 const weekly=optional.find(p=>p.key==='passive-discovery-reconciliation');
 expect(reviewConfig(state,weekly)).toMatchObject({enabled:false,recurrence:'custom',custom_recurrence_days:7});
 expect(plans.find(p=>p.key==='penetration-testing').title).toBe('Penetration Testing Program Review');
});
