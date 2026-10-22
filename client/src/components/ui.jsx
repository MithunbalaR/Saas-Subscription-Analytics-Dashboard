import { useEffect } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CircleX,
  Loader2,
  X,
} from "lucide-react";
import { daysUntil } from "../utils/format.js";

export function Spinner({ fullScreen = false }) {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? "min-h-screen" : "py-20"}`}>
      <Loader2 className="size-6 animate-spin text-blue-600" aria-label="Loading" />
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-stone-200/70 ${className}`} />;
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3 p-4" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="size-8" />
      <span className="text-lg font-semibold tracking-tight">SubTrack</span>
    </div>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Alert({ type = "error", children, onClose }) {
  const styles =
    type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800";
  const Icon = type === "error" ? AlertCircle : CheckCircle2;
  return (
    <div role="alert" className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[90vh] w-full overflow-y-auto p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-500">{label}</p>
        {Icon && <Icon className="size-4 text-stone-400" />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES = {
  active: { cls: "bg-green-50 text-green-800 ring-green-600/20", Icon: CheckCircle2 },
  paused: { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: CirclePause },
  cancelled: { cls: "bg-stone-100 text-stone-600 ring-stone-500/20", Icon: CircleX },
};

export function StatusBadge({ status }) {
  const { cls, Icon } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${cls}`}>
      <Icon className="size-3" />
      {status}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700 ring-stone-500/20",
    blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

export function RenewalLabel({ date }) {
  const days = daysUntil(date);
  if (days < 0) return <span className="text-xs font-medium text-red-700">Overdue by {-days}d</span>;
  if (days === 0) return <span className="text-xs font-medium text-red-700">Due today</span>;
  if (days <= 3) return <span className="text-xs font-medium text-amber-700">In {days}d</span>;
  return <span className="text-xs text-stone-500">In {days}d</span>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-3 rounded-full bg-stone-100 p-3">
          <Icon className="size-6 text-stone-500" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ user, size = "size-9" }) {
  if (user?.avatar) return <img src={user.avatar} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700`}>
      {user?.name?.charAt(0).toUpperCase() || "?"}
    </div>
  );
}

// Clickable table header that cycles the sort order.
export function SortHeader({ label, field, sort, onSort, align = "left" }) {
  const active = sort.field === field;
  const Icon = !active ? ArrowUpDown : sort.order === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`th ${align === "right" ? "text-right" : ""}`} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={`inline-flex items-center gap-1 uppercase hover:text-stone-900 ${active ? "text-stone-900" : ""}`}
        onClick={() => onSort({ field, order: active && sort.order === "asc" ? "desc" : "asc" })}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}

export function Pagination({ page, pages, total, onChange, label = "items" }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-stone-500">
        {total} {label} · Page {page} of {pages}
      </span>
      <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </button>
      <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-stone-700">{label}</span>
        {description && <span className="block text-xs text-stone-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-stone-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}
