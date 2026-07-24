import { Bell, LayoutDashboard, Settings2 } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { ApiStatusLine } from "./ApiStatusLine";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/notifications", label: "Notifications", icon: Bell, end: false },
  { to: "/admin", label: "Admin", icon: Settings2, end: false },
] as const;

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-top">
          <div className="brand sidebar-brand">
            <span className="brand-mark" aria-hidden />
            <span className="brand-name">SNCF-Alerts</span>
          </div>
          <nav className="sidebar-nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? " sidebar-link-active" : ""}`
                }
                title={label}
              >
                <Icon size={20} strokeWidth={2} aria-hidden />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-foot">
          <ApiStatusLine />
        </div>
      </aside>
      <div className="shell-main">
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
