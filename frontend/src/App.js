import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrgProvider } from "@/context/OrgContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import RecordListPage from "@/pages/RecordListPage";
import Evidence from "@/pages/Evidence";
import AuditLog from "@/pages/AuditLog";
import Onboarding from "@/pages/Onboarding";
import Calendar from "@/pages/Calendar";
import ClientDirectory from "@/pages/ClientDirectory";
import MyAccount from "@/pages/MyAccount";
import PlatformAdmin from "@/pages/PlatformAdmin";
import ClientSettings from "@/pages/ClientSettings";
import ActionItems from "@/pages/ActionItems";
import RiskRegister from "@/pages/RiskRegister";
import VendorRegister from "@/pages/VendorRegister";
import "@/App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500 text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Internal users (super_admin, platform_admin) land on Client Directory.
// Client users land directly in their tenant Dashboard.
function LandingRoute() {
  const { user } = useAuth();
  const isInternal = ["super_admin", "platform_admin"].includes(user?.role);
  return <Navigate to={isInternal ? "/clients" : "/dashboard"} replace />;
}

// Client Directory is restricted to internal admins.
function InternalOnly({ children }) {
  const { user } = useAuth();
  if (!["super_admin", "platform_admin"].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Emergent OAuth callback: session_id is in URL fragment
  if (location.hash && location.hash.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <Protected>
            <OrgProvider>
              <Layout />
            </OrgProvider>
          </Protected>
        }
      >
        <Route index element={<LandingRoute />} />
        <Route path="clients" element={<InternalOnly><ClientDirectory /></InternalOnly>} />
        <Route path="admin/users" element={<InternalOnly><PlatformAdmin /></InternalOnly>} />
        <Route path="account" element={<MyAccount />} />
        <Route path="client-settings" element={<InternalOnly><ClientSettings /></InternalOnly>} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reviews" element={<RecordListPage kind="reviews" />} />
        <Route path="findings" element={<RecordListPage kind="findings" />} />
        <Route path="risks" element={<RiskRegister />} />
        <Route path="policies" element={<RecordListPage kind="policies" />} />
        <Route path="requirements" element={<RecordListPage kind="requirements" />} />
        <Route path="vendors" element={<VendorRegister />} />
        <Route path="tasks" element={<RecordListPage kind="tasks" />} />
        <Route path="action-items" element={<ActionItems />} />
        <Route path="evidence" element={<Evidence />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}
