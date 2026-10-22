import { createServiceClient } from '@/lib/supabase/service';

// See supabase/migrations/0010_price_quotes.sql for why this is a
// separate, structured table rather than another manageMemory write: the
// numbers here need to be exact, not a model's prose transcription of
// them, and a user can have more than one product (or reprice the same
// one more than once), so this is an append-only log, not a
// current-value-wins row like profile_facts/deal_step_progress.

export interface PriceQuoteInput {
  product: string | null;
  totalCost: number;
  totalQuantity: number;
  unitCost: number;
  profitMarginPct: number;
  bankRate: number;
  priceNgn: number;
  priceUsd: number;
  marketPriceUsd: number | null;
}

export async function savePriceQuote(userId: string, quote: PriceQuoteInput): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('price_quotes').insert({
    user_id: userId,
    product: quote.product,
    total_cost: quote.totalCost,
    total_quantity: quote.totalQuantity,
    unit_cost: quote.unitCost,
    profit_margin_pct: quote.profitMarginPct,
    bank_rate: quote.bankRate,
    price_ngn: quote.priceNgn,
    price_usd: quote.priceUsd,
    market_price_usd: quote.marketPriceUsd,
  });
  if (error) throw new Error(`save price quote: ${error.message}`);
}
