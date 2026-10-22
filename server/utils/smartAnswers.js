// Built-in "smart answers": a rule-based fallback for the AI assistant.
// No external AI involved - it recognises common questions by keywords and answers from the workspace data.
// Used when no AI key is configured, or when the AI service is unavailable (e.g. free quota used up).
import { convert, formatMoney } from "./currency.js";
import { daysBetween, round2, toMonthly } from "./billing.js";
import { buildInsights } from "./insights.js";

const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const TOPICS = [
  { id: "cancel", words: ["cancel", "save", "saving", "cut", "reduce", "cheaper", "waste", "unused", "recommend", "suggest"] },
  { id: "renewals", words: ["renew", "upcoming", "due", "next week", "this week", "coming", "soon", "charge"] },
  { id: "price", words: ["price", "increase", "hike", "went up", "raised", "expensive now"] },
  { id: "trial", words: ["trial"] },
  { id: "split", words: ["owe", "split", "share", "settle", "friend"] },
  { id: "budget", words: ["budget", "limit", "overspend"] },
  { id: "biggest", words: ["biggest", "most expensive", "highest", "top", "largest", "category", "categories"] },
  { id: "total", words: ["total", "how much", "per month", "monthly", "spend", "spent", "yearly", "per year", "cost"] },
];

const detectTopic = (question) => {
  const q = question.toLowerCase();
  return TOPICS.find((t) => t.words.some((w) => q.includes(w)))?.id || "help";
};

export const smartAnswer = (question, snap) => {
  const { base, rates, today, subscriptions, monthlySpend, openSplits, workspace } = snap;
  const money = (v) => formatMoney(v, base);
  const monthlyBase = (s) => convert(toMonthly(s.cost, s.billingCycle), s.currency, base, rates);
  const active = subscriptions.filter((s) => s.status === "active");
  const mrr = active.reduce((sum, s) => sum + monthlyBase(s), 0);
  const byCost = [...active].sort((a, b) => monthlyBase(b) - monthlyBase(a));

  switch (detectTopic(question)) {
    case "total": {
      const thisMonth = monthlySpend.at(-1)?.total ?? 0;
      return [
        `You have **${plural(active.length, "active subscription")}** costing about **${money(mrr)} per month** (${money(mrr * 12)} per year).`,
        `So far this month you've recorded **${money(thisMonth)}** in payments.`,
        byCost.length ? `Biggest costs:\n${byCost.slice(0, 3).map((s) => `- **${s.name}**: ${money(monthlyBase(s))}/month`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
    }
    case "cancel": {
      const insights = buildInsights({
        subscriptions,
        base,
        rates,
        today,
        thisMonthSpend: monthlySpend.at(-1)?.total ?? 0,
        lastMonthSpend: monthlySpend.at(-2)?.total ?? 0,
        monthlyBudget: workspace.monthlyBudget,
        monthEnd: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
      }).filter((i) => i.severity !== "info" || i.id.startsWith("paused"));
      if (!insights.length) return "I don't see any obvious savings right now. Your subscriptions look lean. 👍";
      const total = insights.reduce((sum, i) => sum + (i.savings || 0), 0);
      return [
        `Here's where you could save${total ? ` (up to about **${money(total)} per year**)` : ""}:`,
        insights.slice(0, 5).map((i, n) => `${n + 1}. **${i.title}**: ${i.message}${i.savings ? ` _(~${money(i.savings)}/yr)_` : ""}`).join("\n"),
      ].join("\n\n");
    }
    case "renewals": {
      const days = /month|30/.test(question.toLowerCase()) ? 30 : 7;
      const due = active.filter((s) => daysBetween(today, s.nextRenewal) <= days).sort((a, b) => a.nextRenewal - b.nextRenewal);
      if (!due.length) return `Nothing renews in the next ${days} days.`;
      const total = due.reduce((sum, s) => sum + convert(s.cost, s.currency, base, rates), 0);
      return [
        `**${plural(due.length, "renewal")}** in the next ${days} days, about **${money(total)}** in total:`,
        due.map((s) => `- **${s.name}**: ${formatMoney(s.cost, s.currency)} on ${fmtDate(s.nextRenewal)}${s.isTrial ? " _(free trial ends - first charge)_" : ""}`).join("\n"),
      ].join("\n\n");
    }
    case "price": {
      const hikes = subscriptions
        .map((s) => ({ s, change: s.lastPriceChange }))
        .filter(({ change }) => change && change.percent > 0)
        .sort((a, b) => b.change.percent - a.change.percent);
      if (!hikes.length) return "None of your subscriptions has had a price increase since you started tracking them.";
      return [
        "**Price increases:**",
        hikes.map(({ s, change }) => `- **${s.name}**: ${formatMoney(change.from, s.currency)} → ${formatMoney(change.to, s.currency)} (+${Math.round(change.percent)}%) on ${fmtDate(change.changedAt)}`).join("\n"),
        "Tip: check whether an annual plan or a smaller tier is cheaper.",
      ].join("\n\n");
    }
    case "trial": {
      const trials = active.filter((s) => s.isTrial);
      if (!trials.length) return "You have no free trials running.";
      return [
        "**Free trials:**",
        trials.map((s) => `- **${s.name}** ends ${fmtDate(s.nextRenewal)} (in ${daysBetween(today, s.nextRenewal)} days), then ${formatMoney(s.cost, s.currency)}/${s.billingCycle.replace("ly", "")}`).join("\n"),
        "Cancel before the end date if you don't want to be charged.",
      ].join("\n\n");
    }
    case "split": {
      if (!openSplits.length) return "Nobody owes you anything right now. Everyone is settled up.";
      const people = {};
      for (const s of openSplits) people[`${s.debtorName}|${s.currency}`] = (people[`${s.debtorName}|${s.currency}`] || 0) + s.amount;
      return [
        "**Outstanding shares:**",
        Object.entries(people).map(([key, amount]) => { const [name, cur] = key.split("|"); return `- **${name}** owes you ${formatMoney(round2(amount), cur)}`; }).join("\n"),
        "Settle them or send reminders from the Splits page.",
      ].join("\n\n");
    }
    case "budget": {
      if (!workspace.monthlyBudget) return "You haven't set a monthly budget yet. Add one in **Settings → Workspace & budgets**.";
      const spent = monthlySpend.at(-1)?.total ?? 0;
      const pct = Math.round((spent / workspace.monthlyBudget) * 100);
      return `You've spent **${money(spent)}** of your **${money(workspace.monthlyBudget)}** budget this month (**${pct}%**).${pct >= 100 ? " ⚠️ You're over budget." : pct >= 80 ? " You're close to the limit." : " You're on track."}`;
    }
    case "biggest": {
      const categories = {};
      for (const s of active) categories[s.category] = (categories[s.category] || 0) + monthlyBase(s);
      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      return [
        "**Most expensive subscriptions:**",
        byCost.slice(0, 5).map((s) => `- **${s.name}**: ${money(monthlyBase(s))}/month`).join("\n"),
        "**By category:**",
        sorted.map(([c, v]) => `- ${c}: ${money(v)}/month`).join("\n"),
      ].join("\n\n");
    }
    default:
      return [
        "I'm running in **basic mode** (no AI service connected), so I can answer these kinds of questions from your data:",
        "- How much do I spend per month?\n- What should I cancel to save money?\n- What renews this week?\n- Which prices went up?\n- Which free trials are ending?\n- Who owes me money?\n- Am I within budget?\n- What are my most expensive subscriptions?",
      ].join("\n\n");
  }
};
