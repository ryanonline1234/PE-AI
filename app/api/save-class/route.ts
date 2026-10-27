import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { generateTeacherKey, hashTeacherKey, teacherKeyMatches } from "@/lib/teacher-key";
import { clampConfig } from "@/lib/class-config";
import type { ClassConfig } from "@/lib/types";

export async function POST(request: Request) {
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

  // 4. Teacher-key check. Three cases:
  //    - new class: generate a key, store its hash, return the key once
  //    - legacy class (no hash yet): first keyed save claims it the same way
  //    - keyed class: the supplied key must match
  const { data: existing, error: lookupError } = await supabase
    .from("pe_classes")
    .select("teacher_key_hash")
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    console.error("Supabase lookup error:", lookupError);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }

  let issuedKey: string | null = null;
  let keyHash: string;

  if (existing?.teacher_key_hash) {
    if (!teacherKeyMatches(teacherKey, existing.teacher_key_hash)) {
      return NextResponse.json(
        { error: "Wrong teacher key for this class. Only the teacher who created it can change it." },
        { status: 403 }
      );
    }
    keyHash = existing.teacher_key_hash;
  } else {
    issuedKey = generateTeacherKey();
    keyHash = hashTeacherKey(issuedKey);
  }

  // 5. Upsert into Supabase
  const { error } = await supabase
    .from("pe_classes")
    .upsert(
      { code, config: safeConfig, teacher_key_hash: keyHash, updated_at: new Date().toISOString() },
      { onConflict: "code" }
    );

  if (error) {
    console.error("Supabase upsert error:", error);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }

  return NextResponse.json({ success: true, code, ...(issuedKey ? { teacherKey: issuedKey } : {}) });
}
