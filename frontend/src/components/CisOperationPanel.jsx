import {Input} from './ui/input';
import {EMPTY_OPERATION} from '@/lib/cisOperations';

export default function CisOperationPanel({form,definition,contacts=[],put,disabled}){
  const operation=form.cis_operation||EMPTY_OPERATION;
  return <details className="brawndo-disclosure" data-testid="cis-operation">
    <summary>Operational responsibility</summary>
    <div className="space-y-3 mt-3 text-sm">
      <fieldset disabled={disabled} className="space-y-3">
        <label className="block">Accountable business person<select className="block w-full border border-line bg-surface-card rounded p-2" aria-label="Accountable business person" value={form.process_owner_id||''} onChange={e=>put('process_owner_id',e.target.value||null)}><option value="">Use assessment Owner / not yet assigned</option>{contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}</select><span className="text-xs text-ink-secondary">Uses the existing Process Owner contact. Does not grant access. The assessment Owner can be accountable when no contact is selected.</span></label>
        <label className="block">Provider involvement<Input aria-label="Provider involvement" maxLength={2000} value={operation.provider} placeholder="Internal team, or provider and agreed responsibility" onChange={e=>put('cis_operation',{...operation,provider:e.target.value,confirmed:false})}/></label>
      </fieldset>
      {operation.confirmed&&<p className="text-xs text-ink-secondary">Previously recorded arrangement confirmation retained. This is not an implementation or verification conclusion.</p>}
    </div>
  </details>;
}
