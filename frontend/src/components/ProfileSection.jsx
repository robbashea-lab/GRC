import {useState} from 'react';
import {catalog,optionsFor,validateProfile} from '@/lib/clientProfile';
import {Button} from './ui/button';
import {Input} from './ui/input';
export default function ProfileSection({section,values={},canEdit,onSave}) {
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const editing=draft!==null;
  const update=(key,value)=>setDraft({...draft,[key]:value});
  async function save(e){e.preventDefault();setBusy(true);setError('');try{await onSave(validateProfile(section,draft));setDraft(null);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <form onSubmit={save} className="space-y-4">
    <div className="flex flex-wrap gap-2 items-center"><p className="text-sm text-ink-secondary flex-1">Optional organization context. Not a control assessment. Do not enter credentials or secrets.</p>{!editing&&canEdit&&<Button type="button" variant="outline" onClick={()=>setDraft({...values})}>Edit profile section</Button>}</div>
    {section==='technical'&&<p className="text-xs text-ink-secondary">Systems & Scope owns scoped systems; Vendors owns third-party records. These selections do not create either.</p>}
    {error&&<p role="alert" className="text-sm text-semantic-danger">{error}</p>}
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">{catalog.sections[section].map(field=>{
      const value=(draft||values)[field.id],options=optionsFor(field),id='profile-'+field.id;
      return <div key={field.id} className="min-w-0"><label htmlFor={editing?id:undefined} className="block text-xs font-medium text-ink-secondary mb-1">{field.label}</label>
        {!editing?<p className="text-sm break-words">{Array.isArray(value)?value.join(' · ')||'Not provided':value??'Not provided'}</p>:
          field.type==='multi'?<fieldset id={id} className="border border-line rounded p-2 max-h-40 overflow-y-auto"><legend className="sr-only">{field.label}</legend>{options.map(option=><label key={option} className="flex gap-2 text-sm py-1"><input type="checkbox" checked={(value||[]).includes(option)} onChange={e=>update(field.id,e.target.checked?(['Unknown','None'].includes(option)?[option]:[...(value||[]).filter(v=>!['Unknown','None'].includes(v)),option]):(value||[]).filter(v=>v!==option))}/>{option}</label>)}</fieldset>:
          options.length?<select id={id} className="w-full rounded border border-line bg-surface-card p-2 text-sm" value={value??''} onChange={e=>update(field.id,e.target.value||null)}><option value="">Not provided</option>{options.map(v=><option key={v}>{v}</option>)}</select>:
          <Input id={id} type={field.type==='number'?'number':field.type==='date'?'date':'text'} min={field.type==='number'?0:undefined} max={field.type==='number'?100000000:undefined} maxLength={2000} value={value??''} onChange={e=>update(field.id,e.target.value===''?null:field.type==='number'?Number(e.target.value):e.target.value)}/>}
      </div>;
    })}</div>
    {editing&&<div className="flex gap-2"><Button disabled={busy} type="submit">{busy?'Saving…':'Save profile'}</Button><Button type="button" disabled={busy} variant="outline" onClick={()=>{setDraft(null);setError('');}}>Cancel</Button></div>}
  </form>;
}
