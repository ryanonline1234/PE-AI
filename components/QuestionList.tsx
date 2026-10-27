"use client";

// Questions from the AI with tap-to-answer chips plus a free-text "other".
// Used by the teacher's AI check and the student's pre-workout questions.
import type { AskQuestion, QA } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Answers {
  picks: Record<number, string>;
  other: Record<number, string>;
}

export const NO_ANSWERS: Answers = { picks: {}, other: {} };

/** Typed text wins over a tapped chip. Unanswered questions are dropped. */
export function collectAnswers(questions: AskQuestion[], a: Answers): QA[] {
  return questions
    .map((q, i) => ({ question: q.question, answer: (a.other[i]?.trim() || a.picks[i] || "").slice(0, 200) }))
    .filter((qa) => qa.answer);
}

export function QuestionList({ questions, answers, onChange, accent = "accent" }: {
  questions: AskQuestion[];
  answers: Answers;
  onChange: (next: Answers) => void;
  accent?: "accent" | "accent2";
}) {
  const on = accent === "accent"
    ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent"
    : "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2";
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q, i) => (
        <div key={i}>
          <div className="text-[15px] font-semibold leading-[1.4] mb-2.5">{q.question}</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {q.options.map((opt) => {
              const active = answers.picks[i] === opt && !answers.other[i]?.trim();
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange({
                    picks: { ...answers.picks, [i]: active ? "" : opt },
                    other: { ...answers.other, [i]: "" },
                  })}
                  className={cn(
                    "rounded-lg border px-3.5 py-2.5 font-body text-[14px] font-medium cursor-pointer text-left transition-all duration-150",
                    active ? on : "border-border bg-surface2 text-text"
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={answers.other[i] ?? ""}
            onChange={(e) => onChange({ ...answers, other: { ...answers.other, [i]: e.target.value.slice(0, 150) } })}
            placeholder="Or type your own answer"
            className="w-full bg-surface2 border border-border rounded-lg text-text font-body text-[14px] px-3.5 py-2.5 outline-none"
          />
        </div>
      ))}
    </div>
  );
}
