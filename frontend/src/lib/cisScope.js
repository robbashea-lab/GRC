import cis from '@catalogs/cisIG1.json';
export const cisAvailableGroups=()=>cis.available_implementation_groups;
export const cisScopeCounts={1:56,2:130,3:153};
// Scope is client configuration; assessment IDs stay in the original CIS namespace.
export const cisConfiguration=client=>({implementation_group:1,...client?.framework_settings?.['cis-ig1'],expected_updated_at:client?.cis_configuration_updated_at??null});
export const cisLabel=configuration=>`CIS IG${configuration?.implementation_group||1}`;
export const cisProgramName=(framework,configuration)=>framework.key==='cis-ig1'?`CIS Controls v${cis.version} IG${configuration?.implementation_group||1}`:framework.name;
export const cisScopeLabel=definition=>definition.implementation_group>1?`Added in IG${definition.implementation_group}`:'IG1 baseline';
export function validateCisSettings(settings={}){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(k=>k!=='cis-ig1'))throw new Error('Invalid onboarding framework settings');
  const cis=Object.hasOwn(settings,'cis-ig1')?settings['cis-ig1']:{};
  if(!cis||typeof cis!=='object'||Array.isArray(cis)||Object.keys(cis).some(k=>k!=='implementation_group')||('implementation_group' in cis&&!cisAvailableGroups().includes(cis.implementation_group)))throw new Error('CIS implementation group is not available');
}
export function validateCisConfiguration(body){
  if(Object.keys(body).some(k=>!['client_id','implementation_group','expected_updated_at','confirm_reduction','reason','effective_date'].includes(k)))throw new Error('Invalid CIS configuration fields');
  validateCisSettings({'cis-ig1':{implementation_group:body.implementation_group}});
  if(body.confirm_reduction!==undefined&&typeof body.confirm_reduction!=='boolean')throw new Error('Invalid reduction confirmation');
  if(Object.hasOwn(body,'reason')&&(typeof body.reason!=='string'||body.reason.length>2000))throw new Error('Invalid scope reason');
  if(Object.hasOwn(body,'expected_updated_at')&&body.expected_updated_at!==null&&(typeof body.expected_updated_at!=='string'||body.expected_updated_at.length>100))throw new Error('Invalid edit version');
  if(Object.hasOwn(body,'effective_date')&&typeof body.effective_date!=='string')throw new Error('Invalid effective date');
  if(body.effective_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.effective_date)||new Date(body.effective_date).toISOString().slice(0,10)!==body.effective_date||body.effective_date>new Date().toISOString().slice(0,10)))throw new Error('Use an effective date on or before today');
  return {implementation_group:body.implementation_group};
}
