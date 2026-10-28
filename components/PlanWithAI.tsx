"use client";

// Plan with AI (docs/03): the brief every workout follows, the sport consult
// that drafts it, and research on trusted sites whose findings the teacher can
// pin. Teacher classes only (default settings and sessions). Edits land in the
// settings being edited and save with them.
import { useState, type ReactNode } from "react";
import { apiResearch } from "@/lib/api";
import { MAX_BRIEF, MAX_SOURCES } from "@/lib/class-config";
import type { ClassConfig, PinnedSource } from "@/lib/types";
import { ConsultFlow } from "@/components/ConsultFlow";
import { Alert, BtnSecondary, Card, CardTitle, Field, Textarea, TextInput } from "@/components/ui";
import { cn } from "@/lib/utils";

const sameFinding = (a: PinnedSource, b: PinnedSource) => a.url === b.url && a.takeaway === b.takeaway;

export function PlanWithAI({ config, onChange, sessionDate }: {
  config: ClassConfig;
  onChange: (patch: Pick<ClassConfig, "brief"> | Pick<ClassConfig, "sources">) => void;
  sessionDate?: string;
}) {
  const brief = config.brief ?? "";
  const pinned = config.sources ?? [];
  const [consulting, setConsulting] = useState(false);
  const [topic, setTopic] = useState("");
  const [findings, setFindings] = useState<PinnedSource[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  async function research() {
    setSearching(true); setResearchError(""); setFindings(null);
    try {
      const r = await apiResearch(topic, config);
      setFindings(r.findings);
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : String(e));
    }
    setSearching(false);
  }

  function togglePin(f: PinnedSource) {
    const on = pinned.some((p) => sameFinding(p, f));
    onChange({ sources: on ? pinned.filter((p) => !sameFinding(p, f)) : [...pinned, f].slice(0, MAX_SOURCES) });
  }

  return (
    <Card>
      <CardTitle>Plan with AI</CardTitle>
      <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
        A short brief every workout {sessionDate ? "that day" : "on a day without a session"} builds around.
        Write it yourself, or let the AI ask a few questions and draft it.
      </div>

      <Field label={`Brief (${brief.length}/${MAX_BRIEF})`}>
        <Textarea
          value={brief}
          onChange={(v) => onChange({ brief: v.slice(0, MAX_BRIEF) })}
          placeholder="e.g. Volleyball unit, week 2. Build approach-jump power and soft two-foot landings. Shoulder prep before any overhead work. Keep sprints short; moderate overall."
        />
      </Field>
      {consulting ? (
        <ConsultFlow
          audience="session"
          config={config}
          onUse={(b) => { onChange({ brief: b }); setConsulting(false); }}
          onCancel={() => setConsulting(false)}
        />
      ) : (
        <BtnSecondary style={{ marginBottom: 20 }} onClick={() => setConsulting(true)}>✨ Help me write it</BtnSecondary>
      )}

      <Field label="Research trusted sites">
        <div className="text-muted text-[13px] leading-[1.5] mb-2.5">
          Searches NSCA, ACSM, NIH/PubMed, CDC, NATA and AAP only, and takes about 30–45 seconds. Pin the findings you
          want the workouts to use (up to {MAX_SOURCES}).
        </div>
        <TextInput
          value={topic}
          onChange={(v) => setTopic(v.slice(0, 200))}
          placeholder="e.g. ACL injury prevention for volleyball"
          className="mb-2.5"
        />
        <BtnSecondary onClick={research} disabled={searching || !topic.trim()}>
          {searching ? "Searching trusted sites…" : "🔎 Search"}
        </BtnSecondary>
        {researchError && <Alert type="error">{researchError}</Alert>}
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
      </Field>

      {pinned.length > 0 && (
        <Field label="Pinned research">
          <div className="flex flex-col gap-2">
            {pinned.map((f) => (
              <FindingLine key={`${f.url} ${f.takeaway}`} f={f}>
                <button
                  type="button"
                  onClick={() => togglePin(f)}
                  aria-label="Unpin this finding"
                  className="text-muted bg-transparent border-0 cursor-pointer text-[16px] leading-none px-1 shrink-0"
                >
                  ×
                </button>
              </FindingLine>
            ))}
          </div>
        </Field>
      )}
    </Card>
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
