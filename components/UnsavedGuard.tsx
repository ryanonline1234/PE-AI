"use client";

// Warn before leaving a page with unsaved edits (docs/04 T5): the browser's
// own prompt on reload or close, and an in-page dialog for links inside the
// app. The class page's tabs keep their panels mounted, so switching tabs keeps
// edits and needs no warning. The browser's Back button can't be intercepted
// in the App Router and isn't covered.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, dialogCancel, dialogConfirm } from "@/components/Dialog";

/** Call with whether this component has unsaved edits; render what it returns. */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    // Capture phase on document runs before Next's <Link> handler. When two
    // editors are dirty, the first one asks and the rest stand down.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // a full page load: the browser's prompt covers it
      // Same page with other ?week=/?tab=: a soft navigation keeps every editor and its edits.
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return pendingHref && (
    <Dialog
      title="Leave without saving?"
      onClose={() => setPendingHref(null)}
      actions={
        <>
          <button type="button" className={dialogCancel} onClick={() => setPendingHref(null)} autoFocus>Stay</button>
          <button
            type="button"
            className={dialogConfirm(true)}
            onClick={() => { const href = pendingHref; setPendingHref(null); router.push(href); }}
          >
            Leave
          </button>
        </>
      }
    >
      Your changes on this page haven&apos;t been saved.
    </Dialog>
  );
}
