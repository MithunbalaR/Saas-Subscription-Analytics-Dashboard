// Creates demo accounts with realistic subscriptions, 6 months of payment history,
// a shared team workspace and extra users so the admin dashboard has data.
// Usage: npm run seed
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import User from "./models/User.js";
import Workspace from "./models/Workspace.js";
import Subscription from "./models/Subscription.js";
import Expense from "./models/Expense.js";
import Notification from "./models/Notification.js";
import Settlement from "./models/Settlement.js";
import Activity from "./models/Activity.js";
import { addMonths, CYCLE_MONTHS, DAY_MS, round2, startOfToday } from "./utils/billing.js";
import { createPersonalWorkspace } from "./utils/workspace.js";

const today = startOfToday();
const daysFromToday = (n) => new Date(today.getTime() + n * DAY_MS);
const monthsAgo = (n) => addMonths(today, -n);
const historyStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));

const USERS = {
  admin: { name: "Admin User", email: "admin@subtrack.dev", password: "admin1234", role: "admin", joined: 5 },
  demo: { name: "Demo User", email: "demo@subtrack.dev", password: "demo1234", joined: 5 },
  priya: { name: "Priya Sharma", email: "priya@subtrack.dev", password: "demo1234", joined: 4 },
  rahul: { name: "Rahul Verma", email: "rahul@subtrack.dev", password: "demo1234", joined: 3 },
  ananya: { name: "Ananya Iyer", email: "ananya@subtrack.dev", password: "demo1234", joined: 2 },
  karthik: { name: "Karthik Nair", email: "karthik@subtrack.dev", password: "demo1234", joined: 1 },
  sneha: { name: "Sneha Reddy", email: "sneha@subtrack.dev", password: "demo1234", joined: 0 },
};

// renewIn = days from today until the next renewal
const DEMO_SUBSCRIPTIONS = [
  { name: "AWS", category: "Cloud & Hosting", cost: 2400, billingCycle: "monthly", renewIn: 1, paymentMethod: "Visa •• 4242", website: "https://aws.amazon.com", usageBased: true },
  { name: "Notion Plus", category: "Productivity", cost: 800, billingCycle: "monthly", renewIn: 3, paymentMethod: "UPI", website: "https://notion.so" },
  { name: "GitHub Copilot", category: "Development", cost: 10, currency: "USD", billingCycle: "monthly", renewIn: 9, paymentMethod: "Visa •• 4242", website: "https://github.com" },
  { name: "Mailchimp", category: "Marketing", cost: 1100, billingCycle: "monthly", renewIn: 12, status: "paused", pausedDaysAgo: 75, paymentMethod: "Visa •• 4242" },
  { name: "Figma Professional", category: "Design", cost: 15, currency: "USD", billingCycle: "monthly", renewIn: 15, paymentMethod: "Mastercard •• 1881", website: "https://figma.com" },
  // Price went up from 499 to 649 two months ago; shared with two friends (25% each).
  { name: "Netflix", category: "Entertainment", cost: 649, billingCycle: "monthly", renewIn: 18, paymentMethod: "UPI", website: "https://netflix.com",
    prices: [{ cost: 499, monthsAgo: 9 }, { cost: 649, monthsAgo: 2 }], splitWith: [{ name: "Priya", share: 25 }, { name: "Rahul", share: 25 }] },
  { name: "Slack Pro", category: "Communication", cost: 730, billingCycle: "monthly", renewIn: 21, paymentMethod: "Mastercard •• 1881", website: "https://slack.com",
    prices: [{ cost: 620, monthsAgo: 10 }, { cost: 730, monthsAgo: 1 }] },
  // Free trial: first charge in 5 days unless cancelled.
  { name: "Adobe Creative Cloud", category: "Design", cost: 4230, billingCycle: "monthly", renewIn: 5, isTrial: true, website: "https://adobe.com" },
  { name: "Vercel Pro", category: "Cloud & Hosting", cost: 1670, billingCycle: "monthly", renewIn: 26, paymentMethod: "Visa •• 4242", website: "https://vercel.com" },
  { name: "Google Workspace", category: "Productivity", cost: 4200, billingCycle: "quarterly", renewIn: 40, paymentMethod: "Visa •• 4242" },
  { name: "Canva Pro", category: "Design", cost: 3999, billingCycle: "yearly", renewIn: 24, paymentMethod: "UPI", website: "https://canva.com" },
  { name: "Coursera Plus", category: "Education", cost: 4999, billingCycle: "yearly", renewIn: 120, status: "cancelled" },
];

