import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { applyPresetToAllClasses } from "@/lib/class-access";
import { cleanPresetFields, cleanPresetName } from "@/lib/presets";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";

// A teacher's named setting presets (DECISIONS 2026-10-28). Save (a preset with
// the same name is updated), rename, delete. Saving can also copy the preset
// into every class at once (`applyToAll`); /api/presets/apply does that alone.

const MAX_PRESETS = 30;

async function teacher(request: NextRequest) {
  if (!verifySecret(request)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return { error: signInRequired() };
  if (!isTeacherAccount(account)) return { error: NextResponse.json({ error: "Presets are for teachers." }, { status: 403 }) };
  const limited = await checkRateLimit(createServerClient(), [
    { name: `presets:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 60 },
  ]);
  if (limited) return { error: rateLimitedResponse(limited) };
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return { account, withCookies, body };
}

/** Save a preset under a name (same name = update), optionally applying it to every class. */
export async function POST(request: NextRequest) {
  const t = await teacher(request);
  if ("error" in t) return t.error;
  const { account, withCookies, body } = t;
  const name = cleanPresetName(body.name);
  const fields = cleanPresetFields(body.fields);
  if (!name) return NextResponse.json({ error: "Name the preset." }, { status: 400 });
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: "Pick at least one setting to save." }, { status: 400 });

  const db = createServerClient();
  const { count } = await db.from("setting_presets").select("id", { count: "exact", head: true }).eq("owner_id", account.id);
  const { data: existing } = await db.from("setting_presets").select("id").eq("owner_id", account.id).eq("name", name).maybeSingle();
  if (!existing && (count ?? 0) >= MAX_PRESETS) {
    return NextResponse.json({ error: `You can keep up to ${MAX_PRESETS} presets. Delete one first.` }, { status: 400 });
  }
  const { data, error } = await db
    .from("setting_presets")
    .upsert({ owner_id: account.id, name, fields, updated_at: new Date().toISOString() }, { onConflict: "owner_id,name" })
    .select("id")
    .single();
  if (error || !data) {
    console.error("save preset error:", error);
    return NextResponse.json({ error: "Couldn't save the preset." }, { status: 500 });
  }
  const applied = body.applyToAll === true ? await applyPresetToAllClasses(account.id, fields) : 0;
  return withCookies(NextResponse.json({ id: data.id, updated: Boolean(existing), applied }));
}

/** Rename a preset. */
export async function PATCH(request: NextRequest) {
  const t = await teacher(request);
  if ("error" in t) return t.error;
  const { account, withCookies, body } = t;
  const name = cleanPresetName(body.name);
  if (!name || typeof body.id !== "string") return NextResponse.json({ error: "Name the preset." }, { status: 400 });
  const { data, error } = await createServerClient()
    .from("setting_presets")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("owner_id", account.id)
    .eq("id", body.id)
    .select("id");
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a preset with that name." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Couldn't rename the preset." }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "That preset no longer exists." }, { status: 404 });
  return withCookies(NextResponse.json({ ok: true }));
}

/** Delete a preset. Classes it was applied to keep their settings. */
export async function DELETE(request: NextRequest) {
  const t = await teacher(request);
  if ("error" in t) return t.error;
  const { account, withCookies, body } = t;
  if (typeof body.id !== "string") return NextResponse.json({ error: "Which preset?" }, { status: 400 });
  const { error } = await createServerClient().from("setting_presets").delete().eq("owner_id", account.id).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Couldn't delete the preset." }, { status: 500 });
  return withCookies(NextResponse.json({ ok: true }));
}
