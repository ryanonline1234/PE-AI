"use client";

// In-page dialogs in place of the browser's confirm()/prompt() boxes (docs/04).
// Built on <dialog>.showModal(): focus moves in and stays in, Escape closes, and
// the page behind can't be clicked. Buttons always read Cancel, then the action.
// Rendered into <body> (a portal): a dialog opened by an editor in a hidden tab
// would otherwise be invisible yet still block the page (display:none ancestor).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Dialog({ title, children, onClose, actions }: {
  title: string;
  children?: ReactNode;
  /** Escape, a click on the backdrop, or Cancel. */
  onClose: () => void;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto w-[calc(100%-32px)] max-w-[440px] bg-surface text-text text-left border border-border rounded-xl p-0 backdrop:bg-[rgba(5,5,10,0.72)]"
    >
      <div className="p-6">
        <div id="dialog-title" className="t-card mb-2">{title}</div>
        {children && <div className="text-[14px] leading-[1.55] text-muted">{children}</div>}
        <div className="flex justify-end gap-2.5 mt-6">{actions}</div>
      </div>
    </dialog>,
    document.body
  );
}

const btn = "rounded-lg px-4 py-2.5 font-body text-[14px] font-semibold cursor-pointer border";
export const dialogCancel = cn(btn, "bg-surface2 text-text border-border");
export const dialogConfirm = (danger?: boolean) =>
  cn(btn, danger ? "bg-danger text-bg border-danger" : "bg-accent text-bg border-accent");

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** The action's name, e.g. "Delete preset". */
  confirmLabel: string;
  /** Deleting or overwriting something: the button turns red. */
  danger?: boolean;
}

/**
 * `const [confirm, confirmDialog] = useConfirm();` then render `{confirmDialog}`
 * and `if (!(await confirm({...}))) return;` where window.confirm used to be.
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    []
  );
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null); };
  const dialog = pending && (
    <Dialog
      title={pending.title}
      onClose={() => close(false)}
      actions={
        <>
          {/* Focus starts on the safe choice when the action destroys something. */}
          <button type="button" className={dialogCancel} onClick={() => close(false)} autoFocus={pending.danger}>Cancel</button>
          <button type="button" className={dialogConfirm(pending.danger)} onClick={() => close(true)} autoFocus={!pending.danger}>
            {pending.confirmLabel}
          </button>
        </>
      }
    >
      {pending.body}
    </Dialog>
  );
  return [confirm, dialog] as const;
}
