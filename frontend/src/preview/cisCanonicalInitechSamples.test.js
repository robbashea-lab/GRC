import {activeDefinitions} from '../lib/frameworks';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {INITECH_SCENARIO_PROFILE, initechSafeguardContent} from './cisCanonicalInitechContent';
import {initechOperatingSamples} from './cisCanonicalInitechSamples';

const dates = cisDemoFixtureDates(new Date('2026-11-02T12:00:00.000Z'));
const rowsOf = artifacts => artifacts.flatMap(item => item.rows);
const idsOf = rows => [...new Set(rows.flatMap(row => row.safeguards.split('|')))].sort();
const values = (rows, id) => rows.filter(row => row.safeguards.split('|').includes(id)).map(row => row.observed_value).join('\n');
const csv = artifact => {
  const columns = [...new Set(artifact.rows.flatMap(row => Object.keys(row)))];
  const cell = value => '"'+String(value ?? '').replaceAll('"','""')+'"';
  return '# '+artifact.title+'\n# Collection anchor: '+dates.anchor+'; observed dates are retained in each row.\n'
    +columns.map(cell).join(',')+'\n'+artifact.rows.map(row => columns.map(key => cell(row[key])).join(',')).join('\n')+'\n';
};

test('eight source groups distinguish128 assessed operating samples from two unassessed plans within exact cumulative IG2', () => {
  const artifacts = initechOperatingSamples(dates), rows = rowsOf(artifacts);
  const expected = activeDefinitions('cis-ig1', {implementation_group:2}).map(row => row.id).sort();
  const unknown = ['11.5','13.3'];
  expect(artifacts).toHaveLength(8); expect(new Set(artifacts.map(row => row.key)).size).toBe(8);
  expect(idsOf(rows)).toEqual(expected); expect(expected).toHaveLength(130);
  expect(idsOf(rows.filter(row => row.activity !== 'assessment plan only'))).toEqual(expected.filter(id => !unknown.includes(id)));
  expect(idsOf(rows.filter(row => row.activity === 'assessment plan only'))).toEqual(unknown);
  for (const artifact of artifacts) {
    expect(artifact.title).toMatch(/^DEMO - SYNTHETIC:/);
    expect(artifact.assessment_ids).toEqual([...new Set(artifact.rows.flatMap(row => row.safeguards.split('|')))]
      .map(id => 'fw_demo_initech_assessment_'+id));
    expect(artifact.assessment_ids.every(id => id.startsWith('fw_demo_initech_assessment_'))).toBe(true);
  }
});

test('rows contain substantive scoped results, fictional accountability and only bounded string fields', () => {
  for (const row of rowsOf(initechOperatingSamples(dates))) {
    for (const field of ['observed_at','safeguards','scope','entity','source_file','observed_value','result','exceptions','owner_role','activity','cadence_or_trigger','source_classification','basis'])
      expect(typeof row[field]).toBe('string');
    expect(row.scope).toMatch(/Fictional Initech/);
    expect(row.entity.trim()).not.toBe(''); expect(row.source_file).toMatch(/\.csv$/);
    expect(row.observed_value.length).toBeGreaterThan(70);
    expect(row.observed_value).not.toMatch(/^(implemented|addressed|passed|complete|verified)$/i);
    expect(row.owner_role).toMatch(/Gibbons|Nagheenanajar|Bolton|Nina|Smykowski|Waddams/);
    expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    expect(row.source_classification).toBe(row.activity === 'assessment plan only' ? 'fictional_assessment_plan'
      : row.activity === 'documented process excerpt' ? 'fictional_process_excerpt' : 'fictional_operating_sample');
    expect(row.basis).toMatch(row.activity === 'assessment plan only' ? /Preparation only; no operating execution/
      : /Explicit fictional CIS v8.1 scenario sample; not independent verification/);
  }
});

