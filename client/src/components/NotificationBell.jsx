import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell, BellRing, CheckCheck, CircleCheck, Hourglass, PiggyBank, Split, TrendingUp, Users, X } from "lucide-react";
import { useSocketEvent } from "../context/RealtimeContext.jsx";
import api from "../api/client.js";
import { timeAgo } from "../utils/format.js";

const POLL_MS = 5 * 60000; // fallback only - new notifications arrive instantly over Socket.io
const TYPE_ICONS = { renewal: BellRing, trial: Hourglass, payment: CircleCheck, price: TrendingUp, budget: PiggyBank, team: Users, split: Split, system: Bell };

// Bell with unread badge; checks for new notifications every minute.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const panelRef = useRef(null);

  const load = useCallback(() => {
    api.get("/notifications").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Real-time: the server pushes each new notification the moment it's created.
  useSocketEvent("notification", (notification) => {
    setData((d) => ({ unread: d.unread + 1, items: [notification, ...d.items].slice(0, 30) }));
    toast(notification.title, { icon: "🔔", id: notification._id });
  });

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => !panelRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((o) => !o);
  };

  const openItem = async (item) => {
    if (!item.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((n) => (n._id === item._id ? { ...n, read: true } : n)) }));
      api.patch(`/notifications/${item._id}/read`).catch(() => {});
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const markAllRead = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((n) => ({ ...n, read: true })) }));
    await api.patch("/notifications/read-all").catch(() => {});
  };

  const remove = async (e, item) => {
    e.stopPropagation();
    setData((d) => ({ unread: d.unread - (item.read ? 0 : 1), items: d.items.filter((n) => n._id !== item._id) }));
    await api.delete(`/notifications/${item._id}`).catch(() => {});
  };

  return (
    <div className="relative" ref={panelRef}>
      <button className="icon-btn relative" onClick={toggle} aria-label={`Notifications (${data.unread} unread)`} aria-expanded={open}>
        <Bell className="size-5" />
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <p className="section-title">Notifications</p>
            {data.unread > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">You're all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
              {data.items.map((item) => {
                const Icon = TYPE_ICONS[item.type] || Bell;
                return (
                  <li key={item._id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openItem(item)}
                      onKeyDown={(e) => e.key === "Enter" && openItem(item)}
                      className={`group flex cursor-pointer gap-3 px-4 py-3 hover:bg-stone-50 ${item.read ? "" : "bg-blue-50/60"}`}
                    >
                      <Icon className={`mt-0.5 size-4 shrink-0 ${item.read ? "text-stone-400" : "text-blue-700"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${item.read ? "text-stone-700" : "font-medium"}`}>{item.title}</p>
                        {item.message && <p className="mt-0.5 text-xs text-stone-500">{item.message}</p>}
                        <p className="mt-1 text-xs text-stone-400">{timeAgo(item.createdAt)}</p>
                      </div>
                      <button onClick={(e) => remove(e, item)} className="icon-btn h-fit opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Delete notification">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
