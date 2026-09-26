import { socPeriod, socControlExceptions, isoPosture } from './ProgramContext';

test('SOC observation period reports its day, and exceptions count each shared control once', () => {
  expect(socPeriod({period_start: '2026-03-30', period_end: '2027-03-30'}, new Date('2026-09-26T12:00:00Z'))).toMatchObject({length: 366, elapsed: 181, state: 'current'});
  expect(socPeriod({period_start: '', period_end: ''})).toBeNull();
  const shared = {control_id: 'AC-02', design: 'adequate', operating: 'gap', expected_instances: 2, collected_instances: 1};
  expect(socControlExceptions([{management_controls: [shared]}, {management_controls: [shared, {control_id: 'CH-01', design: 'adequate', operating: 'effective', expected_instances: 5, collected_instances: 5}]}]))
    .toEqual({controls: 2, gaps: 1, short: 1, legacyExceptions:0});
});

test('ISO posture separates clause conformity from Statement of Applicability decisions', () => {
  const rows = [
    {specification: 'isms_clause', status: 'addressed'}, {specification: 'isms_clause', status: 'in_progress'},
    {specification: 'annex_control', status: 'addressed', soa_applicability: 'included'},
    {specification: 'annex_control', status: 'not_applicable', soa_applicability: 'excluded'},
    {specification: 'annex_control', status: 'not_assessed', soa_applicability: ''},
  ];
  expect(isoPosture(rows)).toEqual({clauses: 2, clausesAssessed: 2, clausesConforming: 1, annex: 3, included: 1, excluded: 1, undetermined: 1});
});

test('a later criterion observation cannot be hidden by an earlier healthy control reference', () => {
  const healthy = {control_id:'AC-02', design:'adequate', operating:'effective', expected_instances:4, collected_instances:4};
  const gap = {...healthy, operating:'gap', collected_instances:3};
  const rows = [{management_controls:[healthy]}, {management_controls:[gap]}];
  expect(socControlExceptions(rows)).toEqual({controls:1, gaps:1, short:1, legacyExceptions:0});
  expect(socControlExceptions([...rows].reverse())).toEqual({controls:1, gaps:1, short:1, legacyExceptions:0});
});

test('migration keeps legacy exceptions visible without inventing a shared operating conclusion',()=>{
  const rows=[{framework_assessment_id:'a',management_controls:[{control_id:'AC',operating:'gap',expected_instances:4,collected_instances:3}]}];
  const shared=[{control_id:'control',legacy_id:'AC',assessment_ids:['a'],design:'adequate',observations:[],conflicts:[]}];
  expect(socControlExceptions(rows,shared)).toEqual({controls:1,gaps:0,short:0,legacyExceptions:1});
});
