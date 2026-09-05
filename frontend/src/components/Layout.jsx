import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import api, { formatError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, ClipboardCheck, AlertOctagon, ShieldAlert, FileText,
  Building2, ListChecks, FolderArchive, ScrollText, ChevronsUpDown,
  LogOut, Sparkles, CalendarDays, Users, ArrowLeft, Settings2, UserCog, UserCircle2,
  ClipboardList, ShieldCheck, Lock, Star, Search,
} from "lucide-react";
import { toast } from "sonner";
import NotificationBell from "@/components/NotificationBell";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Client-scoped modules (visible only inside a tenant workspace).
const CLIENT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/reviews", label: "Reviews", icon: ClipboardCheck, testid: "nav-reviews" },
  { to: "/action-items", label: "Action Items", icon: ListChecks, testid: "nav-action-items" },
  { to: "/risks", label: "Risks", icon: ShieldAlert, testid: "nav-risks" },
  { to: "/policies", label: "Policies", icon: FileText, testid: "nav-policies" },
  { to: "/vendors", label: "Vendors", icon: Building2, testid: "nav-vendors" },
  { to: "/contacts", label: "Contacts & Roles", icon: Users, testid: "nav-contacts" },
  { to: "/evidence", label: "Evidence", icon: FolderArchive, testid: "nav-evidence" },
  { to: "/onboarding", label: "Onboarding", icon: Sparkles, testid: "nav-onboarding" },
  { to: "/client-settings", label: "Client Settings", icon: Settings2, testid: "nav-client-settings", adminOnly: true },
];

// Platform-level modules (visible to internal admins in the platform context).
// Anything mounted below /clients, /admin, or /platform is considered "platform" scope.
// Note: `/clients` (the Portfolio Overview) is rendered by PlatformClientsSection
// below, not as a flat nav link — it's the heading of the client navigator.
const PLATFORM_NAV = [
  { section: "Administration" },
  { to: "/admin/users", label: "Users & Access", icon: UserCog, testid: "nav-admin-users" },
  { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, testid: "nav-admin-roles" },
  { to: "/admin/security", label: "Security & Auth", icon: Lock, testid: "nav-admin-security" },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, testid: "nav-admin-audit" },
];

function ContextHeader({ isInternal, atPlatform }) {
  // Client Workspace context ONLY — the Platform mode no longer renders a
  // large "All Clients" chip (that job now belongs to the Clients section in
  // PlatformClientsSection). In Client mode we still show the tenant chip
  // + a "← All Clients" return button for internal users.
  const { currentClient } = useOrg();
  const navigate = useNavigate();
  if (atPlatform) return null;

  const initial = currentClient?.name?.[0] || "•";
  return (
    <div className="space-y-2">
      {isInternal && (
        <button
          type="button"
          onClick={() => navigate("/clients")}
          data-testid="return-to-portfolio"
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-brand-metallic-3 bg-brand-charcoal hover:bg-brand-metallic-2 text-[11px] font-mono uppercase tracking-widest text-ink-onDarkMuted hover:text-ink-onDark transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> All Clients
        </button>
      )}
      <div
        data-testid="context-header-client"
        className="w-full flex items-center gap-2 rounded-md border border-brand-metallic-3 bg-brand-metallic-2 px-3 py-2.5"
      >
        <div className="h-7 w-7 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center text-xs font-bold border border-brand-metallic-3">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-onDarkMuted font-mono">Client Org</div>
          <div className="text-sm text-ink-onDark font-medium truncate">
            {currentClient?.name || "Select a client…"}
          </div>
        </div>
      </div>
    </div>
  );
}

const CLIENT_FILTERS = [
  { id: "all", label: "All Clients" },
  { id: "favorites", label: "Favorites" },
  { id: "assigned", label: "Assigned to Me" },
];

