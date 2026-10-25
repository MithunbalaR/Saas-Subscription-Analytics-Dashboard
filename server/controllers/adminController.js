import fs from "node:fs/promises";
import path from "node:path";
import User from "../models/User.js";
import Workspace from "../models/Workspace.js";
import Subscription from "../models/Subscription.js";
import Expense from "../models/Expense.js";
import Notification from "../models/Notification.js";
import { AVATAR_DIR } from "../config/paths.js";
import { round2, toMonthly } from "../utils/billing.js";
import { convert, getRates } from "../utils/currency.js";
import { escapeRegex, getPaging, httpError } from "../utils/helpers.js";
import { runRenewalReminders } from "../jobs/reminders.js";
import { whatsappConfigured } from "../utils/whatsapp.js";
import { sendMonthlyReports } from "../jobs/monthlyReport.js";

const PLATFORM_CURRENCY = "INR";
const SIGNUP_MONTHS = 6;

// GET /api/admin/stats - platform-wide numbers for the admin dashboard
export const getStats = async (req, res) => {
  const now = new Date();
  const signupStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (SIGNUP_MONTHS - 1), 1));

  const [users, admins, workspaces, teamWorkspaces, subscriptionCount, expenseCount, activeSubs, signupRows, topTools, { rates }] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      Workspace.countDocuments(),
      Workspace.countDocuments({ isPersonal: false }),
      Subscription.countDocuments(),
      Expense.countDocuments(),
      Subscription.find({ status: "active" }, "cost currency billingCycle category"),
      User.aggregate([
        { $match: { createdAt: { $gte: signupStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      // Most popular SaaS tools across all workspaces (case-insensitive name match)
      Subscription.aggregate([
        { $group: { _id: { $toLower: "$name" }, name: { $first: "$name" }, count: { $sum: 1 }, workspaces: { $addToSet: "$workspace" } } },
        { $project: { _id: 0, name: 1, count: 1, workspaces: { $size: "$workspaces" } } },
        { $sort: { count: -1, name: 1 } },
        { $limit: 8 },
      ]),
      getRates(),
    ]);

  const monthlyBase = (s) => convert(toMonthly(s.cost, s.billingCycle), s.currency, PLATFORM_CURRENCY, rates);
  const categoryMap = {};
  for (const s of activeSubs) categoryMap[s.category] = (categoryMap[s.category] || 0) + monthlyBase(s);

  const signupsByMonth = new Map(signupRows.map((r) => [r._id, r.count]));
  const signups = Array.from({ length: SIGNUP_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(signupStart.getUTCFullYear(), signupStart.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    return {
      month: key,
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      fullLabel: d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      count: signupsByMonth.get(key) || 0,
    };
  });

  res.json({
    currency: PLATFORM_CURRENCY,
    users,
    admins,
    workspaces,
    teamWorkspaces,
    subscriptions: subscriptionCount,
    activeSubscriptions: activeSubs.length,
    expenses: expenseCount,
    platformMonthlySpend: round2(activeSubs.reduce((sum, s) => sum + monthlyBase(s), 0)),
    signups,
    topTools,
    byCategory: Object.entries(categoryMap)
      .map(([category, monthly]) => ({ category, monthly: round2(monthly) }))
      .sort((a, b) => b.monthly - a.monthly),
  });
};

// GET /api/admin/users?q=&page=&limit=
export const getUsers = async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 10);
  const filter = {};
  if (req.query.q) {
    const rx = { $regex: escapeRegex(req.query.q), $options: "i" };
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  // Attach workspace and subscription counts for the users on this page.
  const ids = users.map((u) => u._id);
  const [wsCounts, subCounts] = await Promise.all([
    Workspace.aggregate([{ $unwind: "$members" }, { $match: { "members.user": { $in: ids } } }, { $group: { _id: "$members.user", count: { $sum: 1 } } }]),
    Subscription.aggregate([{ $match: { createdBy: { $in: ids } } }, { $group: { _id: "$createdBy", count: { $sum: 1 } } }]),
  ]);
  const countOf = (rows, id) => rows.find((r) => String(r._id) === String(id))?.count || 0;

  res.json({
    items: users.map((u) => ({ ...u.toJSON(), workspaceCount: countOf(wsCounts, u._id), subscriptionCount: countOf(subCounts, u._id) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
};

// PATCH /api/admin/users/:id - change role
export const updateUserRole = async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw httpError(400, "You can't change your own role");
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, "User not found");
  user.role = req.body.role;
  await user.save();
  res.json(user);
};

// DELETE /api/admin/users/:id - delete a user, their owned workspaces and all related data
export const deleteUser = async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw httpError(400, "You can't delete your own account here");
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, "User not found");

  const owned = await Workspace.find({ owner: user._id }, "_id");
  const ownedIds = owned.map((w) => w._id);
  await Promise.all([
    Subscription.deleteMany({ workspace: { $in: ownedIds } }),
    Expense.deleteMany({ workspace: { $in: ownedIds } }),
    Notification.deleteMany({ $or: [{ user: user._id }, { workspace: { $in: ownedIds } }] }),
    Workspace.deleteMany({ _id: { $in: ownedIds } }),
    Workspace.updateMany({ "members.user": user._id }, { $pull: { members: { user: user._id } } }),
  ]);
  if (user.avatar) await fs.rm(path.join(AVATAR_DIR, path.basename(user.avatar)), { force: true });
  if (whatsappConfigured()) await (await import("../utils/whatsappWeb.js")).logoutSession(user._id); // unlink their WhatsApp
  await user.deleteOne();
  res.json({ message: `${user.name} and their data were deleted` });
};

// POST /api/admin/run-reminders - run the daily reminder job now (handy for demos)
export const triggerReminders = async (req, res) => {
  res.json(await runRenewalReminders());
};

// POST /api/admin/run-monthly-reports - email last month's PDF report to everyone now (handy for demos)
export const triggerMonthlyReports = async (req, res) => {
  res.json(await sendMonthlyReports());
};
