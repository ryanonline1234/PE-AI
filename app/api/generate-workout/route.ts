import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import type { ClassConfig, Workout } from "@/lib/types";

const EQUIPMENT_LABELS: Record<string, string> = {
  none:  "No equipment — bodyweight only",
  basic: "Basic equipment (resistance bands, mats, jump ropes)",
  gym:   "Full gym (free weights, machines, cardio equipment)",
};

const FOCUS_LABELS: Record<string, string> = {
  mixed:       "Mixed — balanced cardio, strength, and flexibility",
  cardio:      "Cardiovascular endurance",
  strength:    "Muscular strength and endurance",
  flexibility: "Flexibility and mobility / stretching",
};

// Basic prompt-injection guard: strip common injection patterns from student input
function sanitizeStudentInput(str: string = ""): string {
  return str
    .slice(0, 300)
    .replace(/ignore (previous|all|prior|above)/gi, "")
    .replace(/system prompt/gi, "")
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, "")
    .trim();
}

export async function POST(request: Request) {
  // 1. Auth check
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, studentName, fitnessLevel, limitations } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  // 3. Fetch class config from Supabase (students can't tamper with these values)
  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from("pe_classes")
    .select("config")
    .eq("code", code)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const cfg = data.config as ClassConfig;

  // 4. Validate student-supplied fields
  const validLevels = ["beginner", "moderate", "advanced"];
  const level = validLevels.includes(fitnessLevel) ? fitnessLevel : "moderate";
  const name  = sanitizeStudentInput(studentName  || "");
  const notes = sanitizeStudentInput(limitations  || "None reported");

  // 5. Build system prompt from the teacher-controlled config
  const systemPrompt = `You are a certified PE coach AI generating safe, age-appropriate, school-approved workouts for high school students.

CLASS PARAMETERS (set by the teacher — these are fixed and must be respected):
- Total workout duration: ${cfg.duration} minutes
- Minimum calories to burn: ${cfg.minCalories} kcal
- Available equipment: ${EQUIPMENT_LABELS[cfg.equipment] ?? cfg.equipment}
- Intensity level: ${cfg.intensity}
- Workout focus: ${FOCUS_LABELS[cfg.focus] ?? cfg.focus}
${cfg.customPrompt ? `- Additional teacher instructions: ${cfg.customPrompt}` : ""}

RULES:
- All exercises must be safe and appropriate for a high school PE class
- Adapt difficulty to match the student's stated fitness level
- Modify or exclude exercises that conflict with the student's stated injuries or limitations
- Ensure the estimated total calories burned meets or exceeds ${cfg.minCalories} kcal
- Keep the total time at or under ${cfg.duration} minutes
- Be encouraging and motivating in tone

RESPONSE FORMAT:
Respond ONLY with a single valid JSON object. No markdown, no backticks, no explanation before or after.
Use exactly this structure:
{
  "title": "Short catchy workout name (3-5 words)",
  "totalCalories": <integer>,
  "totalDuration": <integer — minutes>,
  "warmup": [
    { "name": "exercise name", "duration": "e.g. 90 sec", "description": "Brief instruction" }
  ],
  "exercises": [
    {
      "name": "exercise name",
      "sets": <integer>,
      "reps": "e.g. 12 reps or 30 sec",
      "rest": "e.g. 30 sec",
      "calories": <integer — estimated for this exercise>,
      "tip": "One-sentence form or safety tip",
      "howTo": ["Step 1 instruction", "Step 2 instruction", "Step 3 instruction"]
    }
  ],
  "cooldown": [
    { "name": "stretch or exercise name", "duration": "e.g. 1 min", "description": "Brief instruction" }
  ],
  "coachNote": "One short motivational sentence for this student"
}`;

  const userMessage = `Student name: ${name || "Anonymous"}
Fitness level: ${level}
Injuries or physical limitations: ${notes}

Please generate my workout.`;

  // 6. Call DeepSeek (OpenAI-compatible) — key never leaves the server.
  //    Built here (not at module load), mirroring createServerClient above, so
  //    the production build's page-data collection doesn't require
  //    DEEPSEEK_API_KEY at build time — only at request time.
  //    max_tokens is 2048 (up from the old 1024): exercises now carry howTo[]
  //    arrays, and 1024 risked truncating the JSON and breaking the parse.
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });

  let workout: Workout;
  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    // Defensive: DeepSeek's JSON mode should return clean JSON, but keep the
    // ```json fence-strip + JSON.parse fallback that the prompt's format implies.
    const raw = (completion.choices[0].message.content ?? "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "");

    workout = JSON.parse(raw);
  } catch (err) {
    console.error("DeepSeek/parse error:", err);
    return NextResponse.json({ error: "Failed to generate workout. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ workout });
}
