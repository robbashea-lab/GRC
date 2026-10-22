import {deflateSync,strFromU8} from 'fflate';
import {compressDemoStore,decodeDemoStore,writeDemoStore,MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {restorePortfolioReporting} from './portfolioReporting';

const quota=()=>new DOMException('Synthetic storage full','QuotaExceededError');
const envelope=(bytes,declared=bytes.length)=>JSON.stringify({demo_storage_codec:'deflate-base64',version:1,
  utf8_bytes:declared,payload:btoa(strFromU8(deflateSync(bytes),true))});
const sample=()=>({clients:[{client_id:'synthetic',name:'Résumé 日本語 🔐'}],evidence:[{evidence_id:'e',
  client_id:'synthetic',content_base64:'data:application/octet-stream;base64,AP+AAg==',relationships:[{kind:'review',id:'r'}]}],
  reviews:[{review_id:'r',due_date:'2026-01-31',occurrences:[{occurrence_id:'old',completed_by:'original',
    policy_coverage:[{policy_id:'p',version:'2',subject_id:'approved-exact'}]}]}],
  unknown:JSON.parse('{"__proto__":{"retained":true},"null":null,"escape":"\\u0000\\ud800"}')});

test('ordinary storage succeeds once with unchanged raw JSON and no envelope',()=>{
  const storage={setItem:jest.fn()},json=JSON.stringify(sample());
  writeDemoStore(storage,'demo',json);
  expect(storage.setItem.mock.calls).toEqual([['demo',json]]);
  expect(decodeDemoStore(json)).toEqual(sample());
});

test('actual quota failure retries the same key losslessly without dropping nested history or Evidence',()=>{
  let saved='original';const json=JSON.stringify(sample());
  const storage={setItem:jest.fn((key,value)=>{if(value===json)throw quota();saved=value;})};
  writeDemoStore(storage,'demo',json);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem.mock.calls.map(([key])=>key)).toEqual(['demo','demo']);
  expect(JSON.parse(saved)).toMatchObject({demo_storage_codec:'deflate-base64',version:1});
  expect(decodeDemoStore(saved)).toEqual(sample());
  expect(JSON.stringify(decodeDemoStore(saved))).toBe(json);
});

test('all binary byte values and Unicode/native history remain exact through compressed reload',()=>{
  const binary=String.fromCharCode(...Array.from({length:256},(_,i)=>i));
  const original={...sample(),evidence:[{evidence_id:'all-byte-values',client_id:'synthetic',
    filename:'résumé 日本語 🔐.bin',content_base64:btoa(binary),size:256}]};
  const decoded=decodeDemoStore(compressDemoStore(JSON.stringify(original)));
  expect(decoded).toEqual(original);
  expect(Array.from(atob(decoded.evidence[0].content_base64),c=>c.charCodeAt(0)))
    .toEqual(Array.from({length:256},(_,i)=>i));
  expect(decoded.reviews).toEqual(original.reviews);
});

test('identical validated bytes reuse text but every read returns isolated mutable records; raw writes clear reuse',()=>{
  const original={...sample(),cache_case:'immutable-text-only'},saved=compressDemoStore(JSON.stringify(original));
  const decoder=jest.spyOn(jest.requireActual('fflate'),'inflateSync');
  try{
    const first=decodeDemoStore(saved);
    first.reviews[0].occurrences[0].policy_coverage[0].version='mutated';
    first.evidence.length=0;
    const second=decodeDemoStore(saved);
    expect(second).toEqual(original);
    expect(second).not.toBe(first);
    expect(second.reviews).not.toBe(first.reviews);
    expect(decoder).toHaveBeenCalledTimes(1);
    writeDemoStore({setItem:jest.fn()},'demo',JSON.stringify({raw:true}));
    expect(decodeDemoStore(saved)).toEqual(original);
    expect(decoder).toHaveBeenCalledTimes(2);
  }finally{decoder.mockRestore();}
});

test('an externally replaced envelope validates independently; malformed versions and bounds cannot reuse prior text',()=>{
  const first={...sample(),external_value:'first'},second={...sample(),external_value:'second'};
  const firstSaved=compressDemoStore(JSON.stringify(first)),secondSaved=compressDemoStore(JSON.stringify(second));
  expect(decodeDemoStore(firstSaved)).toEqual(first);
  expect(decodeDemoStore(secondSaved)).toEqual(second);
  expect(()=>decodeDemoStore({toString:()=>secondSaved})).toThrow();
  const envelope=JSON.parse(secondSaved);
  for(const patch of [{version:2},{utf8_bytes:MAX_DEMO_DECODE_BYTES+1},{payload:envelope.payload.slice(0,-4)}]){
    expect(()=>decodeDemoStore(JSON.stringify({...envelope,...patch}))).toThrow();
    expect(decodeDemoStore(secondSaved)).toEqual(second);
  }
  expect(decodeDemoStore(firstSaved)).toEqual(first);
});

