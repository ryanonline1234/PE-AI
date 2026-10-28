import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { classParamsBlock, clampConfig, cleanAskQuestions, MAX_BACKGROUND, MAX_SPECIFICS } from "@/lib/class-config";
import { sanitizeStudentText } from "@/lib/sanitize";
import { cleanStudentBrief } from "@/lib/student-brief";
import { isTeacherAccount } from "@/lib/supabase-auth";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import type { ConsultResult, QA } from "@/lib/types";

// The consult (docs/03): the AI asks a few tap questions, then writes short text
// every workout keeps in mind. Three audiences: a class's general background
// (teacher), one session's specifics (teacher, asked after the background), and
// a student's own sport. Nothing is stored here: the background saves through
// /api/save-class, specifics through /api/class-sessions, a student's text
// through /api/student-brief.
export const maxDuration = 30;

const MODEL = "claude-haiku-5-5";
const MAX_ROUNDS = 3;

const SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
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
  required: ["text", "questions"],
  additionalProperties: false,
} as const;

const QUESTION_RULES = `Each question is under 15 words and has 2-4 tap-able answer options, each under 6 words; the app adds its own free-text option. Never ask what PREVIOUS ANSWERS already answer, and never ask for nice-to-have detail.`;

type Audience = "background" | "session" | "student";

// "Ask only where needed" made the model never ask (the AI check learned the
// same lesson); the consult's point is to ask, so the triggers are concrete.
function systemFor(audience: Audience, lastRound: boolean): string {
  const questions = (topics: string) => lastRound
    ? `"questions": an empty array. Do not ask anything this round; fold the answers so far into the text.`
    : `"questions": 1-3 questions covering whichever of these the input and PREVIOUS ANSWERS haven't settled: ${topics}. Ask nothing only when all of them are already clear. ${QUESTION_RULES}`;

  if (audience === "background") {
    return `You help a high school PE teacher tell an AI what it should know about one class in general, before any single session is planned. The AI writes each student a personalized workout and keeps this background in mind every day.

Return JSON with:
- "text": 3-5 short lines, under 500 characters in total, written as standing guidance to the workout AI: who the students are (grade, experience), the current unit or season, the space, and any standing rules. Nothing about one specific day. No names, no medical advice.
- ${questions("the students' grade and experience level, the current unit or season, and the space or any standing rules")}`;
  }
  if (audience === "session") {
    return `You help a high school PE teacher plan one session of a class. The class background and settings are below; ask only about this one day, then write the session specifics the workout AI follows that day on top of the background.

Return JSON with:
- "text": 2-4 short lines, under 400 characters in total, written as instructions to the workout AI: the day's focus within the unit, what to emphasize, what to avoid or keep light today, and how hard it should feel. Don't repeat the background. No names, no medical advice.
- ${questions("the day's focus within the unit, anything to avoid or keep light today, and how hard it should feel")}`;
  }
  return `You help a high school student describe their sport so an AI can build their PE workouts toward it, within whatever their PE teacher sets for the day.

Return JSON with:
- "text": 2-4 short lines, under 400 characters in total, in the third person ("Plays ...", "Wants to build ..."). Say the sport and position or event, the season phase, and what to build (for example first-step speed, endurance, shoulder stability).
- ${questions("their position or event, the season phase (off-season, preseason, in season), and their main goal")}

Never ask about, or write in the text, injuries, pain, medical conditions, medication, weight, or body measurements: the text is saved, and those details are not. If the student mentions one, leave it out entirely and don't hint at it (no "return to play", no "coming back from"). Never include names.`;
}

const LEAD: Record<Audience, string> = {
  background: "WHAT THE TEACHER SAYS ABOUT THE CLASS",
  session: "ANYTHING THE TEACHER SAID ABOUT THIS SESSION",
  student: "THE STUDENT'S SPORT",
};

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
  const audience: Audience = body.for === "student" ? "student" : body.for === "background" ? "background" : "session";
  if (audience !== "student" && !isTeacherAccount(account)) {
    return NextResponse.json({ error: "Class planning is for teachers." }, { status: 403 });
  }
  // Session specifics can start with nothing typed: the AI asks about the day.
  const topic = sanitizeStudentText(typeof body.topic === "string" ? body.topic : "", 200);
  if (!topic && audience !== "session") {
    return NextResponse.json({ error: audience === "background" ? "Say a little about the class first." : "Say what sport you play first." }, { status: 400 });
  }
  const answers = cleanQAList(body.answers, MAX_ROUNDS * 3);
  const round = Math.min(Math.max(Number(body.round) || 1, 1), MAX_ROUNDS);
  const lastRound = round >= MAX_ROUNDS;
  const cfg = audience !== "student" && body.config && typeof body.config === "object"
    ? clampConfig(body.config as Record<string, unknown>)
    : null;

  const limited = await checkRateLimit(createServerClient(), [
    { name: `consult:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 30 },
    { name: "consult:global",             windowSeconds: WINDOW.day,        limit: 800 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const previous = answers.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n");
  const user = `${LEAD[audience]}: ${topic || "nothing yet"}
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
    const parsed = JSON.parse(text) as { text?: unknown; questions?: unknown };
    const raw = typeof parsed.text === "string" ? parsed.text : "";
    const result: ConsultResult = {
      // A student's text is stored, so it goes through the same cleaning as a save.
      text: audience === "student" ? cleanStudentBrief(raw)
        : raw.trim().slice(0, audience === "background" ? MAX_BACKGROUND : MAX_SPECIFICS),
      questions: lastRound ? [] : cleanAskQuestions(parsed.questions, 3),
    };
    if (!result.text) throw new Error("empty text");
    return withCookies(NextResponse.json(result));
  } catch (err) {
    console.error("consult error:", err);
    return NextResponse.json({ error: "The AI couldn't write that just now. Try again." }, { status: 500 });
  }
}
