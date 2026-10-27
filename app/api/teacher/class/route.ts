import { NextResponse, type NextRequest } from "next/server";
import { randomInt } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { clampConfig } from "@/lib/class-config";
import { teacherFromRequest } from "@/lib/teacher-auth";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const cleanLabel = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "");

/** Create a class owned by the signed-in teacher, with default settings. */
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { teacher, withCookies } = await teacherFromRequest(request);
  if (!teacher) return NextResponse.json({ error: "Sign in with your Mitty teacher account first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const supabase = createServerClient();
  const limited = await checkRateLimit(supabase, [
    { name: `create:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 20 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await supabase.from("pe_classes").insert({
      code,
      config: clampConfig({}),
      owner_id: teacher.id,
      label: cleanLabel(body.label) || null,
    });
    if (!error) return withCookies(NextResponse.json({ code }));
    if (error.code !== "23505") {
      console.error("create class error:", error);
      break;
    }
  }
  return NextResponse.json({ error: "Couldn't create the class. Try again." }, { status: 500 });
}

/** Rename or archive one of the teacher's classes. */
export async function PATCH(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { teacher, withCookies } = await teacherFromRequest(request);
  if (!teacher) return NextResponse.json({ error: "Sign in with your Mitty teacher account first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.label === "string") patch.label = cleanLabel(body.label) || null;
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pe_classes")
    .update(patch)
    .eq("code", code)
    .eq("owner_id", teacher.id)
    .select("code");
  if (error) return NextResponse.json({ error: "Couldn't update the class." }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not your class." }, { status: 404 });
  return withCookies(NextResponse.json({ ok: true }));
}
