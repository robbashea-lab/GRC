import {buildBrawndoScenario,canonicalScenarioStates,validScenarioInstant} from './brawndoHistoryScenario';

test.each(['2026-10-18T18:00:00.000Z','2024-03-31T23:30:00.000Z','2024-02-29T12:00:00.000Z'])(
  'per-item scenario is deterministic, bounded and exactly terminates at the canonical map for %s',anchor=>{
    const result=buildBrawndoScenario(anchor);
    expect(result).toEqual(buildBrawndoScenario(anchor));
    expect(result.positions.at(-1).states).toEqual(canonicalScenarioStates());
    expect(Date.parse(result.positions[0].at)).toBeLessThan(Date.parse(anchor)-365*86400000);
    for(const point of result.positions){
      expect(Object.keys(point.states)).toHaveLength(56);
      expect(Object.values(point.states).every(status=>['addressed','in_progress','needs_attention','not_assessed'].includes(status))).toBe(true);
      for(const [id,status] of Object.entries(canonicalScenarioStates()))if(status==='not_assessed')expect(point.states[id]).toBe(status);
    }
    for(const event of result.events){
      expect(event.status).not.toBe('not_assessed');
      expect(event.before_status).not.toBe(event.status);
      expect(event.provenance).toBe('demo_fixture');
    }
  });
test('invalid anchors cannot produce a fixture',()=>expect(buildBrawndoScenario('not a date')).toBeNull());
test.each(['2026-02-30T00:00:00Z','2025-02-29T12:00:00Z','2026-10-18T24:00:00Z','2026-10-18T00:61:00Z','2026-10-18T00:00:61Z','2026-10-18T00:00:00+25:00','2026-10-18'])(
  'invalid literal calendar/time anchor %s is rejected rather than normalized',value=>{
    expect(validScenarioInstant(value)).toBe(false);expect(buildBrawndoScenario(value,new Date('2027-01-01T00:00:00Z'))).toBeNull();
  });
test('scenario admission retains valid zoned instants and leap days, rejecting future anchors against caller clock',()=>{
  expect(validScenarioInstant('2024-02-29T23:30:00-05:00')).toBe(true);
  expect(buildBrawndoScenario('2026-10-18T18:01:00Z',new Date('2026-10-18T18:00:00Z'))).toBeNull();
});
