import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";

export async function GET(request: Request) {
  // 1. Verify the request comes from our own frontend
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Extract class code from query params
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.toUpperCase();

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const supabase = createServerClient();

  const limited = await checkRateLimit(supabase, [
    { name: `lookup:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 300 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  // 3. Look up in Supabase. Never return the teacher key hash.
  const { data, error } = await supabase
    .from("pe_classes")
    .select("config, teacher_key_hash, owner_id")
    .eq("code", code)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  // hasTeacherKey lets the teacher UI know whether to ask for a key before saving;
  // managed says a signed-in teacher account owns it. Never the hash or the owner id.
  return NextResponse.json({
    config: data.config,
    hasTeacherKey: Boolean(data.teacher_key_hash),
    managed: Boolean(data.owner_id),
  });
}
