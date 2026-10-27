import type { ReactNode } from "react";

// Plain readable typography for the policy pages, in the app's tokens.
export function Prose({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="pb-6">
      <h1 className="font-display text-[42px] font-black uppercase tracking-[-1px] leading-none mb-2">{title}</h1>
      <div className="text-muted text-[13px] mb-8">Last updated {updated}</div>
      <div className="flex flex-col gap-6 text-[15px] leading-[1.65] [&_h2]:font-display [&_h2]:text-[20px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[0.5px] [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1.5 [&_strong]:text-text [&_p]:text-text">
        {children}
      </div>
    </article>
  );
}
