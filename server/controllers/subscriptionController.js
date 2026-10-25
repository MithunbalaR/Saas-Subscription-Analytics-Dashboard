import Subscription from "../models/Subscription.js";
import Expense from "../models/Expense.js";
import Settlement from "../models/Settlement.js";
import Workspace from "../models/Workspace.js";
import { addCycle, daysBetween, formatDay, PAY_WINDOW_DAYS, paymentOpensOn, round2, startOfToday, toMonthly } from "../utils/billing.js";
import { convert, formatMoney, getRates } from "../utils/currency.js";
import { checkBudgetAlerts } from "../utils/spend.js";
import { CONTACT_FIELDS, notifyUser, wantsWhatsApp } from "../utils/notify.js";
import { sendEmailSafe } from "../utils/email.js";
import { sendWhatsAppSafe } from "../utils/whatsapp.js";
import { logActivity } from "../utils/activity.js";
import { remindForSubscription } from "../jobs/reminders.js";
import { httpError, pick, escapeRegex, getSort } from "../utils/helpers.js";

const FIELDS = [
  "name", "category", "cost", "currency", "billingCycle", "startDate", "nextRenewal",
  "status", "isTrial", "paymentMethod", "website", "notes", "splitWith",
];
const SORTABLE = ["name", "cost", "nextRenewal", "category", "status", "createdAt"];
const MAX_IMPORT_ROWS = 500;

const findOwned = async (id, workspaceId) => {
  const sub = await Subscription.findOne({ _id: id, workspace: workspaceId });
  if (!sub) throw httpError(404, "Subscription not found");
  return sub;
};

const withBase = (sub, base, rates) => ({
  ...sub.toJSON(),
  monthlyCostBase: round2(convert(toMonthly(sub.cost, sub.billingCycle), sub.currency, base, rates)),
});

const loadMembers = (workspaceId) => Workspace.findById(workspaceId).populate("members.user", CONTACT_FIELDS);

// GET /api/subscriptions?status=&category=&q=&sort=&order=
export const getSubscriptions = async (req, res) => {
  const { status, category, q } = req.query;
  const filter = { workspace: req.workspace._id };
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };

  const [subscriptions, { rates }] = await Promise.all([
    Subscription.find(filter).sort(getSort(req.query, SORTABLE, "nextRenewal")),
    getRates(),
  ]);
  // Monthly cost converted into the workspace currency so mixed currencies can be compared.
  res.json(subscriptions.map((s) => withBase(s, req.workspace.currency, rates)));
};

// GET /api/subscriptions/:id - one subscription with its payments and split balances
export const getSubscription = async (req, res) => {
  const subscription = await findOwned(req.params.id, req.workspace._id);
  const [{ rates }, payments, settlements] = await Promise.all([
    getRates(),
    Expense.find({ subscription: subscription._id }).sort({ date: -1 }).limit(24),
    Settlement.find({ subscription: subscription._id }).sort({ createdAt: -1 }).limit(50),
  ]);
  res.json({ ...withBase(subscription, req.workspace.currency, rates), payments, settlements });
};

// POST /api/subscriptions
export const createSubscription = async (req, res) => {
  const subscription = await Subscription.create({
    currency: req.workspace.currency,
    ...pick(req.body, FIELDS),
    workspace: req.workspace._id,
    createdBy: req.user._id,
  });
  await remindForSubscription(subscription._id);
  await logActivity(req.workspace, req.user, {
    action: "created",
    entity: "subscription",
    entityName: subscription.name,
    details: `${formatMoney(subscription.cost, subscription.currency)} ${subscription.billingCycle}${subscription.isTrial ? " (free trial)" : ""}`,
  });
  const { emails: splitEmailsSent, whatsapps: splitWhatsAppsSent } = messageSplitParticipants(subscription, [], req.user, req.workspace);
  await confirmNewSubscription(subscription, req.user, req.workspace);
  res.status(201).json({ ...subscription.toJSON(), splitEmailsSent, splitWhatsAppsSent });
};

