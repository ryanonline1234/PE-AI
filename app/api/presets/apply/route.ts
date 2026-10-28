import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { applyPresetToAllClasses, getPreset } from "@/lib/class-access";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";

// Copy one of the caller's presets into every active class they teach (default
// settings + AI background; planned sessions are left alone). DECISIONS 2026-10-28.
export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();
  if (!isTeacherAccount(account)) return NextResponse.json({ error: "Presets are for teachers." }, { status: 403 });
  const limited = await checkRateLimit(createServerClient(), [
    { name: `presets:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 60 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const preset = await getPreset(account.id, body.id);
  if (!preset) return NextResponse.json({ error: "That preset no longer exists." }, { status: 404 });
  const applied = await applyPresetToAllClasses(account.id, preset.fields);
  return withCookies(NextResponse.json({ applied }));
}
