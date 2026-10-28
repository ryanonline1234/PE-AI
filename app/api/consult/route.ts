import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { classParamsBlock, clampConfig, cleanAskQuestions, MAX_BRIEF } from "@/lib/class-config";
import { sanitizeStudentText } from "@/lib/sanitize";
import { cleanStudentBrief } from "@/lib/student-brief";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import type { ConsultResult, QA } from "@/lib/types";

// The sport consult (docs/03): the AI asks a few tap questions about what a
// session (teacher) or a student's training (student) is for, then writes a
// short brief every workout keeps in mind. Nothing is stored here: a teacher
// saves the brief with the session's settings, a student via /api/student-brief.
export const maxDuration = 30;

const MODEL = "claude-haiku-5-5";
const MAX_ROUNDS = 3;

const SCHEMA = {
  type: "object",
  properties: {
    brief: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["question", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["brief", "questions"],
  additionalProperties: false,
} as const;

const QUESTION_RULES = `Each question is under 15 words and has 2-4 tap-able answer options, each under 6 words; the app adds its own free-text option. Never ask what PREVIOUS ANSWERS already answer, and never ask for nice-to-have detail.`;

// "Ask only where needed" made the model never ask (the AI check learned the
// same lesson); the consult's point is to ask, so the triggers are concrete.
function systemFor(audience: "session" | "student", lastRound: boolean): string {
  const questions = (topics: string) => lastRound
    ? `"questions": an empty array. Do not ask anything this round; fold the answers so far into the brief.`
    : `"questions": 1-3 questions covering whichever of these the topic and PREVIOUS ANSWERS haven't settled: ${topics}. Ask nothing only when all of them are already clear. ${QUESTION_RULES}`;

  if (audience === "session") {
    return `You help a high school PE teacher plan one class session for an AI that writes each student a personalized workout. From what the teacher says the session is for, write the brief every workout that day will follow.

Return JSON with:
- "brief": 3-5 short lines, under 500 characters in total, written as instructions to the workout AI. Say what the session builds toward, which movements or qualities to emphasize, what to avoid or keep light, and how hard it should feel. Fit the class settings given (time, intensity, equipment). No names, no medical advice.
- ${questions("the sport or unit if it is unclear, where students are in the season or unit, the main goal, and anything to emphasize or avoid")}`;
  }
  return `You help a high school student describe their sport so an AI can build their PE workouts toward it, within whatever their PE teacher sets for the day.

Return JSON with:
- "brief": 2-4 short lines, under 400 characters in total, in the third person ("Plays ...", "Wants to build ..."). Say the sport and position or event, the season phase, and what to build (for example first-step speed, endurance, shoulder stability).
- ${questions("their position or event, the season phase (off-season, preseason, in season), and their main goal")}

Never ask about, or write in the brief, injuries, pain, medical conditions, medication, weight, or body measurements: the brief is saved, and those details are not. If the student mentions one, leave it out entirely and don't hint at it (no "return to play", no "coming back from"). Never include names.`;
}

function cleanQAList(list: unknown, max: number): QA[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      question: sanitizeStudentText(typeof x.question === "string" ? x.question : "", 200),
      answer: sanitizeStudentText(typeof x.answer === "string" ? x.answer : "", 200),
    }))
    .filter((x) => x.question && x.answer)
    .slice(-max);
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { account, withCookies } = await callerFromRequest(request);
  if (!account) return signInRequired();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const audience = body.for === "student" ? "student" : "session";
  if (audience === "session" && !isTeacherAccount(account)) {
    return NextResponse.json({ error: "Session planning is for teachers." }, { status: 403 });
  }
  const topic = sanitizeStudentText(typeof body.topic === "string" ? body.topic : "", 200);
  if (!topic) {
    return NextResponse.json({ error: audience === "session" ? "Say what the session is for first." : "Say what sport you play first." }, { status: 400 });
  }
  const answers = cleanQAList(body.answers, MAX_ROUNDS * 3);
  const round = Math.min(Math.max(Number(body.round) || 1, 1), MAX_ROUNDS);
  const lastRound = round >= MAX_ROUNDS;
  const cfg = audience === "session" && body.config && typeof body.config === "object"
    ? clampConfig(body.config as Record<string, unknown>)
    : null;

  const limited = await checkRateLimit(createServerClient(), [
    { name: `consult:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 30 },
    { name: "consult:global",             windowSeconds: WINDOW.day,        limit: 800 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const previous = answers.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n");
  const user = `${audience === "session" ? "WHAT THE SESSION IS FOR" : "THE STUDENT'S SPORT"}: ${topic}
${cfg ? `\nCLASS SETTINGS:\n${classParamsBlock(cfg)}\n` : ""}
PREVIOUS ANSWERS:
${previous || "none"}`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: systemFor(audience, lastRound),
      messages: [{ role: "user", content: user }],
    });
    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "The AI couldn't help with that. Try rewording it." }, { status: 422 });
    }
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text) as { brief?: unknown; questions?: unknown };
    const rawBrief = typeof parsed.brief === "string" ? parsed.brief : "";
    const result: ConsultResult = {
      // A student's brief is stored, so it goes through the same cleaning as a save.
      brief: audience === "student" ? cleanStudentBrief(rawBrief) : rawBrief.trim().slice(0, MAX_BRIEF),
      questions: lastRound ? [] : cleanAskQuestions(parsed.questions, 3),
    };
    if (!result.brief) throw new Error("empty brief");
    return withCookies(NextResponse.json(result));
  } catch (err) {
    console.error("consult error:", err);
    return NextResponse.json({ error: "The AI couldn't write a brief just now. Try again." }, { status: 500 });
  }
}
