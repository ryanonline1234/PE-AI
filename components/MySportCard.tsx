"use client";

// My sport (docs/03): a student's own sport brief, used in every workout they
// generate, under their teacher's settings. It is stored, so it never holds
// health details: the server drops those sentences and this card says so.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDeleteStudentBrief, apiSaveStudentBrief } from "@/lib/api";
import { MAX_STUDENT_BRIEF } from "@/lib/student-brief";
import { ConsultFlow } from "@/components/ConsultFlow";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle, Textarea } from "@/components/ui";

export function MySportCard({ initialBrief }: { initialBrief: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialBrief);
  const [draft, setDraft] = useState(initialBrief);
  const [editing, setEditing] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function start(withConsult: boolean) {
    setDraft(saved); setEditing(true); setConsulting(withConsult); setNote(""); setError("");
  }

  async function save() {
    setBusy(true); setError(""); setNote("");
    try {
      const r = await apiSaveStudentBrief(draft);
      setSaved(r.brief); setDraft(r.brief); setEditing(false); setConsulting(false);
      if (r.trimmed && r.brief) setNote("We took out anything about injuries or health. Tell us about those in the box each workout instead; they aren't saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("Delete your sport brief? Your workouts stop using it.")) return;
    setBusy(true); setError(""); setNote("");
    try {
      await apiDeleteStudentBrief();
      setSaved(""); setDraft(""); setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardTitle>My sport</CardTitle>

      {!editing && saved && (
        <>
          <div className="text-[15px] leading-[1.55] whitespace-pre-wrap mb-2">{saved}</div>
          <div className="text-muted text-[13px] mb-4">Every workout keeps this in mind, inside what your teacher sets for the day.</div>
          <div className="flex gap-2.5">
            <BtnSecondary style={{ flex: 2 }} onClick={() => start(false)} disabled={busy}>Edit</BtnSecondary>
            <BtnSecondary style={{ flex: 1 }} onClick={remove} disabled={busy}>Delete</BtnSecondary>
          </div>
        </>
      )}

      {!editing && !saved && (
        <>
          <div className="text-[15px] leading-[1.55] mb-4">
            Play a sport? Tell the AI about it and every PE workout builds toward it.
          </div>
          <BtnPrimary onClick={() => start(true)}>✨ Set up my sport</BtnPrimary>
        </>
      )}

      {editing && (
        <>
          {consulting && (
            <ConsultFlow
              audience="student"
              onUse={(b) => { setDraft(b.slice(0, MAX_STUDENT_BRIEF)); setConsulting(false); }}
              onCancel={() => setConsulting(false)}
            />
          )}
          <Textarea
            value={draft}
            onChange={(v) => setDraft(v.slice(0, MAX_STUDENT_BRIEF))}
            placeholder="e.g. Plays JV soccer as a midfielder, in season. Wants more endurance and a quicker first step."
          />
          <div className="text-muted text-[12px] leading-[1.5] mt-1.5 mb-4">
            Don&apos;t put injuries here. This is saved; tell us about injuries in the box each workout instead.
            {" "}{draft.length}/{MAX_STUDENT_BRIEF}
          </div>
          {!consulting && (
            <BtnSecondary style={{ marginBottom: 10 }} onClick={() => setConsulting(true)}>✨ Help me write it</BtnSecondary>
          )}
          <div className="flex gap-2.5">
            <BtnSecondary style={{ flex: 1 }} onClick={() => { setEditing(false); setConsulting(false); setDraft(saved); }} disabled={busy}>
              Cancel
            </BtnSecondary>
            <BtnPrimary style={{ flex: 2 }} onClick={save} disabled={busy || !draft.trim()}>{busy ? "Saving…" : "Save"}</BtnPrimary>
          </div>
        </>
      )}

      {note && <Alert type="success">{note}</Alert>}
      {error && <Alert type="error">{error}</Alert>}
    </Card>
  );
}
