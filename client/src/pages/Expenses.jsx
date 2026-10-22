import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { FileText, Link2, Paperclip, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import api, { getErrorMessage, openProtectedFile } from "../api/client.js";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { useLiveRefresh } from "../context/RealtimeContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import ReportModal from "../components/ReportModal.jsx";
import { Alert, EmptyState, Modal, PageHeader, Pagination, SortHeader, TableSkeleton } from "../components/ui.jsx";
import ExpenseForm from "../components/ExpenseForm.jsx";
import ExportMenu from "../components/ExportMenu.jsx";
import { CATEGORIES } from "../utils/constants.js";
import { formatDate, formatMoney, formatMoneyCode, toInputDate } from "../utils/format.js";
import { downloadCSV, downloadPDF, fileStamp } from "../utils/export.js";

const PAGE_SIZE = 10;

export default function Expenses() {
  const { current, currency } = useWorkspace();

  const [result, setResult] = useState({ items: [], total: 0, page: 1, pages: 1, totalAmount: 0 });
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", category: "", from: "", to: "" });
  const [sort, setSort] = useState({ field: "date", order: "desc" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, expense = edit
  const [reportOpen, setReportOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();

  // Deep links from the command palette / app shortcuts: ?new=1, ?report=1
  useEffect(() => {
    if (searchParams.get("new")) setEditing({});
    if (searchParams.get("report")) setReportOpen(true);
    if ([...searchParams.keys()].length) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filterParams = useCallback(
    () => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), sort: sort.field, order: sort.order }),
    [filters, sort]
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/expenses", { params: { ...filterParams(), page, limit: PAGE_SIZE } });
      setResult(data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filterParams, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  // Subscriptions for the "linked subscription" dropdown in the form.
  useEffect(() => {
    api.get("/subscriptions", { params: { sort: "name" } }).then(({ data }) => setSubscriptions(data)).catch(() => {});
  }, []);

  // Refresh when a teammate adds or changes expenses (Socket.io).
  useLiveRefresh(["expense", "subscription"], load);

  const updateFilter = (e) => {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
    setPage(1);
  };
  const changeSort = (next) => {
    setSort(next);
    setPage(1);
  };

  const handleSave = async (form, { file, removeReceipt }) => {
    // Errors here are shown inside the form; the expense itself isn't saved.
    const { data: saved } = editing._id ? await api.put(`/expenses/${editing._id}`, form) : await api.post("/expenses", form);
    toast.success(`${form.title} ${editing._id ? "updated" : "added"}`);
    try {
      if (removeReceipt && !file) await api.delete(`/expenses/${saved._id}/receipt`);
      if (file) {
        const upload = new FormData();
        upload.append("receipt", file);
        await api.post(`/expenses/${saved._id}/receipt`, upload);
      }
    } catch (err) {
      toast.error(`Expense saved, but the receipt couldn't be updated: ${getErrorMessage(err)}`);
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete "${expense.title}"?`)) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      toast.success("Expense deleted");
      if (result.items.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const viewReceipt = (expense) => openProtectedFile(`/expenses/${expense._id}/receipt`).catch((err) => toast.error(getErrorMessage(err)));

  // Exports every expense matching the current filters (not just this page).
  const handleExport = async (format) => {
    const { data } = await api.get("/expenses/export", { params: filterParams() });
    const columns = [
      { label: "Date", value: (e) => formatDate(e.date), csv: (e) => toInputDate(e.date) },
      { label: "Title", value: (e) => e.title },
      { label: "Category", value: (e) => e.category },
      { label: "Subscription", value: (e) => e.subscription?.name || "" },
      { label: "Amount", value: (e) => formatMoneyCode(e.amount, e.currency), csv: (e) => e.amount, align: "right" },
      { label: "Currency", value: (e) => e.currency },
    ];
    const filename = `expenses-${fileStamp()}`;
    if (format === "csv") return downloadCSV(`${filename}.csv`, columns, data.items);

    const range = filters.from || filters.to ? `${filters.from || "start"} to ${filters.to || "today"}` : "All dates";
    await downloadPDF(`${filename}.pdf`, {
      title: "Expense report",
      subtitle: `${current.name} · ${range}${filters.category ? ` · ${filters.category}` : ""} · ${data.items.length} expenses`,
      columns: columns.filter((c) => c.label !== "Currency"),
      rows: data.items,
      footer: ["", "", "", `Total (${currency})`, formatMoneyCode(data.totalAmount, currency)],
    });
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title={t("expenses.title")} description={t("expenses.subtitle")}>
        <button className="btn btn-secondary" onClick={() => setReportOpen(true)}>
          <FileText className="size-4" /> {t("expenses.report")}
        </button>
        <ExportMenu onExport={handleExport} disabled={result.total === 0} />
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus className="size-4" /> {t("expenses.add")}
        </button>
      </PageHeader>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}

      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input name="q" className="input pl-9" placeholder="Search by title" value={filters.q} onChange={updateFilter} aria-label="Search expenses" />
        </div>
        <select name="category" className="input w-auto" value={filters.category} onChange={updateFilter} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <input name="from" type="date" className="input w-auto" value={filters.from} onChange={updateFilter} aria-label="From date" />
          to
          <input name="to" type="date" className="input w-auto" value={filters.to} onChange={updateFilter} aria-label="To date" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : result.total === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters ? "No expenses match your filters" : "No expenses yet"}
            description={hasFilters ? "Try a different search or date range." : "Mark a subscription renewal as paid, or add a one-off expense."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-stone-200 bg-stone-50">
                  <tr>
                    <SortHeader label="Date" field="date" sort={sort} onSort={changeSort} />
                    <SortHeader label="Title" field="title" sort={sort} onSort={changeSort} />
                    <SortHeader label="Category" field="category" sort={sort} onSort={changeSort} />
                    <SortHeader label="Amount" field="amount" sort={sort} onSort={changeSort} align="right" />
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {result.items.map((expense) => (
                    <tr key={expense._id} className="hover:bg-stone-50/60">
                      <td className="td text-stone-600 tabular-nums">{formatDate(expense.date)}</td>
                      <td className="td">
                        <p className="font-medium">{expense.title}</p>
                        {expense.subscription && (
                          <p className="flex items-center gap-1 text-xs text-stone-500">
                            <Link2 className="size-3" /> {expense.subscription.name}
                          </p>
                        )}
                      </td>
                      <td className="td text-stone-600">{expense.category}</td>
                      <td className="td text-right font-medium tabular-nums">{formatMoney(expense.amount, expense.currency)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {expense.receipt?.filename && (
                            <button className="icon-btn" onClick={() => viewReceipt(expense)} title={`View receipt: ${expense.receipt.originalName}`} aria-label={`View receipt for ${expense.title}`}>
                              <Paperclip className="size-4" />
                            </button>
                          )}
                          <button className="icon-btn" onClick={() => setEditing(expense)} title="Edit" aria-label={`Edit ${expense.title}`}>
                            <Pencil className="size-4" />
                          </button>
                          <button className="icon-btn hover:text-red-700" onClick={() => handleDelete(expense)} title="Delete" aria-label={`Delete ${expense.title}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-2 text-sm">
              <Pagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} label="expenses" />
              <span>
                Total: <span className="font-semibold tabular-nums">{formatMoney(result.totalAmount, currency)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {editing && (
        <Modal title={editing._id ? "Edit expense" : "Add expense"} onClose={() => setEditing(null)}>
          <ExpenseForm
            expense={editing._id ? editing : null}
            subscriptions={subscriptions}
            currency={currency}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}
