import Link from "next/link";
import { redirect } from "next/navigation";
import { Layout } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";

// Everyone signs in (DECISIONS 2026-10-27). Signed-in visitors go straight to
// their home; old student links (/?code=XXXXXX) go to the class page, which
// sends them through sign-in first.
type Search = Promise<{ code?: string }>;

export default async function Landing({ searchParams }: { searchParams: Search }) {
  const { code } = await searchParams;
  const upper = (code ?? "").toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(upper)) redirect(`/c/${upper}`);

  const account = await getAccount();
  if (account) redirect(isTeacherAccount(account) ? "/teacher" : "/me");

  return (
    <Layout>
      <div className="text-center pt-4">
        <div className="inline-block bg-[rgba(200,255,0,0.12)] text-accent text-[11px] font-semibold tracking-[2px] uppercase px-3.5 py-1.5 rounded-full border border-[rgba(200,255,0,0.25)] mb-5">
          ⚡ AI-Powered PE Workouts
        </div>

        <h1 className="font-display text-[clamp(52px,12vw,88px)] font-black leading-[0.92] uppercase tracking-[-2px] mb-5">
          Your PE Class<br /><span className="text-accent">Just Got Smarter</span>
        </h1>

        <p className="text-muted text-[17px] leading-[1.6] mb-12 max-w-[460px] mx-auto">
          Teachers set the parameters. Students get personalized AI-generated workouts. Fast, safe, and built for the gym floor.
        </p>

        <div className="flex justify-center gap-0 mb-12 relative">
          {[
            { step: "1", text: "Sign in with your Mitty account" },
            { step: "2", text: "Enter your class code" },
            { step: "3", text: "AI builds a personalized workout" },
            { step: "4", text: "Track every workout you do" },
          ].map(({ step, text }, i, arr) => (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-2 w-[clamp(80px,18vw,130px)]">
                <div className={cn(
                  "w-9 h-9 rounded-full border font-bold text-[15px] flex items-center justify-center shrink-0",
                  "bg-[rgba(200,255,0,0.12)] border-[rgba(200,255,0,0.35)] text-accent"
                )}>
                  {step}
                </div>
                <div className="text-[12px] text-muted leading-[1.4] text-center">{text}</div>
              </div>
              {i < arr.length - 1 && <div className="w-[clamp(12px,3vw,28px)] h-px bg-border shrink-0 mb-7" />}
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="flex items-center justify-center gap-3 w-full max-w-[460px] mx-auto bg-accent text-bg rounded-lg px-7 py-4 font-display text-[22px] font-bold uppercase tracking-[0.5px] no-underline"
        >
          Sign in with your Mitty account
        </Link>
        <p className="text-muted text-[13px] leading-[1.6] mt-4 max-w-[460px] mx-auto">
          Students use @mittymonarch.com and teachers use @mitty.com. Students can also start their own personal class to
          track workouts outside PE.
        </p>
      </div>
    </Layout>
  );
}
