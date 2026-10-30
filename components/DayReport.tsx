"use client";

// Today's report for a teacher class: the AI reads the day's anonymous ratings
// and comments and summarizes them. Lives in the class page's Students tab.
import { useState } from "react";
import { apiGenerateReport } from "@/lib/api";
import type { ReportMeta } from "@/lib/types";
import { Alert, BtnSecondary } from "@/components/ui";

export function DayReport({ code }: { code: string }) {
  const [report, setReport] = useState<string | null>(null);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true); setError(""); setReport(null); setMeta(null); setMsg("");
    try {
      const { report: r, meta: m, message } = await apiGenerateReport(code);
      if (!r) setMsg(message || "No reviews yet.");
      else { setReport(r); setMeta(m ?? null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="font-display text-[22px] font-bold uppercase tracking-[1px] mb-3">Today&apos;s Workout Report</div>
      <BtnSecondary onClick={generate} disabled={loading}>{loading ? "Generating…" : "Generate Today's Report"}</BtnSecondary>
      {msg && <div className="text-muted text-[14px] mt-3">{msg}</div>}
      {meta && (
        <div className="flex gap-6 mt-4 mb-2 flex-wrap">
          {[[meta.total, "Responses"], [`${meta.avgRating} / 5`, "Avg Rating"]].map(([val, lbl]) => (
            <div key={lbl}>
              <div className="font-display text-[28px] font-bold text-accent2 leading-none">{val}</div>
              <div className="text-[11px] text-muted uppercase tracking-[0.8px] mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
      )}
      {report && (
        <div className="bg-surface2 border border-border rounded-xl p-[18px] mt-2 text-[14px] leading-[1.7] whitespace-pre-wrap">{report}</div>
      )}
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}
