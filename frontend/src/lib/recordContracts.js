import aliases from '@catalogs/recordAliases.json';

export function normalizeRecordWrite(kind,body,existing={}){
  const result={...body};
  for(const [alias,canonical] of Object.entries(aliases[kind]||{})){
    if(Object.prototype.hasOwnProperty.call(result,alias)){
      if(Object.prototype.hasOwnProperty.call(result,canonical)&&result[canonical]!==result[alias])throw Object.assign(new Error(`Conflicting values for ${canonical} and legacy ${alias}`),{status:422});
      result[canonical]=result[alias];delete result[alias];
    }
    // Clearing a canonical field must not revive its retained legacy alias.
    if(Object.prototype.hasOwnProperty.call(result,canonical)&&Object.prototype.hasOwnProperty.call(existing||{},alias))result[alias]=result[canonical];
  }
  return result;
}
