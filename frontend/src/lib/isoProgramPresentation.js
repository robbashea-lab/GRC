import {activeDefinitions,frameworkCatalog} from './frameworks';
import {buildFrameworkDomainProfile} from './frameworkDomainProfile';
import {isoProgramMetrics} from './isoProgramMetrics';
import {calendarDay} from './managementDates';

const KEY='iso-27001';
const STATES=['addressed','in_progress','needs_attention','not_assessed'];
const ANNEX_IDS=new Set(frameworkCatalog(KEY).requirements.filter(definition=>definition.specification==='annex_control').map(definition=>definition.id));
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sameIds=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===actual.length&&expected.every(id=>actual.includes(id));
const unavailable=reason=>({total:null,applicable:null,addressed:null,partial:null,gap:null,notAssessed:null,assessed:null,na:null,scopeUndetermined:null,available:false,reason});
const malformedDocumentation=source=>Array.isArray(source?.assessments)&&source.assessments.some(row=>record(row)&&ANNEX_IDS.has(row.definition_id)&&['included','excluded'].includes(row.soa_applicability)&&row.soa_justification!=null&&typeof row.soa_justification!=='string');

export function isoSoaCounts(rows=[]){
  const controls=rows.filter(row=>row.specification==='annex_control'),soa={...isoProgramMetrics(controls).soa};
  soa.documented=controls.filter(row=>['included','excluded'].includes(row.soa_applicability)&&typeof row.soa_justification==='string'&&!!row.soa_justification.trim()).length;
  soa.missingJustification=soa.decided-soa.documented;
  soa.outstanding=soa.undetermined+soa.missingJustification;
  return soa;
}

function sectionSummary(domains,reason){
  const count=key=>domains.reduce((sum,domain)=>sum+domain.counts[key],0);
  return {total:domains.reduce((sum,domain)=>sum+domain.subjectIds.length,0),
    applicable:domains.reduce((sum,domain)=>sum+domain.applicable,0),
    addressed:count('addressed'),partial:count('in_progress'),gap:count('needs_attention'),notAssessed:count('not_assessed'),
    assessed:STATES.filter(key=>key!=='not_assessed').reduce((sum,key)=>sum+count(key),0),
    na:domains.reduce((sum,domain)=>sum+domain.excludedIds.length,0),
    scopeUndetermined:domains.reduce((sum,domain)=>sum+domain.undeterminedIds.length,0),available:true,reason};
}

// SoA diagnostics still need a complete native identity join when implementation is unavailable.
function diagnosticRows(source,clientId){
  const catalog=frameworkCatalog(KEY),position=source?.implementation_position,scope=position?.scope;
  if(source?.selected!==true||source.framework?.key!==KEY||source.framework.version!==catalog.version
    ||!Array.isArray(source.definitions)||!Array.isArray(source.assessments)||malformedDocumentation(source)
    ||[...source.definitions,...source.assessments].some(row=>!record(row)))return null;
  const definitions=activeDefinitions(KEY,source.configuration),ids=definitions.map(row=>row.id);
  if(position?.program_id!==`${clientId}:${KEY}`||scope?.framework_key!==KEY||scope.catalog_version!==catalog.version
    ||!sameIds(scope.definition_ids,ids)||!sameIds(source.active_definition_ids,ids))return null;
  const savedDefinitions=new Map(source.definitions.map(row=>[row.id,row]));
  if(savedDefinitions.size!==source.definitions.length||definitions.some(definition=>{
    const saved=savedDefinitions.get(definition.id);
    return !saved||['control','control_name','category','specification'].some(key=>saved[key]!==definition[key]);
  }))return null;
  if(source.assessments.some(row=>row.client_id!==clientId||row.framework_key!==KEY||row.framework_version!==catalog.version))return null;
  const rows=new Map(),identities=new Set();
  for(const row of source.assessments.filter(row=>ids.includes(row.definition_id)&&!row.archived&&!row.archived_at)){
    if(rows.has(row.definition_id)||typeof row.framework_assessment_id!=='string'||!row.framework_assessment_id.trim()||identities.has(row.framework_assessment_id))return null;
    rows.set(row.definition_id,row);identities.add(row.framework_assessment_id);
  }
  if(rows.size!==ids.length)return null;
  // Catalog specification owns the view; stale duplicated metadata on a record cannot remap it.
  return definitions.map(definition=>({...definition,...rows.get(definition.id),specification:definition.specification}));
}

function sourceTimestamp(value){
  if(typeof value!=='string'||!TIMESTAMP.test(value)||calendarDay(value)===null)return null;
  const at=Date.parse(value);
  return Number.isFinite(at)&&at<=Date.now()?new Date(at).toISOString():null;
}

export function isoProgramPresentation(source,clientId){
  const profile=malformedDocumentation(source)?{available:false,reason:'Native applicability documentation is unavailable or invalid.'}:
    buildFrameworkDomainProfile(source,{clientId,frameworkKey:KEY});
  const nativeReason=profile.available?source.implementation_position.reason||'':profile.reason;
  const reason=typeof nativeReason==='string'?nativeReason:'Native implementation records are unavailable.';
  // Eligibility and record reconciliation are owned by the existing native projection.
  const overall=profile.available?sectionSummary(profile.domains,reason):unavailable(reason);
  const requirements=profile.available?sectionSummary(profile.domains.filter(domain=>domain.id.startsWith('isms_clause/')),reason):unavailable(reason);
  const annex=profile.available?sectionSummary(profile.domains.filter(domain=>domain.id.startsWith('annex_control/')),reason):unavailable(reason);
  const rows=diagnosticRows(source,clientId);
  const soa={available:profile.available,countsAvailable:!!rows,reason,
    total:null,applicable:null,excluded:null,undetermined:null,decided:null,documented:null,missingJustification:null,outstanding:null};
  if(rows)Object.assign(soa,isoSoaCounts(rows));
  return {available:profile.available,reason,overall,requirements,annex,soa,
    sourceAsOf:rows?sourceTimestamp(source.implementation_position?.provenance?.source_as_of):null};
}
