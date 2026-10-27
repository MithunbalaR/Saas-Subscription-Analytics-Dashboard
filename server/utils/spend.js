import Expense from "../models/Expense.js";
import Workspace from "../models/Workspace.js";
import { convert, formatMoney, getRates } from "./currency.js";
import { monthRange, round2 } from "./billing.js";
import { CONTACT_FIELDS, notifyUser } from "./notify.js";

// Total spend per category between two dates, converted into the workspace's base currency.
// Grouping by currency first lets MongoDB do the summing; conversion happens afterwards.
export const spendByCategory = async (workspaceId, from, to, base, rates) => {
  const rows = await Expense.aggregate([
    { $match: { workspace: workspaceId, date: { $gte: from, $lt: to } } },
    { $group: { _id: { category: "$category", currency: "$currency" }, total: { $sum: "$amount" } } },
  ]);
  const byCategory = {};
  let total = 0;
  for (const { _id, total: amount } of rows) {
    const value = convert(amount, _id.currency, base, rates);
    byCategory[_id.category] = (byCategory[_id.category] || 0) + value;
    total += value;
  }
  return { total: round2(total), byCategory };
};

// Budget usage rows for the current month: overall budget + each category budget.
export const budgetUsage = (workspace, spend) => {
  const rows = [];
  if (workspace.monthlyBudget > 0) {
    rows.push({ key: "total", label: "Overall", budget: workspace.monthlyBudget, spent: spend.total });
  }
  for (const [category, budget] of workspace.categoryBudgets || []) {
    if (budget > 0) rows.push({ key: category, label: category, budget, spent: round2(spend.byCategory[category] || 0) });
  }
  return rows.map((r) => ({ ...r, percent: Math.round((r.spent / r.budget) * 100) }));
};

// Called after money is spent: alerts every workspace member at 80% and 100% of a budget (once per month).
export const checkBudgetAlerts = async (workspaceId) => {
  try {
    const workspace = await Workspace.findById(workspaceId).populate("members.user", CONTACT_FIELDS);
    if (!workspace) return;
    const { rates } = await getRates();
    const { start, end, key } = monthRange();
    const spend = await spendByCategory(workspace._id, start, end, workspace.currency, rates);
    const monthName = start.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

    for (const row of budgetUsage(workspace, spend)) {
      const level = row.percent >= 100 ? 100 : row.percent >= 80 ? 80 : null;
      if (!level) continue;
      const title = level === 100 ? `${row.label} budget exceeded` : `${row.label} budget ${row.percent}% used`;
      const message = `${workspace.name}: ${formatMoney(row.spent, workspace.currency)} of ${formatMoney(row.budget, workspace.currency)} spent in ${monthName}.`;
      for (const { user } of workspace.members) {
        if (!user) continue;
        await notifyUser(
          user,
          { type: "budget", title, message, link: "/", workspace: workspace._id, dedupeKey: `budget:${workspace._id}:${key}:${row.key}:${level}` },
          { email: user.emailReminders }
        );
      }
    }
  } catch (err) {
    console.error("Budget alert check failed:", err.message);
  }
};
