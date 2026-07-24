import { Bell, LayoutDashboard, Settings2 } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/notifications", label: "Notifications", icon: Bell, end: false },
  { to: "/admin", label: "Admin", icon: Settings2, end: false },
] as const;

export function Layout() {
  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">SNCF-Alerts</span>
        </div>
        <nav className="top-nav" aria-label="Navigation principale">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-item${isActive ? " nav-item-active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main-wide">
        <Outlet />
      </main>
    </>
  );
}
