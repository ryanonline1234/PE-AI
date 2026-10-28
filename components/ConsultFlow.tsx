"use client";

// The sport consult (docs/03), shared by the teacher's Plan with AI card and
// the student's My Sport card: say what it's for, answer the AI's tap
// questions (up to three rounds), get a draft brief, then use it. Nothing is
// saved here; the parent decides what happens to the brief.
import { useState } from "react";
import { apiConsult } from "@/lib/api";
import type { ClassConfig, ConsultResult, QA } from "@/lib/types";
import { QuestionList, collectAnswers, NO_ANSWERS, type Answers } from "@/components/QuestionList";
import { Alert, BtnPrimary, BtnSecondary, TextInput } from "@/components/ui";

const MAX_ROUNDS = 3;

export function ConsultFlow({ audience, config, onUse, onCancel }: {
  /** "session": a teacher planning a session; "student": a student's own sport. */
  audience: "session" | "student";
  /** The settings being edited, so the brief fits the time and equipment. */
  config?: ClassConfig;
  onUse: (brief: string) => void;
  onCancel: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [round, setRound] = useState(0); // 0 = not asked yet
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [answered, setAnswered] = useState<QA[]>([]);
  const [current, setCurrent] = useState<Answers>(NO_ANSWERS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(nextRound: number, answers: QA[]) {
    setBusy(true); setError("");
    try {
      const r = await apiConsult({ for: audience, topic, answers, round: nextRound, config });
      setResult(r); setRound(nextRound); setAnswered(answers); setCurrent(NO_ANSWERS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const newAnswers = result ? collectAnswers(result.questions, current) : [];

  return (
    <div className="bg-surface2 border border-accent2 rounded-xl p-4 mb-4">
      <div className="text-[11px] font-semibold tracking-[2px] uppercase text-accent2 mb-2">
        Sport consult{round > 1 ? ` · round ${round}` : ""}
      </div>

      {!result && (
        <>
          <div className="text-[14px] text-muted mb-3">
            {audience === "session"
              ? "Say what this session is for. The AI asks a couple of quick questions, then writes the brief."
              : "Say what sport you play. The AI asks a couple of quick questions, then writes your brief."}
          </div>
          <TextInput
            value={topic}
            onChange={(v) => setTopic(v.slice(0, 200))}
            placeholder={audience === "session" ? "e.g. Volleyball unit, week 2: jumping and shoulders" : "e.g. JV soccer, midfielder"}
            className="bg-surface mb-3"
          />
          <BtnPrimary onClick={() => ask(1, [])} disabled={busy || !topic.trim()}>
            {busy ? "Thinking…" : "Ask the AI"}
          </BtnPrimary>
          <CancelLink onClick={onCancel} />
        </>
      )}

      {result && (
        <>
          <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-1.5">Draft brief</div>
          <div className="text-[15px] leading-[1.55] whitespace-pre-wrap mb-4">{result.brief}</div>
          {result.questions.length > 0 && round < MAX_ROUNDS && (
            <div className="mb-4">
              <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-3">To sharpen it</div>
              <QuestionList questions={result.questions} answers={current} onChange={setCurrent} accent="accent2" />
            </div>
          )}
          <BtnPrimary onClick={() => onUse(result.brief)} disabled={busy}>Use this brief</BtnPrimary>
          {result.questions.length > 0 && round < MAX_ROUNDS && (
            <BtnSecondary style={{ marginTop: 10 }} onClick={() => ask(round + 1, [...answered, ...newAnswers])} disabled={busy || newAnswers.length === 0}>
              {busy ? "Thinking…" : "Send answers for a sharper brief"}
            </BtnSecondary>
          )}
          <CancelLink onClick={onCancel} />
        </>
      )}
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}

function CancelLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block mx-auto mt-3 bg-transparent border-0 text-muted text-[13px] cursor-pointer font-body">
      Cancel
    </button>
  );
}
