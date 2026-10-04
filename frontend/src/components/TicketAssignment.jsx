import AssigneeSelect from './AssigneeSelect';
import {Input} from './ui/input';
export default function TicketAssignment({clientId,users,finding,setFinding,defaultOwner,disabled}){
  return <div className="grid sm:grid-cols-2 gap-3"><div>Owner (optional)<AssigneeSelect label="Finding owner" clientId={clientId} users={users||[]} value={finding.owner_id===undefined?defaultOwner:finding.owner_id} disabled={disabled} onChange={id=>setFinding(f=>({...f,owner_id:id||null}))}/></div><label>Due date (optional)<Input aria-label="Finding target date" type="date" value={finding.due_date||''} disabled={disabled} onChange={e=>setFinding(f=>({...f,due_date:e.target.value||null}))}/></label></div>;
}
