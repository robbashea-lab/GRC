import {strToU8} from 'fflate';
import api from '@/lib/api';
import {buildCmmcWorkspace} from '@/lib/cmmcWorkspace';
import {buildCmmcExport} from '@/lib/cmmcExports';
import {validDay} from '@/lib/cmmcFiles/office';
import {recordUuid} from '@/lib/recordUuid';
import {stableJson} from '@/lib/stableJson';

const endpoint='/frameworks/cmmc/workbook';
const folder='07_CMMC-SSP-POAM-and-score/';
const names={ssp:'System-Security-Plan_working-draft.docx',poam:'Plan-of-action-and-milestones.xlsx',sprs:'SPRS-score.xlsx'};

function checkCurrent(signal,isCurrent) {
  if(signal?.aborted || !isCurrent())throw new Error('The selected report workspace changed.');
}

async function materialStamp(packet,asOf) {
  const bytes=await crypto.subtle.digest('SHA-256',strToU8(stableJson([asOf,packet])));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function checkScope(packet,clientId) {
  const level=packet?.data?.configuration?.level;
  if(!clientId || packet?.client?.client_id!==clientId || packet?.records?.client_id!==clientId || ![1,2].includes(level) || packet.records.level!==level)
    throw new Error('The CMMC workbook could not be verified for this client.');
  return level;
}

export async function loadCmmcPackageMaterials({clientId,frameworkKey,asOf,signal,isCurrent}) {
  if(frameworkKey!=='cmmc')return null;
  checkCurrent(signal,isCurrent);
  if(!validDay(asOf))throw new Error('The CMMC package reporting date is invalid.');
  const {data}=await api.get(endpoint,{params:{client_id:clientId},signal});
  checkCurrent(signal,isCurrent);
  if(checkScope(data,clientId)===1)return null;
  const stamp=await materialStamp(data,asOf);
  checkCurrent(signal,isCurrent);
  return {clientId,level:2,asOf,preparedAt:new Date().toISOString(),materialStamp:stamp,files:Object.values(names).map(name=>({path:folder+name}))};
}

export async function buildCmmcPackageFiles(materials,{signal,isCurrent}) {
  if(!materials)return {};
  const {clientId,asOf}=materials, entries={};
  const preparedAt=new Date(materials.preparedAt);
  if(materials.level!==2 || !validDay(asOf) || !Number.isFinite(preparedAt.valueOf()))throw new Error('Reopen the Level 2 audit package.');
  // Each file uses the same export authorization and audit as its dedicated workbook tab.
  // A changed source invalidates the complete package, including already prepared entries.
  for(const [kind,name] of Object.entries(names)) {
    checkCurrent(signal,isCurrent);
    const {data}=await api.post(endpoint+'/export',{client_id:clientId,level:2,kind,request_id:recordUuid()},{signal});
    checkCurrent(signal,isCurrent);
    if(checkScope(data,clientId)!==2 || await materialStamp(data,asOf)!==materials.materialStamp)
      throw new Error('The saved CMMC workbook changed. Refresh the package before downloading.');
    checkCurrent(signal,isCurrent);
    const model=buildCmmcWorkspace(data.data,data.records,data.client);
    const output=await buildCmmcExport(kind,model,preparedAt);
    checkCurrent(signal,isCurrent);
    entries[folder+name]=output.bytes;
  }
  return entries;
}
