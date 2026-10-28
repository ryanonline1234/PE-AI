"use client";

// The student side of a class: the "how do you feel today" form, the AI's
// quick questions, then the streaming workout. Rendered by /c/[code] after the
// server has checked the signed-in account may use the class.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGenerateWorkoutStream } from "@/lib/api";
import { applyEvent } from "@/lib/workout-stream";
import { EMPTY_WORKOUT, type AskQuestion, type ClassConfig, type FitnessLevel, type QA, type Workout } from "@/lib/types";
import { QuestionList, collectAnswers, NO_ANSWERS, type Answers } from "@/components/QuestionList";
import { Alert, BtnPrimary, BtnSecondary, Card, Chip, Field, Layout, Textarea } from "@/components/ui";
import { WorkoutScreen } from "@/components/WorkoutScreen";

type View = "form" | "questions" | "workout";

export function StudentFlow({ code, label, sessionName, config, firstName, backHref }: {
  code: string;
  label: string;
  /** Today's session, when the teacher named it. */
  sessionName?: string | null;
  /** Today's settings: the session's, or the class defaults. Display only; the server re-resolves. */
  config: ClassConfig;
  firstName: string;
  backHref: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("form");
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>("moderate");
  const [limitations, setLimitations] = useState("");
  const [preferences, setPreferences] = useState("");
  const [regenerateHistory, setRegenerateHistory] = useState<string[]>([]);

  // Streaming generation: the workout fills in event by event; `shareId`
  // arrives last, once the server has saved it. `generation` remounts the
  // workout screen (and its review form) per generation.
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Questions the AI asked before building, and the answers, which carry over
  // to regenerations of the same workout.
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Answers>(NO_ANSWERS);
  const [studentAnswers, setStudentAnswers] = useState<QA[]>([]);
  const [error, setError] = useState("");

  function leave() {
    abortRef.current?.abort();
    router.push(backHref);
  }

  async function generateWorkout(feedback = "", opts: { answers?: QA[]; skipQuestions?: boolean } = {}) {
    // Accumulate regenerate feedback so context from earlier regenerations isn't
    // lost; a fresh generation (feedback === "") starts a new history.
    const history = feedback ? [...regenerateHistory, feedback] : [];
    setRegenerateHistory(history);
    // On a regenerate the server loads this workout so the AI edits it and can
    // say what it changed.
    const previousId = feedback ? shareId : null;
    const answers = opts.answers ?? (feedback ? studentAnswers : []);
    setStudentAnswers(answers);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError("");
    setWorkout(EMPTY_WORKOUT);
    setShareId(null);
    setStreaming(true);
    setGeneration((g) => g + 1);
    setView("workout");

    let latest: Workout = EMPTY_WORKOUT;
    let failed = "";
    const asked: AskQuestion[] = [];
    let needsAnswers = false;
    try {
      await apiGenerateWorkoutStream(
        {
          code,
          fitnessLevel, limitations, preferences,
          regenerateFeedback: history.join("\n"),
          answers,
          skipQuestions: opts.skipQuestions,
          previousId,
        },
        (ev) => {
          if (ev.kind === "done") {
            if (ev.id) {
              setShareId(ev.id);
              // Make refresh and the back button land on the saved workout.
              window.history.replaceState(null, "", `/w/${ev.id}`);
            }
          } else if (ev.kind === "question") {
            asked.push(ev.question);
          } else if (ev.kind === "needs_answers") {
            needsAnswers = true;
          } else if (ev.kind === "error") {
            failed = ev.message;
          } else {
            latest = applyEvent(latest, ev);
            setWorkout(latest);
          }
        },
        controller.signal
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      failed = e instanceof Error ? e.message : String(e);
    }
    if (controller.signal.aborted) return;
    setStreaming(false);
    if (needsAnswers && asked.length > 0) {
      setWorkout(null);
      setQuestions(asked);
      setQuestionAnswers(NO_ANSWERS);
      setView("questions");
      return;
    }
    if (failed) {
      if (latest.exercises.length === 0) {
        setWorkout(null);
        setView("form");
      }
      setError(failed);
    }
  }

  if (view === "questions") return (
    <Layout onBack={() => setView("form")}>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">Quick Question</div>
      <div className="text-muted text-[15px] mb-8">So your workout is safe for you. Tap an answer or type your own.</div>
      <Card>
        <QuestionList questions={questions} answers={questionAnswers} onChange={setQuestionAnswers} />
      </Card>
      <div className="flex gap-2.5">
        <BtnSecondary style={{ flex: 1 }} onClick={() => generateWorkout("", { skipQuestions: true })}>Skip</BtnSecondary>
        <BtnPrimary
          style={{ flex: 2 }}
          onClick={() => generateWorkout("", { answers: collectAnswers(questions, questionAnswers) })}
          disabled={collectAnswers(questions, questionAnswers).length === 0}
        >
          ⚡ Build My Workout
        </BtnPrimary>
      </div>
    </Layout>
  );

  if (view === "workout" && workout) return (
    <Layout onBack={() => { abortRef.current?.abort(); setView("form"); window.history.replaceState(null, "", `/c/${code}`); }}>
      <WorkoutScreen
        key={generation}
        workout={workout}
        code={code}
        studentName={firstName}
        shareId={shareId}
        streaming={streaming}
        onRegenerate={(fb) => generateWorkout(fb)}
      />
      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );

  return (
    <Layout onBack={leave}>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
        Let&apos;s Build Your Workout
      </div>
      <div className="text-muted text-[15px] mb-8">
        <strong className="text-accent">{label}</strong>{sessionName ? ` · ${sessionName}` : ""} · {config.duration} min · {config.intensity} intensity
      </div>

      <Card>
        <Field label="How fit do you feel today?">
          <div className="flex flex-wrap gap-2">
            {([["Just Starting Out","beginner"],["Feeling Good","moderate"],["Let's Go Hard","advanced"]] as const).map(([l,v]) =>
              <Chip key={v} label={l} value={v} current={fitnessLevel} onChange={setFitnessLevel} />
            )}
          </div>
        </Field>

        <Field label="Injuries or Limitations? (optional)">
          <Textarea
            value={limitations}
            onChange={setLimitations}
            placeholder="e.g. Sprained left ankle, avoid jumping. Leave blank if you're good to go!"
          />
        </Field>

        <Field label="Personal Preferences (optional)">
          <Textarea
            value={preferences}
            onChange={v => setPreferences(v.slice(0, 300))}
            placeholder="e.g. I love music-based exercises, hate running, enjoy partner workouts, prefer bodyweight over weights…"
          />
        </Field>
      </Card>

      <BtnPrimary onClick={() => generateWorkout()}>⚡ Generate My Workout</BtnPrimary>
      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );
}
