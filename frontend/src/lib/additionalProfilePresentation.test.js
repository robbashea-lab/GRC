import {profileValue,profileList,profileMaturity,profileRenewalRelative} from './additionalProfilePresentation';
import {completeness} from './clientProfile';

test('optional profile values preserve native zero, false, unknown and missing distinctions',()=>{
  expect(profileValue(0)).toBe('0');expect(profileValue(false)).toBe('false');expect(profileValue('Unknown')).toBe('Unknown');expect(profileValue(null)).toBe('Not provided');expect(profileList('Operations; Technology')).toEqual(['Operations','Technology']);
  expect(completeness({organization:{employees:0}}).percent).toBe(13);
});
test('self reported maturity keeps all native areas and does not give N/A or unknown implementation credit',()=>{
  const {rows,counts}=profileMaturity({information_security:'Implemented',risk_management:'Partial',incident_response:'Not Applicable',business_continuity:'Not Implemented'});
  expect(rows).toHaveLength(14);expect(counts).toEqual({'Implemented':1,'Partial':1,'Not Applicable':1,'Not Implemented':1,'Unknown':10});
});
test('renewal context uses the native UTC management day and leaves unknown or invalid values unclassified',()=>{
  const today=new Date('2026-10-15T23:59:59Z');
  expect(profileRenewalRelative('2027-01-23',today)).toBe('in 100 days');
  expect(profileRenewalRelative('2026-10-16',today)).toBe('in 1 day');
  expect(profileRenewalRelative('2026-10-15',today)).toBe('today');
  expect(profileRenewalRelative('2026-10-14',today)).toBe('1 day overdue');
  expect(profileRenewalRelative('2026-10-13',today)).toBe('2 days overdue');
  expect(profileRenewalRelative('2026-10-15',new Date('2026-10-15T20:30:00-07:00'))).toBe('1 day overdue');
  [null,undefined,'',0,false,'Unknown','2026-02-30'].forEach(value=>expect(profileRenewalRelative(value,today)).toBeNull());
});
