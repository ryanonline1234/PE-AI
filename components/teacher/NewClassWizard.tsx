"use client";

// New-class setup in three steps (docs/04 T3): name it (optionally from a
// preset) → settings → AI background → the code to share. The class is created
// at step 1, so leaving halfway leaves an ordinary class; each step has its own
// URL (/teacher/new?code=…&step=…), so a refresh lands on the same step.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Monitor, Sparkles } from "lucide-react";
import { apiCreateClass, apiSaveBackground, apiSaveClass } from "@/lib/api";
import { configSignature, DEFAULT_CONFIG, MAX_BACKGROUND } from "@/lib/class-config";
import type { ClassConfig } from "@/lib/types";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle, Field, Textarea, TextInput } from "@/components/ui";
import { SettingsFields } from "@/components/SettingsFields";
import { ConsultFlow } from "@/components/ConsultFlow";
import { CopyButton } from "@/components/teacher/TeacherControls";
import { useUnsavedGuard } from "@/components/UnsavedGuard";
import { cn } from "@/lib/utils";

export type WizardStep = "name" | "settings" | "background" | "share";
export interface WizardClass { code: string; label: string; config: ClassConfig }

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "settings", label: "Settings" },
  { id: "background", label: "AI background" },
];

const stepHref = (code: string, step: WizardStep) => `/teacher/new?code=${code}&step=${step}`;

export function NewClassWizard({ step, presets, cls, studentLink }: {
  step: WizardStep;
  presets: { id: string; name: string }[];
  /** The class being set up (every step after the first). */
  cls: WizardClass | null;
  studentLink: string;
}) {
  return (
    <div className="max-w-[620px]">
      <h1 className="t-page mb-2">{step === "share" ? "Your class is ready" : "New class"}</h1>
      {step !== "share" && <StepBar current={step} />}
      {step === "name" && <NameStep presets={presets} />}
      {step === "settings" && cls && <SettingsStep cls={cls} />}
      {step === "background" && cls && <BackgroundStep cls={cls} />}
      {step === "share" && cls && <ShareStep cls={cls} studentLink={studentLink} />}
    </div>
  );
}

function StepBar({ current }: { current: WizardStep }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="mb-6">
      <div className="text-muted text-[14px] mb-2">Step {at + 1} of {STEPS.length} · {STEPS[at].label}</div>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <div key={s.id} className={cn("h-1.5 flex-1 rounded-full", i <= at ? "bg-accent" : "bg-surface2")} />
        ))}
      </div>
    </div>
  );
}

