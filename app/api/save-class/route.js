import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";

export async function POST(request) {
  // 1. Verify the request comes from our own frontend
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate the body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, config } = body;

  if (!code || typeof code !== "string" || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code format" }, { status: 400 });
  }

  if (!config || typeof config !== "object") {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }

  // 3. Sanitize config — only allow known keys so teachers can't inject arbitrary data
  const safeConfig = {
    duration:     Math.min(Math.max(Number(config.duration)    || 30,  10), 120),
    minCalories:  Math.min(Math.max(Number(config.minCalories) || 150, 50), 800),
    intensity:    ["low", "moderate", "high"].includes(config.intensity) ? config.intensity : "moderate",
    focus:        ["mixed", "cardio", "strength", "flexibility"].includes(config.focus) ? config.focus : "mixed",
    equipment:    ["none", "basic", "gym"].includes(config.equipment) ? config.equipment : "none",
    // Truncate free-text to prevent prompt injection via the teacher field
    customPrompt: typeof config.customPrompt === "string"
      ? config.customPrompt.slice(0, 500)
      : "",
  };

  // 4. Upsert into Supabase
  const supabase = createServerClient();
  const { error } = await supabase
    .from("pe_classes")
    .upsert({ code, config: safeConfig, updated_at: new Date().toISOString() }, { onConflict: "code" });

  if (error) {
    console.error("Supabase upsert error:", error);
    return NextResponse.json({ error: "Failed to save class" }, { status: 500 });
  }

  return NextResponse.json({ success: true, code });
}
