"use client";

// The workout view: hero, warm-up, main exercises, cool-down, actions
// (Go mode, share, print, regenerate) and the review form. Used by the main
// app while a workout streams in, and by /w/[id] for a saved one.
import { useEffect, useRef, useState } from "react";
import { apiSubmitReview } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Workout } from "@/lib/types";
import { Alert, BtnPrimary, BtnSecondary, Card, Field, Textarea, youtubeSearchUrl } from "@/components/ui";
import { GoMode } from "@/components/GoMode";

export function WorkoutScreen({
  workout,
  code,
  studentName,
  shareId,
  streaming = false,
  onRegenerate,
  makeOwnHref,
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
}) {
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState("");
  const [goMode, setGoMode] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shareState === "idle") return;
    const t = setTimeout(() => setShareState("idle"), 1800);
    return () => clearTimeout(t);
  }, [shareState]);

  async function submitReview() {
    if (!reviewRating) return;
    setReviewLoading(true); setReviewError("");
    try {
      await apiSubmitReview({ code, studentName, rating: reviewRating, comment: reviewComment });
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
      } catch {
        // Dismissed or unsupported for this payload: fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      window.prompt("Copy this link:", url);
    }
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

  return (
    <>
      {goMode && <GoMode workout={workout} onClose={() => setGoMode(false)} onFinish={finishGoMode} />}

      {/* Hero */}
      <div className="print-card bg-[linear-gradient(135deg,#13131c_0%,#1a1a2e_100%)] border border-border border-t-[3px] border-t-accent rounded-xl p-7 mb-4">
        <div className="text-[11px] font-semibold tracking-[2px] uppercase text-accent mb-1.5">
          {studentName ? `${studentName}'s Workout` : "Your Workout"}
        </div>
        {workout.title ? (
          <div className="font-display text-[40px] font-black uppercase leading-none mb-[18px]">
            {workout.title}
          </div>
        ) : (
          <div className="font-display text-[40px] font-black uppercase leading-none mb-[18px] text-muted animate-pulse">
            Building…
          </div>
        )}
        <div className="flex gap-7 flex-wrap">
          {[
            [workout.totalCalories || "–", "Calories"],
            [workout.totalDuration ? `${workout.totalDuration}m` : "–", "Duration"],
            [workout.exercises.length, "Exercises"],
          ].map(([num, lbl]) => (
            <div key={lbl}>
              <div className="font-display text-[34px] font-bold text-accent2 leading-none">{num}</div>
              <div className="text-[11px] text-muted uppercase tracking-[0.8px] mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Warm-up */}
      {workout.warmup.length > 0 && (
        <Card>
          <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
            🔥 Warm-Up
          </div>
          {workout.warmup.map((w, i) => (
            <div key={i} className={cn("flex justify-between py-[11px]", i < workout.warmup.length - 1 ? "border-b border-border" : "")}>
              <div>
                <div className="font-medium text-[15px]">{w.name}</div>
                <div className="text-[13px] text-muted mt-0.5">{w.description}</div>
              </div>
              <div className="text-[14px] text-muted shrink-0 ml-3">{w.duration}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Main exercises */}
      {(workout.exercises.length > 0 || !streaming) && (
        <Card>
          <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
            💪 Main Workout
          </div>
          {workout.exercises.map((ex, i) => {
            const isExpanded = expandedExercise === i;
            return (
              <div
                key={i}
                onClick={() => setExpandedExercise(prev => (prev === i ? null : i))}
                className={cn(
                  "bg-surface2 border border-border rounded-[10px] p-4 mb-2.5 cursor-pointer flex flex-col gap-3 transition-shadow duration-200",
                  isExpanded ? "shadow-[0_9px_18px_rgba(0,0,0,0.08)]" : "shadow-none"
                )}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[16px] mb-1">{ex.name}</div>
                    <div className="text-muted text-[13px] leading-[1.4]">{ex.tip}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-[16px] font-bold text-accent whitespace-nowrap">
                      {ex.sets} × {ex.reps}
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">Rest {ex.rest}</div>
                    <div className="text-[12px] text-accent2 mt-0.5">{ex.calories} kcal</div>
                  </div>
                  <div className={cn("text-muted transition-transform duration-[250ms]", isExpanded ? "rotate-180" : "rotate-0")}>
                    ▾
                  </div>
                </div>

                <div className={cn("overflow-hidden transition-[max-height] duration-[250ms] border-t border-border", isExpanded ? "max-h-[240px] pt-3" : "max-h-0 pt-0")}>
                  {isExpanded && ex.howTo && ex.howTo.length > 0 && (
                    <>
                      <div className="text-[12px] font-bold tracking-[1px] text-muted mb-2">
                        HOW TO DO IT
                      </div>
                      <ol className="pl-5 mb-2 list-decimal">
                        {ex.howTo.map((step, idx) => (
                          <li key={idx} className="text-[13px] mb-1">{step}</li>
                        ))}
                      </ol>
                    </>
                  )}

                  {isExpanded && (
                    <a
                      href={youtubeSearchUrl(ex.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-accent font-bold no-underline"
                      onClick={e => e.stopPropagation()}
                    >
                      Watch on YouTube ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Cool-down */}
      {workout.cooldown.length > 0 && (
        <Card>
          <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
            🧘 Cool-Down
          </div>
          {workout.cooldown.map((w, i) => (
            <div key={i} className={cn("flex justify-between py-[11px]", i < workout.cooldown.length - 1 ? "border-b border-border" : "")}>
              <div>
                <div className="font-medium text-[15px]">{w.name}</div>
                <div className="text-[13px] text-muted mt-0.5">{w.description}</div>
              </div>
              <div className="text-[14px] text-muted shrink-0 ml-3">{w.duration}</div>
            </div>
          ))}
        </Card>
      )}

      {streaming && (
        <div className="no-print flex items-center gap-3 text-muted text-[14px] px-1 py-2 mb-2">
          <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-[pe-spin_0.8s_linear_infinite]" />
          {streamingLabel}
        </div>
      )}

      {!streaming && (
        <>
          <div className="no-print mt-2">
            <BtnPrimary onClick={() => setGoMode(true)} disabled={workout.exercises.length === 0}>
              ▶ Start Workout
            </BtnPrimary>
          </div>

          {showRegeneratePanel && onRegenerate && (
            <div className="no-print bg-surface border border-border rounded-xl p-[18px] mt-3">
              <div className="text-[13px] font-semibold mb-2.5">What would you like to improve or add?</div>
              <Textarea
                value={regenerateFeedback}
                onChange={v => setRegenerateFeedback(v.slice(0, 300))}
                placeholder="e.g. More core exercises, less running, add stretching at the end…"
              />
              <div className="flex gap-2.5 mt-3">
                <BtnSecondary style={{ flex: 1 }} onClick={() => setShowRegeneratePanel(false)}>Cancel</BtnSecondary>
                <BtnPrimary style={{ flex: 2 }} onClick={() => onRegenerate(regenerateFeedback)}>
                  ⚡ Regenerate
                </BtnPrimary>
              </div>
            </div>
          )}

          <div className="no-print flex gap-2.5 mt-3">
            {onRegenerate ? (
              <BtnSecondary style={{ flex: 1 }} onClick={() => setShowRegeneratePanel(v => !v)}>
                ↩ Regenerate
              </BtnSecondary>
            ) : makeOwnHref ? (
              <a
                href={makeOwnHref}
                className="flex-1 bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium text-center no-underline"
              >
                ⚡ Make my own
              </a>
            ) : null}
            <BtnSecondary style={{ flex: 1 }} onClick={share} disabled={!shareId}>
              {shareState === "copied" ? "✓ Link copied" : shareState === "shared" ? "✓ Shared" : "↗ Share"}
            </BtnSecondary>
            <BtnSecondary style={{ flex: 1 }} onClick={() => window.print()}>
              🖨 Print
            </BtnSecondary>
          </div>

          {shareId && (
            <div className="no-print text-[12px] text-muted mt-2 text-center">
              Saved — reopen or share anytime at <span className="text-text">/w/{shareId}</span>
            </div>
          )}

          {/* Review section */}
          <div ref={reviewRef} className="no-print bg-surface border border-border rounded-xl p-5 mt-4 scroll-mt-4">
            <div className="font-display text-[18px] font-bold uppercase tracking-[1px] mb-3.5">
              Rate Your Workout
            </div>

            {reviewSubmitted ? (
              <div className="text-accent font-semibold text-[15px] text-center py-2">
                Thanks for your feedback!
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 mb-4">
                  {[1,2,3,4,5].map(n => (
                    <span
                      key={n}
                      onClick={() => setReviewRating(n)}
                      onMouseEnter={() => setReviewHover(n)}
                      onMouseLeave={() => setReviewHover(0)}
                      className={cn(
                        "text-[36px] cursor-pointer transition-colors duration-100 select-none",
                        n <= (reviewHover || reviewRating) ? "text-accent" : "text-border"
                      )}
                    >
                      ★
                    </span>
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
                  {reviewLoading ? "Submitting…" : "Submit Review"}
                </BtnPrimary>
                {reviewError && <Alert type="error">{reviewError}</Alert>}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
