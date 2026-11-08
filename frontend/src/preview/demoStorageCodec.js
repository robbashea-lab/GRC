import {deflateSync,inflateSync,strFromU8,strToU8} from 'fflate';

const CODEC='deflate-base64',VERSION=1;
export const MAX_DEMO_DECODE_BYTES=20*1024*1024;
const MAX_BASE64_CHARS=Math.ceil(MAX_DEMO_DECODE_BYTES/3)*4;
const envelopeKeys=['demo_storage_codec','payload','utf8_bytes','version'];
const invalid=()=>new Error('Invalid compressed Demo storage. Existing data was not changed.');
// Repeated reads of one saved value reuse immutable text, never mutable records.
let validatedEnvelope=null,validatedJson=null;

function unpack(envelope){
  if(Object.keys(envelope).sort().join(',')!==envelopeKeys.join(',')
    ||envelope.demo_storage_codec!==CODEC||envelope.version!==VERSION
    ||!Number.isSafeInteger(envelope.utf8_bytes)||envelope.utf8_bytes<1||envelope.utf8_bytes>MAX_DEMO_DECODE_BYTES
    ||typeof envelope.payload!=='string'||!envelope.payload.length||envelope.payload.length>MAX_BASE64_CHARS
    ||envelope.payload.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.payload))throw invalid();
  const binary=atob(envelope.payload);
  if(btoa(binary)!==envelope.payload)throw invalid();
  const compressed=strToU8(binary,true);
  // fflate truncates to `out`; the extra byte makes oversized output detectable.
  const bytes=inflateSync(compressed,{out:new Uint8Array(envelope.utf8_bytes+1)});
  if(bytes.length!==envelope.utf8_bytes)throw invalid();
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

export function decodeDemoStore(saved){
  if(saved===validatedEnvelope&&validatedJson!==null)return JSON.parse(validatedJson);
  const parsed=JSON.parse(saved);
  if(!parsed||typeof parsed!=='object'||!Object.hasOwn(parsed,'demo_storage_codec'))return parsed;
  if(typeof saved!=='string')throw invalid();
  const json=unpack(parsed),decoded=JSON.parse(json);
  validatedEnvelope=saved;validatedJson=json;
  return decoded;
}

export function compressDemoStore(json,level=6){
  const bytes=new TextEncoder().encode(json);
  if(bytes.length>MAX_DEMO_DECODE_BYTES)throw invalid();
  const envelope={demo_storage_codec:CODEC,version:VERSION,utf8_bytes:bytes.length,
    payload:btoa(strFromU8(deflateSync(bytes,{level}),true))};
  if(unpack(envelope)!==json)throw invalid();
  return JSON.stringify(envelope);
}

export function writeDemoStore(storage,key,json){
  try{storage.setItem(key,json);validatedEnvelope=null;validatedJson=null;return json;}catch(error){
    if(!['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name))throw error;
    // UTF-8 uses at most three bytes per UTF-16 code unit. Leave 1 MiB
    // headroom so the faster DEFLATE stream cannot exceed the envelope bound.
    // This limits optimization eligibility, not the existing logical budget.
    if(json.length*3<=MAX_DEMO_DECODE_BYTES-1024*1024){
      const fast=compressDemoStore(json,1);
      try{storage.setItem(key,fast);validatedEnvelope=fast;validatedJson=json;return fast;}catch(fastError){
        if(!['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED'].includes(fastError?.name))throw fastError;
      }
    }
    const compressed=compressDemoStore(json);
    storage.setItem(key,compressed);validatedEnvelope=compressed;validatedJson=json;return compressed;
  }
}

const isQuota=error=>['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name);
const checkAbort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Demo save cancelled','AbortError');};

async function nativeEnvelope(stream,json,signal){
  const bytes=new TextEncoder().encode(json);
  if(bytes.length>MAX_DEMO_DECODE_BYTES)throw invalid();
  const reader=stream.readable.getReader(),writer=stream.writable.getWriter();
  const cancel=()=>{reader.cancel(signal?.reason).catch(()=>{});writer.abort(signal?.reason).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    checkAbort(signal);
    const collect=(async()=>{
      const chunks=[];let length=0;
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(!ArrayBuffer.isView(value)||Object.prototype.toString.call(value)!=='[object Uint8Array]'
          ||length+value.length>MAX_DEMO_DECODE_BYTES)throw invalid();
        chunks.push(value);length+=value.length;
      }
      const packed=new Uint8Array(length);let offset=0;
      for(let i=0;i<chunks.length;i++){packed.set(chunks[i],offset);offset+=chunks[i].length;}
      return packed;
    })();
    const send=(async()=>{await writer.write(bytes);await writer.close();})();
    const [packed]=await Promise.all([collect,send]);
    checkAbort(signal);
    const envelope={demo_storage_codec:CODEC,version:VERSION,utf8_bytes:bytes.length,
      payload:btoa(strFromU8(packed,true))};
    if(unpack(envelope)!==json)throw invalid();
    return JSON.stringify(envelope);
  }catch(error){
    await Promise.allSettled([reader.cancel(error),writer.abort(error)]);
    checkAbort(signal);throw error;
  }finally{
    signal?.removeEventListener('abort',cancel);
    reader.releaseLock();writer.releaseLock();
  }
}

// The caller rechecks its transaction immediately before each physical write.
// Compression is asynchronous; committing and publishing validated text are not.
export async function writeDemoStoreAsync(storage,key,json,{beforeCommit,afterCommit,signal}={}){
  const commit=(value,compressed,finalAttempt=false)=>{
    checkAbort(signal);beforeCommit?.();checkAbort(signal);
    try{storage.setItem(key,value);}catch(error){if(isQuota(error)&&!finalAttempt)return null;throw error;}
    validatedEnvelope=compressed?value:null;validatedJson=compressed?json:null;
    afterCommit?.(value);
    return value;
  };
  const raw=commit(json,false);if(raw!==null)return raw;
  checkAbort(signal);
  let stream;
  if(typeof globalThis.CompressionStream==='function'){
    try{stream=new globalThis.CompressionStream('deflate-raw');}
    catch(error){if(!(error instanceof TypeError))throw error;}
  }
  if(stream){
    const native=await nativeEnvelope(stream,json,signal);
    const committed=commit(native,true);if(committed!==null)return committed;
  }
  if(json.length*3<=MAX_DEMO_DECODE_BYTES-1024*1024){
    checkAbort(signal);
    const fast=compressDemoStore(json,1);
    const committed=commit(fast,true);if(committed!==null)return committed;
  }
  checkAbort(signal);
  return commit(compressDemoStore(json),true,true);
}
