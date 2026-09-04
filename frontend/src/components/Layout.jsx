import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, ClipboardCheck, AlertOctagon, ShieldAlert, FileText,
  Building2, Server, ListChecks, FolderArchive, ScrollText, ChevronsUpDown,
  LogOut, Check
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/reviews", label: "Reviews", icon: ClipboardCheck, testid: "nav-reviews" },
  { to: "/findings", label: "Findings", icon: AlertOctagon, testid: "nav-findings" },
  { to: "/risks", label: "Risks", icon: ShieldAlert, testid: "nav-risks" },
  { to: "/policies", label: "Policies", icon: FileText, testid: "nav-policies" },
  { to: "/vendors", label: "Vendors", icon: Building2, testid: "nav-vendors" },
  { to: "/assets", label: "Assets", icon: Server, testid: "nav-assets" },
  { to: "/tasks", label: "Tasks", icon: ListChecks, testid: "nav-tasks" },
  { to: "/evidence", label: "Evidence", icon: FolderArchive, testid: "nav-evidence" },
  { to: "/audit", label: "Audit Log", icon: ScrollText, testid: "nav-audit" },
];

function OrgSelector() {
  const { clients, currentClient, switchClient } = useOrg();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="org-selector-trigger"
          className="w-full flex items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-800/70 hover:bg-slate-800 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-900 text-xs font-bold">
              {currentClient?.name?.[0] || "•"}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Client Org</div>
              <div className="text-sm text-white font-medium truncate">{currentClient?.name || "Select…"}</div>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">Switch client organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clients.map((c) => (
          <DropdownMenuItem
            key={c.client_id}
            data-testid={`org-option-${c.client_id}`}
            onClick={() => switchClient(c.client_id)}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium">{c.name}</span>
              <span className="text-[11px] text-slate-500">{c.industry} · {c.environment}</span>
            </div>
            {currentClient?.client_id === c.client_id && <Check className="h-4 w-4 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col bg-slate-950 border-r border-slate-800 h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-md bg-white text-slate-900 flex items-center justify-center font-bold font-heading">◱</div>
          <div>
            <div className="text-white text-sm font-semibold font-heading tracking-tight">Northstar GRC</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Program Ops</div>
          </div>
        </div>
        <OrgSelector />
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            data-testid={n.testid}
            className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
          >
            <n.icon className="h-4 w-4" />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-medium">
            {user?.name?.[0] || user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-white truncate">{user?.name || user?.email}</div>
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">{(user?.role || "").replace("_", " ")}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={async () => { await logout(); nav("/login"); }}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
