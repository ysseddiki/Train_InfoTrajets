import { roleCanAccessAdmin } from "@sncf-alerts/shared";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApiStatusProvider } from "./api/ApiStatusContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GatePage } from "./pages/GatePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { TrainStatusPage } from "./pages/TrainStatusPage";

function GuardedApp() {
  const { loading, showGate, me } = useAuth();

  if (loading) {
    return <p className="muted page-enter gate-loading">Chargement…</p>;
  }
  if (showGate) {
    return <GatePage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/live"
          element={
            me?.role === "admin" ? (
              <TrainStatusPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            me && roleCanAccessAdmin(me.role) ? (
              <AdminPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ApiStatusProvider>
      <AuthProvider>
        <GuardedApp />
      </AuthProvider>
    </ApiStatusProvider>
  );
}
