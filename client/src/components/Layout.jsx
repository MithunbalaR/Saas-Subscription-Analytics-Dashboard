import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Split,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useRealtime } from "../context/RealtimeContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import CommandPalette from "./CommandPalette.jsx";
import AiAssistant from "./AiAssistant.jsx";
import { Brand, Spinner } from "./ui.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

const NAV_ITEMS = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/subscriptions", key: "nav.subscriptions", icon: Repeat },
  { to: "/expenses", key: "nav.expenses", icon: Receipt },
  { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/splits", key: "nav.splits", icon: Split },
  { to: "/team", key: "nav.team", icon: Users },
  { to: "/settings", key: "nav.settings", icon: Settings },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-blue-50 text-blue-700" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
  }`;

function WorkspaceSwitcher() {
  const { workspaces, current, select } = useWorkspace();
  const { t } = useI18n();
  return (
    <div className="px-3 pb-3">
      <label htmlFor="workspace" className="mb-1 block px-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
        {t("nav.workspace")}
      </label>
      <select id="workspace" className="input" value={current?._id || ""} onChange={(e) => select(e.target.value)}>
        {workspaces.map((w) => (
          <option key={w._id} value={w._id}>
            {w.name} {w.isPersonal ? "(personal)" : `· ${w.members.length} members`}
          </option>
        ))}
      </select>
    </div>
  );
}

function ThemeToggle() {
  const { isDark, setTheme } = useTheme();
  return (
    <button className="icon-btn" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={`Switch to ${isDark ? "light" : "dark"} mode`} title="Toggle dark mode">
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { current, loading, reload } = useWorkspace();
  const { connected } = useRealtime();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  // Ctrl+K / ⌘K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <Spinner fullScreen />;
  if (!current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-stone-500">Couldn't load your workspaces. Check that the server is running.</p>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => reload().catch(() => {})}>Try again</button>
          <button className="btn btn-secondary" onClick={logout}>{t("nav.logout")}</button>
        </div>
      </div>
    );
  }
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen">
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMenu} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-200 bg-surface transition-transform md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Brand />
          <button className="icon-btn md:hidden" onClick={closeMenu} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <WorkspaceSwitcher />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV_ITEMS.map(({ to, key, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={closeMenu} className={navClass}>
              <Icon className="size-4" />
              {t(key)}
            </NavLink>
          ))}
          {user.role === "admin" && (
            <>
              <p className="px-3 pt-4 pb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">{t("nav.adminSection")}</p>
              <NavLink to="/admin" onClick={closeMenu} className={navClass}>
                <ShieldCheck className="size-4" />
                {t("nav.admin")}
              </NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-stone-200 p-4">
          <div className="mb-3 min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-stone-500">{user.email}</p>
          </div>
          <button onClick={logout} className="btn btn-secondary w-full">
            <LogOut className="size-4" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <div className="md:ml-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-surface/90 px-4 py-2.5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button className="icon-btn md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <p className="flex min-w-0 items-center gap-2 truncate text-sm text-stone-500">
              <span
                className={`size-2 shrink-0 rounded-full ${connected ? "bg-green-600" : "bg-stone-300"}`}
                title={connected ? "Live updates on" : "Live updates reconnecting…"}
                aria-label={connected ? "Live updates on" : "Live updates off"}
              />
              <span className="truncate">
                <span className="font-medium text-stone-900">{current.name}</span> · {current.currency}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 sm:flex"
            >
              <Search className="size-4" /> {t("nav.search")}
              <kbd className="rounded border border-stone-200 px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <button className="icon-btn sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search className="size-5" />
            </button>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-24">
          <div className="mx-auto max-w-6xl">
            <Suspense fallback={<Spinner />}>
              {/* Keyed by workspace so every page reloads its data when the workspace changes. */}
              <ErrorBoundary key={`${current._id}-${location.pathname}`}>
                <Outlet key={current._id} />
              </ErrorBoundary>
            </Suspense>
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AiAssistant key={current._id} />
    </div>
  );
}
