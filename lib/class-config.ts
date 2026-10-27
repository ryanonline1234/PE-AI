// Class config helpers shared by save-class, clarify-class and generate-workout.
import type { ClassConfig, QA } from "@/lib/types";

export const MAX_CLARIFICATIONS = 6;

/** New-class defaults. Plain module (not "use client") so server pages can spread it. */
export const DEFAULT_CONFIG: ClassConfig = {
  duration: 30,
  minCalories: 150,
  equipment: "",
  intensity: "moderate",
  focus: "mixed",
  customPrompt: "",
  summary: "",
  clarifications: [],
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

/** Only known keys, clamped. Teachers can't inject arbitrary data or widen limits. */
export function clampConfig(config: Record<string, unknown>): ClassConfig {
  return {
    duration:     Math.min(Math.max(Number(config.duration)    || 30,  10), 120),
    minCalories:  Math.min(Math.max(Number(config.minCalories) || 150, 50), 800),
    intensity:    ["low", "moderate", "high"].includes(config.intensity as string) ? (config.intensity as ClassConfig["intensity"]) : "moderate",
    focus:        ["mixed", "cardio", "strength", "flexibility"].includes(config.focus as string) ? (config.focus as ClassConfig["focus"]) : "mixed",
    equipment:    typeof config.equipment === "string" ? config.equipment.slice(0, 500) : "",
    customPrompt: typeof config.customPrompt === "string" ? config.customPrompt.slice(0, 500) : "",
    summary:      typeof config.summary === "string" ? config.summary.trim().slice(0, 800) : "",
    clarifications: cleanQA(config.clarifications, MAX_CLARIFICATIONS),
  };
}

/** Clean a list of student answers (fewer, shorter). */
export function cleanAnswers(list: unknown): QA[] {
  return cleanQA(list, 3).map((x) => ({ question: x.question, answer: x.answer.slice(0, 150) }));
}

/**
 * The fields the AI check reads. When these change, the teacher's confirmed
 * summary is stale and Save runs the check again.
 */
export function configSignature(c: ClassConfig): string {
  return JSON.stringify([c.duration, c.minCalories, c.intensity, c.focus, c.equipment.trim(), c.customPrompt.trim()]);
}

/** Prompt lines carrying the teacher's confirmed summary and answers. */
export function teacherNotesBlock(c: ClassConfig): string {
  const lines: string[] = [];
  if (c.summary) lines.push(`TEACHER-CONFIRMED SUMMARY OF THIS CLASS:\n${c.summary}`);
  if (c.clarifications && c.clarifications.length > 0) {
    lines.push(
      "TEACHER'S ANSWERS TO CLARIFYING QUESTIONS (follow these):\n" +
        c.clarifications.map((qa) => `- Q: ${qa.question}\n  A: ${qa.answer}`).join("\n")
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
- Minimum calories to burn: ${c.minCalories} kcal
- Available equipment: ${c.equipment || "Not specified"}
- Intensity level: ${c.intensity}
- Workout focus: ${FOCUS_LABELS[c.focus] ?? c.focus}
${c.customPrompt ? `- Additional teacher instructions: ${c.customPrompt}` : "- Additional teacher instructions: none"}`;
}