const DEMO_ONE_OFFS = [
  { title: "Domain renewal", amount: 1150, category: "Cloud & Hosting", monthsAgo: 4, day: 12 },
  { title: "Stock photo pack", amount: 2200, category: "Design", monthsAgo: 2, day: 7 },
  { title: "Udemy: Advanced Node.js", amount: 499, category: "Education", monthsAgo: 1, day: 20 },
  { title: "Zoom (one month)", amount: 1300, category: "Communication", monthsAgo: 0, day: 1 },
];

const TEAM_SUBSCRIPTIONS = [
  { name: "Linear", category: "Development", cost: 40, billingCycle: "monthly", renewIn: 6, paymentMethod: "Company Amex", website: "https://linear.app" },
  { name: "HubSpot Starter", category: "Marketing", cost: 20, billingCycle: "monthly", renewIn: 11, paymentMethod: "Company Amex" },
  { name: "Zoom Pro", category: "Communication", cost: 15.99, billingCycle: "monthly", renewIn: 2, paymentMethod: "Company Amex", website: "https://zoom.us" },
  { name: "Loom Business", category: "Communication", cost: 15, billingCycle: "monthly", renewIn: 4, isTrial: true, website: "https://loom.com" },
  { name: "DigitalOcean", category: "Cloud & Hosting", cost: 48, billingCycle: "monthly", renewIn: 17, paymentMethod: "Company Amex", usageBased: true },
  { name: "1Password Teams", category: "Productivity", cost: 239.4, billingCycle: "yearly", renewIn: 200, paymentMethod: "Company Amex" },
  { name: "Notion Plus", category: "Productivity", cost: 50, billingCycle: "monthly", renewIn: 23, paymentMethod: "Company Amex" },
];

// Smaller personal setups for the other users (gives the admin "top tools" chart real data).
const POPULAR = {
  notion: { name: "Notion Plus", category: "Productivity", cost: 800, billingCycle: "monthly" },
  netflix: { name: "Netflix", category: "Entertainment", cost: 649, billingCycle: "monthly" },
  spotify: { name: "Spotify Premium", category: "Entertainment", cost: 119, billingCycle: "monthly" },
  chatgpt: { name: "ChatGPT Plus", category: "Productivity", cost: 20, currency: "USD", billingCycle: "monthly" },
  canva: { name: "Canva Pro", category: "Design", cost: 3999, billingCycle: "yearly" },
  copilot: { name: "GitHub Copilot", category: "Development", cost: 10, currency: "USD", billingCycle: "monthly" },
};
const OTHER_USERS = {
  rahul: ["notion", "chatgpt", "copilot", "spotify"],
  ananya: ["canva", "netflix", "chatgpt"],
  karthik: ["copilot", "notion", "netflix"],
  sneha: ["spotify", "chatgpt"],
};

const USAGE_VARIANCE = [1, 1.18, 0.9, 1.32, 1.05, 0.86, 1.1];

// Demo addresses (@subtrack.dev) are not real inboxes, so email is off for them: otherwise
// reminders sent through a real SMTP account would bounce. In-app notifications still work.
const createUser = async ({ joined, ...data }) => {
  const user = await User.create({ emailReminders: false, ...data });
  // Backdate the sign-up so the admin "sign-ups per month" chart has history.
  await User.collection.updateOne({ _id: user._id }, { $set: { createdAt: addMonths(today, -joined) } });
  return user;
};

