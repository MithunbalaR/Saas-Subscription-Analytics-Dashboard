import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Toggle } from "./ui.jsx";
import { getErrorMessage } from "../api/client.js";
import { BILLING_CYCLES, CATEGORIES, CURRENCIES, STATUSES, capitalize } from "../utils/constants.js";
import { formatMoney, toInputDate, todayInputDate } from "../utils/format.js";

const FIELDS = ["name", "category", "cost", "currency", "billingCycle", "nextRenewal", "status", "isTrial", "paymentMethod", "website", "notes"];

const toForm = (sub, defaultCurrency) => {
  const empty = {
    name: "",
    category: "Productivity",
    cost: "",
    currency: defaultCurrency,
    billingCycle: "monthly",
    nextRenewal: todayInputDate(),
    status: "active",
    paymentMethod: "",
    website: "",
    notes: "",
    isTrial: false,
    splitWith: [],
  };
  if (!sub?._id) return empty;
  return {
    ...Object.fromEntries(FIELDS.map((k) => [k, sub[k] ?? empty[k]])),
    cost: String(sub.cost),
    nextRenewal: toInputDate(sub.nextRenewal),
    splitWith: (sub.splitWith || []).map((p) => ({ name: p.name, email: p.email || "", share: String(p.share) })),
  };
};

// "Split the cost" section: other people and their % share. Whatever is left is your share.
function SplitEditor({ parts, cost, currency, onChange }) {
  const othersTotal = parts.reduce((sum, p) => sum + (Number(p.share) || 0), 0);
  const yourShare = 100 - othersTotal;
  const setPart = (index, field, value) => onChange(parts.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  const addPerson = () => {
    // Default to an equal split between you and everyone.
    const equal = Math.floor(100 / (parts.length + 2));
    onChange([...parts.map((p) => ({ ...p, share: String(equal) })), { name: "", email: "", share: String(equal) }]);
  };

  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-700">Split the cost</p>
          <p className="text-xs text-stone-500">
            Family plan or shared tool? Each payment records who owes you. People with an email get a message with their share.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addPerson} disabled={parts.length >= 10}>
          <Plus className="size-3.5" /> Add person
        </button>
      </div>
      {parts.length > 0 && (
        <div className="mt-3 space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] items-center gap-2">
              <input className="input" placeholder="Name" aria-label={`Person ${i + 1} name`} value={p.name} required onChange={(e) => setPart(i, "name", e.target.value)} />
              <input className="input" type="email" placeholder="Email (optional)" aria-label={`Person ${i + 1} email`} value={p.email} onChange={(e) => setPart(i, "email", e.target.value)} />
              <div className="relative">
                <input className="input pr-6" type="number" min="1" max="99" required aria-label={`Person ${i + 1} share percent`} value={p.share} onChange={(e) => setPart(i, "share", e.target.value)} />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-stone-400">%</span>
              </div>
              <button type="button" className="icon-btn hover:text-red-700" onClick={() => onChange(parts.filter((_, j) => j !== i))} aria-label={`Remove person ${i + 1}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <p className={`text-xs ${yourShare < 1 ? "font-medium text-red-700" : "text-stone-500"}`}>
            {yourShare < 1
              ? "The other shares must add up to less than 100%."
              : `Your share: ${yourShare}% (${formatMoney((cost * yourShare) / 100, currency)}). Others pay ${formatMoney((cost * othersTotal) / 100, currency)} per payment.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionForm({ subscription, currency, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toForm(subscription, currency));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        ...form,
        cost: Number(form.cost),
        splitWith: form.splitWith.filter((p) => p.name.trim()).map((p) => ({ ...p, share: Number(p.share) })),
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <div>
        <label htmlFor="name" className="label">Service name</label>
        <input id="name" name="name" className="input" required value={form.name} onChange={update} placeholder="e.g. Notion" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="cost" className="label">Cost</label>
          <input id="cost" name="cost" type="number" min="0" step="0.01" className="input" required value={form.cost} onChange={update} />
        </div>
        <div>
          <label htmlFor="currency" className="label">Currency</label>
          <select id="currency" name="currency" className="input" value={form.currency} onChange={update}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {form.currency !== currency && (
        <p className="-mt-2 text-xs text-stone-500">Analytics will convert this to {currency} using live exchange rates.</p>
      )}

      <div className="rounded-lg border border-stone-200 p-3">
        <Toggle
          label="This is a free trial"
          description="You'll be warned before the trial ends and the first charge happens."
          checked={form.isTrial}
          onChange={(isTrial) => setForm((f) => ({ ...f, isTrial }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="billingCycle" className="label">Billing cycle</label>
          <select id="billingCycle" name="billingCycle" className="input" value={form.billingCycle} onChange={update}>
            {BILLING_CYCLES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
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
          <label htmlFor="nextRenewal" className="label">{form.isTrial ? "Trial ends (first charge)" : "Next renewal"}</label>
          <input id="nextRenewal" name="nextRenewal" type="date" className="input" required value={form.nextRenewal} onChange={update} />
        </div>
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" className="input" value={form.status} onChange={update}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{capitalize(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="paymentMethod" className="label">Payment method</label>
          <input id="paymentMethod" name="paymentMethod" className="input" value={form.paymentMethod} onChange={update} placeholder="e.g. UPI, Visa •• 4242" />
        </div>
        <div>
          <label htmlFor="website" className="label">Website</label>
          <input id="website" name="website" type="url" className="input" value={form.website} onChange={update} placeholder="https://" />
        </div>
      </div>

      <SplitEditor
        parts={form.splitWith}
        cost={Number(form.cost) || 0}
        currency={form.currency}
        onChange={(splitWith) => setForm((f) => ({ ...f, splitWith }))}
      />

      <div>
        <label htmlFor="notes" className="label">Notes</label>
        <textarea id="notes" name="notes" rows={2} className="input" value={form.notes} onChange={update} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : subscription?._id ? "Save changes" : "Add subscription"}
        </button>
      </div>
    </form>
  );
}
