// Shared / reopened workout: /w/<id>. Server-rendered straight from the
// database (service role, no API hop), read-only except for reviews and Go mode.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAccount } from "@/lib/supabase-auth";
import { canUseClass, getClassByCode } from "@/lib/class-access";
import { createServerClient } from "@/lib/supabase";
import { WORKOUT_ID_RE } from "@/lib/workout-id";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import type { SavedWorkout, Workout } from "@/lib/types";
import { Layout } from "@/components/ui";
import { WorkoutScreen } from "@/components/WorkoutScreen";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function loadWorkout(rawId: string): Promise<SavedWorkout | null> {
  const id = rawId.toUpperCase();
  if (!WORKOUT_ID_RE.test(id)) return null;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("workouts")
    .select("id, class_code, student_name, workout, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    code: data.class_code,
    studentName: data.student_name ?? "",
    workout: data.workout as Workout,
    createdAt: data.created_at,
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const saved = await loadWorkout(id);
  return {
    title: saved ? `${saved.workout.title} — PE.AI` : "Workout not found — PE.AI",
    robots: { index: false },
  };
}

export default async function SharedWorkoutPage({ params }: { params: Params }) {
  const { id } = await params;
  // Everyone signs in (DECISIONS 2026-10-27); shared links work for any Mitty account.
  const account = await getAccount();
  if (!account) redirect(`/login?next=/w/${encodeURIComponent(id.toUpperCase())}`);
  const saved = await loadWorkout(id);
  if (!saved) notFound();
  // Personal classes are owner-only everywhere, shared links included.
  const cls = await getClassByCode(saved.code);
  if (!cls || !canUseClass(cls, account.id)) notFound();

  const made = new Date(saved.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: DEFAULT_TIME_ZONE,
  });
  const makeOwnHref = `/c/${encodeURIComponent(saved.code)}`;

  return (
    <Layout backHref="/" backLabel="← Home">
      <div className="no-print text-[12px] text-muted uppercase tracking-[1.5px] mb-4">
        Class <span className="text-accent">{saved.code}</span> · {made}
      </div>
      <WorkoutScreen
        workout={saved.workout}
        code={saved.code}
        studentName={saved.studentName}
        shareId={saved.id}
        makeOwnHref={makeOwnHref}
      />
    </Layout>
  );
}
