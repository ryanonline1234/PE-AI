import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-proxy";

// Next 16 "proxy" (formerly middleware): refreshes the Supabase session cookie
// before every page AND API route, since everyone signs in. Route handlers that
// stream (generation) can't write refreshed cookies themselves; without this an
// expired access token would be refreshed and then lost, signing the user out.
// /auth/* manages its own cookies; static assets need none.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!auth|_next/static|_next/image|icons|sw.js|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
