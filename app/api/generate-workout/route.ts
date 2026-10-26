import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { applyEvent, drainLines, parseModelLine, reconcileTotals } from "@/lib/workout-stream";
import { newWorkoutId } from "@/lib/workout-id";
import { EMPTY_WORKOUT, type ClassConfig, type Workout, type WorkoutEvent } from "@/lib/types";

// Generation streams for 5-15 s; keep headroom so Vercel never cuts it off.
export const maxDuration = 60;

const MODEL = "claude-haiku-5-5";

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

  const { code, studentName, fitnessLevel, limitations, preferences, regenerateFeedback } = body;

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const supabase = createServerClient();

  // 2b. Rate limits. Every generation costs real money, and the x-internal-secret
  //     gate is only obscurity (it ships in the browser bundle), so this is the
  //     real cap on abuse. Per-IP stays generous: a whole school shares one NAT IP.
  const limited = await checkRateLimit(supabase, [
    { name: `gen:code:${code}`,            windowSeconds: WINDOW.hour,       limit: 150  },
    { name: `gen:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 100  },
    { name: "gen:global",                  windowSeconds: WINDOW.day,        limit: 1500 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  // 3. Fetch class config from Supabase (students can't tamper with these values)
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
  const name     = sanitizeStudentInput(studentName       || "");
  const notes    = sanitizeStudentInput(limitations       || "None reported");
  const prefs    = sanitizeStudentInput(preferences       || "");
  const feedback = sanitizeStudentInput(regenerateFeedback || "");

  // 5. Build system prompt from the teacher-controlled config.
  //    Output is one JSON object per line so the browser can render the warm-up
  //    while the main workout is still being written (see lib/workout-stream.ts).
  const systemPrompt = `You are a certified PE coach AI generating safe, age-appropriate, school-approved workouts for high school students.

CLASS PARAMETERS (set by the teacher — these are fixed and must be respected):
- Total workout duration: ${cfg.duration} minutes
- Minimum calories to burn: ${cfg.minCalories} kcal
- Available equipment: ${cfg.equipment || "Not specified"}
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
Respond with JSON Lines: exactly one compact JSON object per line, nothing else. No markdown, no backticks, no blank lines, no text before or after.
Emit the lines in this order:
1. One meta line:
{"type":"meta","title":"Short catchy workout name (3-5 words)","totalCalories":<integer>,"totalDuration":<integer minutes>}
2. 2-3 warm-up lines:
{"type":"warmup","name":"exercise name","duration":"e.g. 90 sec","description":"Brief instruction"}
3. 4-8 exercise lines (durations like "30 sec" are allowed in reps for timed moves):
{"type":"exercise","name":"exercise name","sets":<integer>,"reps":"e.g. 12 reps or 30 sec","rest":"e.g. 30 sec","calories":<integer estimated for this exercise>,"tip":"One-sentence form or safety tip","howTo":["Step 1","Step 2","Step 3"]}
4. 2-3 cool-down lines:
{"type":"cooldown","name":"stretch name","duration":"e.g. 1 min","description":"Brief instruction"}`;

  const userMessage = `Student name: ${name || "Anonymous"}
Fitness level: ${level}
Injuries or physical limitations: ${notes}
${prefs    ? `Personal preferences: ${prefs}`            : ""}
${feedback ? `Improvement requests for this regeneration: ${feedback}` : ""}

Please generate my workout.`;

  // 6. Stream from Claude, forwarding one normalized event per line (NDJSON),
  //    then save the finished workout and end with its share id. HTTP errors
  //    before this point are plain JSON; once streaming starts, failures arrive
  //    as an `error` event so the client can show them.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: WorkoutEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      let workout: Workout = EMPTY_WORKOUT;
      const handleLine = (line: string) => {
        const ev = parseModelLine(line);
        if (!ev) return;
        workout = applyEvent(workout, ev);
        send(ev);
      };

      try {
        // Client built lazily: the build never needs ANTHROPIC_API_KEY, and a
        // missing/invalid key degrades to the graceful error event below.
        const client = new Anthropic();
        const run = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          // Haiku 5.5 thinks by default; a workout list doesn't need it and the
          // student is standing on a gym floor waiting. Latency wins.
          thinking: { type: "disabled" },
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        let buffer = "";
        for await (const event of run) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            buffer = drainLines(buffer + event.delta.text, handleLine);
          }
        }
        if (buffer.trim()) handleLine(buffer);

        const final = await run.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ kind: "error", message: "The AI declined this request. Try rewording your notes and generate again." });
          return;
        }
        if (workout.exercises.length === 0) {
          console.error("Generation produced no exercises", { stop_reason: final.stop_reason });
          send({ kind: "error", message: "Failed to generate workout. Please try again." });
          return;
        }

        workout = reconcileTotals(workout);
        if (!workout.title) workout = { ...workout, title: "Your Workout" };

        const id = newWorkoutId();
        const { error: insertError } = await supabase
          .from("workouts")
          .insert({ id, class_code: code, student_name: name || null, workout });
        if (insertError) {
          // The student still has the workout on screen; only the share link is lost.
          console.error("workouts insert failed:", insertError);
          send({ kind: "error", message: "Workout ready, but it could not be saved for sharing." });
          return;
        }
        send({ kind: "done", id });
      } catch (err) {
        console.error("Anthropic/stream error:", err);
        send({ kind: "error", message: "Failed to generate workout. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
