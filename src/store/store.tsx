import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getStorage, isTauri, StorageError, type StorageAdapter } from "../storage";
import { emptyData, type WolfData } from "../types";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * - loading: reading the data file
 * - ready: normal operation
 * - unreadable: data exists but could not be read; saving is disabled
 *   so the damaged file can never be overwritten by an empty one
 */
export type Phase = "loading" | "ready" | "unreadable";

export interface LoadProblem {
  message: string;
  details: string[];
}

interface StoreValue {
  data: WolfData;
  phase: Phase;
  loadProblem: LoadProblem | null;
  /** One-off message shown after start-up, e.g. "recovered from backup". */
  notice: string | null;
  saveState: SaveState;
  saveError: string | null;
  storage: StorageAdapter;
  running: "desktop" | "browser";

  /**
   * Applies a change. `change` receives the latest data (never a stale
   * render-time copy) and returns the next data, or throws to refuse.
   */
  apply: (change: (current: WolfData) => WolfData) => void;
  /** Replaces everything (backup import). Keeps a snapshot of what was there. */
  replaceAll: (next: WolfData) => Promise<void>;
  /** From the unreadable state: move the bad file aside and start empty. */
  startFresh: () => Promise<void>;
  /** Writes any pending change now. */
  flush: () => Promise<void>;
  dismissNotice: () => void;
  dismissSaveError: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export const SAVE_DEBOUNCE_MS = 400;

export const StoreProvider = ({
  children,
  storage: injected,
}: {
  children: ReactNode;
  /** Tests pass an in-memory adapter. */
  storage?: StorageAdapter;
}) => {
  const storage = useMemo(() => injected ?? getStorage(), [injected]);
  const [data, setData] = useState<WolfData>(emptyData);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // The latest data, readable synchronously. apply() computes against
  // this rather than against the render-time `data`, so two actions in
  // the same frame (a double click on Issue) see each other's result.
  const latest = useRef<WolfData>(data);
  const phaseRef = useRef<Phase>("loading");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);

  const commit = useCallback((next: WolfData) => {
    latest.current = next;
    setData(next);
  }, []);

  /* ── Saving: one write at a time, always of the newest data ── */
  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    // Loops rather than recursing: if something changes while a write is
    // in progress, write again until the file matches what's on screen.
    for (;;) {
      if (phaseRef.current !== "ready") return;
      while (inFlight.current) await inFlight.current;
      if (!dirty.current) return;

      dirty.current = false;
      setSaveState("saving");
      let ok = false;
      const run = (async () => {
        try {
          await storage.save(latest.current);
          ok = true;
          setSaveState("saved");
          setSaveError(null);
        } catch (e) {
          // Stays dirty: the next change, or closing the window, retries.
          dirty.current = true;
          setSaveState("error");
          setSaveError(e instanceof StorageError ? e.message : "Could not save your changes.");
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = run;
      await run;
      if (!ok) return;
    }
  }, [storage]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  /* ── Load once ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await storage.load();
        if (cancelled) return;
        if (result.status !== "empty") commit(result.data);
        if (result.status === "recovered") {
          setNotice(
            `Your data file could not be read, so Wolf opened the most recent backup (${result.source}).` +
              (result.setAside ? ` The damaged file was kept as ${result.setAside}.` : ""),
          );
        } else if (result.status === "ok" && result.warnings.length) {
          setNotice(result.warnings.join(" "));
        }
        phaseRef.current = "ready";
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof StorageError ? e : null;
        setLoadProblem({
          message: err?.message ?? "Wolf could not read your data.",
          details: err?.details ?? [String(e)],
        });
        phaseRef.current = "unreadable";
        setPhase("unreadable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storage, commit]);

  /* ── Never lose the last edit when the window closes ── */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        // Closing waits for this handler, then destroys the window.
        // That needs the core:window:allow-destroy permission.
        unlisten = await getCurrentWindow().onCloseRequested(async () => {
          await flush();
        });
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unlisten?.();
    };
  }, [flush]);

  /* Theme is applied at the document root so CSS variables cascade. */
  useEffect(() => {
    document.documentElement.dataset.theme = data.preferences.theme;
    document.documentElement.lang = data.preferences.language;
  }, [data.preferences.theme, data.preferences.language]);

  const apply = useCallback(
    (change: (current: WolfData) => WolfData) => {
      if (phaseRef.current !== "ready") return;
      const next = change(latest.current);
      if (next === latest.current) return;
      commit(next);
      scheduleSave();
    },
    [commit, scheduleSave],
  );

  const replaceAll = useCallback(
    async (next: WolfData) => {
      if (phaseRef.current === "unreadable") {
        await storage.setAsideUnreadable();
        phaseRef.current = "ready";
        setPhase("ready");
        setLoadProblem(null);
      } else {
        await flush();
        await storage.snapshot(latest.current, "before-import");
      }
      commit(next);
      scheduleSave();
      await flush();
    },
    [storage, flush, commit, scheduleSave],
  );

  const startFresh = useCallback(async () => {
    const where = await storage.setAsideUnreadable();
    commit(emptyData());
    phaseRef.current = "ready";
    setPhase("ready");
    setLoadProblem(null);
    if (where) setNotice(`The unreadable data was kept as ${where}.`);
  }, [storage, commit]);

  const value: StoreValue = {
    data,
    phase,
    loadProblem,
    notice,
    saveState,
    saveError,
    storage,
    running: isTauri() ? "desktop" : "browser",
    apply,
    replaceAll,
    startFresh,
    flush,
    dismissNotice: useCallback(() => setNotice(null), []),
    dismissSaveError: useCallback(() => setSaveError(null), []),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = (): StoreValue => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
};
