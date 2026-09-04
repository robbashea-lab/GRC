import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Building2 } from "lucide-react";
import { UsersTable } from "@/pages/PlatformAdmin";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function ClientSettings() {
  const { currentClient, currentClientId } = useOrg();
  const { user } = useAuth();
  const nav = useNavigate();
  const canManage = ["super_admin", "platform_admin"].includes(user?.role);

  if (!canManage) {
    return (
      <div className="p-8">
        <PageHeader title="Client Settings" subtitle="You need administrator access to manage this client's users and settings." />
      </div>
    );
  }

  if (!currentClientId) {
    return (
      <div>
        <PageHeader title="Client Settings" subtitle="Select a client organization first." />
        <div className="p-8 max-w-xl">
          <Button onClick={() => nav("/clients")}>Open Client Directory</Button>
        </div>
      </div>
    );
  }

  const allowedRoles = user.role === "super_admin"
    ? ["platform_admin", "client_contributor", "client_readonly"]
    : ["client_contributor", "client_readonly"];

  return (
    <div>
      <PageHeader
        eyebrow="Client Settings"
        title={currentClient?.name || "Client"}
        subtitle="Manage users and access for this client. The active client determines where new users are added — no cross-tenant exposure."
      />
      <div className="px-8 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line bg-surface-card text-sm text-ink-primary" data-testid="client-settings-tenant">
          <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-ink-help">Active client</span>
          <span className="text-ink-help">·</span>
          <span className="font-medium">{currentClient?.name}</span>
        </div>
      </div>
      <div className="p-8">
        <h2 className="text-sm font-medium text-ink-primary mb-3">Users &amp; Access</h2>
        <UsersTable scope="client" clientId={currentClientId} allowedRoles={allowedRoles} />
      </div>
    </div>
  );
}
