import {recordUuid} from './recordUuid';
test('request identifiers do not require secure-context randomUUID',()=>{
  const previous=global.crypto;
  global.crypto={getRandomValues:require('crypto').randomFillSync};
  try {
    const ids=Array.from({length:32},()=>recordUuid());
    expect(new Set(ids).size).toBe(32);
    ids.forEach(id=>expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  } finally { if(previous)global.crypto=previous;else delete global.crypto; }
});
