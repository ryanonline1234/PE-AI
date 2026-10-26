// Remembers a teacher's key per class code in this browser, so the teacher's
// own laptop never asks for it again. Browser storage can throw (private
// windows, blocked storage), so every access is guarded.

const PREFIX = "peai.teacherKey.";

export function rememberTeacherKey(code: string, key: string): void {
  try {
    localStorage.setItem(PREFIX + code, key);
  } catch {
    /* storage unavailable — the teacher can still type the key */
  }
}

export function recallTeacherKey(code: string): string {
  try {
    return localStorage.getItem(PREFIX + code) ?? "";
  } catch {
    return "";
  }
}

export function forgetTeacherKey(code: string): void {
  try {
    localStorage.removeItem(PREFIX + code);
  } catch {
    /* ignore */
  }
}
