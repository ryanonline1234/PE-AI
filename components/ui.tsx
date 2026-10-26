"use client";

// Shared UI primitives for PE.AI. Extracted from app/page.tsx so the shared
// workout page (/w/[id]) renders with the same look. Styling unchanged.
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Chip<T extends string>({ label, value, current, onChange }: {
  label: string;
  value: T;
  current: T;
  onChange: (value: T) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "rounded-lg border px-4 py-2 font-body text-[14px] font-medium cursor-pointer transition-all duration-150",
        active
          ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent"
          : "border-border bg-surface2 text-muted"
      )}
    >
      {label}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={cn("bg-surface border border-border rounded-xl p-6 mb-4", className)} style={style}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="font-display text-[16px] font-bold uppercase tracking-[0.5px] text-muted mb-[18px]">
      {children}
    </div>
  );
}

/**
 * Page chrome: wordmark + optional back control. `onBack` renders a button
 * (in-app navigation); `backHref` renders a link (the shared workout page).
 */
export function Layout({ onBack, backHref, backLabel = "← Back", children }: {
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const backClass = "no-print bg-surface2 border border-border text-muted px-4 py-2 rounded-lg cursor-pointer text-[14px] font-body no-underline";
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-[60px]">
      {/* Top bar */}
      <div className="w-full max-w-[740px] flex items-center justify-between pt-5 pb-4 border-b border-border mb-9">
        <Link href="/" className="font-display text-[28px] font-black tracking-[-0.5px] text-text no-underline">
          PE<span className="text-accent">.</span>AI
        </Link>
        {onBack && (
          <button onClick={onBack} className={backClass}>{backLabel}</button>
        )}
        {!onBack && backHref && (
          <a href={backHref} className={backClass}>{backLabel}</a>
        )}
      </div>

      <div className="w-full max-w-[740px]">
        {children}
      </div>
    </div>
  );
}

export function BtnPrimary({ children, onClick, disabled, style }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-accent text-bg border-0 rounded-lg px-7 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 transition-[opacity,transform] duration-200"
      style={style}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({ children, onClick, disabled, style }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 transition-all duration-200"
      style={style}
    >
      {children}
    </button>
  );
}

export function TextInput({ value, onChange, placeholder, style, maxLength, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  maxLength?: number;
  className?: string;
  // call sites pass onBlur (and className) but the input never wires them —
  // preserving the original no-op behavior.
  onBlur?: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none",
        className
      )}
      style={style}
    />
  );
}

export function Textarea({ value, onChange, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none resize-y min-h-[80px]"
    />
  );
}

export function Alert({ type, children }: { type: "error" | "success"; children: ReactNode }) {
  const styles: Record<"error" | "success", string> = {
    error:   "bg-[rgba(255,77,109,0.08)] border-[rgba(255,77,109,0.3)] text-danger",
    success: "bg-[rgba(200,255,0,0.08)] border-[rgba(200,255,0,0.25)] text-accent",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-[13px] text-[14px] mt-3", styles[type])}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Building your workout…" }: { label?: string }) {
  return (
    <div className="text-center px-5 py-[60px]">
      <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-5 animate-[pe-spin_0.8s_linear_infinite]" />
      <div className="font-display text-[22px] font-bold uppercase tracking-[1px] text-muted">
        {label}
      </div>
    </div>
  );
}

export function youtubeSearchUrl(exerciseName: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(exerciseName + " exercise how to")}`;
}
