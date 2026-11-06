import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {seedStore} from '../store';
import {lightweightStore} from '../evidenceStorage';
import {compactPortfolioReporting} from '../portfolioReporting';
import {decodeDemoStore,writeDemoStore} from '../demoStorageCodec';

const CLIENTS=['demo_dunder','demo_prestige','demo_brawndo','demo_initech','demo_krusty_krab'];
const ANCHOR='2026-11-02T12:00:00.000Z';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');

test('inventory and recover the exact canonical baseline before any eight-year replacement',()=>{
  const db=seedStore(new Date(ANCHOR)),json=JSON.stringify(db);
  expect(db.clients.filter(row=>CLIENTS.includes(row.client_id)).map(row=>row.client_id).sort()).toEqual([...CLIENTS].sort());
  expect(JSON.parse(json)).toEqual(db);
  const inventory=Object.fromEntries(CLIENTS.map(clientId=>[clientId,Object.fromEntries(Object.entries(db)
    .filter(([,value])=>Array.isArray(value)).map(([key,value])=>{
      const owned=value.filter(row=>row?.client_id===clientId);
      return [key,{count:owned.length,chars:JSON.stringify(owned).length}];
    }))]));
  const persisted=JSON.stringify(compactPortfolioReporting(lightweightStore(db)));
  let stored=null;
  // Measure the existing compressed fallback without changing its quotas or implementation.
  const storage={setItem(key,value){if(value.length*2>5*1024*1024)throw Object.assign(new Error('Fixture quota'),{name:'QuotaExceededError'});stored=value;}};
  writeDemoStore(storage,'fixture',persisted);
  expect(decodeDemoStore(stored)).toEqual(JSON.parse(persisted));
  const report={clock:ANCHOR,anchor:'2026-11-02T00:00:00.000Z',source:'Synthetic canonical seed; not a visitor-session backup',
    capacity_evidence:'Controlled fixture-store test with forced 5 MiB cap; not physical browser capacity',
    raw_chars:json.length,raw_utf8_bytes:Buffer.byteLength(json),raw_guard_chars:4000000,
    packed_chars:persisted.length,stored_utf16_bytes:stored.length*2,
    sha256:hash(json),inventory};
  if(process.env.ISO_SOC_PREFLIGHT_OUTPUT){
    const output=process.env.ISO_SOC_PREFLIGHT_OUTPUT;
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'BASELINE-STORE.json'),json);
    fs.writeFileSync(path.join(output,'BASELINE-INVENTORY.json'),JSON.stringify(report,null,2));
  }
  console.info('ISO_SOC_PREFLIGHT',JSON.stringify(report));
  expect(json.length).toBeLessThan(4000000);
});
