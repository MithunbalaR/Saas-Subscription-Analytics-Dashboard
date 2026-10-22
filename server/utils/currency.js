// Live exchange rates from the free Frankfurter API (European Central Bank data), cached in memory.
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD"];

// Approximate EUR-based rates used when the API can't be reached (offline demo, tests).
const FALLBACK_RATES = { EUR: 1, INR: 108.1, USD: 1.118, GBP: 0.846, AUD: 1.608, CAD: 1.593, SGD: 1.431 };
const CACHE_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;

let cache = { rates: FALLBACK_RATES, source: "fallback", date: null, fetchedAt: 0 };

export const getRates = async () => {
  if (process.env.RATES_OFFLINE === "true" || Date.now() - cache.fetchedAt < CACHE_MS) return cache;

  try {
    const symbols = CURRENCIES.filter((c) => c !== "EUR").join(",");
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${symbols}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache = { rates: { EUR: 1, ...data.rates }, source: "live", date: data.date, fetchedAt: Date.now() };
  } catch (err) {
    console.warn(`Exchange rates unavailable (${err.message}), using fallback rates`);
    cache = { ...cache, fetchedAt: Date.now() - CACHE_MS + RETRY_MS };
  }
  return cache;
};

// All rates are relative to EUR, so convert via EUR.
export const convert = (amount, from, to, rates) => (from === to ? amount : (amount / rates[from]) * rates[to]);

export const formatMoney = (amount, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount || 0);
