// Basic prompt-injection guard for student free text before it reaches the
// model: strip common injection patterns, cap the length.
export function sanitizeStudentText(str: string = "", max = 300): string {
  return str
    .slice(0, max)
    .replace(/ignore (previous|all|prior|above)/gi, "")
    .replace(/system prompt/gi, "")
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/g, "")
    .trim();
}
