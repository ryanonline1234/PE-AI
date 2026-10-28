// Server-side class lookups with the service role, plus the access rule:
// a teacher class ('class') is open to any signed-in Mitty account that has
// the code; a personal class ('personal') only to its owner.
import { createServerClient } from "@/lib/supabase";
import { applyPreset, type PresetFields, type SettingPreset } from "@/lib/presets";
import type { ClassConfig, ClassSession } from "@/lib/types";

export type ClassKind = "class" | "personal";

export interface ClassInfo {
  id: string;
  code: string;
  config: ClassConfig;
  owner_id: string | null;
  kind: ClassKind;
  label: string | null;
  archived: boolean;
}

export async function getClassByCode(code: string): Promise<ClassInfo | null> {
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;
  const { data } = await createServerClient()
    .from("pe_classes")
    .select("id, code, config, owner_id, kind, label, archived")
    .eq("code", code)
    .maybeSingle();
  return (data as ClassInfo | null) ?? null;
}

export function canUseClass(cls: ClassInfo, userId: string): boolean {
  return cls.kind !== "personal" || cls.owner_id === userId;
}

/** Record that a student joined a class (idempotent). Owners aren't members of their own class. */
export async function ensureMember(cls: ClassInfo, userId: string): Promise<void> {
  if (cls.owner_id === userId || cls.kind === "personal") return;
  const { error } = await createServerClient()
    .from("class_members")
    .upsert({ class_id: cls.id, user_id: userId }, { onConflict: "class_id,user_id", ignoreDuplicates: true });
  if (error) console.error("ensureMember failed:", error);
}

export const MAX_PERSONAL_CLASSES = 3;

// ── Sessions (docs/02-sessions.md) ─────────────────────────────
// Service-role lookups: a student generating in a class isn't its owner, so
// RLS would hide the session from their client.

const SESSION_COLS = "id, session_date, name, config";

/** The session planned for a class on one school date, if any. */
export async function getSessionByDate(classId: string, date: string): Promise<ClassSession | null> {
  const { data } = await createServerClient()
    .from("class_sessions")
    .select(SESSION_COLS)
    .eq("class_id", classId)
    .eq("session_date", date)
    .maybeSingle();
  return (data as ClassSession | null) ?? null;
}

/** A student's own sport brief (docs/03), or "" when they haven't saved one. */
export async function getStudentBrief(userId: string): Promise<string> {
  const { data } = await createServerClient()
    .from("student_briefs")
    .select("brief")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.brief as string | undefined) ?? "";
}

/** One session by id, only if it belongs to the class. */
export async function getSessionById(classId: string, id: string): Promise<ClassSession | null> {
  const { data } = await createServerClient()
    .from("class_sessions")
    .select(SESSION_COLS)
    .eq("class_id", classId)
    .eq("id", id)
    .maybeSingle();
  return (data as ClassSession | null) ?? null;
}

// ── Setting presets (DECISIONS 2026-10-28) ────────────────────

/** One of the owner's presets, or null. */
export async function getPreset(ownerId: string, id: unknown): Promise<SettingPreset | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServerClient()
    .from("setting_presets")
    .select("id, name, fields, updated_at")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  return (data as SettingPreset | null) ?? null;
}

/**
 * Copy a preset into every active teacher class the owner has (their default
 * settings and AI background). Planned sessions are left alone: they're day
 * plans, and new sessions start from the updated defaults. Returns how many
 * classes changed.
 */
export async function applyPresetToAllClasses(ownerId: string, fields: PresetFields): Promise<number> {
  const db = createServerClient();
  const { data: classes } = await db
    .from("pe_classes")
    .select("id, config")
    .eq("owner_id", ownerId)
    .eq("kind", "class")
    .eq("archived", false);
  let changed = 0;
  for (const c of classes ?? []) {
    const config = applyPreset(c.config as ClassConfig, fields, { background: true });
    const { error } = await db.from("pe_classes").update({ config, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) console.error("apply preset failed for a class:", error);
    else changed += 1;
  }
  return changed;
}
