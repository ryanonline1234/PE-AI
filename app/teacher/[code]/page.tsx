import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Card, CardTitle, Layout } from "@/components/ui";
import { ClassEditor } from "@/components/ClassEditor";
import { NotATeacher } from "@/components/teacher/AccountBar";
import { ArchiveToggle, CopyButton, FileToggle, LabelEditor } from "@/components/teacher/TeacherControls";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import {
  classLabel, dayKey, dayLabel, loadClass, loadFiling, loadReviews, loadWorkouts, loadWorkoutsByIds, timeLabel,
  type WorkoutRow,
} from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Class — PE.AI", robots: { index: false } };

type Params = Promise<{ code: string }>;

export default async function TeacherClassPage({ params }: { params: Params }) {
  const code = (await params).code.toUpperCase();
  const account = await getAccount();
  if (!account) redirect(`/login?next=/teacher/${code}`);
  if (!isTeacherAccount(account)) {
    return <Layout backHref="/" backLabel="← Home"><NotATeacher account={account} /></Layout>;
  }

  // RLS: returns the class only if this teacher owns it.
  const cls = await loadClass(code);
  if (!cls) notFound();

  const [recent, reviews, filing] = await Promise.all([
    loadWorkouts({ classCodes: [code], sinceDays: 14, limit: 300 }),
    loadReviews([code], 14),
    loadFiling([cls]),
  ]);
  const filed = await loadWorkoutsByIds([...filing.keys()]);
  const filedIds = new Set(filed.map((w) => w.id));

  const studentRuns = recent.filter((w) => !w.created_by);
  const byDay = new Map<string, WorkoutRow[]>();
  for (const w of studentRuns) {
    const k = dayKey(w.created_at);
    byDay.set(k, [...(byDay.get(k) ?? []), w]);
  }

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const studentLink = `${origin}/?code=${code}`;

  return (
    <Layout backHref="/teacher" backLabel="← Classes">
      <div className="mb-4"><LabelEditor code={code} label={cls.label ?? ""} /></div>

      <div className="bg-surface2 border-[1.5px] border-accent rounded-xl p-6 text-center mb-4">
        <div className="text-[11px] font-semibold tracking-[2px] uppercase text-muted mb-2">Class code for students</div>
        <div className="font-display text-[52px] font-black text-accent tracking-[8px] leading-none mb-3.5">{code}</div>
        <div className="flex justify-center gap-2 flex-wrap">
          <CopyButton text={code} label="Copy code" />
          <CopyButton text={studentLink} label="Copy student link" />
        </div>
      </div>

      {cls.archived && (
        <Card style={{ borderColor: "var(--accent2)" }}>
          <div className="text-[14px] leading-[1.5]">
            This class is archived. It&apos;s hidden from your class list, and students can still use the code.
          </div>
        </Card>
      )}

      <ClassEditor code={code} initialConfig={cls.config} auth={{ kind: "account" }} />

      <section className="mt-10">
        <div className="font-display text-[26px] font-black uppercase tracking-[-0.5px] mb-1">Filed Workouts</div>
        <div className="text-muted text-[14px] mb-4">Workouts you pinned to {classLabel(cls)}.</div>
        {filed.length === 0 ? (
          <div className="text-muted text-[14px]">Nothing filed yet. Use &ldquo;+ File&rdquo; on any workout below.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filed.map((w) => (
              <WorkoutLine key={w.id} w={w} code={code} filed showDay />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="font-display text-[26px] font-black uppercase tracking-[-0.5px] mb-1">Student Workouts</div>
        <div className="text-muted text-[14px] mb-4">Everything generated with this code in the last 14 days.</div>
        {byDay.size === 0 ? (
          <div className="text-muted text-[14px]">No student workouts yet. Share the code to get started.</div>
        ) : (
          [...byDay.entries()].map(([day, list]) => (
            <div key={day} className="mb-5">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-2">
                {dayLabel(day)} · {list.length} workout{list.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-col gap-2">
                {list.map((w) => <WorkoutLine key={w.id} w={w} code={code} filed={filedIds.has(w.id)} />)}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="mt-10">
        <div className="font-display text-[26px] font-black uppercase tracking-[-0.5px] mb-1">Ratings</div>
        <div className="text-muted text-[14px] mb-4">What students said in the last 14 days.</div>
        {reviews.length === 0 ? (
          <div className="text-muted text-[14px]">No ratings yet.</div>
        ) : (
          <Card>
            <CardTitle>
              {reviews.length} rating{reviews.length === 1 ? "" : "s"} · average{" "}
              {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}★
            </CardTitle>
            <div className="flex flex-col">
              {reviews.map((r, i) => (
                <div key={i} className="border-t border-border py-3 first:border-t-0 first:pt-0">
                  <div className="flex justify-between gap-3 text-[13px]">
                    <span className="text-accent tracking-[2px]">{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></span>
                    <span className="text-muted">{r.student_name || "Anonymous"} · {dayLabel(dayKey(r.created_at))} {timeLabel(r.created_at)}</span>
                  </div>
                  {r.comment && <div className="text-[14px] leading-[1.5] mt-1">{r.comment}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      <div className="mt-10 flex justify-between items-center gap-3">
        <Link href="/teacher" className="text-muted text-[13px]">← All classes</Link>
        <ArchiveToggle code={code} archived={cls.archived} />
      </div>
    </Layout>
  );
}

function WorkoutLine({ w, code, filed, showDay = false }: { w: WorkoutRow; code: string; filed: boolean; showDay?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-4 py-3">
      <div className="min-w-0">
        <Link href={`/w/${w.id}`} className="font-semibold text-[15px] text-text no-underline hover:text-accent block truncate">
          {w.title || "Workout"}
        </Link>
        <div className="text-[12px] text-muted">
          {w.created_by ? "Your sample" : w.student_name || "Anonymous"} · {showDay ? `${dayLabel(dayKey(w.created_at))} ` : ""}{timeLabel(w.created_at)}
        </div>
      </div>
      <FileToggle code={code} workoutId={w.id} filed={filed} />
    </div>
  );
}
