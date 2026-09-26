import { personLabel, peopleMap } from './people';

const people = [{ user_id: 'u1', name: 'Joe Bowers', status: 'active' }, { user_id: 'u2', status: 'disabled', orphaned: true }];

test('a person resolves to a name; missing, unknown and unnamed accounts never show a raw ID', () => {
  expect(personLabel(people, 'u1')).toBe('Joe Bowers');
  expect(personLabel(people, 'u2')).toBe('Former user');
  expect(personLabel(people, 'demo_brawndo_user_9')).toBe('Former user');
  expect(personLabel(people, null)).toBe('Unassigned');
  expect(personLabel(people, '', 'Not recorded')).toBe('Not recorded');
  expect(personLabel([], 'Demo Explorer')).toBe('Demo Explorer');
  expect(peopleMap(people)).toEqual({ u1: 'Joe Bowers', u2: 'Former user' });
});
