import { useState } from 'react';
import api, { PREVIEW_MODE, formatError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
export default function DemoNotice() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  if (!PREVIEW_MODE) return null;
  async function reset() {
    setBusy(true);
    try {
      await api.post('/demo/reset');
      localStorage.removeItem('grc_client_id');
      window.location.assign('/clients');
    } catch (e) {
      toast.error(formatError(e));
      setBusy(false);
    }
  }
  return <>
    <div className="demo-notice border-b border-line bg-surface-subtle text-ink-muted" data-testid="interactive-demo-notice">
      <span><span className="font-medium">Demo workspace</span><span className="demo-notice-detail"> · Session changes only · Invitations and notifications simulated</span></span>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Reset sample data</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset sample data?</DialogTitle><DialogDescription>This removes all temporary clients, records, uploaded files, and onboarding progress from this browser session and restores the original sample data. Invitations and notifications in this demo are simulated.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={reset} disabled={busy}>{busy ? "Resetting…" : "Reset sample data"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
