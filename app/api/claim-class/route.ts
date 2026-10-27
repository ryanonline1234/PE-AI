import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { teacherKeyMatches } from "@/lib/teacher-key";
import { teacherFromRequest } from "@/lib/teacher-auth";

// A signed-in teacher adds an existing class to their account: class code plus
// its teacher key. Legacy classes that never got a key can be claimed with the
// code alone (only Mitty faculty can be signed-in teachers).
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teacher, withCookies } = await teacherFromRequest(request);
  if (!teacher) {
    return NextResponse.json({ error: "Sign in with your Mitty teacher account first." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.toUpperCase().trim() : "";
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter a 6-character class code." }, { status: 400 });
  }

  const supabase = createServerClient();
  const limited = await checkRateLimit(supabase, [
    { name: `claim:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 20 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const { data: cls } = await supabase
    .from("pe_classes")
    .select("teacher_key_hash, owner_id")
    .eq("code", code)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: "No class with that code." }, { status: 404 });
  if (cls.owner_id === teacher.id) return withCookies(NextResponse.json({ code, already: true }));
  if (cls.owner_id) {
    return NextResponse.json({ error: "That class already belongs to another teacher's account." }, { status: 403 });
  }
  if (cls.teacher_key_hash && !teacherKeyMatches(body.teacherKey, cls.teacher_key_hash)) {
    return NextResponse.json({ error: "That teacher key doesn't match this class." }, { status: 403 });
  }

  const { error } = await supabase
    .from("pe_classes")
    .update({ owner_id: teacher.id, updated_at: new Date().toISOString() })
    .eq("code", code)
    .is("owner_id", null);
  if (error) {
    console.error("claim-class update error:", error);
    return NextResponse.json({ error: "Couldn't add the class. Try again." }, { status: 500 });
  }
  return withCookies(NextResponse.json({ code }));
}
