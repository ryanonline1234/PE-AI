import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Star, Zap } from "lucide-react";
import { Card, Layout } from "@/components/ui";
import { AccountBar } from "@/components/teacher/AccountBar";
import { FileChips, PresetList } from "@/components/teacher/TeacherControls";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { classLabel, dayKey, dayLabel, loadClasses, loadFiling, loadPresets, loadReviews, loadSessionsBetween, loadWorkouts } from "@/lib/teacher-data";
import { addDays, schoolDate, schoolWeekOf } from "@/lib/time";

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
  // This week across every active class (docs/04 T4).
  const todayKey = schoolDate();
  const weekStart = schoolWeekOf(todayKey);
  const weekDates = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
  const [recent, reviews, mine, filing, presets, weekSessions] = await Promise.all([
    loadWorkouts({ classCodes: codes, sinceDays: 30, limit: 1000 }),
    loadReviews(codes, 30),
    loadWorkouts({ createdBy: account.id, limit: 40 }),
    loadFiling(classes),
    loadPresets(),
    loadSessionsBetween(classes.filter((c) => !c.archived).map((c) => c.id), weekDates[0], weekDates[4]),
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

      <h1 className="t-page mb-2">Your classes</h1>
      <div className="text-muted text-[15px] mb-6">Each class has its own code. Students sign in with their Mitty account and enter it.</div>

      <Link
        href="/teacher/new"
        className="flex items-center justify-center gap-2 w-full bg-accent text-bg rounded-lg px-7 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] no-underline mb-3"
      >
        <Plus className="icon" /> New class
      </Link>
      <Link
        href="/teacher/workout"
        className="flex items-center justify-center gap-2 w-full bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium no-underline mb-6 hover:border-accent"
      >
        <Zap className="icon text-accent" /> Make a workout for myself
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
                  <div className="t-card">{classLabel(c)}</div>
                  <div className="font-display text-[18px] font-bold text-accent tracking-[2px] shrink-0">{c.code}</div>
                </div>
                <div className="text-muted text-[13px] mb-4">
                  {c.config.duration} min · {c.config.intensity} · {c.config.focus}
                </div>
                <div className="flex gap-6">
                  {[
                    [st.today, "Today"],
                    [st.month, "30 days"],
                    [st.avg ? <span className="inline-flex items-center gap-1">{st.avg}<Star className="w-[0.6em] h-[0.6em] fill-current" aria-label="stars" /></span> : "–", "Rating"],
                  ].map(([v, l]) => (
                    <div key={String(l)}>
                      <div className="font-display text-[26px] font-bold text-accent2 leading-none">{v}</div>
                      <div className="text-[12px] text-muted mt-0.5">{l}</div>
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

      {active.length > 0 && (
        <>
          <h2 className="t-section mt-10 mb-1">This week</h2>
          <div className="text-muted text-[14px] mb-4">Each class&apos;s plan by day. Blank days use the class&apos;s default settings.</div>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="text-left font-semibold text-muted pb-2 pr-3">Class</th>
                  {weekDates.map((d) => (
                    <th key={d} className={`text-left font-semibold pb-2 px-2 ${d === todayKey ? "text-accent" : "text-muted"}`}>
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} {Number(d.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.code}>
                    <td className="border-t border-border py-2.5 pr-3 align-top">
                      <Link href={`/classes/${c.code}?tab=sessions`} className="font-semibold text-text no-underline hover:text-accent">{classLabel(c)}</Link>
                    </td>
                    {weekDates.map((d) => {
                      const s = weekSessions.find((x) => x.class_id === c.id && x.session_date === d);
                      return (
                        <td key={d} className={`border-t border-border py-2.5 px-2 align-top ${d === todayKey ? "bg-[rgba(200,255,0,0.05)]" : ""}`}>
                          {s ? (
                            <Link href={`/classes/${c.code}/s/${d}`} className="text-text no-underline hover:text-accent">{s.name || "Untitled session"}</Link>
                          ) : (
                            <span className="text-border">–</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="t-section mt-10 mb-1">Presets</h2>
      <div className="text-muted text-[14px] mb-4">
        Named sets of settings you can start a class or session from, or apply to every class at once.
      </div>
      <PresetList presets={presets} />

      <h2 className="t-section mt-10 mb-1">My workouts</h2>
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
