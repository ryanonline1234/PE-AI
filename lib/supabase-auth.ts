// Signed-in (user-scoped) Supabase clients. Unlike lib/supabase.ts (service
// role, bypasses RLS), these carry the teacher's session cookie, so every read
// is filtered by the RLS policies in migration 000006.
import { createServerClient as createSSRClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { emailDomain, FACULTY_DOMAIN } from "@/lib/school";

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export type Role = "teacher" | "student" | "admin";

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function isTeacherAccount(a: Account | null): boolean {
  return !!a && (a.role === "teacher" || a.role === "admin");
}

/** For Server Components. Cookie writes are ignored there; proxy.ts refreshes sessions. */
export async function createUserClient() {
  const cookieStore = await cookies();
  return createSSRClient(URL(), KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: proxy.ts handles the refresh.
        }
      },
    },
  });
}

/**
 * For Route Handlers that return their own Response (redirects, JSON). Cookie
 * writes are collected and copied onto that response explicitly, so the PKCE
 * verifier and the session always reach the browser.
 */
export function createRouteClient(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createSSRClient(URL(), KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });
  function withCookies<T extends NextResponse>(res: T): T {
    pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  }
  return { supabase, withCookies };
}

type AuthClient = Awaited<ReturnType<typeof createUserClient>> | ReturnType<typeof createRouteClient>["supabase"];

/** The signed-in account, verified (getClaims validates the JWT), or null. */
export async function getAccount(supabase?: AuthClient): Promise<Account | null> {
  const client = supabase ?? (await createUserClient());
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", sub)
    .maybeSingle();
  const email = (profile?.email ?? (data.claims.email as string | undefined) ?? "").toLowerCase();
  return {
    id: sub,
    email,
    name: profile?.display_name || email.split("@")[0] || "Teacher",
    // If the profile can't be read, fall back to the same domain rule the
    // database uses, so a teacher is never quietly treated as a student.
    role: (profile?.role as Role | undefined) ?? (emailDomain(email) === FACULTY_DOMAIN ? "teacher" : "student"),
  };
}
