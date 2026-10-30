import { NextResponse, type NextRequest } from "next/server";
import { randomInt } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig } from "@/lib/class-config";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { getPreset, MAX_PERSONAL_CLASSES } from "@/lib/class-access";
import { applyPreset } from "@/lib/presets";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const cleanLabel = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "");
const SOLO_LABEL = "Just me";

/**
 * Create a class owned by the caller. Teachers (and admins) get a regular class
 * students can join; students get a personal class only they can use.
 * `solo: true` from a teacher returns their own-workout space instead: their
 * one personal class, created on first use (DECISIONS 2026-10-28).
 */
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  const body = await request.json().catch(() => ({}));
  const supabase = createServerClient();
  const limited = await checkRateLimit(supabase, [
    { name: `create:user:${account.id}`, windowSeconds: WINDOW.hour, limit: 20 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  if (body.solo === true && isTeacherAccount(account)) {
    // A teacher can't otherwise make a personal class, so theirs is this space.
    const { data: existing } = await supabase
      .from("pe_classes")
      .select("code")
      .eq("owner_id", account.id)
      .eq("kind", "personal")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return withCookies(NextResponse.json({ code: existing.code }));
  }

  const solo = body.solo === true && isTeacherAccount(account);
  const kind = isTeacherAccount(account) && !solo ? "class" : "personal";
  if (kind === "personal" && !solo) {
    const { count } = await supabase
      .from("pe_classes")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", account.id)
      .eq("kind", "personal")
      .eq("archived", false);
    if ((count ?? 0) >= MAX_PERSONAL_CLASSES) {
      return NextResponse.json(
        { error: `You can have up to ${MAX_PERSONAL_CLASSES} personal classes. Archive one to make room.` },
        { status: 400 }
      );
    }
  }

  // A teacher can start a class from one of their presets (copied in).
  const preset = kind === "class" ? await getPreset(account.id, body.presetId) : null;
  const config = preset ? applyPreset(clampConfig({}), preset.fields, { background: true }) : clampConfig({});

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await supabase.from("pe_classes").insert({
      code,
      kind,
      config,
      owner_id: account.id,
      label: solo ? SOLO_LABEL : cleanLabel(body.label) || (kind === "personal" ? "My Training" : null),
    });
    if (!error) return withCookies(NextResponse.json({ code }));
    if (error.code !== "23505") {
      console.error("create class error:", error);
      break;
    }
  }
  return NextResponse.json({ error: "Couldn't create the class. Try again." }, { status: 500 });
}

/** Rename or archive one of the caller's classes. */
export async function PATCH(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string") patch.label = cleanLabel(body.label) || null;
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  const supabase = createServerClient();
  if (body.archived === false) {
    // Restoring a personal class must respect the same cap as creating one.
    const { data: cls } = await supabase.from("pe_classes").select("kind").eq("code", code).eq("owner_id", account.id).maybeSingle();
    if (cls?.kind === "personal") {
      const { count } = await supabase
        .from("pe_classes")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", account.id)
        .eq("kind", "personal")
        .eq("archived", false);
      if ((count ?? 0) >= MAX_PERSONAL_CLASSES) {
        return NextResponse.json(
          { error: `You can have up to ${MAX_PERSONAL_CLASSES} personal classes. Archive one first.` },
          { status: 400 }
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("pe_classes")
    .update(patch)
    .eq("code", code)
    .eq("owner_id", account.id)
    .select("code");
  if (error) return NextResponse.json({ error: "Couldn't update the class." }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not your class." }, { status: 404 });
  return withCookies(NextResponse.json({ ok: true }));
}
