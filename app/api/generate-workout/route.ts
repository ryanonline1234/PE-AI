import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { applyEvent, drainLines, parseModelLine, reconcileTotals } from "@/lib/workout-stream";
import { newWorkoutId, WORKOUT_ID_RE } from "@/lib/workout-id";
import { classParamsBlock, cleanAnswers, teacherNotesBlock } from "@/lib/class-config";
import { EMPTY_WORKOUT, type AskQuestion, type ClassConfig, type Workout, type WorkoutEvent } from "@/lib/types";

// Generation streams for 5-15 s; keep headroom so Vercel never cuts it off.
export const maxDuration = 60;

const MODEL = "claude-haiku-5-5";
const MAX_QUESTIONS = 2;

/** The previous workout, trimmed for the prompt (how-to steps add little). */
function compactWorkout(w: Workout) {
  return {
    title: w.title,
    warmup: w.warmup.map(({ name, duration }) => ({ name, duration })),
    exercises: w.exercises.map(({ name, sets, reps, rest }) => ({ name, sets, reps, rest })),
    cooldown: w.cooldown.map(({ name, duration }) => ({ name, duration })),
  };
}

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

  const { code, studentName, fitnessLevel, limitations, preferences, regenerateFeedback, previousId } = body;
  const sample = body.sample === true;
  const answers = cleanAnswers(body.answers);

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
  const answersText = answers
    .map((qa) => `- Q: ${sanitizeStudentInput(qa.question)}\n  A: ${sanitizeStudentInput(qa.answer)}`)
    .join("\n");

  // 4b. Regeneration: load the workout being changed (same class only), so the
  //     model edits it instead of starting over, and can say what it changed.
  let previous: Workout | null = null;
  if (typeof previousId === "string" && WORKOUT_ID_RE.test(previousId)) {
    const { data: prev } = await supabase
      .from("workouts")
      .select("workout")
      .eq("id", previousId)
      .eq("class_code", code)
      .maybeSingle();
    previous = (prev?.workout as Workout | undefined) ?? null;
  }
  const isRegen = Boolean(feedback || previous);
  // The model may ask before building only on a first, real generation.
  const allowQuestions = !sample && !isRegen && answers.length === 0 && body.skipQuestions !== true;

  // 5. Build system prompt from the teacher-controlled config.
  //    Output is one JSON object per line so the browser can render the warm-up
  //    while the main workout is still being written (see lib/workout-stream.ts).
  const teacherNotes = teacherNotesBlock(cfg);
  const askStep = allowQuestions
    ? `STEP 1 — ASK OR BUILD:
Ask 1-${MAX_QUESTIONS} quick questions BEFORE building when either is true:
- The student mentions pain, an injury, or a condition (for example "my knee hurts", "back pain", "asthma") but does not say which movements hurt or what to avoid. You need that to pick safe exercises.
- A preference conflicts with the teacher's setup and you would have to guess which one wins.
Otherwise build right away. Never ask when the injuries field is blank or already specific (for example "sprained left ankle, avoid jumping"), and never ask for nice-to-have detail.
If you ask, output ONLY 1-${MAX_QUESTIONS} question lines, then stop:
{"type":"question","question":"Short question to the student about ONE thing, under 15 words","options":["2-4 tap answers, each under 6 words"]}
If you build, go straight to the workout lines below.

`
    : "";
  const noteStep = isRegen
    ? `The student asked for changes${previous ? " to the previous workout shown in their message" : ""}. Keep what they did not ask to change.
The FIRST line must be a note to the student:
{"type":"note","text":"1-3 short sentences in second person saying what you changed and why"}
`
    : "";

  const systemPrompt = `You are a certified PE coach AI generating safe, age-appropriate, school-approved workouts for high school students.

CLASS PARAMETERS (set by the teacher — these are fixed and must be respected):
${classParamsBlock(cfg)}
${teacherNotes ? `\n${teacherNotes}\n` : ""}
RULES:
- All exercises must be safe and appropriate for a high school PE class
- Adapt difficulty to match the student's stated fitness level
- Modify or exclude exercises that conflict with the student's stated injuries or limitations
- Ensure the estimated total calories burned meets or exceeds ${cfg.minCalories} kcal
- Keep the total time at or under ${cfg.duration} minutes
- Be encouraging and motivating in tone

RESPONSE FORMAT:
Respond with JSON Lines: exactly one compact JSON object per line, nothing else. No markdown, no backticks, no blank lines, no text before or after.

${askStep}${noteStep}Workout lines, in this order:
1. One meta line:
{"type":"meta","title":"Short catchy workout name (3-5 words)","totalCalories":<integer>,"totalDuration":<integer minutes>}
2. 2-3 warm-up lines:
{"type":"warmup","name":"exercise name","duration":"e.g. 90 sec","description":"Brief instruction"}
3. 4-8 exercise lines (durations like "30 sec" are allowed in reps for timed moves):
{"type":"exercise","name":"exercise name","sets":<integer>,"reps":"e.g. 12 reps or 30 sec","rest":"e.g. 30 sec","calories":<integer estimated for this exercise>,"tip":"One-sentence form or safety tip","howTo":["Step 1","Step 2","Step 3"]}
4. 2-3 cool-down lines:
{"type":"cooldown","name":"stretch name","duration":"e.g. 1 min","description":"Brief instruction"}`;

  const userMessage = sample
    ? `This is the teacher previewing the class. Write the workout for a typical student: moderate fitness, no injuries, no preferences.`
    : `Student name: ${name || "Anonymous"}
Fitness level: ${level}
Injuries or physical limitations: ${notes}
${prefs    ? `Personal preferences: ${prefs}`            : ""}
${answersText ? `Answers to your questions:\n${answersText}` : ""}
${previous ? `Previous workout (JSON):\n${JSON.stringify(compactWorkout(previous))}` : ""}
${feedback ? `Requested changes: ${feedback}` : ""}

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
      const asked: AskQuestion[] = [];
      let stopForAnswers = false;

      const handleLine = (line: string) => {
        if (stopForAnswers) return;
        const ev = parseModelLine(line);
        if (!ev) return;
        if (ev.kind === "question") {
          // Questions count only before any workout line, only when allowed.
          const nothingYet = !workout.title && workout.warmup.length === 0 && workout.exercises.length === 0;
          if (allowQuestions && nothingYet && asked.length < MAX_QUESTIONS) {
            asked.push(ev.question);
            send(ev);
          }
          return;
        }
        if (asked.length > 0) {
          // The model asked, then kept going. Stop: the student answers first.
          stopForAnswers = true;
          return;
        }
        if (ev.kind === "note" && !isRegen) return;
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
            if (stopForAnswers || asked.length >= MAX_QUESTIONS) break;
          }
        }
        if (!stopForAnswers && asked.length < MAX_QUESTIONS && buffer.trim()) handleLine(buffer);

        // The model asked instead of building: end here, nothing to save.
        if (asked.length > 0) {
          run.abort();
          send({ kind: "needs_answers" });
          return;
        }

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

        // Teacher previews are never saved.
        if (sample) {
          send({ kind: "done", id: null });
          return;
        }

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
