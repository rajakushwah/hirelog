import { Suspense } from "react";
import { Spinner } from "./ui";
import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Briefcase, CalendarBlank, House, MagnifyingGlass, Question, User, type IconProps } from "@phosphor-icons/react";
import { useAuth } from "../auth";
import { useInterviewReminders } from "../reminders";
import { Logo } from "./Logo";

type Tab = { to: string; label: string; short: string; Icon: ComponentType<IconProps>; end?: boolean };

const TABS: Tab[] = [
  { to: "/", label: "Dashboard", short: "Dashboard", Icon: House, end: true },
  { to: "/applications", label: "Applications", short: "Apps", Icon: Briefcase },
  { to: "/interviews", label: "Interviews", short: "Interviews", Icon: CalendarBlank },
  { to: "/questions", label: "Questions", short: "Questions", Icon: Question },
  { to: "/profile", label: "Profile", short: "Profile", Icon: User },
];

export function Layout() {
  const { user } = useAuth();
  useInterviewReminders();
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <Logo size={36} />
          HireLog
        </div>
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            {({ isActive }) => (
              <>
                <Icon size={22} weight={isActive ? "fill" : "regular"} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        <NavLink to="/search" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          {({ isActive }) => (
            <>
              <MagnifyingGlass size={22} weight={isActive ? "bold" : "regular"} />
              Search
            </>
          )}
        </NavLink>
        <div className="sidebar-footer">
          <NavLink to="/profile" className="nav-item">
            {user?.profile_image ? (
              <img className="avatar sm" src={user.profile_image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar sm">{user?.name?.[0]?.toUpperCase() ?? "U"}</span>
            )}
            <span className="grow">
              <span className="truncate" style={{ color: "var(--on-surface)" }}>{user?.name}</span>
              <span className="small truncate">{user?.email}</span>
            </span>
          </NavLink>
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main navigation">
        {TABS.map(({ to, short, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            {({ isActive }) => (
              <>
                <Icon size={22} weight={isActive ? "fill" : "regular"} />
                {short}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
