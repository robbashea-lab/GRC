import { useEffect, useMemo, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Send, ShieldOff, ShieldCheck, Search, Copy } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  client_contributor: "Client Contributor",
  client_readonly: "Client Read Only",
};
const STATUS_TONE = {
  active: "bg-semantic-success-bg text-semantic-success border-semantic-success-border",
  invited: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  disabled: "bg-surface-subtle text-ink-help border-line",
};

export function UsersTable({ scope = "platform", clientId = null, allowedRoles }) {
  const { user: viewer } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [clients, setClients] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const path = scope === "client" ? `/clients/${clientId}/members` : "/users";
      const { data } = await api.get(path);
      setUsers(data);
    } catch (e) { toast.error(formatError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (scope === "platform" || clientId) load(); /* eslint-disable-next-line */ }, [scope, clientId]);
  useEffect(() => { (async () => { try { const { data } = await api.get("/clients"); setClients(data); } catch { setClients([]); } })(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      (u.name || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s)
    );
  }, [users, q]);

  async function patchUser(u, changes, label) {
    try {
      await api.patch(`/users/${u.user_id}`, changes);
      toast.success(label || "User updated");
      load();
    } catch (e) { toast.error(formatError(e)); }
  }

  async function disableUser(u) {
    try {
      const { data } = await api.get(`/users/${u.user_id}/open_assignments`);
      const total = (data.findings || 0) + (data.reviews || 0) + (data.tasks || 0) + (data.significant_risks || 0);
      const confirmMsg = total
        ? `${u.name || u.email} currently owns:\n· ${data.findings} open finding(s)\n· ${data.reviews} review(s)\n· ${data.tasks} task(s)\n· ${data.significant_risks} significant risk(s)\n\nDisable anyway? These assignments remain but will need reassignment.`
        : `Disable ${u.name || u.email}?`;
      if (!confirm(confirmMsg)) return;
      await patchUser(u, { status: "disabled" }, `${u.name || u.email} disabled`);
    } catch (e) { toast.error(formatError(e)); }
  }

  async function resendInvite(u) {
    try {
      const { data } = await api.post(`/users/${u.user_id}/resend-invite`);
      if (data.invite_link) {
        await navigator.clipboard.writeText(data.invite_link).catch(() => {});
        toast.success("Invitation link copied to clipboard");
      } else {
        toast.success("Invitation resent");
      }
    } catch (e) { toast.error(formatError(e)); }
  }

  const canManage = ["super_admin", "platform_admin"].includes(viewer?.role);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="pl-8 h-9 w-72 text-sm" data-testid="users-search" />
        </div>
        <div className="text-xs text-ink-help font-mono ml-auto">{filtered.length} / {users.length}</div>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid={`add-user-${scope}`} className="bg-brand-charcoal hover:bg-brand-charcoal-hover">
            <Plus className="h-3.5 w-3.5 mr-1" /> {scope === "client" ? "Add client user" : "Add user"}
          </Button>
        )}
      </div>

      <div className="bg-surface-card border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-subtle text-[11px] font-mono uppercase tracking-widest text-ink-secondary border-b border-line">
            <tr>
              <th className="tbl-cell text-left font-medium">User</th>
              <th className="tbl-cell text-left font-medium">Role</th>
              {scope === "platform" && <th className="tbl-cell text-left font-medium">Client access</th>}
              <th className="tbl-cell text-left font-medium">Status</th>
              <th className="tbl-cell text-left font-medium">Last login</th>
              <th className="tbl-cell text-right font-medium w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-8">Loading users…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="tbl-cell text-center text-ink-help py-8">No users match.</td></tr>}
            {!loading && filtered.map((u, i) => {
              const status = u.status || "active";
              const tone = STATUS_TONE[status] || STATUS_TONE.active;
              return (
                <tr key={u.user_id} className="row-hover" data-testid={`user-row-${i}`}>
                  <td className="tbl-cell">
                    <div className="font-medium text-ink-primary">{u.name || u.email}{u.orphaned && <span className="ml-2 text-[10px] font-mono text-semantic-duesoon-text">ORPHANED</span>}</div>
                    <div className="text-[11px] text-ink-help">{u.email}</div>
                  </td>
                  <td className="tbl-cell text-ink-primary">{ROLE_LABEL[u.role] || u.role}</td>
                  {scope === "platform" && (
                    <td className="tbl-cell text-xs text-ink-secondary font-mono">
                      {u.role === "super_admin" ? "All clients" : `${(u.client_ids || []).length} client(s)`}
                    </td>
                  )}
                  <td className="tbl-cell">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${tone}`}>
                      {status}
                    </span>
                  </td>
                  <td className="tbl-cell text-xs font-mono text-ink-secondary">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="tbl-cell text-right">
                    {canManage && u.user_id !== viewer?.user_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-surface-subtle text-ink-help" data-testid={`user-menu-${i}`}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <EditRoleItem u={u} allowedRoles={allowedRoles} onSave={(role) => patchUser(u, { role }, `Role changed to ${ROLE_LABEL[role]}`)} />
                          {scope === "platform" && (
                            <EditClientsItem u={u} clients={clients} onSave={(ids) => patchUser(u, { client_ids: ids }, "Client access updated")} />
                          )}
                          {scope === "client" && u.role !== "super_admin" && (
                            <DropdownMenuItem
                              onClick={() => patchUser(u, { client_ids: (u.client_ids || []).filter((x) => x !== clientId) }, "Removed from client")}
                              className="text-sm text-semantic-critical"
                              data-testid={`remove-from-client-${i}`}
                            >
                              Remove from this client
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {status === "invited" && (
                            <DropdownMenuItem onClick={() => resendInvite(u)} data-testid={`resend-invite-${i}`} className="text-sm">
                              <Send className="h-3.5 w-3.5 mr-2" /> Resend invitation
                            </DropdownMenuItem>
                          )}
                          {status === "disabled" ? (
                            <DropdownMenuItem onClick={() => patchUser(u, { status: "active" }, "User re-enabled")} data-testid={`enable-user-${i}`} className="text-sm">
                              <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Re-enable user
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => disableUser(u)} data-testid={`disable-user-${i}`} className="text-sm text-semantic-critical">
                              <ShieldOff className="h-3.5 w-3.5 mr-2" /> Disable user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        scope={scope}
        clientId={clientId}
        clients={clients}
        allowedRoles={allowedRoles}
        onCreated={() => { setAddOpen(false); load(); }}
      />
    </div>
  );
}

function EditRoleItem({ u, allowedRoles, onSave }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(u.role);
  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }} className="text-sm">
        Change role…
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change role for {u.name || u.email}</DialogTitle></DialogHeader>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {allowedRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(role); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditClientsItem({ u, clients, onSave }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(u.client_ids || []));
  const toggle = (cid) => {
    const n = new Set(selected);
    n.has(cid) ? n.delete(cid) : n.add(cid);
    setSelected(n);
  };
  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); setSelected(new Set(u.client_ids || [])); }} className="text-sm">
        Edit client access…
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Client access for {u.name || u.email}</DialogTitle>
            <DialogDescription>Select which clients this user can access.</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-1 py-2">
            {clients.map((c) => (
              <label key={c.client_id} className="flex items-center gap-2 text-sm p-2 rounded hover:bg-surface-subtle cursor-pointer">
                <input type="checkbox" checked={selected.has(c.client_id)} onChange={() => toggle(c.client_id)} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(Array.from(selected)); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddUserDialog({ open, onOpenChange, scope, clientId, clients, allowedRoles, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", role: allowedRoles[allowedRoles.length - 1], client_ids: clientId ? [clientId] : [] });
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    if (open) setForm({ name: "", email: "", role: allowedRoles[allowedRoles.length - 1], client_ids: clientId ? [clientId] : [] });
    setInviteLink("");
  }, [open, allowedRoles, clientId]);

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email are required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/users", form);
      toast.success(`${form.name} invited`);
      if (data.invite_link) setInviteLink(data.invite_link);
      else onCreated?.();
    } catch (e) { toast.error(formatError(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-user-dialog">
        <DialogHeader>
          <DialogTitle>{scope === "client" ? "Add client user" : "Add platform user"}</DialogTitle>
          <DialogDescription>
            {scope === "client"
              ? `They'll be invited to ${clients.find((c) => c.client_id === clientId)?.name || "this client"} only.`
              : "Send an invitation with a secure set-password link (valid 7 days)."}
          </DialogDescription>
        </DialogHeader>
        {!inviteLink ? (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-ink-secondary">Full name</Label>
              <Input data-testid="new-user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs text-ink-secondary">Email</Label>
              <Input data-testid="new-user-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs text-ink-secondary">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="new-user-role" className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {scope === "client" ? (
              <div className="text-xs text-ink-help p-2 border border-line rounded bg-surface-subtle">
                <span className="text-[10px] font-mono uppercase tracking-widest">Client</span> · <strong>{clients.find((c) => c.client_id === clientId)?.name || "This client"}</strong>
              </div>
            ) : (
              <div>
                <Label className="text-xs text-ink-secondary">Client access</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-line rounded p-2">
                  {clients.map((c) => (
                    <label key={c.client_id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-surface-subtle cursor-pointer">
                      <input type="checkbox"
                        checked={form.client_ids.includes(c.client_id)}
                        onChange={() => {
                          const set = new Set(form.client_ids);
                          set.has(c.client_id) ? set.delete(c.client_id) : set.add(c.client_id);
                          setForm({ ...form, client_ids: Array.from(set) });
                        }}
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2 space-y-2">
            <p className="text-sm text-ink-secondary">Invitation created. Share this link with the user (it was also emailed to them):</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink} className="text-xs font-mono" />
              <Button
                variant="outline"
                onClick={async () => { await navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}
              ><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {!inviteLink ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving} data-testid="new-user-save">{saving ? "Inviting…" : "Send invitation"}</Button>
            </>
          ) : (
            <Button onClick={onCreated} data-testid="new-user-done">Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformAdmin() {
  const { user } = useAuth();
  if (!["super_admin", "platform_admin"].includes(user?.role)) return null;
  const allowedRoles = user.role === "super_admin"
    ? ["super_admin", "platform_admin", "client_contributor", "client_readonly"]
    : ["platform_admin", "client_contributor", "client_readonly"];
  return (
    <div>
      <PageHeader
        eyebrow="Platform Administration"
        title="Users & Access"
        subtitle="Invite internal team members, assign platform roles and manage which clients each user can access."
      />
      <div className="p-8">
        <UsersTable scope="platform" allowedRoles={allowedRoles} />
      </div>
    </div>
  );
}
