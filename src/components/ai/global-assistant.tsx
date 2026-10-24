"use client";

/**
 * App-wide floating AI entry point — mounted once in the root layout so it
 * persists across client-side navigations instead of remounting per page.
 * Renders nothing until the auth check resolves (avoids a flash on /login),
 * and nothing at all when unauthenticated.
 *
 * The launcher ALWAYS opens the small draggable popup, on every route
 * (including `/panel/*`) — it never redirects to the full-screen
 * "Nevii Hub AI" panel (`/panel/maestron-ai` — route slug unchanged, see
 * BRAND_MIGRATION_INVENTORY.md). The full-screen panel is a
 * SEPARATE, additional access point (reached via the popup's own
 * "Tam ekranda aç" button, `AssistantChatBody`'s `expandHref`), not a
 * replacement for the popup — both must stay independently reachable at
 * all times, on every `/panel/*` screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, GraduationCap, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import type { AppRole } from "@/lib/auth/types";
import { useAssistant, type AssistantEntity } from "./assistant-context";
import { AssistantChatBody } from "./assistant-chat-body";
import { getRouteQuickActions, type AssistantSession } from "./assistant-quick-actions";

const POSITION_STORAGE_KEY = "notaplan.assistant.popupPosition";
/** 2026-10-20 — başlatıcı da sürüklenir (sayfa öğelerini örtüyordu); konum oturum boyunca korunur. */
const LAUNCHER_STORAGE_KEY = "notaplan.assistant.launcherPosition";
const LAUNCHER_SIZE = 52;
/** Bu kadar pikselden az hareket = tıklama (sohbeti açar); fazlası = sürükleme. */
const DRAG_THRESHOLD = 6;
const POPUP_WIDTH = 352;
const POPUP_HEIGHT = 480;
const VIEWPORT_MARGIN = 8;

type Position = { x: number; y: number };

function renderEntityIcon(entity: AssistantEntity | null) {
  const className = "h-4 w-4 shrink-0 opacity-90";
  if (entity?.kind === "student") return <GraduationCap className={className} />;
  if (entity?.kind === "teacher") return <Users className={className} />;
  // page / lesson / payment / none → generic
  return <Bot className={className} />;
}

function readStoredPosition(key: string = POSITION_STORAGE_KEY): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return { x: parsed.x, y: parsed.y };
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

