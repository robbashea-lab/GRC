import {notificationDestination} from './NotificationBell';

test('notification destinations retain native tenant, record and Finding identity', () => {
  expect(notificationDestination({entity_type:'reviews',entity_id:'real id',client_id:'client / one'})).toBe('/reviews?id=real+id&client_id=client+%2F+one');
  expect(notificationDestination({entity_type:'findings',entity_id:'finding',client_id:'client'})).toBe('/action-items?finding_id=finding&client_id=client');
  expect(notificationDestination({entity_type:'ai_systems',entity_id:'ai',client_id:'client'})).toBe('/ai-governance?id=ai&client_id=client');
  expect(notificationDestination({entity_type:'https://outside.example',entity_id:'id',client_id:'client'})).toBeNull();
  expect(notificationDestination({entity_type:'reviews',entity_id:'id'})).toBeNull();
});
