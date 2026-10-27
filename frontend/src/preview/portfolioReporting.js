// Browser-local Demo projection only. No server request or historical fixture generation.
import {FRAMEWORKS,activeDefinitions,frameworkCatalog,frameworkDefinition} from '../lib/frameworks';
import {cisConfiguration} from '../lib/cisScope';
import {socConfiguration,SOC_CATEGORIES} from '../lib/socReadiness';
import {cisSummary} from '../lib/cisVerification';
import {isoProgramMetrics} from '../lib/isoProgramMetrics';
import {operatorStatuses} from '../lib/frameworkOperator';
import {evidenceAccess} from './evidence';
import {stable} from './commandRequests';
import {decodeDemoStore,writeDemoStore,writeDemoStoreAsync,MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {latestPortfolioActivity} from '../lib/portfolioOverview';
import {getBrawndoScenarioContext} from './brawndoReportingHistory';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {namedDemoClient} from '../lib/demoClients';
import {isDemoScenarioPosition} from '../lib/portfolioProgress';

const VERSION='native-implementation-v1',DAY=86400000;
const STATUS=['addressed','in_progress','needs_attention','not_assessed'];
const TYPES=['Assessments','Findings','Risks','Policies','Evidence','Scope'];
const inactive=row=>row.archived||row.archived_at||['archived','inactive','retired','offboarding','terminated','revoked'].includes(row.status);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const iso=value=>new Date(value).toISOString();
const timestamp=value=>{const time=Date.parse(value);if(!Number.isFinite(time)||typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))fail(422,'Use a valid timestamp with a timezone');return time;};
const counts=(rows,key)=>{const labels=operatorStatuses(key),values=STATUS.map(status=>({key:status,label:labels[status],count:rows.filter(r=>r.status===status).length}));const unknown=rows.filter(r=>!STATUS.includes(r.status)).length;if(unknown)values.push({key:'unknown',label:'Unresolved status',count:unknown});return values;};
const component=(key,label,rows,framework)=>({key,label,counts:counts(rows,framework),implemented:rows.filter(r=>r.status==='addressed').length,denominator:rows.length});

// Demo has no synchronous cryptographic digest. Intern exact scope strings per
// native program at the same atomic source commit; GETs only resolve identities.
const programIdentity=position=>position.program_id||position.client_id+':'+position.framework_key;
const implementationScope=scope=>Object.fromEntries(Object.entries(scope).filter(([field])=>field!=='enrollment_ids'));
function scopeText(signature){
  if(!signature?.startsWith('{'))return signature;
  return stable(implementationScope(JSON.parse(signature)));
}
const scopeParse=JSON.parse,scopeStringify=JSON.stringify,scopeStable=stable;
const scopeKeys=Object.keys,scopeSort=Array.prototype.sort,scopeEntries=Object.entries;
const scopeFilter=Array.prototype.filter,scopeFromEntries=Object.fromEntries,scopeCreate=Object.create;
const scopeIsArray=Array.isArray,scopeIterator=Array.prototype[Symbol.iterator];
const scopeConstructor=Object.getOwnPropertyDescriptor(Array.prototype,'constructor').value;
const scopeSpecies=Object.getOwnPropertyDescriptor(Array,Symbol.species).get;
const sourceMap=Array.prototype.map,sourceFind=Array.prototype.find;
const sourcePush=Array.prototype.push,sourceFreeze=Object.freeze,sourceInteger=Number.isInteger;
const restoredScopes=new WeakMap();
const scopeSerializationUnchanged=()=>stable===scopeStable
  &&Object.getOwnPropertyDescriptor(JSON,'parse')?.value===scopeParse
  &&Object.getOwnPropertyDescriptor(JSON,'stringify')?.value===scopeStringify
  &&Object.getOwnPropertyDescriptor(Object,'keys')?.value===scopeKeys
  &&Object.getOwnPropertyDescriptor(Array.prototype,'sort')?.value===scopeSort
  &&Object.getOwnPropertyDescriptor(Object,'entries')?.value===scopeEntries
  &&Object.getOwnPropertyDescriptor(Array.prototype,'filter')?.value===scopeFilter
  &&Object.getOwnPropertyDescriptor(Object,'fromEntries')?.value===scopeFromEntries
  &&Object.getOwnPropertyDescriptor(Object,'create')?.value===scopeCreate
  &&Object.getOwnPropertyDescriptor(Array,'isArray')?.value===scopeIsArray
  &&Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator)?.value===scopeIterator
  &&Object.getOwnPropertyDescriptor(Array.prototype,'constructor')?.value===scopeConstructor
  &&Object.getOwnPropertyDescriptor(Array,Symbol.species)?.get===scopeSpecies
  &&!customJSON({})&&!customJSON([]);
function registeredScope(current){
  const record=current&&restoredScopes.get(current);
  return record&&Object.getOwnPropertyDescriptor(current,'scope')?.get===record.get
    &&scopeSerializationUnchanged()?record.metadata:null;
}
function attachRestoredScope(current,metadata){
  let ready=false,value;
  const replace=next=>{
    value=next;ready=true;restoredScopes.delete(current);
    if(Object.getOwnPropertyDescriptor(current,'scope')?.configurable)
      Object.defineProperty(current,'scope',{value,enumerable:true,configurable:true,writable:true});
  };
  const get=()=>{
    if(!ready){
      const parsed=scopeParse(metadata.text);
      if(metadata.override){
        const ids=[];
        for(let i=0;i<metadata.enrollment.length;i++)Object.defineProperty(ids,String(i),{value:metadata.enrollment[i],enumerable:true,configurable:true,writable:true});
        parsed.enrollment_ids=ids;
      }
      replace(parsed);
    }
    return value;
  };
  Object.defineProperty(current,'scope',{enumerable:true,configurable:true,get,set(next){
    if(Object.isFrozen(current))throw new TypeError('Cannot assign frozen scope');
    replace(next);
  }});
  restoredScopes.set(current,{get,metadata});
}
function copyCurrent(current){
  const metadata=registeredScope(current);if(!metadata)return {...current};
  // Other user-defined accessors can observe scope: retain ordinary spread order.
  const keys=Reflect.ownKeys(current);
  for(const key of keys)if(key!=='scope'&&Object.prototype.propertyIsEnumerable.call(current,key)
    &&!Object.hasOwn(Object.getOwnPropertyDescriptor(current,key),'value'))return {...current};
  const result={};
  for(const key of keys)if(Object.prototype.propertyIsEnumerable.call(current,key)){
    if(key==='scope')attachRestoredScope(result,metadata);
    else Object.defineProperty(result,key,{value:current[key],enumerable:true,configurable:true,writable:true});
  }
  return result;
}
const exactScope=current=>registeredScope(current)?.signature
  ||(current.scope?stable(implementationScope(current.scope)):scopeText(current.scope_signature));
function exactSource(current){
  const privateScope=registeredScope(current),provenanceField=privateScope&&Object.getOwnPropertyDescriptor(current,'provenance');
  const privateSource=provenanceField&&Object.hasOwn(provenanceField,'value')&&restoredSourceVectors.get(provenanceField.value);
  if(privateScope&&privateSource&&Object.getOwnPropertyDescriptor(provenanceField.value,'source_references')?.get===privateSource.get
    &&privateSource.vector.rows.every(row=>row.canonicalKnown))
    return '{"references":'+privateSource.vector.json+',"scope":'+privateScope.fullSignature+'}';
  if(!current.scope)return null;
  // Keep the original two scope reads and provenance access order: these may
  // execute native getters before the immutable-reference guard is evaluated.
  const scope=current.scope,provenance=current.provenance;
  const lazy=provenance&&restoredSourceVectors.get(provenance);
  if(lazy&&Object.getOwnPropertyDescriptor(provenance,'source_references')?.get===lazy.get
    &&lazy.vector.rows.every(row=>row.canonicalKnown)&&!customJSON({})&&!customJSON([])){
    // stable orders references before scope. Snapshot the complete references
    // first, then retain the scope serializer's key and omission/error behavior.
    const references=lazy.vector.json,scopeFields=stable({scope}).slice(1,-1);
    return '{"references":'+references+(scopeFields?','+scopeFields:'')+'}';
  }
  return stable({scope,references:comparisonReferences(provenance)||[]});
}
function knownScopes(db,identity){
  const recorded=db.portfolio_reporting?.identities?.find(row=>row.program_id===identity);
  if(recorded)return recorded.scopes.map(scopeText);
  const values=[];
  const remember=current=>{const signature=current&&exactScope(current);if(signature&&!values.includes(signature))values.push(signature);};
  for(const snapshot of db.portfolio_reporting?.snapshots||[])if(programIdentity(snapshot)===identity)remember(snapshot.current);
  for(const event of db.portfolio_reporting?.scope_events||[])if(event.client_id+':'+event.framework_key===identity){remember(event.before);remember(event.after);}
  return values;
}
function normalizedCurrent(db,identity,current,document=null){
  const exact=exactScope(current),scopes=knownScopes(db,identity),index=scopes.indexOf(exact);
  const scope_signature=exact?`demo-scope:${identity}:${index<0?scopes.length:index}`:current.scope_signature;
  const head=db.portfolio_reporting?.identities?.find(row=>row.program_id===identity)?.head;
  let source_revision;
  if(document)source_revision=document.source_revision?.startsWith('demo-source:')?document.source_revision:`demo-source:${identity}:legacy:${document.snapshot_id}`;
  else {
    const source=exactSource(current);
    if(head&&source===head.signature)source_revision=`demo-source:${identity}:${head.revision}`;
    else {
      const legacy=[...(db.portfolio_reporting?.snapshots||[])].reverse().find(snapshot=>programIdentity(snapshot)===identity&&exactSource(snapshot.current)===source);
      source_revision=legacy?`demo-source:${identity}:legacy:${legacy.snapshot_id}`:null;
    }
  }
  const included_counts=current.included_counts||current.counts?.filter(value=>STATUS.includes(value.key))||[];
  return {...current,scope_signature,source_revision,status_signature:scope_signature?stable({scope_signature,included_counts,implemented:current.implemented,denominator:current.denominator,availability:current.availability}):null};
}
const OBSERVATION_FIELDS=['program_id','measure_version','availability','reason','percentage','implemented','denominator','total','excluded','counts','included_counts','assessed','not_started','scope_signature','status_signature','scope_undetermined','missing_records','duplicate_records','unrecognized_status_count','effective_until','continuity_proven','continuity_source_event','scenario_version','scenario_anchor','scenario_fingerprint','modeled_until'];
function thinCurrent(current){
  return {...Object.fromEntries(OBSERVATION_FIELDS.filter(field=>Object.hasOwn(current,field)).map(field=>[field,current[field]])),
    invalid_applicability_count:current.invalid_applicability_count??0,
    provenance:Object.fromEntries(['kind','label','source_as_of','cutoff_consistent','event_time_bound','source_event'].filter(field=>Object.hasOwn(current.provenance||{},field)).map(field=>[field,current.provenance[field]]))};
}

