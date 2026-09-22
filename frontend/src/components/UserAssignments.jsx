import { useEffect, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import RecordDrawer from './RecordDrawer';

export default function UserAssignments({ account, clientId, onClose }) {
  const [result, setResult] = useState(null), [error, setError] = useState('');
  const [selected, setSelected] = useState(null), [opening, setOpening] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setResult(null); setError(''); setSelected(null);
    api.get(`/users/${account.user_id}/open_assignments`, { params: clientId ? { client_id: clientId } : {}, signal: abort.signal })
      .then(({ data }) => { if (!abort.signal.aborted) setResult(data); })
      .catch(e => { if (!abort.signal.aborted) setError(formatError(e)); });
    return () => abort.abort();
  }, [account.user_id, clientId, revision]);
  async function openRecord(item) {
    setOpening(true); setError('');
    try {
      const [response, members] = await Promise.all([api.get(`/${item.kind}/${item.id}`), api.get(`/clients/${item.client_id}/members`)]);
      if (response.data.client_id !== item.client_id) throw new Error('Record belongs to another client');
      setSelected({ kind: item.kind, record: response.data, users: members.data });
    } catch (e) { setError(formatError(e)); }
    finally { setOpening(false); }
  }
  return <>
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="sm:max-w-xl overflow-y-auto">
      <SheetHeader><SheetTitle>Active assignments · {account.name || account.email}</SheetTitle></SheetHeader>
      <p className="text-sm text-ink-secondary mt-3">Existing ownership is retained. Open a record to review or deliberately reassign it using eligible candidates. Historical attribution is unchanged.</p>
      {error && <p role="alert" className="text-sm text-semantic-critical mt-3">{error}</p>}
      {!result && !error && <p role="status">Loading assignments…</p>}
      {result && <div className="mt-4 space-y-3"><p className="text-sm font-medium">{result.total} active assignments in your authorized scope</p>
        {!result.total && <p className="text-sm text-ink-secondary">No active assignments found.</p>}
        {result.truncated && <p className="text-xs text-ink-secondary">Showing up to 100 records per module. Use the source registers for the remainder.</p>}
        {result.items.map(item => <div key={`${item.kind}:${item.id}`} className="border-b border-line pb-2">
          <Button variant="link" className="p-0 h-auto text-left whitespace-normal" disabled={opening} onClick={() => openRecord(item)}>{item.title}</Button>
          <p className="text-xs text-ink-secondary">{item.kind.replaceAll('_', ' ')} · {item.status?.replaceAll('_', ' ')}{item.due_date ? ` · Due ${item.due_date.slice(0, 10)}` : ''}</p>
        </div>)}
      </div>}
    </SheetContent></Sheet>
    {selected && <RecordDrawer open {...selected} clientId={selected.record.client_id} onSaved={() => setRevision(value => value + 1)} onOpenChange={open => { if (!open) setSelected(null); }} />}
  </>;
}
