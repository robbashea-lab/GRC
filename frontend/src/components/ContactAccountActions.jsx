import { useEffect, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { invitationFeedback } from '@/lib/invitationFeedback';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { toast } from 'sonner';

export default function ContactAccountActions({ contact, onChanged }) {
  const [mode, setMode] = useState(null), [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]), [candidate, setCandidate] = useState('');
  const [role, setRole] = useState('client_readonly'), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    if (mode !== 'link') return;
    const abort = new AbortController();
    setLoading(true); setError(''); setCandidate(''); setCandidates([]);
    api.get(`/contacts/${contact.contact_id}/account-candidates`, { params: { search }, signal: abort.signal })
      .then(({ data }) => { if (!abort.signal.aborted) setCandidates(data.items); })
      .catch(e => { if (!abort.signal.aborted) setError(formatError(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [mode, search, contact.contact_id]);
  async function submit() {
    setSaving(true); setError('');
    try {
      const { data } = await api.post(`/contacts/${contact.contact_id}/${mode === 'invite' ? 'invite' : 'account-link'}`,
        mode === 'invite' ? { role, client_id: contact.client_id, confirmed: true } : { user_id: mode === 'unlink' ? null : candidate, confirmed: true });
      const linked = mode === 'invite' ? data.user.user_id : data.linked_user_id;
      toast.info(mode === 'invite' ? invitationFeedback(data) : 'Account association updated. Access is unchanged.');
      onChanged(linked); setMode(null);
    } catch (e) { setError(formatError(e)); }
    finally { setSaving(false); }
  }
  function begin(value) { setError(''); setSearch(''); setCandidate(''); setRole('client_readonly'); setMode(value); }
  return <div className="flex gap-2 flex-wrap" data-testid="contact-actions">
    {contact.linked_user_id
      ? <Button type="button" size="sm" variant="outline" onClick={() => begin('unlink')}>Unlink account</Button>
      : <><Button type="button" size="sm" variant="outline" onClick={() => begin('link')}>Link existing account</Button>
        <Button type="button" size="sm" variant="outline" disabled={!contact.email} onClick={() => begin('invite')} data-testid="contact-invite">Invite to Omnisciente</Button></>}
    <Dialog open={!!mode} onOpenChange={value => { if (!value && !saving) setMode(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{mode === 'invite' ? 'Invite to Omnisciente' : mode === 'unlink' ? 'Unlink account' : 'Link existing account'}</DialogTitle>
          <DialogDescription>{mode === 'invite' ? `Invite ${contact.name || contact.email} (${contact.email}) to this Contact’s client with the selected role. Business designations grant no additional permissions.` : 'This changes only the identity association. Client access, permissions, and historical attribution remain unchanged.'}</DialogDescription></DialogHeader>
        {mode === 'link' && <div className="space-y-3">
          <Label htmlFor="account-search">Search client-authorized accounts</Label>
          <Input id="account-search" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} />
          {loading ? <p role="status" className="text-sm">Loading accounts…</p> : candidates.length ?
            <Select value={candidate} onValueChange={setCandidate}><SelectTrigger aria-label="Existing account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
              <SelectContent>{candidates.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email} · {u.email}</SelectItem>)}</SelectContent></Select>
            : !error && <p className="text-sm text-ink-secondary">No eligible accounts found. Membership is managed separately in Users &amp; Access.</p>}
        </div>}
        {mode === 'invite' && <div className="space-y-2"><Label>Client access role</Label>
          <Select value={role} onValueChange={setRole}><SelectTrigger aria-label="Invitation role"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="client_readonly">Client Read Only</SelectItem><SelectItem value="client_contributor">Client Contributor</SelectItem>
          </SelectContent></Select></div>}
        {error && <p role="alert" className="text-sm text-semantic-critical">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setMode(null)}>Cancel</Button>
          <Button type="button" disabled={saving || mode === 'link' && (!candidate || loading)} onClick={submit}>{saving ? 'Saving…' : mode === 'invite' ? 'Confirm invitation' : mode === 'unlink' ? 'Confirm unlink' : 'Confirm link'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
