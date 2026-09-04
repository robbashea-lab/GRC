import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrgProvider } from "@/context/OrgContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import RecordListPage from "@/pages/RecordListPage";
import Evidence from "@/pages/Evidence";
import AuditLog from "@/pages/AuditLog";
import "@/App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500 text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
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
        <Route index element={<Dashboard />} />
        <Route path="reviews" element={<RecordListPage kind="reviews" />} />
        <Route path="findings" element={<RecordListPage kind="findings" />} />
        <Route path="risks" element={<RecordListPage kind="risks" />} />
        <Route path="policies" element={<RecordListPage kind="policies" />} />
        <Route path="vendors" element={<RecordListPage kind="vendors" />} />
        <Route path="assets" element={<RecordListPage kind="assets" />} />
        <Route path="tasks" element={<RecordListPage kind="tasks" />} />
        <Route path="evidence" element={<Evidence />} />
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