// Only untouched restored provenance can reuse its validated immutable source
// text. Access or replacement materializes ordinary independent native values.
const restoredSourceVectors=new WeakMap();
// Internal comparisons need complete native values, but do not expose mutable
// history. Keep untouched pooled provenance opaque for the next compaction.
function comparisonReferences(provenance){
  const lazy=provenance&&restoredSourceVectors.get(provenance);
  if(lazy&&Object.getOwnPropertyDescriptor(provenance,'source_references')?.get===lazy.get
    &&!customJSON({})&&!customJSON([]))return JSON.parse(lazy.vector.json);
  return provenance?.source_references;
}
function sourceProvenanceWithoutReferences(provenance){
  const result={};
  for(const key of Reflect.ownKeys(provenance)){
    if(key==='source_references'||!Object.prototype.propertyIsEnumerable.call(provenance,key))continue;
    Object.defineProperty(result,key,{value:provenance[key],enumerable:true,configurable:true,writable:true});
  }
  return result;
}
function attachRestoredReferences(provenance,vector){
  let materialized=false,references;
  const replace=value=>{
    references=value;materialized=true;restoredSourceVectors.delete(provenance);
    if(Object.getOwnPropertyDescriptor(provenance,'source_references')?.configurable){
      Object.defineProperty(provenance,'source_references',{value,enumerable:true,configurable:true,writable:true});
    }
  };
  const get=()=>{
    if(!materialized)replace(JSON.parse(vector.json));
    return references;
  };
  Object.defineProperty(provenance,'source_references',{enumerable:true,configurable:true,get,set(value){
    if(Object.isFrozen(provenance))throw new TypeError('Cannot assign frozen source references');
    replace(value);
  }});
  restoredSourceVectors.set(provenance,{get,vector});
}

// Serialization only: retain every observation and complete source row. Untouched
// pooled history reuses validated text without expanding every historical vector.
function compactPortfolioReportingCore(db){
  const history=db?.portfolio_reporting;if(!history)return db;
  const identities=(history.identities||[]).map(row=>({...row,scopes:[...row.scopes]}));
  const source_vectors=[],sources=new Map(),source_records=[],records=new Map(),restoredVectors=new Map(),canonicalRows=new Map();
  const internRow=text=>{
    let index=records.get(text);
    if(index===undefined){index=source_records.length;source_records.push(JSON.parse(text));records.set(text,index);}
    return index;
  };
  const canonicalRow=metadata=>{
    if(metadata.canonicalKnown&&!customJSON({})&&!customJSON([]))return metadata.json;
    if(!canonicalRows.has(metadata.json))canonicalRows.set(metadata.json,stable(JSON.parse(metadata.json)));
    return canonicalRows.get(metadata.json);
  };
  const canonicalVector=vector=>{
    const rows=vector.rows;
    // Only private frozen metadata can bypass per-row serializer checks. Native
    // map/species perform no caller work between this check and reading strings.
    if(Object.getPrototypeOf(rows)!==Array.prototype
      ||Object.getOwnPropertyDescriptor(Array.prototype,'map')?.value!==sourceMap
      ||Object.getOwnPropertyDescriptor(Array.prototype,'constructor')?.value!==scopeConstructor
      ||Object.getOwnPropertyDescriptor(Array,Symbol.species)?.get!==scopeSpecies
      ||customJSON({})||customJSON([]))return null;
    for(let i=0;i<rows.length;i++)if(!rows[i].canonicalKnown)return null;
    return rows.map(metadata=>metadata.json);
  };
  const internVector=rows=>{
    const indices=rows.map(internRow),signature=JSON.stringify(indices);
    let index=sources.get(signature);
    if(index===undefined){index=source_vectors.length;source_vectors.push(indices);sources.set(signature,index);}
    return index;
  };
  const current=(value,identity)=>{
    if(!value)return value;
    const result=copyCurrent(value),privateScope=registeredScope(value);
    if(privateScope||value.scope){
      let recorded=identities.find(row=>row.program_id===identity);
      if(!recorded){recorded={program_id:identity,scopes:[],head:null};identities.push(recorded);}
      const signature=privateScope?.signature||exactScope(value);let index=recorded.scopes.indexOf(signature);
      if(index<0){index=recorded.scopes.length;recorded.scopes.push(signature);}
      delete result.scope;result._portfolio_scope_index=index;
      if(privateScope){if(privateScope.enrollment)result._portfolio_enrollment_ids=[...privateScope.enrollment];}
      else if(Object.hasOwn(value.scope,'enrollment_ids'))result._portfolio_enrollment_ids=[...value.scope.enrollment_ids];
    }
    const provenance=value.provenance,lazy=provenance&&restoredSourceVectors.get(provenance);
    let index;
    if(lazy&&Object.getOwnPropertyDescriptor(provenance,'source_references')?.get===lazy.get){
      index=restoredVectors.get(lazy.vector);
      if(index===undefined){index=internVector(canonicalVector(lazy.vector)||lazy.vector.rows.map(canonicalRow));restoredVectors.set(lazy.vector,index);}
    }else{
      if(lazy)restoredSourceVectors.delete(provenance);
      const references=provenance?.source_references;
      if(Array.isArray(references))index=internVector(references.map(reference=>stable(reference)));
    }
    if(index!==undefined){
      result.provenance=sourceProvenanceWithoutReferences(provenance);
      result.provenance._portfolio_source_index=index;
    }
    return result;
  };
  return {...db,portfolio_reporting:{...history,storage_version:2,identities,source_vectors,source_records,
    snapshots:(history.snapshots||[]).map(snapshot=>({...snapshot,current:current(snapshot.current,programIdentity(snapshot))})),
    scope_events:(history.scope_events||[]).map(event=>({...event,before:current(event.before,event.client_id+':'+event.framework_key),after:current(event.after,event.client_id+':'+event.framework_key)}))}};
}

// JSON.parse supplies plain JSON values. Numeric array-index keys keep JavaScript's
// required numeric order; all other object keys must already be lexical.
function canonicalJSONOrder(value){
  const pending=[value];
  while(pending.length){
    const current=pending.pop();
    if(!current||typeof current!=='object')continue;
    const keys=Object.keys(current);
    if(!Array.isArray(current)){
      let previous=null;
      for(const key of keys){
        const numeric=Number(key);
        if(Number.isInteger(numeric)&&numeric>=0&&numeric<4294967295&&String(numeric)===key)continue;
        if(previous!==null&&previous>key)return false;
        previous=key;
      }
    }
    for(const key of keys)pending.push(current[key]);
  }
  return true;
}

