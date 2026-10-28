import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { cleanStudentBrief } from "@/lib/student-brief";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";

// Save or delete the caller's own sport brief (docs/03, DECISIONS 2026-10-28).
// It is cleaned before it's stored: capped, injection patterns stripped, and
// sentences about injuries, pain or medical details dropped. The response
// returns what was stored so the page shows exactly that.

async function caller(request: NextRequest) {
  if (!verifySecret(request)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return { error: signInRequired() };
  const limited = await checkRateLimit(createServerClient(), [
    { name: `brief:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 30 },
  ]);
  if (limited) return { error: rateLimitedResponse(limited) };
  return { account, withCookies };
}

export async function POST(request: NextRequest) {
  const c = await caller(request);
  if ("error" in c) return c.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const submitted = typeof body.brief === "string" ? body.brief.trim() : "";
  const brief = cleanStudentBrief(submitted);
  const supabase = createServerClient();

  const { error } = brief
    ? await supabase
        .from("student_briefs")
        .upsert({ user_id: c.account.id, brief, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    : await supabase.from("student_briefs").delete().eq("user_id", c.account.id);
  if (error) {
    console.error("student brief save error:", error);
    return NextResponse.json({ error: "Couldn't save your sport brief." }, { status: 500 });
  }
  // `trimmed`: something was taken out (usually a health detail), so the page can say so.
  return c.withCookies(NextResponse.json({ brief, trimmed: brief !== submitted.replace(/\s+/g, " ") }));
}

export async function DELETE(request: NextRequest) {
  const c = await caller(request);
  if ("error" in c) return c.error;
  const { error } = await createServerClient().from("student_briefs").delete().eq("user_id", c.account.id);
  if (error) {
    console.error("student brief delete error:", error);
    return NextResponse.json({ error: "Couldn't delete your sport brief." }, { status: 500 });
  }
  return c.withCookies(NextResponse.json({ ok: true }));
}
