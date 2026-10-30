import Link from "next/link";
import { Circle, CircleCheck, Monitor, Star } from "lucide-react";
import { DayReport } from "@/components/DayReport";
import type { ClassConfig } from "@/lib/types";

export interface TodayStudent {
  userId: string;
  name: string;
  /** Workouts generated today in this class. */
  today: number;
}

/**
 * The top of a teacher's class page (docs/04 T1): today's settings, who has and
 * hasn't made today's workout, today's rating, the report, and the projector.
 * The one screen a teacher needs during a period.
 */
export function TodayPanel({ code, dateLabel, session, settings, students, ratings }: {
  code: string;
  /** "Thursday, October 29". */
  dateLabel: string;
  /** Today's session, or null when students get the default settings. */
  session: { date: string; name: string } | null;
  settings: ClassConfig;
  students: TodayStudent[];
  /** Today's star ratings. */
  ratings: number[];
}) {
  const done = students.filter((s) => s.today > 0);
  const notYet = students.filter((s) => s.today === 0);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

  return (
    <section aria-label="Today" className="bg-surface border border-border border-t-[3px] border-t-accent rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="t-eyebrow text-accent mb-1">Today · {dateLabel}</div>
          <div className="t-card">
            {session ? (
              <Link href={`/classes/${code}/s/${session.date}`} className="text-text no-underline hover:text-accent">
                {session.name || "Untitled session"}
              </Link>
            ) : (
              "Default settings"
            )}
          </div>
          <div className="text-muted text-[13px] mt-0.5">
            {settings.duration} min · {settings.intensity} · {settings.focus}
            {!session && " · no session planned"}
          </div>
        </div>
        <Link
          href={`/classes/${code}/projector`}
          className="inline-flex items-center gap-1.5 bg-surface2 text-text border border-border rounded-lg px-3.5 py-2 text-[14px] font-medium no-underline hover:border-accent"
        >
          <Monitor className="icon" /> Projector
        </Link>
      </div>

      <div className="flex gap-8 mt-4">
        <div>
          <div className="font-display text-[30px] font-bold text-accent2 leading-none">
            {done.length}<span className="text-muted text-[20px]"> / {students.length}</span>
          </div>
          <div className="text-[12px] text-muted mt-0.5">made today&apos;s workout</div>
        </div>
        <div>
          <div className="font-display text-[30px] font-bold text-accent2 leading-none inline-flex items-center gap-1">
            {avg ?? "–"}{avg && <Star className="w-[0.55em] h-[0.55em] fill-current" aria-label="stars" />}
          </div>
          <div className="text-[12px] text-muted mt-0.5">{ratings.length} rating{ratings.length === 1 ? "" : "s"} today</div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="text-muted text-[14px] leading-[1.5] mt-4">
          No one has joined yet. Put the code on the projector so students can scan in.
        </div>
      ) : (
        <details className="mt-4 group" open={students.length <= 40 || undefined}>
          <summary className="t-label cursor-pointer select-none">Who&apos;s done</summary>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {notYet.map((s) => (
              <span key={s.userId} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface2 text-muted px-2.5 py-1 text-[13px]">
                <Circle className="icon" aria-label="not yet" />{s.name}
              </span>
            ))}
            {done.map((s) => (
              <span key={s.userId} className="inline-flex items-center gap-1 rounded-full border border-[rgba(200,255,0,0.35)] bg-[rgba(200,255,0,0.08)] text-accent px-2.5 py-1 text-[13px]">
                <CircleCheck className="icon" aria-label="done" />{s.name}{s.today > 1 ? ` ×${s.today}` : ""}
              </span>
            ))}
          </div>
        </details>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <DayReport code={code} />
      </div>
    </section>
  );
}
