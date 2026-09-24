import {useState} from 'react';
import api,{PREVIEW_MODE,formatError} from '@/lib/api';
import {DEMO_FILE_NOTICE} from '@/lib/demoStorageErrors';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
export default function DemoNotice(){
  const [action,setAction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stats,setStats]=useState(null);
  if(!PREVIEW_MODE)return null;
  async function inspect(){setAction('storage');setError('');setStats(null);try{const {data}=await api.get('/demo/storage');setStats(data);}catch(e){setError(formatError(e));}}
  async function recover(){setBusy(true);setError('');try{
    await api.post(action==='clear'?'/demo/clear-evidence-files':'/demo/reset');
    if(action==='reset'){try{localStorage.removeItem('grc_client_id');}catch{}window.location.assign('/clients');}
    else window.location.reload();
  }catch(e){setError(formatError(e));setBusy(false);}}
  return <><div className="demo-notice border-b border-line bg-surface-subtle text-ink-muted" data-testid="interactive-demo-notice">
    <span><span className="font-medium">Demo workspace</span><span className="demo-notice-detail"> · Session changes only · Large file content lasts until reload</span></span>
    <Button size="sm" variant="ghost" onClick={inspect}>Demo storage</Button>
  </div><Dialog open={!!action} onOpenChange={v=>{if(!v&&!busy)setAction('');}}><DialogContent><DialogHeader>
    <DialogTitle>{action==='clear'?'Clear Demo Evidence Files?':action==='reset'?'Reset Demo Data?':'Demo storage & recovery'}</DialogTitle>
    <DialogDescription>{action==='clear'?'Remove all Demo file contents, including synthetic files and the temporary memory cache. Keep evidence metadata, relationships, clients, simulated users, roles, permissions, assessments and other records.':action==='reset'?'Replace all mutable Demo records with the canonical sample clients, users, roles, memberships, framework configuration and sample evidence. Custom Demo records and uploads will be removed. Non-demo data is untouched.':DEMO_FILE_NOTICE}</DialogDescription>
  </DialogHeader>{error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}
  {action==='storage'&&<><p className="text-xs text-ink-secondary">Session storage is shared by Demo records and retained small files. Estimates count UTF-16 characters and are advisory, not the browser’s actual quota. No IndexedDB or persistent blob store is used.</p>{stats&&<dl className="text-sm space-y-1">{Object.entries(stats).map(([key,value])=><div className="flex justify-between gap-3" key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{value??'None'}</dd></div>)}</dl>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setAction('clear');setError('');}}>Clear Demo Evidence Files</Button><Button variant="outline" onClick={()=>{setAction('reset');setError('');}}>Reset Demo Data</Button></div></>}
  {action!=='storage'&&<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setAction('storage')}>Cancel</Button><Button disabled={busy} onClick={recover}>{busy?'Working…':action==='clear'?'Clear Demo Evidence Files':'Reset Demo Data'}</Button></DialogFooter>}
  </DialogContent></Dialog></>;
}
