import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { generateTeacherKey, hashTeacherKey, teacherKeyMatches } from "@/lib/teacher-key";
import { clampConfig } from "@/lib/class-config";
import { teacherFromRequest } from "@/lib/teacher-auth";
import type { ClassConfig } from "@/lib/types";

export async function POST(request: NextRequest) {
  // 1. Verify the request comes from our own frontend
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate the body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, config, teacherKey } = body;

  if (!code || typeof code !== "string" || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code format" }, { status: 400 });
  }

  if (!config || typeof config !== "object") {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }

  const supabase = createServerClient();

  const limited = await checkRateLimit(supabase, [
    { name: `save:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 30 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  // 3. Sanitize config — only known keys, clamped (lib/class-config.ts), so
  //    teachers can't inject arbitrary data or widen the limits.
  const safeConfig: ClassConfig = clampConfig(config);

  // 4. Who may save. A class is controlled by EITHER its owner account (signed
  //    in) or its teacher key. Cases:
  //    - owned by an account: that account, or the key if the class still has one
  //    - keyed, no owner: the key must match
  //    - new or legacy (no key, no owner): a signed-in teacher becomes the owner;
  //      anyone else gets a fresh key, shown once (the classic flow)
  const { teacher, withCookies } = await teacherFromRequest(request);
  const { data: existing, error: lookupError } = await supabase
    .from("pe_classes")
    .select("teacher_key_hash, owner_id")
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase lookup error:", lookupError);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }

  const ownsIt = Boolean(teacher && existing?.owner_id === teacher.id);
  const keyOk = Boolean(existing?.teacher_key_hash && teacherKeyMatches(teacherKey, existing.teacher_key_hash));
  let issuedKey: string | null = null;
  const row: Record<string, unknown> = { code, config: safeConfig, updated_at: new Date().toISOString() };

  if (existing?.owner_id) {
    if (!ownsIt && !keyOk) {
      return NextResponse.json(
        { error: "This class belongs to a teacher's Mitty account. Sign in with that account to change it." },
        { status: 403 }
      );
    }
  } else if (existing?.teacher_key_hash) {
    if (!keyOk) {
      return NextResponse.json(
        { error: "Wrong teacher key for this class. Only the teacher who created it can change it." },
        { status: 403 }
      );
    }
  } else if (teacher) {
    row.owner_id = teacher.id;
  } else {
    issuedKey = generateTeacherKey();
    row.teacher_key_hash = hashTeacherKey(issuedKey);
  }

  // Labels belong to account-owned classes.
  if (typeof body.label === "string" && (ownsIt || row.owner_id)) {
    row.label = body.label.trim().slice(0, 60) || null;
  }

  // 5. Upsert. Columns not in `row` (an existing key hash, owner) are left as is.
  const { error } = await supabase.from("pe_classes").upsert(row, { onConflict: "code" });

  if (error) {
    console.error("Supabase upsert error:", error);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }

  return withCookies(NextResponse.json({ success: true, code, ...(issuedKey ? { teacherKey: issuedKey } : {}) }));
}
