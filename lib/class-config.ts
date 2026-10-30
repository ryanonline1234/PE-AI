// Class config helpers shared by save-class, clarify-class and generate-workout.
import { isTrustedUrl } from "@/lib/trusted-sources";
import type { AskQuestion, ClassConfig, PinnedSource, QA } from "@/lib/types";

export const MAX_CLARIFICATIONS = 6;
export const MAX_BACKGROUND = 600;
export const MAX_SPECIFICS = 600;
export const MAX_SOURCES = 5;

/** New-class defaults. Plain module (not "use client") so server pages can spread it. */
export const DEFAULT_CONFIG: ClassConfig = {
  duration: 30,
  equipment: "",
  intensity: "moderate",
  focus: "mixed",
  customPrompt: "",
  summary: "",
  clarifications: [],
  background: "",
  sources: [],
  specifics: "",
};

function cleanQA(list: unknown, max: number): QA[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      question: typeof x.question === "string" ? x.question.trim().slice(0, 200) : "",
      answer: typeof x.answer === "string" ? x.answer.trim().slice(0, 200) : "",
    }))
    .filter((x) => x.question && x.answer)
    .slice(-max);
}

// Calorie targets are gone (DECISIONS 2026-10-28), but summaries and answers
// confirmed before then still state one, and the model anchors on it
// (measured: about 200 kcal without it, 260-320 with "at least 400"). Their
// sentences go; the duration, focus and equipment they repeat are in the
// parameters anyway, and a teacher's own words stay in the custom instructions.
const MENTIONS_CALORIES = /calor|kcal/i;

export function withoutCalorieTargets(c: ClassConfig): ClassConfig {
  return {
    ...c,
    summary: (c.summary ?? "").split(/(?<=[.!?])\s+/).filter((x) => !MENTIONS_CALORIES.test(x)).join(" ").trim(),
    clarifications: (c.clarifications ?? []).filter((qa) => !MENTIONS_CALORIES.test(qa.question) && !MENTIONS_CALORIES.test(qa.answer)),
  };
}

/** Pinned research: trusted https links only, short text, no repeated finding. */
function cleanSources(list: unknown): PinnedSource[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: PinnedSource[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const { title, url, takeaway } = x as Record<string, unknown>;
    if (!isTrustedUrl(url) || typeof takeaway !== "string" || !takeaway.trim()) continue;
    const key = `${url} ${takeaway.trim()}`; // one article can back two takeaways
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: typeof title === "string" && title.trim() ? title.trim().slice(0, 160) : new URL(url).hostname,
      url,
      takeaway: takeaway.trim().slice(0, 240),
    });
  }
  return out.slice(0, MAX_SOURCES);
}

/** Only known keys, clamped. Teachers can't inject arbitrary data or widen limits. */
export function clampConfig(config: Record<string, unknown>): ClassConfig {
  return withoutCalorieTargets({
    duration:     Math.min(Math.max(Number(config.duration)    || 30,  10), 120),
    intensity:    ["low", "moderate", "high"].includes(config.intensity as string) ? (config.intensity as ClassConfig["intensity"]) : "moderate",
    focus:        ["mixed", "cardio", "strength", "flexibility"].includes(config.focus as string) ? (config.focus as ClassConfig["focus"]) : "mixed",
    equipment:    typeof config.equipment === "string" ? config.equipment.slice(0, 500) : "",
    customPrompt: typeof config.customPrompt === "string" ? config.customPrompt.slice(0, 500) : "",
    summary:      typeof config.summary === "string" ? config.summary.trim().slice(0, 800) : "",
    clarifications: cleanQA(config.clarifications, MAX_CLARIFICATIONS),
    background:   typeof config.background === "string" ? config.background.trim().slice(0, MAX_BACKGROUND) : "",
    sources:      cleanSources(config.sources),
    specifics:    typeof config.specifics === "string" ? config.specifics.trim().slice(0, MAX_SPECIFICS) : "",
  });
}

