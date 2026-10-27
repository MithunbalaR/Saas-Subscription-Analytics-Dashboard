import Settlement from "../models/Settlement.js";
import Subscription from "../models/Subscription.js";
import { round2 } from "../utils/billing.js";
import { formatMoney } from "../utils/currency.js";
import { sendEmail } from "../utils/email.js";
import { logActivity } from "../utils/activity.js";
import { httpError } from "../utils/helpers.js";

// GET /api/splits
//   shared   - every subscription that has a cost split, with each person's share per billing cycle
//              (shown straight away, before anything has been paid)
//   balances - money actually owed: created each time a shared subscription is marked as paid
//   items    - the individual owed shares (outstanding and settled)
export const getSplits = async (req, res) => {
  const [settlements, sharedSubs] = await Promise.all([
    Settlement.find({ workspace: req.workspace._id }).sort({ settled: 1, createdAt: -1 }).limit(500).populate("creditor", "name"),
    Subscription.find({ workspace: req.workspace._id, status: { $ne: "cancelled" }, "splitWith.0": { $exists: true } }).sort({ nextRenewal: 1 }),
  ]);

  const shared = sharedSubs.map((s) => {
    const othersShare = s.splitWith.reduce((sum, p) => sum + p.share, 0);
    return {
      _id: s._id,
      name: s.name,
      website: s.website,
      cost: s.cost,
      currency: s.currency,
      billingCycle: s.billingCycle,
      nextRenewal: s.nextRenewal,
      status: s.status,
      isTrial: s.isTrial,
      people: s.splitWith.map((p) => ({ name: p.name, email: p.email, phone: p.phone, share: p.share, amount: round2((s.cost * p.share) / 100) })),
      yourShare: { share: 100 - othersShare, amount: round2((s.cost * (100 - othersShare)) / 100) },
    };
  });

  // Outstanding balance per person (and per currency, since amounts can't be added across currencies).
  const balances = new Map();
  for (const s of settlements.filter((s) => !s.settled)) {
    const key = `${s.debtorName.toLowerCase()}|${s.currency}`;
    const entry = balances.get(key) || { debtorName: s.debtorName, debtorEmail: s.debtorEmail, debtorPhone: s.debtorPhone, currency: s.currency, amount: 0, count: 0 };
    entry.amount = round2(entry.amount + s.amount);
    entry.count += 1;
    entry.debtorEmail ||= s.debtorEmail;
    entry.debtorPhone ||= s.debtorPhone;
    balances.set(key, entry);
  }

  res.json({
    shared,
    balances: [...balances.values()].sort((a, b) => b.amount - a.amount),
    items: settlements,
  });
};

const findOwned = async (id, workspaceId) => {
  const settlement = await Settlement.findOne({ _id: id, workspace: workspaceId }).populate("creditor", "name");
  if (!settlement) throw httpError(404, "Split not found");
  return settlement;
};

// PATCH /api/splits/:id  { settled: true|false }
export const setSettled = async (req, res) => {
  const settlement = await findOwned(req.params.id, req.workspace._id);
  settlement.settled = Boolean(req.body.settled);
  settlement.settledAt = settlement.settled ? new Date() : undefined;
  await settlement.save();
  await logActivity(req.workspace, req.user, {
    action: settlement.settled ? "marked as settled" : "reopened",
    entity: "split",
    entityName: `${settlement.debtorName}'s share of ${settlement.subscriptionName}`,
    details: formatMoney(settlement.amount, settlement.currency),
  });
  res.json(settlement);
};

// POST /api/splits/settle-all  { debtorName, currency } - settle everything one person owes
export const settleAll = async (req, res) => {
  const { debtorName, currency } = req.body;
  if (!debtorName || !currency) throw httpError(400, "debtorName and currency are required");
  const result = await Settlement.updateMany(
    { workspace: req.workspace._id, settled: false, currency, debtorName: new RegExp(`^${debtorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    { settled: true, settledAt: new Date() }
  );
  await logActivity(req.workspace, req.user, { action: "settled all balances of", entity: "split", entityName: debtorName });
  res.json({ settled: result.modifiedCount });
};

// POST /api/splits/:id/remind - email the person a friendly reminder
export const remind = async (req, res) => {
  const settlement = await findOwned(req.params.id, req.workspace._id);
  if (settlement.settled) throw httpError(400, "This share is already settled");
  if (!settlement.debtorEmail) throw httpError(400, `No email saved for ${settlement.debtorName}. Edit the subscription's split to add one.`);
  await sendEmail({
    to: settlement.debtorEmail,
    subject: `Reminder: your share of ${settlement.subscriptionName}`,
    text:
      `Hi ${settlement.debtorName},\n\nFriendly reminder from ${req.user.name}: your ${settlement.share}% share of ${settlement.subscriptionName} ` +
      `(${formatMoney(settlement.amount, settlement.currency)}) is still pending.\n\nSent by SubTrack.`,
  });
  res.json({ message: `Reminder sent to ${settlement.debtorEmail}` });
};