function referenceVector(rows,text){
  Object.freeze(rows);
  // Row metadata is immutable, but each native view owns its lazy text cache.
  return Object.freeze({rows,get json(){
    if(text===undefined)text='['+rows.map(value=>value.json).join(',')+']';
    return text;
  }});
}
function restorePortfolioReportingCore(db,validatedRows=null,collectedRows=null,contentProofs=null,scopeBudget=collectedRows,pairVectors=null){
  const history=db?.portfolio_reporting;if(!history?.storage_version)return db;
  if(![1,2].includes(history.storage_version))throw new Error('The saved Demo implementation history format is unavailable.');
  const rows=new Map(),vectors=new Map(),scopes=new Map();
  const row=index=>{
    if(!Number.isInteger(index)||index<0)throw new Error('The saved Demo implementation source reference is unavailable.');
    if(rows.has(index))return rows.get(index);
    const encoded=history.source_records?.[index];
    const reference=typeof encoded==='string'?JSON.parse(encoded):encoded;
    if(!reference||typeof reference!=='object'||Array.isArray(reference))throw new Error('The saved Demo implementation source reference is unavailable.');
    // Keep normalized native property order separate from sorted pool identity.
    let metadata=validatedRows&&Object.hasOwn(validatedRows,index)?validatedRows[index]:null;
    if(!metadata){
      const json=JSON.stringify(reference);
      // The private collector exists only for freshly decoded JSON without
      // prototype serializers; normalization cannot change its key order.
      if(!collectedRows)JSON.parse(json); // Preserve public/hook-active validation errors.
      metadata=contentProofs?.get(json)||Object.freeze({json,canonicalKnown:!!collectedRows&&canonicalJSONOrder(reference)});
    }
    rows.set(index,metadata);
    if(collectedRows)collectedRows.add(index,metadata);
    return metadata;
  };
  const vector=(encoded,index)=>{
    if(vectors.has(encoded))return vectors.get(encoded);
    // Only the second native pair restore can reuse fully validated immutable
    // metadata; a collecting restore must still account for every source row.
    if(!collectedRows&&validatedRows&&pairVectors?.has(index)&&canForkPortfolioStore()){
      const shared=pairVectors.get(index),result=referenceVector(shared.rows,shared.text);
      vectors.set(encoded,result);return result;
    }
    let result;
    if(history.storage_version===1&&typeof encoded==='string'){
      const references=JSON.parse(encoded);
      // Preserve the older decoder's non-array behavior rather than imposing a
      // new schema on retained V1 stores. Proper vectors use the same lazy path.
      if(!Array.isArray(references))return {legacyValue:references};
      result=referenceVector(references.map(reference=>Object.freeze({json:JSON.stringify(reference),canonicalKnown:false})),encoded);
    }else if(history.storage_version===2&&Array.isArray(encoded)){
      const references=[];
      for(let i=0;i<encoded.length;i++)references.push(row(encoded[i]));
      result=referenceVector(references);
    }else throw new Error('The saved Demo implementation source reference is unavailable.');
    vectors.set(encoded,result);
    pairVectors?.set(index,Object.freeze({rows:result.rows,text:history.storage_version===1?encoded:undefined}));
    return result;
  };
  const current=(value,identity)=>{
    if(!value)return value;
    const result={...value};
    if(Object.hasOwn(value,'_portfolio_scope_index')){
      const scope=history.identities?.find(row=>row.program_id===identity)?.scopes[value._portfolio_scope_index];
      if(typeof scope!=='string')throw new Error('The saved Demo implementation scope reference is unavailable.');
      const trusted=!!scopeBudget?.enabled()&&scopeSerializationUnchanged();
      let entry=trusted?scopes.get(scope):null;
      if(!entry){entry={parsed:JSON.parse(scope),variants:new Map()};if(trusted)scopes.set(scope,entry);}
      const parsed=entry.parsed;
      const override=Object.hasOwn(value,'_portfolio_enrollment_ids');
      const hasEnrollment=override||parsed&&Object.hasOwn(parsed,'enrollment_ids');
      const enrollment=override?value._portfolio_enrollment_ids:hasEnrollment?parsed.enrollment_ids:null;
      let stringEnrollment=trusted&&Array.isArray(enrollment);
      if(stringEnrollment)for(let i=0;i<enrollment.length;i++)if(typeof enrollment[i]!=='string'){stringEnrollment=false;break;}
      const eligible=trusted&&!entry.skip&&parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&(!hasEnrollment||stringEnrollment);
      let metadata,variant,minimum=256+scope.length*2;
      if(eligible&&hasEnrollment)for(let i=0;i<enrollment.length;i++)minimum+=enrollment[i].length*2+16;
      // Reserve the unavoidable raw text/closure before canonical work. Once
      // exhausted, later currents retain the eager path and no variants accrue.
      if(eligible&&scopeBudget.reserve(minimum)){
        variant=override?JSON.stringify(enrollment):'original';
        metadata=entry.variants.get(variant);
        if(!metadata){
          const effective=override?{...parsed,enrollment_ids:[...enrollment]}:parsed;
          try{
            const signature=entry.signature??stable(implementationScope(parsed));
            metadata=Object.freeze({text:scope,signature,fullSignature:stable(effective),
              override,enrollment:hasEnrollment?Object.freeze([...enrollment]):null});
          }catch(error){
            // Optional canonical metadata must not reject a valid deep JSON read.
            if(!(error instanceof RangeError))throw error;
            entry.skip=true;metadata=null;
          }
          // Cached variants already own this charged immutable text; each view
          // still reserves its full independent closure/raw-scope allowance.
          if(metadata&&scopeBudget.reserve(2*(metadata.signature.length+metadata.fullSignature.length))){
            entry.signature=metadata.signature;entry.variants.set(variant,metadata);
          }else metadata=null;
        }
      }
      if(metadata)attachRestoredScope(result,metadata);
      else {
        // Non-object/legacy enrollment shapes keep their original eager behavior.
        result.scope=trusted?JSON.parse(scope):parsed;
        if(override)result.scope.enrollment_ids=[...value._portfolio_enrollment_ids];
      }
      delete result._portfolio_scope_index;delete result._portfolio_enrollment_ids;
    }
    if(Object.hasOwn(value.provenance||{},'_portfolio_source_index')){
      const index=value.provenance._portfolio_source_index;
      const sources=vector(history.source_vectors?.[index],index);
      const provenance={...value.provenance};
      if(Object.hasOwn(sources,'legacyValue'))provenance.source_references=sources.legacyValue;
      else attachRestoredReferences(provenance,sources);
      delete provenance._portfolio_source_index;result.provenance=provenance;
    }
    return result;
  };
  return {...db,portfolio_reporting:{...history,
    snapshots:(history.snapshots||[]).map(snapshot=>({...snapshot,current:current(snapshot.current,programIdentity(snapshot))})),
    scope_events:(history.scope_events||[]).map(event=>({...event,before:current(event.before,event.client_id+':'+event.framework_key),after:current(event.after,event.client_id+':'+event.framework_key)}))}};
}

export function compactPortfolioReporting(db){return compactPortfolioReportingCore(db);}
export function restorePortfolioReporting(db){return restorePortfolioReportingCore(db);}

// One exact saved primitive plus immutable row text, never returned native objects
// or expanded vectors. The existing decoder cap bounds optimization memory only.
let validatedSavedValue=null,validatedSavedRows=null,validatedSavedRowBytes=0;
function rowTable(limit=MAX_DEMO_DECODE_BYTES){
  let table=Object.create(null),bytes=128,retainedRowBytes=128;
  return {enabled(){return !!table;},reserve(size){bytes+=size;if(bytes>limit)table=null;return !!table;},add(index,metadata){
    if(!table||Object.hasOwn(table,index))return;
    const size=metadata.json.length*2+160; // text plus conservative object/index/flag overhead
    bytes+=size;retainedRowBytes+=size;
    if(bytes>limit){table=null;return;}
    table[index]=metadata;
  // Scope reservations belong to the returned view, not the retained row cache.
  },finish(){return table?{rows:Object.freeze(table),bytes:retainedRowBytes}:null;}};
}
function publishSavedRows(saved,prepared){
  // Publish only reader-validated text; indices are bound to these exact bytes.
  // This helper performs no parsing, serialization or other fallible preparation.
  if(prepared&&typeof saved==='string'&&saved.length*2+prepared.bytes<=MAX_DEMO_DECODE_BYTES){
    validatedSavedValue=saved;validatedSavedRows=prepared.rows;validatedSavedRowBytes=prepared.bytes;
  }else{validatedSavedValue=null;validatedSavedRows=null;validatedSavedRowBytes=0;}
}
// A changed store can reuse only a full-content proof, never the old pool index.
// This map exists for one restore; conservative combined estimates skip reuse
// rather than increasing the existing serialization-metadata resource bound.
function priorContentProofs(saved){
  if(!validatedSavedRows||typeof saved!=='string')return null;
  let bytes=validatedSavedRowBytes+saved.length*2+(validatedSavedValue?.length||0)*2+128;
  const proofs=new Map();
  for(const metadata of Object.values(validatedSavedRows)){
    bytes+=160;
    if(bytes>=MAX_DEMO_DECODE_BYTES)return null;
    proofs.set(metadata.json,metadata);
  }
  return {proofs,remaining:MAX_DEMO_DECODE_BYTES-bytes};
}
function restoreDecodedStore(db,saved,pairVectors=null){
  const prototypeHooks=customJSON({})||customJSON([]);
  if(!prototypeHooks&&typeof saved==='string'&&saved===validatedSavedValue){
    const scopeBudget=rowTable(Math.max(0,MAX_DEMO_DECODE_BYTES-saved.length*2-validatedSavedRowBytes));
    return restorePortfolioReportingCore(db,validatedSavedRows,null,null,scopeBudget,pairVectors);
  }
  const prior=prototypeHooks?null:priorContentProofs(saved);
  const collected=prototypeHooks?null:rowTable(prior?.remaining);
  const restored=restorePortfolioReportingCore(db,null,collected,prior?.proofs,collected,pairVectors);
  const prepared=collected?.finish();
  publishSavedRows(saved,prototypeHooks?null:prepared);
  return restored;
}
export function readPortfolioStore(saved){return restoreDecodedStore(decodeDemoStore(saved),saved);}

