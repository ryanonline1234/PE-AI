"use client";

// Small interactive pieces of the signed-in teacher pages. Each one calls an
// API route, then refreshes the server-rendered page so lists stay in sync.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus } from "lucide-react";
import {
  apiApplyPresetToAll, apiCreateClass, apiCreateSession, apiDeletePreset, apiDeleteSession, apiFileWorkout, apiRenamePreset,
  apiUpdateClass, apiUpdateSession,
} from "@/lib/api";
import { describePreset, type SettingPreset } from "@/lib/presets";
import { useConfirm } from "@/components/Dialog";
import { cn } from "@/lib/utils";

const input = "w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none";
const btn = "bg-accent text-bg border-0 rounded-lg px-5 py-3 font-display text-[17px] font-bold uppercase tracking-[0.5px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";
const ghost = "bg-surface2 text-text border border-border rounded-lg px-4 py-2.5 font-body text-[14px] font-medium cursor-pointer disabled:opacity-45";

function ErrorLine({ msg }: { msg: string }) {
  return msg ? <div className="text-danger text-[13px] mt-2">{msg}</div> : null;
}

export function NewClassForm({
  placeholder = "Class name, e.g. Period 3 · Freshman PE",
  buttonLabel = "+ New class",
  presets = [],
}: { placeholder?: string; buttonLabel?: string; presets?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [presetId, setPresetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { code } = await apiCreateClass(label, presetId || undefined);
      router.push(`/classes/${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2.5">
        <input
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 60))}
          placeholder={placeholder}
          aria-label="New class name"
        />
        <button type="submit" className={btn} disabled={busy}>{busy ? "Creating…" : buttonLabel}</button>
      </div>
      {presets.length > 0 && (
        <select
          className={cn(input, "mt-2.5 py-2.5 text-[14px]")}
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          aria-label="Start the new class from"
        >
          <option value="">Start from the standard settings</option>
          {presets.map((p) => <option key={p.id} value={p.id}>Start from preset “{p.name}”</option>)}
        </select>
      )}
      <ErrorLine msg={err} />
    </form>
  );
}

/** Student: type a class code, go to that class's workout page. */
export function JoinClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setBusy(true);
    router.push(`/c/${code}`);
  }
  return (
    <form onSubmit={submit} className="flex gap-2.5">
      <input
        className={cn(input, "font-display text-[28px] font-bold tracking-[6px] text-center uppercase py-2")}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase())}
        placeholder="ABCD12"
        aria-label="Class code"
        autoCapitalize="characters"
        autoComplete="off"
      />
      <button type="submit" className={cn(btn, "inline-flex items-center gap-1.5")} disabled={busy || code.length < 6}>{busy ? "…" : <>Go <ArrowRight className="icon" /></>}</button>
    </form>
  );
}

export function LabelEditor({ code, label }: { code: string; label: string }) {
  const router = useRouter();
  const [value, setValue] = useState(label);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value.trim() !== label;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiUpdateClass(code, { label: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex gap-2.5 items-center">
      <input
        className={cn(input, "font-display text-[24px] font-bold py-2")}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 60))}
        placeholder="Name this class"
        aria-label="Class name"
      />
      <button type="submit" className={ghost} disabled={busy || !dirty}>{saved ? <><Check className="icon" /> Saved</> : "Rename"}</button>
    </form>
  );
}

export function ArchiveToggle({ code, archived, home }: { code: string; archived: boolean; home: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await apiUpdateClass(code, { archived: !archived });
      router.push(archived ? `/classes/${code}` : home);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={toggle} className={ghost} disabled={busy}>
      {archived ? "Restore class" : "Archive class"}
    </button>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="bg-[rgba(200,255,0,0.1)] border border-[rgba(200,255,0,0.3)] text-accent px-4 py-2 rounded-md cursor-pointer text-[13px] font-semibold font-body"
    >
      {copied ? <><Check className="icon" /> Copied</> : label}
    </button>
  );
}

/** One class chip per labeled class; filled when the workout is filed there. */
export function FileChips({ workoutId, classes, filedIn }: {
  workoutId: string;
  classes: { code: string; label: string }[];
  filedIn: string[];
}) {
  const router = useRouter();
  const [filed, setFiled] = useState(() => new Set(filedIn));
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(code: string) {
    const next = !filed.has(code);
    setBusy(code);
    try {
      await apiFileWorkout(code, workoutId, next);
      setFiled((s) => { const n = new Set(s); if (next) n.add(code); else n.delete(code); return n; });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  if (classes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {classes.map((c) => {
        const on = filed.has(c.code);
        return (
          <button
            key={c.code}
            type="button"
            onClick={() => toggle(c.code)}
            disabled={busy === c.code}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium cursor-pointer transition-colors",
              on ? "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2" : "border-border bg-surface2 text-muted"
            )}
          >
            {on ? <Check className="icon" /> : <Plus className="icon" />}{c.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pin or unpin one workout under the current class. */
export function FileToggle({ code, workoutId, filed }: { code: string; workoutId: string; filed: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(filed);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await apiFileWorkout(code, workoutId, !on);
      setOn(!on);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium cursor-pointer shrink-0",
        on ? "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2" : "border-border bg-surface2 text-muted"
      )}
    >
      {on ? <><Check className="icon" />Filed</> : <><Plus className="icon" />File</>}
    </button>
  );
}

// ── Sessions (docs/02-sessions.md) ────────────────────────────

/** Pick a date and what to copy from, then open the new session. */
export function PlanSessionForm({ code, defaultDate, minDate, copyOptions, presets = [] }: {
  code: string;
  defaultDate: string;
  minDate: string;
  /** Earlier sessions to copy from: value = their date. The defaults are always offered. */
  copyOptions: { value: string; label: string }[];
  /** The teacher's presets, applied on top of the defaults. */
  presets?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    setBusy(true); setErr("");
    try {
      await apiCreateSession(code, date, copyFrom || null);
      router.push(`/classes/${code}/s/${date}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2.5 flex-wrap">
        <input
          type="date"
          className={cn(input, "flex-1 min-w-[150px] [color-scheme:dark]")}
          value={date}
          min={minDate}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Session date"
          required
        />
        <select
          className={cn(input, "flex-1 min-w-[150px]")}
          value={copyFrom}
          onChange={(e) => setCopyFrom(e.target.value)}
          aria-label="Start from"
        >
          <option value="">Start from the default settings</option>
          {copyOptions.length > 0 && (
            <optgroup label="Earlier sessions">
              {copyOptions.map((o) => <option key={o.value} value={o.value}>Copy {o.label}</option>)}
            </optgroup>
          )}
          {presets.length > 0 && (
            <optgroup label="Presets">
              {presets.map((p) => <option key={p.id} value={`preset:${p.id}`}>Preset “{p.name}”</option>)}
            </optgroup>
          )}
        </select>
        <button type="submit" className={btn} disabled={busy || !date}>{busy ? "Planning…" : "+ Plan"}</button>
      </div>
      <ErrorLine msg={err} />
    </form>
  );
}

export function SessionNameEditor({ code, date, name }: { code: string; date: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const dirty = value.trim() !== name;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await apiUpdateSession(code, date, { name: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="flex gap-2.5 items-center">
        <input
          className={cn(input, "font-display text-[22px] font-bold py-2")}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 60))}
          placeholder="Name it, e.g. Volleyball conditioning"
          aria-label="Session name"
        />
        <button type="submit" className={ghost} disabled={busy || !dirty}>{saved ? <><Check className="icon" /> Saved</> : "Rename"}</button>
      </div>
      <ErrorLine msg={err} />
    </form>
  );
}

export function DeleteSessionButton({ code, date }: { code: string; date: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  async function remove() {
    const ok = await confirm({
      title: "Delete this session?",
      body: "Students get the default settings that day. Workouts already made stay.",
      confirmLabel: "Delete session",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setErr("");
    try {
      await apiDeleteSession(code, date);
      router.push(`/classes/${code}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <div className="text-right">
      {confirmDialog}
      <button type="button" onClick={remove} className={ghost} disabled={busy}>{busy ? "Deleting…" : "Delete session"}</button>
      <ErrorLine msg={err} />
    </div>
  );
}

// ── Setting presets (DECISIONS 2026-10-28) ────────────────────

/** The teacher's presets on /teacher: apply to every class, rename, delete. */
export function PresetList({ presets }: { presets: SettingPreset[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  async function run(id: string, fn: () => Promise<string>) {
    setBusy(id); setErr(""); setMsg("");
    try {
      setMsg(await fn());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  if (presets.length === 0) {
    return (
      <div className="text-muted text-[14px] leading-[1.6]">
        None yet. In any class&apos;s Settings tab, tap &ldquo;Save as preset…&rdquo; to name a set of settings, then
        apply it to one class or all of them.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {confirmDialog}
      {presets.map((p) => (
        <div key={p.id} className="bg-surface border border-border rounded-xl px-4 py-3">
          {renaming === p.id ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void run(p.id, async () => { await apiRenamePreset(p.id, name); setRenaming(null); return "Renamed."; }); }}
            >
              <input className={input} value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} aria-label="Preset name" autoFocus />
              <button type="submit" className={ghost} disabled={busy === p.id || !name.trim()}>Save</button>
              <button type="button" className={ghost} onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-[15px]">{p.name}</div>
                <div className="text-[12px] text-muted">{describePreset(p.fields)}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={ghost}
                  disabled={busy === p.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Apply “${p.name}” to all your classes?`,
                      body: "Each active class's default settings change to this preset's. Sessions you already planned stay as they are.",
                      confirmLabel: "Apply to all",
                    });
                    if (!ok) return;
                    void run(p.id, async () => { const r = await apiApplyPresetToAll(p.id); return `Applied “${p.name}” to ${r.applied} class${r.applied === 1 ? "" : "es"}.`; });
                  }}
                >
                  Apply to all classes
                </button>
                <button type="button" className={ghost} onClick={() => { setRenaming(p.id); setName(p.name); }}>Rename</button>
                <button
                  type="button"
                  className={ghost}
                  disabled={busy === p.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete “${p.name}”?`,
                      body: "Classes it was applied to keep their settings.",
                      confirmLabel: "Delete preset",
                      danger: true,
                    });
                    if (!ok) return;
                    void run(p.id, async () => { await apiDeletePreset(p.id); return "Deleted."; });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {msg && <div className="text-[13px] text-accent">{msg}</div>}
      <ErrorLine msg={err} />
    </div>
  );
}
