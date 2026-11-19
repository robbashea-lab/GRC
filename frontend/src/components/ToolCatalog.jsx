import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { formatError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCreateIntent } from '@/lib/createIntent';
import {recordUuid} from '@/lib/recordUuid';
import {clientDestination} from '@/lib/clientSelection';
import { serviceCatalog, copy } from '@/lib/r4ServicesTools';
import { ToolDetails, ToolSources } from './ServicesTools';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
const groups = [['iv', 'iVenture standard'], ['ivx', 'iVenture add-on service'], ['org', 'Added to the catalog']];
const editableKeys = ['tool_id', 'name', 'vendor', 'category', 'area_ids', 'description', 'product_reference', 'source_references', 'capabilities', 'gaps', 'possible_records', 'verification_hints', 'to_confirm', 'retired'];
const toolInput = tool => Object.fromEntries(editableKeys.filter(k => tool[k] !== undefined).map(k => [k, tool[k]]));
function verifiedUsage(data, toolId, version, user) {
  const text = value => typeof value === 'string' && !!value.trim();
  const token = value => value === null || text(value);
  const optionalText = value => value == null || typeof value === 'string';
  const clients = data?.clients;
  if (data?.tool_id !== toolId || data.expected_updated_at !== version || data.scope !== 'authorized_clients'
      || !Array.isArray(clients) || !Number.isSafeInteger(data.client_count) || data.client_count !== clients.length
      || !Number.isSafeInteger(data.selection_count) || data.selection_count < 0
      || new Set(clients.map(client => client?.client_id)).size !== clients.length
      || clients.some(client => !client || !text(client.client_id) || !optionalText(client.name) || !optionalText(client.status)
        || !Object.hasOwn(client, 'expected_updated_at') || !token(client.expected_updated_at)
        || user?.role !== 'super_admin' && user?.all_clients !== true && !(user?.client_ids || []).includes(client.client_id)
        || !Array.isArray(client.areas) || !client.areas.length
        || new Set(client.areas.map(area => area?.area_id)).size !== client.areas.length
        || client.areas.some(area => !area || !text(area.area_id) || !text(area.name)))
      || data.selection_count !== clients.reduce((sum, client) => sum + client.areas.length, 0)) {
    throw new Error('Current tool usage could not be verified. Reload the catalog before replacing this tool.');
  }
  return data;
}
function ToolUsage({usage, error, onRetry}) {
  return <section className="tc-usage space-y-2 rounded-md border border-line bg-surface-subtle p-3 text-sm" aria-label="Where this tool is used">
    <h3 className="font-semibold">Where it’s used</h3>
    <p className="sub">Only current selections in clients you can access are shown, including retained archived clients. Replacement requires access to every affected client.</p>
    {error ? <p role="alert">Usage could not be loaded. Current selections are unknown. {error} <button type="button" className="link-btn" onClick={onRetry}>Retry usage</button></p>
      : !usage ? <p role="status">Loading current tool usage…</p>
      : <><p><b>{usage.client_count} authorized {usage.client_count === 1 ? 'client' : 'clients'}</b> · {usage.selection_count} service-area {usage.selection_count === 1 ? 'selection' : 'selections'}</p>
        {usage.clients.length ? <ul className="space-y-2">{usage.clients.map(client => <li key={client.client_id}>
          <Link className="link-btn" to={clientDestination(client.client_id, '/client-profile?tab=services')}>{client.name?.trim() || client.client_id}</Link>
          {!client.name?.trim() && <span className="sub ml-2">Name not recorded</span>}
          {client.status === 'archived' && <span className="mini-chip ml-2">Archived</span>}
          {!client.status?.trim() && <span className="sub ml-2">Status not recorded</span>}
          <p className="sub">{client.areas.map(area => area.name).join(' · ')}</p>
        </li>)}</ul> : <p>Not currently selected by any client in your authorized scope.</p>}</>}
  </section>;
}
export default function ToolCatalog() {
  const {
      user,
      workspaceMode
    } = useAuth(),
    [tools, setTools] = useState(null),
    [query, setQuery] = useState(''),
    [area, setArea] = useState('all'),
    [group, setGroup] = useState('all'),
    [selected, setSelected] = useState([]),
    [editing, setEditing] = useState(null),
    [original, setOriginal] = useState(null),
    [replacement, setReplacement] = useState(null),
    [replacementId, setReplacementId] = useState(''),
    [retire, setRetire] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [usageResult, setUsage] = useState(null),
    [usageFailure, setUsageFailure] = useState(null),
    [usageRevision, setUsageRevision] = useState(0);
  const editable = ['super_admin', 'platform_admin'].includes(user?.role),
    command = useCreateIntent(api.post, `${workspaceMode}:${user?.user_id}:r4-tool-catalog`, true);
  const unconfirmed = command.unconfirmed(), locked = busy || unconfirmed;
  const usageActorKey = JSON.stringify({id:user?.user_id, role:user?.role, status:user?.status,
    password_change_required:!!user?.password_change_required, all_clients:!!user?.all_clients,
    client_ids:user?.client_ids || [], mode:workspaceMode, workspace_mode:user?.workspace_mode});
  const usageActor = useMemo(() => JSON.parse(usageActorKey), [usageActorKey]);
  const inspectedTool = replacement || (editing && original), usageToolId = inspectedTool?.tool_id,
    usageVersion = inspectedTool?.updated_at ?? null,
    usageScope = inspectedTool ? JSON.stringify([usageToolId, usageVersion, usageActorKey]) : '';
  const activeUsageScope = useRef(usageScope); activeUsageScope.current = usageScope;
  const usage = usageResult?.scope === usageScope ? usageResult.data : null,
    usageError = usageFailure?.scope === usageScope ? usageFailure.message : '';
  useEffect(() => {
    setUsage(null); setUsageFailure(null);
    if (!usageToolId) return;
    const controller = new AbortController();
    api.get(`/tool-catalog/${encodeURIComponent(usageToolId)}/usage`, {signal:controller.signal}).then(({data}) => {
      if (controller.signal.aborted || activeUsageScope.current !== usageScope) return;
      setUsage({scope:usageScope, data:verifiedUsage(data, usageToolId, usageVersion, usageActor)});
    }).catch(failure => {
      if (!controller.signal.aborted && activeUsageScope.current === usageScope) setUsageFailure({scope:usageScope, message:formatError(failure)});
    });
    return () => controller.abort();
  }, [usageToolId, usageVersion, usageScope, usageActor, usageRevision]);
  const usagePanel = <ToolUsage usage={usage} error={usageError} onRetry={() => setUsageRevision(value => value + 1)}/>;
  const load = useCallback(async () => {
    const {
      data
    } = await api.get('/service-catalog');
    setTools(data.tools);
    return data.tools;
  }, []);
  useEffect(() => {
    let live = true;
    api.get('/service-catalog').then(({
      data
    }) => live && setTools(data.tools)).catch(e => live && setError(formatError(e)));
    return () => {
      live = false;
    };
  }, []);
  async function run(path, body, retry = false) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      // Only an explicit Retry recovers A; ordinary submissions retain the changed-request guard.
      if (retry) await command.retry();else await command(path, body);
      await load();
      setEditing(null);
      setReplacement(null);
      setSelected([]);
      return true;
    } catch (e) {
      setError(formatError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function edit(tool) {
    if(locked){setError('Finish the pending save before starting another edit.');return;}
    setOriginal(tool || null);
    setEditing(tool ? copy(tool) : {
      tool_id: 'org_' + recordUuid(),
      name: '',
      vendor: '',
      category: 'org',
      area_ids: ['endpoint'],
      description: '',
      retired: false
    });
    setError('');
  }
  function bulk(patch) {
    run('/tool-catalog/bulk', {
      tool_ids: selected,
      expected_versions: Object.fromEntries(selected.map(id => [id, tools.find(t => t.tool_id === id)?.updated_at ?? null])),
      ...patch
    });
  }
  const filtered = (tools || []).filter(t => (area === 'all' || t.area_ids.includes(area)) && (group === 'all' || group === 'retired' ? group === 'all' || t.retired : t.category === group) && [t.name, t.vendor, t.description, ...(t.source_references || [])].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-4"><div className="page-head"><div><div className="eyebrow">ADMINISTRATION</div><h1 className="page-title">Tool Catalog</h1><p className="page-sub">Tools iVenture deploys, manages or sells. Client-owned tools are added per client in Services &amp; Tools.</p></div>{editable && <button type="button" className="cta" disabled={locked} onClick={() => edit(null)}>Add tool</button>}</div><p className="callout">Supplied reference snapshot of iVenture’s ConnectWise product catalog and active agreement additions (Nov 18, 2026). Agreement counts show how widely a line is sold, not deployment. Items marked To confirm are inferences to verify.</p>{error && <p role="alert">{error}</p>}{unconfirmed&&<button type="button" className="cta" disabled={busy} onClick={()=>run('',{},true)}>Retry unconfirmed save</button>}<section className="panel"><div className="toolbar"><input className="input" aria-label="Search tools" placeholder="Search tools, vendors or ConnectWise items" value={query} onChange={e => setQuery(e.target.value)} /><div className="tabs">{[['all', 'All tools'], ...groups, ['retired', 'Retired']].map(([id, label]) => <button type="button" className="tab" aria-pressed={group === id} key={id} onClick={() => setGroup(id)}>{label}</button>)}</div><label className="sr-only" htmlFor="r4-tool-area">Service area</label><select id="r4-tool-area" className="select" value={area} onChange={e => setArea(e.target.value)}><option value="all">All service areas</option>{serviceCatalog.areas.filter(a => a.id !== 'governance').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
    {!!selected.length && editable && <div className="toolbar" aria-label="Bulk changes"><b>{selected.length} tools selected</b><select className="select" aria-label="Change selected tool category" value="" onChange={e => e.target.value && bulk({
          category: e.target.value
        })} disabled={locked}><option value="">Change category…</option>{groups.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="select" aria-label="Add selected tool service area" value="" onChange={e => e.target.value && bulk({
          add_area_id: e.target.value
        })} disabled={locked}><option value="">Add a service area…</option>{serviceCatalog.areas.filter(a => a.id !== 'governance').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="ghost" type="button" disabled={locked} onClick={() => bulk({
          retired: true
        })}>Retire</button><button className="ghost" type="button" disabled={locked} onClick={() => bulk({
          retired: false
        })}>Restore</button><button className="link-btn" type="button" disabled={locked} onClick={() => setSelected([])}>Clear selection</button></div>}
    {tools === null ? <p>Loading tools…</p> : !filtered.length ? <p className="empty">No tools match.</p> : serviceCatalog.areas.filter(a => a.id !== 'governance').map(a => {
        const rows = filtered.filter(t => t.area_ids[0] === a.id || area !== 'all' && t.area_ids.includes(a.id));
        return rows.length ? <div key={a.id} className="space-y-3"><h2 className="panel-title">{a.name}</h2><div className="tc-grid">{rows.map(t => <article className="tc-card" key={t.tool_id}><div className="tc-top">{editable && <input type="checkbox" aria-label={'Select ' + t.name + ' for bulk changes'} checked={selected.includes(t.tool_id)} disabled={locked} onChange={e => setSelected(e.target.checked ? [...selected, t.tool_id] : selected.filter(id => id !== t.tool_id))} />}<button className="link-btn" type="button" disabled={editable && locked} onClick={() => edit(t)}>{t.name}</button>{t.retired && <span className="mini-chip">Retired</span>}</div><p className="sub">{t.vendor} · {groups.find(([id]) => id === t.category)?.[1]}</p><p>{t.description || 'No description yet.'}</p><div className="chip-row">{t.area_ids.map(id => <span className="mini-chip" key={id}>{serviceCatalog.areas.find(s => s.id === id)?.name}</span>)}</div><button className="link-btn" type="button" disabled={editable && locked} onClick={() => edit(t)}>{editable ? 'Change ›' : 'View details ›'}</button></article>)}</div></div> : null;
      })}</section>
    <Dialog open={!!editing} onOpenChange={open => !open && !locked && setEditing(null)}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{original ? original.name : 'Add tool to the catalog'}</DialogTitle><DialogDescription>Saved answers and completed Reviews retain the tool context recorded at the time.</DialogDescription></DialogHeader>{editing && <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          run('/tool-catalog/save', {
            expected_updated_at: original?.updated_at ?? null,
            tool: toolInput(editing)
          });
        }}>{error && <p role="alert">{error}</p>}{original ? usagePanel : <p className="sub">Save this catalog entry before inspecting its client selections.</p>}{!editable ? <ToolDetails tool={editing} /> : <><label className="block">Tool name<input className="input w-full" disabled={locked} required maxLength={255} value={editing.name} onChange={e => setEditing({
                ...editing,
                name: e.target.value
              })} /></label><label className="block">Vendor<input className="input w-full" disabled={locked} maxLength={255} value={editing.vendor || ''} onChange={e => setEditing({
                ...editing,
                vendor: e.target.value
              })} /></label><label className="block">Category<select className="select w-full" disabled={locked} value={editing.category} onChange={e => setEditing({
                ...editing,
                category: e.target.value
              })}>{groups.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="block">Primary service area<select className="select w-full" disabled={locked} value={editing.area_ids[0]} onChange={e => setEditing({
                ...editing,
                area_ids: [e.target.value, ...editing.area_ids.filter(id => id !== e.target.value)]
              })}>{serviceCatalog.areas.filter(a => a.id !== 'governance').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><fieldset><legend>Also listed under</legend><div className="grid grid-cols-2 gap-2">{serviceCatalog.areas.filter(a => a.id !== 'governance' && a.id !== editing.area_ids[0]).map(a => <label key={a.id}><input type="checkbox" disabled={locked} checked={editing.area_ids.includes(a.id)} onChange={e => setEditing({
                    ...editing,
                    area_ids: e.target.checked ? [...editing.area_ids, a.id] : editing.area_ids.filter(id => id !== a.id)
                  })} /> {a.name}</label>)}</div></fieldset>{[['description', 'What it covers'], ['capabilities', 'Typical capability examples · one per line'], ['gaps', 'Typically not covered · one per line'], ['possible_records', 'Possible records to request · one per line'], ['verification_hints', 'What to verify · one per line']].map(([key, label]) => <label className="block" key={key}>{label}<textarea className="input w-full" disabled={locked} rows={3} maxLength={key === 'description' ? 4000 : 20000} value={key === 'description' ? editing[key] || '' : (editing[key] || []).join('\n')} onChange={e => setEditing({
                ...editing,
                [key]: key === 'description' ? e.target.value : e.target.value.split('\n')
              })} /></label>)}<ToolSources tool={editing} /><label className="block">To confirm<input className="input w-full" disabled={locked} maxLength={2000} value={editing.to_confirm || ''} onChange={e => setEditing({
                ...editing,
                to_confirm: e.target.value
              })} /></label><label><input type="checkbox" disabled={locked} checked={editing.retired} onChange={e => setEditing({
                ...editing,
                retired: e.target.checked
            })} /> Retired: hide from new selections. Clients already using it keep it.</label></>}<DialogFooter>{editable && original && <button type="button" className="ghost" disabled={locked || !usage} onClick={() => {
              setReplacement(original);
              setReplacementId('');
              setRetire(true);
            }}>Replace everywhere</button>}<button type="button" className="ghost" disabled={locked} onClick={() => setEditing(null)}>Cancel</button>{editable && <button className="cta" type={unconfirmed ? 'button' : 'submit'} disabled={busy} onClick={unconfirmed ? () => run('',{},true) : undefined}>{busy ? 'Saving…' : unconfirmed ? 'Retry unconfirmed save' : 'Save changes'}</button>}</DialogFooter></form>}</DialogContent></Dialog>
    <Dialog open={!!replacement} onOpenChange={open => !open && !locked && setReplacement(null)}><DialogContent><DialogHeader><DialogTitle>Replace {replacement?.name} everywhere</DialogTitle><DialogDescription>Updates authorized client service selections together. Saved interview answers and completed Review history keep their recorded tools.</DialogDescription></DialogHeader><form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          if (!usage) return;
          run(`/tool-catalog/${replacement.tool_id}/replace`, {
            replacement_id: replacementId,
            expected_updated_at: replacement.updated_at ?? null,
            retire
          });
        }}>{error && <p role="alert">{error}</p>}{usagePanel}<label className="block">Replace with<select className="select w-full" disabled={locked} required value={replacementId} onChange={e => setReplacementId(e.target.value)}><option value="">Choose a replacement</option>{tools?.filter(t => !t.retired && t.tool_id !== replacement?.tool_id).map(t => <option key={t.tool_id} value={t.tool_id}>{t.name}</option>)}</select></label><label><input type="checkbox" disabled={locked} checked={retire} onChange={e => setRetire(e.target.checked)} /> Retire the replaced tool</label><DialogFooter><button type="button" className="ghost" disabled={locked} onClick={() => setReplacement(null)}>Cancel</button><button className="cta" type={unconfirmed ? 'button' : 'submit'} disabled={busy || !unconfirmed && !usage} onClick={unconfirmed ? () => run('',{},true) : undefined}>{busy ? 'Saving…' : unconfirmed ? 'Retry unconfirmed save' : 'Replace everywhere'}</button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
