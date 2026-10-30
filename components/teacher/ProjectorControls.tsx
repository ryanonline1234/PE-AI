"use client";

// Exit and full-screen buttons for projector mode; they fade until the mouse moves.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

export function ProjectorControls({ backHref }: { backHref: string }) {
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    let t = window.setTimeout(() => setIdle(true), 3000);
    const onMove = () => { setIdle(false); window.clearTimeout(t); t = window.setTimeout(() => setIdle(true), 3000); };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(t);
    };
  }, []);

  const btn = "inline-flex items-center gap-1.5 bg-surface2 border border-border text-muted px-4 py-2 rounded-lg text-[14px] font-body no-underline cursor-pointer";
  return (
    <div className={`flex justify-between transition-opacity duration-500 ${idle ? "opacity-0" : "opacity-100"}`}>
      <Link href={backHref} className={btn}><ArrowLeft className="icon" /> Back to class</Link>
      <button
        type="button"
        className={btn}
        onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }}
      >
        {full ? <><Minimize2 className="icon" /> Exit full screen</> : <><Maximize2 className="icon" /> Full screen</>}
      </button>
    </div>
  );
}
