"use client";

// Exit and full-screen buttons for projector mode; they fade until the mouse moves.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

export function ProjectorControls({ backHref }: { backHref: string }) {
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  // iPhone Safari has no page full screen; hide the button there.
  const [canFull] = useState(() => typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function");

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
    <div className={`flex justify-between transition-opacity duration-500 focus-within:opacity-100 ${idle ? "opacity-0" : "opacity-100"}`}>
      <Link href={backHref} className={btn}><ArrowLeft className="icon" /> Back to class</Link>
      {canFull && (
        <button
          type="button"
          className={btn}
          onClick={() => {
            const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
            p.catch(() => { /* refused (permissions, iframe): the page still works windowed */ });
          }}
        >
          {full ? <><Minimize2 className="icon" /> Exit full screen</> : <><Maximize2 className="icon" /> Full screen</>}
        </button>
      )}
    </div>
  );
}
