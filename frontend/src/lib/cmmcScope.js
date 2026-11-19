export const cmmcConfiguration=client=>({level:2,...client?.framework_settings?.cmmc,expected_updated_at:client?.cmmc_configuration_updated_at??null});
export function validateCmmcSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='level')||Object.hasOwn(value,'level')&&![1,2].includes(value.level))throw new Error('Choose CMMC Level 1 or Level 2');
}
export function validateCmmcConfiguration(body){
  if(Object.keys(body).some(key=>!['client_id','level','expected_updated_at','confirm_reduction','reason','effective_date'].includes(key)))throw new Error('Invalid CMMC configuration fields');
  validateCmmcSettings({level:body.level});
  if(body.confirm_reduction!==undefined&&typeof body.confirm_reduction!=='boolean')throw new Error('Invalid scope confirmation');
  if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>2000))throw new Error('Invalid scope reason');
  if(body.expected_updated_at!=null&&(typeof body.expected_updated_at!=='string'||body.expected_updated_at.length>100))throw new Error('Invalid edit version');
  if(body.effective_date!==undefined&&(typeof body.effective_date!=='string'||body.effective_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.effective_date)||new Date(body.effective_date).toISOString().slice(0,10)!==body.effective_date||body.effective_date>new Date().toISOString().slice(0,10))))throw new Error('Use an effective date on or before today');
  return {level:body.level};
}
export const cmmcRequirementPresentation=(definition,configuration)=>configuration?.level===1&&definition.level_one_parent?{
  id:`FAR (${definition.level_one_parent})`,practice:`${definition.family}.L1-b.1.${definition.level_one_parent}`,
  title:definition.level_one_summary,text:definition.level_one_summary,source:definition.level_one_source,
  qualification:'Mapped child check for a FAR/FCI parent, not a separate official requirement. The 17 checks represent 15 parent requirements; a parent is not established by one child result alone. Retained answers need a scope check when moving between FCI and CUI.'
}:{id:definition.id,practice:`${definition.family}.L2-${definition.id}`,title:definition.title,text:definition.source_text,source:definition.source,
  qualification:'NIST SP 800-171 Rev 2 main statement. Read the complete source, footnotes and assessment procedures; internal readiness is not a weighted score, CMMC Status or certification.'};