function storePosition(key: string, pos: Position) {
  try {
    sessionStorage.setItem(key, JSON.stringify(pos));
  } catch {
    // sessionStorage unavailable (private mode etc.) — position just won't survive a reload
  }
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

/** Asistanın hiç gösterilmediği herkese açık yüzeyler (ilk yol bölümü). */
const PUBLIC_NO_ASSISTANT_PORTALS = new Set(["basvuru"]);

export function GlobalAssistant() {
  const { entity, isOpen, close, toggle, takePrefill, activeConversationId, setActiveConversationId } =
    useAssistant();
  const [session, setSession] = useState<AssistantSession>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  // null = not-yet-dragged, use the default bottom-right anchor.
  const [dragPos, setDragPos] = useState<Position | null>(readStoredPosition);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  // null = varsayılan sağ-alt köşe (safe-area dahil).
  const [launcherPos, setLauncherPos] = useState<Position | null>(() =>
    typeof window === "undefined" ? null : (() => {
      const p = readStoredPosition(LAUNCHER_STORAGE_KEY);
      return p ? clampPosition(p, LAUNCHER_SIZE, LAUNCHER_SIZE) : null;
    })()
  );
  const launcherDragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  // This component is mounted once in the root layout and persists across
  // client-side navigations (that's what lets the chat survive a page
  // change) — including navigating from /login to /panel right after
  // signing in. A mount-only effect would only ever see the pre-login,
  // signed-out state, so re-check whenever the portal (first path segment)
  // changes — /login → /panel, /panel → /ogretmen, logout. Not on every
  // in-portal navigation: that was one extra function call per click
  // (Vercel Active CPU, 2026-10-01).
  const pathname = usePathname();
  const portal = pathname?.split("/")[1] ?? "";
  // 2026-10-06 — herkese açık başvuru sayfalarında (aday/veli formu) asistan, başlatıcısı ve oturum isteği YOK;
  // giriş yapmış bir yönetici formu açsa bile. Diğer portallarda davranış aynı.
  const publicSurface = PUBLIC_NO_ASSISTANT_PORTALS.has(portal);
  // Sohbet gövdesi (konuşma listesi isteği) ilk açılışta mount edilir, sonra açık kalır;
  // asistanı hiç açmayan kullanıcı için her sayfa açılışında /api/v1/chat çağrılmaz.
  const [chatMounted, setChatMounted] = useState(isOpen);
  if (isOpen && !chatMounted) setChatMounted(true);

  useEffect(() => {
    if (publicSurface) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setSession(null);
            setAuthChecked(true);
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          if (json.ok) {
            setSession({
              role: json.data.role as AppRole,
              teacherId: json.data.teacherId,
              studentId: json.data.studentId,
            });
          } else {
            setSession(null);
          }
          setAuthChecked(true);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          setAuthChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portal, publicSurface]);

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
      setLauncherPos((prev) => (prev ? clampPosition(prev, LAUNCHER_SIZE, LAUNCHER_SIZE) : prev));
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
      if (pos) storePosition(POSITION_STORAGE_KEY, pos);
      return pos;
    });
  }

  // Başlatıcı: fare + dokunmatik (Pointer Events). Eşik altı hareket tıklamadır.
  function onLauncherPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    // Dokunmatikte sürükleme sonrası `click` gelmeyebilir; bayrak her hareketin başında sıfırlanır.
    suppressClickRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    launcherDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onLauncherPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setLauncherPos(clampPosition({ x: drag.origX + dx, y: drag.origY + dy }, LAUNCHER_SIZE, LAUNCHER_SIZE));
  }

  function endLauncherDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    launcherDragRef.current = null;
    if (!drag.moved) return;
    suppressClickRef.current = true;
    setLauncherPos((pos) => {
      if (pos) storePosition(LAUNCHER_STORAGE_KEY, pos);
      return pos;
    });
  }

  function onLauncherClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // Popup hiç sürüklenmediyse başlatıcının yanında açılır (taşınmış başlatıcıdan uzakta değil).
    if (!isOpen && !dragPos && launcherPos) {
      const width = Math.min(POPUP_WIDTH, window.innerWidth - 24);
      const height = Math.min(POPUP_HEIGHT, window.innerHeight - 72);
      const above = launcherPos.y - height - 12;
      setDragPos(
        clampPosition(
          { x: launcherPos.x + LAUNCHER_SIZE - width, y: above >= VIEWPORT_MARGIN ? above : launcherPos.y + LAUNCHER_SIZE + 12 },
          width,
          height
        )
      );
    }
    toggle();
  }

  // Auth hazır değilse boş dizi — chip alanı basılmaz; hazır olunca route/entity chip'leri.
  const quickActions = useMemo(() => {
    if (!authChecked || !session) return [];
    return getRouteQuickActions(pathname, session, entity);
  }, [authChecked, session, pathname, entity]);

  // Auth bitmeden ne launcher ne chip — boş flicker yok.
  if (publicSurface || !authChecked || !session) return null;

  return (
    <>
      {/* Launcher — hidden while the popup is open so it never sits under
          it or doubles as a confusing second close control. */}
      <button
        type="button"
        onClick={onLauncherClick}
        onPointerDown={onLauncherPointerDown}
        onPointerMove={onLauncherPointerMove}
        onPointerUp={endLauncherDrag}
        onPointerCancel={endLauncherDrag}
        aria-label={`${BRAND.assistantName}'yi aç (sürükleyerek taşıyabilirsiniz)`}
        title="Tıkla: aç · Sürükle: taşı"
        style={
          launcherPos
            ? { left: launcherPos.x, top: launcherPos.y }
            : { right: 20, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }
        }
        className={cn(
          "print:hidden fixed z-40 flex h-13 w-13 cursor-grab touch-none select-none items-center justify-center rounded-full active:cursor-grabbing",
          "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-600/40",
          "transition-[opacity,transform,box-shadow] duration-200 ease-out hover:scale-105 hover:shadow-xl hover:shadow-violet-600/50",
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
          aria-label={BRAND.assistantName}
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
              {entity ? `${BRAND.assistantName} · ${entity.label}` : BRAND.assistantName}
            </p>
            <button type="button" onClick={close} aria-label="Kapat" className="rounded-lg p-1 hover:bg-[var(--color-surface)]/15">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1">
            {chatMounted ? (
              <AssistantChatBody
                quickActions={quickActions}
                prefillText={prefill}
                onPrefillConsumed={() => setPrefill(null)}
                initialConversationId={activeConversationId}
                onConversationIdChange={setActiveConversationId}
                expandHref="/panel/maestron-ai"
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
