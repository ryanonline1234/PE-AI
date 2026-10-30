"use client";

// The workout settings a teacher picks: duration, equipment, intensity, focus
// and custom instructions, in that order. Shared by the class settings editor
// and the teacher's own-workout form (/teacher/workout).
import { useState } from "react";
import { BODYWEIGHT_ONLY, EQUIPMENT_PRESETS, formatEquipment, parseEquipment, togglePreset } from "@/lib/equipment";
import type { ClassConfig } from "@/lib/types";
import { Chip, Field, Textarea, TextInput } from "@/components/ui";
import { cn } from "@/lib/utils";

type Editable = Pick<ClassConfig, "duration" | "equipment" | "intensity" | "focus" | "customPrompt">;

export function SettingsFields({ config, onChange }: {
  config: Editable;
  onChange: <K extends keyof Editable>(key: K, value: Editable[K]) => void;
}) {
  return (
    <>
      <Field label={`Duration — ${config.duration} min`}>
        <input type="range" min="10" max="90" step="5" value={config.duration}
          onChange={e => onChange("duration", +e.target.value)}
          className="w-full accent-accent"
        />
      </Field>

      <Field label="Equipment available">
        <EquipmentPicker value={config.equipment} onChange={(v) => onChange("equipment", v)} />
      </Field>

      <Field label="Intensity">
        <div className="flex flex-wrap gap-2">
          {([["Low","low"],["Moderate","moderate"],["High","high"]] as const).map(([l,v]) =>
            <Chip key={v} label={l} value={v} current={config.intensity} onChange={val => onChange("intensity", val)} />
          )}
        </div>
      </Field>

      <Field label="Workout focus">
        <div className="flex flex-wrap gap-2">
          {([["Mixed","mixed"],["Cardio","cardio"],["Strength","strength"],["Flexibility","flexibility"]] as const).map(([l,v]) =>
            <Chip key={v} label={l} value={v} current={config.focus} onChange={val => onChange("focus", val)} />
          )}
        </div>
      </Field>

      <Field label="Custom instructions (optional)">
        <Textarea
          value={config.customPrompt}
          onChange={v => onChange("customPrompt", v.slice(0, 500))}
          placeholder="e.g. Focus on teamwork exercises, avoid jumping movements, theme this week around the Olympics…"
        />
        <div className="text-[12px] text-muted mt-1 text-right">
          {config.customPrompt.length}/500
        </div>
      </Field>
    </>
  );
}

/**
 * Tap the equipment the school has; Other opens a box for anything else. The
 * picks live in local state (so typing in Other keeps its spaces) and every
 * change is written back as the stored text (lib/equipment.ts).
 */
function EquipmentPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [choice, setChoice] = useState(() => parseEquipment(value));
  const [otherOpen, setOtherOpen] = useState(() => choice.other.length > 0);

  function update(next: typeof choice) {
    setChoice(next);
    onChange(formatEquipment(next));
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {EQUIPMENT_PRESETS.map((p) => (
          <ToggleChip key={p} label={p} on={choice.picked.includes(p)} onClick={() => update({ ...choice, picked: togglePreset(choice.picked, p) })} />
        ))}
        <ToggleChip
          label="+ Other"
          on={otherOpen}
          onClick={() => {
            if (otherOpen) update({ ...choice, other: "" });
            setOtherOpen(!otherOpen);
          }}
        />
      </div>
      {otherOpen && (
        <TextInput
          value={choice.other}
          onChange={(v) => update({ ...choice, other: v.slice(0, 300) })}
          placeholder="Anything else, e.g. kettlebells, foam rollers, hurdles"
          className="mt-2.5"
        />
      )}
      {choice.picked.length === 0 && !choice.other.trim() && (
        <div className="text-[12px] text-muted mt-2">Nothing picked yet. Tap {BODYWEIGHT_ONLY} if there&apos;s no equipment.</div>
      )}
    </>
  );
}

function ToggleChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-lg border px-3.5 py-2 font-body text-[14px] font-medium cursor-pointer transition-all duration-150",
        on ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent" : "border-border bg-surface2 text-muted"
      )}
    >
      {label}
    </button>
  );
}
