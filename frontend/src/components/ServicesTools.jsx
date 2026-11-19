import { useCallback, useEffect, useRef, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCreateIntent } from '@/lib/createIntent';
import { serviceCatalog, serviceArea, toolList, copy, defaultServices, applyServicePreset, newClientTool, commonToolDefinitions } from '@/lib/r4ServicesTools';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
export function ToolSources({ tool }) {
  if (!tool.product_reference && !tool.source_references?.length) return null;
  return (
    <div className="space-y-2 text-sm" aria-label="Supplied tool references">
      {tool.product_reference && <p><b>Product reference:</b> {tool.product_reference}</p>}
      {!!tool.source_references?.length && <div><b>Supplied catalog references</b><ul className="list-disc pl-5">{tool.source_references.map((reference, index) => <li key={index}>{reference}</li>)}</ul></div>}
    </div>
  );
}
export function ToolDetails({
  tool
}) {
  return <div className="space-y-2 text-sm"><p>{tool.description || 'No description recorded.'}</p>{[['Typical capability examples', 'capabilities'], ['Typically not covered', 'gaps'], ['Possible records to request', 'possible_records'], ['What to verify', 'verification_hints']].map(([label, key]) => tool[key]?.length ? <div key={key}><b>{label}</b><ul className="list-disc pl-5">{tool[key].map((value, i) => <li key={i}>{value}</li>)}</ul></div> : null)}<ToolSources tool={tool} />{tool.to_confirm && <p className="callout">To confirm: {tool.to_confirm}</p>}<p className="sub">Tool selection does not prove deployment, effective coverage or assurance.</p></div>;
}
export default function ServicesTools({
  clientId,
  canEdit = false,
  recoveryOnly = false,
  onSaved
}) {
  const {
      user,
      workspaceMode
    } = useAuth(),
    [saved, setSaved] = useState(null),
    [draft, setDraft] = useState(null),
    [catalog, setCatalog] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [picker, setPicker] = useState(null),
    [query, setQuery] = useState(''),
    [newName, setNewName] = useState(''),
    [detail, setDetail] = useState(null);
  const activeClient = useRef(clientId);
  activeClient.current = clientId;
  const command = useCreateIntent(api.post, `${workspaceMode}:${user?.user_id}:r4-services:${clientId}`, true);
  const load = useCallback(async () => {
    const {
      data
    } = await api.get(`/clients/${clientId}/services`);
    if(activeClient.current !== clientId) return data;
    setSaved(data);
    setCatalog(data.catalog);
    return data;
  }, [clientId]);
  useEffect(() => {
    let live = true;
    setSaved(null);
    setDraft(null);
    setPicker(null);
    setDetail(null);
    setError('');
    if (clientId && !recoveryOnly) api.get(`/clients/${clientId}/services`).then(({
      data
    }) => {
      if (live) {
        setSaved(data);
        setCatalog(data.catalog);
      }
    }).catch(e => live && setError(formatError(e)));
    return () => {
      live = false;
    };
  }, [clientId, recoveryOnly]);
  useEffect(() => {
    if (!draft) return;
    const guard = e => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [draft]);
  const services = draft || saved?.services || defaultServices(),
    tools = toolList(catalog, {
      ...services,
      custom_tools: [...(services.custom_tools || []), ...(picker?.customTools || []), ...commonToolDefinitions()]
    });
  function areaChange(id, patch) {
    const next = copy(draft);
    next.areas ||= {};
    next.areas[id] = {
      ...serviceArea(next, id),
      ...patch
    };
    next.preset = null;
    setDraft(next);
  }
  function chooseTools(id) {
    const a = serviceArea(services, id);
    setPicker({
      id,
      selected: [...a.tool_ids],
      customTools: []
    });
    setQuery('');
    setNewName('');
  }
  function addCustom() {
    try {
      const tool = newClientTool(newName, picker.id);
      setPicker({
        ...picker,
        selected: [...picker.selected, tool.tool_id],
        customTools: [...picker.customTools, tool]
      });
      setNewName('');
    } catch (e) {
      setError(e.message);
    }
  }
  function acceptTools() {
    const next = copy(draft),
      current = serviceArea(next, picker.id);
    next.custom_tools = [...(next.custom_tools || []), ...picker.customTools.filter(t => picker.selected.includes(t.tool_id))];
    next.areas ||= {};
    next.areas[picker.id] = {
      ...current,
      tool_ids: picker.selected,
      ...(current.responsibility === 'un' && picker.selected.length ? {
        responsibility: picker.selected.some(id => catalog.some(t => t.tool_id === id && ['iv', 'ivx'].includes(t.category))) ? 'iv' : 'cl'
      } : {})
    };
    next.preset = null;
    setDraft(next);
    setPicker(null);
  }
  function toggleTool(tool, checked) {
    let customTools = picker.customTools;
    if (checked && tool.tool_id.startsWith('common_') && !services.custom_tools?.some(t => t.tool_id === tool.tool_id) && !customTools.some(t => t.tool_id === tool.tool_id)) customTools = [...customTools, tool];
    setPicker({
      ...picker,
      customTools,
      selected: checked ? [...picker.selected, tool.tool_id] : picker.selected.filter(id => id !== tool.tool_id)
    });
  }
  async function save(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await command(`/clients/${clientId}/services`, {
        expected_updated_at: saved.updated_at ?? null,
        areas: draft.areas || {},
        custom_tools: draft.custom_tools || [],
        preset: draft.preset || null
      });
      await load();
      if(activeClient.current !== clientId) return;
      setDraft(null);
      onSaved?.();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }
  async function retryRecovery() {
    setBusy(true);
    setError('');
    try {
      await command.retry();
      await load();
      setDraft(null);
      onSaved?.();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  }
  if (!clientId) return <p>Select an authorized client to view Services &amp; Tools.</p>;
  if (recoveryOnly || !saved) return <section className="panel">{error ? <p role="alert">{error}</p> : <p>{recoveryOnly ? 'Client context is unavailable until the unfinished save is recovered.' : 'Loading Services & Tools…'}</p>}{canEdit&&command.unconfirmed()&&<button className="cta" type="button" disabled={busy} onClick={retryRecovery}>Retry unconfirmed save</button>}</section>;
  return <form className="space-y-4" onSubmit={save}><div className="page-head"><div><h2 className="page-title">Services &amp; Tools</h2><p className="page-sub">Who runs each service area and which tools are in use. Guided assessments and review guides use this shared context.</p></div>{canEdit && !draft && <button className="ghost" type="button" onClick={() => setDraft(copy(saved.services))}>Edit services &amp; tools</button>}</div>
    {error && <p role="alert" className="callout">{error}</p>}
    {draft && <div className="toolbar"><label>Start from an engagement type <select className="select" disabled={busy || command.unconfirmed()} value={draft.preset || ''} onChange={e => e.target.value && setDraft(applyServicePreset(draft, e.target.value))}><option value="">Choose…</option>{Object.entries(serviceCatalog.presets).map(([id, p]) => <option value={id} key={id}>{p.name}</option>)}</select></label><p className="sub">Adjust the proposed responsibilities and tools before saving.</p></div>}
    <div className="svc-sum">{serviceCatalog.responsibilities.map(r => {
        const count = serviceCatalog.areas.filter(a => serviceArea(services, a.id).responsibility === r.id).length;
        return count ? <span key={r.id}><b className="num">{count}</b> {r.label}</span> : null;
      })}</div>
    <section className="panel scroll-x"><div style={{
        minWidth: 720
      }}><div className="gt-head" style={{
          gridTemplateColumns: '1.2fr 180px 1.5fr'
        }}><span>Service area</span><span>Who runs it</span><span>Tools in use</span></div>{serviceCatalog.areas.map(area => {
          const value = serviceArea(services, area.id);
          return <div className="gt-row" key={area.id} style={{
            gridTemplateColumns: '1.2fr 180px 1.5fr'
          }}><div><b>{area.name}</b><p className="sub">{area.description}</p><p className="sub">When iVenture runs it: {area.team}</p></div><div>{draft ? <select className="select" aria-label={'Who runs ' + area.name} value={value.responsibility} disabled={busy || command.unconfirmed()} onChange={e => areaChange(area.id, {
                responsibility: e.target.value
              })}>{serviceCatalog.responsibilities.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select> : serviceCatalog.responsibilities.find(r => r.id === value.responsibility)?.label}</div><div className="chip-row">{value.tool_ids.map(id => {
                const tool = tools.find(t => t.tool_id === id);
                return <button className="mini-chip" type="button" key={id} onClick={() => setDetail(tool)}>{tool?.name || id}{tool?.retired ? ' · Retired' : ''}</button>;
              })}{!value.tool_ids.length && <span className="sub">No tools recorded</span>}{draft && <button className="link-btn" type="button" disabled={busy || command.unconfirmed()} onClick={() => chooseTools(area.id)}>Choose tools</button>}</div></div>;
        })}</div></section>
    {draft && <div className="flex gap-2"><button className="cta" type={command.unconfirmed() ? 'button' : 'submit'} onClick={command.unconfirmed() ? retryRecovery : undefined} disabled={busy}>{busy ? 'Saving…' : command.unconfirmed() ? 'Retry unconfirmed save' : 'Save services & tools'}</button><button className="ghost" type="button" disabled={busy || command.unconfirmed()} onClick={() => {
        setDraft(null);
        setError('');
      }}>Cancel</button></div>}
    <Dialog open={!!picker} onOpenChange={open => !open && setPicker(null)}><DialogContent><DialogHeader><DialogTitle>Choose tools</DialogTitle><DialogDescription>{serviceCatalog.areas.find(a => a.id === picker?.id)?.name} · Tools provide context; operation and evidence require separate answers.</DialogDescription></DialogHeader>{picker && <><input className="input" aria-label="Search tools" placeholder="Search tools" value={query} onChange={e => setQuery(e.target.value)} /><div className="max-h-72 overflow-y-auto space-y-2">{tools.filter(t => (t.area_ids.includes(picker.id) || picker.selected.includes(t.tool_id)) && (!t.retired || picker.selected.includes(t.tool_id)) && t.name.toLowerCase().includes(query.toLowerCase())).map(t => <label className="flex gap-2" key={t.tool_id}><input type="checkbox" checked={picker.selected.includes(t.tool_id)} onChange={e => toggleTool(t, e.target.checked)} /><span>{t.name}{t.retired ? ' · Retired' : ''}</span><button className="link-btn" type="button" onClick={() => setDetail(t)}>Details</button></label>)}</div><label>Add a client-owned tool<input className="input" maxLength={255} value={newName} onChange={e => setNewName(e.target.value)} /></label><button className="ghost" type="button" onClick={addCustom}>Add to this draft</button><DialogFooter><button className="ghost" type="button" onClick={() => setPicker(null)}>Cancel</button><button className="cta" type="button" onClick={acceptTools}>Use selected tools</button></DialogFooter></>}</DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>Tool context</DialogDescription></DialogHeader>{detail && <ToolDetails tool={detail} />}</DialogContent></Dialog>
  </form>;
}