// "You added Netflix" for the person who created the subscription: price, next charge and, for a
// shared plan, everyone's share (so the creator gets a copy of what the split participants were sent).
const confirmNewSubscription = async (subscription, creator, workspace) => {
  try {
    const cycle = subscription.billingCycle.replace("ly", ""); // month / quarter / year
    const money = (amount) => formatMoney(amount, subscription.currency);
    const share = (percent) => money(round2((subscription.cost * percent) / 100));
    const parts = subscription.splitWith;
    const contacted = (p) => {
      const ways = [p.email && `emailed at ${p.email}`, p.phone && `WhatsApp ${p.phone}`].filter(Boolean);
      return ways.length ? ` (${ways.join(", ")})` : "";
    };
    const title = `You added ${subscription.name}`;
    const when = `${subscription.isTrial ? "Free trial ends" : "Next charge"}: ${formatDay(subscription.nextRenewal)}`;

    let text = `${money(subscription.cost)} per ${cycle} in ${workspace.name}.\n${when}`;
    if (parts.length) {
      const yours = 100 - parts.reduce((sum, p) => sum + p.share, 0);
      text +=
        `\n\nCost split:\nYou: ${yours}% = ${share(yours)} per ${cycle}\n` +
        parts.map((p) => `${p.name}: ${p.share}% = ${share(p.share)} per ${cycle}${contacted(p)}`).join("\n");
    }

    // The bell item stays short (500-character limit); the email has the full breakdown.
    const summary = `${money(subscription.cost)} per ${cycle} · ${when}` + (parts.length ? ` · split with ${parts.map((p) => p.name).join(", ")}` : "");
    await notifyUser(
      creator,
      { type: parts.length ? "split" : "system", title, message: summary.slice(0, 500), link: "/subscriptions", workspace: workspace._id, dedupeKey: `created:${subscription._id}` },
      { email: false }
    );
    if (creator.emailReminders) sendEmailSafe({ to: creator.email, subject: title, text: `${text}\n\nSent by SubTrack.` });
    if (wantsWhatsApp(creator)) sendWhatsAppSafe({ from: creator._id, to: creator.phone, subject: title, text: `${text}\n\nSent by SubTrack.` });
  } catch (err) {
    console.error("New subscription confirmation failed:", err.message);
  }
};

// PUT /api/subscriptions/:id
export const updateSubscription = async (req, res) => {
  const subscription = await findOwned(req.params.id, req.workspace._id);
  const before = {
    cost: subscription.cost,
    currency: subscription.currency,
    billingCycle: subscription.billingCycle,
    splitWith: subscription.splitWith.map((p) => ({ name: p.name, email: p.email, phone: p.phone, share: p.share })),
  };
  subscription.set(pick(req.body, FIELDS));
  await subscription.save();
  const { emails: splitEmailsSent, whatsapps: splitWhatsAppsSent } = messageSplitParticipants(subscription, before, req.user, req.workspace);

  if (before.currency === subscription.currency && subscription.cost > before.cost) {
    await announcePriceHike(req.workspace._id, subscription, before.cost);
  }
  await remindForSubscription(subscription._id);
  await logActivity(req.workspace, req.user, {
    action: "updated",
    entity: "subscription",
    entityName: subscription.name,
    details:
      before.cost !== subscription.cost
        ? `price ${formatMoney(before.cost, before.currency)} → ${formatMoney(subscription.cost, subscription.currency)}`
        : undefined,
  });
  res.json({ ...subscription.toJSON(), splitEmailsSent, splitWhatsAppsSent });
};

