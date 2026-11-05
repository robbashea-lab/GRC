import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {brawndoArtifactDefinition,brawndoArtifactSpecs} from './cisCanonicalBrawndoBooks';
import {initechArtifactSpecs} from './cisCanonicalInitechBooks';
import {krustyArtifactSpecs} from './cisCanonicalKrustyBooks';

export const CIS_CANONICAL_SCENARIO_REVISION='cis81-canonical-rebuild-v3';
// Fixture publication/provenance boundary, not the CIS framework release date.
export const CIS_CANONICAL_SCENARIO_FIRST_ANCHOR='2026-11-02T00:00:00.000Z';
export const canonicalArtifactLimit=(clientId,revision)=>clientId==='demo_krusty_krab'
  &&revision===CIS_CANONICAL_SCENARIO_REVISION?40:32;
const CLIENT_IDS=['demo_brawndo','demo_initech','demo_krusty_krab'];
const RECIPE_FIELDS=['kind','schema_version','fixture_version','client_id','anchor','key','scenario_revision'];
const DEFINITION_FIELDS=['evidence_id','filename','mime_type','linked_type','linked_id','occurrence_id','text'];
const LINK_TYPES=['framework_assessment','review','risk','policy','vendor','ai_system','task','finding'];
// Later client phases must add an explicit source registry; canonical membership
// alone never supplies a book or permits generic/custom client content.
const registries={demo_brawndo:{definition:recipe=>brawndoArtifactDefinition(recipe),enumerate:anchor=>brawndoArtifactSpecs(anchor)},
  demo_initech:{definition:recipe=>{
    if(!/^record-books-(?:[1-9]|[12]\d|3[0-2])$/.test(recipe.key))return null;
    const book=initechArtifactSpecs(recipe.anchor).find(row=>row.key===recipe.key);
    return book?Object.fromEntries(DEFINITION_FIELDS.map(key=>[key,book[key]])):null;
  },enumerate:anchor=>initechArtifactSpecs(anchor)},
  demo_krusty_krab:{definition:recipe=>{
    if(!/^record-books-(?:[1-9]|[12]\d|3\d|40)$/.test(recipe.key))return null;
    const book=krustyArtifactSpecs(recipe.anchor).find(row=>row.key===recipe.key);
    return book?Object.fromEntries(DEFINITION_FIELDS.map(key=>[key,book[key]])):null;
  },enumerate:anchor=>krustyArtifactSpecs(anchor)}};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,fields)=>plain(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));

// A descriptor supplies identities only. All original content and primary links
// come from the versioned source registry, never mutable native record values.
function validRecipe(recipe) {
  if(!exact(recipe,RECIPE_FIELDS)||recipe.kind!=='scenario_book'||recipe.schema_version!==1
    ||recipe.fixture_version!==CIS_SHOWCASE_VERSION||recipe.scenario_revision!==CIS_CANONICAL_SCENARIO_REVISION
    ||!CLIENT_IDS.includes(recipe.client_id)||!Object.hasOwn(registries,recipe.client_id)
    ||typeof recipe.key!=='string'||!/^[a-z][a-z0-9_-]{0,79}$/.test(recipe.key)
    ||['constructor','prototype','__proto__'].includes(recipe.key)
    ||typeof recipe.anchor!=='string'||!/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(recipe.anchor))return false;
  const anchor=new Date(recipe.anchor);
  return Number.isFinite(+anchor)&&anchor.toISOString()===recipe.anchor;
}

function validatedDefinition(recipe,definition) {
  if(!exact(definition,DEFINITION_FIELDS)||definition.evidence_id!==recipe.client_id+'_canonical_evidence_'+recipe.key
    ||definition.filename!=='cis-'+recipe.key+'.csv'||definition.mime_type!=='text/csv'
    ||!LINK_TYPES.includes(definition.linked_type)||typeof definition.linked_id!=='string'
    ||!(definition.linked_id.startsWith(recipe.client_id+'_')||definition.linked_id.startsWith('fw_'+recipe.client_id+'_')
      ||definition.linked_type==='review'&&['risk_review_','vendor_review_'].some(prefix=>definition.linked_id.startsWith(prefix+recipe.client_id+'_')))
    ||(definition.linked_type==='review'
      ?typeof definition.occurrence_id!=='string'||!definition.occurrence_id||definition.occurrence_id.length>256
      :definition.occurrence_id!==null)
    ||typeof definition.text!=='string'||!definition.text.trim()||definition.text.length>DEMO_INLINE_LIMIT)return null;
  return Object.freeze({...definition});
}

export function canonicalArtifactDefinition(recipe) {
  if(!validRecipe(recipe))return null;
  try{return validatedDefinition(recipe,registries[recipe.client_id].definition(recipe));}catch{return null;}
}

// The resolved value lives only for its caller's operation. Registration and
// download validation reuse it rather than reconstructing the same source model.
function resolvedDefinition(definition) {
  if(!definition)return null;
  try {
    const bytes=encodeURIComponent(definition.text).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    if(bytes.length<1||bytes.length>DEMO_INLINE_LIMIT)return null;
    return {definition,content_base64:btoa(bytes),size:bytes.length};
  }catch{return null;}
}

export function resolveCanonicalArtifact(recipe) {
  return resolvedDefinition(canonicalArtifactDefinition(recipe));
}

// Explicit source initialization only: enumerate this frozen source once for
// the whole candidate, then discard the operation-local definitions and bytes.
export function resolveCanonicalArtifacts(recipes) {
  if(!Array.isArray(recipes)||!recipes.length
    ||recipes.length>canonicalArtifactLimit(recipes[0]?.client_id,recipes[0]?.scenario_revision)
    ||recipes.some(recipe=>!validRecipe(recipe)))return null;
  const first=recipes[0];
  if(recipes.some(recipe=>recipe.client_id!==first.client_id||recipe.anchor!==first.anchor
    ||recipe.fixture_version!==first.fixture_version||recipe.scenario_revision!==first.scenario_revision)
    ||new Set(recipes.map(recipe=>recipe.key)).size!==recipes.length)return null;
  try {
    const books=registries[first.client_id].enumerate(first.anchor);
    if(!Array.isArray(books)||!books.length||books.length>canonicalArtifactLimit(first.client_id,first.scenario_revision)
      ||books.some(book=>!plain(book)||typeof book.key!=='string')
      ||new Set(books.map(book=>book.key)).size!==books.length)return null;
    const byKey=new Map(books.map(book=>[book.key,book]));
    const resolved=recipes.map(recipe=>{
      const book=byKey.get(recipe.key);
      const definition=book?Object.fromEntries(DEFINITION_FIELDS.map(key=>[key,book[key]])):null;
      return resolvedDefinition(validatedDefinition(recipe,definition));
    });
    return resolved.every(Boolean)?resolved:null;
  }catch{return null;}
}

export function renderCanonicalArtifact(recipe) {
  const resolved=resolveCanonicalArtifact(recipe);
  return resolved?{content_base64:resolved.content_base64,size:resolved.size}:null;
}
