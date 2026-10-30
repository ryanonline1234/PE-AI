"use client";

// Presets in the settings editor (DECISIONS 2026-10-28): apply a saved preset
// to the form, or save the current settings as a named preset (optionally
// copying it into every class at once). Teacher classes and sessions only.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSavePreset } from "@/lib/api";
import { describePreset, PRESET_FIELD_LABELS, PRESET_FIELDS, type PresetField, type PresetFields, type SettingPreset } from "@/lib/presets";
import type { ClassConfig } from "@/lib/types";
import { Alert, BtnPrimary, TextInput } from "@/components/ui";
import { cn } from "@/lib/utils";

const field = "w-full bg-surface2 border border-border rounded-lg text-text font-body text-[14px] px-3 py-2.5 outline-none";
const ghost = "bg-surface2 text-text border border-border rounded-lg px-4 py-2.5 font-body text-[14px] font-medium cursor-pointer disabled:opacity-45 whitespace-nowrap";

export function PresetBar({ presets, config, background, onApply }: {
  presets: SettingPreset[];
  /** The settings in the form right now (what "Save as preset" saves). */
  config: ClassConfig;
  /** The class's AI background, offered as an optional part of a new preset. */
  background: string;
  /** Copy a preset's fields into the form (and the background, where it applies). */
  onApply: (preset: SettingPreset) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [include, setInclude] = useState<Set<PresetField>>(() => new Set(PRESET_FIELDS.filter((f) => f !== "background")));
  const [applyToAll, setApplyToAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function toggle(f: PresetField) {
    setInclude((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  }

  async function save() {
    setSaving(true); setError(""); setMsg("");
    const fields: PresetFields = {};
    for (const f of include) {
      if (f === "background") fields.background = background;
      else (fields as Record<string, unknown>)[f] = config[f];
    }
    try {
      const r = await apiSavePreset(name, fields, applyToAll);
      setMsg(`${r.updated ? "Updated" : "Saved"} “${name.trim()}”${applyToAll ? ` and applied it to ${r.applied} class${r.applied === 1 ? "" : "es"}` : ""}.`);
      setOpen(false); setName(""); setApplyToAll(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="bg-surface2 border border-border rounded-xl p-4 mb-6">
      <div className="t-label mb-2">Presets</div>
      <div className="flex gap-2 flex-wrap">
        <select
          className={cn(field, "flex-1 min-w-[180px]")}
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          aria-label="Choose a preset"
        >
          <option value="">{presets.length ? "Start from a preset…" : "No presets yet"}</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name} · {describePreset(p.fields)}</option>)}
        </select>
        <button
          type="button"
          className={ghost}
          disabled={!picked}
          onClick={() => {
            const p = presets.find((x) => x.id === picked);
            if (p) { onApply(p); setMsg(`Applied “${p.name}”. Review, then save.`); setPicked(""); }
          }}
        >
          Apply
        </button>
        <button type="button" className={ghost} onClick={() => { setOpen(!open); setMsg(""); }}>
          {open ? "Cancel" : "Save as preset…"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <TextInput value={name} onChange={(v) => setName(v.slice(0, 60))} placeholder="Name it, e.g. Weight room day" className="mb-3" />
          <div className="text-[12px] text-muted mb-2">Which settings it holds (a saved name updates that preset):</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_FIELDS.map((f) => {
              const disabled = f === "background" && !background.trim();
              const on = include.has(f) && !disabled;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  title={disabled ? "This class has no AI background yet" : undefined}
                  onClick={() => toggle(f)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 font-body text-[13px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                    on ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent" : "border-border bg-surface text-muted"
                  )}
                >
                  {PRESET_FIELD_LABELS[f]}
                </button>
              );
            })}
          </div>
          <label className="flex items-start gap-2.5 text-[14px] mb-3 cursor-pointer">
            <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="mt-1 accent-accent" />
            <span>
              Also apply it to all my classes now
              <span className="block text-[12px] text-muted">Updates each class&apos;s default settings. Sessions you already planned stay as they are.</span>
            </span>
          </label>
          <BtnPrimary onClick={save} disabled={saving || !name.trim() || include.size === 0}>{saving ? "Saving…" : "Save preset"}</BtnPrimary>
        </div>
      )}
      {msg && <div className="text-[13px] text-accent mt-3">{msg}</div>}
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}
