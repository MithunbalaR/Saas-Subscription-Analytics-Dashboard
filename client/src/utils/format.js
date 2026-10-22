import { PAY_WINDOW_DAYS } from "./constants.js";

export const formatMoney = (value, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

// "INR 1,234.00" - used in PDFs, whose built-in fonts have no ₹ symbol.
export const formatMoneyCode = (value, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(
    value || 0
  );

// Short form for chart axes, e.g. ₹12K
export const formatCompactMoney = (value, currency = "INR") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(
    value || 0
  );

// Dates are stored at UTC midnight, so format them in UTC to avoid off-by-one days.
export const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const toInputDate = (date) => (date ? new Date(date).toISOString().slice(0, 10) : "");

export const todayInputDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const todayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export const daysUntil = (date) => Math.round((new Date(date).getTime() - todayUTC().getTime()) / 86400000);

// A renewal can be marked as paid from PAY_WINDOW_DAYS before its date (or any time once overdue).
export const canPayNow = (nextRenewal) => daysUntil(nextRenewal) <= PAY_WINDOW_DAYS;
export const paymentOpensOn = (nextRenewal) => new Date(new Date(nextRenewal).getTime() - PAY_WINDOW_DAYS * 86400000);

// Same month maths as the server: clamp 31 Jan + 1 month to 28/29 Feb.
export const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
};

export const timeAgo = (date) => {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 60) return "just now";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 86400 * 30) return rtf.format(-Math.round(seconds / 86400), "day");
  return formatDate(date);
};

export const formatFileSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
