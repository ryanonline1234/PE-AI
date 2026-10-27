import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layout } from "@/components/ui";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { safeNextPath } from "@/lib/school";

export const metadata: Metadata = { title: "Sign in — PE.AI" };

const ERRORS: Record<string, string> = {
  domain: "PE.AI is for Mitty school Google accounts only. Try again with your @mittymonarch.com or @mitty.com account.",
  auth: "Sign-in didn't finish. Please try again.",
};

type Search = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { error, next } = await searchParams;
  const account = await getAccount();
  const home = isTeacherAccount(account) ? "/teacher" : "/me";
  if (account) redirect(safeNextPath(next, home));

  // After Google, land where the visitor was going, else their home ("/" routes by role).
  const href = `/auth/signin?next=${encodeURIComponent(safeNextPath(next, "/"))}`;
  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="max-w-[460px]">
        <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-3">
          Sign In
        </div>
        <p className="text-muted text-[15px] leading-[1.6] mb-8">
          Use your Mitty Google account. Students (@mittymonarch.com) get workouts and keep a history of every one.
          Teachers (@mitty.com) run classes and see how their students are doing.
        </p>

        {error && ERRORS[error] && (
          <div className="rounded-lg border px-4 py-[13px] text-[14px] mb-5 bg-[rgba(255,77,109,0.08)] border-[rgba(255,77,109,0.3)] text-danger">
            {ERRORS[error]}
          </div>
        )}

        <a
          href={href}
          className="flex items-center justify-center gap-3 w-full bg-accent text-bg rounded-lg px-7 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] no-underline"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#0a0a0f" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
          </svg>
          Sign in with Google
        </a>

        <p className="text-muted text-[13px] leading-[1.6] mt-6">
          By signing in you agree to the <Link href="/terms" className="text-accent">terms</Link>. What we keep is in
          the <Link href="/privacy" className="text-accent">privacy policy</Link>.
        </p>
      </div>
    </Layout>
  );
}
