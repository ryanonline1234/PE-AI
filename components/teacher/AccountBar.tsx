import type { Account } from "@/lib/supabase-auth";

/** Who's signed in, with a sign-out button (a plain form POST, no JS needed). */
export function AccountBar({ account }: { account: Account }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-4 py-3 mb-8">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold truncate">{account.name}</div>
        <div className="text-[12px] text-muted truncate">
          {account.email}{account.role === "admin" ? " · admin" : ""}
        </div>
      </div>
      <form action="/auth/signout" method="post">
        <button type="submit" className="bg-surface2 text-muted border border-border rounded-lg px-3.5 py-2 font-body text-[13px] cursor-pointer">
          Sign out
        </button>
      </form>
    </div>
  );
}
