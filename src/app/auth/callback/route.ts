import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { convertLeadForUser } from "@/lib/leads/convert-lead";

// Where Supabase redirects after a magic-link click (configured as the
// emailRedirectTo in sign-in/actions.ts, and must also be added under
// Authentication -> URL Configuration -> Redirect URLs in the Supabase
// dashboard, or exchangeCodeForSession below will fail).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const user = data.session?.user;

    if (!error && user?.email) {
      // public.users is already populated by the on_auth_user_created
      // trigger (see supabase/schema_app.sql) by the time we get here —
      // this just links the pre-payment lead to that real account.
      await convertLeadForUser(user.id, user.email);
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in`);
}
