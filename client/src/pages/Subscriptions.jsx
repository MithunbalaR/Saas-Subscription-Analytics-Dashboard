import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, FileUp, Pencil, Plus, Repeat, Search, Trash2, TrendingUp, Users } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { useLiveRefresh } from "../context/RealtimeContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import { Alert, Badge, EmptyState, Modal, PageHeader, RenewalLabel, SortHeader, StatusBadge, TableSkeleton } from "../components/ui.jsx";
import ServiceLogo from "../components/ServiceLogo.jsx";
import SubscriptionDetails from "../components/SubscriptionDetails.jsx";
import ImportModal from "../components/ImportModal.jsx";
import SubscriptionForm from "../components/SubscriptionForm.jsx";
import ExportMenu from "../components/ExportMenu.jsx";
import { CATEGORIES, CYCLE_SHORT, STATUSES, capitalize } from "../utils/constants.js";
import { canPayNow, formatDate, formatMoney, formatMoneyCode, paymentOpensOn, toInputDate } from "../utils/format.js";
import { downloadCSV, downloadPDF, fileStamp } from "../utils/export.js";

export default function Subscriptions() {
  const { current, currency } = useWorkspace();
  const money = (v) => formatMoney(v, currency);

  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "", category: "" });
  const [sort, setSort] = useState({ field: "nextRenewal", order: "asc" });
  const [editing, setEditing] = useState(null); // null = closed, {} = new, subscription = edit
  const [detailsId, setDetailsId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();

  // Deep links from the command palette / app shortcuts: ?new=1, ?import=1, ?open=<id>
  useEffect(() => {
    if (searchParams.get("new")) setEditing({});
    if (searchParams.get("import")) setImporting(true);
    if (searchParams.get("open")) setDetailsId(searchParams.get("open"));
    if ([...searchParams.keys()].length) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    try {
      const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), sort: sort.field, order: sort.order };
      const { data } = await api.get("/subscriptions", { params });
      setSubscriptions(data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, sort]);

  // Small delay so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  // Refresh when a teammate changes subscriptions (Socket.io).
  useLiveRefresh(["subscription"], load);

  const updateFilter = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (form) => {
    const { data } = editing._id ? await api.put(`/subscriptions/${editing._id}`, form) : await api.post("/subscriptions", form);
    const emailed = data.splitEmailsSent || 0;
    toast.success(
      `${form.name} ${editing._id ? "updated" : "added"}` +
        (emailed ? `. Share details emailed to ${emailed} ${emailed === 1 ? "person" : "people"}.` : ""),
      { duration: emailed ? 5000 : 3000 }
    );
    setEditing(null);
    load();
  };

  const handlePay = async (sub) => {
    try {
      const { data } = await api.post(`/subscriptions/${sub._id}/pay`);
      toast.success(
        `${sub.name} renewed: ${formatMoney(sub.cost, sub.currency)} recorded and a confirmation email sent. Next renewal ${formatDate(data.subscription.nextRenewal)}; you can mark it paid from ${formatDate(data.paymentOpensOn)}.`,
        { duration: 6000 }
      );
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDelete = async (sub) => {
    if (!window.confirm(`Delete ${sub.name}? Past payments stay in your expenses.`)) return;
    try {
      await api.delete(`/subscriptions/${sub._id}`);
      toast.success(`${sub.name} deleted`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const activeMonthly = subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + s.monthlyCostBase, 0);
  const hasFilters = Object.values(filters).some(Boolean);

  const handleExport = async (format) => {
    const columns = [
      { label: "Service", value: (s) => s.name },
      { label: "Category", value: (s) => s.category },
      { label: "Cost", value: (s) => formatMoneyCode(s.cost, s.currency), csv: (s) => s.cost, align: "right" },
      { label: "Currency", value: (s) => s.currency },
      { label: "Billing", value: (s) => capitalize(s.billingCycle) },
      { label: `Per month (${currency})`, value: (s) => formatMoneyCode(s.monthlyCostBase, currency), csv: (s) => s.monthlyCostBase, align: "right" },
      { label: "Next renewal", value: (s) => formatDate(s.nextRenewal), csv: (s) => toInputDate(s.nextRenewal) },
      { label: "Status", value: (s) => capitalize(s.status) },
    ];
    const filename = `subscriptions-${fileStamp()}`;
    if (format === "csv") return downloadCSV(`${filename}.csv`, columns, subscriptions);
    await downloadPDF(`${filename}.pdf`, {
      title: "Subscriptions",
      subtitle: `${current.name} · ${subscriptions.length} subscriptions · Active total ${formatMoneyCode(activeMonthly, currency)} per month`,
      columns: columns.filter((c) => c.label !== "Currency"),
      rows: subscriptions,
    });
  };

  return (
    <>
      <PageHeader title={t("subs.title")} description={t("subs.subtitle")}>
        <ExportMenu onExport={handleExport} disabled={subscriptions.length === 0} />
        <button className="btn btn-secondary" onClick={() => setImporting(true)}>
          <FileUp className="size-4" /> {t("subs.import")}
        </button>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus className="size-4" /> {t("subs.add")}
        </button>
      </PageHeader>

      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input name="q" className="input pl-9" placeholder="Search by name" value={filters.q} onChange={updateFilter} aria-label="Search subscriptions" />
        </div>
        <select name="status" className="input w-auto" value={filters.status} onChange={updateFilter} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{capitalize(s)}</option>
          ))}
        </select>
        <select name="category" className="input w-auto" value={filters.category} onChange={updateFilter} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={hasFilters ? "No subscriptions match your filters" : "No subscriptions yet"}
            description={hasFilters ? "Try a different search or filter." : "Add the SaaS tools you pay for to start tracking them."}
            action={
              !hasFilters && (
                <button className="btn btn-primary" onClick={() => setEditing({})}>
                  <Plus className="size-4" /> Add subscription
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <SortHeader label="Service" field="name" sort={sort} onSort={setSort} />
                    <SortHeader label="Category" field="category" sort={sort} onSort={setSort} />
                    <SortHeader label="Cost" field="cost" sort={sort} onSort={setSort} align="right" />
                    <th className="th text-right">Per month</th>
                    <SortHeader label="Next renewal" field="nextRenewal" sort={sort} onSort={setSort} />
                    <SortHeader label="Status" field="status" sort={sort} onSort={setSort} />
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {subscriptions.map((sub) => (
                    <tr key={sub._id} className="hover:bg-stone-50/60">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <ServiceLogo subscription={sub} />
                          <div className="min-w-0">
                            <button className="font-medium hover:text-blue-700 hover:underline" onClick={() => setDetailsId(sub._id)}>
                              {sub.name}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {sub.isTrial && <Badge tone="blue">Free trial</Badge>}
                              {sub.lastPriceChange?.percent > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700" title={`Price went up on ${formatDate(sub.lastPriceChange.changedAt)}`}>
                                  <TrendingUp className="size-3" /> +{Math.round(sub.lastPriceChange.percent)}%
                                </span>
                              )}
                              {sub.splitWith?.length > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-xs text-stone-500" title={`Shared with ${sub.splitWith.map((p) => p.name).join(", ")}`}>
                                  <Users className="size-3" /> shared
                                </span>
                              )}
                              {sub.paymentMethod && <span className="text-xs text-stone-500">{sub.paymentMethod}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="td text-stone-600">{sub.category}</td>
                      <td className="td text-right tabular-nums">
                        {formatMoney(sub.cost, sub.currency)}
                        <span className="text-stone-500">/{CYCLE_SHORT[sub.billingCycle]}</span>
                      </td>
                      <td className="td text-right text-stone-600 tabular-nums" title={sub.currency !== currency ? `Converted from ${sub.currency}` : undefined}>
                        {money(sub.monthlyCostBase)}
                        {sub.currency !== currency && <span className="ml-1 text-xs text-stone-400">≈</span>}
                      </td>
                      <td className="td">
                        <p>{formatDate(sub.nextRenewal)}</p>
                        {sub.status === "active" && <RenewalLabel date={sub.nextRenewal} />}
                        {sub.status === "active" && !canPayNow(sub.nextRenewal) && (
                          <p className="text-xs text-stone-400">Pay from {formatDate(paymentOpensOn(sub.nextRenewal))}</p>
                        )}
                      </td>
                      <td className="td">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {sub.status === "active" &&
                            (canPayNow(sub.nextRenewal) ? (
                              <button className="icon-btn text-green-700 hover:bg-green-50" onClick={() => handlePay(sub)} title="Mark renewal as paid" aria-label={`Mark ${sub.name} as paid`}>
                                <CircleCheck className="size-4" />
                              </button>
                            ) : (
                              // Locked until PAY_WINDOW_DAYS before the next renewal.
                              <button
                                className="icon-btn cursor-not-allowed opacity-40 hover:bg-transparent hover:text-stone-500"
                                disabled
                                title={`Paid. You can mark the next renewal as paid from ${formatDate(paymentOpensOn(sub.nextRenewal))}`}
                                aria-label={`${sub.name}: next payment opens on ${formatDate(paymentOpensOn(sub.nextRenewal))}`}
                              >
                                <CircleCheck className="size-4" />
                              </button>
                            ))}
                          <button className="icon-btn" onClick={() => setEditing(sub)} title="Edit" aria-label={`Edit ${sub.name}`}>
                            <Pencil className="size-4" />
                          </button>
                          <button className="icon-btn hover:text-red-700" onClick={() => handleDelete(sub)} title="Delete" aria-label={`Delete ${sub.name}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 text-sm">
              <span className="text-stone-500">{subscriptions.length} shown</span>
              <span>
                Active total: <span className="font-semibold tabular-nums">{money(activeMonthly)}</span>
                <span className="text-stone-500"> / month</span>
              </span>
            </div>
          </>
        )}
      </div>

      {detailsId && (
        <SubscriptionDetails
          id={detailsId}
          workspaceCurrency={currency}
          onClose={() => setDetailsId(null)}
          onEdit={(sub) => {
            setDetailsId(null);
            setEditing(sub);
          }}
        />
      )}

      {importing && <ImportModal currency={currency} onClose={() => setImporting(false)} onImported={load} />}

      {editing && (
        <Modal title={editing._id ? "Edit subscription" : "Add subscription"} onClose={() => setEditing(null)}>
          <SubscriptionForm subscription={editing} currency={currency} onSubmit={handleSave} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