// Creates subscriptions in a workspace plus their past payments as expenses.
const seedSubscriptions = async (workspace, user, definitions) => {
  const expenses = [];
  for (const [index, { renewIn = 5 + index * 4, usageBased, pausedDaysAgo, prices, ...data }] of definitions.entries()) {
    const currency = data.currency || workspace.currency;
    const priceHistory = prices?.map((p) => ({ cost: p.cost, currency, changedAt: monthsAgo(p.monthsAgo) }));
    // The price that applied on a given date (so old payments use the old price).
    const priceOn = (date) => (priceHistory ? [...priceHistory].reverse().find((p) => p.changedAt <= date)?.cost ?? priceHistory[0].cost : null);
    const months = CYCLE_MONTHS[data.billingCycle];
    const sub = await Subscription.create({
      currency: workspace.currency,
      ...data,
      workspace: workspace._id,
      createdBy: user._id,
      nextRenewal: daysFromToday(renewIn),
      startDate: addMonths(historyStart, -months),
      statusChangedAt: pausedDaysAgo ? daysFromToday(-pausedDaysAgo) : undefined,
      priceHistory,
    });
    if (sub.status === "cancelled" || sub.isTrial) continue;

    const stoppedPaying = pausedDaysAgo ? daysFromToday(-pausedDaysAgo) : null;
    let paidOn = addMonths(sub.nextRenewal, -months);
    for (let i = 0; paidOn >= historyStart; i++) {
      if (paidOn <= today && (!stoppedPaying || paidOn < stoppedPaying)) {
        expenses.push({
          workspace: workspace._id,
          createdBy: user._id,
          title: sub.name,
          amount: round2((priceOn(paidOn) ?? sub.cost) * (usageBased ? USAGE_VARIANCE[i % USAGE_VARIANCE.length] : 1)),
          currency: sub.currency,
          category: sub.category,
          date: paidOn,
          subscription: sub._id,
          notes: `${sub.billingCycle} renewal`,
        });
      }
      paidOn = addMonths(paidOn, -months);
    }
  }
  return expenses;
};

const oneOffExpenses = (workspace, user, items) =>
  items
    .map(({ monthsAgo: m, day, ...data }) => ({
      ...data,
      currency: workspace.currency,
      workspace: workspace._id,
      createdBy: user._id,
      date: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, day)),
    }))
    .filter((e) => e.date <= today);

// Netflix is shared with Priya and Rahul: each past payment creates their 25% shares.
// Shares from more than a month ago are already settled; recent ones are still owed.
// Also writes a short, backdated activity history so the activity feed isn't empty.
const seedSplitsAndActivity = async (expenses, demoWs, teamWs, users) => {
  const netflixPayments = expenses.filter((e) => String(e.workspace) === String(demoWs._id) && e.title === "Netflix");
  const monthAgo = monthsAgo(1);
  const settlements = netflixPayments.flatMap((e) =>
    ["Priya", "Rahul"].map((name) => ({
      workspace: demoWs._id,
      subscription: e.subscription,
      subscriptionName: "Netflix",
      expense: e._id,
      debtorName: name,
      creditor: users.demo._id,
      amount: round2(e.amount * 0.25),
      currency: e.currency,
      share: 25,
      settled: e.date < monthAgo,
      settledAt: e.date < monthAgo ? new Date(e.date.getTime() + 5 * DAY_MS) : undefined,
    }))
  );
  if (settlements.length) await Settlement.insertMany(settlements);

  const at = (days, hours = 0) => new Date(Date.now() - days * DAY_MS - hours * 3600000);
  const entry = (workspace, user, action, entity, entityName, details, createdAt) => ({
    workspace: workspace._id, user: user._id, action, entity, entityName, details, createdAt, updatedAt: createdAt,
  });
  // Raw driver insert so the backdated createdAt values are kept.
  await Activity.collection.insertMany([
    entry(teamWs, users.demo, "added", "member", "Priya Sharma", undefined, at(120)),
    entry(teamWs, users.priya, "created", "subscription", "Linear", "US$40.00 monthly", at(90)),
    entry(teamWs, users.demo, "updated settings of", "workspace", "Startup Team", undefined, at(30)),
    entry(teamWs, users.priya, "created", "subscription", "Loom Business", "US$15.00 monthly (free trial)", at(10)),
    entry(teamWs, users.demo, "paid", "subscription", "DigitalOcean", "US$48.00", at(2, 5)),
    entry(teamWs, users.priya, "added", "expense", "Conference tickets", "US$120.00", at(0, 3)),
    entry(demoWs, users.demo, "updated", "subscription", "Netflix", "price ₹499.00 → ₹649.00", at(60)),
    entry(demoWs, users.demo, "updated", "subscription", "Slack Pro", "price ₹620.00 → ₹730.00", at(30)),
    entry(demoWs, users.demo, "created", "subscription", "Adobe Creative Cloud", "₹4,230.00 monthly (free trial)", at(25)),
  ]);
};

