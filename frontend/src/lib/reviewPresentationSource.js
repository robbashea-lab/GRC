import {CATALOGS,activeDefinitions,cadenceDays} from './frameworks';
import {cisConfiguration} from './cisScope';
import {BUSINESS_BASIS,requirementBasis,referenceUrl} from './requirementBasis';
import {reviewDisplayValue} from './reviewPresentation';

export function reviewCadenceComparison(record,minimum) {
  if(!minimum)return {state:'not_recorded',label:'Source frequency not recorded'};
  const configured=record.recurrence==='custom'
    ? Number.isInteger(record.custom_recurrence_days)&&record.custom_recurrence_days>0?record.custom_recurrence_days:null
    : ['monthly','quarterly','semiannual','annual'].includes(record.recurrence)?cadenceDays(record.recurrence):null;
  const source=['monthly','quarterly','semiannual','annual'].includes(minimum)?cadenceDays(minimum):null;
  if(configured===null||source===null)return {state:'not_comparable',label:'Not directly comparable'};
  return configured>source?{state:'below',label:'Below requirement'}:{state:'meets',label:'Meets requirement'};
}

// Each fragment is original catalog text, never HTML or a rewritten quotation.
export function reviewSourceQuoteSegments(quote,minimum) {
  if(!quote||!['monthly','quarterly','semiannual','annual'].includes(minimum))return [{text:quote||'',highlight:false}];
  const recurring=quote.match(/on a recurring schedule at a minimum [^.]+/i);
  const word=quote.match(new RegExp(`\\b${minimum==='annual'?'annual(?:ly)?':minimum}\\b`,'i'));
  const interval=recurring&&recurring[0].toLowerCase().includes(minimum.toLowerCase())?recurring[0]:word?.[0];
  if(!interval)return [{text:quote,highlight:false}];
  const start=quote.toLowerCase().indexOf(interval.toLowerCase());
  if(start<0)return [{text:quote,highlight:false}];
  return [{text:quote.slice(0,start),highlight:false},{text:quote.slice(start,start+interval.length),highlight:true},{text:quote.slice(start+interval.length),highlight:false}].filter(part=>part.text);
}

export function resolveReviewPresentationSource({record,client,related={},activeDefinitionIds}={}) {
  const context=record?.governance_context||{};
  const configuredCadence=record?.recurrence==='custom'?`Every ${record.custom_recurrence_days} days`:record?.recurrence?reviewDisplayValue('recurrence',record.recurrence):'Not recorded';
  const base={classification:'unresolved',label:'Source not recorded',heading:'Review source not recorded',primary:null,sources:[],supports:[],context,
    purpose:[context.rationale,record?.framework_purpose,record?.scope].filter((value,index,values)=>value&&values.indexOf(value)===index),
    configuredCadence,minimumCadence:null,comparison:reviewCadenceComparison(record||{},null)};
  if(!record?.client_id||!client?.client_id||record.client_id!==client.client_id)return {...base,resolutionReason:'client_mismatch'};
  const groups=requirementBasis('reviews',record,related);
  const drivers=Array.isArray(record.framework_drivers)?record.framework_drivers:record.framework_key?[record]:[];
  const sources=[];
  let unresolvedDriver=false;
  for(const driver of drivers){
    const key=driver.framework_key,catalog=CATALOGS[key];
    // This scoped correction resolves CIS source activities; other frameworks retain their native references.
    if(key!=='cis-ig1'){unresolvedDriver=true;continue;}
    const configuration=cisConfiguration(client),plan=catalog.review_plans.find(item=>item.key===driver.framework_plan_key);
    const valid=driver.framework_driver_active===true&&driver.framework_version===catalog.version&&plan
      && !(record.framework_key===key&&record.framework_version&&record.framework_version!==driver.framework_version)
      && [1,2,3].includes(configuration.implementation_group)&&record.review_type===plan.review_type
      && !(record.baseline_key&&plan.baseline_key&&record.baseline_key!==plan.baseline_key);
    if(!valid){unresolvedDriver=true;continue;}
    if(!plan.source_minimum)continue;
    if(driver.framework_source_minimum&&driver.framework_source_minimum!==plan.source_minimum){unresolvedDriver=true;continue;}
    const activeIds=new Set(activeDefinitions(key,configuration).map(item=>item.id));
    const candidates=(plan.cadence_references||[]).filter(reference=>reference.interval===plan.source_minimum
      && plan.safeguards.includes(reference.definition_id)&&(driver.framework_safeguards||[]).includes(reference.definition_id)
      && activeIds.has(reference.definition_id)&&(!Array.isArray(activeDefinitionIds)||activeDefinitionIds.includes(reference.definition_id)));
    let qualified=false;
    for(const reference of candidates){
      const definition=catalog.requirements.find(item=>item.id===reference.definition_id);
      const stored=(driver.framework_cadence_references||[]).find(item=>item.definition_id===reference.definition_id&&item.interval===reference.interval&&item.source===reference.source);
      if(!stored||!definition?.official_text||definition.version!==catalog.version||!referenceUrl(reference.source)||!referenceUrl(definition.source))continue;
      qualified=true;
      if(sources.some(source=>source.frameworkKey===key&&source.definition.id===definition.id))continue;
      sources.push({frameworkKey:key,version:catalog.version,planKey:plan.key,definition,implementationGroup:definition.implementation_group,
        quote:definition.official_text,quoteSegments:reviewSourceQuoteSegments(definition.official_text,reference.interval),sourceUrl:reference.source,
        sourceCitation:definition.source_citation,minimumCadence:reference.interval,frequencyLabel:definition.source_cadence});
    }
    if(!qualified)unresolvedDriver=true;
  }
  const preferred=sources.filter(source=>source.frameworkKey===record.framework_key&&source.planKey===record.framework_plan_key);
  const primary=preferred.length===1?preferred[0]:sources.length===1?sources[0]:null;
  const supports=groups.map(group=>({...group,requirements:group.requirements.filter(item=>!primary||group.key!==primary.frameworkKey||item.definition.id!==primary.definition.id)})).filter(group=>group.requirements.length);
  if(primary)return {...base,classification:'required',label:`Required · CIS IG${primary.implementationGroup} Safeguard`,
    heading:`CIS IG${primary.implementationGroup} · Safeguard ${primary.definition.id} — ${primary.definition.title}`,primary,sources,supports,
    minimumCadence:primary.minimumCadence,comparison:reviewCadenceComparison(record,primary.minimumCadence),resolutionReason:'qualified_source_activity'};
  const recordedCategory=BUSINESS_BASIS[context.category];
  if(recordedCategory&&!unresolvedDriver&&!sources.length)return {...base,classification:'organizational',
    label:context.category==='organizational'?'Organization-defined':recordedCategory,
    heading:context.category==='organizational'?'Organization-defined review':recordedCategory,supports,resolutionReason:'recorded_business_basis'};
  return {...base,sources,supports,resolutionReason:sources.length?'multiple_source_activities':unresolvedDriver?'source_unresolved':'source_not_recorded'};
}
