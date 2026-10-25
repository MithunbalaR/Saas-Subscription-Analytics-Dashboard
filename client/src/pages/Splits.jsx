import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, Mail, RotateCcw, Split } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useLiveRefresh } from "../context/RealtimeContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import { Alert, Avatar, EmptyState, PageHeader, RenewalLabel, TableSkeleton } from "../components/ui.jsx";
import ServiceLogo from "../components/ServiceLogo.jsx";
import { CYCLE_SHORT } from "../utils/constants.js";
import { canPayNow, formatDate, formatMoney, paymentOpensOn } from "../utils/format.js";

export default function Splits() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showSettled, setShowSettled] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/splits");
      setData(data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["split", "subscription"], load);

  const act = async (request, success) => {
    try {
      const { data: result } = await request();
      toast.success(success || result.message);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (error) return <Alert>{error}</Alert>;
  const open = data?.items.filter((s) => !s.settled) || [];
  const settled = data?.items.filter((s) => s.settled) || [];

  return (
    <>
      <PageHeader title={t("splits.title")} description={t("splits.subtitle")} />

      {!data ? (
        <div className="card"><TableSkeleton rows={4} /></div>
      ) : data.items.length === 0 && data.shared.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Split}
            title="Nothing shared yet"
            description="Open a subscription, add people under 'Split the cost', and every time you mark it as paid SubTrack records who owes you their share."
            action={<Link to="/subscriptions" className="btn btn-primary">Go to subscriptions</Link>}
          />
        </div>
      ) : (
        <>
          {data.shared.length > 0 && <SharedSubscriptions shared={data.shared} />}

          <h2 className="section-title mt-6 mb-3">Who owes you</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.balances.length === 0 ? (
              <div className="card flex items-start gap-3 p-5 sm:col-span-2 lg:col-span-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-700" />
                {data.items.length > 0 ? (
                  <p className="text-sm">Everyone is settled up. 🎉</p>
                ) : (
                  <p className="text-sm text-stone-600">
                    Nobody owes you anything yet. Each time you mark a shared subscription as <strong>paid</strong> (the ✓ button on the
                    Subscriptions page), everyone's share is added here so you can track and settle it.
                    {nextPayable(data.shared) && <> Next one: <strong>{nextPayable(data.shared)}</strong>.</>}
                  </p>
                )}
              </div>
            ) : (
              data.balances.map((b) => (
                <div key={`${b.debtorName}-${b.currency}`} className="card p-5">
                  <div className="flex items-center gap-3">
                    <Avatar user={{ name: b.debtorName }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.debtorName}</p>
                      <p className="truncate text-xs text-stone-500">{[b.debtorEmail, b.debtorPhone].filter(Boolean).join(" · ") || "no email or phone saved"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-stone-500">Owes you</p>
                  <p className="text-2xl font-semibold tabular-nums">{formatMoney(b.amount, b.currency)}</p>
                  <p className="text-xs text-stone-500">{b.count} unpaid share{b.count === 1 ? "" : "s"}</p>
                  <button
                    className="btn btn-secondary btn-sm mt-3 w-full"
                    onClick={() => act(() => api.post("/splits/settle-all", { debtorName: b.debtorName, currency: b.currency }), `${b.debtorName} is settled up`)}
                  >
                    <CheckCircle2 className="size-4" /> Mark all as paid
                  </button>
                </div>
              ))
            )}
          </div>

          {data.items.length > 0 && (
          <section className="card mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
              <h2 className="section-title">{showSettled ? `Settled (${settled.length})` : `Outstanding shares (${open.length})`}</h2>
              <button className="text-sm font-medium text-blue-700 hover:underline" onClick={() => setShowSettled(!showSettled)}>
                {showSettled ? "Show outstanding" : "Show settled history"}
              </button>
            </div>
            {(showSettled ? settled : open).length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-stone-500">{showSettled ? "Nothing settled yet." : "No outstanding shares."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-stone-200 bg-stone-50">
                    <tr>
                      <th className="th">Person</th>
                      <th className="th">Subscription</th>
                      <th className="th">Paid by</th>
                      <th className="th">{showSettled ? "Settled" : "Date"}</th>
                      <th className="th text-right">Share</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {(showSettled ? settled : open).map((s) => (
                      <tr key={s._id}>
                        <td className="td font-medium">{s.debtorName}</td>
                        <td className="td text-stone-600">{s.subscriptionName} <span className="text-xs text-stone-400">({s.share}%)</span></td>
                        <td className="td text-stone-600">{s.creditor?.name || "-"}</td>
                        <td className="td text-stone-600">{formatDate(showSettled ? s.settledAt : s.createdAt)}</td>
                        <td className="td text-right font-medium tabular-nums">{formatMoney(s.amount, s.currency)}</td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            {showSettled ? (
                              <button className="icon-btn" title="Mark as unpaid again" aria-label={`Reopen ${s.debtorName}'s share`} onClick={() => act(() => api.patch(`/splits/${s._id}`, { settled: false }), "Share reopened")}>
                                <RotateCcw className="size-4" />
                              </button>
                            ) : (
                              <>
                                <button
                                  className="icon-btn"
                                  title={s.debtorEmail || s.debtorPhone ? `Send ${s.debtorName} a reminder (${[s.debtorEmail, s.debtorPhone && `WhatsApp ${s.debtorPhone}`].filter(Boolean).join(", ")})` : "Add an email or WhatsApp number in the subscription's split to send reminders"}
                                  aria-label={`Remind ${s.debtorName}`}
                                  disabled={!s.debtorEmail && !s.debtorPhone}
                                  onClick={() => act(() => api.post(`/splits/${s._id}/remind`))}
                                >
                                  <Mail className="size-4" />
                                </button>
                                <button className="icon-btn text-green-700 hover:bg-green-50" title="Mark as paid" aria-label={`Mark ${s.debtorName}'s share as paid`} onClick={() => act(() => api.patch(`/splits/${s._id}`, { settled: true }), `${s.debtorName}'s share marked as paid`)}>
                                  <CheckCircle2 className="size-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}
        </>
      )}
    </>
  );
}

// "YouTube on 6 Nov 2026": the soonest date a shared subscription can be marked as paid.
const nextPayable = (shared) => {
  const active = shared.filter((s) => s.status === "active").sort((a, b) => new Date(a.nextRenewal) - new Date(b.nextRenewal));
  if (!active.length) return null;
  const first = active[0];
  return canPayNow(first.nextRenewal) ? `${first.name} can be marked as paid now` : `${first.name}, from ${formatDate(paymentOpensOn(first.nextRenewal))}`;
};

// Every subscription with a cost split and what each person pays per billing cycle.
function SharedSubscriptions({ shared }) {
  const navigate = useNavigate();
  return (
    <section>
      <h2 className="section-title mb-3">Shared subscriptions ({shared.length})</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {shared.map((s) => (
          <div key={s._id} className="card p-5">
            <div className="flex items-center gap-3">
              <ServiceLogo subscription={s} size="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {s.name} {s.status === "paused" && <span className="text-xs font-normal text-amber-700">(paused)</span>}
                </p>
                <p className="text-xs text-stone-500">
                  {formatMoney(s.cost, s.currency)}/{CYCLE_SHORT[s.billingCycle]} · {s.isTrial ? "trial ends" : "next charge"} {formatDate(s.nextRenewal)}{" "}
                  {s.status === "active" && <RenewalLabel date={s.nextRenewal} />}
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/subscriptions?open=${s._id}`)}>
                View
              </button>
            </div>
            <ul className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
              <li className="flex items-center justify-between px-3 py-2">
                <span className="font-medium">You</span>
                <span className="tabular-nums text-stone-600">
                  {s.yourShare.share}% · <span className="font-medium text-stone-900">{formatMoney(s.yourShare.amount, s.currency)}</span>
                </span>
              </li>
              {s.people.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {p.email && <Mail className="size-3.5 shrink-0 text-stone-400" aria-label={`emailed at ${p.email}`} />}
                  </span>
                  <span className="shrink-0 tabular-nums text-stone-600">
                    {p.share}% · <span className="font-medium text-stone-900">{formatMoney(p.amount, s.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">Amounts per {s.billingCycle.replace("ly", "")}. Added to "Who owes you" each time it's marked as paid.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
