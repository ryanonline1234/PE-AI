"use client";

// The week view of a class's sessions (docs/04 T4): Monday to Friday at a
// glance, plan a day in one tap, and copy a day's plan to other days, the
// same weekday in coming weeks ("repeat weekly"), or other classes (periods).
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { apiCopySession, apiCreateSession } from "@/lib/api";
import { addDays } from "@/lib/time";
import { Dialog, dialogCancel, dialogConfirm } from "@/components/Dialog";
import { cn } from "@/lib/utils";

export interface WeekDay {
  date: string;
  session: { name: string; summary: string } | null;
}

const fmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export function WeekPlanner({ code, today, weekStart, thisWeek, days, otherClasses }: {
  code: string;
  today: string;
  /** Monday of the week shown, and of the current school week. */
  weekStart: string;
  thisWeek: string;
  /** Monday to Friday. */
  days: WeekDay[];
  /** The teacher's other active classes, for "copy to other periods". */
  otherClasses: { code: string; label: string }[];
}) {
  const router = useRouter();
  const [copying, setCopying] = useState<WeekDay | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  // "Planning…" lasts until the refreshed grid arrives, not just the API call.
  const [refreshing, startRefresh] = useTransition();
  const busyDate = planning;
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const weekHref = (monday: string) => `/classes/${code}?tab=sessions&week=${monday}`;
  const title = weekStart === thisWeek ? "This week"
    : weekStart === addDays(thisWeek, 7) ? "Next week"
    : weekStart === addDays(thisWeek, -7) ? "Last week"
    : `Week of ${fmt(weekStart, { month: "short", day: "numeric" })}`;

  async function plan(date: string) {
    setPlanning(date); setError(""); setMsg("");
    try {
      await apiCreateSession(code, date, null);
      startRefresh(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlanning(null);
    }
  }
  if (planning && !refreshing && days.some((d) => d.date === planning && d.session)) setPlanning(null);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="t-card">{title}</div>
          <div className="text-muted text-[13px]">{fmt(weekStart, { month: "short", day: "numeric" })} – {fmt(addDays(weekStart, 4), { month: "short", day: "numeric" })}</div>
        </div>
        <div className="flex gap-1.5">
          <Link href={weekHref(addDays(weekStart, -7))} aria-label="Previous week" className="inline-flex items-center justify-center w-10 h-10 bg-surface2 border border-border rounded-lg text-text"><ChevronLeft className="w-5 h-5" /></Link>
          {weekStart !== thisWeek && (
            <Link href={weekHref(thisWeek)} className="inline-flex items-center px-3 h-10 bg-surface2 border border-border rounded-lg text-[13px] text-text no-underline">This week</Link>
          )}
          <Link href={weekHref(addDays(weekStart, 7))} aria-label="Next week" className="inline-flex items-center justify-center w-10 h-10 bg-surface2 border border-border rounded-lg text-text"><ChevronRight className="w-5 h-5" /></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        {days.map((d) => {
          const past = d.date < today;
          const isToday = d.date === today;
          return (
            <div
              key={d.date}
              className={cn(
                "bg-surface border rounded-xl p-3 flex sm:flex-col gap-2 sm:min-h-[132px]",
                isToday ? "border-accent" : "border-border",
                past && "opacity-60"
              )}
            >
              <div className="w-[64px] sm:w-auto shrink-0">
                <div className="text-[12px] font-semibold text-muted">{fmt(d.date, { weekday: "short" })}</div>
                <div className="font-display text-[22px] font-bold leading-none">{fmt(d.date, { day: "numeric" })}</div>
                {isToday && <div className="text-[11px] font-semibold text-accent mt-0.5">Today</div>}
              </div>
              {d.session ? (
                <div className="min-w-0 flex-1 flex flex-col">
                  <Link href={`/classes/${code}/s/${d.date}`} className="font-semibold text-[14px] leading-[1.3] text-text no-underline hover:text-accent break-words">
                    {d.session.name || "Untitled session"}
                  </Link>
                  <div className="text-[12px] text-muted mt-0.5">{d.session.summary}</div>
                  <button
                    type="button"
                    onClick={() => { setCopying(d); setMsg(""); setError(""); }}
                    className="mt-auto pt-2 self-start inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[13px] font-semibold text-accent cursor-pointer"
                  >
                    <Copy className="icon" /> Copy…
                  </button>
                </div>
              ) : (
                <div className="min-w-0 flex-1 flex flex-col">
                  <div className="text-[13px] text-muted">Default settings</div>
                  {!past && (
                    <button
                      type="button"
                      onClick={() => plan(d.date)}
                      disabled={busyDate !== null}
                      className="mt-auto pt-2 self-start inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[13px] font-semibold text-accent cursor-pointer disabled:opacity-45"
                    >
                      <Plus className="icon" /> {busyDate === d.date ? "Planning…" : "Plan"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <div role="status" className="text-[13px] text-accent mt-2">{msg}</div>}
      {error && <div className="text-[13px] text-danger mt-2">{error}</div>}

      {copying && (
        <CopyDialog
          code={code}
          today={today}
          day={copying}
          week={days.map((d) => d.date)}
          otherClasses={otherClasses}
          onClose={() => setCopying(null)}
          onDone={(text) => { setCopying(null); setMsg(text); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CopyDialog({ code, today, day, week, otherClasses, onClose, onDone }: {
  code: string;
  today: string;
  day: WeekDay;
  week: string[];
  otherClasses: { code: string; label: string }[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [days, setDays] = useState<Set<string>>(() => new Set());
  const [weeks, setWeeks] = useState(0);
  const [classes, setClasses] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const weekday = fmt(day.date, { weekday: "long" });
  const dates = [...days, ...Array.from({ length: weeks }, (_, i) => addDays(day.date, 7 * (i + 1)))];
  const targets = [code, ...classes].flatMap((c) =>
    [day.date, ...dates].filter((d) => !(c === code && d === day.date)).map((d) => ({ code: c, date: d }))
  );
  const labelFor = new Map(otherClasses.map((c) => [c.code, c.label]));

  function toggle<T>(set: Set<T>, v: T, update: (s: Set<T>) => void) {
    const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); update(n);
  }

  async function copy() {
    setBusy(true); setError("");
    try {
      const r = await apiCopySession(code, day.date, targets);
      const kept = r.skipped.length
        ? ` ${r.skipped.length} already had a session and kept it (${r.skipped.map((s) => `${s.code === code ? "" : `${labelFor.get(s.code) ?? s.code} `}${fmt(s.date, { weekday: "short", month: "short", day: "numeric" })}`).join(", ")}).`
        : "";
      onDone(`Copied to ${r.copied} day${r.copied === 1 ? "" : "s"}.${kept}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const chip = (on: boolean) => cn(
    "rounded-lg border px-3 py-1.5 text-[13px] font-medium cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed",
    on ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent" : "border-border bg-surface2 text-muted"
  );

  return (
    <Dialog
      title={`Copy “${day.session?.name || "Untitled session"}”`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={dialogCancel} onClick={onClose}>Cancel</button>
          <button type="button" className={dialogConfirm()} onClick={copy} disabled={busy || targets.length === 0}>
            {busy ? "Copying…" : targets.length ? `Copy to ${targets.length}` : "Copy"}
          </button>
        </>
      }
    >
      <div className="text-text">
        <div className="t-label mt-3 mb-2">Other days this week</div>
        <div className="flex flex-wrap gap-1.5">
          {week.filter((d) => d !== day.date).map((d) => (
            <button key={d} type="button" aria-pressed={days.has(d)} disabled={d < today} className={chip(days.has(d))} onClick={() => toggle(days, d, setDays)}>
              {fmt(d, { weekday: "short" })} {Number(d.slice(8))}
            </button>
          ))}
        </div>

        <div className="t-label mt-4 mb-2">Repeat weekly</div>
        <select
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          className="w-full bg-surface2 border border-border rounded-lg text-text text-[14px] px-3 py-2.5 outline-none"
        >
          <option value={0}>Don&apos;t repeat</option>
          {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>Every {weekday} for the next {n} week{n === 1 ? "" : "s"}</option>)}
        </select>

        {otherClasses.length > 0 && (
          <>
            <div className="t-label mt-4 mb-2">Other classes, same days</div>
            <div className="flex flex-wrap gap-1.5">
              {otherClasses.map((c) => (
                <button key={c.code} type="button" aria-pressed={classes.has(c.code)} className={chip(classes.has(c.code))} onClick={() => toggle(classes, c.code, setClasses)}>
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="text-[12px] text-muted mt-4">Days that already have a session keep theirs.</div>
        {error && <div className="text-[13px] text-danger mt-2">{error}</div>}
      </div>
    </Dialog>
  );
}
