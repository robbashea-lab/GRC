import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch (e) { void e; }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(nid) {
    await api.post(`/notifications/${nid}/read`);
    load();
  }
  async function markAllRead() {
    await api.post("/notifications/read-all");
    load();
  }

  function clickItem(n) {
    markRead(n.notification_id);
    if (n.entity_type) nav(`/${n.entity_type}`);
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <DropdownMenuTrigger asChild>
        <button data-testid="notification-bell" className="relative p-2 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span data-testid="notification-unread-count" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500">Notifications</div>
          <button data-testid="notification-mark-all" onClick={markAllRead} className="text-[11px] flex items-center gap-1 text-slate-600 hover:text-slate-900"><CheckCheck className="h-3 w-3" /> Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">All caught up.</div>}
          {items.map((n) => (
            <button
              key={n.notification_id}
              data-testid={`notification-item-${n.notification_id}`}
              onClick={() => clickItem(n)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 flex items-start gap-2 ${n.read ? "opacity-60" : ""}`}
            >
              {!n.read && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-900 truncate">{n.title}</div>
                <div className="text-[11px] text-slate-500 font-mono">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
