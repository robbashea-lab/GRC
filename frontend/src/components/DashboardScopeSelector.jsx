import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Users, User, UserX, Building2, Check, ChevronDown, Search } from "lucide-react";

/**
 * Dashboard scope selector. Options: org | mine | user:<id> | unassigned.
 * Person list is fetched from /api/clients/{client_id}/members and is tenant-scoped server-side.
 * Value shape: { kind: "org" | "mine" | "unassigned" | "user", user_id?: string }
 */
export default function DashboardScopeSelector({ clientId, value, onChange }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);
  const isReadonly = user?.role === "client_readonly";

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const { data } = await api.get(`/clients/${clientId}/members`);
        setMembers(data || []);
      } catch { setMembers([]); }
    })();
  }, [clientId]);

  const filteredMembers = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      (m.name || "").toLowerCase().includes(s) || (m.email || "").toLowerCase().includes(s)
    );
  }, [members, q]);

  const label = useMemo(() => {
    if (!value || value.kind === "org") return "Entire Organization";
    if (value.kind === "mine") return "My Work";
    if (value.kind === "unassigned") return "Unassigned";
    if (value.kind === "user") {
      const m = members.find((x) => x.user_id === value.user_id);
      return m?.name || m?.email || "Person";
    }
    return "Entire Organization";
  }, [value, members]);

  function pick(next) {
    onChange?.(next);
    setOpen(false);
    setQ("");
  }

  function isActive(next) {
    if (!value) return next.kind === "org";
    if (next.kind !== value.kind) return false;
    if (next.kind === "user") return next.user_id === value.user_id;
    return true;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="dashboard-scope-trigger"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-surface-card hover:bg-surface-subtle text-sm text-ink-primary transition-colors"
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Dashboard View</span>
          <span className="font-medium">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-help" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" data-testid="dashboard-scope-popover">
        <div className="py-1">
          <ScopeItem
            active={isActive({ kind: "org" })}
            onClick={() => pick({ kind: "org" })}
            icon={Building2}
            label="Entire Organization"
            hint="Full GRC program"
            testid="scope-option-org"
          />
          {!isReadonly && (
            <ScopeItem
              active={isActive({ kind: "mine" })}
              onClick={() => pick({ kind: "mine" })}
              icon={User}
              label="My Work"
              hint="Items assigned to you"
              testid="scope-option-mine"
            />
          )}
          {isInternal && (
            <ScopeItem
              active={isActive({ kind: "unassigned" })}
              onClick={() => pick({ kind: "unassigned" })}
              icon={UserX}
              label="Unassigned"
              hint="Records missing an owner"
              testid="scope-option-unassigned"
            />
          )}
        </div>
        {(isInternal || !isReadonly) && (
          <div className="border-t border-line">
            <div className="px-2.5 py-2 border-b border-line">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people…"
                  className="pl-8 h-8 text-xs"
                  data-testid="scope-people-search"
                />
              </div>
            </div>
            <div className="py-1 max-h-64 overflow-y-auto" data-testid="scope-people-list">
              {filteredMembers.length === 0 && (
                <div className="px-3 py-3 text-xs text-ink-help text-center">No people match.</div>
              )}
              {filteredMembers.map((m) => (
                <ScopeItem
                  key={m.user_id}
                  active={isActive({ kind: "user", user_id: m.user_id })}
                  onClick={() => pick({ kind: "user", user_id: m.user_id })}
                  icon={Users}
                  label={m.name || m.email}
                  hint={
                    m.orphaned
                      ? "Inactive · still owns records"
                      : (m.role || "").replace("_", " ")
                  }
                  hintTone={m.orphaned ? "warn" : "muted"}
                  testid={`scope-user-${m.user_id}`}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ScopeItem({ active, onClick, icon: Icon, label, hint, hintTone = "muted", testid }) {
  const hintClass = hintTone === "warn" ? "text-semantic-duesoon-text" : "text-ink-help";
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${active ? "bg-surface-subtle" : "hover:bg-surface-subtle"}`}
    >
      <Icon className="h-4 w-4 text-ink-secondary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={`truncate ${active ? "font-medium text-ink-primary" : "text-ink-primary"}`}>{label}</div>
        {hint && <div className={`text-[11px] truncate ${hintClass}`}>{hint}</div>}
      </div>
      {active && <Check className="h-3.5 w-3.5 text-semantic-success shrink-0" />}
    </button>
  );
}
