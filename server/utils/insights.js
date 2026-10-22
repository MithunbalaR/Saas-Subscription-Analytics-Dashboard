import { convert, formatMoney } from "./currency.js";
import { daysBetween, round2, toMonthly } from "./billing.js";

// Most SaaS tools offer roughly "2 months free" on annual billing.
const YEARLY_DISCOUNT = 2 / 12;
const LONG_PAUSE_DAYS = 30;
const BIG_RENEWAL_DAYS = 30;
const TRIAL_WARNING_DAYS = 7;
const PRICE_HIKE_DAYS = 90;

const SEVERITY_ORDER = { warning: 0, saving: 1, info: 2 };

// Rule-based recommendations that turn the raw numbers into actions.
export const buildInsights = ({ subscriptions, base, rates, today, thisMonthSpend, lastMonthSpend, monthlyBudget, monthEnd }) => {
  const money = (v) => formatMoney(v, base);
  const monthlyBase = (s) => convert(toMonthly(s.cost, s.billingCycle), s.currency, base, rates);
  const active = subscriptions.filter((s) => s.status === "active");
  const mrr = active.reduce((sum, s) => sum + monthlyBase(s), 0);
  const insights = [];

  // 1. Monthly plans that would be cheaper on annual billing
  const monthlyPlans = active.filter((s) => s.billingCycle === "monthly").sort((a, b) => monthlyBase(b) - monthlyBase(a));
  if (monthlyPlans.length) {
    const top = monthlyPlans.slice(0, 3);
    const saving = top.reduce((sum, s) => sum + monthlyBase(s) * 12 * YEARLY_DISCOUNT, 0);
    insights.push({
      id: "switch-yearly",
      severity: "saving",
      title: `Switch ${top.map((s) => s.name).join(", ")} to yearly billing`,
      message: `Annual plans usually include about 2 months free. These are your most expensive monthly plans.`,
      savings: round2(saving),
    });
  }

  // 2. Several tools in the same category may overlap
  const byCategory = Object.groupBy(active, (s) => s.category);
  for (const [category, subs] of Object.entries(byCategory)) {
    if (subs.length < 2 || category === "Other") continue;
    const cheapest = subs.reduce((a, b) => (monthlyBase(a) < monthlyBase(b) ? a : b));
    insights.push({
      id: `overlap-${category}`,
      severity: "saving",
      title: `${subs.length} ${category} tools: ${subs.map((s) => s.name).join(", ")}`,
      message: `Check whether one tool can cover the others. Dropping ${cheapest.name} alone would save ${money(monthlyBase(cheapest))}/month.`,
      savings: round2(monthlyBase(cheapest) * 12),
    });
  }

  // 3. Plans paused for a long time are probably no longer needed
  for (const s of subscriptions.filter((s) => s.status === "paused")) {
    const days = daysBetween(s.statusChangedAt || s.updatedAt, today);
    if (days >= LONG_PAUSE_DAYS) {
      insights.push({
        id: `paused-${s._id}`,
        severity: "info",
        title: `${s.name} has been paused for ${days} days`,
        message: `If you no longer need it, cancel it so it doesn't silently restart.`,
      });
    }
  }

  // 4. Large quarterly/yearly charges coming up soon
  for (const s of active.filter((s) => s.billingCycle !== "monthly")) {
    const days = daysBetween(today, s.nextRenewal);
    if (days >= 0 && days <= BIG_RENEWAL_DAYS) {
      insights.push({
        id: `big-renewal-${s._id}`,
        severity: "warning",
        title: `${s.name} renews in ${days} day${days === 1 ? "" : "s"}`,
        message: `A ${s.billingCycle} charge of ${formatMoney(s.cost, s.currency)} is coming up. Decide now whether to keep it.`,
      });
    }
  }

  // 5. Spending spike compared with last month
  if (lastMonthSpend > 0 && thisMonthSpend > lastMonthSpend * 1.2) {
    const pct = Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100);
    insights.push({
      id: "spend-spike",
      severity: "warning",
      title: `Spending is up ${pct}% on last month`,
      message: `${money(thisMonthSpend)} so far this month vs ${money(lastMonthSpend)} last month.`,
    });
  }

  // 6. Budget forecast: recorded spend + renewals still due this month
  if (monthlyBudget > 0) {
    const stillDue = active
      .filter((s) => s.nextRenewal >= today && s.nextRenewal < monthEnd)
      .reduce((sum, s) => sum + convert(s.cost, s.currency, base, rates), 0);
    const projected = thisMonthSpend + stillDue;
    if (projected > monthlyBudget) {
      insights.push({
        id: "budget-forecast",
        severity: "warning",
        title: `On track to exceed this month's budget`,
        message: `Projected spend is ${money(projected)} against a budget of ${money(monthlyBudget)}.`,
      });
    }
  }

  // 7. Free trials that will start charging soon
  for (const s of active.filter((s) => s.isTrial)) {
    const days = daysBetween(today, s.nextRenewal);
    if (days <= TRIAL_WARNING_DAYS) {
      insights.push({
        id: `trial-${s._id}`,
        severity: "warning",
        title: days < 0 ? `Free trial of ${s.name} has ended` : `Free trial of ${s.name} ends in ${days} day${days === 1 ? "" : "s"}`,
        message: `It will cost ${formatMoney(s.cost, s.currency)} per ${s.billingCycle.replace("ly", "")} after that. Cancel now if you don't need it.`,
        savings: round2(monthlyBase(s) * 12),
      });
    }
  }

  // 8. Recent price increases
  for (const s of active) {
    const change = s.lastPriceChange;
    if (change && change.percent > 0 && daysBetween(change.changedAt, today) <= PRICE_HIKE_DAYS) {
      insights.push({
        id: `price-${s._id}`,
        severity: "warning",
        title: `${s.name} price went up ${Math.round(change.percent)}%`,
        message: `${formatMoney(change.from, s.currency)} → ${formatMoney(change.to, s.currency)}. Look for a cheaper plan or an annual discount.`,
      });
    }
  }

  // 9. One tool takes a large share of the total
  const biggest = active.reduce((a, b) => (!a || monthlyBase(b) > monthlyBase(a) ? b : a), null);
  if (biggest && active.length >= 3 && monthlyBase(biggest) / mrr > 0.3) {
    insights.push({
      id: "concentration",
      severity: "info",
      title: `${biggest.name} is ${Math.round((monthlyBase(biggest) / mrr) * 100)}% of your recurring cost`,
      message: `Review its usage or negotiate a better plan; it has the biggest impact on your bill.`,
    });
  }

  return insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};
