"use client";

/**
 * Global assistant state — shared between the floating launcher (mounted
 * once in the root layout) and arbitrary pages deep in the tree that want
 * to (a) tell the assistant what they're currently looking at
 * (`useAssistantEntity`) or (b) open the assistant themselves, optionally
 * with a prefilled question (`useAssistant().open(...)`).
 *
 * Pure client-side UI state — no message content, no API calls. The actual
 * chat still goes through the unchanged `/api/v1/chat*` routes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type AssistantEntity =
  | { kind: "student"; id: string; label: string }
  | { kind: "teacher"; id: string; label: string }
  | { kind: "lesson"; id: string; label: string }
  | { kind: "payment"; id: string; label: string }
  | { kind: "page"; label: string };

export type AssistantMode = "popup" | "panel" | "fullscreen";

type OpenOptions = { mode?: AssistantMode; prefill?: string };

type AssistantApi = {
  entity: AssistantEntity | null;
  setEntity: Dispatch<SetStateAction<AssistantEntity | null>>;
  isOpen: boolean;
  mode: AssistantMode;
  setMode: (mode: AssistantMode) => void;
  open: (opts?: OpenOptions) => void;
  close: () => void;
  toggle: () => void;
  /** One-shot: reads AND clears the pending prefill text, if any. */
  takePrefill: () => string | null;
  /** Küçük popup ile /panel/maestron-ai arasında paylaşılan sohbet id. */
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
};

const AssistantCtx = createContext<AssistantApi | null>(null);

const CONV_STORAGE_KEY = "maestron.ai.activeConversationId";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<AssistantEntity | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("popup");
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(CONV_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const prefillRef = useRef<string | null>(null);

  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
    try {
      if (id) sessionStorage.setItem(CONV_STORAGE_KEY, id);
      else sessionStorage.removeItem(CONV_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const open = useCallback((opts?: OpenOptions) => {
    if (opts?.mode) setMode(opts.mode);
    if (opts?.prefill) prefillRef.current = opts.prefill;
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const takePrefill = useCallback(() => {
    const v = prefillRef.current;
    prefillRef.current = null;
    return v;
  }, []);

  const value = useMemo<AssistantApi>(
    () => ({
      entity,
      setEntity,
      isOpen,
      mode,
      setMode,
      open,
      close,
      toggle,
      takePrefill,
      activeConversationId,
      setActiveConversationId,
    }),
    [entity, isOpen, mode, open, close, toggle, takePrefill, activeConversationId, setActiveConversationId]
  );

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

export function useAssistant(): AssistantApi {
  const ctx = useContext(AssistantCtx);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}

/**
 * Registers `entity` as "what the current page is about" for as long as the
 * calling component is mounted; clears it on unmount. Pages pass a stable
 * value (memoize or inline a literal — re-registering on every render is
 * harmless but wasteful).
 */
export function useAssistantEntity(entity: AssistantEntity | null) {
  const ctx = useContext(AssistantCtx);
  const setEntity = ctx?.setEntity;
  const key = entity ? JSON.stringify(entity) : "null";
  useEffect(() => {
    setEntity?.(entity);
    return () => {
      // Başka sayfa yeni entity kaydettiyse unmount eski entity'yi silmesin
      // (route geçişinde cleanup sırası race'i).
      setEntity?.((prev) => {
        if (prev == null) return null;
        if (entity == null) return prev;
        return JSON.stringify(prev) === key ? null : prev;
      });
    };
    // `entity` itself is intentionally not a dep — `key` is its stable
    // stand-in so identical-shape objects don't re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setEntity, key]);
}
