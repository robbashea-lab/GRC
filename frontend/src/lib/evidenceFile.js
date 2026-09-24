import {PREVIEW_MODE} from './api';
import {checkDemoFileSize,DEMO_INLINE_LIMIT} from './demoStorageErrors';
import {toast} from 'sonner';
export function readEvidenceFile(file){
  if(PREVIEW_MODE){try{checkDemoFileSize(file.size);}catch(error){return Promise.reject(error);}}
  if(PREVIEW_MODE&&file.size>DEMO_INLINE_LIMIT)toast.info('Demo Mode will retain the evidence metadata. File content is temporary and will be unavailable after reload or clearing.');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The selected file could not be read.'));reader.readAsDataURL(file);});
}
