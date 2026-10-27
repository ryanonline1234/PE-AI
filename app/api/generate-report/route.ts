import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { teacherKeyMatches } from "@/lib/teacher-key";
import { teacherFromRequest } from "@/lib/teacher-auth";
import { DEFAULT_TIME_ZONE, formatDateInTimeZone, isValidTimeZone, startOfTodayInTimeZone } from "@/lib/time";

// LLM call — raise the function limit so Vercel doesn't time out mid-generation.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, teacherKey, timeZone } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const supabase = createServerClient();

  const limited = await checkRateLimit(supabase, [
    { name: `report:code:${code}`,            windowSeconds: WINDOW.hour,       limit: 20 },
    { name: `report:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 20 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  // Only the class's teacher can read its feedback: the owner account, or the key holder.
  const { teacher } = await teacherFromRequest(request);
  const { data: cls, error: clsError } = await supabase
    .from("pe_classes")
    .select("teacher_key_hash, owner_id")
    .eq("code", code)
    .maybeSingle();

  if (clsError || !cls) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }
  const ownsIt = Boolean(teacher && cls.owner_id === teacher.id);
  if (!ownsIt) {
    if (!cls.teacher_key_hash) {
      return NextResponse.json(
        { error: cls.owner_id
            ? "This class belongs to a teacher's Mitty account. Sign in to see its report."
            : "This class has no teacher key yet. Save the class settings once to get one." },
        { status: 403 }
      );
    }
    if (!teacherKeyMatches(teacherKey, cls.teacher_key_hash)) {
      return NextResponse.json({ error: "Wrong teacher key for this class." }, { status: 403 });
    }
  }

  // "Today" in the school's local day, not the UTC day.
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const todayStart = startOfTodayInTimeZone(tz);

  const { data: reviews, error: dbError } = await supabase
    .from("workout_reviews")
    .select("student_name, rating, comment, created_at")
    .eq("class_code", code)
    .gte("created_at", todayStart.toISOString())
    .order("created_at", { ascending: true });

  if (dbError) {
    console.error("DB error:", dbError);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }

  if (!reviews || reviews.length === 0) {
    return NextResponse.json({ report: null, message: "No reviews submitted for today yet." });
  }

  // Build a summary for Claude
  const avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
  const ratingCounts = [1, 2, 3, 4, 5].map(
    n => `${n} star: ${reviews.filter(r => r.rating === n).length}`
  ).join(", ");
  const comments = reviews
    .filter(r => r.comment)
    .map((r, i) => `${i + 1}. ${r.student_name ? `${r.student_name}: ` : ""}"${r.comment}"`)
    .join("\n");

  const prompt = `You are a PE teacher assistant summarizing student workout feedback for a teacher.

CLASS CODE: ${code}
DATE: ${formatDateInTimeZone(tz)}
TOTAL RESPONSES: ${reviews.length}
AVERAGE RATING: ${avgRating} / 5
RATING BREAKDOWN: ${ratingCounts}

STUDENT COMMENTS:
${comments || "No written comments submitted."}

Write a concise report for the teacher. Include:
1. A one-sentence overall summary of how the class felt about the workout.
2. Key positives students mentioned (if any).
3. Key concerns or areas to improve (if any).
4. A short recommendation for the next session based on the feedback.

Be direct and factual. Do not invent feedback beyond what is provided. Keep the report under 200 words.`;

  let report: string;
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    report = message.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (err) {
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }

  return NextResponse.json({
    report,
    meta: { total: reviews.length, avgRating: parseFloat(avgRating), ratingCounts },
  });
}
