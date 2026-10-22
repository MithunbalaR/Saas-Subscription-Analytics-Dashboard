import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, ScissorsLineDashed, TrendingUp, Users } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useChartColors } from "../context/ThemeContext.jsx";
import { Alert, Badge, Modal, RenewalLabel, Spinner, StatusBadge } from "./ui.jsx";
import ServiceLogo from "./ServiceLogo.jsx";
import ChartTooltip from "./charts/ChartTooltip.jsx";
import { CYCLE_SHORT } from "../utils/constants.js";
import { formatCompactMoney, formatDate, formatMoney } from "../utils/format.js";
import { cancelGuideFor } from "../utils/services.js";

function PriceHistoryChart({ history, currency }) {
  const colors = useChartColors();
  // Step chart: each price holds until the next change; extend the last price to today.
  const data = [...history, { ...history.at(-1), changedAt: new Date().toISOString(), current: true }].map((p) => ({
    label: new Date(p.changedAt).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    fullLabel: p.current ? "Today" : formatDate(p.changedAt),
    price: p.cost,
  }));

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: colors.axis }} tick={{ fill: colors.tick, fontSize: 11 }} />
          <YAxis width={52} tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} tickFormatter={(v) => formatCompactMoney(v, currency)} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: colors.axis }} />
          <Line type="stepAfter" dataKey="price" name="Price" stroke={colors.series} strokeWidth={2} dot={{ r: 4, fill: colors.series, strokeWidth: 0 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SubscriptionDetails({ id, workspaceCurrency, onClose, onEdit }) {
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/subscriptions/${id}`).then(({ data }) => setSub(data)).catch((err) => setError(getErrorMessage(err)));
  }, [id]);

  const guide = sub ? cancelGuideFor(sub) : null;
  const change = sub?.lastPriceChange;
  const yourShare = sub ? 100 - (sub.splitWith || []).reduce((s, p) => s + p.share, 0) : 100;

  return (
    <Modal title="Subscription details" onClose={onClose} wide>
      {error ? (
        <Alert>{error}</Alert>
      ) : !sub ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <ServiceLogo subscription={sub} size="size-12" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{sub.name}</h3>
                <StatusBadge status={sub.status} />
                {sub.isTrial && <Badge tone="blue">Free trial</Badge>}
              </div>
              <p className="text-sm text-stone-500">
                {sub.category}
                {sub.paymentMethod && ` · ${sub.paymentMethod}`}
                {sub.website && (
                  <>
                    {" · "}
                    <a href={sub.website} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">website</a>
                  </>
                )}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(sub)}>Edit</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs text-stone-500">Price</p>
              <p className="font-semibold tabular-nums">
                {formatMoney(sub.cost, sub.currency)}
                <span className="font-normal text-stone-500">/{CYCLE_SHORT[sub.billingCycle]}</span>
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs text-stone-500">Per month ({workspaceCurrency})</p>
              <p className="font-semibold tabular-nums">{formatMoney(sub.monthlyCostBase, workspaceCurrency)}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs text-stone-500">{sub.isTrial ? "Trial ends" : "Next renewal"}</p>
              <p className="font-semibold">{formatDate(sub.nextRenewal)}</p>
              {sub.status === "active" && <RenewalLabel date={sub.nextRenewal} />}
            </div>
          </div>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="section-title">Price history</h4>
              {change && (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${change.percent > 0 ? "text-red-700" : "text-green-700"}`}>
                  <TrendingUp className={`size-3.5 ${change.percent < 0 ? "rotate-180" : ""}`} />
                  {change.percent > 0 ? "+" : ""}
                  {Math.round(change.percent)}% on {formatDate(change.changedAt)}
                </span>
              )}
            </div>
            {sub.priceHistory?.length > 1 ? (
              <PriceHistoryChart history={sub.priceHistory} currency={sub.currency} />
            ) : (
              <p className="text-sm text-stone-500">The price hasn't changed since you started tracking it.</p>
            )}
          </section>

          {sub.splitWith?.length > 0 && (
            <section>
              <h4 className="section-title mb-2 flex items-center gap-1.5"><Users className="size-4 text-stone-400" /> Shared with</h4>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
                <li className="flex justify-between px-3 py-2"><span className="font-medium">You</span><span className="tabular-nums">{yourShare}% · {formatMoney((sub.cost * yourShare) / 100, sub.currency)}</span></li>
                {sub.splitWith.map((p) => (
                  <li key={p.name} className="flex justify-between px-3 py-2">
                    <span>{p.name}{p.email && <span className="text-stone-500"> · {p.email}</span>}</span>
                    <span className="tabular-nums">{p.share}% · {formatMoney((sub.cost * p.share) / 100, sub.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="section-title mb-2">Recent payments</h4>
            {sub.payments.length === 0 ? (
              <p className="text-sm text-stone-500">No payments recorded yet. Use the ✓ button on the Subscriptions page when it renews.</p>
            ) : (
              <ul className="max-h-48 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200 text-sm">
                {sub.payments.map((p) => (
                  <li key={p._id} className="flex justify-between px-3 py-2">
                    <span className="text-stone-600">{formatDate(p.date)}</span>
                    <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sub.status !== "cancelled" && (
            <section className="rounded-lg border border-stone-200 p-4">
              <h4 className="section-title mb-2 flex items-center gap-1.5"><ScissorsLineDashed className="size-4 text-stone-400" /> How to cancel {sub.name}</h4>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {guide.url && (
                  <a href={guide.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    <ExternalLink className="size-3.5" /> {guide.known ? "Open cancellation page" : "Open website"}
                  </a>
                )}
                <p className="text-xs text-stone-500">After cancelling, edit this subscription and set its status to Cancelled.</p>
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
