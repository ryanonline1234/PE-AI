import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StudentFlow } from "@/components/StudentFlow";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { canUseClass, ensureMember, getClassByCode } from "@/lib/class-access";
import { DEFAULT_CONFIG } from "@/lib/class-config";

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

  const home = isTeacherAccount(account) ? "/teacher" : "/me";
  return (
    <StudentFlow
      code={code}
      label={cls.label || (cls.kind === "personal" ? "My Training" : `Class ${code}`)}
      config={{ ...DEFAULT_CONFIG, ...cls.config }}
      firstName={account.name.split(" ")[0]}
      backHref={home}
    />
  );
}
