import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";

function sanitize(str = "") {
  return str
    .slice(0, 500)
    .replace(/ignore (previous|all|prior|above)/gi, "")
    .replace(/system prompt/gi, "")
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, "")
    .trim();
}

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

  const { code, studentName, rating, comment } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const ratingInt = parseInt(rating, 10);
  if (!ratingInt || ratingInt < 1 || ratingInt > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error: dbError } = await supabase.from("workout_reviews").insert({
    class_code:   code,
    student_name: sanitize(studentName || ""),
    rating:       ratingInt,
    comment:      sanitize(comment || ""),
  });

  if (dbError) {
    console.error("DB error:", dbError);
    return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
