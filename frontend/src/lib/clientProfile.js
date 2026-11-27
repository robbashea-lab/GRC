import catalog from './clientProfileFields.json';
import {scheduledDate} from './reviewOccurrences';
export {catalog};
export const optionsFor = field => typeof field.options === 'string' ? catalog.options[field.options] : field.options || [];
export function recordedBaseline(client,saved,events=[]) {
  if(client.initial_program_baseline)return client.initial_program_baseline;
  if(saved?.completed)return {state:saved,legacy:true,completed_at:null};
  const event=events.filter(e=>e.client_id===client.client_id&&e.action==='onboarding-complete').sort((a,b)=>String(a.at).localeCompare(String(b.at)))[0];
  return event?{state:{},legacy:true,completed_at:event.at,completed_by:event.user_id}:null;
}
export function recordedOnboardingState(client,saved=client?.onboarding_baseline,events=[]) {
  if(typeof client?.client_id!=='string'||!client.client_id.trim())return 'unknown';
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  if(object(client?.initial_program_baseline)&&Object.keys(client.initial_program_baseline).length
    ||object(saved)&&saved.completed===true
    ||Array.isArray(events)&&events.some(event=>event?.client_id===client.client_id&&event?.action==='onboarding-complete'))return 'complete';
  if(object(saved)&&saved.completed===false&&scheduledDate(saved.updated_at))return 'in_progress';
  return 'unknown';
}
export function validateProfile(section, values) {
  const fields=catalog.sections[section];
  if(!fields || !values || Array.isArray(values) || typeof values!=='object')throw new Error('Invalid profile section');
  return Object.fromEntries(Object.entries(values).map(([key,value])=>{
    const field=fields.find(f=>f.id===key), options=field&&optionsFor(field);
    if(!field)throw new Error('Invalid profile field');
    if(value===null)return [key,null];
    let valid=false;
    if(field.type==='number')valid=Number.isInteger(value)&&value>=0&&value<=100000000;
    else if(field.type==='multi')valid=Array.isArray(value)&&value.length<=40&&new Set(value).size===value.length&&value.every(v=>options.includes(v))&&!(value.length>1&&value.some(v=>['Unknown','None'].includes(v)));
    else valid=typeof value==='string'&&value.length<=2000&&(!options.length||options.includes(value));
    if(field.type==='date'&&value)valid=valid&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    if(!valid)throw new Error('Invalid value for '+field.label);
    return [key,typeof value==='string'?value.trim()||null:value];
  }));
}
const recommended=[['organization','employees'],['organization','country'],['organization','workforce'],['organization','it_management'],['organization','cyber_insurance'],['technical','identity'],['technical','cloud'],['security','data_types']];
export function completeness(profile) {
  const missing=recommended.filter(([section,key])=>{const v=profile[section]?.[key];return v==null||v===''||v==='Unknown'||(Array.isArray(v)&&(!v.length||v.includes('Unknown')));});
  return {percent:Math.round((recommended.length-missing.length)/recommended.length*100),missing:missing.map(([s,k])=>catalog.sections[s].find(f=>f.id===k).label)};
}
export function applicabilityPrompts(profile, requirements) {
  return [['CUI','cmmc','CMMC'],['PHI / ePHI','hipaa','HIPAA']].filter(([data,key])=>profile.security?.data_types?.includes(data)&&requirements.some(r=>r.baseline_key===key&&r.applicability==='not_applicable')).map(([data,,name])=>`Review ${name} applicability: the profile indicates ${data} is handled, while this program is not applicable. This is a prompt for review, not a regulatory determination.`);
}
