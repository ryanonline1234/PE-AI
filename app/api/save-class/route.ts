import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig } from "@/lib/class-config";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { getClassByCode } from "@/lib/class-access";

// Save a class's settings. Only the class's owner account may: a teacher for a
// class, a student for their personal class. Classes are created through
// /api/classes, never here.
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  if (!body.config || typeof body.config !== "object") {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }

  const supabase = createServerClient();
  const limited = await checkRateLimit(supabase, [
    { name: `save:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 30 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const cls = await getClassByCode(code);
  if (!cls || cls.owner_id !== account.id) {
    return NextResponse.json({ error: "Only the owner of this class can change it." }, { status: 403 });
  }

  // Only known keys, clamped (lib/class-config.ts), so nobody can widen the limits.
  const { error } = await supabase
    .from("pe_classes")
    .update({ config: clampConfig(body.config), updated_at: new Date().toISOString() })
    .eq("id", cls.id);
  if (error) {
    console.error("save-class update error:", error);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }
  return withCookies(NextResponse.json({ success: true, code }));
}
