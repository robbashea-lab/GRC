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
  return <><div className="flex items-center justify-between gap-3 px-8 py-2 border-b border-line bg-surface-subtle text-xs text-ink-muted" data-testid="interactive-demo-notice"><span>Interactive demo: changes are temporary for this browser session. Reset Demo restores the sample data. Invitations and notifications are simulated.</span><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Reset Demo</Button></div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Reset Demo?</DialogTitle><DialogDescription>This removes all temporary clients, records, uploaded files, and onboarding progress from this browser session and restores the original sample data.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={reset} disabled={busy}>Reset Demo</Button></DialogFooter></DialogContent></Dialog></>;
}
