// Keep in sync with server/utils/billing.js and server/utils/currency.js
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

export const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly", short: "mo", months: 1 },
  { value: "quarterly", label: "Quarterly", short: "qtr", months: 3 },
  { value: "yearly", label: "Yearly", short: "yr", months: 12 },
];

export const CYCLE_SHORT = Object.fromEntries(BILLING_CYCLES.map((c) => [c.value, c.short]));
export const CYCLE_MONTHS = Object.fromEntries(BILLING_CYCLES.map((c) => [c.value, c.months]));

export const STATUSES = ["active", "paused", "cancelled"];

// Keep in sync with PAY_WINDOW_DAYS in server/utils/billing.js
export const PAY_WINDOW_DAYS = 3;

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD"];

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Chart colours for each theme: single-series blue, recessive grid and axes.
export const CHART_COLORS = {
  light: {
    series: "#2a78d6",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    tick: "#898781",
    label: "#52514e",
    cursor: "rgba(11, 11, 11, 0.04)",
  },
  dark: {
    series: "#3987e5",
    grid: "#2c2c2a",
    axis: "#383835",
    tick: "#898781",
    label: "#c3c2b7",
    cursor: "rgba(255, 255, 255, 0.06)",
  },
};
