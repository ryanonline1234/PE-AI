import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layout } from "@/components/ui";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { safeNextPath } from "@/lib/school";

export const metadata: Metadata = { title: "Teacher sign in — PE.AI" };

const ERRORS: Record<string, string> = {
  domain: "PE.AI sign-in is for Mitty school Google accounts only. Try again with your @mitty.com account.",
  auth: "Sign-in didn't finish. Please try again.",
};

type Search = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { error, next } = await searchParams;
  const account = await getAccount();
  if (isTeacherAccount(account)) redirect(safeNextPath(next));

  const href = `/auth/signin?next=${encodeURIComponent(safeNextPath(next))}`;
  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="max-w-[460px]">
        <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-3">
          Teacher Sign In
        </div>
        <p className="text-muted text-[15px] leading-[1.6] mb-8">
          Sign in with your Mitty Google account to keep all your classes in one place, see every workout your
          students generate, and file the ones you like under each class.
        </p>

        {error && ERRORS[error] && (
          <div className="rounded-lg border px-4 py-[13px] text-[14px] mb-5 bg-[rgba(255,77,109,0.08)] border-[rgba(255,77,109,0.3)] text-danger">
            {ERRORS[error]}
          </div>
        )}

        {account && !isTeacherAccount(account) && (
          <div className="rounded-lg border border-border bg-surface px-4 py-[13px] text-[14px] leading-[1.5] mb-5">
            You&apos;re signed in as <strong>{account.email}</strong>. Teacher accounts are for Mitty faculty
            (@mitty.com). Students don&apos;t need an account: just use your class code.
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

        {account && (
          <form action="/auth/signout" method="post" className="mt-3">
            <button type="submit" className="w-full bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium cursor-pointer">
              Sign out
            </button>
          </form>
        )}

        <p className="text-muted text-[13px] leading-[1.6] mt-6">
          Students: no sign-in needed. <Link href="/" className="text-accent">Enter your class code</Link> instead.
        </p>
      </div>
    </Layout>
  );
}
