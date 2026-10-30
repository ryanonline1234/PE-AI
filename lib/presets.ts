// Named setting presets (DECISIONS 2026-10-28): any mix of the settings and the
// AI background, saved under a name and copied into a class, a session, a new
// class, or every class at once. Copied, not linked: changing one class later
// never touches the preset, and re-applying a preset is how changes spread.
import { clampConfig, configSignature } from "@/lib/class-config";
import type { ClassConfig } from "@/lib/types";

export const PRESET_FIELDS = ["duration", "equipment", "intensity", "focus", "customPrompt", "background"] as const;
export type PresetField = (typeof PRESET_FIELDS)[number];
export type PresetFields = Partial<Pick<ClassConfig, PresetField>>;

export interface SettingPreset {
  id: string;
  name: string;
  fields: PresetFields;
  updated_at: string;
}

export const PRESET_FIELD_LABELS: Record<PresetField, string> = {
  duration: "Duration",
  equipment: "Equipment",
  intensity: "Intensity",
  focus: "Focus",
  customPrompt: "Custom instructions",
  background: "AI background",
};

export const cleanPresetName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "");

/** Only the known fields that are present, each clamped like a saved class. */
export function cleanPresetFields(raw: unknown): PresetFields {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const clamped = clampConfig(input);
  const out: PresetFields = {};
  for (const key of PRESET_FIELDS) {
    if (key in input && input[key] !== undefined) (out as Record<string, unknown>)[key] = clamped[key];
  }
  return out;
}

/**
 * A class's (or session's) config with a preset copied in. When the settings
 * change, the AI check's summary no longer describes them, so it's dropped.
 */
export function applyPreset(config: ClassConfig, fields: PresetFields, opts: { background: boolean }): ClassConfig {
  const { background, ...settings } = fields;
  const next: ClassConfig = { ...config, ...settings };
  if (opts.background && background !== undefined) next.background = background;
  if (configSignature(next) !== configSignature(config)) next.summary = "";
  return next;
}

/** "30 min · Mats, Cones · moderate · cardio · + instructions, background". */
export function describePreset(fields: PresetFields): string {
  const parts: string[] = [];
  if (fields.duration !== undefined) parts.push(`${fields.duration} min`);
  if (fields.equipment) parts.push(fields.equipment.length > 40 ? `${fields.equipment.slice(0, 40)}…` : fields.equipment);
  if (fields.intensity) parts.push(fields.intensity);
  if (fields.focus) parts.push(fields.focus);
  const extra = [fields.customPrompt ? "instructions" : "", fields.background ? "AI background" : ""].filter(Boolean);
  if (extra.length) parts.push(`+ ${extra.join(", ")}`);
  return parts.join(" · ") || "No settings";
}
