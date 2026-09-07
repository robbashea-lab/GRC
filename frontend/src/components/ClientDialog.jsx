import { useEffect, useState } from "react";
import api, { formatError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function ClientDialog({ open, onOpenChange, users, onCreated, client = null }) {
  const [form, setForm] = useState({
    name: "", industry: "", status: "onboarding", primary_contact: "", environment: "Production",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({ name: client?.name || "", industry: client?.industry || "", status: client?.status || "onboarding", primary_contact: client?.primary_contact || "", environment: client?.environment || "Production", assigned_owner_id: client?.assigned_owner_id || "", logo_url: client?.logo_url || "" });
  }, [open, client]);
  async function save() {
    if (!form.name.trim()) { toast.error("Organization name is required"); return; }
    setSaving(true);
    try {
      const { data } = await (client ? api.patch(`/clients/${client.client_id}`, form) : api.post("/clients", form));
      onCreated?.(data);
      onOpenChange(false);
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="add-client-dialog">
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
            <Label className="text-xs text-ink-secondary">Primary contact (optional)</Label>
            <Input data-testid="new-client-contact" value={form.primary_contact} onChange={(e) => setForm({ ...form, primary_contact: e.target.value })} placeholder="Jane Doe · jane@acme.com" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-ink-secondary">Assigned GRC Lead (optional)</Label>
            <Select value={form.assigned_owner_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_owner_id: v === "__none__" ? "" : v })}>
              <SelectTrigger data-testid="new-client-owner" className="text-sm"><SelectValue placeholder="Assign later" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Assign later</SelectItem>
                {(users || []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={save} disabled={saving} data-testid="new-client-save" className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
            {saving ? "Saving…" : client ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
