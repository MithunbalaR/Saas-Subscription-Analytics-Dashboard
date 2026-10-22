import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../components/ui.jsx";
import ServiceLogo from "../components/ServiceLogo.jsx";
import { CYCLE_MONTHS, CYCLE_SHORT } from "../utils/constants.js";
import { addMonths, formatMoney, todayUTC } from "../utils/format.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

const startOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const dayKey = (date) => date.toISOString().slice(0, 10);

// Every renewal of every active subscription that falls inside the given month.
// Dates are computed as nextRenewal + k cycles (from the same anchor) so they never drift.
const renewalsInMonth = (subscriptions, monthStart) => {
  const monthEnd = addMonths(monthStart, 1);
  const events = [];
  for (const sub of subscriptions) {
    const cycle = CYCLE_MONTHS[sub.billingCycle];
    const anchor = new Date(sub.nextRenewal);
    const monthsAway = (monthStart.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + monthStart.getUTCMonth() - anchor.getUTCMonth();
    for (let k = Math.floor(monthsAway / cycle) - 1; k <= Math.ceil(monthsAway / cycle) + 1; k++) {
      const date = addMonths(anchor, k * cycle);
      if (date < monthStart || date >= monthEnd) continue;
      if (k < 0 && date < new Date(sub.startDate)) continue;
      events.push({ sub, date, key: `${sub._id}-${k}`, amountBase: sub.monthlyCostBase * cycle });
    }
  }
  return events.sort((a, b) => a.date - b.date || a.sub.name.localeCompare(b.sub.name));
};

export default function Calendar() {
  const { currency } = useWorkspace();
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(todayUTC()));

  useEffect(() => {
    api
      .get("/subscriptions", { params: { status: "active" } })
      .then(({ data }) => setSubscriptions(data))
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const events = useMemo(() => (subscriptions ? renewalsInMonth(subscriptions, month) : []), [subscriptions, month]);
  const byDay = useMemo(() => Object.groupBy(events, (e) => dayKey(e.date)), [events]);
  const monthTotal = events.reduce((sum, e) => sum + e.amountBase, 0);

  const today = todayUTC();
  const todayKey = dayKey(today);
  const leadingBlanks = (month.getUTCDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1))),
  ];
  const monthLabel = month.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  if (error) return <Alert>{error}</Alert>;

  return (
    <>
      <PageHeader title="Renewal calendar" description="When each active subscription will charge you, projected from its billing cycle." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel}</h2>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight className="size-5" />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(today))}>Today</button>
        </div>
        <p className="text-sm">
          <span className="text-stone-500">{events.length} renewals · </span>
          <span className="font-semibold tabular-nums">{formatMoney(monthTotal, currency)}</span>
          <span className="text-stone-500"> due this month</span>
        </p>
      </div>

      {!subscriptions ? (
        <Skeleton className="h-[32rem]" />
      ) : subscriptions.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarDays} title="No active subscriptions" description="Add subscriptions to see their renewal dates here." />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-medium text-stone-500 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} className="min-h-14 border-r border-b border-stone-100 bg-stone-50/50 sm:min-h-24" />;
                const key = dayKey(date);
                const dayEvents = byDay[key] || [];
                const isToday = key === todayKey;
                return (
                  <div key={key} className="min-h-14 border-r border-b border-stone-100 p-1 sm:min-h-24 sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`flex size-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-blue-600 font-semibold text-white" : "text-stone-500"}`}>
                        {date.getUTCDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-medium text-stone-500 sm:hidden">{dayEvents.length}</span>
                      )}
                    </div>
                    <div className="mt-1 hidden space-y-1 sm:block">
                      {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                        <div
                          key={e.key}
                          title={`${e.sub.name} · ${formatMoney(e.sub.cost, e.sub.currency)}`}
                          className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${e.date < today ? "bg-stone-100 text-stone-500" : "bg-blue-50 text-blue-700"}`}
                        >
                          {e.sub.name}
                        </div>
                      ))}
                      {dayEvents.length > MAX_CHIPS && <p className="px-1 text-[11px] text-stone-500">+{dayEvents.length - MAX_CHIPS} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <section className="card h-fit">
            <h3 className="section-title border-b border-stone-200 px-4 py-3">Agenda</h3>
            {events.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">No renewals this month.</p>
            ) : (
              <ul className="max-h-[32rem] divide-y divide-stone-100 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.key} className={`flex items-center gap-3 px-4 py-2.5 ${e.date < today ? "opacity-60" : ""}`}>
                    <div className="w-10 shrink-0 text-center">
                      <p className="text-[10px] text-stone-500 uppercase">{e.date.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })}</p>
                      <p className="text-lg leading-none font-semibold">{e.date.getUTCDate()}</p>
                    </div>
                    <ServiceLogo subscription={e.sub} size="size-7" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.sub.name}{e.sub.isTrial && <span className="ml-1 text-xs text-blue-700">trial ends</span>}</p>
                      <p className="text-xs text-stone-500">{e.sub.category}</p>
                    </div>
                    <p className="text-sm tabular-nums">
                      {formatMoney(e.sub.cost, e.sub.currency)}
                      <span className="text-xs text-stone-500">/{CYCLE_SHORT[e.sub.billingCycle]}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
