import { useEffect, useMemo, useState } from "react";
import api, { formatError } from "@/lib/api";
import { useOrg } from "@/context/OrgContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const KIND_COLOR = {
  review: "bg-blue-100 text-blue-800 border-blue-200",
  finding: "bg-red-100 text-red-800 border-red-200",
  task: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function monthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday start
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
  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState({ reviews: {}, findings: {}, tasks: {} });

  useEffect(() => {
    if (!currentClientId) return;
    (async () => {
      try {
        const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1).toISOString();
        const end = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0).toISOString();
        const { data } = await api.get("/calendar", { params: { client_id: currentClientId, start, end } });
        setData(data);
      } catch (e) { toast.error(formatError(e)); }
    })();
  }, [anchor, currentClientId]);

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

  return (
    <div>
      <PageHeader
        title="Review Calendar"
        subtitle={`${currentClient?.name || ""} · Recurring reviews, findings and tasks on a month grid.`}
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
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Reviews</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Findings</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Tasks</span>
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
              const items = itemsForDay(d);
              const isToday = ymd(d) === today;
              return (
                <div key={i} data-testid={`cal-day-${ymd(d)}`}
                  className={`min-h-[110px] border-b border-r border-slate-100 p-2 text-xs ${!inMonth(d) ? "bg-slate-50/60" : "bg-white"} ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}>
                  <div className={`flex items-center justify-between mb-1 ${inMonth(d) ? "text-slate-700" : "text-slate-400"}`}>
                    <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded font-mono ${isToday ? "bg-slate-900 text-white" : ""}`}>{d.getDate()}</span>
                    {items.length > 0 && <span className="text-[10px] text-slate-400 font-mono">{items.length}</span>}
                  </div>
                  <ul className="space-y-1">
                    {items.slice(0, 3).map((it) => (
                      <li key={`${it.kind}-${it.id}`}>
                        <Link to={`/${it.kind}s`} className={`block truncate rounded border px-1.5 py-0.5 ${KIND_COLOR[it.kind]} hover:opacity-80`} data-testid={`cal-item-${it.kind}-${it.id}`}>
                          {it.title}
                        </Link>
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
