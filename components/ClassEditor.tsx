"use client";

// The class settings editor: parameters, the AI check, "what the AI knows",
// save, and sample preview. Used by the class's owner on /classes/[code] (a
// teacher class's default settings, or a student's personal class) and on
// /classes/[code]/s/[date] (one session's settings). The AI background, session
// specifics and today's report are their own components (own tabs, own saves).
// On wide screens: settings on the left, a sticky column with what the AI knows
// and Save on the right.
//
// Remount it (React `key`) when the class changes; it owns its own form state.
import { useRef, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";
import { apiClarifyClass, apiGenerateWorkoutStream, apiSaveBackground, apiSaveClass, apiUpdateSession } from "@/lib/api";
import { applyPreset, type SettingPreset } from "@/lib/presets";
import { configSignature, DEFAULT_CONFIG, withoutCalorieTargets } from "@/lib/class-config";
import { applyEvent } from "@/lib/workout-stream";
import { EMPTY_WORKOUT, type ClassCheck, type ClassConfig, type QA, type Workout } from "@/lib/types";
import { QuestionList, collectAnswers, NO_ANSWERS, type Answers } from "@/components/QuestionList";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle } from "@/components/ui";
import { WorkoutScreen } from "@/components/WorkoutScreen";
import { SettingsFields } from "@/components/SettingsFields";
import { PresetBar } from "@/components/PresetBar";
import { useUnsavedGuard } from "@/components/UnsavedGuard";

/** What a save writes that a teacher would miss if they left: the settings and the AI's notes. */
const editKey = (c: ClassConfig) => JSON.stringify([configSignature(c), c.clarifications ?? []]);

/** The teacher's AI check in progress: what the AI said, and the answers so far. */
interface CheckState extends ClassCheck {
  round: number;
  answers: Answers;
}


