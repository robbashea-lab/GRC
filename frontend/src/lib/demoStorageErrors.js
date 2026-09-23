export const DEMO_FILE_LIMIT=1024*1024;
export const DEMO_INLINE_LIMIT=16*1024;
export const DEMO_FILE_NOTICE='Demo files up to 16 KB are retained within a shared 256 KB payload budget. Other files (maximum 1 MB each) use an 8 MB temporary memory cache and may be unavailable after reload or eviction. Metadata and relationships remain. Clear Demo Evidence Files preserves records and people.';
const MESSAGES={
  QUOTA_EXCEEDED:'Demo browser storage is full. Clear Demo Evidence Files or Reset Demo Data. Changes were not saved.',
  STORAGE_UNAVAILABLE:'Browser storage is unavailable in this session. Allow site storage or use another browser session. Changes were not saved.',
  FILE_TOO_LARGE:'This file is too large for Demo Mode. Use a sample file no larger than 1 MB. No evidence record was created.',
  WRITE_FAILED:'Demo data could not be saved. Changes were not saved.',
  UNKNOWN_STORAGE_ERROR:'An unexpected Demo storage error occurred. Changes were not saved. Open Demo storage diagnostics for recovery options.',
};
let lastError=null;
export const lastStorageError=()=>lastError;
export function demoStorageError(error,operation='write'){
  const code=error?.storage_code||(['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name)?'QUOTA_EXCEEDED':['SecurityError','NotAllowedError'].includes(error?.name)?'STORAGE_UNAVAILABLE':operation==='write'?'WRITE_FAILED':'UNKNOWN_STORAGE_ERROR');
  lastError=code;
  if(process.env.NODE_ENV==='development')console.warn('Demo storage failure',{code,operation});
  return Object.assign(new Error(MESSAGES[code]||MESSAGES.UNKNOWN_STORAGE_ERROR),{storage_code:code});
}
export function checkDemoFileSize(size){if(size>DEMO_FILE_LIMIT)throw demoStorageError({storage_code:'FILE_TOO_LARGE'},'upload');}