// Messages people in a cost split by email and/or WhatsApp:
//  - "You've been added..." to anyone newly added (or reachable on a newly saved email/phone)
//  - "Your share has changed..." to existing people whose amount changed (new share %, price or billing cycle)
// `before` is the subscription's previous price and split ([] when the subscription is new).
// Returns how many emails and WhatsApp messages were sent.
const splitKey = (p) => p.email || p.phone || p.name.trim().toLowerCase();
const messageSplitParticipants = (subscription, before, addedBy, workspace) => {
  const previous = new Map((before.splitWith || []).map((p) => [splitKey(p), p]));
  const cycle = subscription.billingCycle.replace("ly", ""); // month / quarter / year
  const sent = { emails: 0, whatsapps: 0 };

  for (const person of subscription.splitWith) {
    if (!person.email && !person.phone) continue;
    const amount = round2((subscription.cost * person.share) / 100);
    const old = previous.get(splitKey(person));
    const priceChanged = old && (before.cost !== subscription.cost || before.currency !== subscription.currency || before.billingCycle !== subscription.billingCycle);
    const changed = old && (old.share !== person.share || priceChanged);
    const sendEmail = person.email && (!old || changed || old.email !== person.email);
    const sendWhatsApp = person.phone && (!old || changed || old.phone !== person.phone);
    if (!sendEmail && !sendWhatsApp) continue; // nothing new for this person

    const details =
      `Subscription: ${subscription.name}\n` +
      `Total price: ${formatMoney(subscription.cost, subscription.currency)} per ${cycle}\n` +
      `Your share: ${person.share}% = ${formatMoney(amount, subscription.currency)} per ${cycle}\n` +
      `${subscription.isTrial ? "Free trial ends" : "Next charge"}: ${formatDay(subscription.nextRenewal)}\n` +
      `Pay to: ${addedBy.name} (${addedBy.email})`;

    const mail = changed
      ? {
          subject: `Your share of ${subscription.name} has changed: ${formatMoney(amount, subscription.currency)} per ${cycle}`,
          text:
            `Hi ${person.name},\n\n${addedBy.name} updated the cost split for ${subscription.name}.\n` +
            `Before: ${old.share}% = ${formatMoney(round2((before.cost * old.share) / 100), before.currency)} per ${before.billingCycle.replace("ly", "")}\n` +
            `Now: ${person.share}% = ${formatMoney(amount, subscription.currency)} per ${cycle}\n\n${details}\n\nSent by SubTrack.`,
        }
      : {
          subject: `${addedBy.name} added you to the ${subscription.name} cost split: you pay ${formatMoney(amount, subscription.currency)} per ${cycle}`,
          text:
            `Hi ${person.name},\n\n${addedBy.name} added you to a shared subscription in SubTrack (${workspace.name}).\n\n${details}\n\n` +
            `Each time ${subscription.name} renews, ${addedBy.name} pays the full amount and you'll get a message with your share to settle.\n\nSent by SubTrack.`,
        };
    if (sendEmail) {
      sendEmailSafe({ to: person.email, ...mail });
      sent.emails += 1;
    }
    if (sendWhatsApp) {
      sendWhatsAppSafe({ from: addedBy._id, to: person.phone, ...mail });
      sent.whatsapps += 1;
    }
  }
  return sent;
};

// DELETE /api/subscriptions/:id  (past payments are kept as expenses)
export const deleteSubscription = async (req, res) => {
  const subscription = await findOwned(req.params.id, req.workspace._id);
  await subscription.deleteOne();
  await logActivity(req.workspace, req.user, { action: "deleted", entity: "subscription", entityName: subscription.name });
  res.json({ message: "Subscription deleted" });
};

