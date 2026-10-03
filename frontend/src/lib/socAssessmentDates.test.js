import {socAssessmentDate,socSavedDate} from './socAssessmentDates';
test('legacy save dates are not manufactured into assessment judgments',()=>{
  expect(socAssessmentDate({status:'not_assessed',last_assessed:'2026-09-01'})).toBe('Not assessed');
  expect(socAssessmentDate({status:'addressed',last_assessed:'2026-09-01'})).toBe('Legacy date unconfirmed');
  expect(socAssessmentDate({status:'addressed',last_assessed:'2026-09-01',assessment_recorded_at:null})).toBe('Legacy date unconfirmed');
  expect(socAssessmentDate({status:'addressed',last_saved:'2026-10-02',assessment_recorded_at:'2026-09-01T12:00:00Z'})).toBe('2026-09-01');
  expect(socSavedDate({last_saved:'2026-10-02',last_assessed:'2026-09-01'})).toBe('2026-10-02');
});
