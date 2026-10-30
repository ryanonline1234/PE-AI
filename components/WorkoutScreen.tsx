"use client";

// The workout view (docs/04 S1, S6): a compact hero, then warm-up, main
// workout and cool-down as tight rows that open for the tip, the how-to steps
// and a demo link, and a bar pinned to the bottom with Start and a ⋯ menu
// (change it, share, print). The review form sits at the end. Used while a
// workout streams in, by /w/[id] for a saved one, and as the teacher's sample
// (variant "preview": the workout only, no bar or review).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, CirclePlay, Dumbbell, Ellipsis, Flame, Play, Printer, RotateCcw, Share2, Star, Wind, Zap } from "lucide-react";
import { apiSubmitReview } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Workout } from "@/lib/types";
import { Alert, BtnPrimary, BtnSecondary, Field, Textarea, youtubeSearchUrl } from "@/components/ui";
import { Dialog, dialogConfirm } from "@/components/Dialog";
import { GoMode } from "@/components/GoMode";

export function WorkoutScreen({
  workout,
  code,
  studentName,
  shareId,
  streaming = false,
  onRegenerate,
  makeOwnHref,
  variant = "full",
}: {
  workout: Workout;
  code: string;
  studentName: string;
  /** Null until the server has saved the workout. */
  shareId: string | null;
  streaming?: boolean;
  /** Present in the main app; absent on the shared page. */
  onRegenerate?: (feedback: string) => void;
  /** Shown on the shared page instead of Regenerate. */
  makeOwnHref?: string;
  /** "preview": the teacher's sample — workout only, no actions or review. */
  variant?: "full" | "preview";
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState("");
  const [goMode, setGoMode] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const [copyUrl, setCopyUrl] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);
  const regenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shareState === "idle") return;
    const t = setTimeout(() => setShareState("idle"), 1800);
    return () => clearTimeout(t);
  }, [shareState]);

  function toggle(key: string) {
    setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  async function submitReview() {
    if (!reviewRating) return;
    setReviewLoading(true); setReviewError("");
    try {
      await apiSubmitReview({ code, rating: reviewRating, comment: reviewComment, workoutId: shareId });
      setReviewSubmitted(true);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
    }
    setReviewLoading(false);
  }

  async function share() {
    if (!shareId) return;
    const url = `${window.location.origin}/w/${shareId}`;
    const title = `${workout.title} — PE.AI`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setShareState("shared");
        return;
      } catch (e) {
        // Closing the share sheet is the student's choice, not a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Unsupported for this payload: fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setCopyUrl(url);
    }
  }

  function openRegenerate() {
    setShowRegeneratePanel(true);
    setTimeout(() => regenRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  function finishGoMode() {
    setGoMode(false);
    // Land the student on the rating card.
    setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const streamingLabel = !workout.title
    ? "Building your workout…"
    : workout.exercises.length === 0
      ? "Warming up…"
      : workout.cooldown.length === 0
        ? "Writing the main workout…"
        : "Finishing the cool-down…";
  const full = variant === "full";

  return (
    <>
      {goMode && <GoMode workout={workout} onClose={() => setGoMode(false)} onFinish={finishGoMode} />}
      {copyUrl && (
        <Dialog
          title="Copy this link"
          onClose={() => setCopyUrl(null)}
          actions={<button type="button" className={dialogConfirm()} onClick={() => setCopyUrl(null)}>Done</button>}
        >
          <input
            readOnly
            value={copyUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full mt-2 bg-surface2 border border-border rounded-lg text-text text-[14px] px-3 py-2.5 outline-none"
            aria-label="Workout link"
          />
        </Dialog>
      )}

      {/* Regeneration note: what the AI changed and why */}
      {workout.note && (
        <div className="bg-surface border border-border border-l-[3px] border-l-accent2 rounded-xl px-5 py-4 mb-3">
          <div className="t-eyebrow text-accent2 mb-1">What I changed</div>
          <div className="text-[15px] leading-[1.55]">{workout.note}</div>
        </div>
      )}

      {/* Hero */}
      <div className="print-card bg-[linear-gradient(135deg,#13131c_0%,#1a1a2e_100%)] border border-border border-t-[3px] border-t-accent rounded-xl px-5 py-5 mb-3">
        <div className="t-eyebrow text-accent mb-1.5">
          {variant === "preview" ? "Sample student" : studentName ? `${studentName}'s workout` : "Your workout"}
        </div>
        <div className={cn("font-display text-[clamp(30px,8vw,40px)] font-black uppercase leading-none mb-4", !workout.title && "text-muted animate-pulse")}>
          {workout.title || "Building…"}
        </div>
        <div className="flex gap-7 flex-wrap">
          {[
            // An estimate, not a target (DECISIONS 2026-10-28).
            [workout.totalCalories ? `≈${workout.totalCalories}` : "–", "Est. kcal"],
            [workout.totalDuration ? `${workout.totalDuration}m` : "–", "Duration"],
            [workout.exercises.length, "Exercises"],
          ].map(([num, lbl]) => (
            <div key={lbl}>
              <div className="font-display text-[28px] font-bold text-accent2 leading-none">{num}</div>
              <div className="text-[12px] text-muted mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {workout.warmup.length > 0 && (
        <Section icon={<Flame className="icon" />} title="Warm-up">
          {workout.warmup.map((w, i) => (
            <Row key={i} name={w.name} right={<span className="text-muted">{w.duration}</span>} open={open.has(`w${i}`)} onToggle={() => toggle(`w${i}`)}>
              <div className="text-[14px] text-muted leading-[1.5]">{w.description}</div>
            </Row>
          ))}
        </Section>
      )}

      {(workout.exercises.length > 0 || !streaming) && (
        <Section icon={<Dumbbell className="icon" />} title="Main workout">
          {workout.exercises.map((ex, i) => (
            <Row
              key={i}
              name={ex.name}
              right={
                <span className="text-right">
                  <span className="block font-display text-[17px] font-bold text-accent whitespace-nowrap leading-tight">{ex.sets} × {ex.reps}</span>
                  <span className="block text-[12px] text-muted">rest {ex.rest}</span>
                </span>
              }
              open={open.has(`e${i}`)}
              onToggle={() => toggle(`e${i}`)}
            >
              {ex.tip && <div className="text-[14px] leading-[1.5] mb-3">{ex.tip}</div>}
              {ex.howTo && ex.howTo.length > 0 && (
                <>
                  <div className="t-label mb-1.5">How to do it</div>
                  <ol className="pl-5 mb-3 list-decimal text-[14px] leading-[1.5]">
                    {ex.howTo.map((step, idx) => <li key={idx} className="mb-1">{step}</li>)}
                  </ol>
                </>
              )}
              <a
                href={youtubeSearchUrl(ex.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="no-print inline-flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2 text-[13px] font-semibold text-accent no-underline"
              >
                <CirclePlay className="icon" /> Watch a demo
              </a>
            </Row>
          ))}
        </Section>
      )}

      {workout.cooldown.length > 0 && (
        <Section icon={<Wind className="icon" />} title="Cool-down">
          {workout.cooldown.map((w, i) => (
            <Row key={i} name={w.name} right={<span className="text-muted">{w.duration}</span>} open={open.has(`c${i}`)} onToggle={() => toggle(`c${i}`)}>
              <div className="text-[14px] text-muted leading-[1.5]">{w.description}</div>
            </Row>
          ))}
        </Section>
      )}

      {streaming && (
        <div className="no-print flex items-center gap-3 text-muted text-[14px] px-1 py-2 mb-2">
          <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-[pe-spin_0.8s_linear_infinite]" />
          {streamingLabel}
        </div>
      )}

      {!streaming && full && (
        <>
          {showRegeneratePanel && onRegenerate && (
            <div ref={regenRef} className="no-print bg-surface border border-border rounded-xl p-[18px] mt-3">
              <div className="text-[14px] font-semibold mb-2.5">What would you like to change?</div>
              <Textarea
                value={regenerateFeedback}
                onChange={v => setRegenerateFeedback(v.slice(0, 300))}
                placeholder="e.g. More core exercises, less running, add stretching at the end…"
              />
              <div className="flex gap-2.5 mt-3">
                <BtnSecondary style={{ flex: 1 }} onClick={() => setShowRegeneratePanel(false)}>Cancel</BtnSecondary>
                <BtnPrimary style={{ flex: 2 }} onClick={() => onRegenerate(regenerateFeedback)} disabled={!regenerateFeedback.trim()}>
                  <Zap className="icon" /> Regenerate
                </BtnPrimary>
              </div>
            </div>
          )}

          {shareId && (
            <div className="no-print text-[12px] text-muted mt-3 text-center">
              Saved. Reopen or share it anytime at <span className="text-text">/w/{shareId}</span>
            </div>
          )}

          {/* Review section */}
          <div ref={reviewRef} className="no-print bg-surface border border-border rounded-xl p-5 mt-4 scroll-mt-4">
            <h2 className="t-card mb-3">Rate your workout</h2>

            {reviewSubmitted ? (
              <div className="text-accent font-semibold text-[15px] text-center py-2">
                Thanks for your feedback!
              </div>
            ) : (
              <>
                <div className="flex gap-1 mb-4" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setReviewHover(0)}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={reviewRating === n}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      onClick={() => setReviewRating(n)}
                      onMouseEnter={() => setReviewHover(n)}
                      className="bg-transparent border-0 p-1 cursor-pointer"
                    >
                      <Star className={cn("w-9 h-9 transition-colors duration-100", n <= (reviewHover || reviewRating) ? "text-accent fill-current" : "text-border")} />
                    </button>
                  ))}
                </div>

                <Field label="Comments (optional)">
                  <Textarea
                    value={reviewComment}
                    onChange={v => setReviewComment(v.slice(0, 500))}
                    placeholder="What did you enjoy? What was too hard or too easy?"
                  />
                </Field>

                <BtnPrimary
                  onClick={submitReview}
                  disabled={!reviewRating || reviewLoading}
                  style={{ marginTop: 12 }}
                >
                  {reviewLoading ? "Submitting…" : "Submit review"}
                </BtnPrimary>
                {reviewError && <Alert type="error">{reviewError}</Alert>}
              </>
            )}
          </div>
        </>
      )}

      {full && (
        <StartBar
          ready={!streaming && workout.exercises.length > 0}
          onStart={() => setGoMode(true)}
          shareLabel={shareState === "copied" ? "Link copied" : shareState === "shared" ? "Shared" : null}
          items={[
            onRegenerate
              ? { label: "Change this workout", icon: <RotateCcw className="icon" />, onSelect: openRegenerate, disabled: streaming }
              : makeOwnHref
                ? { label: "Make my own", icon: <Zap className="icon" />, href: makeOwnHref }
                : null,
            { label: "Share", icon: <Share2 className="icon" />, onSelect: share, disabled: !shareId },
            { label: "Print", icon: <Printer className="icon" />, onSelect: () => window.print(), disabled: streaming },
          ]}
        />
      )}
    </>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 pt-3.5 pb-1.5 mb-3">
      <h2 className="flex items-center gap-2 t-label pb-2 border-b border-border">{icon}{title}</h2>
      <div>{children}</div>
    </div>
  );
}

/** One line of the workout; tap to open the details. Print shows every detail. */
function Row({ name, right, open, onToggle, children }: {
  name: string;
  right: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0 print:break-inside-avoid">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-3 bg-transparent border-0 text-left text-text cursor-pointer font-body"
      >
        <span className="font-semibold text-[15px] leading-[1.3] min-w-0">{name}</span>
        <span className="flex items-center gap-2 shrink-0 text-[14px]">
          {right}
          <ChevronDown className={cn("no-print icon text-muted transition-transform duration-200", open && "rotate-180")} />
        </span>
      </button>
      <div className={cn("pb-3.5", open ? "block" : "hidden print:block")}>{children}</div>
    </div>
  );
}

type MenuItem = { label: string; icon: ReactNode; disabled?: boolean } & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

/** Pinned to the bottom of the screen: Start, and a ⋯ menu for everything else. */
function StartBar({ ready, onStart, items, shareLabel }: {
  ready: boolean;
  onStart: () => void;
  items: (MenuItem | null)[];
  /** Brief confirmation after sharing, shown above the bar. */
  shareLabel: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Room at the bottom of the page so the bar never covers the last card or the footer.
  useEffect(() => {
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "88px";
    return () => { document.body.style.paddingBottom = prev; };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const itemClass = "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[15px] text-text bg-transparent border-0 no-underline cursor-pointer hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed font-body";
  return (
    <>
      <div className="no-print fixed inset-x-0 bottom-0 z-40 bg-[rgba(10,10,15,0.94)] backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div ref={wrapRef} className="relative max-w-[740px] mx-auto px-4 py-3 flex gap-2.5">
          <div role="status" className={shareLabel ? "absolute left-4 bottom-[calc(100%+8px)] bg-surface border border-border rounded-full px-3.5 py-1.5 text-[13px] text-accent" : "sr-only"}>
            {shareLabel ?? ""}
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!ready}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-bg border-0 rounded-lg px-6 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Play className="icon fill-current" /> {ready ? "Start workout" : "Building…"}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-controls="workout-actions"
            className="w-[56px] inline-flex items-center justify-center bg-surface2 border border-border rounded-lg text-text cursor-pointer"
          >
            <Ellipsis className="w-6 h-6" />
          </button>
          {menuOpen && (
            <div id="workout-actions" className="absolute right-4 bottom-[calc(100%+8px)] w-[230px] bg-surface border border-border rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              {items.filter((x): x is MenuItem => x !== null).map((item) =>
                item.href ? (
                  <a key={item.label} href={item.href} className={itemClass}>{item.icon}{item.label}</a>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    className={itemClass}
                    onClick={() => { setMenuOpen(false); item.onSelect?.(); }}
                  >
                    {item.icon}{item.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