const removePreviousSeed = async () => {
  const users = await User.find({ email: { $in: Object.values(USERS).map((u) => u.email) } }, "_id");
  const userIds = users.map((u) => u._id);
  const workspaces = await Workspace.find({ owner: { $in: userIds } }, "_id");
  const wsIds = workspaces.map((w) => w._id);
  await Promise.all([
    Subscription.deleteMany({ $or: [{ workspace: { $in: wsIds } }, { workspace: { $exists: false } }] }),
    Expense.deleteMany({ $or: [{ workspace: { $in: wsIds } }, { workspace: { $exists: false } }] }),
    Notification.deleteMany({ user: { $in: userIds } }),
    Settlement.deleteMany({ workspace: { $in: wsIds } }),
    Activity.deleteMany({ workspace: { $in: wsIds } }),
    Workspace.deleteMany({ _id: { $in: wsIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
};

const seed = async () => {
  await connectDB();
  await removePreviousSeed();
  await Promise.all([User.syncIndexes(), Notification.syncIndexes()]);

  const users = {};
  for (const [key, data] of Object.entries(USERS)) users[key] = await createUser(data);

  const expenses = [];

  // Demo user's personal workspace (INR, with budgets)
  const demoWs = await createPersonalWorkspace(users.demo, {
    monthlyBudget: 15000,
    categoryBudgets: { "Cloud & Hosting": 5000, Design: 2500 },
  });
  expenses.push(...(await seedSubscriptions(demoWs, users.demo, DEMO_SUBSCRIPTIONS)));
  expenses.push(...oneOffExpenses(demoWs, users.demo, DEMO_ONE_OFFS));

  // Shared team workspace in USD (demo owns it, Priya is a member)
  const teamWs = await Workspace.create({
    name: "Startup Team",
    owner: users.demo._id,
    members: [
      { user: users.demo._id, role: "owner" },
      { user: users.priya._id, role: "member" },
    ],
    currency: "USD",
    monthlyBudget: 300,
  });
  expenses.push(...(await seedSubscriptions(teamWs, users.demo, TEAM_SUBSCRIPTIONS)));

  // Personal workspaces for everyone else
  for (const key of ["admin", "priya", "rahul", "ananya", "karthik", "sneha"]) {
    const ws = await createPersonalWorkspace(users[key]);
    const defs = (OTHER_USERS[key] || []).map((name) => POPULAR[name]);
    expenses.push(...(await seedSubscriptions(ws, users[key], defs)));
  }

  const saved = await Expense.insertMany(expenses);
  await seedSplitsAndActivity(saved, demoWs, teamWs, users);
  const subCount = await Subscription.countDocuments();
  console.log(`Seeded ${Object.keys(users).length} users, ${subCount} subscriptions and ${expenses.length} expenses.`);
  console.log("Logins:");
  console.log("  demo@subtrack.dev  / demo1234   (user, owns 'Startup Team')");
  console.log("  priya@subtrack.dev / demo1234   (member of 'Startup Team')");
  console.log("  admin@subtrack.dev / admin1234  (admin)");
};

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
