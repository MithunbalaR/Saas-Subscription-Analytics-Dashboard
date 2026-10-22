import Subscription from "../models/Subscription.js";
import Expense from "../models/Expense.js";
import { addMonths, CYCLE_MONTHS, DAY_MS, monthRange, round2, startOfToday, toMonthly } from "../utils/billing.js";
import { convert, getRates } from "../utils/currency.js";
import { budgetUsage, spendByCategory } from "../utils/spend.js";
import { buildInsights } from "../utils/insights.js";

const TREND_MONTHS = 6;
const UPCOMING_DAYS = 30;
const FORECAST_MONTHS = 12;

const monthKey = (date) => date.toISOString().slice(0, 7); // "2026-10"

// GET /api/analytics/summary - everything the dashboard needs for the current workspace
export const getSummary = async (req, res) => {
  const workspace = req.workspace;
  const base = workspace.currency;
  const today = startOfToday();
  const { start: monthStart, end: monthEnd } = monthRange(today);
  const trendStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (TREND_MONTHS - 1), 1));
  const upcomingLimit = new Date(today.getTime() + UPCOMING_DAYS * DAY_MS);

  const [subscriptions, monthlyRows, rateInfo] = await Promise.all([
    Subscription.find({ workspace: workspace._id }),
    // MongoDB aggregation: total spend per calendar month and currency
    Expense.aggregate([
      { $match: { workspace: workspace._id, date: { $gte: trendStart, $lt: monthEnd } } },
      {
        $group: {
          _id: { month: { $dateToString: { format: "%Y-%m", date: "$date" } }, currency: "$currency" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    getRates(),
  ]);
  const { rates } = rateInfo;
  const toBase = (amount, currency) => convert(amount, currency, base, rates);
  const monthlyBase = (s) => toBase(toMonthly(s.cost, s.billingCycle), s.currency);

  // Convert each currency's monthly total, then fill in empty months so the chart has a full range.
  const totalsByMonth = new Map();
  for (const row of monthlyRows) {
    const entry = totalsByMonth.get(row._id.month) || { total: 0, count: 0 };
    entry.total += toBase(row.total, row._id.currency);
    entry.count += row.count;
    totalsByMonth.set(row._id.month, entry);
  }
  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (TREND_MONTHS - 1) + i, 1));
    const found = totalsByMonth.get(monthKey(d));
    return {
      month: monthKey(d),
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      fullLabel: d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      total: round2(found?.total || 0),
      count: found?.count || 0,
    };
  });

  const active = subscriptions.filter((s) => s.status === "active");
  const monthlyRecurring = active.reduce((sum, s) => sum + monthlyBase(s), 0);

  const categoryMap = new Map();
  for (const s of active) {
    const entry = categoryMap.get(s.category) || { category: s.category, monthly: 0, count: 0 };
    entry.monthly += monthlyBase(s);
    entry.count += 1;
    categoryMap.set(s.category, entry);
  }
  const byCategory = [...categoryMap.values()]
    .map((c) => ({ ...c, monthly: round2(c.monthly) }))
    .sort((a, b) => b.monthly - a.monthly);

  // Includes overdue renewals (date already passed) so they are not missed.
  const upcomingRenewals = active
    .filter((s) => s.nextRenewal <= upcomingLimit)
    .sort((a, b) => a.nextRenewal - b.nextRenewal)
    .slice(0, 6);

  const statusCounts = { active: 0, paused: 0, cancelled: 0 };
  subscriptions.forEach((s) => (statusCounts[s.status] += 1));

  // 12-month cash-flow forecast: every future renewal of every active plan, bucketed by month.
  // Dates are anchor + k cycles so month-end dates don't drift; overdue renewals count this month.
  const forecastBuckets = Array.from({ length: FORECAST_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    return {
      month: monthKey(d),
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      fullLabel: d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      total: 0,
      count: 0,
    };
  });
  const forecastEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + FORECAST_MONTHS, 1));
  for (const s of active) {
    const cycle = CYCLE_MONTHS[s.billingCycle];
    for (let k = 0; ; k++) {
      const due = addMonths(s.nextRenewal, k * cycle);
      if (due >= forecastEnd) break;
      if (due < monthStart && k > 0) continue; // count a long-overdue renewal only once
      const when = due < monthStart ? monthStart : due;
      const bucket = forecastBuckets.find((b) => b.month === monthKey(when));
      bucket.total += toBase(s.cost, s.currency);
      bucket.count += 1;
    }
  }
  const forecast = forecastBuckets.map((b) => ({ ...b, total: round2(b.total) }));

  const thisMonthSpend = trend.at(-1).total;
  const lastMonthSpend = trend.at(-2).total;
  const monthSpend = await spendByCategory(workspace._id, monthStart, monthEnd, base, rates);

  const insights = buildInsights({
    subscriptions,
    base,
    rates,
    today,
    thisMonthSpend,
    lastMonthSpend,
    monthlyBudget: workspace.monthlyBudget,
    monthEnd,
  });

  res.json({
    currency: base,
    rates: { source: rateInfo.source, date: rateInfo.date },
    monthlyBudget: workspace.monthlyBudget,
    monthlyRecurring: round2(monthlyRecurring),
    yearlyProjected: round2(monthlyRecurring * 12),
    activeCount: active.length,
    totalCount: subscriptions.length,
    statusCounts,
    thisMonthSpend,
    lastMonthSpend,
    trend,
    forecast,
    forecastTotal: round2(forecast.reduce((sum, m) => sum + m.total, 0)),
    byCategory,
    budgets: budgetUsage(workspace, monthSpend),
    upcomingRenewals,
    insights,
    potentialSavings: round2(insights.reduce((sum, i) => sum + (i.savings || 0), 0)),
  });
};
