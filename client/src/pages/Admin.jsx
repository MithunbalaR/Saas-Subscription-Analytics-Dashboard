import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, Building2, FileText, Layers, Search, Trash2, Users, Wallet } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Alert, Avatar, PageHeader, Pagination, Skeleton, StatCard, TableSkeleton } from "../components/ui.jsx";
import ChartCard from "../components/charts/ChartCard.jsx";
import SpendTrendChart from "../components/charts/SpendTrendChart.jsx";
import CategoryChart from "../components/charts/CategoryChart.jsx";
import { formatDate, formatMoney, timeAgo } from "../utils/format.js";

const count = (v) => String(v);

function UsersTable() {
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    api
      .get("/admin/users", { params: { q: query || undefined, page, limit: 8 } })
      .then(({ data }) => setResult(data))
      .catch((err) => toast.error(getErrorMessage(err)));
  }, [query, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const changeRole = async (user, role) => {
    try {
      await api.patch(`/admin/users/${user._id}`, { role });
      toast.success(`${user.name} is now ${role === "admin" ? "an admin" : "a regular user"}`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`Delete ${user.name} (${user.email}) and every workspace they own? This can't be undone.`)) return;
    try {
      const { data } = await api.delete(`/admin/users/${user._id}`);
      toast.success(data.message);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
        <h2 className="section-title">Users</h2>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            className="input pl-9"
            placeholder="Search name or email"
            aria-label="Search users"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {!result ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-stone-200 bg-stone-50">
                <tr>
                  <th className="th">User</th>
                  <th className="th">Role</th>
                  <th className="th text-right">Workspaces</th>
                  <th className="th text-right">Subscriptions</th>
                  <th className="th">Joined</th>
                  <th className="th">Last login</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.items.map((u) => {
                  const isMe = u._id === me._id;
                  return (
                    <tr key={u._id}>
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} size="size-8" />
                          <div>
                            <p className="font-medium">{u.name} {isMe && <span className="text-stone-500">(you)</span>}</p>
                            <p className="text-xs text-stone-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <select className="input w-auto py-1" value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="td text-right tabular-nums">{u.workspaceCount}</td>
                      <td className="td text-right tabular-nums">{u.subscriptionCount}</td>
                      <td className="td text-stone-600">{formatDate(u.createdAt)}</td>
                      <td className="td text-stone-600">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                      <td className="td text-right">
                        <button className="icon-btn hover:text-red-700" disabled={isMe} onClick={() => remove(u)} aria-label={`Delete ${u.name}`} title={isMe ? "You can't delete yourself" : "Delete user"}>
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-2">
            <Pagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} label="users" />
          </div>
        </>
      )}
    </section>
  );
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [sendingReports, setSendingReports] = useState(false);

  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch((err) => setError(getErrorMessage(err)));
  }, []);

  const runReminders = async () => {
    setRunning(true);
    try {
      const { data } = await api.post("/admin/run-reminders");
      toast.success(`Checked ${data.checked} upcoming renewals, sent ${data.notificationsCreated} new reminders`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const sendReports = async () => {
    if (!window.confirm("Email last month's PDF report to every user who has email turned on?")) return;
    setSendingReports(true);
    try {
      const { data } = await api.post("/admin/run-monthly-reports");
      toast.success(`Sent ${data.emailsSent} report emails for ${data.month}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSendingReports(false);
    }
  };

  if (error) return <Alert>{error}</Alert>;

  return (
    <>
      <PageHeader title="Admin panel" description="Platform-wide statistics and user management.">
        <button className="btn btn-secondary" onClick={runReminders} disabled={running}>
          <BellRing className="size-4" /> {running ? "Running…" : "Run reminder job now"}
        </button>
        <button className="btn btn-secondary" onClick={sendReports} disabled={sendingReports}>
          <FileText className="size-4" /> {sendingReports ? "Sending…" : "Send monthly reports now"}
        </button>
      </PageHeader>

      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={stats.users} hint={`${stats.admins} admin${stats.admins === 1 ? "" : "s"}`} icon={Users} />
            <StatCard label="Workspaces" value={stats.workspaces} hint={`${stats.teamWorkspaces} shared team workspaces`} icon={Building2} />
            <StatCard label="Subscriptions tracked" value={stats.subscriptions} hint={`${stats.activeSubscriptions} active · ${stats.expenses} expenses`} icon={Layers} />
            <StatCard label="Platform monthly spend" value={formatMoney(stats.platformMonthlySpend, stats.currency)} hint="All active plans, converted to INR" icon={Wallet} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="New sign-ups"
              subtitle="Users registered per month"
              rows={stats.signups}
              emptyMessage="No sign-ups yet."
              columns={[
                { key: "fullLabel", label: "Month" },
                { key: "count", label: "Sign-ups", align: "right" },
              ]}
            >
              <SpendTrendChart data={stats.signups} dataKey="count" name="Sign-ups" formatValue={count} detail={null} />
            </ChartCard>

            <ChartCard
              title="Most popular tools"
              subtitle="Number of workspaces tracking each SaaS tool"
              rows={stats.topTools}
              emptyMessage="No subscriptions yet."
              columns={[
                { key: "name", label: "Tool" },
                { key: "count", label: "Subscriptions", align: "right" },
                { key: "workspaces", label: "Workspaces", align: "right" },
              ]}
            >
              <CategoryChart data={stats.topTools} labelKey="name" dataKey="count" name="Subscriptions" formatValue={count} detail={(r) => `${r.workspaces} workspace${r.workspaces === 1 ? "" : "s"}`} />
            </ChartCard>
          </div>
        </>
      )}

      <UsersTable />
    </>
  );
}