test('the actual declared managed populations and account authorization reconcile without inventing a total connected-asset denominator', () => {
  const rows = rowsOf(initechOperatingSamples(dates)), inventory = rows.filter(row => row.safeguards === '1.1');
  expect(values(rows,'1.1')).toMatch(/Managed laptops=132; managed phones=8/);
  expect(values(rows,'1.1')).toMatch(/Cloud workloads=26; network devices=12/);
  expect(values(rows,'1.1')).toMatch(/IN-DOOR-01.*IN-PRINT-01.*SUP-01/);
  expect(inventory.every(row => row.observed_at === dates.month(-1))).toBe(true);
  expect(inventory.some(row => row.exceptions.includes('not claimed to be the entire connected-asset denominator'))).toBe(true);
  expect(values(rows,'5.1')).toMatch(/166=workforce148\+dedicated admins6\+services12/);
  expect(values(rows,'5.1')).toMatch(/authorization166\/166/);
  expect(INITECH_SCENARIO_PROFILE.asset_scope).toMatchObject({workforce_members:148, managed_laptops:132, managed_phones:8, cloud_workloads:26, network_devices:12});
});

test('all seven partial safeguards retain their distinct real gaps while3.9 remains a failure', () => {
  const rows = rowsOf(initechOperatingSamples(dates));
  const expected = {
    '2.6':/writable extension path loads test library=ALLOW/,
    '3.8':/recipient=missing, purpose=missing, return path=missing/,
    '5.5':/BATCH-EXPORT and BATCH-REPORT both authorized but missing purpose\/review metadata/,
    '9.5':/DMARC TXT policy absent,DMARC verification absent/,
    '13.6':/bridge arrivals0/,
    '15.4':/proposed amendment unsigned/,
    '16.4':/4\/5 builds.*current\/planned component list incomplete,review absent/
  };
  expect(INITECH_SCENARIO_PROFILE.partial).toEqual(Object.keys(expected));
  for (const [id, pattern] of Object.entries(expected)) {
    expect(values(rows,id)).toMatch(pattern);
    expect(rows.some(row => row.safeguards.split('|').includes(id) && row.result.toLowerCase().includes('partial'))).toBe(true);
    expect(initechSafeguardContent(id,'in_progress').remediation.length).toBeGreaterThan(30);
  }
  expect(values(rows,'3.9')).toMatch(/data encryption=absent.*reads contents without authorized decryption/);
  expect(rows.find(row => row.safeguards === '3.9').result).toMatch(/^not implemented/);
  expect(INITECH_SCENARIO_PROFILE.gaps).toEqual(['3.9']);
});

test('11.5 and13.3 contain plans only and never acquire passed operating outcomes or inferred coverage', () => {
  const artifacts = initechOperatingSamples(dates), rows = rowsOf(artifacts);
  const plans = artifacts.find(row => row.key === 'assessment-plans');
  expect(plans.rows).toHaveLength(2);
  for (const id of ['11.5','13.3']) {
    const linked = rows.filter(row => row.safeguards.split('|').includes(id));
    expect(linked).toHaveLength(1); expect(linked[0].activity).toBe('assessment plan only');
    expect(linked[0].result).toBe('not assessed; no operating conclusion');
    expect(linked[0].observed_at).toBe(dates.day(-2));
    expect(initechSafeguardContent(id,'not_assessed').assessment_notes).toBe('');
    expect(initechSafeguardContent(id,'not_assessed').assessment_plan.length).toBeGreaterThan(30);
  }
  expect(values(rows,'11.2')).toMatch(/succeeded3\/3/);
  expect(values(rows,'11.4')).toMatch(/no restore performed/);
  expect(rows.find(row => row.safeguards === '13.1|13.2').exceptions).toMatch(/do not establish unassessed network IDS/);
});

