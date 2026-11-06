import { createServiceClient } from '@/lib/supabase/service';

// See supabase/migrations/0010_price_quotes.sql for why this is a
// separate, structured table rather than another chat memory extraction
// write: the numbers here need to be exact, not a model's prose transcription of
// them, and a user can have more than one product (or reprice the same
// one more than once), so this is an append-only log, not a
// current-value-wins row like profile_facts/deal_step_progress.

export interface PriceQuoteInput {
  // The calculatePricing tool call's own toolCallId (see
  // conversation-messages.tsx's 'tool-calculatePricing' case) -- links
  // this row back to the exact PricingCalculatorPanel that produced it,
  // see migrations/0020_price_quotes_tool_call_id.sql. Required on write
  // even though the DB column is nullable (for pre-migration rows); every
  // save from here on should be linkable.
  toolCallId: string;
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

// Upsert on (user_id, tool_call_id), not a plain insert -- each
// calculatePricing tool call still only ever produces one row (that's
// still append-only across different calculations), but this makes a
// retried Save (a flaky connection resubmitting the same request) update
// that same row instead of creating a duplicate, rather than relying
// solely on the panel's own post-save disabled state.
export async function savePriceQuote(
  userId: string,
  quote: PriceQuoteInput
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('price_quotes').upsert(
    {
      user_id: userId,
      tool_call_id: quote.toolCallId,
      product: quote.product,
      total_cost: quote.totalCost,
      total_quantity: quote.totalQuantity,
      unit_cost: quote.unitCost,
      profit_margin_pct: quote.profitMarginPct,
      bank_rate: quote.bankRate,
      price_ngn: quote.priceNgn,
      price_usd: quote.priceUsd,
      market_price_usd: quote.marketPriceUsd,
    },
    { onConflict: 'user_id,tool_call_id' }
  );
  if (error) throw new Error(`save price quote: ${error.message}`);
}

// One already-saved quote, shaped for PricingCalculatorPanel to render as
// a read-only summary instead of reopening a blank interactive calculator
// -- see getPriceQuotesByUser below.
export interface SavedPriceQuote {
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

// Keyed by tool_call_id so page.tsx can hand each persisted
// 'tool-calculatePricing' message part its own matching saved quote (if
// any) by that same id -- see conversation-messages.tsx. One query per
// page load covering every quote this user has ever saved, not one query
// per message; this product's volume makes that entirely fine, and it
// avoids an N+1 over however many calculatePricing messages are in
// history. Rows saved before migrations/0020 (tool_call_id still null)
// are excluded -- there's nothing to key them by, so they simply don't
// hydrate a panel on reload, same as before this feature existed.
export async function getPriceQuotesByUser(
  userId: string
): Promise<Record<string, SavedPriceQuote>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('price_quotes')
    .select(
      'tool_call_id, product, total_cost, total_quantity, unit_cost, profit_margin_pct, bank_rate, price_ngn, price_usd, market_price_usd'
    )
    .eq('user_id', userId)
    .not('tool_call_id', 'is', null);
  if (error) throw new Error(`load price quotes: ${error.message}`);

  const byToolCallId: Record<string, SavedPriceQuote> = {};
  for (const row of data ?? []) {
    if (!row.tool_call_id) continue;
    byToolCallId[row.tool_call_id] = {
      product: row.product,
      totalCost: row.total_cost,
      totalQuantity: row.total_quantity,
      unitCost: row.unit_cost,
      profitMarginPct: row.profit_margin_pct,
      bankRate: row.bank_rate,
      priceNgn: row.price_ngn,
      priceUsd: row.price_usd,
      marketPriceUsd: row.market_price_usd,
    };
  }
  return byToolCallId;
}
