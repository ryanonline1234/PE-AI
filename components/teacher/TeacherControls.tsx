"use client";

// Small interactive pieces of the signed-in teacher pages. Each one calls an
// API route, then refreshes the server-rendered page so lists stay in sync.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClaimClass, apiCreateClass, apiFileWorkout, apiUpdateClass } from "@/lib/api";
import { cn } from "@/lib/utils";

const input = "w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none";
const btn = "bg-accent text-bg border-0 rounded-lg px-5 py-3 font-display text-[17px] font-bold uppercase tracking-[0.5px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";
const ghost = "bg-surface2 text-text border border-border rounded-lg px-4 py-2.5 font-body text-[14px] font-medium cursor-pointer disabled:opacity-45";

function ErrorLine({ msg }: { msg: string }) {
  return msg ? <div className="text-danger text-[13px] mt-2">{msg}</div> : null;
}

export function NewClassForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { code } = await apiCreateClass(label);
      router.push(`/teacher/${code}`);
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
          placeholder="Class name, e.g. Period 3 · Freshman PE"
          aria-label="New class name"
        />
        <button type="submit" className={btn} disabled={busy}>{busy ? "Creating…" : "+ New class"}</button>
      </div>
      <ErrorLine msg={err} />
    </form>
  );
}

export function ClaimClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await apiClaimClass(code, key);
      router.push(`/teacher/${res.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5">
        <input
          className={cn(input, "font-display text-[20px] tracking-[4px] text-center uppercase")}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase())}
          placeholder="CLASS CODE"
          aria-label="Class code"
        />
        <input
          className={cn(input, "font-display text-[20px] tracking-[3px] text-center uppercase")}
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))}
          placeholder="TEACHER KEY"
          aria-label="Teacher key"
        />
        <button type="submit" className={btn} disabled={busy || code.length < 6}>{busy ? "Adding…" : "Add class"}</button>
      </div>
      <div className="text-muted text-[12px] mt-2">
        Use the teacher key you got when you first saved the class. Classes that never got a key only need the code.
      </div>
      <ErrorLine msg={err} />
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
        className={cn(input, "font-display text-[24px] font-bold uppercase tracking-[0.5px] py-2")}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 60))}
        placeholder="Name this class"
        aria-label="Class name"
      />
      <button type="submit" className={ghost} disabled={busy || !dirty}>{saved ? "✓ Saved" : "Rename"}</button>
    </form>
  );
}

export function ArchiveToggle({ code, archived }: { code: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await apiUpdateClass(code, { archived: !archived });
      router.push(archived ? `/teacher/${code}` : "/teacher");
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
      {copied ? "✓ Copied" : label}
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
              "rounded-full border px-3 py-1 text-[12px] font-medium cursor-pointer transition-colors",
              on ? "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2" : "border-border bg-surface2 text-muted"
            )}
          >
            {on ? "✓ " : "+ "}{c.label}
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
        "rounded-full border px-3 py-1 text-[12px] font-medium cursor-pointer shrink-0",
        on ? "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2" : "border-border bg-surface2 text-muted"
      )}
    >
      {on ? "✓ Filed" : "+ File"}
    </button>
  );
}