const jsonOwnKeys=Object.keys,jsonSlice=Array.prototype.slice;
export const canForkPortfolioStore=()=>scopeSerializationUnchanged()
  &&Object.getOwnPropertyDescriptor(Array.prototype,'slice')?.value===jsonSlice
  &&Object.getOwnPropertyDescriptor(Array.prototype,'map')?.value===sourceMap
  &&Object.getOwnPropertyDescriptor(Array.prototype,'find')?.value===sourceFind
  &&Object.getOwnPropertyDescriptor(Array.prototype,'push')?.value===sourcePush
  &&Object.getOwnPropertyDescriptor(Object,'freeze')?.value===sourceFreeze
  &&Object.getOwnPropertyDescriptor(Number,'isInteger')?.value===sourceInteger;
// This fork receives only native JSON.parse output, never caller-owned graphs.
// Both branches are restored separately and retain no shared mutable containers.
export function readPortfolioStorePair(saved){
  if(!canForkPortfolioStore())
    return {current:readPortfolioStore(saved),before:null};
  const decoded=decodeDemoStore(saved);
  const container=value=>scopeIsArray(value)?jsonSlice.call(value):{...value};
  let before=decoded;
  if(decoded&&typeof decoded==='object'){
    before=container(decoded);let pending={source:decoded,target:before,next:null};
    while(pending){
      const {source,target}=pending;pending=pending.next;
      const keys=jsonOwnKeys(source);
      for(let i=0;i<keys.length;i++){
        const key=keys[i];
        const value=source[key];
        if(value!==null&&typeof value==='object'){
          const copy=container(value);
          // Spread/slice already created this own writable data key, including
          // __proto__; replacing it cannot invoke an inherited prototype setter.
          target[key]=copy;pending={source:value,target:copy,next:pending};
        }
      }
    }
  }
  const pairVectors=new Map();
  const current=restoreDecodedStore(decoded,saved,pairVectors);
  return {current,before:restoreDecodedStore(before,saved,canForkPortfolioStore()?pairVectors:null)};
}
function customJSON(value){
  for(let owner=value;owner;owner=Object.getPrototypeOf(owner)){
    const descriptor=Object.getOwnPropertyDescriptor(owner,'toJSON');
    if(descriptor)return !Object.hasOwn(descriptor,'value')||typeof descriptor.value==='function';
  }
  return false;
}
export function writePortfolioStore(storage,key,db){
  const json=JSON.stringify(compactPortfolioReportingCore(db));
  const saved=writeDemoStore(storage,key,json);
  // Changed bytes revoke index authority; immutable content proof survives until
  // the next reader validates every current row and publishes its own indices.
  if(saved!==validatedSavedValue)validatedSavedValue=null;
  return saved;
}
export function writePortfolioStoreAsync(storage,key,db,{afterCommit,...options}={}){
  const json=JSON.stringify(compactPortfolioReportingCore(db));
  return writeDemoStoreAsync(storage,key,json,{...options,afterCommit(saved){
    if(saved!==validatedSavedValue)validatedSavedValue=null;
    afterCommit?.(saved);
  }});
}

export function demoRangeStart(asOf,range){
  const date=new Date(timestamp(asOf));
  if(['30d','90d'].includes(range))return iso(+date-Number(range.slice(0,-1))*DAY);
  if(!['1m','3m','6m','12m','36m'].includes(range))return fail(422,'Choose 1m, 3m, 6m, 12m, or 36m');
  const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-Number(range.slice(0,-1)));
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString();
}

export function demoCurrentPositions(db,clients,asOf=new Date().toISOString()){
  return clients.filter(c=>!inactive(c)&&(c.onboarding_baseline?.completed||db.baselines?.[c.client_id]?.completed)).flatMap(client=>{
    const selected=new Set((db.requirements||[]).filter(r=>r.client_id===client.client_id&&!inactive(r)&&r.baseline_response==='applies').map(r=>r.baseline_key));
    return FRAMEWORKS.filter(f=>selected.has(f.key)).map(framework=>{
      const key=framework.key,configuration=key==='cis-ig1'?cisConfiguration(client):key==='soc-2'?socConfiguration(client):{};
      const valid=key==='cis-ig1'?Number.isInteger(configuration.implementation_group)&&frameworkCatalog(key).available_implementation_groups.includes(configuration.implementation_group):key!=='soc-2'||Array.isArray(configuration.categories)&&configuration.categories.includes('security')&&new Set(configuration.categories).size===configuration.categories.length&&configuration.categories.every(c=>Object.hasOwn(SOC_CATEGORIES,c));
      const label=key==='cis-ig1'&&valid?`CIS IG${configuration.implementation_group}`:framework.label;
      const position={client_id:client.client_id,client_name:client.name,program_id:client.client_id+':'+key,framework_key:key,program_key:key==='cis-ig1'&&valid?`cis-ig${configuration.implementation_group}`:key,program_label:label,scope_label:label,to:'/compliance/'+key};
      const version=frameworkCatalog(key)?.version||framework.version||null,title=framework.name||framework.label;
      Object.assign(position,{framework_version:version,program_title:key==='cis-ig1'&&valid?`CIS Controls v${version} · Implementation Group ${configuration.implementation_group}`:title+(version&&!title.includes(version)?' · '+version:''),unit_label:key==='iso-27001'?'requirements and controls':(frameworkCatalog(key)?.labels?.items||(key==='cis-ig1'?'Safeguards':'Items')).toLowerCase()});
      const unavailable={captured_at:asOf,effective_at:asOf,retrieved_at:asOf,observation_kind:'current_source',program_id:position.program_id,measure_version:VERSION,availability:'unavailable',percentage:null,implemented:null,denominator:null,total:null,excluded:null,counts:[],included_counts:[],assessed:null,not_started:false,components:[],scope_signature:null,provenance:{kind:'demo_local',label:'Current browser-local Demo records'}};
      if(!framework.implemented||!valid)return {...position,current:{...unavailable,reason:valid?'Native implementation tracking is unavailable.':'Saved framework configuration is invalid.'}};
      const definitions=activeDefinitions(key,configuration),expected=new Set(definitions.map(d=>d.id));
      const sources=(db.framework_assessments||[]).filter(r=>r.client_id===client.client_id&&r.framework_key===key&&expected.has(r.definition_id)&&!inactive(r));
      const groups=new Map();for(const row of sources)groups.set(row.definition_id,[...(groups.get(row.definition_id)||[]),row]);
      const rows=[...groups.values()].filter(values=>values.length===1).map(values=>({...frameworkDefinition(key,values[0].definition_id),...values[0]}));
      const missing=definitions.length-groups.size,duplicates=[...groups.values()].filter(v=>v.length>1).length;
      const applicability={},excluded=[],undetermined=[],included=[];let invalid=0;
      for(const row of rows){
        if(key==='iso-27001'&&row.specification==='annex_control'){
          const state=row.soa_applicability||'undetermined';applicability[row.definition_id]=state;
          (state==='included'?included:state==='excluded'?excluded:undetermined).push(row);
          if(['included','excluded'].includes(state)&&!row.soa_justification?.trim())invalid++;
        }else if(row.status==='not_applicable'){
          const validNa=!['isms_clause','addressable'].includes(row.specification)&&!!row.na_rationale?.trim();
          applicability[row.definition_id]=validNa?'excluded':'invalid_not_applicable';(validNa?excluded:included).push(row);if(!validNa)invalid++;
        }else{applicability[row.definition_id]='included';included.push(row);}
      }
      const unknown=included.filter(r=>!STATUS.includes(r.status)).length;
      const summary=cisSummary(included),metrics=key==='iso-27001'?isoProgramMetrics(rows):null;
      const implemented=metrics?metrics.requirements.implemented+metrics.annex.implemented:summary.addressed;
      const values=counts(included,key);if(excluded.length)values.push({key:'excluded',label:'Excluded / Not Applicable',count:excluded.length});
      if(undetermined.length)values.push({key:'scope_undetermined',label:'SoA applicability undetermined',count:undetermined.length});
      if(missing||duplicates)values.push({key:'missing',label:'Source records unavailable',count:missing+duplicates});
      const config=key==='cis-ig1'?{implementation_group:configuration.implementation_group}:key==='soc-2'?{categories:[...configuration.categories].sort()}:{};
      const scope={framework_key:key,catalog_version:frameworkCatalog(key).version,configuration:config,definition_ids:[...expected].sort(),applicability,source_versions:rows.map(r=>[r.definition_id,r.framework_version??null]).sort(),measure_version:VERSION};
      scope.enrollment_ids=(db.requirements||[]).filter(row=>row.client_id===client.client_id&&row.baseline_key===key&&!inactive(row)&&row.baseline_response==='applies').map(row=>row.requirement_id).sort();
      for(const definition of definitions)if(!groups.has(definition.id)||groups.get(definition.id).length>1)applicability[definition.id]=groups.has(definition.id)?'duplicate':'missing';
      let components=[];
      if(key==='iso-27001'){
        components=[component('isms','ISMS requirements',included.filter(r=>r.specification==='isms_clause'),key),component('annex','Included Annex A controls',included.filter(r=>r.specification==='annex_control'),key),{key:'soa',label:'Statement of Applicability',...metrics.soa,included:metrics.soa.applicable,unavailable:definitions.filter(d=>d.specification==='annex_control'&&!groups.has(d.id)).length}];
        position.scope_label=`ISMS + included Annex A · ${undetermined.length} SoA undetermined`;
      }else if(key==='soc-2'){
        components=config.categories.map(category=>component(category,SOC_CATEGORIES[category],included.filter(r=>r.category===category),key));position.scope_label=config.categories.map(c=>SOC_CATEGORIES[c]).join(', ');
      }else if(key==='cis-ig1')position.scope_label=`Cumulative IG${configuration.implementation_group} safeguards`;
      const included_counts=values.filter(value=>STATUS.includes(value.key));
      const references=sources.map(row=>({kind:'framework_assessments',id:row.framework_assessment_id,definition_id:row.definition_id,framework_version:row.framework_version??null,status:row.status,version:row.last_saved||row.last_assessed||row.created_at||null})).sort((a,b)=>a.id.localeCompare(b.id));
      const sourceDates=references.map(reference=>Date.parse(reference.version)).filter(Number.isFinite),afterCutoff=sourceDates.some(date=>date>timestamp(asOf));
      const complete=!missing&&!duplicates&&!unknown&&!invalid&&!afterCutoff;
      // normalizedCurrent supplies all three identities; preserve property order
      // without first calculating canonical values that it immediately replaces.
      return {...position,current:normalizedCurrent(db,position.program_id,{...unavailable,availability:complete?'available':'partial',counts:values,included_counts,assessed:included_counts.filter(value=>value.key!=='not_assessed').reduce((sum,value)=>sum+value.count,0),not_started:!!(complete&&included.length&&included.every(row=>row.status==='not_assessed')&&!rows.some(row=>row.last_saved||row.last_assessed)),status_signature:null,source_revision:null,provenance:{...unavailable.provenance,source_references:references,cutoff_consistent:!afterCutoff,source_as_of:sourceDates.length?iso(Math.max(...sourceDates)):null},implemented,denominator:included.length,total:definitions.length,excluded:excluded.length,percentage:complete&&included.length?implemented/included.length*100:null,components,scope,scope_signature:null,scope_undetermined:undetermined.length,missing_records:missing,duplicate_records:duplicates,unrecognized_status_count:unknown,invalid_applicability_count:invalid,
        reason:afterCutoff?'Native source changed after this cutoff; reload the current position.':!complete?'Some native Demo records or decisions are unavailable or invalid.':undetermined.length?'Percentages describe ISMS and included Annex A; unresolved SoA decisions remain separate.':!included.length?'No applicable implementation items.':null})};
    });
  });
}

