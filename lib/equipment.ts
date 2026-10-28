// Equipment presets (DECISIONS 2026-10-28): tap what the school has, type the
// rest under Other. Stored as the same plain-text `equipment` string the prompt
// already reads, e.g. "Mats, Cones, Jump ropes. Also: foam rollers", so older
// free-text settings still load: whatever doesn't match a preset lands in Other.

export const BODYWEIGHT_ONLY = "Bodyweight only";

export const EQUIPMENT_PRESETS = [
  BODYWEIGHT_ONLY,
  "Mats",
  "Jump ropes",
  "Cones",
  "Dumbbells",
  "Resistance bands",
  "Medicine balls",
  "Agility ladders",
  "Sports balls",
  "Track",
  "Bleachers",
  "Weight room",
] as const;

const ALSO = "Also:";
const MAX = 500;

export interface EquipmentChoice {
  picked: string[];
  other: string;
}

/** Split a stored equipment string into preset picks and the Other text. */
export function parseEquipment(value: string): EquipmentChoice {
  const text = (value ?? "").trim();
  if (!text) return { picked: [], other: "" };
  const at = text.indexOf(ALSO);
  const head = at >= 0 ? text.slice(0, at) : text;
  const tail = at >= 0 ? text.slice(at + ALSO.length).trim() : "";
  const picked: string[] = [];
  const leftover: string[] = [];
  for (const raw of head.split(",")) {
    const token = raw.trim().replace(/\.$/, "");
    if (!token) continue;
    const preset = EQUIPMENT_PRESETS.find((p) => p.toLowerCase() === token.toLowerCase());
    if (preset && !picked.includes(preset)) picked.push(preset);
    else leftover.push(token);
  }
  return { picked, other: [...leftover, tail].filter(Boolean).join(", ") };
}

/** The stored string for a set of picks and the Other text. */
export function formatEquipment({ picked, other }: EquipmentChoice): string {
  const presets = EQUIPMENT_PRESETS.filter((p) => picked.includes(p)).join(", ");
  const extra = other.trim();
  if (presets && extra) return `${presets}. ${ALSO} ${extra}`.slice(0, MAX);
  return (presets || extra).slice(0, MAX);
}

/** Tap a preset: Bodyweight only and real equipment exclude each other. */
export function togglePreset(picked: string[], preset: string): string[] {
  if (picked.includes(preset)) return picked.filter((p) => p !== preset);
  if (preset === BODYWEIGHT_ONLY) return [BODYWEIGHT_ONLY];
  return [...picked.filter((p) => p !== BODYWEIGHT_ONLY), preset];
}
