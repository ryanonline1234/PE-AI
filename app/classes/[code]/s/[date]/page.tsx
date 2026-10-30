import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Layout } from "@/components/ui";
import { ClassEditor } from "@/components/ClassEditor";
import { SessionSpecificsCard } from "@/components/AIContext";
import { Tabs } from "@/components/Tabs";
import { DeleteSessionButton, SessionNameEditor } from "@/components/teacher/TeacherControls";
import { getAccount } from "@/lib/supabase-auth";
import { isDateKey, schoolDate } from "@/lib/time";
import { classLabel, dayLabel, loadClass, loadPresets, loadSession, longDayLabel } from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Session — PE.AI", robots: { index: false } };

type Params = Promise<{ code: string; date: string }>;
type Search = Promise<{ tab?: string }>;

// One session of a teacher class (docs/02-sessions.md): its specifics, asked
// after the class background (docs/03 §7), and its settings, AI check and
// sample preview. Tabs on iPad and computer; one scroll on phones. Owner only.
export default async function SessionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { code: rawCode, date } = await params;
  const code = rawCode.toUpperCase();
  const account = await getAccount();
  if (!account) redirect(`/login?next=/classes/${code}/s/${date}`);

  const cls = await loadClass(code);
  if (!cls || cls.owner_id !== account.id || cls.kind !== "class" || !isDateKey(date)) notFound();
  // A deleted (or never planned) session: back to the class, where it can be planned.
  const [session, presets] = await Promise.all([loadSession(cls.id, date), loadPresets()]);
  if (!session) redirect(`/classes/${code}`);

  const isToday = date === schoolDate();
  // "Today", "Tomorrow" or "Yesterday" next to the full date; nothing otherwise.
  const relative = dayLabel(date);
  const near = ["Today", "Tomorrow", "Yesterday"].includes(relative) ? ` · ${relative}` : "";

  return (
    <Layout backHref={`/classes/${code}`} backLabel="Class" wide>
      <div className="t-eyebrow text-muted mb-1">
        {classLabel(cls)} · Session{near}
      </div>
      <h1 className="t-page mb-4">{longDayLabel(date)}</h1>
      {isToday && (
        <div className="text-[14px] text-accent mb-4">Live today: students who open the class get these settings.</div>
      )}
      <div className="mb-6 md:max-w-[620px]">
        <SessionNameEditor code={code} date={date} name={session.name ?? ""} />
      </div>

      <Tabs
        initial={(await searchParams).tab}
        tabs={[
          {
            id: "specifics", label: "Session specifics",
            content: <SessionSpecificsCard key={`${session.id}-specifics`} code={code} date={date} config={session.config} classConfig={cls.config} />,
          },
          {
            id: "settings", label: "Settings",
            content: <ClassEditor key={session.id} code={code} initialConfig={session.config} kind="class" sessionDate={date} classConfig={cls.config} presets={presets} />,
          },
        ]}
      />

      <div className="mt-10 flex justify-between items-start gap-3">
        <Link href={`/classes/${code}`} className="text-muted text-[13px] inline-flex items-center gap-1"><ArrowLeft className="icon" />{classLabel(cls)}</Link>
        <DeleteSessionButton code={code} date={date} />
      </div>
    </Layout>
  );
}
