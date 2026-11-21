import {policyStatus,policyStatusLabel} from '@/lib/brawndoPolicies';
import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import './AssessmentClientContext.css';

// Policy relationships stage with the existing assessment form and its revision-checked Save.
export default function AssessmentPolicyLinks({record,value,related=[],disabled,onChange}) {
  const [options,setOptions]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const scope=useRef(null),identity=JSON.stringify([record.client_id,record.framework_assessment_id]);
  if(scope.current?.identity!==identity)scope.current={identity};
  const owner=scope.current;
  useEffect(()=>{scope.current=owner;setOptions(null);setError('');setBusy(false);return()=>{if(scope.current===owner)scope.current=null;};},[owner]);
  const selected=Array.isArray(value)?value:related.map(policy=>policy.policy_id);
  const policies=[...new Map([...(options||[]),...related].filter(policy=>policy.client_id===record.client_id)
    .map(policy=>[policy.policy_id,policy])).values()];
  async function load(event) {
    if(!event.currentTarget.open||options||busy||disabled)return;
    const clientId=record.client_id,active=scope.current;
    setBusy(true);setError('');
    try {
      const {data}=await api.get('/policies',{params:{client_id:clientId}});
      if(!Array.isArray(data)||data.some(policy=>policy.client_id!==clientId||typeof policy.policy_id!=='string'))
        throw new Error('Current policies could not be verified for this client.');
      if(scope.current===active)setOptions(data);
    } catch(error){if(scope.current===active)setError(formatError(error));} finally {if(scope.current===active)setBusy(false);}
  }
  return <details className="gn-policy-links" onToggle={load}>
    <summary>Policy relationships</summary>
    <p>{Array.isArray(value)?'Explicit policy selection':'Current mapped policies'}. Changes stage in this assessment; Save assessment commits them. Clearing the list deliberately removes all current policy relationships for this item.</p>
    {busy&&<p role="status">Loading current client policies.</p>}{error&&<p role="alert">{error}</p>}
    <fieldset disabled={disabled||busy||!!error}><legend className="sr-only">Policies for this assessment</legend>
      {policies.map(policy=><label key={policy.policy_id}><input type="checkbox" checked={selected.includes(policy.policy_id)} onChange={event=>onChange(event.target.checked?[...selected,policy.policy_id]:selected.filter(id=>id!==policy.policy_id))}/><span>{policy.title||policy.name}<small className="gn-guidance-meta">{[policy.version&&'Version '+policy.version,policyStatusLabel(policyStatus(policy))].filter(Boolean).join(' · ')}</small></span></label>)}
      {!policies.length&&!busy&&<p>No current mapped policies.</p>}
      <Button type="button" variant="outline" disabled={disabled||busy||!!error} onClick={()=>onChange([])}>Clear policy relationships</Button>
    </fieldset>
    <p>Policy existence, version and status remain independent of this assessment and of approval.</p>
  </details>;
}