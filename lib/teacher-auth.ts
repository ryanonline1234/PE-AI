// Who is calling an API route. Every route except the keep-alive cron now
// requires a signed-in Mitty account (DECISIONS 2026-10-27).
import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient, getAccount, isTeacherAccount, type Account } from "@/lib/supabase-auth";

export interface Caller {
  account: Account | null;
  withCookies: ReturnType<typeof createRouteClient>["withCookies"];
}

export async function callerFromRequest(request: NextRequest): Promise<Caller> {
  const { supabase, withCookies } = createRouteClient(request);
  // No Supabase cookies at all: skip the auth round trip.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  const account = hasSession ? await getAccount(supabase) : null;
  return { account, withCookies };
}

/** The signed-in teacher (or admin), or null. */
export async function teacherFromRequest(request: NextRequest): Promise<{ teacher: Account | null; withCookies: Caller["withCookies"] }> {
  const { account, withCookies } = await callerFromRequest(request);
  return { teacher: account && isTeacherAccount(account) ? account : null, withCookies };
}

export const signInRequired = () =>
  NextResponse.json({ error: "Please sign in with your Mitty account." }, { status: 401 });
