import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type Notify = (message: string, tone?: Tone) => void;

const ToastContext = createContext<Notify | null>(null);

/**
 * Short confirmations ("PDF saved to ...") in a live region, so screen
 * readers announce them too. Errors stay until dismissed; everything
 * else fades after a few seconds.
 */
export const ToastProvider = ({
  children,
  dismissLabel = "Dismiss",
}: {
  children: ReactNode;
  dismissLabel?: string;
}) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback<Notify>(
    (message, tone = "info") => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-3), { id, message, tone }]);
      if (tone !== "error") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone} panel`}>
            <span data-selectable style={{ flex: 1 }}>
              {t.message}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label={dismissLabel}
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): Notify => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
};
