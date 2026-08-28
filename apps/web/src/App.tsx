import { roleCanAccessAdmin } from "@sncf-alerts/shared";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApiStatusProvider } from "./api/ApiStatusContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { GatePage } from "./pages/GatePage";
import { ThemeProvider } from "./theme/ThemeContext";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const TrainStatusPage = lazy(() =>
  import("./pages/TrainStatusPage").then((m) => ({ default: m.TrainStatusPage })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);

function GuardedApp() {
  const { loading, showGate, me } = useAuth();

  if (loading) {
    return <p className="muted page-enter gate-loading">Chargement…</p>;
  }
  if (showGate) {
    return <GatePage />;
  }

  return (
    <Suspense fallback={<p className="muted page-enter">Chargement…</p>}>
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
    </Suspense>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ApiStatusProvider>
        <AuthProvider>
          <GuardedApp />
        </AuthProvider>
      </ApiStatusProvider>
    </ThemeProvider>
  );
}
