import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase-auth";
import { isSchoolEmail, safeNextPath } from "@/lib/school";

// Google → Supabase → here. Exchange the code for a session, re-check the
// school domain (defence in depth behind the database hook), then go on.
// Error redirects carry a fixed code only, never provider text.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (code: "auth" | "domain") => NextResponse.redirect(new URL(`/login?error=${code}`, url.origin));

  // The hook rejecting a non-Mitty account comes back as ?error=… here.
  if (url.searchParams.get("error")) return fail("domain");

  const code = url.searchParams.get("code");
  if (!code) return fail("auth");

  const { supabase, withCookies } = createRouteClient(request);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error("exchangeCodeForSession failed:", error?.message);
    return withCookies(fail("auth"));
  }

  if (!isSchoolEmail(data.session.user.email)) {
    await supabase.auth.signOut();
    return withCookies(fail("domain"));
  }

  return withCookies(NextResponse.redirect(new URL(next, url.origin)));
}