function NameStep({ presets }: { presets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [presetId, setPresetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function next() {
    setBusy(true); setError("");
    try {
      const { code } = await apiCreateClass(label, presetId || undefined);
      router.push(stepHref(code, "settings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card>
      <Field label="Class name">
        <TextInput value={label} onChange={(v) => setLabel(v.slice(0, 60))} placeholder="e.g. Period 3 · Freshman PE" />
      </Field>
      {presets.length > 0 && (
        <Field label="Start from">
          <select
            className="w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            <option value="">The standard settings</option>
            {presets.map((p) => <option key={p.id} value={p.id}>Preset “{p.name}”</option>)}
          </select>
        </Field>
      )}
      <BtnPrimary onClick={next} disabled={busy || !label.trim()}>
        {busy ? "Creating…" : <>Next <ArrowRight className="icon" /></>}
      </BtnPrimary>
      {error && <Alert type="error">{error}</Alert>}
    </Card>
  );
}

function SettingsStep({ cls }: { cls: WizardClass }) {
  const router = useRouter();
  const start = { ...DEFAULT_CONFIG, ...cls.config };
  const [config, setConfig] = useState<ClassConfig>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaveGuard = useUnsavedGuard(configSignature(config) !== configSignature(start) && !busy);

  async function next() {
    setBusy(true); setError("");
    try {
      await apiSaveClass(cls.code, { ...config, summary: "" });
      router.push(stepHref(cls.code, "background"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card>
      {leaveGuard}
      <CardTitle>{cls.label}: default settings</CardTitle>
      <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
        What students get on days without a session. You can plan different settings for any day later.
      </div>
      <SettingsFields config={config} onChange={(key, value) => setConfig((c) => ({ ...c, [key]: value }))} />
      <BtnPrimary onClick={next} disabled={busy}>{busy ? "Saving…" : <>Save and continue <ArrowRight className="icon" /></>}</BtnPrimary>
      <BtnSecondary style={{ marginTop: 10 }} onClick={() => router.push(stepHref(cls.code, "background"))} disabled={busy}>
        Keep these and continue
      </BtnSecondary>
      {error && <Alert type="error">{error}</Alert>}
    </Card>
  );
}

function BackgroundStep({ cls }: { cls: WizardClass }) {
  const router = useRouter();
  const [background, setBackground] = useState(cls.config.background ?? "");
  const [consulting, setConsulting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaveGuard = useUnsavedGuard(background.trim() !== (cls.config.background ?? "").trim() && !busy);

  async function next() {
    setBusy(true); setError("");
    try {
      await apiSaveBackground(cls.code, { background });
      router.push(stepHref(cls.code, "share"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card>
      {leaveGuard}
      <CardTitle>Background for the AI</CardTitle>
      <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
        Who the students are, the unit you&apos;re in, standing rules. Every workout in this class keeps it in mind.
        Optional, but it makes workouts fit better.
      </div>
      <Field label={`Background (${background.length}/${MAX_BACKGROUND})`}>
        <Textarea
          value={background}
          onChange={(v) => setBackground(v.slice(0, MAX_BACKGROUND))}
          placeholder="e.g. Freshman PE, mostly beginners. Volleyball unit through November. Outdoor courts when it's dry."
        />
      </Field>
      {consulting ? (
        <ConsultFlow
          audience="background"
          config={{ ...DEFAULT_CONFIG, ...cls.config, background }}
          onUse={(t) => { setBackground(t); setConsulting(false); }}
          onCancel={() => setConsulting(false)}
        />
      ) : (
        <BtnSecondary style={{ marginBottom: 16 }} onClick={() => setConsulting(true)}><Sparkles className="icon" /> Let the AI ask me</BtnSecondary>
      )}
      <BtnPrimary onClick={next} disabled={busy || !background.trim()}>{busy ? "Saving…" : <>Save and finish <ArrowRight className="icon" /></>}</BtnPrimary>
      <BtnSecondary style={{ marginTop: 10 }} onClick={() => router.push(stepHref(cls.code, "share"))} disabled={busy}>
        Skip for now
      </BtnSecondary>
      {error && <Alert type="error">{error}</Alert>}
    </Card>
  );
}

function ShareStep({ cls, studentLink }: { cls: WizardClass; studentLink: string }) {
  return (
    <>
      <div className="text-muted text-[15px] mb-6">Give students the code. They sign in with their Mitty account, then enter it.</div>
      <div className="bg-surface2 border-[1.5px] border-accent rounded-xl p-6 text-center mb-4">
        <div className="t-eyebrow text-muted mb-2">{cls.label}</div>
        <div className="font-display text-[56px] font-black text-accent tracking-[8px] leading-none mb-4">{cls.code}</div>
        <div className="flex justify-center gap-2 flex-wrap">
          <CopyButton text={cls.code} label="Copy code" />
          <CopyButton text={studentLink} label="Copy student link" />
          <Link
            href={`/classes/${cls.code}/projector`}
            className="inline-flex items-center gap-1.5 bg-[rgba(200,255,0,0.1)] border border-[rgba(200,255,0,0.3)] text-accent px-4 py-2 rounded-md text-[13px] font-semibold no-underline"
          >
            <Monitor className="icon" /> Projector
          </Link>
        </div>
      </div>
      <Link
        href={`/classes/${cls.code}`}
        className="flex items-center justify-center gap-2 w-full bg-accent text-bg rounded-lg px-7 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] no-underline"
      >
        Open the class <ArrowRight className="icon" />
      </Link>
      <Link href={`/classes/${cls.code}?tab=sessions`} className="block text-center text-accent text-[14px] mt-4">
        Plan a session with different settings for a day
      </Link>
    </>
  );
}
