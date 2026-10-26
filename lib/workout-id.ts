import { randomInt } from "crypto";

// Same alphabet as class codes and teacher keys: no 0/O/1/I confusion when a
// student reads a link aloud. 32^8 ≈ 1.1e12 ids; lookups go through Postgres
// by primary key, so guessing is not a practical concern.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const WORKOUT_ID_RE = /^[A-Z2-9]{8}$/;

export function newWorkoutId(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
