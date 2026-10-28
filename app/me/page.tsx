import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardTitle, Layout } from "@/components/ui";
import { AccountBar } from "@/components/teacher/AccountBar";
import { JoinClassForm, NewClassForm } from "@/components/teacher/TeacherControls";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { classLabel, dayKey, dayLabel, loadClasses, loadMemberClassIds, loadWorkouts } from "@/lib/teacher-data";
import { getStudentBrief, MAX_PERSONAL_CLASSES } from "@/lib/class-access";
import { MySportCard } from "@/components/MySportCard";

export const metadata: Metadata = { title: "My workouts — PE.AI", robots: { index: false } };
export const dynamic = "force-dynamic";

// The student home: join a teacher's class, run a personal class, see history.
export default async function StudentHome() {
  const account = await getAccount();
  if (!account) redirect("/login?next=/me");
  if (isTeacherAccount(account)) redirect("/teacher");

  // RLS returns classes this student owns (personal) or has joined.
  const [classes, memberIds, mine, sportBrief] = await Promise.all([
    loadClasses(),
    loadMemberClassIds(),
    loadWorkouts({ createdBy: account.id, limit: 60 }),
    getStudentBrief(account.id),
  ]);
  const personal = classes.filter((c) => c.kind === "personal" && c.owner_id === account.id && !c.archived);
  const joined = classes.filter((c) => c.kind === "class" && memberIds.has(c.id) && !c.archived);
  const archivedPersonal = classes.filter((c) => c.kind === "personal" && c.owner_id === account.id && c.archived);
  const labelFor = new Map(classes.map((c) => [c.code, classLabel(c)]));
  const firstName = account.name.split(" ")[0];

  return (
    <Layout>
      <AccountBar account={account} />

      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-2">Hey {firstName}</div>
      <div className="text-muted text-[15px] mb-6">Enter your class code to get today&apos;s workout.</div>

      <Card>
        <CardTitle>Join a class</CardTitle>
        <JoinClassForm />
      </Card>

      <MySportCard initialBrief={sportBrief} />

      {joined.length > 0 && (
        <section className="mt-8">
          <div className="font-display text-[22px] font-bold uppercase tracking-[1px] mb-3">Your classes</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {joined.map((c) => (
              <Link
                key={c.code}
                href={`/c/${c.code}`}
                className="block bg-surface border border-border rounded-xl p-5 no-underline text-text transition-[border-color] duration-150 hover:border-accent focus-visible:border-accent"
              >
                <div className="font-display text-[22px] font-bold uppercase leading-tight">{classLabel(c)}</div>
                <div className="text-muted text-[13px] mt-1">{c.config.duration} min · {c.config.intensity} · {c.config.focus}</div>
                <div className="text-accent text-[14px] font-semibold mt-3">Start a workout →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="font-display text-[22px] font-bold uppercase tracking-[1px] mb-1">Your own training</div>
        <div className="text-muted text-[14px] mb-3">
          A personal class only you can use, with your own settings. Good for workouts outside PE.
        </div>
        {personal.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {personal.map((c) => (
              <div key={c.code} className="bg-surface border border-border rounded-xl p-5">
                <div className="font-display text-[22px] font-bold uppercase leading-tight">{classLabel(c)}</div>
                <div className="text-muted text-[13px] mt-1">{c.config.duration} min · {c.config.intensity} · {c.config.focus}</div>
                <div className="flex gap-4 mt-3 text-[14px] font-semibold">
                  <Link href={`/c/${c.code}`} className="text-accent no-underline">Start a workout →</Link>
                  <Link href={`/classes/${c.code}`} className="text-muted no-underline hover:text-text">Settings</Link>
                </div>
              </div>
            ))}
          </div>
        )}
        {personal.length < MAX_PERSONAL_CLASSES && (
          <NewClassForm placeholder="Name it, e.g. Summer conditioning" buttonLabel="+ New personal class" />
        )}
        {archivedPersonal.length > 0 && (
          <div className="text-muted text-[13px] mt-3">
            Archived:{" "}
            {archivedPersonal.map((c, i) => (
              <span key={c.code}>
                {i > 0 && " · "}
                <Link href={`/classes/${c.code}`} className="text-muted underline">{classLabel(c)}</Link>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="font-display text-[22px] font-bold uppercase tracking-[1px] mb-3">Your workouts</div>
        {mine.length === 0 ? (
          <div className="text-muted text-[14px]">Nothing yet. Your workouts will show up here.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {mine.map((w) => (
              <Link
                key={w.id}
                href={`/w/${w.id}`}
                className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-4 py-3 no-underline text-text hover:border-accent"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] truncate">{w.title || "Workout"}</div>
                  <div className="text-[12px] text-muted">{labelFor.get(w.class_code) ?? w.class_code}</div>
                </div>
                <div className="text-[12px] text-muted shrink-0">{dayLabel(dayKey(w.created_at))}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
