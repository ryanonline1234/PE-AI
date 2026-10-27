// Read helpers for the signed-in teacher pages. Every query runs through the
// user-scoped client, so RLS limits it to the teacher's own classes.
import { createUserClient } from "@/lib/supabase-auth";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import type { ClassConfig } from "@/lib/types";

export const TZ = DEFAULT_TIME_ZONE;

export interface ClassRow {
  id: string;
  code: string;
  label: string | null;
  config: ClassConfig;
  archived: boolean;
  updated_at: string;
}

export interface WorkoutRow {
  id: string;
  class_code: string;
  student_name: string | null;
  created_by: string | null;
  created_at: string;
  title: string | null;
}

export const classLabel = (c: { label: string | null; code: string }) => c.label || `Class ${c.code}`;

export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

export function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

export async function loadClasses(): Promise<ClassRow[]> {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("pe_classes")
    .select("id, code, label, config, archived, updated_at")
    .order("updated_at", { ascending: false });
  return (data ?? []) as ClassRow[];
}

export async function loadClass(code: string): Promise<ClassRow | null> {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("pe_classes")
    .select("id, code, label, config, archived, updated_at")
    .eq("code", code)
    .maybeSingle();
  return (data as ClassRow | null) ?? null;
}

const WORKOUT_COLS = "id, class_code, student_name, created_by, created_at, title:workout->>title";

export async function loadWorkouts(opts: { classCodes?: string[]; createdBy?: string; sinceDays?: number; limit?: number }): Promise<WorkoutRow[]> {
  const supabase = await createUserClient();
  let q = supabase.from("workouts").select(WORKOUT_COLS).order("created_at", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.classCodes) {
    if (opts.classCodes.length === 0) return [];
    q = q.in("class_code", opts.classCodes);
  }
  if (opts.createdBy) q = q.eq("created_by", opts.createdBy);
  if (opts.sinceDays) q = q.gte("created_at", new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString());
  const { data } = await q;
  return (data ?? []) as unknown as WorkoutRow[];
}

export interface ReviewRow {
  class_code: string;
  student_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function loadReviews(classCodes: string[], sinceDays = 30): Promise<ReviewRow[]> {
  if (classCodes.length === 0) return [];
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("workout_reviews")
    .select("class_code, student_name, rating, comment, created_at")
    .in("class_code", classCodes)
    .gte("created_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as ReviewRow[];
}

/** workout id → codes of the classes it's filed under (teacher's classes only). */
export async function loadFiling(classes: ClassRow[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (classes.length === 0) return out;
  const supabase = await createUserClient();
  const codeById = new Map(classes.map((c) => [c.id, c.code]));
  const { data } = await supabase.from("class_workouts").select("class_id, workout_id");
  for (const row of data ?? []) {
    const code = codeById.get(row.class_id);
    if (!code) continue;
    out.set(row.workout_id, [...(out.get(row.workout_id) ?? []), code]);
  }
  return out;
}

export async function loadWorkoutsByIds(ids: string[]): Promise<WorkoutRow[]> {
  if (ids.length === 0) return [];
  const supabase = await createUserClient();
  const { data } = await supabase.from("workouts").select(WORKOUT_COLS).in("id", ids);
  return (data ?? []) as unknown as WorkoutRow[];
}
