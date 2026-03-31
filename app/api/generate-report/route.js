import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";

const client = new Anthropic();

export async function POST(request) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  // Fetch today's reviews for this class (UTC day)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const supabase = createServerClient();
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
DATE: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
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

  let report;
  try {
    const message = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    report = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  } catch (err) {
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }

  return NextResponse.json({
    report,
    meta: { total: reviews.length, avgRating: parseFloat(avgRating), ratingCounts },
  });
}
