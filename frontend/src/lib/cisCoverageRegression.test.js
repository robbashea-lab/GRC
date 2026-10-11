import catalog from '@catalogs/cisIG1.json';
import guidance from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';
import criteria from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import guidedProgram from '@catalogs/guidedCisProgram.json';
import {cisReviewBriefs} from './cisOperations';

test.each([
  ['1.4', /(?:all DHCP servers|every DHCP server).*IP address management.*weekly/i],
  ['3.8', /service-provider data flows.*data management process/i],
  ['12.2', /segmentation.*least privilege.*availability/i],
  ['12.7', /(?=.*end-user device)(?=.*users.*authenticate)(?=.*VPN.*authentication)/i],
  ['15.4', /security requirements.*service provider management policy/i],
])('%s retains source-specific scope in assessment and guide', (id, expected) => {
  expect(guidance.requirements[id].review.join(' ')).toMatch(expected);
  expect(guide.requirements[id].plain + ' ' + guide.requirements[id].ask).toMatch(expected);
});

test('every safeguard retains all non-repeated grouped Review prompts and supporting guidance', () => {
  const ids = catalog.requirements.map(r => r.id);
  const covered = new Set();
  for (const plan of catalog.review_plans) {
    const [brief] = cisReviewBriefs({framework_key:'cis-ig1', framework_plan_key:plan.key, framework_safeguards:plan.safeguards}, ids);
    expect(brief).toBeTruthy();
    for (const item of brief.items) {
      covered.add(item.id);
      const expected = guidance.requirements[item.id].review.filter(text => text !== `${item.source_cadence} Confirm relevant exceptions and follow-up with the accountable owner.`);
      expect(item.reviewQuestions).toEqual([...new Set(expected)]);
      expect(item.evidence).toBeTruthy();
      expect(item.outcome).toBeTruthy();
      for (const part of ['plain','start','evidence','ask','gaps']) expect(guide.requirements[item.id][part]).toBeTruthy();
    }
  }
  expect([...covered].sort()).toEqual([...ids].sort());
  expect(catalog.requirements.find(r=>r.id==='3.11').title).toBe('Encrypt Sensitive Data at Rest');
  expect(guide.requirements['12.7'].start).toMatch(/end-user device access paths/i);
  expect(guide.requirements['12.7'].evidence).toMatch(/end-user device access-path/i);
  expect(guidance.requirements['12.7'].evidence.join(' ')).toMatch(/end-user device access-path/i);
});


test('11.1 retains recovery-process scope, cadence and the approved CAS requirement',()=>{
  const definition=catalog.requirements.find(r=>r.id==='11.1');
  const checks=guidance.requirements['11.1'],help=guide.requirements['11.1'];
  for(const text of [definition.guidance,checks.outcome[0],criteria.requirements['11.1'].criteria.map(c=>c.text).join(' '),help.plain]){
    expect(text).toMatch(/scope/i);expect(text).toMatch(/prioriti/i);expect(text).toMatch(/(?=.*backup)(?=.*secur)/i);
  }
  // CAS includes this clause; Navigator omits it. Retain the reviewed rollout interpretation.
  expect(guidedProgram.definitions['11.1'].elements).toContainEqual({
    id:'11.1-guided-backup-procedures',
    text:'The documented recovery process includes detailed backup procedures.',
    conditional:false,
  });
  expect(help.plain).toMatch(/annually.*significant.*changes/i);
  expect(checks.review[1]).toMatch(/annual.*significant changes/i);
  expect(checks.outcome[1]).toMatch(/annual.*significant-change/i);
  expect(help.gaps).toMatch(/(?:Do not require|Do not add).*separate higher-group restore-test frequency/i);
  const [brief]=cisReviewBriefs({framework_key:'cis-ig1',framework_plan_key:'data-recovery',framework_safeguards:['11.1']},['11.1']);
  expect(brief.items[0].outcome).toBe(checks.outcome[0]);
});

test.each([
  ...Object.entries(guide.requirements['11.1']).map(([field,text])=>[`guide.${field}`,text]),
  ['assessment.review',guidance.requirements['11.1'].review[0]],
  ['assessment.evidence',guidance.requirements['11.1'].evidence[0]],
  ['assessment.outcome',guidance.requirements['11.1'].outcome[0]],
])('11.1 %s covers detailed backup procedures without contradicting the interview',(_field,text)=>{
  expect(text).toMatch(/detailed backup procedures/i);
  expect(text).not.toMatch(/(?:backup procedures|backup instructions).*?(?:optional|not required|not a separate requirement)|Do not require detailed backup procedures/i);
});

test('3.8 setup covers internal and provider flows under the data management process',()=>{
  const definition=catalog.requirements.find(r=>r.id==='3.8');
  for(const text of [definition.operating_guidance.establish,guide.requirements['3.8'].start])
    expect(text).toMatch(/internal and service-provider data flows.*enterprise data management process/i);
  expect(definition.operating_guidance.establish).not.toMatch(/material flows|external destinations/i);
  expect(guide.requirements['3.8'].start).toMatch(/without limiting coverage/i);
});

test('12.7 expected outcome retains user authentication across end-user access paths',()=>{
  expect(guidance.requirements['12.7'].outcome[0]).toMatch(/Users authenticate.*VPN and authentication services.*end-user devices/i);
  expect(guidance.requirements['12.7'].outcome[0]).not.toMatch(/authenticate remote devices/i);
});
