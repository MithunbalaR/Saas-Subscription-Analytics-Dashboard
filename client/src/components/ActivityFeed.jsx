import { useCallback, useEffect, useState } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import api from "../api/client.js";
import { useSocketEvent } from "../context/RealtimeContext.jsx";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { Avatar, Skeleton } from "./ui.jsx";
import { timeAgo } from "../utils/format.js";

// "Priya added Linear · 2 hours ago" - the workspace's audit trail, updated live.
export default function ActivityFeed() {
  const { current } = useWorkspace();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async (nextPage = 1) => {
    const { data } = await api.get("/activity", { params: { page: nextPage, limit: 15 } });
    setItems((prev) => (nextPage === 1 ? data.items : [...(prev || []), ...data.items]));
    setPage(data.page);
    setPages(data.pages);
  }, []);

  useEffect(() => {
    load(1).catch(() => setItems([]));
  }, [load]);

  useSocketEvent("data:changed", (event) => {
    if (event.workspaceId === current?._id) load(1).catch(() => {});
  });

  return (
    <section className="card">
      <h2 className="section-title flex items-center gap-2 border-b border-stone-200 px-5 py-4">
        <ActivityIcon className="size-4 text-stone-400" /> Recent activity
        <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-stone-500">
          <span className="size-1.5 animate-pulse rounded-full bg-green-600" /> live
        </span>
      </h2>
      {!items ? (
        <div className="space-y-3 p-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">No activity yet. Changes made by anyone in this workspace will appear here.</p>
      ) : (
        <>
          <ul className="divide-y divide-stone-100">
            {items.map((a) => (
              <li key={a._id} className="flex items-start gap-3 px-5 py-3">
                <Avatar user={a.user || { name: "?" }} size="size-8" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    <span className="font-medium">{a.user?.name || "Someone"}</span> {a.action} {a.entity === "member" ? "member" : a.entity === "workspace" ? "" : `${a.entity}`}{" "}
                    <span className="font-medium">{a.entityName}</span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {a.details && <span>{a.details} · </span>}
                    {timeAgo(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {page < pages && (
            <div className="border-t border-stone-200 p-3 text-center">
              <button className="text-sm font-medium text-blue-700 hover:underline" onClick={() => load(page + 1)}>Load more</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
