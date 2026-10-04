import guide from '@catalogs/operatorGuidance/cisRequirementGuide.json';
import catalog from '@catalogs/cisIG1.json';
import {GUIDE_QUESTIONS} from '@/components/CisRequirementGuide';

test('all 130 safeguards have five distinct, concise, versioned static answers',()=>{
  expect(guide.framework).toBe('cis-ig1');expect(guide.version).toBe(catalog.version);
  expect(guide.revision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Object.keys(guide.requirements)).toEqual(catalog.requirements.map(r=>r.id));
  const answers=[];
  for(const item of Object.values(guide.requirements)){
    expect(Object.keys(item)).toEqual(GUIDE_QUESTIONS.map(([key])=>key));
    for(const answer of Object.values(item)){
      expect(answer.trim()).toBe(answer);expect(answer.split(/\s+/).length).toBeGreaterThan(15);
      expect(answer.split(/\s+/).length).toBeLessThanOrEqual(90);
      expect(answer).not.toMatch(/Brawndo|demo_|upload|API key|as an AI|your organization is compliant/i);
      answers.push(answer);
    }
  }
  expect(answers).toHaveLength(650);expect(new Set(answers).size).toBe(650);
  expect(JSON.stringify(guide)).not.toMatch(/"score"|"status"|"client_id"|cis_assessment_criteria|verification_checklist/);
});

test.each([
  ['1.1',/at least every six months/],['1.2',/each week/],
  ['2.2',/protective measures and acceptance of the risk that remains/],
  ['2.3',/remove it from use or record an exception/],
  ['3.4',/minimum and maximum/],['4.3',/15 minutes.*2 minutes/],
  ['4.4',/wherever supported/],['4.6',/unless they are operationally essential/],
  ['5.1',/at least quarterly/],['5.2',/8 characters.*14 without it as best practices/],
  ['5.3',/45 days.*where the system supports/],['6.2',/immediately/],
  ['6.3',/wherever supported/],['6.5',/wherever it is supported/],
  ['7.2',/not a universal deadline/],['7.3',/apply operating-system updates at least monthly/],
  ['7.4',/automated patch management at least monthly/],['8.3',/does not impose.*IG2 90-day/],
  ['9.1',/vendor's latest version/],['9.2',/all end-user devices, in the office and remotely/],
  ['10.3',/not the same as banning every USB/],['11.2',/at least weekly.*sensitivity/],
  ['11.3',/Equivalent protection depends/],['11.4',/location alone does not prove isolation/],
  ['14.1',/when hired and at least annually/],['14.8',/Where remote workers exist/],
  ['15.1',/classified.*inside the organization/],['17.1',/at least one backup/],
  ['17.1',/at least one internal person/],['17.2',/verify them annually/],
  ['17.3',/when to report, to whom, by what method and what minimum information/],
])('%s preserves its material boundary',(id,pattern)=>expect(guide.requirements[id].plain).toMatch(pattern));

test('governance questions go to business owners rather than assuming IT owns everything',()=>{
  for(const id of ['3.1','3.2','14.1','14.4','15.1','17.1','17.2','17.3']){
    expect(guide.requirements[id].ask).toMatch(/data owners|HR|training owner|procurement|management|incident owner/i);
  }
});
