import { useEffect, useMemo, useState } from "react";
import {createIntent} from '@/lib/createIntent';
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import ClientRelationshipValue from '@/components/ClientRelationshipValue';
import {grcLead} from '@/lib/clientRelationships';

export default function ClientDialog({ open, onOpenChange, onCreated, client = null }) {
  const [form, setForm] = useState({
    name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production",
  });
  const [saving, setSaving] = useState(false);
  const createRecord = useMemo(() => createIntent((...args) => api.post(...args)), []);
  const [choices, setChoices] = useState(null), [choiceError, setChoiceError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    setForm({ name: client?.name || "", industry: client?.industry || "", status: client?.status || "onboarding", primary_contact_id: client?.primary_contact_id || "", environment: client?.environment || "Production", assigned_owner_id: client?.assigned_owner_id || "", logo_url: client?.logo_url || "", contact_name: '', contact_email: '', contact_title: '' });
  }, [open, client]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setChoices(null); setChoiceError('');
    Promise.all([
      api.get('/clients/grc-leads', {params: {client_id: client?.client_id}, signal: controller.signal}),
      client ? api.get('/contacts', {params: {client_id: client.client_id}, signal: controller.signal}) : Promise.resolve({data: []}),
    ]).then(([leads, contacts]) => {
      if (!Array.isArray(leads.data) || !Array.isArray(contacts.data)) throw new Error('Relationship choices unavailable');
      if (!controller.signal.aborted) setChoices({clientId: client?.client_id, leads: leads.data, contacts: contacts.data});
    }).catch(e => {if (!controller.signal.aborted) setChoiceError(formatError(e));});
    return () => controller.abort();
  }, [open, client, retry]);
  const ready = choices && choices.clientId === client?.client_id;
  async function save() {
    if (!form.name.trim()) { toast.error("Organization name is required"); return; }
    if (!client && (form.contact_email || form.contact_title) && !form.contact_name.trim()) {toast.error('Primary Contact name is required'); return;}
    setSaving(true);
    try {
      const {contact_name, contact_email, contact_title, ...payload} = form;
      if (!client) {
        delete payload.primary_contact_id;
        if (contact_name.trim()) payload.primary_contact_details = {name: contact_name.trim(), email: contact_email.trim() || null, title: contact_title.trim() || null};
      }
      const { data } = await (client ? api.patch(`/clients/${client.client_id}`, {...payload,expected_updated_at:client.updated_at??null}) : createRecord("/clients", payload));
      onCreated?.(data);
      onOpenChange(false);
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="add-client-dialog">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client organization" : "Add client organization"}</DialogTitle>
          <DialogDescription>{client ? "Update the existing client organization." : "Create a new tenant. You can walk through GRC Program Onboarding right after creation."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 py-2">
          <div>
            <Label className="text-xs text-ink-secondary">Organization name <span className="text-semantic-critical">*</span></Label>
            <Input data-testid="new-client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-ink-secondary">Industry</Label>
              <Input data-testid="new-client-industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Manufacturing" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs text-ink-secondary">Client status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="new-client-status" className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  {client?.status === "archived" && <SelectItem value="archived">Archived</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="primary-contact" className="text-xs text-ink-secondary">Primary Contact (optional)</Label>
            {client ? <div className="space-y-2">
              <ClientRelationshipValue client={{...client, primary_contact_id: form.primary_contact_id,
                primary_contact_record: choices?.contacts.find(c => c.contact_id === form.primary_contact_id) || (form.primary_contact_id === client.primary_contact_id ? client.primary_contact_record : null)}} primary />
              <select id="primary-contact" data-testid="client-primary-contact" value={form.primary_contact_id || ''} disabled={!ready || saving}
                onChange={e => setForm({...form, primary_contact_id: e.target.value})} className="w-full rounded-md border border-line bg-surface-card p-2 text-sm">
                <option value="">{client.primary_contact ? 'Unlinked — retain legacy details' : 'Not designated'}</option>
                {client.primary_contact_id && !choices?.contacts.some(c => c.contact_id === client.primary_contact_id && c.status === 'active' && !c.not_applicable) && <option value={client.primary_contact_id}>Recorded Primary Contact (retained)</option>}
                {ready && choices.contacts.filter(c => c.status === 'active' && !c.not_applicable).map(c => <option key={c.contact_id} value={c.contact_id}>{c.name || c.email}{c.title ? ` · ${c.title}` : ''}{c.name && c.email ? ` · ${c.email}` : ''}</option>)}
              </select>
              <p className="text-xs text-ink-secondary">Choose from this client's Contacts & Roles. Maintain contact details there; replacing this relationship does not delete the former Contact.</p>
              {ready && !choices.contacts.some(c => c.status === 'active' && !c.not_applicable) && <p className="text-xs text-ink-secondary">No active Contacts available. Add a Contact in Contacts & Roles, then select it here.</p>}
            </div> : <div className="space-y-2">
              <Input id="primary-contact" data-testid="new-client-contact" aria-label="Primary Contact name" value={form.contact_name || ''} maxLength={200} onChange={e => setForm({...form, contact_name: e.target.value})} placeholder="Contact name" />
              <div className="grid grid-cols-2 gap-3">
                <Input aria-label="Primary Contact email" type="email" value={form.contact_email || ''} onChange={e => setForm({...form, contact_email: e.target.value})} placeholder="Email (optional)" />
                <Input aria-label="Primary Contact title" value={form.contact_title || ''} maxLength={200} onChange={e => setForm({...form, contact_title: e.target.value})} placeholder="Title (optional)" />
              </div>
              <p className="text-xs text-ink-secondary">Creates a client-side Contact in Contacts & Roles, not a User account. No invitation or platform access is granted.</p>
            </div>}
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Assigned GRC Lead (optional)</Label>
            <Select disabled={!ready || saving} value={form.assigned_owner_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_owner_id: v === "__none__" ? "" : v })}>
                <SelectTrigger data-testid="new-client-owner" aria-label="GRC Lead" className="text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {client?.assigned_owner_id && !choices?.leads.some(u => u.user_id === client.assigned_owner_id) && <SelectItem value={client.assigned_owner_id}>{client.grc_lead?.name || client.grc_lead?.email || 'Recorded GRC Lead'} (retained)</SelectItem>}
                {(ready ? choices.leads : []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-ink-secondary">Internal program responsibility. Only active internal users with existing client access are available.</p>
            {client?.assigned_owner_id === form.assigned_owner_id && grcLead(client).notice && <p className="mt-2 text-xs text-ink-secondary">{grcLead(client).notice}. The saved relationship is retained until you change it.</p>}
            {!ready && !choiceError && <p role="status" className="text-xs text-ink-secondary">Loading relationship choices…</p>}
            {choiceError && <p role="alert" className="text-xs text-ink-secondary">Relationship choices could not be loaded. <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Environment</Label>
            <Input value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Logo URL (optional)</Label>
            <Input value={form.logo_url || ""} onChange={e => setForm({ ...form, logo_url: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-client-save" className="bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : client ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
