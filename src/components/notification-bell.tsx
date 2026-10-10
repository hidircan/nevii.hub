"use client";

/**
 * Header bildirim zili (İş 1C). Kendi verisini `/api/v1/notifications`
 * (mevcut, oturum-kapsamlı endpoint) üzerinden çeker — tenant/kullanıcı
 * filtrelemesi zaten `listNotificationsForUser`'da yapılıyor, burada ikinci
 * bir yetki kontrolü icat edilmedi. Görünür sekmede odaklanınca yeniden
 * çeker; arka planda agresif polling yapmaz.
 * Tıklanınca okundu + güvenli dahili rotaya gider (notification-href).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { actionMarkNotificationRead } from "@/lib/actions";
import { presentNotificationBody, resolveNotificationHref } from "@/lib/notification-href";
import { notificationSettingsPathForRole, notificationListPathForRole } from "@/lib/auth/role-routes";
import type { Notification } from "@/lib/types";
import type { AppRole } from "@/lib/auth/types";

const ADMIN_ROLES: AppRole[] = ["SCHOOL_ADMIN", "SUPER_ADMIN"];

export function NotificationBell({ role }: { role: AppRole }) {
  const router = useRouter();
  const settingsHref = notificationSettingsPathForRole(role);
  const listHref = notificationListPathForRole(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const list: Notification[] = data?.data?.notifications ?? data?.notifications ?? [];
      setNotifications(list);
    } catch {
      // sessizce yoksay — bir sonraki odaklanmada tekrar dener
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let last = Date.now();
    const timer = setTimeout(() => void refresh(), 0);
    function onFocus() {
      // Sekmeye dönüşte visibilitychange + focus birlikte gelir; 60 sn içinde yeniden sorulmaz (Vercel Active CPU).
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      void refresh();
    }
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const unread = notifications.filter((n) => !n.readAt);

  async function markRead(id: string) {
    setPendingId(id);
    const result = await actionMarkNotificationRead(id);
    if (result.ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    }
    setPendingId(null);
  }

  async function openNotification(n: Notification) {
    if (!n.readAt) await markRead(n.id);
    const href = resolveNotificationHref(n.kind, n.body);
    setOpen(false);
    if (href) router.push(href);
  }

  async function markAllRead() {
    const ids = unread.map((n) => n.id);
    for (const id of ids) {
      await actionMarkNotificationRead(id);
    }
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Bildirimler"
        className="relative flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-full border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <Bell className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
        {unread.length > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
            style={{ background: "var(--color-primary)", color: "var(--color-text-inverted)" }}
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {unread.length > 0 ? `${unread.length} okunmamış bildirim` : "Okunmamış bildirim yok"}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Bildirimler"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)]"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Bildirimler
            </p>
            {unread.length > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-xs font-medium hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu işaretle
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                Yükleniyor…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                Henüz bildiriminiz yok.
              </p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  role="menuitem"
                  className="flex items-start gap-2 border-b px-4 py-3 last:border-b-0"
                  style={{ borderColor: "var(--color-border)", background: n.readAt ? "transparent" : "var(--color-primary-soft)" }}
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: n.readAt ? "var(--color-border-strong)" : "var(--color-primary)" }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => void openNotification(n)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {presentNotificationBody(n.body)}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {formatDateTime(n.createdAt)}
                    </p>
                  </button>
                  {!n.readAt ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markRead(n.id);
                      }}
                      disabled={pendingId === n.id}
                      aria-label="Okundu işaretle"
                      className="shrink-0 rounded-md p-1 transition hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" style={{ color: "var(--color-text-muted)" }} />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Link
              href={listHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--color-primary)" }}
            >
              Tüm bildirimler
            </Link>
            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--color-primary)" }}
            >
              Bildirim ayarları
            </Link>
            {isAdmin ? (
              <Link
                href="/panel/iletisim-merkezi"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                İletişim Merkezi →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
