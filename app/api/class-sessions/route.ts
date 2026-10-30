import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig, cleanSessionName } from "@/lib/class-config";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { getClassByCode, getSessionByDate, type ClassInfo } from "@/lib/class-access";
import { addDays, isDateKey, schoolDate } from "@/lib/time";
import type { ClassConfig } from "@/lib/types";

// Plan, edit and delete a teacher class's dated sessions (docs/02-sessions.md).
// Only the class's owner may, and only for teacher classes: personal classes
// keep one set of settings.

const MAX_DAYS_AHEAD = 365;

/** A session keeps its settings and specifics; the background and research live on the class. */
const forSession = (c: ClassConfig): ClassConfig => ({ ...c, background: "", sources: [] });

type Caller = Awaited<ReturnType<typeof callerFromRequest>>;
type Owned = { cls: ClassInfo; date: string; body: Record<string, unknown>; withCookies: Caller["withCookies"] };

/** Parse the body, rate-limit, and check the caller owns the (teacher) class. */
async function ownedSession(request: NextRequest): Promise<Owned | NextResponse> {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!isDateKey(body.date)) return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });

  const limited = await checkRateLimit(createServerClient(), [
    { name: `session:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 60 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const cls = await getClassByCode(code);
  if (!cls || cls.owner_id !== account.id) {
    return NextResponse.json({ error: "Only the owner of this class can plan its sessions." }, { status: 403 });
  }
  if (cls.kind !== "class") {
    return NextResponse.json({ error: "Sessions are for teacher classes." }, { status: 400 });
  }
  return { cls, date: body.date, body, withCookies };
}

/** Plan a session, copying the class defaults or another session's settings. */
export async function POST(request: NextRequest) {
  const owned = await ownedSession(request);
  if (owned instanceof NextResponse) return owned;
  const { cls, date, body, withCookies } = owned;

  const today = schoolDate();
  if (date < today || date > addDays(today, MAX_DAYS_AHEAD)) {
    return NextResponse.json({ error: "Pick today or a day in the next year." }, { status: 400 });
  }

  // Copying a session keeps its name, AI check and specifics: they describe the
  // same day plan. Starting from the defaults starts with no specifics.
  let config: ClassConfig = { ...cls.config, specifics: "" };
  let name = cleanSessionName(body.name);
  if (isDateKey(body.copyFrom)) {
    const source = await getSessionByDate(cls.id, body.copyFrom);
    if (!source) return NextResponse.json({ error: "The session to copy from no longer exists." }, { status: 404 });
    config = source.config;
    name ||= source.name ?? "";
  }

  const { error } = await createServerClient().from("class_sessions").insert({
    class_id: cls.id,
    session_date: date,
    name: name || null,
    config: forSession(clampConfig(config as unknown as Record<string, unknown>)),
  });
  if (error?.code === "23505") {
    return NextResponse.json({ error: "There's already a session on that day." }, { status: 409 });
  }
  if (error) {
    console.error("create session error:", error);
    return NextResponse.json({ error: "Couldn't plan the session. Try again." }, { status: 500 });
  }
  return withCookies(NextResponse.json({ date }));
}

/**
 * Save a session's settings, its specifics, and/or its name. Each save owns its
 * fields (docs/03 §7): `config` keeps the specifics, `specifics` keeps the settings.
 */
export async function PATCH(request: NextRequest) {
  const owned = await ownedSession(request);
  if (owned instanceof NextResponse) return owned;
  const { cls, date, body, withCookies } = owned;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ((body.config && typeof body.config === "object") || typeof body.specifics === "string") {
    const current = await getSessionByDate(cls.id, date);
    if (!current) return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
    // Only known keys, clamped (lib/class-config.ts), so nobody can widen the limits.
    let config: ClassConfig = current.config;
    if (body.config && typeof body.config === "object") {
      config = { ...clampConfig(body.config as Record<string, unknown>), specifics: current.config.specifics ?? "" };
    }
    if (typeof body.specifics === "string") config = clampConfig({ ...config, specifics: body.specifics });
    patch.config = forSession(config);
  }
  if (typeof body.name === "string") patch.name = cleanSessionName(body.name) || null;

  const { data, error } = await createServerClient()
    .from("class_sessions")
    .update(patch)
    .eq("class_id", cls.id)
    .eq("session_date", date)
    .select("id");
  if (error) {
    console.error("update session error:", error);
    return NextResponse.json({ error: "Couldn't save the session." }, { status: 500 });
  }
  if (!data || data.length === 0) return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
  return withCookies(NextResponse.json({ ok: true }));
}

/** Delete a session. Its workouts stay; students get the defaults that day. */
export async function DELETE(request: NextRequest) {
  const owned = await ownedSession(request);
  if (owned instanceof NextResponse) return owned;
  const { cls, date, withCookies } = owned;

  const { error } = await createServerClient()
    .from("class_sessions")
    .delete()
    .eq("class_id", cls.id)
    .eq("session_date", date);
  if (error) {
    console.error("delete session error:", error);
    return NextResponse.json({ error: "Couldn't delete the session." }, { status: 500 });
  }
  return withCookies(NextResponse.json({ ok: true }));
}
