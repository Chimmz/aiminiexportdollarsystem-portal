import { createClient } from '@/lib/supabase/server';
import type { PlanTier } from '@/lib/utils/plan-utils';

// The three AI-access tiers shown on the Upgrade page, read straight from
// the DB -- is_active is what already keeps the non-AI 'pdf-guide' base
// product out of this list (see migrations/0016), not a separate
// grants_ai_access filter here. The regular (RLS-respecting) server
// client is enough, not the service-role one -- "plans are publicly
// readable" (`using (is_active)`) is the whole point of that policy.
export async function getActivePlans(): Promise<PlanTier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('plans')
    .select('id, label, price_kobo, duration_days, is_recommended')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[plans] fetch failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    priceKobo: row.price_kobo,
    durationDays: row.duration_days,
    isRecommended: row.is_recommended,
  }));
}
