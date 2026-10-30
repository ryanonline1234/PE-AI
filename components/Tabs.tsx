"use client";

// Section tabs for iPad and computer (768px and up): a tab bar at the top shows
// one section at a time instead of one long scroll. Phones keep every section
// stacked in order, as before (the bar is hidden and all panels show). The open
// tab is kept in the URL (?tab=) so refresh and links land on it.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial! : tabs[0].id);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function pick(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  // Left/right arrows move between tabs, as screen-reader users expect.
  function onKey(e: KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    pick(tabs[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <>
      <div role="tablist" className="hidden md:flex gap-1 border-b border-border mb-6 sticky top-0 z-10 bg-bg overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { buttons.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "px-4 py-3 -mb-px border-b-2 bg-transparent font-display text-[16px] font-bold uppercase tracking-[0.5px] cursor-pointer whitespace-nowrap transition-colors",
              active === t.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <section
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          className={cn("mb-10 md:mb-0", active !== t.id && "md:hidden")}
        >
          {t.content}
        </section>
      ))}
    </>
  );
}
