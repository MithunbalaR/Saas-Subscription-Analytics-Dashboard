import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Download,
  LayoutDashboard,
  Moon,
  Plus,
  Receipt,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Split,
  Users,
} from "lucide-react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import ServiceLogo from "./ServiceLogo.jsx";

// Ctrl+K / ⌘K quick launcher: jump to pages, run actions, find subscriptions, switch workspaces.
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark, setTheme } = useTheme();
  const { workspaces, current, select } = useWorkspace();
  const [query, setQuery] = useState("");
  const [subscriptions, setSubscriptions] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    api.get("/subscriptions", { params: { sort: "name" } }).then(({ data }) => setSubscriptions(data)).catch(() => {});
  }, [open]);

  const commands = useMemo(() => {
    const go = (path) => () => navigate(path);
    const list = [
      { group: "Pages", label: "Dashboard", icon: LayoutDashboard, run: go("/") },
      { group: "Pages", label: "Subscriptions", icon: Repeat, run: go("/subscriptions") },
      { group: "Pages", label: "Expenses", icon: Receipt, run: go("/expenses") },
      { group: "Pages", label: "Calendar", icon: CalendarDays, run: go("/calendar") },
      { group: "Pages", label: "Splits", icon: Split, run: go("/splits") },
      { group: "Pages", label: "Team & activity", icon: Users, run: go("/team") },
      { group: "Pages", label: "Settings", icon: Settings, run: go("/settings") },
      { group: "Actions", label: "Add a subscription", icon: Plus, run: go("/subscriptions?new=1") },
      { group: "Actions", label: "Add an expense", icon: Plus, run: go("/expenses?new=1") },
      { group: "Actions", label: "Import subscriptions from CSV/Excel", icon: Download, run: go("/subscriptions?import=1") },
      { group: "Actions", label: "Download last month's report", icon: Download, run: go("/expenses?report=1") },
      { group: "Actions", label: `Switch to ${isDark ? "light" : "dark"} mode`, icon: Moon, run: () => setTheme(isDark ? "light" : "dark") },
      ...workspaces
        .filter((w) => w._id !== current?._id)
        .map((w) => ({ group: "Workspaces", label: `Switch to ${w.name}`, icon: Users, run: () => select(w._id) })),
      ...subscriptions.map((s) => ({
        group: "Subscriptions",
        label: s.name,
        hint: s.category,
        logo: s,
        run: () => navigate(`/subscriptions?open=${s._id}`),
      })),
    ];
    if (user?.role === "admin") list.splice(7, 0, { group: "Pages", label: "Admin panel", icon: ShieldCheck, run: go("/admin") });
    return list;
  }, [navigate, isDark, setTheme, workspaces, current, select, subscriptions, user]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? commands.filter((c) => `${c.label} ${c.hint || ""}`.toLowerCase().includes(q)) : commands.filter((c) => c.group !== "Subscriptions");
    return matched.slice(0, 12);
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const runAt = (index) => {
    const command = results[index];
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Escape") onClose();
  };

  let lastGroup = null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={onClose}>
      <div role="dialog" aria-label="Command palette" className="card w-full max-w-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-stone-200 px-4">
          <Search className="size-4 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, actions, subscriptions…"
            aria-label="Search commands"
            className="w-full bg-transparent py-3.5 text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
          <kbd className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2" role="listbox">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-stone-500">No matches for "{query}"</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={`${c.group}-${c.label}`}>
                {header && <p className="px-4 pt-2 pb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase">{header}</p>}
                <button
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? "bg-blue-50 text-blue-700" : "text-stone-700"}`}
                >
                  {c.logo ? <ServiceLogo subscription={c.logo} size="size-5" /> : <Icon className="size-4 shrink-0" />}
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-xs text-stone-400">{c.hint}</span>}
                  {i === active && <ArrowRight className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-500">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>Ctrl K to toggle</span>
        </div>
      </div>
    </div>
  );
}
