import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api, { formatError } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { X } from "lucide-react";

/**
 * Reusable slide-over drawer for creating & editing records.
 * schema: array of { name, label, type: 'text'|'textarea'|'date'|'select', options?: [{value,label}], required? }
 */
export default function RecordDrawer({ open, onOpenChange, kind, record, schema, clientId, users = [], onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("overview");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState([]);
  const isEdit = !!record;

  useEffect(() => {
    if (open) {
      const base = {};
      schema.forEach((f) => (base[f.name] = record?.[f.name] ?? f.default ?? ""));
      base.client_id = record?.client_id || clientId;
      setForm(base);
      setTab("overview");
      if (isEdit) {
        loadComments();
        loadActivity();
      } else {
        setComments([]); setActivity([]);
      }
    }
    // eslint-disable-next-line
  }, [open, record]);

  const idField = {
    reviews: "review_id", findings: "finding_id", risks: "risk_id", policies: "policy_id",
    vendors: "vendor_id", assets: "asset_id", tasks: "task_id",
  }[kind];

  async function loadComments() {
    try {
      const { data } = await api.get("/comments", { params: { entity_type: kind, entity_id: record[idField] } });
      setComments(data);
    } catch (e) { void e; }
  }
  async function loadActivity() {
    try {
      const { data } = await api.get("/audit-logs");
      setActivity(data.filter((a) => a.entity_id === record[idField]).slice(0, 30));
    } catch (e) { void e; }
  }

  async function save() {
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/${kind}/${record[idField]}`, form);
        toast.success("Saved");
      } else {
        await api.post(`/${kind}`, form);
        toast.success("Created");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitComment() {
    if (!newComment.trim()) return;
    try {
      await api.post("/comments", { entity_type: kind, entity_id: record[idField], body: newComment });
      setNewComment("");
      await loadComments();
    } catch (e) { toast.error(formatError(e)); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid={`${kind}-drawer`}>
        <SheetHeader className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{kind.slice(0, -1)}</div>
              <SheetTitle className="font-heading text-xl">
                {isEdit ? (record.title || record.name) : `New ${kind.slice(0, -1)}`}
              </SheetTitle>
              {isEdit && record.status && <div className="mt-2"><StatusBadge value={record.status} /></div>}
            </div>
            <button onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-slate-100" data-testid="drawer-close"><X className="h-4 w-4" /></button>
          </div>
          {isEdit && (
            <div className="flex gap-1 mt-3 -mb-3">
              {["overview", "comments", "activity"].map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`drawer-tab ${tab === t ? "active" : ""}`} data-testid={`tab-${t}`}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "overview" && (
            <div className="space-y-4">
              {schema.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label className="text-xs text-slate-600">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} data-testid={`field-${f.name}`} className="text-sm" />
                  ) : f.type === "select" ? (
                    <Select value={form[f.name] || ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                      <SelectTrigger data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === "user" ? (
                    <Select value={form[f.name] || ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                      <SelectTrigger data-testid={`field-${f.name}`} className="text-sm"><SelectValue placeholder="Assign…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {users.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={f.type || "text"} value={form[f.name] || ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} data-testid={`field-${f.name}`} className="text-sm" />
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "comments" && (
            <div className="space-y-4">
              <div className="space-y-3">
                {comments.length === 0 && <div className="text-sm text-slate-500">No comments yet.</div>}
                {comments.map((c) => (
                  <div key={c.comment_id} className="border border-slate-200 rounded-md p-3 bg-white">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-medium text-slate-800">{c.user_name || c.user_email}</span>
                      <span className="font-mono">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" data-testid="comment-input" className="text-sm" />
                <Button onClick={submitComment} data-testid="comment-submit" size="sm">Post comment</Button>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-2">
              {activity.length === 0 && <div className="text-sm text-slate-500">No activity yet.</div>}
              {activity.map((a) => (
                <div key={a.log_id} className="text-xs flex items-center gap-3 py-2 border-b border-slate-100">
                  <span className="font-mono text-slate-400">{new Date(a.at).toLocaleString()}</span>
                  <span className="text-slate-700 font-medium">{a.user_email}</span>
                  <span className="text-slate-500">{a.action}</span>
                  <span className="text-slate-400">{a.entity_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="drawer-cancel">Cancel</Button>
          {tab === "overview" && (
            <Button size="sm" onClick={save} disabled={saving} data-testid="drawer-save">{saving ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
