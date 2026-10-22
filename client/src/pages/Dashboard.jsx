import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Info,
  Layers,
  Lightbulb,
  PiggyBank,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { Alert, EmptyState, PageHeader, RenewalLabel, Skeleton, StatCard } from "../components/ui.jsx";
import ServiceLogo from "../components/ServiceLogo.jsx";
import { useLiveRefresh } from "../context/RealtimeContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import ChartCard from "../components/charts/ChartCard.jsx";
import SpendTrendChart from "../components/charts/SpendTrendChart.jsx";
import CategoryChart from "../components/charts/CategoryChart.jsx";
import { CYCLE_SHORT } from "../utils/constants.js";
import { canPayNow, formatDate, formatMoney, paymentOpensOn } from "../utils/format.js";

const INSIGHT_STYLES = {
  warning: { Icon: AlertTriangle, tone: "text-amber-700", label: "Heads up" },
  saving: { Icon: PiggyBank, tone: "text-green-700", label: "Save money" },
  info: { Icon: Info, tone: "text-blue-700", label: "Tip" },
};

function DashboardSkeleton() {
  return (
    <div aria-label="Loading dashboard">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/analytics/summary");
      setData(data);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // Live: refresh the numbers when anyone in the workspace changes data.
  useLiveRefresh(["subscription", "expense", "workspace"], load);
  const { t } = useI18n();

  const markPaid = async (sub) => {
    try {
      await api.post(`/subscriptions/${sub._id}/pay`);
      toast.success(`${sub.name} renewed and a confirmation email sent`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!data) return error ? <Alert>{error}</Alert> : <DashboardSkeleton />;

  const money = (v) => formatMoney(v, data.currency);
  const firstName = user.name.split(" ")[0];
  const title = current.isPersonal ? t("dashboard.greeting", { name: firstName }) : current.name;

  if (data.totalCount === 0) {
    return (
      <>
        <PageHeader title={title} description="Your SaaS spend at a glance." />
        <div className="card">
          <EmptyState
            icon={Layers}
            title="No subscriptions yet"
            description="Add the tools you pay for and SubTrack will calculate your recurring costs, upcoming renewals, spending trends and savings."
            action={
              <Link to="/subscriptions" className="btn btn-primary">
                <Plus className="size-4" /> Add your first subscription
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const change = data.lastMonthSpend > 0 ? ((data.thisMonthSpend - data.lastMonthSpend) / data.lastMonthSpend) * 100 : null;

  return (
    <>
      <PageHeader title={title} description={t("dashboard.subtitle", { currency: data.currency })} />
      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dashboard.monthlyRecurring")} value={money(data.monthlyRecurring)} hint={t("dashboard.monthlyRecurringHint")} icon={Wallet} />
        <StatCard label={t("dashboard.projectedYearly")} value={money(data.yearlyProjected)} hint={t("dashboard.projectedYearlyHint")} icon={CalendarClock} />
        <StatCard
          label={t("dashboard.spentThisMonth")}
          value={money(data.thisMonthSpend)}
          hint={
            change === null ? (
              "No spend recorded last month"
            ) : (
              <span className="inline-flex items-center gap-1">
                {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {Math.abs(change).toFixed(0)}% {change >= 0 ? "more" : "less"} than last month
              </span>
            )
          }
          icon={CreditCard}
        />
        <StatCard
          label={t("dashboard.activeSubscriptions")}
          value={data.activeCount}
          hint={`${data.statusCounts.paused} paused · ${data.statusCounts.cancelled} cancelled`}
          icon={Layers}
        />
      </div>

      {data.budgets.length > 0 && <BudgetPanel budgets={data.budgets} money={money} month={data.trend.at(-1).fullLabel} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("dashboard.monthlySpend")}
          subtitle={t("dashboard.monthlySpendHint")}
          rows={data.trend.some((m) => m.total > 0) ? data.trend : []}
          emptyMessage="No payments recorded yet. Mark a renewal as paid or add an expense."
          columns={[
            { key: "fullLabel", label: "Month" },
            { key: "count", label: "Payments", align: "right" },
            { key: "total", label: "Spend", align: "right", format: money },
          ]}
        >
          <SpendTrendChart data={data.trend} currency={data.currency} />
        </ChartCard>

        <ChartCard
          title={t("dashboard.byCategory")}
          subtitle={t("dashboard.byCategoryHint")}
          rows={data.byCategory}
          emptyMessage="No active subscriptions."
          columns={[
            { key: "category", label: "Category" },
            { key: "count", label: "Subscriptions", align: "right" },
            { key: "monthly", label: "Per month", align: "right", format: money },
          ]}
        >
          <CategoryChart data={data.byCategory} currency={data.currency} />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title={t("dashboard.forecast")}
          subtitle={`${t("dashboard.forecastHint")} · ${money(data.forecastTotal)} over the next 12 months`}
          rows={data.forecast.some((m) => m.total > 0) ? data.forecast : []}
          emptyMessage="No active subscriptions to forecast."
          columns={[
            { key: "fullLabel", label: "Month" },
            { key: "count", label: "Renewals", align: "right" },
            { key: "total", label: "Due", align: "right", format: money },
          ]}
        >
          <SpendTrendChart data={data.forecast} currency={data.currency} name="Due" detail={(row) => `${row.count} renewal${row.count === 1 ? "" : "s"}`} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <InsightsPanel insights={data.insights} savings={data.potentialSavings} money={money} />

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <div>
              <h2 className="section-title">{t("dashboard.upcoming")}</h2>
              <p className="mt-0.5 text-xs text-stone-500">{t("dashboard.upcomingHint")}</p>
            </div>
            <Link to="/calendar" className="text-sm font-medium text-blue-700 hover:underline">Calendar</Link>
          </div>
          {data.upcomingRenewals.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500">Nothing renews in the next 30 days.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.upcomingRenewals.map((sub) => (
                <li key={sub._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                  <ServiceLogo subscription={sub} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {sub.name}
                      {sub.isTrial && <span className="ml-1.5 text-xs font-medium text-blue-700">trial</span>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatDate(sub.nextRenewal)} · <RenewalLabel date={sub.nextRenewal} />
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {formatMoney(sub.cost, sub.currency)}
                    <span className="font-normal text-stone-500">/{CYCLE_SHORT[sub.billingCycle]}</span>
                  </p>
                  {canPayNow(sub.nextRenewal) ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => markPaid(sub)}>Mark paid</button>
                  ) : (
                    <span className="w-full text-xs text-stone-400 sm:w-auto" title="Renewals can be marked as paid from 3 days before the due date">
                      Pay from {formatDate(paymentOpensOn(sub.nextRenewal))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-stone-500">
        Other currencies are converted to {data.currency} using{" "}
        {data.rates.source === "live" ? `live European Central Bank rates (${data.rates.date})` : "approximate offline rates"}.
      </p>
    </>
  );
}

function InsightsPanel({ insights, savings, money }) {
  const { t } = useI18n();
  return (
    <section className="card lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-stone-400" />
          <h2 className="section-title">{t("dashboard.insights")}</h2>
        </div>
        {savings > 0 && (
          <p className="text-sm">
            <span className="text-stone-500">{t("dashboard.potentialSavings")} </span>
            <span className="font-semibold text-green-700 tabular-nums">{money(savings)}/yr</span>
          </p>
        )}
      </div>
      {insights.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">No recommendations right now. Your spending looks healthy.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {insights.map((insight) => {
            const { Icon, tone, label } = INSIGHT_STYLES[insight.severity];
            return (
              <li key={insight.id} className="flex gap-3 px-5 py-3.5">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className={`mr-1.5 text-xs font-semibold uppercase ${tone}`}>{label}</span>
                    {insight.title}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">{insight.message}</p>
                </div>
                {insight.savings > 0 && (
                  <p className="shrink-0 text-xs font-medium text-green-700 tabular-nums">save ~{money(insight.savings)}/yr</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BudgetPanel({ budgets, money, month }) {
  const { t } = useI18n();
  return (
    <section className="card mt-4 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="section-title">{t("dashboard.budgets")} · {month}</h2>
        <Link to="/settings" className="text-xs font-medium text-blue-700 hover:underline">Edit budgets</Link>
      </div>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {budgets.map((b) => {
          const state =
            b.percent >= 100
              ? { bar: "bg-red-600", text: "text-red-700", label: "Over budget" }
              : b.percent >= 80
                ? { bar: "bg-amber-500", text: "text-amber-700", label: "Nearing limit" }
                : { bar: "bg-blue-600", text: "text-stone-500", label: "On track" };
          return (
            <div key={b.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{b.label}</span>
                <span className="tabular-nums">
                  {money(b.spent)} <span className="text-stone-500">of {money(b.budget)}</span>
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"
                role="progressbar"
                aria-valuenow={b.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${b.label} budget used`}
              >
                <div className={`h-full rounded-full ${state.bar}`} style={{ width: `${Math.min(b.percent, 100)}%` }} />
              </div>
              <p className={`mt-1 text-xs font-medium ${state.text}`}>
                {state.label} · {b.percent}% used
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
