// A real, live USD->NGN rate for pricing math -- without this, Eva's only
// option for a currency conversion is whatever rate she picked up from
// training data, which is both stale and often wildly off given how fast
// the naira moves. Same API the sibling sales-funnel codebase already
// relies on for this (mini-export-web's admin FX page): a free, keyless,
// daily-updated static JSON file on a CDN, not a rate-limited API account.
const FX_API_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

// Only used if the live fetch fails outright (CDN hiccup, network error) --
// rough enough to keep a reply from breaking entirely, not meant to track
// reality. getUsdToNgnRate()'s isFallback flag is how a caller tells the
// difference and can caveat accordingly.
const FALLBACK_RATE = 1370;

// The API itself only updates once a day, so there's no reason to hit it on
// every single chat message -- Next's fetch cache handles this the same way
// the sibling project does.
const REVALIDATE_SECONDS = 86400;

// FX_API_URL tracks a market/aggregator rate (it also prices ~200
// cryptocurrencies, so it's reading liquid trading markets, not CBN's
// official NFEM rate) -- in practice that's much closer to Nigeria's
// parallel/black-market rate than the bank rate. CBN itself has no public
// API for the official rate, only an "export to Excel" button on an HTML
// page, so there's nothing free to pull the real bank rate from directly.
//
// Real export deals settle through a domiciliary account at the bank
// rate, not the parallel rate, so bankRate below is the one that actually
// matters for pricing -- rate is kept alongside it only as the raw
// unmodified figure the live fetch returned. BANK_RATE_MARKUP_NGN is a
// flat, hand-set offset applied to turn the market rate into a realistic
// bank-rate estimate, the same shape as the sibling project's fx_config
// markup, just a code constant instead of an admin-editable DB row since
// there's no admin UI for this. It has no principled default -- there's
// no live signal to derive it from -- so it starts at 0 (bankRate ==
// rate) until it's tuned against a real observed bank/domiciliary rate.
// Revisit it whenever the gap between this and an actual bank quote drifts
// noticeably; nothing here updates it automatically. Set to 50 per the
// user's own rough estimate (not independently verified against a real
// bank quote), rather than left at a principled 0.
const BANK_RATE_MARKUP_NGN = 50;

export interface FxRate {
  // Raw market/aggregator rate, as fetched -- informational only, this is
  // NOT what a real domiciliary-account transaction settles at.
  rate: number;
  // rate adjusted by BANK_RATE_MARKUP_NGN -- use this one for any actual
  // pricing math, since that's the rate real export deals settle at.
  bankRate: number;
  asOf: string;
  isFallback: boolean;
}

function withBankRate(rate: number, asOf: string, isFallback: boolean): FxRate {
  return { rate, bankRate: rate + BANK_RATE_MARKUP_NGN, asOf, isFallback };
}

export async function getUsdToNgnRate(): Promise<FxRate> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(FX_API_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return withBankRate(FALLBACK_RATE, today, true);

    const json = await res.json();
    const rate = json?.usd?.ngn;
    const asOf = typeof json?.date === 'string' ? json.date : today;
    if (typeof rate === 'number' && rate > 0) {
      return withBankRate(rate, asOf, false);
    }
    return withBankRate(FALLBACK_RATE, asOf, true);
  } catch (err) {
    console.error('[mentor] getUsdToNgnRate fetch failed:', err);
    return withBankRate(FALLBACK_RATE, today, true);
  }
}