const positionState=position=>stable({scope:exactScope(position.current)||position.current.scope_signature,counts:position.current.counts,availability:position.current.availability,sources:comparisonReferences(position.current.provenance)?.map(({id,status})=>({id,status}))});

// Hook this into saveStore before its single setItem. A failed commit persists
// neither source changes nor these derived observations. Report GETs never call it.
export function captureDemoReporting(db,previous,at=new Date().toISOString()){
  // Capture owns native changes; explicit new scenario imports must survive the
  // first persistence boundary too. Existing committed points stay authoritative.
  const prior={...(previous?.portfolio_reporting||{})};
  const imported=[],retainedIds=new Set((prior.snapshots||[]).map(point=>point.snapshot_id));
  for(const client of db.clients||[]){
    const candidate=db.cis_demo_scenario_history?.[client.client_id];
    if(!Array.isArray(candidate?.point_ids)||candidate.point_ids.every(id=>retainedIds.has(id)))continue;
    const context=getCisDemoScenarioContext(db,client.client_id,at);
    if(!context)continue;
    imported.push(...(db.portfolio_reporting?.snapshots||[]).filter(point=>context.point_ids.includes(point.snapshot_id)&&!retainedIds.has(point.snapshot_id)));
  }
  if(imported.length){
    prior.snapshots=[...(prior.snapshots||[]),...imported];
    const programs=new Set(imported.map(point=>point.program_id));
    prior.identities=[...(prior.identities||[]),...(db.portfolio_reporting?.identities||[]).filter(identity=>programs.has(identity.program_id)&&!(prior.identities||[]).some(existing=>existing.program_id===identity.program_id))];
  }
  const snapshots=(prior.snapshots||[]).map(snapshot=>({...snapshot,current:copyCurrent(snapshot.current)}));
  const identities=(prior.identities||[]).map(row=>({...row,scopes:row.scopes.map(scopeText),head:row.head?{...row.head}:null}));
  const projection={...db,portfolio_reporting:{...prior,identities}},scope_events=[...(prior.scope_events||[])];
  const initialPositions=demoCurrentPositions(projection,db.clients||[],at),changedIdentityPrograms=new Set();
  for(const position of initialPositions){
    let identity=identities.find(row=>row.program_id===position.program_id);
    if(!identity){identity={program_id:position.program_id,scopes:knownScopes(projection,position.program_id),head:null};identities.push(identity);changedIdentityPrograms.add(position.program_id);}
    const signature=exactScope(position.current);if(signature&&!identity.scopes.includes(signature)){identity.scopes.push(signature);changedIdentityPrograms.add(position.program_id);}
    const source=exactSource(position.current);
    if(source&&source!==identity.head?.signature){identity.head={signature:source,revision:(identity.head?.revision||0)+1};changedIdentityPrograms.add(position.program_id);}
  }
  const beforePositions=previous?demoCurrentPositions({...previous,portfolio_reporting:{...prior,identities}},previous.clients||[],at):[];
  // The identity pass changes no source records; only changed program identity metadata needs normalization again.
  const afterPositions=initialPositions.map(position=>position.current.scope&&changedIdentityPrograms.has(position.program_id)?{...position,current:normalizedCurrent(projection,position.program_id,position.current)}:position);
  if(previous)for(const identity of new Set([...beforePositions,...afterPositions].map(position=>position.program_id))){
    const before=beforePositions.find(position=>position.program_id===identity),after=afterPositions.find(position=>position.program_id===identity);
    if(stable(before?.current.scope??null)!==stable(after?.current.scope??null)){
      const position=after||before;scope_events.push({client_id:position.client_id,framework_key:position.framework_key,at,provenance:'committed_demo_scope',before:before?.current||null,after:after?.current||null});
    }
  }
  for(const position of afterPositions){
    const latest=[...snapshots].reverse().find(s=>s.client_id===position.client_id&&s.framework_key===position.framework_key);
    const before=beforePositions.find(before=>before.program_id===position.program_id);
    const membershipChanged=before&&stable(before.current.scope)!==stable(position.current.scope);
    if(!latest||positionState(latest)!==positionState(position)||previous&&!before||membershipChanged){
      const snapshot_id=`demo:${position.program_id}:${at}:${snapshots.length}`,kind=previous&&(!before||membershipChanged||positionState(before)!==positionState(position))?'committed_event':previous?'sampled':'current_baseline';
      if(latest&&beforePositions.some(before=>before.program_id===position.program_id&&positionState(before)===positionState(latest)))latest.current=Object.assign(copyCurrent(latest.current),{effective_until:at,continuity_proven:true,continuity_source_event:snapshot_id});
      snapshots.push({...position,snapshot_id,captured_at:at,effective_at:at,observation_sequence:snapshots.length+1,observation_kind:kind,source_revision:position.current.source_revision,source_event:snapshot_id,current:{...position.current,effective_at:at,source_event:snapshot_id,observation_kind:kind,provenance:{...position.current.provenance,kind,source_event:snapshot_id}}});
    }
  }
  const activity_proofs={...(prior.activity_proofs||{})};
  if(previous){
    const retained=new Set((previous.logs||[]).map(log=>log.audit_id||log.log_id));
    const grouped=new Map();
    for(const log of db.logs||[]){
      const id=log.audit_id||log.log_id,kind=sourceKinds[log.entity_type];
      if(!id||retained.has(id)||!kind)continue;
      activity_proofs[id]={eligible:false};
      if(!successful(log)||!logType(log,kind,true))continue;
      const key=stable([kind,log.client_id,log.entity_id]);
      grouped.set(key,[...(grouped.get(key)||[]),log]);
    }
    for(const group of grouped.values()){
      const reference=group[0],kind=sourceKinds[reference.entity_type];
      const before=sourceRecord(previous,kind,reference),after=sourceRecord(db,kind,reference);
      if(!before&&!after)continue;
      const changed=businessFields[kind].filter(field=>stable(businessValue(field,before?.[field]))!==stable(businessValue(field,after?.[field])));
      const oldHistory=before?.assessment_history||[],history=after?.assessment_history||[],recordedAt=Date.parse(after?.assessment_recorded_at);
      // Explicit SOC reaffirmations need the actual appended native judgment, not history noise.
      const recorded=kind==='framework_assessments'&&after?.framework_key==='soc-2'
        &&(STATUS.includes(after.status)&&after.status!=='not_assessed'||after.status==='not_applicable'&&typeof after.na_rationale==='string'&&!!after.na_rationale.trim())
        &&Number.isFinite(recordedAt)&&recordedAt>(before?.assessment_recorded_at==null?-Infinity:Date.parse(before.assessment_recorded_at))
        &&Array.isArray(oldHistory)&&Array.isArray(history)&&history.length>oldHistory.length&&stable(history.slice(0,oldHistory.length))===stable(oldHistory)
        &&group.some(log=>log.action==='Framework assessment updated'&&log.meta?.record_assessment===true&&log.user_id===after.assessment_recorded_by)
        &&history.slice(oldHistory.length).some(entry=>entry.at===after.assessment_recorded_at&&entry.assessment_recorded_at===after.assessment_recorded_at
          &&entry.by===after.assessment_recorded_by&&entry.assessment_recorded_by===after.assessment_recorded_by&&entry.status===after.status);
      if(before&&after&&!changed.length&&!recorded)continue;
      // Native helpers may emit both a write receipt and a domain receipt for one commit.
      const chosen=[...group].sort((a,b)=>receiptPriority(b)-receiptPriority(a))[0];
      activity_proofs[chosen.audit_id||chosen.log_id]={eligible:true,type:logType(chosen,kind,true),changed_fields:changed};
    }
  }
  const source_refresh_proofs=[...(prior.source_refresh_proofs||[])];
  const canonical=db.clients?.find(client=>client.client_id==='demo_brawndo');
  const scenario=prior.fixture_versions?.['brawndo-cis-ig1-history-v2'];
  const retainedLogIds=new Set((previous?.logs||[]).map(log=>log.audit_id||log.log_id));
  const refreshReceipts=(db.logs||[]).filter(log=>!retainedLogIds.has(log.audit_id||log.log_id)
    &&log.client_id==='demo_brawndo'&&log.entity_type==='framework_assessments'
    &&log.action==='Framework assessment updated'&&activity_proofs[log.audit_id||log.log_id]?.eligible===true);
  // No accepted Brawndo assessment receipt means this save cannot refresh its
  // source. Avoid rebuilding that unrelated program for every other Demo save.
  if(previous&&scenario&&refreshReceipts.length&&db.user?.workspace_mode==='demo'&&canonical?.status==='active'&&!inactive(canonical)
    &&canonical.environment==='Demo'&&canonical.initial_program_baseline?.state?.version===3
    &&canonical.initial_program_baseline.state.completed&&canonical.initial_program_baseline.completed_by==='demo_provider_lead'){
    // Same posture, newer accepted source: retain a reporting proof without
    // inventing a posture observation, historical date or forecast vote.
    const before=demoCurrentPositions(previous,previous.clients.filter(client=>client.client_id==='demo_brawndo'),at).find(value=>value.program_id==='demo_brawndo:cis-ig1');
    const after=afterPositions.find(value=>value.program_id==='demo_brawndo:cis-ig1');
    const oldRefs=before?.current.provenance?.source_references||[],newRefs=after?.current.provenance?.source_references||[];
    const sameMembers=oldRefs.length===56&&newRefs.length===56&&oldRefs.every(old=>newRefs.some(next=>next.id===old.id
      &&next.kind===old.kind&&next.definition_id===old.definition_id&&next.framework_version===old.framework_version&&next.status===old.status));
    const changed=newRefs.filter(next=>oldRefs.find(old=>old.id===next.id)?.version!==next.version);
    const receipts=changed.map(reference=>refreshReceipts.find(log=>log.entity_id===reference.id&&log.meta?.status===reference.status
      &&Number.isFinite(Date.parse(log.at))&&Date.parse(log.at)<=Date.parse(at)
      &&Math.abs(Date.parse(log.at)-Date.parse(reference.version))<=1000
      &&activity_proofs[log.audit_id||log.log_id]?.eligible===true));
    if(sameMembers&&changed.length&&receipts.every(Boolean)&&before.current.availability==='available'&&after.current.availability==='available'
      &&exactScope(before.current)===exactScope(after.current)&&before.current.denominator===56&&after.current.denominator===56
      &&before.current.source_revision&&after.current.source_revision&&before.current.source_revision!==after.current.source_revision
      &&changed.every(next=>Date.parse(next.version)>Date.parse(oldRefs.find(old=>old.id===next.id).version))
      &&getBrawndoScenarioContext(previous,new Date(at))){
      const proof_id=`demo-source-refresh:${after.program_id}:${after.current.source_revision}`;
      if(!source_refresh_proofs.some(proof=>proof.proof_id===proof_id))source_refresh_proofs.push({proof_id,kind:'accepted_source_refresh',
        client_id:'demo_brawndo',program_id:after.program_id,at,from_source_revision:before.current.source_revision,to_source_revision:after.current.source_revision,
        scope_signature:after.current.scope_signature,measure_version:after.current.measure_version,status_signature:after.current.status_signature,
        source_references_before:oldRefs,source_references_after:newRefs,source_event_ids:receipts.map(log=>log.audit_id||log.log_id)});
    }
  }
  db.portfolio_reporting={...prior,started_at:prior.started_at||at,last_captured_at:snapshots.at(-1)?.captured_at||null,snapshots,scope_events,activity_proofs,identities,
    ...(source_refresh_proofs.length?{source_refresh_proofs}:{})};
}

