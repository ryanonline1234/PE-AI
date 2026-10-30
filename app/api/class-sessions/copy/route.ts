import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig } from "@/lib/class-config";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { getClassByCode, getSessionByDate } from "@/lib/class-access";
import { addDays, isDateKey, schoolDate } from "@/lib/time";

// Copy one session to other days and/or other classes (docs/04 T4, the week
// view): "the same plan on Tuesday and Thursday", "repeat weekly", "periods 2
// and 4 too". Days that already have a session keep theirs; the reply says
// which were skipped. Owner only, teacher classes only, today to a year ahead.

const MAX_TARGETS = 60;
const MAX_DAYS_AHEAD = 365;

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!isDateKey(body.date)) return NextResponse.json({ error: "Which session?" }, { status: 400 });
  const rawTargets = Array.isArray(body.targets) ? body.targets : [];
  if (rawTargets.length === 0) return NextResponse.json({ error: "Pick at least one day or class." }, { status: 400 });
  if (rawTargets.length > MAX_TARGETS) return NextResponse.json({ error: `Copy to at most ${MAX_TARGETS} days at a time.` }, { status: 400 });

  const db = createServerClient();
  const limited = await checkRateLimit(db, [
    { name: `session:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 60 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const source = await getClassByCode(code);
  if (!source || source.owner_id !== account.id || source.kind !== "class") {
    return NextResponse.json({ error: "Only the owner of this class can copy its sessions." }, { status: 403 });
  }
  const session = await getSessionByDate(source.id, body.date);
  if (!session) return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });

  // Every target class must be one of the caller's own teacher classes.
  const today = schoolDate();
  const last = addDays(today, MAX_DAYS_AHEAD);
  const classes = new Map([[source.code, source]]);
  const seen = new Set<string>();
  const targets: { classId: string; code: string; date: string }[] = [];
  for (const t of rawTargets) {
    if (!t || typeof t !== "object") continue;
    const { code: tc, date: td } = t as Record<string, unknown>;
    const tCode = typeof tc === "string" ? tc.toUpperCase() : "";
    if (!isDateKey(td) || td < today || td > last) {
      return NextResponse.json({ error: "Pick days from today to a year ahead." }, { status: 400 });
    }
    if (!classes.has(tCode)) {
      const cls = await getClassByCode(tCode);
      if (!cls || cls.owner_id !== account.id || cls.kind !== "class") {
        return NextResponse.json({ error: "You can only copy to your own classes." }, { status: 403 });
      }
      classes.set(tCode, cls);
    }
    const key = `${tCode} ${td}`;
    if (seen.has(key) || (tCode === source.code && td === body.date)) continue;
    seen.add(key);
    targets.push({ classId: classes.get(tCode)!.id, code: tCode, date: td });
  }
  if (targets.length === 0) return NextResponse.json({ error: "Pick at least one other day or class." }, { status: 400 });

  // Same settings, specifics and name; the background stays with each class.
  const config = { ...clampConfig(session.config as unknown as Record<string, unknown>), background: "", sources: [] };
  const { data, error } = await db
    .from("class_sessions")
    .upsert(
      targets.map((t) => ({ class_id: t.classId, session_date: t.date, name: session.name, config })),
      { onConflict: "class_id,session_date", ignoreDuplicates: true }
    )
    .select("class_id, session_date");
  if (error) {
    console.error("copy sessions error:", error);
    return NextResponse.json({ error: "Couldn't copy the session. Try again." }, { status: 500 });
  }
  const made = new Set((data ?? []).map((r) => `${r.class_id} ${r.session_date}`));
  const skipped = targets.filter((t) => !made.has(`${t.classId} ${t.date}`)).map((t) => ({ code: t.code, date: t.date }));
  return withCookies(NextResponse.json({ copied: made.size, skipped }));
}