/** A session's name ("Volleyball conditioning"); empty when unnamed. */
export const cleanSessionName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "");

/** Tap questions from a structured AI reply: short text, 2-4 options, at most `max`. */
export function cleanAskQuestions(list: unknown, max: number): AskQuestion[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((q): q is { question: string; options: unknown } => !!q && typeof (q as { question?: unknown }).question === "string")
    .map((q) => ({
      question: q.question.trim().slice(0, 160),
      options: (Array.isArray(q.options) ? q.options : [])
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        .map((o) => o.trim().slice(0, 60))
        .slice(0, 4),
    }))
    .filter((q) => q.question)
    .slice(0, max);
}

/** Clean a list of student answers (fewer, shorter). */
export function cleanAnswers(list: unknown): QA[] {
  return cleanQA(list, 3).map((x) => ({ question: x.question, answer: x.answer.slice(0, 150) }));
}

/**
 * The settings the AI check confirms. When these change, the teacher's
 * confirmed summary is stale and Save runs the check again. The background,
 * research and session specifics are saved on their own and don't re-run it.
 */
export function configSignature(c: ClassConfig): string {
  return JSON.stringify([c.duration, c.intensity, c.focus, c.equipment.trim(), c.customPrompt.trim()]);
}

/**
 * The settings a workout is built from: a session's settings and specifics (or
 * the class defaults), plus the class's current background and research, which
 * every session shares (docs/03 §7).
 */
export function generationConfig(classConfig: ClassConfig, sessionConfig?: ClassConfig | null): ClassConfig {
  const base = sessionConfig ?? classConfig;
  return {
    ...base,
    background: classConfig.background ?? "",
    sources: classConfig.sources ?? [],
    specifics: sessionConfig?.specifics ?? "",
  };
}

/** Prompt lines carrying the teacher's confirmed summary and answers. */
export function teacherNotesBlock(config: ClassConfig): string {
  const { summary, clarifications } = withoutCalorieTargets(config);
  const lines: string[] = [];
  if (summary) lines.push(`TEACHER-CONFIRMED SUMMARY OF THIS CLASS:\n${summary}`);
  if (clarifications && clarifications.length > 0) {
    lines.push(
      "TEACHER'S ANSWERS TO CLARIFYING QUESTIONS (follow these):\n" +
        clarifications.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n")
    );
  }
  return lines.join("\n\n");
}

export const FOCUS_LABELS: Record<string, string> = {
  mixed:       "Mixed — balanced cardio, strength, and flexibility",
  cardio:      "Cardiovascular endurance",
  strength:    "Muscular strength and endurance",
  flexibility: "Flexibility and mobility / stretching",
};

/** The teacher-controlled parameter block, shared by generation and the check. */
export function classParamsBlock(c: ClassConfig): string {
  return `- Total workout duration: ${c.duration} minutes
- Available equipment: ${c.equipment || "Not specified"}
- Intensity level: ${c.intensity}
- Workout focus: ${FOCUS_LABELS[c.focus] ?? c.focus}
${c.customPrompt ? `- Additional teacher instructions: ${c.customPrompt}` : "- Additional teacher instructions: none"}${planningLines(c)}`;
}

/** The background, session specifics and pinned research (docs/03), as extra parameter lines. */
function planningLines(c: ClassConfig): string {
  const lines: string[] = [];
  const indent = (t: string) => t.replace(/\n+/g, "\n  ");
  const background = (c.background ?? "").trim();
  if (background) lines.push(`- What the teacher wants you to know about this class (keep it in mind for every workout):\n  ${indent(background)}`);
  const specifics = (c.specifics ?? "").trim();
  if (specifics) lines.push(`- This session's specifics (build today's workout around them):\n  ${indent(specifics)}`);
  const sources = c.sources ?? [];
  if (sources.length > 0) {
    lines.push(
      "- Research the teacher pinned (apply where it fits this class):\n" +
        sources.map((x) => `  - ${x.takeaway} (${x.title})`).join("\n")
    );
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}
