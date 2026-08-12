"use client";

/**
 * App-wide floating AI entry point — mounted once in the root layout so it
 * persists across client-side navigations instead of remounting per page.
 * Renders nothing until the auth check resolves (avoids a flash on /login),
 * and nothing at all when unauthenticated.
 *
 * Deliberately a SINGLE surface: a small draggable popup anchored near the
 * launcher. There is no docked side-panel or fullscreen takeover — this is a
 * lightweight, always-dismissable helper, never a mode that occupies most of
 * the screen. `AssistantMode`/`open({ mode })` still exist in
 * `assistant-context.tsx` for callers that pass them (backward compat), but
 * this component ignores the value and always renders the popup.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, GraduationCap, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth/types";
import { useAssistant, type AssistantEntity } from "./assistant-context";
import { AssistantChatBody } from "./assistant-chat-body";
import { getRouteQuickActions, type AssistantSession } from "./assistant-quick-actions";

const POSITION_STORAGE_KEY = "notaplan.assistant.popupPosition";
const POPUP_WIDTH = 352;
const POPUP_HEIGHT = 480;
const VIEWPORT_MARGIN = 8;

type Position = { x: number; y: number };

function renderEntityIcon(entity: AssistantEntity | null) {
  const className = "h-4 w-4 shrink-0 opacity-90";
  if (entity?.kind === "student") return <GraduationCap className={className} />;
  if (entity?.kind === "teacher") return <Users className={className} />;
  return <Bot className={className} />;
}

function readStoredPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return { x: parsed.x, y: parsed.y };
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Keeps at least the header (and its close button) on-screen. */
function clampPosition(pos: Position, width: number, height: number): Position {
  const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - height - VIEWPORT_MARGIN;
  return { x: clamp(pos.x, VIEWPORT_MARGIN, maxX), y: clamp(pos.y, VIEWPORT_MARGIN, maxY) };
}

export function GlobalAssistant() {
  const { entity, isOpen, close, toggle, takePrefill } = useAssistant();
  const [session, setSession] = useState<AssistantSession>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  // null = not-yet-dragged, use the default bottom-right anchor.
  const [dragPos, setDragPos] = useState<Position | null>(readStoredPosition);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  // This component is mounted once in the root layout and persists across
  // client-side navigations (that's what lets the chat survive a page
  // change) — including navigating from /login to /panel right after
  // signing in. A mount-only effect would only ever see the pre-login,
  // signed-out state, so re-check whenever the route changes instead.
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setSession(null);
          return;
        }
        const json = await res.json();
        if (!cancelled && json.ok) {
          setSession({ role: json.data.role as AppRole, teacherId: json.data.teacherId, studentId: json.data.studentId });
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Pick up any prefill queued via useAssistant().open({ prefill }) once open.
  // `takePrefill()` mutates a ref (one-shot consume) — a genuine external-system
  // read, not a plain prop mirror, so it belongs in an effect; StrictMode's
  // double-invoke is harmless here since a second call just returns null.
  useEffect(() => {
    if (!isOpen) return;
    const p = takePrefill();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p) setPrefill(p);
  }, [isOpen, takePrefill]);

  // Escape closes — no click-outside-to-dismiss: this app is a working tool,
  // not a marketing widget, and a scrim would eat the user's very next click
  // (e.g. a sidebar nav link) instead of letting it through.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Re-clamp a dragged position if the viewport shrinks (resize/rotate) so
  // the header never ends up off-screen.
  useEffect(() => {
    function onResize() {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const width = rect?.width ?? POPUP_WIDTH;
      const height = rect?.height ?? POPUP_HEIGHT;
      setDragPos((prev) => (prev ? clampPosition(prev, width, height) : prev));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only the header itself drags — never its buttons (e.g. close).
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
  }

  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    const width = rect?.width ?? POPUP_WIDTH;
    const height = rect?.height ?? POPUP_HEIGHT;
    const next = clampPosition(
      { x: drag.origX + (e.clientX - drag.startX), y: drag.origY + (e.clientY - drag.startY) },
      width,
      height
    );
    setDragPos(next);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    document.body.style.userSelect = "";
    setDragPos((pos) => {
      try {
        if (pos) sessionStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
      } catch {
        // sessionStorage unavailable (private mode etc.) — position just won't survive a reload
      }
      return pos;
    });
  }

  if (!authChecked || !session) return null;

  const quickActions = getRouteQuickActions(pathname, session, entity);

  return (
    <>
      {/* Launcher — hidden while the popup is open so it never sits under
          it or doubles as a confusing second close control. */}
      <button
        type="button"
        onClick={toggle}
        aria-label="AI Asistanı aç"
        className={cn(
          "print:hidden fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full",
          "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-600/40",
          "transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl hover:shadow-violet-600/50",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
          isOpen ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-violet-500/20 [animation-duration:3.5s]" />
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Positioning layer: plain left/top (or a default right/bottom
          anchor) — no CSS transition here, so dragging tracks the pointer
          1:1 with no fighting between transform-based open/close animation
          and transform-based positioning. */}
      <div
        ref={surfaceRef}
        style={dragPos ? { left: dragPos.x, top: dragPos.y } : { right: 20, bottom: 84 }}
        className={cn(
          "fixed z-40 h-[480px] max-h-[calc(100vh-4.5rem)] w-[352px] max-w-[calc(100vw-1.5rem)]",
          !isOpen && "pointer-events-none"
        )}
      >
        {/* Animation + visual-card layer — opacity/scale only, so a closed
            popup is fully transparent and non-interactive, never a
            half-faded "bleed-through" frame. */}
        <div
          role="dialog"
          aria-label="NotaPlan AI Asistan"
          aria-hidden={!isOpen}
          className={cn(
            "flex h-full w-full origin-bottom-right flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl shadow-slate-900/10",
            "transition-[opacity,transform] duration-200 ease-out dark:border-slate-800 dark:bg-slate-950",
            isOpen ? "scale-100 opacity-100" : "scale-90 opacity-0"
          )}
        >
          <div
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="flex shrink-0 cursor-grab touch-none items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-white active:cursor-grabbing"
          >
            {renderEntityIcon(entity)}
            <p className="min-w-0 flex-1 select-none truncate text-xs font-medium opacity-95">
              {entity ? entity.label : "Genel asistan"}
            </p>
            <button type="button" onClick={close} aria-label="Kapat" className="rounded-lg p-1 hover:bg-[var(--color-surface)]/15">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1">
            <AssistantChatBody
              quickActions={quickActions}
              prefillText={prefill}
              onPrefillConsumed={() => setPrefill(null)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