function comparison(snapshots,current,start,scenarioContext=null){
  const effective=s=>s.effective_at||s.current?.effective_at||s.captured_at;
  const ordered=snapshots.filter(s=>timestamp(effective(s))<=timestamp(current.captured_at)).sort((a,b)=>timestamp(effective(a))-timestamp(effective(b))||(a.observation_sequence||0)-(b.observation_sequence||0));
  const prior=ordered.filter(s=>timestamp(effective(s))<=timestamp(start)).at(-1);
  // Carried scenario positions need their original identity and kind to retain
  // the validated interval and provenance; a date/count alone is insufficient.
  const baseline=prior?{...prior.current,effective_at:effective(prior),...(scenarioContext?{
    snapshot_id:prior.snapshot_id,observation_kind:prior.observation_kind,captured_at:prior.captured_at
  }:{})}:null;
  const modeled=prior&&isDemoScenarioPosition(prior,scenarioContext)&&prior.current.modeled_until&&timestamp(prior.current.modeled_until)>=timestamp(start);
  const proven=!!baseline&&(timestamp(baseline.effective_at)===timestamp(start)||baseline.continuity_proven===true&&baseline.effective_until&&timestamp(baseline.effective_until)>=timestamp(start)||modeled);
  const result={baseline,change_pp:null,change_implemented:null,baseline_effective_at_start:!!proven,comparable:false,scope_changed:false,requested_start:start,available_from:ordered[0]?effective(ordered[0]):current.captured_at,coverage:'committed_demo_positions',continuous_history:false,reason:'No captured Demo position on or before the requested start.'};
  if(!baseline)return result;
  const signatures=new Set([...ordered.filter(s=>timestamp(effective(s))>=timestamp(baseline.effective_at)).map(s=>s.current.scope_signature),current.scope_signature]);
  result.scope_changed=new Set([...signatures].filter(Boolean)).size>1;
  if(result.scope_changed){result.reason='Native program scope changed; raw endpoint change uses each position\'s own denominator.';if(proven&&baseline.percentage!=null&&current.percentage!=null)Object.assign(result,{change_pp:current.percentage-baseline.percentage,change_implemented:current.implemented-baseline.implemented});}
  else if(signatures.has(null)||baseline.percentage==null||current.percentage==null)result.reason='A complete comparable implementation position is unavailable.';
  else if(!proven)result.reason='The older observation does not establish the state effective at the period boundary.';
  else Object.assign(result,{comparable:true,change_pp:current.percentage-baseline.percentage,change_implemented:current.implemented-baseline.implemented,calculation_basis:modeled?'demo_scenario':'committed_history',reason:modeled?'Illustrative demo scenario interval at the period boundary.':'Actual browser-local committed dates and proven predecessor state.'});
  return result;
}

function cohort(db,params,history=false){
  if(!(history?['super_admin','platform_admin','client_grc_manager','client_contributor','client_readonly','client_viewer']:['super_admin','platform_admin']).includes(db.user.role))return fail(403,history?'History is restricted to authorized client readers':'Portfolio reporting is restricted to internal admins');
  const selected=params.client_ids===undefined?null:[...new Set(String(params.client_ids).split(',').filter(Boolean))];
  if(selected&&(selected.length>500||selected.some(id=>!/^[A-Za-z0-9_-]{1,128}$/.test(id))))return fail(422,'Invalid portfolio client scope');
  if(selected?.some(id=>!evidenceAccess(db.user,id)))return fail(403,'Forbidden for this client');
  return (db.clients||[]).filter(c=>evidenceAccess(db.user,c.client_id)&&(selected===null||selected.includes(c.client_id))&&(params.include_archived===true||params.include_archived==='true'||c.status!=='archived'));
}

