import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardTitle, Layout } from "@/components/ui";
import { AccountBar } from "@/components/teacher/AccountBar";
import { AssignClassForm, FileChips, NewClassForm } from "@/components/teacher/TeacherControls";
import { createServerClient } from "@/lib/supabase";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { classLabel, dayKey, dayLabel, loadClasses, loadFiling, loadReviews, loadWorkouts } from "@/lib/teacher-data";

export const metadata: Metadata = { title: "Your classes — PE.AI", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const account = await getAccount();
  if (!account) redirect("/login?next=/teacher");
  if (!isTeacherAccount(account)) redirect("/me");

  // RLS returns classes this teacher owns (and any they joined as a student).
  const classes = (await loadClasses()).filter((c) => c.owner_id === account.id);
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

  // Admin: classes made before accounts existed have no owner. RLS hides them,
  // so read them with the service role, only after the admin check.
  const unowned = account.role === "admin"
    ? ((await createServerClient()
        .from("pe_classes")
        .select("code, label, config, updated_at")
        .is("owner_id", null)
        .order("updated_at", { ascending: false })
        .limit(50)).data ?? [])
    : [];

  return (
    <Layout backHref="/" backLabel="← Home">
      <AccountBar account={account} />

      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-2">Your Classes</div>
      <div className="text-muted text-[15px] mb-6">Each class has its own code. Students sign in with their Mitty account and enter it.</div>

      <div className="mb-6"><NewClassForm /></div>

      {active.length === 0 ? (
        <Card>
          <div className="text-muted text-[14px] leading-[1.6]">
            No classes yet. Create one above. Classes you made before accounts existed can be assigned to you by the admin.
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

      {account.role === "admin" && (
        <Card className="mt-6" style={{ borderColor: "var(--accent2)" }}>
          <CardTitle>Admin · classes with no owner ({unowned.length})</CardTitle>
          <div className="text-muted text-[13px] leading-[1.5] mb-4">
            Made before accounts. Students can still use the codes; nobody can edit them until you assign each one to a
            teacher who has signed in once.
          </div>
          {unowned.length === 0 ? (
            <div className="text-muted text-[14px]">None left.</div>
          ) : (
            <div className="flex flex-col">
              {unowned.map((c) => (
                <div key={c.code} className="border-t border-border py-3 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div className="font-display text-[18px] font-bold text-accent tracking-[2px]">{c.code}</div>
                    <div className="text-[12px] text-muted truncate">
                      {c.label || `${(c.config as { duration?: number }).duration ?? "?"} min · ${(c.config as { focus?: string }).focus ?? ""}`} · {dayLabel(dayKey(c.updated_at))}
                    </div>
                  </div>
                  <AssignClassForm code={c.code} defaultEmail={account.email} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="font-display text-[26px] font-black uppercase tracking-[-0.5px] mt-10 mb-1">My Workouts</div>
      <div className="text-muted text-[14px] mb-4">
        Samples you previewed. Tap a class to file a workout under it.
      </div>
      {mine.length === 0 ? (
        <div className="text-muted text-[14px]">
          None yet. Open a class, save it, and tap &ldquo;Preview a sample workout&rdquo;.
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