test('technical automation and actual weekly/monthly/quarterly activity are not replaced by annual manual Review tickets', () => {
  const rows = rowsOf(initechOperatingSamples(dates));
  expect(rows.filter(row => row.safeguards === '1.3').map(row => row.observed_at)).toEqual([-9,-8,-7].map(offset => dates.day(offset)));
  expect(rows.filter(row => row.safeguards === '1.3').every(row => row.activity === 'automated operating job' && row.cadence_or_trigger === 'daily')).toBe(true);
  expect(rows.filter(row => row.safeguards === '1.2|1.4').map(row => row.observed_at)).toEqual([-28,-21,-14,-7].map(offset => dates.day(offset)));
  expect(rows.filter(row => row.safeguards === '8.11').map(row => row.observed_at)).toEqual([-28,-21,-14,-7].map(offset => dates.day(offset)));
  expect(rows.filter(row => row.safeguards === '8.11').every(row => row.result.startsWith('performed log examination'))).toBe(true);
  expect(rows.filter(row => row.safeguards === '7.5').every(row => row.activity === 'automated operating job')).toBe(true);
  expect(values(rows,'7.5')).toMatch(/authenticated eligible endpoint\/workload158\/158.*unauthenticated.*170\/170/);
  expect(rows.find(row => row.safeguards === '7.1|7.2').cadence_or_trigger).toBe('7.1 annual/change;7.2 at least monthly');
  expect(rows.find(row => row.safeguards === '16.4|16.5').cadence_or_trigger).toMatch(/at least monthly/);
  expect(rows.find(row => row.safeguards === '17.8').cadence_or_trigger).toMatch(/after an incident; no invented fixed annual/);
  expect(rows.find(row => row.safeguards === '14.9').exceptions).toMatch(/no independently imposed numeric interval/);
});

test('annual exercises and external tests are performed dated samples while closures, fixes and verification remain separate', () => {
  const rows = rowsOf(initechOperatingSamples(dates));
  for (const id of ['17.7','18.2']) {
    const samples = rows.filter(row => row.safeguards === id);
    expect(samples.map(row => row.observed_at)).toEqual([-16,-4].map(month => dates.month(month)));
    expect(samples.every(row => row.result.startsWith('performed fictional'))).toBe(true);
    expect(samples.every(row => row.cadence_or_trigger.startsWith('at least annually'))).toBe(true);
  }
  expect(values(rows,'17.8')).toMatch(/not closure of both corrective Actions/);
  expect(values(rows,'18.3')).toMatch(/finding validation recorded separately from Action completion/);
  expect(values(rows,'16.2')).toMatch(/tenant-A into tenant-B object=DENY/);
  expect(values(rows,'3.4')).toMatch(/premature deletion attempt1=BLOCKED.*44 selected\/44 deleted.*holdH-01 protects2/);
});

test('sample books individually retain unchanged byte/link limits; combined scenario capacity remains the integrating builder responsibility', () => {
  const artifacts = initechOperatingSamples(dates);
  for (const artifact of artifacts) {
    expect(new TextEncoder().encode(csv(artifact)).byteLength).toBeLessThanOrEqual(16*1024);
    expect(artifact.assessment_ids.length).toBeLessThanOrEqual(100);
  }
  expect(artifacts.length).toBeLessThanOrEqual(32);
});

test('generation is deterministic, independent and exclusively uses frozen dates without credentials or real customer identifiers', () => {
  const first = initechOperatingSamples(dates);
  expect(initechOperatingSamples(dates)).toEqual(first);
  first[0].rows[0].observed_value = 'Visitor edit';
  expect(initechOperatingSamples(dates)[0].rows[0].observed_value).not.toBe('Visitor edit');
  for (const row of rowsOf(initechOperatingSamples(dates))) {
    expect(row.observed_at >= dates.month(-24) && row.observed_at <= dates.day(-2)).toBe(true);
    expect(row.observed_value).not.toMatch(/password\s*[:=]\s*\S+|Bearer\s+[A-Za-z0-9._-]+|-----BEGIN .*PRIVATE KEY/);
  }
  expect(JSON.stringify(initechOperatingSamples(dates))).not.toMatch(/demo_brawndo|demo_krusty_krab|customer@example\.com/);
  const later = cisDemoFixtureDates(new Date('2027-01-31T19:00:00.000Z'));
  expect(initechOperatingSamples(later)[0].rows[0].observed_at).toBe(later.month(-1));
  expect(() => initechOperatingSamples({anchor:'2026-02-30T00:00:00.000Z', day:()=>'', month:()=>''})).toThrow('frozen UTC');
  expect(() => initechOperatingSamples(cisDemoFixtureDates(new Date('2025-11-02T12:00:00.000Z')))).toThrow('follow the v8.1 release');
  expect(() => initechOperatingSamples({...dates, day:()=>dates.day(0)})).toThrow('precede the assessment cutoff');
});
