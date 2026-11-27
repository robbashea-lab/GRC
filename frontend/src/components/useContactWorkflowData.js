import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';

// Key each response to the actor, client and record so switching cannot expose stale data.
export default function useContactWorkflowData({enabled,user,clientId,contact,revision}) {
  const [result,setResult]=useState(null);
  const id=contact?.contact_id,linkedId=contact?.linked_user_id;
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController(),scope={user,clientId,id,linkedId,revision};
    setResult({...scope,status:'loading'});
    const get=path=>api.get(path,{signal:abort.signal}).then(response=>response.data);
    Promise.all([
      get(`/clients/${clientId}`),
      ['super_admin','platform_admin'].includes(user?.role)?get('/users'):Promise.resolve([]),
      id?get(`/contacts/${id}/activity`):Promise.resolve([]),
      linkedId&&['super_admin','platform_admin'].includes(user?.role)
        ?get(`/users/${linkedId}/open_assignments?client_id=${encodeURIComponent(clientId)}`)
        :Promise.resolve(linkedId?null:{total:0,items:[],truncated:false}),
    ]).then(([client,users,events,owns])=>{
      if(client?.client_id!==clientId||!Array.isArray(users)||!Array.isArray(events)||events.some(event=>event.entity_id!==id||event.client_id&&event.client_id!==clientId)
        ||owns&&(!Number.isInteger(owns.total)||owns.total<0||!Array.isArray(owns.items)||owns.items.some(item=>item.client_id!==clientId)))throw new Error('Contact context could not be verified for this client.');
      if(!abort.signal.aborted)setResult({...scope,status:'ready',client,account:users.find(account=>account.user_id===linkedId),events,owns});
    }).catch(error=>{if(!abort.signal.aborted)setResult({...scope,status:'error',error:formatError(error)});});
    return()=>abort.abort();
  },[enabled,user,clientId,id,linkedId,revision]);
  return enabled&&result?.user===user&&result.clientId===clientId&&result.id===id&&result.linkedId===linkedId&&result.revision===revision
    ?result:{status:'loading'};
}
