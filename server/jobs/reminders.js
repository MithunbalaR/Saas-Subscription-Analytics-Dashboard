import cron from "node-cron";
import Subscription from "../models/Subscription.js";
import { DAY_MS, daysBetween, startOfToday } from "../utils/billing.js";
import { formatMoney } from "../utils/currency.js";
import { CONTACT_FIELDS, notifyUser } from "../utils/notify.js";

const MAX_REMINDER_DAYS = 30;
const WORKSPACE_MEMBERS = {
  path: "workspace",
  select: "name members",
  populate: { path: "members.user", select: `${CONTACT_FIELDS} reminderDays` },
};

const describe = (days) =>
  days < 0 ? `was due ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "renews today" : `renews in ${days} day${days === 1 ? "" : "s"}`;

// Notifies (and emails) each workspace member whose "remind me N days before" window includes this renewal.
// The dedupe key means each renewal date is only announced once per member.
const remindMembers = async (sub, today) => {
  const days = daysBetween(today, sub.nextRenewal);
  const dateKey = sub.nextRenewal.toISOString().slice(0, 10);
  let created = 0;

  // Free trials get a sharper warning: the first real charge is coming.
  const title = sub.isTrial
    ? days < 0
      ? `Free trial of ${sub.name} ended ${-days} day${days === -1 ? "" : "s"} ago`
      : `Free trial of ${sub.name} ends ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`
    : `${sub.name} ${describe(days)}`;
  const message = sub.isTrial
    ? `You'll be charged ${formatMoney(sub.cost, sub.currency)} (${sub.billingCycle}) on ${dateKey} unless you cancel. Workspace: ${sub.workspace.name}.`
    : `${formatMoney(sub.cost, sub.currency)} (${sub.billingCycle}) due on ${dateKey} in ${sub.workspace.name}.`;

  for (const { user } of sub.workspace.members) {
    // Trials always warn at least 2 days ahead, even if the user picked a 1-day reminder.
    if (!user || days > Math.max(user.reminderDays, sub.isTrial ? 2 : 0)) continue;
    const isNew = await notifyUser(
      user,
      {
        type: sub.isTrial ? "trial" : "renewal",
        title,
        message,
        link: "/subscriptions",
        workspace: sub.workspace._id,
        dedupeKey: `renewal:${sub._id}:${dateKey}`,
      },
      { email: user.emailReminders }
    );
    if (isNew) created += 1;
  }
  return created;
};

// Daily job: every active subscription renewing in the next 30 days (or overdue).
export const runRenewalReminders = async () => {
  const today = startOfToday();
  const subscriptions = await Subscription.find({
    status: "active",
    nextRenewal: { $lte: new Date(today.getTime() + MAX_REMINDER_DAYS * DAY_MS) },
  }).populate(WORKSPACE_MEMBERS);

  let created = 0;
  for (const sub of subscriptions) {
    if (sub.workspace) created += await remindMembers(sub, today);
  }
  return { checked: subscriptions.length, notificationsCreated: created };
};

// Called right after a subscription is created or edited, so a renewal that is already
// inside someone's reminder window doesn't have to wait for the next daily run.
export const remindForSubscription = async (subscriptionId) => {
  try {
    const sub = await Subscription.findById(subscriptionId).populate(WORKSPACE_MEMBERS);
    if (!sub?.workspace || sub.status !== "active") return 0;
    return await remindMembers(sub, startOfToday());
  } catch (err) {
    console.error("Immediate reminder failed:", err.message);
    return 0;
  }
};

// Runs every day at 9:00 (India time by default) and once shortly after the server starts.
export const startReminderJob = () => {
  if (process.env.DISABLE_CRON === "true") return;
  const run = (label) =>
    runRenewalReminders()
      .then((r) => console.log(`[reminders:${label}] checked ${r.checked} renewals, created ${r.notificationsCreated} notifications`))
      .catch((err) => console.error("[reminders] failed:", err.message));

  cron.schedule(process.env.REMINDER_CRON || "0 9 * * *", () => run("daily"), {
    timezone: process.env.REMINDER_TIMEZONE || "Asia/Kolkata",
  });
  setTimeout(() => run("startup"), 5000);
  console.log("Renewal reminder job scheduled (daily at 9:00)");
};