const coverage=(db,snapshots)=>({partial:true,started_at:snapshots[0]?.captured_at||null,last_captured_at:snapshots.at(-1)?.captured_at||null,notice:'Demo uses browser-local saved records. Positions are captured on committed Demo changes; earlier scope is not reconstructed. This is not hosted customer history.'});
const sourceKinds={framework_assessment:'framework_assessments',framework_assessments:'framework_assessments',organizational_control:'organizational_controls',organizational_controls:'organizational_controls',review:'reviews',reviews:'reviews',finding:'findings',findings:'findings',risk:'risks',risks:'risks',policy:'policies',policies:'policies',evidence:'evidence',client:'clients',clients:'clients',requirement:'requirements',requirements:'requirements'};
const sourceIds={framework_assessments:'framework_assessment_id',organizational_controls:'control_id',reviews:'review_id',findings:'finding_id',risks:'risk_id',policies:'policy_id',evidence:'evidence_id',clients:'client_id',requirements:'requirement_id'};
const businessFields={
  framework_assessments:['status','implementation','technology','notes','owner_id','process_owner_id','verification','verification_checklist','cis_assessment_criteria','soc_assessment_checks','iso_assessment_checks','na_rationale','soa_applicability','soa_justification','addressable_decision','addressable_rationale','management_controls','related_links','unlinked_evidence_ids','items_to_address'],
  organizational_controls:['name','title','description','status','owner_id','assessment_ids','related_links','observations','design','implementation','conflicts','frequency','reconciliation_note'],
  reviews:['title','status','notes','outcome','iso_audit','due_date','owner_id','reviewer_id','recurrence','custom_recurrence_days','evidence_ids','occurrences','scope','amendments'],
  findings:['title','description','status','severity','owner_id','due_date','notes','decision_history','governance_context'],
  risks:['title','description','status','likelihood_score','impact_score','risk_score','risk_level','owner_id','treatment','treatment_plan','next_review','review_cadence','custom_recurrence_days','decision_history','acceptance_rationale','acceptance_expires_at','closure_reason','closure_note','governance_context','related_task_ids'],
  policies:['title','description','status','owner_id','version','presence','notes','content','approval_history','decision_history','approval_request','approval_subject','approval_authority','approval_basis','approved_at','verified_at','review_id','next_review_date','governance_context'],
  evidence:['filename','display_name','evidence_type','evidence_date','effective_date','expiration_date','refresh_date','notes','relationships','archived_at','linked_type','linked_id'],
  clients:['framework_settings','onboarding_baseline','iso_audit_program'],
  requirements:['baseline_response','baseline_key','applicability','status','effective_date'],
};
const successful=log=>(log.outcome==null||log.outcome==='success')&&!['denied','failed','error','cancelled','requested'].includes(log.meta?.outcome)&&log.success!==false&&log.committed!==false&&!log.meta?._portfolio_activity_noop;
const receiptPriority=log=>['update','create','Risk updated'].includes(log.action)?0:['Review started','Review completed','CIS scope updated','SOC 2 readiness scope updated'].includes(log.action)?2:1;
function sourceRecord(db,kind,log){
  const row=(db[kind]||[]).find(value=>value[sourceIds[kind]]===log.entity_id&&value.client_id===log.client_id);
  return kind==='clients'&&row?{...row,onboarding_baseline:row.onboarding_baseline||db.baselines?.[row.client_id]}:row;
}
function businessValue(field,value){
  if(field==='archived_at')return !!value;
  if(field==='items_to_address'){
    if(value==null)return [];
    if(Array.isArray(value)){
      const fields=['item_id','question_id','kind','text','state','resolution','notes','finding_id'];
      return value.map(item=>stable(item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(fields.map(key=>[key,item[key]??null])):item)).sort();
    }
  }
  if(field!=='iso_audit')return value??null;
  const clean=item=>Array.isArray(item)?item.map(clean):item&&typeof item==='object'
    ?Object.fromEntries(Object.entries(item).filter(([key])=>!['updated_at','updated_by'].includes(key)).map(([key,entry])=>[key,clean(entry)])):item;
  return clean(value??null);
}

function logType(log,kind,proven=false){
  const action=log.action||'';
  if(!successful(log))return null;
  if(proven&&['create','update','archive','delete'].includes(action))return {framework_assessments:'Assessments',organizational_controls:'Assessments',reviews:'Assessments',findings:'Findings',risks:'Risks',policies:'Policies',evidence:'Evidence',clients:'Scope',requirements:'Scope'}[kind];
  if(kind==='reviews'&&(['Review started','Review completed'].includes(action)||(proven&&['Audit work updated','Review configuration changed','amend'].includes(action))))return 'Assessments';
  if(kind==='organizational_controls'&&(['Control created','Control observation recorded'].includes(action)||action==='Control updated'&&proven))return 'Assessments';
  if(proven&&kind==='framework_assessments'&&['Framework assessment updated','Assessment item updated','Framework record linked','Framework Evidence unlinked','Framework Review linked'].includes(action))return 'Assessments';
  if(kind==='findings'&&(['create','Finding validated and closed','Finding moved to In Remediation','Finding moved to Pending Validation','validate','accept','reopen','close','archive','delete'].includes(action)))return 'Findings';
  if(kind==='risks'&&['create','Risk created','Risk reassessed','Risk accepted','Risk closed','Risk owner assigned','Treatment updated','Next Risk Review scheduled','archive','delete'].includes(action))return 'Risks';
  if(kind==='policies'&&(['create','approved','rejected','submitted','submission_withdrawn','archive','delete','retire'].includes(action)||/^Policy (approved|rejected|submitted|retired|returned|Review scheduled)$/.test(action)))return 'Policies';
  if(proven&&kind==='policies'&&['Policy metadata changed','Policy Review completed','verify','approve','reject','submit-review','withdraw-submission'].includes(action))return 'Policies';
  if(kind==='evidence'&&['upload','create','archive','delete'].includes(action))return 'Evidence';
  if(kind==='evidence'&&['Evidence metadata changed','Evidence relationship added','Evidence relationship removed'].includes(action)&&proven)return 'Evidence';
  if(proven&&kind==='risks'&&['Risk updated','Action Item linked','Assessment Updated','Treatment Updated','Risk Accepted'].includes(action))return 'Risks';
  if(proven&&kind==='clients'&&['SOC 2 readiness scope updated','ISO audit program activated','onboarding-complete','program-applicability-updated','CIS scope updated'].includes(action))return 'Scope';
  if(proven&&kind==='requirements'&&action==='program-applicability-updated')return 'Scope';
  if(kind==='clients'&&(action==='CIS scope updated'&&Number.isInteger(log.meta?.before)&&Number.isInteger(log.meta?.after)&&log.meta.before!==log.meta.after||action==='program-applicability-updated'&&log.meta?.previous_status!==log.meta?.applicability))return 'Scope';
  return null;
}

function events(db,clients,at,days,type){
  const byClient=new Map(clients.map(c=>[c.client_id,c])),seen=new Set();
  return (db.logs||[]).flatMap(log=>{
    const id=log.audit_id||log.log_id,proof=db.portfolio_reporting?.activity_proofs?.[id];
    const kind=sourceKinds[log.entity_type],category=kind&&successful(log)&&(proof?proof.eligible&&proof.type:logType(log,kind)),time=Date.parse(log.at);
    if(!category||(type&&category!==type)||!byClient.has(log.client_id)||!Number.isFinite(time)||time>timestamp(at)||time<timestamp(at)-days*DAY)return [];
    if(!id||seen.has(id))return [];seen.add(id);
    const source=(db[kind]||[]).find(row=>row[sourceIds[kind]]===log.entity_id&&row.client_id===log.client_id),available=!!source&&!source.archived&&!source.archived_at&&source.status!=='archived';
    const query=new URLSearchParams({client_id:log.client_id,...kind==='framework_assessments'?{assessment:log.entity_id}:{id:log.entity_id}});
    const to=kind==='framework_assessments'?`/compliance/${source?.framework_key}?${query}`:kind==='clients'?`/client-profile?${query}`:kind==='organizational_controls'?`/controls?${query}`:`/${kind}?${query}`;
    const event={event_id:`demo:${id}`,client_id:log.client_id,client_name:byClient.get(log.client_id).name,at:iso(time),type:category,title:log.action,description:'Committed browser-local Demo activity.',actor:{user_id:log.user_id||null,name:log.user_name||'Unknown actor'},provenance:'Existing browser-local Demo audit record',source:{entity_type:kind,entity_id:log.entity_id,available,to:available?to:null}};
    if(available&&source.framework_key)Object.assign(event,{program_key:source.framework_key,program_label:source.framework_key==='cis-ig1'?'CIS Controls':FRAMEWORKS.find(f=>f.key===source.framework_key)?.label||source.framework_key});
    if(available&&log.action==='CIS scope updated')Object.assign(event,{before:{implementation_group:log.meta.before},after:{implementation_group:log.meta.after},program_key:'cis-ig1',program_label:'CIS Controls'});
    if(available&&category==='Assessments'&&STATUS.includes(log.meta?.status))event.after={status:log.meta.status};
    if(!available)event.note='The Demo source record is archived or unavailable.';
    return [event];
  }).sort((a,b)=>b.at.localeCompare(a.at)||b.event_id.localeCompare(a.event_id));
}

