"use client";

// What the AI keeps in mind beyond the settings (docs/03 §7). Two cards, each
// saving its own fields so they can sit in their own tabs:
//   AIBackgroundCard     the class's general background + optional research
//                        (class page; every session uses the current version)
//   SessionSpecificsCard one session's specifics, asked after the background
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { apiResearch, apiSaveBackground, apiUpdateSession } from "@/lib/api";
import { MAX_BACKGROUND, MAX_SOURCES, MAX_SPECIFICS } from "@/lib/class-config";
import type { ClassConfig, PinnedSource } from "@/lib/types";
import { ConsultFlow } from "@/components/ConsultFlow";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle, Field, Textarea, TextInput } from "@/components/ui";
import { cn } from "@/lib/utils";

const sameFinding = (a: PinnedSource, b: PinnedSource) => a.url === b.url && a.takeaway === b.takeaway;
const sameList = (a: PinnedSource[], b: PinnedSource[]) => a.length === b.length && a.every((x, i) => sameFinding(x, b[i]));

/** Save button + state line shared by both cards. */
function SaveRow({ dirty, saving, saved, error, label, onSave }: {
  dirty: boolean; saving: boolean; saved: boolean; error: string; label: string; onSave: () => void;
}) {
  return (
    <>
      <BtnPrimary onClick={onSave} disabled={!dirty || saving}>{saving ? "Saving…" : label}</BtnPrimary>
      <div className="text-[12px] text-muted text-center mt-2 min-h-[18px]">
        {dirty ? "Unsaved changes" : saved ? "✓ Saved. The next workouts use it." : ""}
      </div>
      {error && <Alert type="error">{error}</Alert>}
    </>
  );
}

export function AIBackgroundCard({ code, config }: {
  code: string;
  /** The class's saved settings, background and research. */
  config: ClassConfig;
}) {
  const [savedBackground, setSavedBackground] = useState(config.background ?? "");
  const [savedSources, setSavedSources] = useState<PinnedSource[]>(config.sources ?? []);
  const [background, setBackground] = useState(savedBackground);
  const [pinned, setPinned] = useState<PinnedSource[]>(savedSources);
  const [consulting, setConsulting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = background.trim() !== savedBackground.trim() || !sameList(pinned, savedSources);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      await apiSaveBackground(code, { background, sources: pinned });
      setSavedBackground(background); setSavedSources(pinned); setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
      <Card>
        <CardTitle>Background for the AI</CardTitle>
        <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
          General knowledge the AI keeps in mind for every workout in this class: who the students are, the unit you&apos;re
          in, standing rules. Every session uses it; what&apos;s special about one day goes in that session&apos;s specifics.
        </div>
        <Field label={`Background (${background.length}/${MAX_BACKGROUND})`}>
          <Textarea
            value={background}
            onChange={(v) => setBackground(v.slice(0, MAX_BACKGROUND))}
            placeholder="e.g. Freshman PE, mostly beginners. Volleyball unit through November. Outdoor courts when it's dry. No sprints on the blacktop."
          />
        </Field>
        {consulting ? (
          <ConsultFlow
            audience="background"
            config={{ ...config, background }}
            onUse={(t) => { setBackground(t); setConsulting(false); }}
            onCancel={() => setConsulting(false)}
          />
        ) : (
          <BtnSecondary style={{ marginBottom: 16 }} onClick={() => setConsulting(true)}>✨ Help me write it</BtnSecondary>
        )}
        <SaveRow dirty={dirty} saving={saving} saved={saved} error={error} label="Save background" onSave={save} />
      </Card>

      <Research config={config} pinned={pinned} onPinned={setPinned} />
    </div>
  );
}

