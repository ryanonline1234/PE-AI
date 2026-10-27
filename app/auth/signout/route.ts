import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase-auth";

export async function POST(request: NextRequest) {
  const { supabase, withCookies } = createRouteClient(request);
  await supabase.auth.signOut();
  return withCookies(NextResponse.redirect(new URL("/", request.url), { status: 303 }));
}