test('a failed compressed retry retains the old valid stored envelope and its readable text',()=>{
  const original={clients:[],evidence:[],retained:'original'},previous=compressDemoStore(JSON.stringify(original));
  const values=new Map([['demo',previous]]);
  const storage={setItem:jest.fn((key,value)=>{if(value.length>previous.length)throw quota();values.set(key,value);})};
  expect(decodeDemoStore(values.get('demo'))).toEqual(original);
  const next={...sample(),new_rows:Array.from({length:500},(_,i)=>'new-distinct-row-'+i)};
  expect(()=>writeDemoStore(storage,'demo',JSON.stringify(next))).toThrow('Synthetic storage full');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(values.get('demo')).toBe(previous);
  expect(decodeDemoStore(values.get('demo'))).toEqual(original);
});

test('failed compressed retry preserves the prior storage value and reports the failure',()=>{
  const previous=JSON.stringify({clients:[],evidence:[],retained:true}),values=new Map();
  const storage={setItem:jest.fn((key,value)=>{
    if(value.length>previous.length)throw quota();
    values.set(key,value);
  })};
  storage.setItem('demo',previous);
  expect(values.get('demo')).toBe(previous);
  storage.setItem.mockClear();
  expect(()=>writeDemoStore(storage,'demo',JSON.stringify(sample()))).toThrow('Synthetic storage full');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(values.get('demo')).toBe(previous);
});

test.each(['SecurityError','NotAllowedError','Error'])('%s does not attempt a compression fallback',name=>{
  const storage={setItem:jest.fn(()=>{throw new DOMException('Unavailable',name);})};
  expect(()=>writeDemoStore(storage,'demo',JSON.stringify(sample()))).toThrow('Unavailable');
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

test.each([1,2])('raw and compressed reporting V%s preserve exact legacy reference rows',version=>{
  const row={id:'source',unknown:{caption:'café 日本語',nullable:null}};
  const saved={portfolio_reporting:{storage_version:version,source_records:[row],
    source_vectors:[version===1?JSON.stringify([row]):[0]],snapshots:[{client_id:'c',framework_key:'cis-ig1',
      current:{provenance:{_portfolio_source_index:0}}}],scope_events:[]}};
  const raw=JSON.stringify(saved),plain=restorePortfolioReporting(decodeDemoStore(raw));
  const compressed=restorePortfolioReporting(decodeDemoStore(compressDemoStore(raw)));
  expect(compressed).toEqual(plain);
  expect(compressed.portfolio_reporting.snapshots[0].current.provenance.source_references).toEqual([row]);
});

test.each([
  {version:2},{demo_storage_codec:'unknown'},{utf8_bytes:0},{utf8_bytes:1.5},{utf8_bytes:MAX_DEMO_DECODE_BYTES+1},
  {payload:'bad_base64'},{payload:'AAAA='},{unexpected:true}
])('unknown or malformed envelope is rejected without returning a domain store: %j',patch=>{
  const valid=JSON.parse(compressDemoStore(JSON.stringify(sample())));
  expect(()=>decodeDemoStore(JSON.stringify({...valid,...patch}))).toThrow();
});

test('a tiny declared size cannot accept a truncated decompression prefix',()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({history:'x'.repeat(10000)}));
  expect(()=>decodeDemoStore(envelope(bytes,2))).toThrow();
  expect(()=>decodeDemoStore(envelope(bytes,bytes.length-1))).toThrow();
  expect(()=>decodeDemoStore(envelope(bytes,bytes.length+1))).toThrow();
});

test('truncated/corrupt DEFLATE and invalid UTF8/JSON fail closed',()=>{
  const valid=JSON.parse(compressDemoStore(JSON.stringify(sample())));
  const truncated=btoa(atob(valid.payload).slice(0,3));
  expect(()=>decodeDemoStore(JSON.stringify({...valid,payload:truncated}))).toThrow();
  expect(()=>decodeDemoStore(JSON.stringify({...valid,payload:btoa('invalid deflate')}))).toThrow();
  expect(()=>decodeDemoStore(envelope(new Uint8Array([255,255])))).toThrow();
  expect(()=>decodeDemoStore(envelope(new TextEncoder().encode('not json')))).toThrow();
});
