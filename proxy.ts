import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-proxy";

// Next 16 "proxy" (formerly middleware). Only the signed-in teacher pages need
// it: the student flow stays account-less and never touches Supabase Auth, and
// route handlers refresh their own sessions.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/teacher/:path*", "/login"],
};
