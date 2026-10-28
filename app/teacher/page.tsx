import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Layout } from "@/components/ui";
import { AccountBar } from "@/components/teacher/AccountBar";
import { FileChips, NewClassForm } from "@/components/teacher/TeacherControls";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { classLabel, dayKey, dayLabel, loadClasses, loadFiling, loadReviews, loadWorkouts } from "@/lib/teacher-data";

export const metadata: Metadata = { title: "Your classes — PE.AI", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const account = await getAccount();
  if (!account) redirect("/login?next=/teacher");
  if (!isTeacherAccount(account)) redirect("/me");

  // RLS returns classes this teacher owns (and any they joined as a student).
  // Their one personal class is their own-workout space, not a class to list.
  const owned = (await loadClasses()).filter((c) => c.owner_id === account.id);
  const classes = owned.filter((c) => c.kind === "class");
  const space = owned.find((c) => c.kind === "personal");
  const codes = classes.map((c) => c.code);
  const [recent, reviews, mine, filing] = await Promise.all([
    loadWorkouts({ classCodes: codes, sinceDays: 30, limit: 1000 }),
    loadReviews(codes, 30),
    loadWorkouts({ createdBy: account.id, limit: 40 }),
    loadFiling(classes),
  ]);

  const today = dayKey(new Date().toISOString());
  const stats = new Map(classes.map((c) => {
    const studentRuns = recent.filter((w) => w.class_code === c.code && w.created_by !== account.id);
    const rs = reviews.filter((r) => r.class_code === c.code);
    return [c.code, {
      today: studentRuns.filter((w) => dayKey(w.created_at) === today).length,
      month: studentRuns.length,
      avg: rs.length ? (rs.reduce((s, r) => s + r.rating, 0) / rs.length).toFixed(1) : null,
      lastDay: studentRuns[0] ? dayLabel(dayKey(studentRuns[0].created_at)) : null,
    }];
  }));
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const chipClasses = active.map((c) => ({ code: c.code, label: classLabel(c) }));
  const labelFor = new Map(classes.map((c) => [c.code, classLabel(c)]));
  if (space) labelFor.set(space.code, "yourself");

  return (
    <Layout>
      <AccountBar account={account} />

      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-2">Your Classes</div>
      <div className="text-muted text-[15px] mb-6">Each class has its own code. Students sign in with their Mitty account and enter it.</div>

      <div className="mb-3"><NewClassForm /></div>
      <Link
        href="/teacher/workout"
        className="flex items-center justify-center w-full bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium no-underline mb-6 hover:border-accent"
      >
        ⚡ Make a workout for myself
      </Link>

      {active.length === 0 ? (
        <Card>
          <div className="text-muted text-[14px] leading-[1.6]">
            No classes yet. Create one above.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {active.map((c) => {
            const st = stats.get(c.code)!;
            return (
              <Link
                key={c.code}
                href={`/classes/${c.code}`}
                className="block bg-surface border border-border rounded-xl p-5 no-underline text-text transition-[border-color] duration-150 hover:border-accent focus-visible:border-accent"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="font-display text-[22px] font-bold uppercase leading-tight">{classLabel(c)}</div>
                  <div className="font-display text-[18px] font-bold text-accent tracking-[2px] shrink-0">{c.code}</div>
                </div>
                <div className="text-muted text-[13px] mb-4">
                  {c.config.duration} min · {c.config.intensity} · {c.config.focus}
                </div>
                <div className="flex gap-6">
                  {[
                    [st.today, "today"],
                    [st.month, "30 days"],
                    [st.avg ? `${st.avg}★` : "–", "rating"],
                  ].map(([v, l]) => (
                    <div key={l}>
                      <div className="font-display text-[26px] font-bold text-accent2 leading-none">{v}</div>
                      <div className="text-[11px] text-muted uppercase tracking-[0.8px] mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <details className="mb-6">
          <summary className="text-muted text-[13px] cursor-pointer">Archived classes ({archived.length})</summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {archived.map((c) => (
              <Link key={c.code} href={`/classes/${c.code}`} className="text-[13px] text-muted border border-border rounded-full px-3 py-1 no-underline">
                {classLabel(c)} · {c.code}
              </Link>
            ))}
          </div>
        </details>
      )}

      <div className="font-display text-[26px] font-black uppercase tracking-[-0.5px] mt-10 mb-1">My Workouts</div>
      <div className="text-muted text-[14px] mb-4">
        Samples you previewed and workouts you made for yourself. Tap a class to file one under it.
      </div>
      {mine.length === 0 ? (
        <div className="text-muted text-[14px]">
          None yet. Make a workout for yourself above, or open a class, save it, and tap &ldquo;Preview a sample workout&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {mine.map((w) => (
            <div key={w.id} className="bg-surface border border-border rounded-xl px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/w/${w.id}`} className="font-semibold text-[15px] text-text no-underline hover:text-accent">
                  {w.title || "Workout"}
                </Link>
                <div className="text-[12px] text-muted shrink-0">{dayLabel(dayKey(w.created_at))}</div>
              </div>
              <div className="text-[12px] text-muted mt-0.5">Made for {labelFor.get(w.class_code) ?? w.class_code}</div>
              <FileChips workoutId={w.id} classes={chipClasses} filedIn={filing.get(w.id) ?? []} />
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
