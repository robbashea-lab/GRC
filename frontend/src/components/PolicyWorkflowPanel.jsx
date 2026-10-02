import {Button} from './ui/button';
import {ShieldCheck} from 'lucide-react';
import StatusBadge from './StatusBadge';
import PolicyApprovalPanel from './PolicyApprovalPanel';

export default function PolicyWorkflowPanel({record,form,policyPilot,isPlatformAdmin,canWrite,formDirty,approvalDirty,onDraftChange,onVerify,onChanged}) {
  if (!record) return null;
  const status = form.status || record.status;
  const presence = form.presence || record?.presence;
  const canVerify = isPlatformAdmin && presence && presence !== "verified_existing" && presence !== "not_applicable";
  return (
    <div className="border border-line bg-surface-subtle rounded-md p-3 space-y-2">
      {!policyPilot&&<div className="flex items-center justify-between">
        <div className="text-sm text-ink-primary">Approval workflow</div>
        <div className="flex items-center gap-1.5">
          {presence && <StatusBadge value={presence} />}
          <StatusBadge value={status || "draft"} />
        </div>
      </div>}
      {canVerify && (
        <div className="flex items-center justify-between border-t border-line pt-2">
          <div className="text-xs text-ink-secondary">Confirm the document and record verified metadata.</div>
          <Button size="sm" disabled={policyPilot&&(formDirty||approvalDirty)} onClick={onVerify} data-testid="policy-verify" className="bg-primary hover:bg-primary/90">
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verify policy
          </Button>
        </div>
      )}
      {policyPilot&&formDirty&&<p className="text-xs text-ink-secondary">Save Policy edits before changing its approval record.</p>}
      <fieldset disabled={policyPilot&&(formDirty||!canWrite)}><PolicyApprovalPanel compact={policyPilot} onDraftChange={policyPilot?onDraftChange:undefined} record={record} onChanged={onChanged}/></fieldset>
    </div>
  );
}
