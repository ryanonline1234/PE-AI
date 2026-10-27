import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase-auth";

export async function POST(request: NextRequest) {
  const { supabase, withCookies } = createRouteClient(request);
  // "local": sign out this device only, not the student's phone too.
  await supabase.auth.signOut({ scope: "local" });
  const res = withCookies(NextResponse.redirect(new URL("/", request.url), { status: 303 }));
  // Wipe anything the browser cached for this account (shared devices).
  res.headers.set("Clear-Site-Data", '"cache"');
  return res;
}
