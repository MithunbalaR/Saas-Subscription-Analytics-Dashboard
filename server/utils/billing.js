export const CATEGORIES = [
  "Productivity",
  "Development",
  "Design",
  "Marketing",
  "Communication",
  "Cloud & Hosting",
  "Entertainment",
  "Education",
  "Other",
];

export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
export const BILLING_CYCLES = Object.keys(CYCLE_MONTHS);
export const STATUSES = ["active", "paused", "cancelled"];

export const DAY_MS = 86400000;

// A renewal can be marked as paid from this many days before its due date (or any time once overdue).
export const PAY_WINDOW_DAYS = 3;

export const round2 = (n) => Math.round(n * 100) / 100;

// Normalise any billing cycle to a per-month cost so plans can be compared.
export const toMonthly = (cost, cycle) => cost / CYCLE_MONTHS[cycle];

// Add (or subtract) months, clamping to the last day of the target month
// so that e.g. 31 Jan + 1 month = 28/29 Feb instead of overflowing into March.
export const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
};

export const addCycle = (date, cycle) => addMonths(date, CYCLE_MONTHS[cycle]);

// Today's date at UTC midnight - matches how <input type="date"> values are stored.
export const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export const monthRange = (date = startOfToday()) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
};

export const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / DAY_MS);

export const paymentOpensOn = (nextRenewal) => new Date(new Date(nextRenewal).getTime() - PAY_WINDOW_DAYS * DAY_MS);

export const formatDay = (date) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
