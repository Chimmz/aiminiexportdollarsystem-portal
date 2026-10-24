// Two real, independently-sourced rates, not one rate plus a guessed
// markup. The course material (see supabase kb_chunks, "RULES ON HOW TO
// CALCULATE OR FIX PRICE") is explicit that bank rate and black-market
// rate are used in opposite directions on purpose, and the spread between
// them is itself the taught profit mechanism:
//   - Naira -> dollar (quoting a buyer): DIVIDE by the bank rate.
//   - Dollar -> naira (withdrawing/converting what a buyer paid): MULTIPLY
//     by the black-market rate.
// An earlier version of this file derived "bank rate" as a guessed +50
// markup on top of a single aggregator fetch, with that aggregator value
// assumed to already approximate the black-market rate. Checked directly
// against CBN's own published rate: that assumption was backwards -- the
// aggregator rate came back BELOW the real bank rate on the day this was
// verified, which can't be right if it were actually a black-market
// proxy. So bank rate now comes from CBN's own API, for real, and the
// aggregator is kept only for its actual role: the black-market proxy
// the sibling affordable-onestop-shop project already uses this exact
// same source for (see its src/lib/fx/rates.ts).

const FALLBACK_BANK_RATE = 1370;
const FALLBACK_BLACK_MARKET_RATE = 1600;

// Only used if a live fetch fails outright -- rough enough to keep a
// reply from breaking entirely, not meant to track reality. Each rate's
// own isFallback flag is how a caller (and the system prompt) tells the
// difference and can caveat accordingly.
export interface FxRate {
  rate: number;
  asOf: string;
  isFallback: boolean;
}

export interface FxRates {
  bank: FxRate;
  blackMarket: FxRate;
}

// --- Bank rate: CBN's own published official rate ------------------

// Found via https://www.cbn.gov.ng/rates/ExchRateByCurrency.html, whose
// own on-page Kendo grid reads from this exact JSON endpoint client-side
// -- confirmed live, no auth, no API key. Returns EVERY currency's ENTIRE
// rate history back to 2001 in one response (no server-side date/currency
// filter available, ~8MB/62k rows as of writing) -- there's no cheaper
// official CBN endpoint to use instead, so this just eats that cost, but
// only once per CACHE_TTL_MS (see cachedBankRate below), not once per
// chat request.
const CBN_RATES_API_URL = 'https://www.cbn.gov.ng/api/GetAllExchangeRates';
const CBN_CURRENCY_NAME = 'US DOLLAR';

interface CbnExchangeRateRow {
  currency: string;
  ratedate: string; // 'YYYY-MM-DD'
  sellingrate: string;
}

// Next's own `fetch` cache (see REVALIDATE_SECONDS) already avoids
// re-hitting CBN on every call, but still re-parses the cached ~8MB
// response and re-scans 62k rows on every single invocation within that
// window. This in-process cache avoids that repeated parse/scan cost too
// -- same pattern as contacts-actions.ts's cachedCountries, just
// time-bounded instead of process-lifetime, since unlike a contacts
// directory this genuinely changes once a day.
let cachedBankRate: { rate: number; asOf: string; cachedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const REVALIDATE_SECONDS = 86400;

async function fetchBankRate(): Promise<FxRate> {
  const today = new Date().toISOString().slice(0, 10);

  if (cachedBankRate && Date.now() - cachedBankRate.cachedAt < CACHE_TTL_MS) {
    return { rate: cachedBankRate.rate, asOf: cachedBankRate.asOf, isFallback: false };
  }

  try {
    const res = await fetch(CBN_RATES_API_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return { rate: FALLBACK_BANK_RATE, asOf: today, isFallback: true };

    const rows = (await res.json()) as CbnExchangeRateRow[];
    let latest: CbnExchangeRateRow | null = null;
    for (const row of rows) {
      if (row.currency !== CBN_CURRENCY_NAME) continue;
      if (!latest || row.ratedate > latest.ratedate) latest = row;
    }
    if (!latest) return { rate: FALLBACK_BANK_RATE, asOf: today, isFallback: true };

    const rate = Number(latest.sellingrate);
    if (!(rate > 0)) return { rate: FALLBACK_BANK_RATE, asOf: latest.ratedate, isFallback: true };

    cachedBankRate = { rate, asOf: latest.ratedate, cachedAt: Date.now() };
    return { rate, asOf: latest.ratedate, isFallback: false };
  } catch (err) {
    console.error('[fx] CBN bank rate fetch failed:', err);
    return { rate: FALLBACK_BANK_RATE, asOf: today, isFallback: true };
  }
}

// --- Black-market rate: the same free aggregator the sibling project uses --

// A free, keyless, daily-updated static JSON file on a CDN (it also
// prices ~200 cryptocurrencies, so it's reading liquid trading markets,
// not any single official source) -- same URL affordable-onestop-shop's
// own src/lib/fx/rates.ts already relies on for its own FX conversion.
const AGGREGATOR_FX_API_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

async function fetchBlackMarketRate(): Promise<FxRate> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(AGGREGATOR_FX_API_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return { rate: FALLBACK_BLACK_MARKET_RATE, asOf: today, isFallback: true };

    const json = await res.json();
    const rate = json?.usd?.ngn;
    const asOf = typeof json?.date === 'string' ? json.date : today;
    if (typeof rate === 'number' && rate > 0) {
      return { rate, asOf, isFallback: false };
    }
    return { rate: FALLBACK_BLACK_MARKET_RATE, asOf, isFallback: true };
  } catch (err) {
    console.error('[fx] black-market rate fetch failed:', err);
    return { rate: FALLBACK_BLACK_MARKET_RATE, asOf: today, isFallback: true };
  }
}

export async function getFxRates(): Promise<FxRates> {
  const [bank, blackMarket] = await Promise.all([fetchBankRate(), fetchBlackMarketRate()]);
  return { bank, blackMarket };
}
