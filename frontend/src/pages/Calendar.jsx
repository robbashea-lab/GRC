import { useEffect, useMemo, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const KIND_COLOR = {
  review: "bg-semantic-info-bg text-semantic-info border-semantic-info-border",
  finding: "bg-semantic-critical-bg text-semantic-critical border-semantic-critical-border",
  task: "bg-semantic-success-bg text-semantic-success border-semantic-success-border",
};

function monthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday-start
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function Calendar() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState({ reviews: {}, findings: {}, tasks: {} });
  const [dragOverDay, setDragOverDay] = useState("");
  const [busy, setBusy] = useState(false);
  const canReschedule = ["super_admin", "platform_admin", "client_contributor"].includes(user?.role);

  const load = async () => {
    if (!currentClientId) return;
    try {
      const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1).toISOString();
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0).toISOString();
      const { data } = await api.get("/calendar", { params: { client_id: currentClientId, start, end } });
      setData(data);
    } catch (e) { toast.error(formatError(e)); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [anchor, currentClientId]);

  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const monthLabel = anchor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = ymd(new Date());
  const inMonth = (d) => d.getMonth() === anchor.getMonth();

  function itemsForDay(d) {
    const key = ymd(d);
    return [
      ...(data.reviews[key] || []),
      ...(data.findings[key] || []),
      ...(data.tasks[key] || []),
    ];
  }

  function onDragStart(e, item) {
    if (!canReschedule) return;
    e.dataTransfer.setData("application/json", JSON.stringify({ id: item.id, kind: item.kind }));
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDrop(e, targetDate) {
    e.preventDefault();
    setDragOverDay("");
    if (!canReschedule) return;
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData("application/json")); }
    catch { return; }
    if (!payload?.id || !payload?.kind) return;
    // Preserve the original time-of-day so dragging only shifts the date, not the hour.
    const bucket = payload.kind === "review" ? data.reviews : payload.kind === "finding" ? data.findings : data.tasks;
    let original;
    for (const list of Object.values(bucket)) {
      const hit = list.find((x) => x.id === payload.id);
      if (hit) { original = hit; break; }
    }
    // Look up the original due_date from any cached row we have; fallback to 09:00 UTC.
    let hh = "09", mm = "00", ss = "00";
    if (original?.due_date_iso) {
      const t = new Date(original.due_date_iso);
      if (!isNaN(t)) { hh = String(t.getUTCHours()).padStart(2, "0"); mm = String(t.getUTCMinutes()).padStart(2, "0"); ss = String(t.getUTCSeconds()).padStart(2, "0"); }
    }
    const dueIso = `${targetDate}T${hh}:${mm}:${ss}.000Z`;
    setBusy(true);
    try {
      // Optimistic UI: move locally first
      setData((prev) => {
        const next = { reviews: { ...prev.reviews }, findings: { ...prev.findings }, tasks: { ...prev.tasks } };
        const b = payload.kind === "review" ? next.reviews : payload.kind === "finding" ? next.findings : next.tasks;
        let moved = null;
        for (const [k, list] of Object.entries(b)) {
          const idx = list.findIndex((x) => x.id === payload.id);
          if (idx >= 0) { moved = list[idx]; b[k] = list.filter((_, i) => i !== idx); if (b[k].length === 0) delete b[k]; break; }
        }
        if (moved) b[targetDate] = [...(b[targetDate] || []), moved];
        return next;
      });
      await api.patch(`/${payload.kind}s/${payload.id}`, { due_date: dueIso });
      toast.success(`Rescheduled to ${targetDate}`);
    } catch (e) {
      toast.error(formatError(e));
      load(); // revert
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        title="Review Calendar"
        subtitle={`${currentClient?.name || ""} · Recurring reviews, findings and tasks. ${canReschedule ? "Drag any chip onto a new day to reschedule." : "Read-only."}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} data-testid="cal-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())} data-testid="cal-today">
              <CalendarDays className="h-4 w-4 mr-1" /> Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} data-testid="cal-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-heading font-semibold text-slate-900" data-testid="cal-month-label">{monthLabel}</div>
          <div className="flex items-center gap-3 text-xs text-ink-secondary">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-semantic-info" /> Reviews</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-semantic-critical" /> Findings</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-semantic-success" /> Tasks</span>
            {busy && <span className="text-ink-muted">Saving…</span>}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
              <div key={w} className="px-2 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 text-left">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 grid-rows-6">
            {days.map((d, i) => {
              const key = ymd(d);
              const items = itemsForDay(d);
              const isToday = key === today;
              const isDragTarget = dragOverDay === key;
              return (
                <div
                  key={i}
                  data-testid={`cal-day-${key}`}
                  onDragOver={(e) => { if (canReschedule) { e.preventDefault(); setDragOverDay(key); } }}
                  onDragLeave={() => setDragOverDay((prev) => (prev === key ? "" : prev))}
                  onDrop={(e) => onDrop(e, key)}
                  className={`min-h-[110px] border-b border-r border-slate-100 p-2 text-xs transition-colors ${!inMonth(d) ? "bg-slate-50/60" : "bg-white"} ${isDragTarget ? "outline outline-2 outline-slate-900 outline-offset-[-2px] bg-slate-50" : ""} ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
                >
                  <div className={`flex items-center justify-between mb-1 ${inMonth(d) ? "text-slate-700" : "text-slate-400"}`}>
                    <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded font-mono ${isToday ? "bg-slate-900 text-white" : ""}`}>{d.getDate()}</span>
                    {items.length > 0 && <span className="text-[10px] text-slate-400 font-mono">{items.length}</span>}
                  </div>
                  <ul className="space-y-1">
                    {items.slice(0, 3).map((it) => (
                      <li key={`${it.kind}-${it.id}`}>
                        <div
                          draggable={canReschedule}
                          onDragStart={(e) => onDragStart(e, it)}
                          data-testid={`cal-item-${it.kind}-${it.id}`}
                          className={`group flex items-center gap-1 truncate rounded border px-1.5 py-0.5 ${KIND_COLOR[it.kind]} ${canReschedule ? "cursor-grab active:cursor-grabbing" : ""} hover:opacity-80`}
                          title={it.title}
                        >
                          <span className="truncate flex-1">{it.title}</span>
                          <Link to={`/${it.kind}s`} className="opacity-0 group-hover:opacity-100 text-[10px]">↗</Link>
                        </div>
                      </li>
                    ))}
                    {items.length > 3 && <li className="text-[10px] text-slate-500">+{items.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