export function ClassEditor({ code, initialConfig, kind, sessionDate, classConfig, presets }: {
  code: string;
  initialConfig: ClassConfig;
  /** "personal": a student's own training class — no sample preview. */
  kind: "class" | "personal";
  /** Editing one session (YYYY-MM-DD) instead of the class's default settings. */
  sessionDate?: string;
  /** The class's saved config, so the AI check reads the shared background too. */
  classConfig?: ClassConfig;
  /** The teacher's setting presets (teacher classes and sessions); omit to hide the bar. */
  presets?: SettingPreset[];
}) {
  const personal = kind === "personal";
  // Older summaries still state a calorie target; don't show one that no longer applies.
  const start = withoutCalorieTargets({ ...DEFAULT_CONFIG, ...initialConfig });
  const [config, setConfig] = useState<ClassConfig>(start);
  const [savedKey, setSavedKey] = useState(() => editKey(start));
  const dirty = editKey(config) !== savedKey;
  const leaveGuard = useUnsavedGuard(dirty);
  // A saved summary describes exactly the settings it was saved with.
  const [checkedSig, setCheckedSig] = useState(start.summary ? configSignature(start) : "");
  const [check, setCheck] = useState<CheckState | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  const [fieldsKey, setFieldsKey] = useState(0);
  const [sample, setSample] = useState<Workout | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [sampleStreaming, setSampleStreaming] = useState(false);
  const [sampleError, setSampleError] = useState("");
  const sampleAbortRef = useRef<AbortController | null>(null);


  function cfgSet<K extends keyof ClassConfig>(key: K, value: ClassConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  /** Returns true when the class was saved. */
  async function saveClass(toSave: ClassConfig = config): Promise<boolean> {
    let ok = false;
    setSaving(true); setError(""); setSaveMsg("");
    try {
      if (sessionDate) await apiUpdateSession(code, sessionDate, { config: toSave });
      else await apiSaveClass(code, toSave);
      setConfig(toSave);
      setSavedKey(editKey(toSave));
      setSaveMsg(
        personal ? "Saved! Your next workout will use these settings."
        : sessionDate ? "Saved! Students get these settings that day."
        : "Saved! Students get these on days without a session."
      );
      ok = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
    return ok;
  }

  // ── AI check ─────────────────────────────────────────────────
  // Save → if the settings changed since the last confirmed check, the AI reads
  // them back and may ask up to three questions. Answers go back for another
  // round (max 3); "Looks right" saves the summary + answers with the class.

  function onSaveClick() {
    if (configSignature(config) === checkedSig) { void saveClass(); return; }
    void runCheck(config, 1);
  }

  async function runCheck(cfg: ClassConfig, round: number) {
    setChecking(true); setCheckError(""); setSaveMsg(""); setError("");
    try {
      // The check also reads the class's background and research (they live on the class).
      const shared = classConfig ?? cfg;
      const result = await apiClarifyClass({ ...cfg, background: shared.background, sources: shared.sources }, round, personal);
      setCheck({ ...result, round, answers: NO_ANSWERS });
    } catch (e) {
      setCheck(null);
      setCheckError(e instanceof Error ? e.message : String(e));
    }
    setChecking(false);
  }

  /** Fold answered questions into the class's saved clarifications. */
  function withAnswers(cfg: ClassConfig, answered: QA[]): ClassConfig {
    if (answered.length === 0) return cfg;
    return { ...cfg, clarifications: [...(cfg.clarifications ?? []), ...answered].slice(-6) };
  }

  function sendCheckAnswers() {
    if (!check) return;
    const next = withAnswers(config, collectAnswers(check.questions, check.answers));
    setConfig(next);
    void runCheck(next, check.round + 1);
  }

  async function confirmCheckAndSave() {
    if (!check) return;
    const next = { ...withAnswers(config, collectAnswers(check.questions, check.answers)), summary: check.summary };
    // Keep the confirmed summary in the form even if the save fails (wrong
    // key, network), so a retry doesn't lose it.
    setConfig(next);
    setCheck(null);
    if (await saveClass(next)) setCheckedSig(configSignature(next));
  }

  async function saveWithoutCheck() {
    // The old summary no longer describes these settings, so drop it.
    setCheck(null); setCheckError("");
    await saveClass({ ...config, summary: "" });
  }

  /** Copy a preset into the form (saved with Save, like any edit). Its AI background lives on the class. */
  async function applyPresetToForm(p: SettingPreset) {
    // Remount the settings fields so the equipment chips show the preset's picks.
    setConfig((c) => applyPreset(c, p.fields, { background: false }));
    setFieldsKey((k) => k + 1);
    setSaveMsg(""); setError("");
    if (p.fields.background === undefined) return;
    if (sessionDate) {
      setSaveMsg("This preset's AI background belongs to the class, so it wasn't applied here.");
      return;
    }
    try {
      await apiSaveBackground(code, { background: p.fields.background });
      setSaveMsg("The preset's AI background was saved to this class. Save to keep the settings.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function removeClarification(index: number) {
    setConfig((c) => ({ ...c, clarifications: (c.clarifications ?? []).filter((_, i) => i !== index) }));
  }

  // ── Sample preview ──────────────────────────────────────────

  async function previewSample() {
    sampleAbortRef.current?.abort();
    const controller = new AbortController();
    sampleAbortRef.current = controller;
    setSample(EMPTY_WORKOUT); setSampleId(null); setSampleStreaming(true); setSampleError("");
    let latest: Workout = EMPTY_WORKOUT;
    let failed = "";
    try {
      await apiGenerateWorkoutStream(
        { code, fitnessLevel: "moderate", limitations: "", preferences: "", regenerateFeedback: "", sample: true, sessionDate },
        (ev) => {
          if (ev.kind === "error") failed = ev.message;
          else if (ev.kind === "done") setSampleId(ev.id);
          else if (ev.kind !== "question" && ev.kind !== "needs_answers") {
            latest = applyEvent(latest, ev);
            setSample(latest);
          }
        },
        controller.signal
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      failed = e instanceof Error ? e.message : String(e);
    }
    if (controller.signal.aborted) return;
    setSampleStreaming(false);
    if (failed) { setSampleError(failed); if (latest.exercises.length === 0) setSample(null); }
  }

  function closeSample() {
    sampleAbortRef.current?.abort();
    setSample(null); setSampleStreaming(false);
  }

  return (
    <>
      {leaveGuard}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:items-start">
      <Card>
        <CardTitle>{personal ? "Workout settings" : sessionDate ? "Session settings" : "Default settings"}</CardTitle>
        {!personal && !sessionDate && (
          <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
            Students get these on days without a session. New sessions start from them.
          </div>
        )}

        {presets && (
          <PresetBar
            presets={presets}
            config={config}
            background={(classConfig ?? config).background ?? ""}
            onApply={applyPresetToForm}
          />
        )}

        <SettingsFields key={fieldsKey} config={config} onChange={cfgSet} />
      </Card>

      <div className="lg:sticky lg:top-16">
        {(config.summary || (config.clarifications?.length ?? 0) > 0) && (
          <Card>
            <CardTitle>What the AI knows</CardTitle>
            <div className="-mt-2">
              {config.summary && (
                <div className="text-[14px] leading-[1.55] mb-1">{config.summary}</div>
              )}
              {(config.clarifications ?? []).map((qa, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-t border-border pt-2.5 mt-2.5">
                  <div className="text-[13px] leading-[1.45]">
                    <div className="text-muted">{qa.question}</div>
                    <div>{qa.answer}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeClarification(i)}
                    aria-label="Remove this answer"
                    className="text-muted bg-transparent border-0 cursor-pointer text-[16px] leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

      {check ? (
        <Card style={{ borderColor: "var(--accent2)" }}>
          <div className="t-eyebrow text-accent2 mb-2">
            AI check{check.round > 1 ? ` · round ${check.round}` : ""}
          </div>
          <div className="text-[15px] leading-[1.6] mb-5">{check.summary}</div>
          {check.questions.length > 0 && (
            <div className="mb-5">
              <div className="t-label mb-3">
                A few things to pin down
              </div>
              <QuestionList
                questions={check.questions}
                answers={check.answers}
                onChange={(answers) => setCheck({ ...check, answers })}
                accent="accent2"
              />
            </div>
          )}
          {check.questions.length > 0 ? (
            <div className="flex gap-2.5">
              <BtnSecondary style={{ flex: 1 }} onClick={confirmCheckAndSave} disabled={saving || checking}>
                Save as is
              </BtnSecondary>
              <BtnPrimary
                style={{ flex: 2 }}
                onClick={sendCheckAnswers}
                disabled={checking || collectAnswers(check.questions, check.answers).length === 0}
              >
                {checking ? "Checking…" : "Send answers"}
              </BtnPrimary>
            </div>
          ) : (
            <div className="flex gap-2.5">
              <BtnSecondary style={{ flex: 1 }} onClick={() => setCheck(null)}>Edit settings</BtnSecondary>
              <BtnPrimary style={{ flex: 2 }} onClick={confirmCheckAndSave} disabled={saving}>
                {saving ? "Saving…" : "Looks right — save"}
              </BtnPrimary>
            </div>
          )}
        </Card>
      ) : (
        <BtnPrimary onClick={onSaveClick} disabled={saving || checking}>
          {checking ? "AI is reading your setup…" : saving ? "Saving…"
            : personal ? "Save Class Settings" : sessionDate ? "Save Session Settings" : "Save Default Settings"}
        </BtnPrimary>
      )}
      {dirty && !check && <div className="text-[12px] text-muted text-center mt-2">Unsaved changes</div>}
      {checkError && (
        <>
          <Alert type="error">{checkError}</Alert>
          <BtnSecondary style={{ marginTop: 10 }} onClick={saveWithoutCheck} disabled={saving}>
            Save without the AI check
          </BtnSecondary>
        </>
      )}
      {error && <Alert type="error">{error}</Alert>}
      {saveMsg && <Alert type="success">{saveMsg}</Alert>}
      </div>
      </div>

      {saveMsg && !sample && !personal && (
        <BtnSecondary style={{ marginTop: 12 }} onClick={previewSample}>
          <Eye className="icon" /> Preview a sample workout
        </BtnSecondary>
      )}
      {sample && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="t-section">Sample workout</h2>
            <button
              type="button"
              onClick={closeSample}
              className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-lg cursor-pointer text-[13px] font-body"
            >
              Close
            </button>
          </div>
          <div className="text-muted text-[13px] mb-3">
            What a typical student in this class gets: moderate fitness, no injuries.{" "}
            {sampleId && <>Saved to <Link href="/teacher" className="text-accent">your workouts</Link>.</>}
          </div>
          <WorkoutScreen
            workout={sample}
            code={code}
            studentName=""
            shareId={sampleId}
            streaming={sampleStreaming}
            variant="preview"
          />
          {!sampleStreaming && (
            <BtnSecondary onClick={previewSample}><RefreshCw className="icon" /> Another sample</BtnSecondary>
          )}
        </div>
      )}
      {sampleError && <Alert type="error">{sampleError}</Alert>}

    </>
  );
}
