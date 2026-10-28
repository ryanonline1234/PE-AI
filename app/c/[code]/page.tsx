import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StudentFlow } from "@/components/StudentFlow";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { canUseClass, ensureMember, getClassByCode, getSessionByDate } from "@/lib/class-access";
import { DEFAULT_CONFIG } from "@/lib/class-config";
import { schoolDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workout — PE.AI", robots: { index: false } };

type Params = Promise<{ code: string }>;

// Start a workout in a class. Signing in is required; opening the page joins
// the student to the class so their teacher sees them on the roster.
export default async function ClassWorkoutPage({ params }: { params: Params }) {
  const code = (await params).code.toUpperCase();
  const account = await getAccount();
  if (!account) redirect(`/login?next=/c/${code}`);

  const cls = await getClassByCode(code);
  if (!cls || !canUseClass(cls, account.id)) notFound();
  await ensureMember(cls, account.id);
  // Today's session sets the day's settings; the class defaults cover days without one.
  const session = cls.kind === "class" ? await getSessionByDate(cls.id, schoolDate()) : null;

  const home = isTeacherAccount(account) ? "/teacher" : "/me";
  return (
    <StudentFlow
      code={code}
      label={cls.label || (cls.kind === "personal" ? "My Training" : `Class ${code}`)}
      sessionName={session?.name}
      config={{ ...DEFAULT_CONFIG, ...(session?.config ?? cls.config) }}
      firstName={account.name.split(" ")[0]}
      backHref={home}
    />
  );
}
