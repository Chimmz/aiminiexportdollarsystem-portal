import { createServiceClient } from "@/lib/supabase/service";
import { createAccessPeriodForPayment } from "@/lib/actions/access-actions";

// Runs once per sign-in, right after the magic-link callback establishes a
// session — looks for a lead matching this email (written by the separate
// mini-export-web sales site, which only ever writes leads/payments and
// never has a real user to attach them to) and, if found:
//   1. Links it to this real user and marks it 'converted', so nurture
//      emails stop going to someone who's already in.
//   2. Creates an access_period for every successful payment on that lead
//      that doesn't have one yet, and backfills payments.user_id. Runs on
//      every sign-in (not just the first), which is also how a later
//      repeat purchase while already a member gets picked up — it doesn't
//      depend on funnel_stage, only on unlinked successful payments
//      existing.
// createAccessPeriodForPayment (access-actions.ts) decides unactivated vs.
// activate-immediately per payment — a first-ever purchase before this
// user has ever activated stays unactivated until their first mentor
// message, but a repeat purchase made while already activated (e.g. they
// bought a second plan on the sales site while mid-membership) chains onto
// their current period right away instead of silently never activating,
// since activated_at is already set and nothing would otherwise flip it
// again.
//
// Also backfills users.full_name/phone from whatever the checkout form on
// mini-export-web collected, since that's otherwise the only place that
// name/phone ever existed -- the profile-edit form on the Account page has
// no write path yet (see CLAUDE.md's known gaps), so without this a buyer
// who paid with their real name/phone would sign in to a blank profile.
// Only fills a currently-blank field, never overwrites something the user
// already set themselves.
export async function convertLeadForUser(userId: string, email: string) {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, converted_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (!lead) return;

  if (!lead.converted_user_id) {
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({ converted_user_id: userId, funnel_stage: "converted" })
      .eq("id", lead.id);
    if (leadUpdateError) {
      console.error("[convert-lead] leads update failed:", leadUpdateError.message);
    }
  }

  if (lead.name || lead.phone) {
    const { data: user } = await supabase
      .from("users")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    const profileUpdates: Record<string, string> = {};
    if (lead.name && !user?.full_name) profileUpdates.full_name = lead.name;
    if (lead.phone && !user?.phone) profileUpdates.phone = lead.phone;

    if (Object.keys(profileUpdates).length > 0) {
      // Never check/surface this before now -- a failure here (e.g. a
      // schema mismatch, the exact class of bug the leads.phone column
      // hit earlier this session) previously failed silently, with
      // nothing in the logs to explain why a buyer's profile stayed
      // blank.
      const { error: userUpdateError } = await supabase
        .from("users")
        .update(profileUpdates)
        .eq("id", userId);
      if (userUpdateError) {
        console.error("[convert-lead] users profile backfill failed:", userUpdateError.message);
      }
    }
  }

  const { data: unlinkedPayments } = await supabase
    .from("payments")
    .select("id, plan_id")
    .eq("lead_id", lead.id)
    .eq("status", "success")
    .is("user_id", null)
    .order("paid_at", { ascending: true });

  if (!unlinkedPayments || unlinkedPayments.length === 0) return;

  const { data: plans } = await supabase
    .from("plans")
    .select("id, duration_days, grants_ai_access");
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));

  for (const payment of unlinkedPayments) {
    const plan = planById.get(payment.plan_id);
    // Plan was removed/renamed since purchase (shouldn't happen, but skip
    // rather than guess a duration) -- nothing to backfill or link here.
    if (!plan) continue;

    // Backfill user_id regardless of grants_ai_access, so every purchase
    // this lead ever made (including a base product like 'pdf-guide')
    // shows up under their account and passes the "payments select own
    // row" RLS check -- only the access-period grant below is
    // AI-plan-specific.
    await supabase.from("payments").update({ user_id: userId }).eq("id", payment.id);

    // 'pdf-guide' and other non-AI products (see migrations/0015's
    // grants_ai_access) are linked above but were never meant to grant an
    // access_period.
    if (!plan.grants_ai_access) continue;

    await createAccessPeriodForPayment({
      userId,
      paymentId: payment.id,
      durationDays: plan.duration_days,
    });
  }
}
