import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { savePriceQuote } from '@/lib/actions/pricing-actions';

// Called directly from PricingCalculatorPanel on Save, not through the
// chat/LLM loop -- see pricing-actions.ts for why the structured numbers
// bypass manageMemory entirely. Auth here is the same getCurrentUser()
// pattern /api/mentor/chat uses, just with a real 401 instead of a null
// fallback, since there's no sensible "signed-out" behavior for saving a
// quote.

const PriceQuoteSchema = z.object({
  product: z.string().nullable(),
  totalCost: z.number().positive(),
  totalQuantity: z.number().positive(),
  unitCost: z.number().positive(),
  profitMarginPct: z.number().min(0),
  bankRate: z.number().positive(),
  priceNgn: z.number().positive(),
  priceUsd: z.number().positive(),
  marketPriceUsd: z.number().positive().nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PriceQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    await savePriceQuote(user.id, parsed.data);
  } catch (err) {
    console.error('[mentor] savePriceQuote failed:', err);
    return NextResponse.json({ error: 'Failed to save price quote' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
