import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, {formatError} from "@/lib/api";
import {useOrg} from '@/context/OrgContext';
import {dashboardRecordHref} from '@/lib/dashboardItemSummary';
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

export function notificationDestination(notification) {
  const {entity_type:kind, entity_id:id, client_id:clientId} = notification;
  if (!id || !clientId) return null;
  const key = {reviews:'review_id', tasks:'task_id', findings:'finding_id', risks:'risk_id', policies:'policy_id', vendors:'vendor_id', exceptions:'exception_id', requirements:'requirement_id'}[kind];
  if (key) return dashboardRecordHref(kind, {[key]:id, client_id:clientId});
  const route = {contacts:'/contacts', assets:'/systems', ai_systems:'/ai-governance', evidence:'/evidence'}[kind];
  return route ? `${route}?${new URLSearchParams({id, client_id:clientId})}` : null;
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const org = useOrg();
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
      setUnread(data.unread || 0);
      setError('');
    } catch (e) { setError(formatError(e)); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(nid) {
    await api.post(`/notifications/${nid}/read`);
    await load();
  }
  async function markAllRead() {
    try {await api.post("/notifications/read-all"); await load();}
    catch (e) {setError(formatError(e));}
  }

  async function clickItem(n) {
    const destination = notificationDestination(n);
    if (n.client_id && !org?.clients?.some(client => client.client_id === n.client_id)) {
      setError('This client is unavailable or outside your current access.'); return;
    }
    try {
      await markRead(n.notification_id);
      if (destination) {nav(destination); setOpen(false);}
      else setError('This notification has no available linked record.');
    } catch (e) {setError(formatError(e));}
  }

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <DropdownMenuTrigger asChild>
        <button aria-label="Your notifications" data-testid="notification-bell" className="relative p-2 rounded-md hover:bg-brand-metallic-2 text-ink-onDarkMuted hover:text-primary-foreground">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span data-testid="notification-unread-count" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-semantic-critical text-primary-foreground text-xs font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="native-notifications w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-line">
          <div className="text-xs font-mono uppercase tracking-widest text-ink-secondary">Notifications</div>
          <button data-testid="notification-mark-all" onClick={markAllRead} className="text-xs flex items-center gap-1 text-link hover:text-link-hover"><CheckCheck className="h-3 w-3" /> Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {error && <div role="alert" className="native-notification-error">{error} <button type="button" onClick={load}>Retry</button></div>}
          {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink-help">All caught up.</div>}
          {items.map((n) => (
            <button
              key={n.notification_id}
              data-testid={`notification-item-${n.notification_id}`}
              onClick={() => clickItem(n)}
              className={`w-full text-left px-3 py-2.5 border-b border-line hover:bg-surface-subtle flex items-start gap-2 ${n.read || n.read_at ? "opacity-60" : ""}`}
            >
              {!n.read && !n.read_at && <div className="h-1.5 w-1.5 rounded-full bg-brand-lime mt-1.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary truncate">{n.title}</div>
                <div className="text-xs text-ink-muted font-mono">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
