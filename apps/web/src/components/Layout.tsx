import { roleCanAccessAdmin } from "@sncf-alerts/shared";
import {
  Bell,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Settings2,
  TrainFront,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AdminAccountPanel } from "./AdminAccountPanel";
import { ApiStatusLine } from "./ApiStatusLine";

const NAV = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
    require: "any" as const,
  },
  {
    to: "/notifications",
    label: "Notifications",
    icon: Bell,
    end: false,
    require: "any" as const,
  },
  {
    to: "/live",
    label: "Trains",
    icon: TrainFront,
    end: false,
    require: "admin" as const,
  },
  {
    to: "/admin",
    label: "Admin",
    icon: Settings2,
    end: false,
    require: "console" as const,
  },
] as const;

export function Layout() {
  const { me, logout, requestLogin } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const visibleNav = NAV.filter((item) => {
    if (item.require === "any") return true;
    if (!me) return false;
    if (item.require === "admin") return me.role === "admin";
    return roleCanAccessAdmin(me.role);
  });

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-top">
          <Link
            to="/"
            className="brand sidebar-brand"
            aria-label="Retour au dashboard"
            title="Dashboard"
          >
            <span className="brand-mark" aria-hidden />
            <span className="brand-name">SNCF-Alerts</span>
          </Link>
          <nav className="sidebar-nav">
            {visibleNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? " sidebar-link-active" : ""}`
                }
                title={
                  to === "/live"
                    ? "Derniers statuts trains (debug)"
                    : label
                }
              >
                <Icon size={20} strokeWidth={2} aria-hidden />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-foot">
          {me ? (
            <div className="sidebar-account">
              <p className="sidebar-account-name" title={me.username}>
                {me.username}
              </p>
              <div className="sidebar-account-actions">
                <button
                  type="button"
                  className="sidebar-account-btn"
                  title="Changer le mot de passe"
                  onClick={() => setPasswordOpen((v) => !v)}
                >
                  <KeyRound size={16} strokeWidth={2} aria-hidden />
                  <span className="sidebar-account-label">Mot de passe</span>
                </button>
                <button
                  type="button"
                  className="sidebar-account-btn"
                  title="Déconnexion"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} strokeWidth={2} aria-hidden />
                  <span className="sidebar-account-label">Déconnexion</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="sidebar-account-btn sidebar-login-btn"
              onClick={requestLogin}
            >
              <LogIn size={16} strokeWidth={2} aria-hidden />
              <span className="sidebar-account-label">Se connecter</span>
            </button>
          )}
          <ApiStatusLine />
        </div>
      </aside>
      <div className="shell-main">
        <main className="shell-content">
          {passwordOpen && me ? (
            <div className="account-drawer card">
              <AdminAccountPanel username={me.username} />
              <button
                type="button"
                className="secondary"
                onClick={() => setPasswordOpen(false)}
              >
                Fermer
              </button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