function PlatformClientsSection() {
  // The permanent Clients navigator in the Platform sidebar. Header links to
  // /clients (GRC Portfolio Overview); three inline filter tabs; compact
  // search; alphabetized bounded-scroll list; per-row star toggle.
  const { clients, switchClient } = useOrg();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const favoriteIds = useMemo(
    () => new Set(user?.favorite_client_ids || []),
    [user?.favorite_client_ids]
  );

  const active = useMemo(
    () => (clients || []).filter((c) => (c.status || "active") !== "archived"),
    [clients]
  );

  const scoped = useMemo(() => {
    let list = active;
    if (filter === "favorites") list = list.filter((c) => favoriteIds.has(c.client_id));
    else if (filter === "assigned") list = list.filter((c) => c.assigned_owner_id === user?.user_id);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((c) => (c.name || "").toLowerCase().includes(s));
    return [...list].sort((a, b) => (a.name || "").trim().localeCompare((b.name || "").trim()));
  }, [active, filter, favoriteIds, user?.user_id, q]);

  async function toggleFavorite(clientId, currentlyFav) {
    try {
      const url = `/me/favorites/${clientId}`;
      const { data } = currentlyFav ? await api.delete(url) : await api.post(url);
      if (data?.favorite_client_ids && setUser) {
        setUser({ ...user, favorite_client_ids: data.favorite_client_ids });
      }
    } catch (e) { toast.error(formatError(e)); }
  }

  const onClientsPage = location.pathname === "/clients";

  const emptyLabel = filter === "favorites"
    ? "No favorites yet."
    : filter === "assigned"
      ? "None assigned to you."
      : q ? "No matches." : "No clients available.";

  return (
    <div className="space-y-1" data-testid="sidebar-clients-section">
      <button
        type="button"
        onClick={() => navigate("/clients")}
        data-testid="nav-clients"
        className={`w-full side-link ${onClientsPage ? "active" : ""}`}
      >
        <Users className="h-4 w-4 shrink-0" style={{ color: "inherit" }} />
        <span>Clients</span>
      </button>

      <div className="pl-2 pr-1 py-1.5 space-y-1.5">
        <div className="inline-flex items-center rounded-md border border-brand-metallic-3 bg-brand-charcoal/40 p-0.5 gap-0.5 w-full">
          {CLIENT_FILTERS.map((t) => {
            const isActive = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                data-testid={`sidebar-filter-${t.id}`}
                className={`flex-1 px-1.5 h-6 text-[10px] font-mono uppercase tracking-wider rounded-[5px] transition ${isActive ? "bg-brand-metallic text-ink-onDark" : "text-ink-onDarkMuted hover:text-ink-onDark"}`}
              >
                {t.id === "all" ? "All" : t.id === "favorites" ? "Fav" : "Mine"}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-ink-onDarkMuted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            className="pl-6 h-7 text-xs bg-brand-charcoal/40 border-brand-metallic-3 text-ink-onDark placeholder:text-ink-onDarkMuted focus-visible:ring-brand-metallic"
            data-testid="sidebar-client-search"
          />
        </div>

        <div className="max-h-64 overflow-y-auto -mx-1 px-1" data-testid="sidebar-client-list">
          {scoped.length === 0 ? (
            <div className="text-[11px] text-ink-onDarkMuted text-center py-2" data-testid="sidebar-client-empty">
              {emptyLabel}
            </div>
          ) : (
            scoped.map((c) => {
              const isFav = favoriteIds.has(c.client_id);
              return (
                <div
                  key={c.client_id}
                  className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-brand-metallic-2 transition cursor-pointer min-w-0"
                  data-testid={`sidebar-client-${c.client_id}`}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(c.client_id, isFav); }}
                    className={`p-0.5 rounded transition ${isFav ? "text-amber-400" : "text-ink-onDarkMuted hover:text-ink-onDark"}`}
                    aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                    data-testid={`sidebar-fav-${c.client_id}`}
                  >
                    <Star className={`h-3 w-3 ${isFav ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { switchClient(c.client_id); navigate("/dashboard"); }}
                    className="flex-1 min-w-0 text-left"
                    data-testid={`sidebar-open-${c.client_id}`}
                  >
                    <div className="text-xs text-ink-onDark truncate group-hover:text-white">{c.name}</div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);
  // Platform context covers portfolio, administration, and any future /platform/* routes.
  // Client Workspace context covers everything else (dashboard, calendar, reviews, etc.).
  const atPlatform = ["/clients", "/admin", "/platform"].some((p) => location.pathname.startsWith(p));
  const items = atPlatform && isInternal ? PLATFORM_NAV : CLIENT_NAV;

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col bg-brand-charcoal border-r border-brand-metallic-3 h-screen sticky top-0">
      <div className={`px-4 py-4 ${atPlatform && isInternal ? "" : "border-b border-brand-metallic-3"}`}>
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center font-bold font-heading">
            ◱
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
          </div>
          <div>
            <div className="text-ink-onDark text-sm font-semibold font-heading tracking-tight">Northstar GRC</div>
            <div className="text-[10px] text-ink-onDarkMuted uppercase tracking-widest font-mono">{atPlatform ? "Platform Ops" : "Program Ops"}</div>
          </div>
        </div>
        {(!atPlatform || !isInternal) && (
          <div className="mt-3">
            <ContextHeader isInternal={isInternal} atPlatform={atPlatform} />
          </div>
        )}
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto" data-testid={atPlatform ? "sidebar-platform" : "sidebar-client"}>
        {atPlatform && isInternal && <PlatformClientsSection />}
        {items.filter((n) => !n.adminOnly || isInternal).map((n, i) => (
          n.section ? (
            <div key={`sec-${i}`} className="pt-3 pb-1 px-2 text-[10px] uppercase tracking-widest font-mono text-ink-onDarkMuted">
              {n.section}
            </div>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testid}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              <n.icon className="h-4 w-4 shrink-0" style={{ color: "inherit" }} />
              <span>{n.label}</span>
            </NavLink>
          )
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-brand-metallic-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="profile-menu-trigger"
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-brand-metallic-2 transition-colors text-left"
            >
              <div className="h-8 w-8 rounded-full bg-brand-metallic text-ink-onDark flex items-center justify-center text-xs font-medium">
                {user?.name?.[0] || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ink-onDark truncate">{user?.name || user?.email}</div>
                <div className="text-[10px] text-ink-onDarkMuted font-mono uppercase tracking-wider">{(user?.role || "").replace("_", " ")}</div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-ink-onDarkMuted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onClick={() => nav("/account")} data-testid="profile-menu-account" className="text-sm">
              <UserCircle2 className="h-3.5 w-3.5 mr-2" /> My Account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1"><NotificationBell /></div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="logout-button"
              onClick={async () => { await logout(); nav("/login"); }}
              className="text-sm text-semantic-critical focus:text-semantic-critical"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-surface-app">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
