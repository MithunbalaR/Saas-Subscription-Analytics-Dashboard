import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Alert } from "./ui.jsx";
import { getErrorMessage } from "../api/client.js";
import { CATEGORIES, CURRENCIES } from "../utils/constants.js";
import { formatFileSize, toInputDate, todayInputDate } from "../utils/format.js";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const toForm = (expense, defaultCurrency) => ({
  title: expense?.title ?? "",
  amount: expense ? String(expense.amount) : "",
  currency: expense?.currency ?? defaultCurrency,
  category: expense?.category ?? "Other",
  date: expense ? toInputDate(expense.date) : todayInputDate(),
  subscription: expense?.subscription?._id ?? "",
  notes: expense?.notes ?? "",
});

// onSubmit receives (formData, { file, removeReceipt }) so the page can upload the receipt after saving.
export default function ExpenseForm({ expense, subscriptions, currency, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toForm(expense, currency));
  const [file, setFile] = useState(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Picking a subscription pre-fills the title, amount, currency and category.
  const linkSubscription = (e) => {
    const sub = subscriptions.find((s) => s._id === e.target.value);
    setForm((f) =>
      sub
        ? { ...f, subscription: sub._id, title: f.title || sub.name, amount: f.amount || String(sub.cost), currency: sub.currency, category: sub.category }
        : { ...f, subscription: "" }
    );
  };

  const chooseFile = (e) => {
    const chosen = e.target.files[0];
    if (chosen && chosen.size > MAX_RECEIPT_BYTES) {
      setError("Receipt must be 5 MB or smaller");
      e.target.value = "";
      return;
    }
    setError("");
    setFile(chosen || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({ ...form, amount: Number(form.amount) }, { file, removeReceipt });
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const existingReceipt = expense?.receipt?.filename && !removeReceipt ? expense.receipt : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <div>
        <label htmlFor="subscription" className="label">
          Linked subscription <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <select id="subscription" name="subscription" className="input" value={form.subscription} onChange={linkSubscription}>
          <option value="">None (one-off expense)</option>
          {subscriptions.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" name="title" className="input" required value={form.title} onChange={update} placeholder="e.g. Domain renewal" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="amount" className="label">Amount</label>
          <input id="amount" name="amount" type="number" min="0" step="0.01" className="input" required value={form.amount} onChange={update} />
        </div>
        <div>
          <label htmlFor="currency" className="label">Currency</label>
          <select id="currency" name="currency" className="input" value={form.currency} onChange={update}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="date" className="label">Date</label>
          <input id="date" name="date" type="date" className="input" required value={form.date} onChange={update} />
        </div>
      </div>

      <div>
        <label htmlFor="category" className="label">Category</label>
        <select id="category" name="category" className="input" value={form.category} onChange={update}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Receipt / invoice <span className="font-normal text-stone-400">(optional, PDF or image, max 5 MB)</span></span>
        {existingReceipt && !file ? (
          <div className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="size-4 shrink-0 text-stone-400" />
              <span className="truncate">{existingReceipt.originalName}</span>
              <span className="shrink-0 text-xs text-stone-500">{formatFileSize(existingReceipt.size)}</span>
            </span>
            <button type="button" className="icon-btn" onClick={() => setRemoveReceipt(true)} aria-label="Remove receipt">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={chooseFile}
            aria-label="Receipt file"
            className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
          />
        )}
      </div>

      <div>
        <label htmlFor="notes" className="label">Notes</label>
        <textarea id="notes" name="notes" rows={2} className="input" value={form.notes} onChange={update} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : expense ? "Save changes" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
