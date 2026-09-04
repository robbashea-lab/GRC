import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, ClipboardCheck, AlertOctagon, ShieldAlert, FileText,
  Building2, ListChecks, FolderArchive, ScrollText, ChevronsUpDown,
  LogOut, Check, Sparkles, CalendarDays, Users, ArrowLeft, Settings2, UserCog, UserCircle2
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

// Client-scoped modules (visible only inside a tenant workspace).
const CLIENT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/reviews", label: "Reviews", icon: ClipboardCheck, testid: "nav-reviews" },
  { to: "/findings", label: "Findings", icon: AlertOctagon, testid: "nav-findings" },
  { to: "/risks", label: "Risks", icon: ShieldAlert, testid: "nav-risks" },
  { to: "/policies", label: "Policies", icon: FileText, testid: "nav-policies" },
  { to: "/vendors", label: "Vendors", icon: Building2, testid: "nav-vendors" },
  { to: "/tasks", label: "Tasks", icon: ListChecks, testid: "nav-tasks" },
  { to: "/evidence", label: "Evidence", icon: FolderArchive, testid: "nav-evidence" },
  { to: "/onboarding", label: "Onboarding", icon: Sparkles, testid: "nav-onboarding" },
  { to: "/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit" },
  { to: "/client-settings", label: "Client Settings", icon: Settings2, testid: "nav-client-settings", adminOnly: true },
];

// Platform-level modules (visible to internal admins on the Client Directory).
const PLATFORM_NAV = [
  { to: "/clients", label: "Clients", icon: Users, testid: "nav-clients" },
  { to: "/admin/users", label: "Administration", icon: UserCog, testid: "nav-admin-users" },
];

function OrgSelector({ isInternal, atDirectory }) {
  const { clients, currentClient, switchClient } = useOrg();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="org-selector-trigger"
          className="w-full flex items-center justify-between gap-2 rounded-md border border-brand-metallic-3 bg-brand-metallic-2 hover:bg-brand-metallic px-3 py-2.5 text-left transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center text-xs font-bold border border-brand-metallic-3">
              {atDirectory ? "◇" : (currentClient?.name?.[0] || "•")}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-onDarkMuted font-mono">
                {atDirectory ? "Platform" : "Client Org"}
              </div>
              <div className="text-sm text-ink-onDark font-medium truncate">
                {atDirectory ? "All Clients" : (currentClient?.name || "Select…")}
              </div>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-ink-onDarkMuted shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">Switch client organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clients.map((c) => (
          <DropdownMenuItem
            key={c.client_id}
            data-testid={`org-option-${c.client_id}`}
            onClick={() => { switchClient(c.client_id); if (atDirectory) navigate("/dashboard"); }}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium">{c.name}</span>
              <span className="text-[11px] text-ink-muted">{c.industry || "—"} · {c.status || c.environment}</span>
            </div>
            {!atDirectory && currentClient?.client_id === c.client_id && <Check className="h-4 w-4 text-semantic-success" />}
          </DropdownMenuItem>
        ))}
        {isInternal && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/clients")}
              data-testid="org-view-all-clients"
              className="text-sm font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-2" /> View all clients
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);
  const atDirectory = location.pathname.startsWith("/clients");
  // Platform-level view for internal admins on the Client Directory route.
  const items = atDirectory && isInternal ? PLATFORM_NAV : CLIENT_NAV;

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col bg-brand-charcoal border-r border-brand-metallic-3 h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-brand-metallic-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative h-8 w-8 rounded-md bg-brand-metallic text-ink-onDark flex items-center justify-center font-bold font-heading">
            ◱
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-lime" />
          </div>
          <div>
            <div className="text-ink-onDark text-sm font-semibold font-heading tracking-tight">Northstar GRC</div>
            <div className="text-[10px] text-ink-onDarkMuted uppercase tracking-widest font-mono">Program Ops</div>
          </div>
        </div>
        <OrgSelector isInternal={isInternal} atDirectory={atDirectory} />
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto" data-testid={atDirectory ? "sidebar-platform" : "sidebar-client"}>
        {items.filter((n) => !n.adminOnly || isInternal).map((n) => (
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
