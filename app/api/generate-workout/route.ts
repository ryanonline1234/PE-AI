import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { applyEvent, drainLines, parseModelLine, reconcileTotals } from "@/lib/workout-stream";
import { newWorkoutId, WORKOUT_ID_RE } from "@/lib/workout-id";
import { clampConfig, cleanAnswers } from "@/lib/class-config";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import { canUseClass, ensureMember, getClassByCode, getSessionByDate, getSessionById, getStudentBrief } from "@/lib/class-access";
import { sanitizeStudentText } from "@/lib/sanitize";
import { isDateKey, schoolDate } from "@/lib/time";
import { MAX_QUESTIONS, workoutSystemPrompt } from "@/lib/workout-prompt";
import { EMPTY_WORKOUT, type AskQuestion, type ClassConfig, type ClassSession, type Workout, type WorkoutEvent } from "@/lib/types";

// Generation streams for 5-15 s; keep headroom so Vercel never cuts it off.
export const maxDuration = 60;

const MODEL = "claude-haiku-5-5";

/** The previous workout, trimmed for the prompt (how-to steps add little). */
function compactWorkout(w: Workout) {
  return {
    title: w.title,
    warmup: w.warmup.map(({ name, duration }) => ({ name, duration })),
    exercises: w.exercises.map(({ name, sets, reps, rest }) => ({ name, sets, reps, rest })),
    cooldown: w.cooldown.map(({ name, duration }) => ({ name, duration })),
  };
}

// Basic prompt-injection guard for student input (lib/sanitize.ts).
const sanitizeStudentInput = (str: string = "") => sanitizeStudentText(str, 300);

export async function POST(request: NextRequest) {
  // 1. Auth check
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Everyone signs in (DECISIONS 2026-10-27); the workout belongs to the account.
  const { account } = await callerFromRequest(request);
  if (!account) return signInRequired();

  // 2. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, fitnessLevel, limitations, preferences, regenerateFeedback, previousId } = body;
  const sample = body.sample === true;
  const answers = cleanAnswers(body.answers);

  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const supabase = createServerClient();

  // 2b. Rate limits. Every generation costs real money. Per account is the
  //     tight one now that everyone signs in; per-IP stays generous because a
  //     whole school shares one NAT IP.
  const limited = await checkRateLimit(supabase, [
    { name: `gen:user:${account.id}`,      windowSeconds: WINDOW.hour,       limit: 40   },
    { name: `gen:code:${code}`,            windowSeconds: WINDOW.hour,       limit: 150  },
    { name: `gen:ip:${clientIp(request)}`, windowSeconds: WINDOW.tenMinutes, limit: 100  },
    { name: "gen:global",                  windowSeconds: WINDOW.day,        limit: 1500 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  // 3. Fetch class config (students can't tamper with these values). Personal
  //    classes are only usable by their owner; samples only by the owner.
  const cls = await getClassByCode(code);
  if (!cls || !canUseClass(cls, account.id)) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }
  if (sample && cls.owner_id !== account.id) {
    return NextResponse.json({ error: "Only the class owner can preview samples." }, { status: 403 });
  }
  await ensureMember(cls, account.id);

  // 4. Validate student-supplied fields
  const validLevels = ["beginner", "moderate", "advanced"];
  const level = validLevels.includes(fitnessLevel) ? fitnessLevel : "moderate";
  const name     = account.name.slice(0, 60);
  const notes    = sanitizeStudentInput(limitations       || "None reported");
  const prefs    = sanitizeStudentInput(preferences       || "");
  const feedback = sanitizeStudentInput(regenerateFeedback || "");
  const answersText = answers
    .map((qa) => `- Q: ${sanitizeStudentInput(qa.question)}\n  A: ${sanitizeStudentInput(qa.answer)}`)
    .join("\n");

  // The student's own sport brief (docs/03): fetched alongside the lookups
  // below, ignored for the owner's sample previews.
  const studentBriefPromise = sample ? Promise.resolve("") : getStudentBrief(account.id);

  // 4b. Regeneration: load the workout being changed (same class only), so the
  //     model edits it instead of starting over, and can say what it changed.
  let previous: Workout | null = null;
  let previousSessionId: string | null | undefined; // undefined = no previous workout
  if (typeof previousId === "string" && WORKOUT_ID_RE.test(previousId)) {
    const { data: prev } = await supabase
      .from("workouts")
      .select("workout, session_id")
      .eq("id", previousId)
      .eq("class_code", code)
      .maybeSingle();
    if (prev) {
      previous = prev.workout as Workout;
      previousSessionId = (prev.session_id as string | null) ?? null;
    }
  }

  // 4c. Which settings this workout uses (docs/02-sessions.md): a regeneration
  //     keeps its workout's session, the owner's sample from a session page
  //     uses that session, otherwise today's session (school date), else the
  //     class defaults. Personal classes have no sessions.
  let session: ClassSession | null = null;
  if (cls.kind === "class") {
    if (previousSessionId !== undefined) {
      session = previousSessionId ? await getSessionById(cls.id, previousSessionId) : null;
    } else if (sample && isDateKey(body.sessionDate)) {
      session = await getSessionByDate(cls.id, body.sessionDate);
      if (!session) return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
    } else {
      session = await getSessionByDate(cls.id, schoolDate());
    }
  }
  let cfg = (session?.config ?? cls.config) as ClassConfig;
  // The owner of a personal class may pick settings on the spot (a teacher's
  // own workout, /teacher/workout). Only the five settings come along; they're
  // saved so the form opens with them next time.
  if (cls.kind === "personal" && cls.owner_id === account.id && body.config && typeof body.config === "object") {
    const { duration, equipment, intensity, focus, customPrompt } = body.config as Record<string, unknown>;
    cfg = clampConfig({ duration, equipment, intensity, focus, customPrompt });
    const { error: saveError } = await supabase
      .from("pe_classes")
      .update({ config: cfg, updated_at: new Date().toISOString() })
      .eq("id", cls.id);
    if (saveError) console.error("inline settings save failed:", saveError);
  }
  const studentBrief = sanitizeStudentText(await studentBriefPromise, 600);
  const isRegen = Boolean(feedback || previous);
  // The model may ask before building only on a first, real generation.
  const allowQuestions = !sample && !isRegen && answers.length === 0 && body.skipQuestions !== true;

  // 5. Build system prompt from the teacher-controlled settings.
  const systemPrompt = workoutSystemPrompt(cfg, { allowQuestions, isRegen, hasPrevious: Boolean(previous) });

  const userMessage = sample
    ? `This is the teacher previewing the class. Write the workout for a typical student: moderate fitness, no injuries, no preferences.`
    : `Student: a high school student (name withheld)
Fitness level: ${level}
Injuries or physical limitations: ${notes}
${prefs    ? `Personal preferences: ${prefs}`            : ""}
${studentBrief ? `My own sport goals (saved from my sport consult): ${studentBrief}` : ""}
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

        // Every workout belongs to the account that generated it. An owner's
        // sample previews carry no student name.
        const id = newWorkoutId();
        const { error: insertError } = await supabase
          .from("workouts")
          .insert({ id, class_code: code, student_name: sample ? null : name, workout, created_by: account.id, session_id: session?.id ?? null });
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
