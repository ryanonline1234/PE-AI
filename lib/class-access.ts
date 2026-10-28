// Server-side class lookups with the service role, plus the access rule:
// a teacher class ('class') is open to any signed-in Mitty account that has
// the code; a personal class ('personal') only to its owner.
import { createServerClient } from "@/lib/supabase";
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
