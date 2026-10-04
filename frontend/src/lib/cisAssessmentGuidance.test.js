import data from '@catalogs/operatorGuidance/cisAssessmentGuidance.json';
import catalog from '@catalogs/cisIG1.json';
import legacy from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';

test('versioned, shared read-only guidance covers exactly the 153 cumulative IG3 safeguards',()=>{
  expect(data.framework).toBe('cis-ig1');expect(data.version).toBe(catalog.version);
  expect(data.revision).toBe('2026-10-04');
  expect(Object.keys(data.requirements)).toEqual(catalog.requirements.map(r=>r.id));
  expect(Object.keys(data.requirements)).toHaveLength(153);
  for(const [id,guidance] of Object.entries(data.requirements)){
    expect(Object.keys(guidance)).toEqual(['review','evidence','outcome']);
    for(const group of Object.values(guidance)){
      expect(group.length).toBeGreaterThanOrEqual(2);
      expect(new Set(group).size).toBe(group.length);
      for(const text of group){
        expect(text.trim()).toBe(text);expect(text).not.toBe('');
        expect(text).not.toMatch(/upload|Brawndo|demo_|must purchase|guarantees compliance/i);
      }
    }
    for(const text of guidance.review)expect(text).toMatch(/review|confirm|compare|identify|verify|check|inspect|examine|CIS gives/i);
    expect(legacy.requirements[id].source).toMatch(/^https:\/\/cas\.docs\.cisecurity\.org\/en\/latest\/source\/Controls\d+\/#/);
  }
  expect(new Set(Object.values(data.requirements).map(r=>JSON.stringify(r))).size).toBe(153);
});

const text=id=>JSON.stringify(data.requirements[id]);
test.each([
  ['1.1',/static network address.*hardware address.*machine name.*owner.*department.*approval/],
  ['1.1',/at least every six months/],['1.2',/each week/],
  ['2.1',/title.*publisher.*initial installation\/use date.*business purpose/],
  ['2.1',/URL.*app store.*versions.*deployment mechanism.*retirement date.*license count/],
  ['2.2',/mitigating controls.*acceptance of residual risk/],['2.3',/removed.*documented exception/],
  ['3.4',/minimum and maximum/],['4.3',/15 minutes.*2 minutes/],
  ['4.4',/wherever supported/],['4.5',/deny traffic.*explicitly allowed/],
  ['4.6',/operationally essential/],['5.1',/person's name.*username.*start\/stop dates.*department/],
  ['5.1',/at least quarterly/],['5.2',/best-practice examples.*8 characters with MFA and 14 without/],
  ['5.3',/45-day/],['6.2',/disabled immediately/],['6.3',/wherever supported/],
  ['6.5',/provider-managed/],['7.3',/applies OS updates monthly/],['7.4',/updates are applied monthly/],
  ['8.3',/Do not impose.*IG2 90-day/],['9.1',/vendor's latest version/],
  ['9.2',/all end-user devices.*on-premises and remote/],['11.2',/at least weekly.*sensitivity/],
  ['11.3',/equivalent to the original/],['11.4',/isolated instance/],['12.1',/monthly or more frequently/],
  ['14.1',/at hire and at least annually/],['14.8',/secure configuration of home network/],
  ['15.1',/classifications.*enterprise contact/],['17.1',/lead and at least one backup/],
  ['17.1',/at least one internal person/],['17.2',/verified annually/],
  ['17.3',/timeframes.*recipients.*mechanism.*minimum information/],
])('%s retains its specific source detail (%s)',(id,detail)=>expect(text(id)).toMatch(detail));

test('guidance preserves legacy criteria and does not use response IDs as conclusions',()=>{
  expect(legacy.revision).toBe('2026-10-04');
  const inherited=catalog.requirements.filter(d=>d.implementation_group===1);
  expect(inherited.flatMap(d=>legacy.requirements[d.id].criteria)).toHaveLength(85);
  expect(JSON.stringify(data)).not.toMatch(/"status"|"score"|cis_assessment_criteria|verification_checklist/);
  expect(text('1.2')).not.toContain('risk acceptance');
  expect(text('5.3')).toContain('generic risk acceptance is not a substitute');
});

test('8.5, 9.4 and 16.7 retain their source boundaries across assessment criteria and current guidance',()=>{
 const requirements=Object.fromEntries(catalog.requirements.map(d=>[d.id,d]));
 expect(legacy.requirements['8.5'].criteria.map(c=>c.id)).toEqual(['8.5-c1','8.5-c2','8.5-c3']);
 for(const id of ['9.4','16.7'])expect(legacy.requirements[id].criteria.map(c=>c.id)).toEqual([id+'-c1',id+'-c2']);
 for(const payload of [requirements,legacy.requirements,data.requirements]){
  const logs=JSON.stringify(payload['8.5']),extensions=JSON.stringify(payload['9.4']),hardening=JSON.stringify(payload['16.7']);
  expect(logs).toMatch(/event source.*date.*username.*timestamp.*source.*destination addresses/i);
  expect(logs).toMatch(/sensitive data|sensitive-data/);expect(logs).not.toMatch(/where available/);
  expect(extensions).toMatch(/uninstall.*or disabl/i);expect(extensions).toMatch(/plugins.*extensions.*add-on applications/);
  expect(hardening).toMatch(/servers.*databases.*web servers.*cloud containers.*PaaS.*SaaS/);
  expect(hardening).toMatch(/in-house developed software.*(?:must not|does not|to) weaken configuration hardening/i);
 }
});
