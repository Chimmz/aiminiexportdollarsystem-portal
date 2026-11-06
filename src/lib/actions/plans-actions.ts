import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
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

export interface PlanLookup {
  id: string;
  label: string;
  durationDays: number;
  grantsAiAccess: boolean;
}

// Unlike getActivePlans above, looks up ANY plan by id, including
// 'pdf-guide' (is_active = false since migrations/0016) -- the "plans
// are publicly readable" RLS policy would hide that row from the
// regular client, so this goes through the service-role client instead,
// the same way convert-lead.ts's own `plans` lookup already does. Used
// by the sales-site webhook route to decide which confirmation email a
// payment gets (grantsAiAccess true -> upgrade receipt, false -> pdf
// guide receipt) and to get that plan's label/duration for it.
export async function getPlanById(planId: string): Promise<PlanLookup | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('plans')
    .select('id, label, duration_days, grants_ai_access')
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    label: data.label,
    durationDays: data.duration_days,
    grantsAiAccess: data.grants_ai_access,
  };
}
