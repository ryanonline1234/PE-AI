import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { WORKOUT_ID_RE } from "@/lib/workout-id";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { canUseClass, getClassByCode } from "@/lib/class-access";

function sanitize(str: string = ""): string {
  return str
    .slice(0, 500)
    .replace(/ignore (previous|all|prior|above)/gi, "")
    .replace(/system prompt/gi, "")
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, "")
    .trim();
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { account } = await callerFromRequest(request);
  if (!account) return signInRequired();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, rating, comment, workoutId } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const ratingInt = parseInt(rating, 10);
  if (!ratingInt || ratingInt < 1 || ratingInt > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
  }

  const supabase = createServerClient();

  const limited = await checkRateLimit(supabase, [
    { name: `review:code:${code}`,            windowSeconds: WINDOW.hour,       limit: 300 },
    { name: `review:user:${account.id}`,     windowSeconds: WINDOW.tenMinutes, limit: 30  },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const cls = await getClassByCode(code);
  if (!cls || !canUseClass(cls, account.id)) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  // Link the workout only if it really belongs to this class.
  let linkedWorkout: string | null = null;
  if (typeof workoutId === "string" && WORKOUT_ID_RE.test(workoutId)) {
    const { data: w } = await supabase.from("workouts").select("class_code").eq("id", workoutId).maybeSingle();
    if (w?.class_code === code) linkedWorkout = workoutId;
  }

  const { error: dbError } = await supabase.from("workout_reviews").insert({
    class_code:   code,
    student_name: account.name.slice(0, 50),
    rating:       ratingInt,
    comment:      sanitize(comment || ""),
    user_id:      account.id,
    workout_id:   linkedWorkout,
  });

  if (dbError) {
    console.error("DB error:", dbError);
    return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
