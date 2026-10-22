import { tool } from 'ai';
import { z } from 'zod';
import { getUsdToNgnRate } from '@/lib/actions/fx-actions';

// No input needed -- there's only one pair this course's users ever need
// (USD -> NGN, pricing a dollar quote back into naira cost/profit), so a
// generic currency-pair schema would be pure unused flexibility. The model
// does the actual multiplication itself in its reply (see config.ts's MATH
// FORMULAS section), this just hands it a real number to multiply by
// instead of one it remembers from training data.
//
// Returns bankRate, not the raw market rate -- an actual export deal
// settles through a domiciliary account at the bank rate, not Nigeria's
// parallel/black-market rate (see fx-actions.ts), so bankRate is the
// correct figure for any real pricing math here. rate is included too,
// only so the tool result isn't silently hiding the raw number this was
// derived from.
export function createGetExchangeRateTool() {
  return tool({
    description: `Get today's real USD to NGN (naira) exchange rate, as it
      actually applies to an export deal settling through a domiciliary
      account. Call this whenever a reply needs to convert between dollars
      and naira, or do any pricing math involving both currencies, instead
      of using a remembered or guessed rate -- the rate moves often enough
      that a guess is likely to be wrong.`,
    inputSchema: z.object({}),
    execute: async () => {
      const { rate, bankRate, asOf, isFallback } = await getUsdToNgnRate();
      console.log('[mentor] getExchangeRate call:', { rate, bankRate, asOf, isFallback });
      return {
        bankRate,
        asOf,
        note: isFallback
          ? "Live rate lookup failed, this is a rough fallback figure -- tell the user it's an estimate and they should confirm the actual rate before relying on it for a real deal."
          : `1 USD = ${bankRate} NGN (bank/domiciliary-account rate), as of ${asOf}. Use this figure for pricing math, not a black-market or crypto-exchange rate.`,
      };
    },
  });
}