// POST /api/subscriptions/import  { items: [...] } - bulk import from a CSV/Excel file parsed in the browser.
// Every row is validated; valid rows are saved and invalid ones are reported back with their row number.
export const importSubscriptions = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length === 0) throw httpError(400, "No rows to import");
  if (items.length > MAX_IMPORT_ROWS) throw httpError(400, `You can import at most ${MAX_IMPORT_ROWS} rows at a time`);

  const valid = [];
  const errors = [];
  items.forEach((item, index) => {
    const doc = new Subscription({
      currency: req.workspace.currency,
      ...pick(item, FIELDS.filter((f) => f !== "splitWith")),
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    const invalid = doc.validateSync();
    if (invalid) errors.push({ row: index + 1, name: item.name || "", message: Object.values(invalid.errors).map((e) => e.message).join(", ") });
    else valid.push(doc);
  });

  const created = valid.length ? await Subscription.create(valid) : [];
  if (created.length) {
    await logActivity(req.workspace, req.user, { action: "imported", entity: "subscription", entityName: `${created.length} subscriptions` });
  }
  res.status(created.length ? 201 : 400).json({ imported: created.length, failed: errors.length, errors });
};

// POST /api/subscriptions/:id/pay
// Records a renewal payment as an expense and moves the renewal date forward one cycle.
// Allowed only from PAY_WINDOW_DAYS before the renewal date, so a renewal can't be paid twice by accident.
export const recordPayment = async (req, res) => {
  const subscription = await findOwned(req.params.id, req.workspace._id);
  if (subscription.status !== "active") throw httpError(400, "Only active subscriptions can be paid");
  if (daysBetween(startOfToday(), subscription.nextRenewal) > PAY_WINDOW_DAYS) {
    throw httpError(
      400,
      `${subscription.name} can be marked as paid from ${formatDay(paymentOpensOn(subscription.nextRenewal))} (${PAY_WINDOW_DAYS} days before it renews).`
    );
  }

  const wasTrial = subscription.isTrial;
  const expense = await Expense.create({
    workspace: req.workspace._id,
    createdBy: req.user._id,
    title: subscription.name,
    amount: subscription.cost,
    currency: subscription.currency,
    category: subscription.category,
    date: req.body?.date || startOfToday(),
    subscription: subscription._id,
    notes: wasTrial ? "first payment after free trial" : `${subscription.billingCycle} renewal`,
  });

  subscription.nextRenewal = addCycle(subscription.nextRenewal, subscription.billingCycle);
  subscription.isTrial = false; // the first charge converts a free trial into a paid plan
  await subscription.save();

  const settlements = await createSettlements(req.workspace, subscription, expense, req.user);
  await announcePayment(req.workspace._id, subscription, expense, req.user, wasTrial);
  await checkBudgetAlerts(req.workspace._id);
  await logActivity(req.workspace, req.user, {
    action: "paid",
    entity: "subscription",
    entityName: subscription.name,
    details: formatMoney(expense.amount, expense.currency),
  });

  res.status(201).json({ subscription, expense, settlements, paymentOpensOn: paymentOpensOn(subscription.nextRenewal) });
};

// Cost splitting: everyone in splitWith now owes the payer their share of this payment.
const createSettlements = async (workspace, subscription, expense, payer) => {
  if (!subscription.splitWith?.length) return [];
  const settlements = await Settlement.insertMany(
    subscription.splitWith.map((part) => ({
      workspace: workspace._id,
      subscription: subscription._id,
      subscriptionName: subscription.name,
      expense: expense._id,
      debtorName: part.name,
      debtorEmail: part.email,
      debtorPhone: part.phone,
      creditor: payer._id,
      amount: round2((expense.amount * part.share) / 100),
      currency: expense.currency,
      share: part.share,
    }))
  );
  for (const s of settlements) {
    const message = {
      subject: `Your share of ${subscription.name}: ${formatMoney(s.amount, s.currency)}`,
      text:
        `Hi ${s.debtorName},\n\n${payer.name} just paid ${formatMoney(expense.amount, expense.currency)} for ${subscription.name}.\n` +
        `Your ${s.share}% share is ${formatMoney(s.amount, s.currency)}. Please settle it with ${payer.name}.\n\nSent by SubTrack.`,
    };
    if (s.debtorEmail) sendEmailSafe({ to: s.debtorEmail, ...message });
    if (s.debtorPhone) sendWhatsAppSafe({ from: payer._id, to: s.debtorPhone, ...message });
  }
  return settlements;
};

// "YouTube renewed" notification + confirmation email for every workspace member.
const announcePayment = async (workspaceId, subscription, expense, payer, wasTrial) => {
  try {
    const workspace = await loadMembers(workspaceId);
    const title = wasTrial ? `${subscription.name} trial converted to a paid plan` : `${subscription.name} renewed`;
    const message =
      `Payment of ${formatMoney(expense.amount, expense.currency)} (${subscription.billingCycle}) recorded on ${formatDay(expense.date)} by ${payer.name} in ${workspace.name}.\n` +
      `Next renewal: ${formatDay(subscription.nextRenewal)}. You can mark it as paid from ${formatDay(paymentOpensOn(subscription.nextRenewal))}.`;

    for (const { user } of workspace.members) {
      if (!user) continue;
      await notifyUser(
        user,
        { type: "payment", title, message, link: "/expenses", workspace: workspace._id, dedupeKey: `payment:${expense._id}` },
        { email: user.emailReminders, whatsapp: true }
      );
    }
  } catch (err) {
    console.error("Payment notification failed:", err.message);
  }
};

// "Netflix price went up 20%" alert for every workspace member.
const announcePriceHike = async (workspaceId, subscription, oldCost) => {
  try {
    const workspace = await loadMembers(workspaceId);
    const percent = Math.round(((subscription.cost - oldCost) / oldCost) * 100);
    const title = `${subscription.name} price went up ${percent}%`;
    const message =
      `${formatMoney(oldCost, subscription.currency)} → ${formatMoney(subscription.cost, subscription.currency)} per ${subscription.billingCycle.replace("ly", "")} in ${workspace.name}. ` +
      `That's ${formatMoney((subscription.cost - oldCost) * (12 / { monthly: 1, quarterly: 3, yearly: 12 }[subscription.billingCycle]), subscription.currency)} more per year.`;
    for (const { user } of workspace.members) {
      if (!user) continue;
      await notifyUser(
        user,
        { type: "price", title, message, link: "/subscriptions", workspace: workspace._id, dedupeKey: `price:${subscription._id}:${subscription.priceHistory.length}` },
        { email: user.emailReminders, whatsapp: true }
      );
    }
  } catch (err) {
    console.error("Price alert failed:", err.message);
  }
};
