import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentFlow } from "@/components/StudentFlow";
import { DEFAULT_CONFIG } from "@/lib/class-config";
import { getAccount, isTeacherAccount } from "@/lib/supabase-auth";
import { loadClasses } from "@/lib/teacher-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your own workout — PE.AI", robots: { index: false } };

// A teacher's own workout: the class settings and the "how do you feel" form on
// one page, no class needed. Workouts land in the teacher's own-workout space
// (their one personal class, created on the first Generate) and the form opens
// with the settings they used last.
export default async function TeacherWorkoutPage() {
  const account = await getAccount();
  if (!account) redirect("/login?next=/teacher/workout");
  if (!isTeacherAccount(account)) redirect("/me");

  // Read-only here: the space is created through the API, never on page load.
  const space = (await loadClasses()).find((c) => c.kind === "personal" && c.owner_id === account.id) ?? null;

  return (
    <StudentFlow
      code={space?.code ?? null}
      label="Just me"
      config={{ ...DEFAULT_CONFIG, ...(space?.config ?? {}) }}
      firstName={account.name.split(" ")[0]}
      accountId={account.id}
      backHref="/teacher"
      ownSettings
    />
  );
}
