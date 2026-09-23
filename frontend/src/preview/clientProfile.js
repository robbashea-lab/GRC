import {record,audit,clone} from './store';
import {frameworkScope} from './frameworks';
import {validateProfile,recordedBaseline} from '../lib/clientProfile';
export function clientProfileRequest(db,cid,method,body) {
  frameworkScope(db,cid);
  const client=record(db,'clients',cid), saved=db.baselines?.[cid];
  const baseline=recordedBaseline(client,saved,db.logs);
  if(method==='get')return {client_id:cid,profile:client.profile||{},updated_at:client.updated_at??null,completed:!!baseline,
    baseline:clone(baseline),
    history:db.logs.filter(l=>l.client_id===cid&&(['client-profile-updated','program-applicability-updated'].includes(l.action)||(l.action==='update'&&l.entity_type==='clients'))).slice(0,50).map(({action,at,user_name,meta})=>({action,at,user_name,meta}))};
  if(method!=='patch'||!['super_admin','platform_admin'].includes(db.user.role))throw new Error('Forbidden for this client');
  if(Object.keys(body).some(k=>!['section','values','expected_updated_at'].includes(k)))throw new Error('Invalid profile field');
  if(!Object.prototype.hasOwnProperty.call(body,'expected_updated_at')||body.expected_updated_at!==(client.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
  const values=validateProfile(body.section,body.values),old=client.profile?.[body.section]||{};
  const changes=Object.fromEntries(Object.entries(values).filter(([k,v])=>JSON.stringify(old[k]??null)!==JSON.stringify(v)).map(([k,v])=>[k,{before:old[k]??null,after:v}]));
  if(Object.keys(changes).length){
    client.profile={...client.profile,[body.section]:{...old,...values}};
    client.updated_at=new Date(Math.max(Date.now(),(Date.parse(client.updated_at)||0)+1)).toISOString();
    audit(db,'client-profile-updated','clients',client,{section:body.section,changes});
  }
  return {ok:true};
}