function demoHistory(db,position,available,range,asOf,scenarioContext=null){
  const start=demoRangeStart(asOf,range),forecastStart=demoRangeStart(asOf,'90d');
  const effective=snapshot=>snapshot.effective_at||snapshot.current.effective_at||snapshot.captured_at;
  const lineageOrder=snapshot=>isDemoScenarioPosition(snapshot,scenarioContext)?0:snapshot.snapshot_id===scenarioContext?.join_snapshot_id?1:2;
  const ordered=available.map(snapshot=>({...snapshot,current:normalizedCurrent(db,position.program_id,snapshot.current,snapshot)})).sort((a,b)=>timestamp(effective(a))-timestamp(effective(b))
    ||(scenarioContext?lineageOrder(a)-lineageOrder(b):0)||(a.observation_sequence||0)-(b.observation_sequence||0));
  const flat=snapshot=>({...thinCurrent(snapshot.current),snapshot_id:snapshot.snapshot_id,effective_at:effective(snapshot),captured_at:snapshot.captured_at,observation_kind:snapshot.observation_kind||'sampled',source_revision:snapshot.current.source_revision,source_event:snapshot.source_event||null,observation_sequence:snapshot.observation_sequence||0});
  const scopePoint=current=>current?Object.fromEntries(['total','denominator','implemented','included_counts','scope_signature','measure_version'].map(field=>[field,current[field]])):null;
  const membership = (before, after) => {
    if (!before?.scope?.applicability || !after?.scope?.applicability) return {status_changes_known:false};
    const old = new Set(Object.keys(before.scope.applicability).filter(id => before.scope.applicability[id] === 'included'));
    const next = new Set(Object.keys(after.scope.applicability).filter(id => after.scope.applicability[id] === 'included'));
    const common=[...old].filter(id=>next.has(id)).sort();
    const previousRefs=before.provenance?.source_references,currentRefs=after.provenance?.source_references;
    const known=Array.isArray(previousRefs)&&Array.isArray(currentRefs)&&common.every(id=>{
      const first=previousRefs.filter(row=>row.definition_id===id),last=currentRefs.filter(row=>row.definition_id===id);
      return first.length===1&&last.length===1&&first[0].id===last[0].id
        &&STATUS.includes(first[0].status)&&STATUS.includes(last[0].status);
    });
    const status_changes=known?common.flatMap(id=>{
      const first=previousRefs.find(row=>row.definition_id===id),last=currentRefs.find(row=>row.definition_id===id);
      return first.status===last.status?[]:[{definition_id:id,before_status:first.status,after_status:last.status}];
    }):[];
    return {added_ids:[...next].filter(id=>!old.has(id)).sort(),removed_ids:[...old].filter(id=>!next.has(id)).sort(),membership_known:true,
      status_changes_known:known,status_changes};
  };
  const changes=[];
  for(let i=1;i<ordered.length;i++)if(ordered[i-1].current.scope_signature!==ordered[i].current.scope_signature)changes.push({at:effective(ordered[i]),after_snapshot_id:ordered[i].snapshot_id,before:scopePoint(ordered[i-1].current),after:scopePoint(ordered[i].current),provenance:'observed_scope_transition',...membership(ordered[i-1].current,ordered[i].current)});
  for(const change of db.portfolio_reporting?.scope_events||[])if(change.client_id===position.client_id&&change.framework_key===position.framework_key&&timestamp(change.at)<=timestamp(asOf)){
    const normalized={...change,...membership(change.before,change.after),before:scopePoint(change.before&&normalizedCurrent(db,position.program_id,change.before)),after:scopePoint(change.after&&normalizedCurrent(db,position.program_id,change.after))};
    if(!changes.some(existing=>timestamp(existing.at)===timestamp(change.at)&&existing.before?.scope_signature===normalized.before?.scope_signature&&existing.after?.scope_signature===normalized.after?.scope_signature))changes.push(normalized);
  }
  changes.sort((a,b)=>timestamp(a.at)-timestamp(b.at));
  const result=comparison(ordered,position.current,start,scenarioContext);
  if(result.baseline&&changes.some(change=>timestamp(change.at)>timestamp(result.baseline.effective_at))){
    Object.assign(result,{scope_changed:true,comparable:false,reason:'Committed scope changed; raw endpoint change uses each position\'s own denominator.'});
  }
  if(result.baseline)result.baseline={...thinCurrent(result.baseline),captured_at:result.baseline.captured_at,effective_at:result.baseline.effective_at,source_revision:result.baseline.source_revision,
    ...(scenarioContext?{snapshot_id:result.baseline.snapshot_id,observation_kind:result.baseline.observation_kind}:{})};
  const snapshots=ordered.filter(snapshot=>timestamp(effective(snapshot))>=timestamp(start)).map(flat);
  // This is a read-only current-state readout, not a saved historical position.
  // The validated held chain proves the last accepted posture remains current;
  // forecast inputs deliberately remain the separately retained observations.
  if(scenarioContext?.held_snapshot_id&&scenarioContext.held_until===asOf
    &&timestamp(snapshots.at(-1)?.effective_at||start)<timestamp(asOf))snapshots.push({
      ...thinCurrent(position.current),snapshot_id:`demo-current:${position.program_id}:${position.current.source_revision}:${asOf}`,
      effective_at:asOf,captured_at:asOf,retrieved_at:asOf,observation_kind:'current_state',
      source_revision:position.current.source_revision,source_event:null,
      provenance:{kind:'current_state',label:'Current native assessment state',source_as_of:position.current.provenance.source_as_of}
    });
  return {range,period_start:start,period_end:asOf,snapshots,forecast_snapshots:ordered.filter(snapshot=>timestamp(effective(snapshot))>=timestamp(forecastStart)).map(flat),comparison:result,scope_changes:changes.filter(change=>timestamp(change.at)>=timestamp(start)),forecast_scope_changes:changes.filter(change=>timestamp(change.at)>=timestamp(forecastStart)),capture_method:'Browser-local atomic committed posture/scope changes; no historical interpolation.'};
}

export function portfolioReportingRequest(db,path,params={}){
  if(!path.startsWith('/portfolio/reporting/'))return undefined;
  const isHistory=path.endsWith('/history');
  const clients=cohort(db,isHistory?{...params,client_ids:params.client_id}:params,isHistory),asOf=params.as_of?iso(timestamp(params.as_of)):new Date().toISOString();
  if(timestamp(asOf)>Date.now())return fail(422,'The reporting cutoff cannot be in the future');
  const range=params.range||(isHistory?'3m':'90d'),start=demoRangeStart(asOf,range),programs=demoCurrentPositions(db,clients,asOf);
  const snapshots=(db.portfolio_reporting?.snapshots||[]).filter(s=>clients.some(c=>c.client_id===s.client_id)&&timestamp(s.captured_at)<=timestamp(asOf)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at));
  if(path.endsWith('/overview')){
    const frameworks=new Map();for(const p of programs){const available=snapshots.filter(s=>s.client_id===p.client_id&&s.framework_key===p.framework_key),recent=demoHistory(db,p,available,'90d',asOf);p.comparison=demoHistory(db,p,available,range,asOf).comparison;Object.assign(p,{snapshots_90d:recent.snapshots,comparison_90d:recent.comparison,scope_changes_90d:recent.scope_changes});if(p.current.availability==='unavailable')continue;if(!frameworks.has(p.program_key))frameworks.set(p.program_key,{key:p.program_key,label:p.program_label,framework_key:p.framework_key,clients:[]});frameworks.get(p.program_key).clients.push({client_id:p.client_id,name:p.client_name});}
    const latest=latestPortfolioActivity(db.logs||[],new Date(asOf),db.portfolio_reporting?.activity_proofs);
    const clientRows=clients.map(client=>{const lead=(db.users||[]).find(user=>user.user_id===client.assigned_owner_id);return {...client,grc_lead_id:client.assigned_owner_id||null,grc_lead:lead?Object.fromEntries(['user_id','name','email','status','role'].map(field=>[field,lead[field]])):null,last_activity:latest.get(client.client_id)||null};});
    return {total_clients:clients.length,clients:clientRows,as_of:asOf,programs,frameworks:[...frameworks.values()].map(f=>({...f,client_count:f.clients.length})),recent_changes_count:events(db,clients,asOf,7).length,coverage:coverage(db,snapshots)};
  }
  if(path.endsWith('/history')){
    const position=programs.find(p=>p.client_id===params.client_id&&p.program_key===params.program_key);if(!position)return fail(404,'Enabled Demo program not found');
    const available=snapshots.filter(s=>s.client_id===position.client_id&&s.framework_key===position.framework_key);
    const scenario_context=params.demo_scenario==='brawndo-cis-ig1-history-v2'&&position.program_id==='demo_brawndo:cis-ig1'
      ?getBrawndoScenarioContext(db,new Date(asOf))
      : params.demo_scenario===namedDemoClient(position.client_id)?.historyVersion && position.framework_key==='cis-ig1'
        ?getCisDemoScenarioContext(db,position.client_id,asOf):null;
    return {...position,as_of:asOf,...demoHistory(db,position,available,range,asOf,scenario_context),coverage:coverage(db,available),...(scenario_context?{scenario_context}:{})};
  }
  if(path.endsWith('/activity')){
    const days=Number(params.days||7),limit=Number(params.limit||50),type=params.type;if(![7,30,90].includes(days)||!Number.isInteger(limit)||limit<1||limit>100||type&&!TYPES.includes(type))return fail(422,'Invalid Demo activity filters');
    if(params.client_id&&!clients.some(c=>c.client_id===params.client_id))return fail(404,'Client unavailable in the current view');
    const narrowed=params.client_id?clients.filter(c=>c.client_id===params.client_id):clients;
    const all=events(db,narrowed,asOf,days,type),scope=stable([narrowed.map(c=>c.client_id).sort(),db.user.user_id,days,type||'']);let offset=0;
    if(params.cursor){let value;try{value=JSON.parse(atob(params.cursor));}catch{return fail(422,'Invalid Demo activity cursor');}if(value.scope!==scope||value.as_of!==asOf)return fail(422,'Activity cursor belongs to a different Demo view');offset=all.findIndex(e=>e.event_id===value.event_id)+1;if(!offset)return fail(422,'Activity cursor is unavailable');}
    const page=all.slice(offset,offset+limit),more=offset+limit<all.length;
    return {events:page,total:all.length,as_of:asOf,period_start:iso(timestamp(asOf)-days*DAY),next_cursor:more?btoa(JSON.stringify({scope,as_of:asOf,event_id:page.at(-1).event_id})):null,coverage:{partial:true,last_captured_at:db.portfolio_reporting?.last_captured_at||null,notice:'Existing browser-local Demo business logs have partial coverage. No hosted customer activity is represented.'}};
  }
  return fail(404,'Demo reporting route not found');
}
