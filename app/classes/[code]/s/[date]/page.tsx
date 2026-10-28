import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Layout } from "@/components/ui";
import { ClassEditor } from "@/components/ClassEditor";
import { DeleteSessionButton, SessionNameEditor } from "@/components/teacher/TeacherControls";
import { getAccount } from "@/lib/supabase-auth";
import { isDateKey, schoolDate } from "@/lib/time";
import { classLabel, dayLabel, loadClass, loadSession, longDayLabel } from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Session — PE.AI", robots: { index: false } };

type Params = Promise<{ code: string; date: string }>;

// One session of a teacher class: that day's settings, AI check and sample
// preview (docs/02-sessions.md). Owner only.
export default async function SessionPage({ params }: { params: Params }) {
  const { code: rawCode, date } = await params;
  const code = rawCode.toUpperCase();
  const account = await getAccount();
  if (!account) redirect(`/login?next=/classes/${code}/s/${date}`);

  const cls = await loadClass(code);
  if (!cls || cls.owner_id !== account.id || cls.kind !== "class" || !isDateKey(date)) notFound();
  // A deleted (or never planned) session: back to the class, where it can be planned.
  const session = await loadSession(cls.id, date);
  if (!session) redirect(`/classes/${code}`);

  const isToday = date === schoolDate();
  // "Today", "Tomorrow" or "Yesterday" next to the full date; nothing otherwise.
  const relative = dayLabel(date);
  const near = ["Today", "Tomorrow", "Yesterday"].includes(relative) ? ` · ${relative}` : "";

  return (
    <Layout backHref={`/classes/${code}`} backLabel="← Class">
      <div className="text-[11px] font-semibold tracking-[2px] uppercase text-muted mb-1">
        {classLabel(cls)} · Session{near}
      </div>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-4">
        {longDayLabel(date)}
      </div>
      {isToday && (
        <div className="text-[14px] text-accent mb-4">Live today: students who open the class get these settings.</div>
      )}
      <div className="mb-6">
        <SessionNameEditor code={code} date={date} name={session.name ?? ""} />
      </div>

      <ClassEditor key={session.id} code={code} initialConfig={session.config} kind="class" sessionDate={date} />

      <div className="mt-10 flex justify-between items-start gap-3">
        <Link href={`/classes/${code}`} className="text-muted text-[13px]">← {classLabel(cls)}</Link>
        <DeleteSessionButton code={code} date={date} />
      </div>
    </Layout>
  );
}
