// Who is calling an API route: the signed-in teacher account (if any).
import type { NextRequest } from "next/server";
import { createRouteClient, getAccount, isTeacherAccount, type Account } from "@/lib/supabase-auth";

export async function teacherFromRequest(request: NextRequest): Promise<{
  teacher: Account | null;
  withCookies: ReturnType<typeof createRouteClient>["withCookies"];
}> {
  const { supabase, withCookies } = createRouteClient(request);
  // No Supabase cookies at all (every student request): skip the auth round trip.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const account = hasSession ? await getAccount(supabase) : null;
  return { teacher: account && isTeacherAccount(account) ? account : null, withCookies };
}
