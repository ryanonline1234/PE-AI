import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase";
import { verifySecret } from "@/lib/auth";
import { checkRateLimit, rateLimitedResponse, WINDOW } from "@/lib/rate-limit";
import { classParamsBlock, clampConfig } from "@/lib/class-config";
import { callerFromRequest, signInRequired } from "@/lib/teacher-auth";
import type { AskQuestion, ClassCheck } from "@/lib/types";

// The teacher's AI check: before a class is saved, the model reads the whole
// setup, says back what it will do, and asks about anything ambiguous. Nothing
// is written here; the page saves the confirmed summary + answers via save-class.
export const maxDuration = 30;

const MODEL = "claude-haiku-5-5";
const MAX_ROUNDS = 3;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
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
  required: ["summary", "questions"],
  additionalProperties: false,
} as const;

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { account } = await callerFromRequest(request);
  if (!account) return signInRequired();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.config || typeof body.config !== "object") {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }
  const cfg = clampConfig(body.config);
  const round = Math.min(Math.max(Number(body.round) || 1, 1), MAX_ROUNDS);
  const lastRound = round >= MAX_ROUNDS;
  const personal = body.personal === true;

  const supabase = createServerClient();
  const limited = await checkRateLimit(supabase, [
    { name: `clarify:user:${account.id}`, windowSeconds: WINDOW.tenMinutes, limit: 40 },
    { name: "clarify:global",                  windowSeconds: WINDOW.day,        limit: 600 },
  ]);
  if (limited) return rateLimitedResponse(limited);

  const who = personal ? "a high school student's own training setup (their personal class)" : "a PE teacher's class setup";
  const audience = personal ? "the student, starting \"Your workouts will\"" : "the teacher, starting \"Each student will get\"";
  const system = `You review ${who} for an AI that writes personalized workouts from it. Your job is to make sure that AI understands what they actually want.

Return JSON with:
- "summary": 2-4 short sentences addressed to ${audience}. Say concretely what the workouts will look like: length, intensity, focus, which equipment gets used, and how you will apply the custom instructions. State any assumption you are making.
- "questions": ${lastRound ? "an empty array. Do not ask anything this round; fold the answers so far into the summary." : `0-3 questions, ONLY where the setup is ambiguous, conflicting, or unrealistic in a way that would change the workouts. Good reasons to ask: equipment that could mean different things ("weights": dumbbells or machines?), instructions with two plausible readings, where students work out when the instructions depend on it, more content than fits the duration. Do not ask about anything already clear, anything answered under PREVIOUS ANSWERS, or nice-to-have detail. If the setup is clear, return an empty array. Each question is under 15 words and has 2-4 tap-able answer options, each under 6 words; the app adds its own free-text option.`}`;

  const previous = (cfg.clarifications ?? []).map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n");
  const user = `CLASS SETUP:
${classParamsBlock(cfg)}

PREVIOUS ANSWERS:
${previous || "none"}`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      // Feasibility checks (content vs minutes) benefit from a little reasoning;
      // the teacher waits once per change, not per student.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "The AI couldn't review these instructions. Try rewording them." }, { status: 422 });
    }
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text) as { summary?: unknown; questions?: unknown };

    const questions: AskQuestion[] = lastRound || !Array.isArray(parsed.questions)
      ? []
      : parsed.questions
          .filter((q): q is { question: string; options: unknown } => !!q && typeof (q as { question?: unknown }).question === "string")
          .map((q) => ({
            question: q.question.trim().slice(0, 160),
            options: (Array.isArray(q.options) ? q.options : [])
              .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
              .map((o) => o.trim().slice(0, 60))
              .slice(0, 4),
          }))
          .filter((q) => q.question)
          .slice(0, 3);

    const result: ClassCheck = {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 800) : "",
      questions,
    };
    if (!result.summary) throw new Error("empty summary");
    return NextResponse.json(result);
  } catch (err) {
    console.error("clarify-class error:", err);
    return NextResponse.json({ error: "The AI check failed. You can still save without it." }, { status: 500 });
  }
}
