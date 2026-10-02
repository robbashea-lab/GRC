import {previewAdapter as rawPreviewAdapter} from './adapter';

let nextIntent=0;
// Existing workflow tests model fresh form submissions. Tests of the transport
// contract use the raw adapter and explicitly retain or omit request identity.
export async function previewAdapter(config){
  const body=typeof config.data==='string'?JSON.parse(config.data||'{}'):(config.data||{});
  if(config.method==='post'&&config.url==='/onboarding/baseline'){
    const current=await rawPreviewAdapter({...config,method:'get',data:undefined,params:{client_id:body.client_id}});
    if(!Object.prototype.hasOwnProperty.call(body,'expected_updated_at'))body.expected_updated_at=current.data.state.updated_at??null;
    if(body.finalize&&!Object.prototype.hasOwnProperty.call(body,'expected_records'))body.expected_records=current.data.record_versions;
  }
  if(config.method==='post'&&(config.url==='/onboarding/finalize'||config.url==='/onboarding/baseline'&&body.finalize)){
    config.headers||={};
    if(!config.headers['Idempotency-Key'])config.headers['Idempotency-Key']=`test-onboarding-${++nextIntent}`;
  }
  if(config.method==='post'&&/^\/reviews\/[^/]+\/create-finding$/.test(config.url)&&!Object.prototype.hasOwnProperty.call(body,'request_id'))body.request_id=`test-review-command-${++nextIntent}`;
  if(config.method==='post')config.data=JSON.stringify(body);
  return rawPreviewAdapter(config);
}
