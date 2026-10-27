import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase-auth";
import { safeNextPath } from "@/lib/school";

// Starts Google sign-in. `hd: "*"` makes Google's chooser hide personal Gmail
// accounts; it is only a hint. The real gates are the Before User Created hook
// and the domain check in /auth/callback.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const { supabase, withCookies } = createRouteClient(request);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { hd: "*", prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth failed:", error?.message);
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }
  return withCookies(NextResponse.redirect(data.url));
}