/** Research on trusted sites: optional, closed until opened (or until something is pinned). */
function Research({ config, pinned, onPinned }: {
  config: ClassConfig;
  pinned: PinnedSource[];
  onPinned: (next: PinnedSource[]) => void;
}) {
  const [topic, setTopic] = useState("");
  const [findings, setFindings] = useState<PinnedSource[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setSearching(true); setError(""); setFindings(null);
    try {
      setFindings((await apiResearch(topic, config)).findings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSearching(false);
  }

  function togglePin(f: PinnedSource) {
    const on = pinned.some((p) => sameFinding(p, f));
    onPinned(on ? pinned.filter((p) => !sameFinding(p, f)) : [...pinned, f].slice(0, MAX_SOURCES));
  }

  return (
    <details className="group bg-surface border border-border rounded-xl mb-4" open={pinned.length > 0 || undefined}>
      <summary className="list-none cursor-pointer px-6 py-5 flex items-center justify-between gap-3">
        <span>
          <span className="font-display text-[16px] font-bold uppercase tracking-[0.5px] text-muted">Research trusted sites</span>
          <span className="ml-2 text-[11px] font-semibold uppercase tracking-[1px] text-muted border border-border rounded-full px-2 py-0.5">Optional</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-6 pb-6">
        <div className="text-muted text-[13px] leading-[1.5] mb-3">
          Not needed to get good workouts. If you want evidence behind them, this searches NSCA, ACSM, NIH/PubMed, CDC,
          NATA and AAP only (about 30–45 seconds). Pin up to {MAX_SOURCES} findings, then save the background.
        </div>
        <TextInput value={topic} onChange={(v) => setTopic(v.slice(0, 200))} placeholder="e.g. ACL injury prevention for volleyball" className="mb-2.5" />
        <BtnSecondary onClick={search} disabled={searching || !topic.trim()}>
          {searching ? "Searching trusted sites…" : "🔎 Search"}
        </BtnSecondary>
        {error && <Alert type="error">{error}</Alert>}
        {findings && findings.length === 0 && (
          <div className="text-muted text-[14px] mt-3">Nothing on the trusted sites for that. Try different words.</div>
        )}
        {findings && findings.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {findings.map((f) => {
              const on = pinned.some((p) => sameFinding(p, f));
              return (
                <FindingLine key={`${f.url} ${f.takeaway}`} f={f}>
                  <button
                    type="button"
                    onClick={() => togglePin(f)}
                    disabled={!on && pinned.length >= MAX_SOURCES}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px] font-medium cursor-pointer shrink-0 disabled:opacity-45 disabled:cursor-not-allowed",
                      on ? "border-accent2 bg-[rgba(0,229,255,0.1)] text-accent2" : "border-border bg-surface text-muted"
                    )}
                  >
                    {on ? "✓ Pinned" : "+ Pin"}
                  </button>
                </FindingLine>
              );
            })}
          </div>
        )}
        {pinned.length > 0 && (
          <div className="mt-5">
            <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-2">Pinned research</div>
            <div className="flex flex-col gap-2">
              {pinned.map((f) => (
                <FindingLine key={`${f.url} ${f.takeaway}`} f={f}>
                  <button type="button" onClick={() => togglePin(f)} aria-label="Unpin this finding"
                    className="text-muted bg-transparent border-0 cursor-pointer text-[16px] leading-none px-1 shrink-0">×</button>
                </FindingLine>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

export function SessionSpecificsCard({ code, date, config, classConfig }: {
  code: string;
  date: string;
  /** The session's saved settings and specifics. */
  config: ClassConfig;
  /** The class's settings, background and research (shared by every session). */
  classConfig: ClassConfig;
}) {
  const background = (classConfig.background ?? "").trim();
  const [savedSpecifics, setSavedSpecifics] = useState(config.specifics ?? "");
  const [specifics, setSpecifics] = useState(savedSpecifics);
  const [consulting, setConsulting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = specifics.trim() !== savedSpecifics.trim();

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      await apiUpdateSession(code, date, { specifics });
      setSavedSpecifics(specifics); setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
      <Card>
        <CardTitle>Class background</CardTitle>
        {background ? (
          <div className="text-[14px] leading-[1.6] whitespace-pre-wrap mb-3">{background}</div>
        ) : (
          <div className="text-muted text-[14px] leading-[1.6] mb-3">
            No background yet. Adding one (who the students are, the unit) makes every session&apos;s workouts fit better.
          </div>
        )}
        {(classConfig.sources ?? []).length > 0 && (
          <div className="text-muted text-[13px] mb-3">+ {classConfig.sources!.length} pinned research finding{classConfig.sources!.length === 1 ? "" : "s"}</div>
        )}
        <Link href={`/classes/${code}?tab=ai`} className="text-accent text-[14px]">
          {background ? "Edit on the class page →" : "Add it on the class page →"}
        </Link>
      </Card>

      <Card>
        <CardTitle>This session&apos;s specifics</CardTitle>
        <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
          What&apos;s special about this day, on top of the background: the focus, what to avoid, how hard.
        </div>
        <Field label={`Specifics (${specifics.length}/${MAX_SPECIFICS})`}>
          <Textarea
            value={specifics}
            onChange={(v) => setSpecifics(v.slice(0, MAX_SPECIFICS))}
            placeholder="e.g. Approach jumps and blocking footwork. Keep it moderate; they played a match yesterday."
          />
        </Field>
        {consulting ? (
          <ConsultFlow
            audience="session"
            config={{ ...config, background: classConfig.background, sources: classConfig.sources, specifics }}
            onUse={(t) => { setSpecifics(t); setConsulting(false); }}
            onCancel={() => setConsulting(false)}
          />
        ) : (
          <BtnSecondary style={{ marginBottom: 16 }} onClick={() => setConsulting(true)}>✨ Ask me about this session</BtnSecondary>
        )}
        <SaveRow dirty={dirty} saving={saving} saved={saved} error={error} label="Save specifics" onSave={save} />
      </Card>
    </div>
  );
}

function FindingLine({ f, children }: { f: PinnedSource; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-surface2 border border-border rounded-lg px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-[14px] leading-[1.5]">{f.takeaway}</div>
        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent2 text-[12px] break-words">
          {f.title} · {new URL(f.url).hostname.replace(/^www\./, "")}
        </a>
      </div>
      {children}
    </div>
  );
}
