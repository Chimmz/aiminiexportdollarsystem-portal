import { createServiceClient } from '@/lib/supabase/service';

// The two halves of the activation/extension algorithm documented on
// access_periods in supabase/schema_app.sql. Shared by convert-lead.ts
// (sales-site purchases) and payments-actions.ts/the Paystack webhook
// (in-portal purchases) — both create access_periods rows and both need
// the exact same "is this user already activated" branch, so it lives
// here once instead of being reimplemented at each call site.

// Called right after a payment is confirmed `success`, for every payment
// regardless of origin. Branches on whether this user has ever activated
// before:
//   - Never activated: insert unactivated (starts_at/ends_at null) — the
//     first mentor message will activate it, chained with any other
//     unactivated periods, via activateUserOnFirstMessage below.
//   - Already activated: this is a renewal/top-up bought while already a
//     member, so it activates immediately, chained onto the end of
//     whichever period is currently running (or now(), if none is) —
//     the "stacks on top" behavior the Upgrade page promises.
export async function createAccessPeriodForPayment(params: {
  userId: string;
  paymentId: string;
  durationDays: number;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: userRow } = await supabase
    .from('users')
    .select('activated_at')
    .eq('id', params.userId)
    .single();

  if (!userRow?.activated_at) {
    const { error } = await supabase.from('access_periods').insert({
      user_id: params.userId,
      payment_id: params.paymentId,
      duration_days: params.durationDays,
    });
    if (error) throw new Error(`create unactivated access_period: ${error.message}`);
    return;
  }

  const { data: latestPeriod } = await supabase
    .from('access_periods')
    .select('ends_at')
    .eq('user_id', params.userId)
    .not('starts_at', 'is', null)
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const latestEndsAt = latestPeriod?.ends_at ? new Date(latestPeriod.ends_at) : null;
  const startsAt = latestEndsAt && latestEndsAt > now ? latestEndsAt : now;
  const endsAt = new Date(startsAt.getTime() + params.durationDays * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from('access_periods').insert({
    user_id: params.userId,
    payment_id: params.paymentId,
    duration_days: params.durationDays,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });
  if (error) throw new Error(`create activated access_period: ${error.message}`);
}

// Called from /api/mentor/chat the first time a user with no activated_at
// sends a message. Sets activated_at, then activates every unactivated
// period that accumulated before this moment (oldest first, chained
// back-to-back) — there can be more than one if someone bought a plan,
// never chatted, then bought again before ever activating.
export async function activateUserOnFirstMessage(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date();

  const { data: unactivatedPeriods } = await supabase
    .from('access_periods')
    .select('id, duration_days')
    .eq('user_id', userId)
    .is('starts_at', null)
    .order('created_at', { ascending: true });

  const { error: userError } = await supabase
    .from('users')
    .update({ activated_at: now.toISOString() })
    .eq('id', userId)
    .is('activated_at', null);
  if (userError) throw new Error(`activate user: ${userError.message}`);

  let cursor = now;
  for (const period of unactivatedPeriods ?? []) {
    const startsAt = cursor;
    const endsAt = new Date(startsAt.getTime() + period.duration_days * 24 * 60 * 60 * 1000);
    const { error } = await supabase
      .from('access_periods')
      .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
      .eq('id', period.id);
    if (error) throw new Error(`activate access_period ${period.id}: ${error.message}`);
    cursor = endsAt;
  }
}
