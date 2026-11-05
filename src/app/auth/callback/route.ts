import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { convertLeadForUser } from "@/lib/leads/convert-lead";
import { safeRedirectPath } from "@/lib/utils/redirect-utils";

// Where Supabase redirects after a magic-link click (configured as the
// emailRedirectTo in sign-in/actions.ts, and must also be added under
// Authentication -> URL Configuration -> Redirect URLs in the Supabase
// dashboard, or exchangeCodeForSession below will fail). Supabase appends
// its own `code` param onto whatever emailRedirectTo was given without
// stripping ours, so the `next` param set in sign-in/actions.ts survives
// the round trip and lands back here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const user = data.session?.user;

    if (!error && user?.email) {
      // public.users is already populated by the on_auth_user_created
      // trigger (see supabase/schema_app.sql) by the time we get here —
      // this just links the pre-payment lead to that real account.
      await convertLeadForUser(user.id, user.email);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in`);
}
