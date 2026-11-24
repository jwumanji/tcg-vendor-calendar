import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  titleId,
  closeLabel,
  close,
  children,
  className = "",
  id,
  initialFocus,
  returnFocus,
}: {
  title: ReactNode;
  titleId: string;
  closeLabel: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  returnFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = returnFocus?.() ?? document.activeElement;
    dialog.showModal();
    initialFocus?.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      const target = trigger?.isConnected ? trigger : returnFocus?.();
      if (target instanceof HTMLElement)
        target.focus({ preventScroll: true });
    };
  }, [initialFocus, returnFocus]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={`score-settings ${className}`}
      aria-labelledby={titleId}
      onCancel={(ev) => {
        ev.preventDefault();
        close();
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          return;
        }
        if (ev.key !== "Tab") return;
        const controls = [...ev.currentTarget.querySelectorAll<HTMLElement>(
          "button:enabled,input:enabled,select:enabled,textarea:enabled,a[href],summary,[tabindex]:not(:disabled)",
        )].filter((control) => control.tabIndex >= 0 && control.getClientRects().length > 0);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="settings-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label={closeLabel}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
