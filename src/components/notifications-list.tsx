"use client";

/**
 * `/panel/bildirimler` — uygulama içi bildirimlerin TAM listesi (bell
 * dropdown'ı yalnızca son 20'sini gösterir). Aynı `actionMarkNotificationRead`
 * server action'ını kullanır — ikinci bir okundu-işaretleme yolu icat
 * edilmedi. Liste zaten server component'te tenant+userId kapsamlı
 * (`listNotificationsForUser`) çekilip prop olarak geliyor.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { actionMarkNotificationRead } from "@/lib/actions";
import {
  filterNotifications,
  notificationKindLabel,
  presentNotificationBody,
  resolveNotificationHref,
} from "@/lib/notification-href";
import type { Notification } from "@/lib/types";
import { PaginationControls, usePagination } from "@/components/pagination-controls";

export function NotificationsList({ initialNotifications }: { initialNotifications: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");

  const unread = notifications.filter((n) => !n.readAt);
  const kinds = Array.from(new Set(notifications.map((n) => notificationKindLabel(n.kind)))).sort((a, b) => a.localeCompare(b, "tr"));
  const filtered = filterNotifications(notifications, { kindLabel: kind, from, to, query });
  const { pageItems: visible, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(filtered, 20);

  async function markRead(id: string) {
    setPendingId(id);
    const result = await actionMarkNotificationRead(id);
    if (result.ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    }
    setPendingId(null);
  }

  async function markAllRead() {
    for (const n of unread) await actionMarkNotificationRead(n.id);
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
  }

  async function open(n: Notification) {
    if (!n.readAt) await markRead(n.id);
    const href = resolveNotificationHref(n.kind, n.body);
    if (href) router.push(href);
  }

  if (notifications.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border px-4 py-6 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
        Henüz bildiriminiz yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {unread.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: "var(--color-primary)" }}
          >
            <CheckCheck className="h-4 w-4" /> Tümünü okundu işaretle ({unread.length})
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--color-text-muted)]">
          Tür
          <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)]">
            <option value="all">Tümü</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">Başlangıç<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--color-text-muted)]">Bitiş<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--color-text-muted)]">Ara<input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm" /></label>
      </div>

      <ul className="divide-y overflow-hidden rounded-[var(--radius-lg)] border" style={{ borderColor: "var(--color-border)" }}>
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            Bu filtreye uyan bildirim yok.
          </li>
        ) : null}
        {visible.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-3 px-4 py-3.5"
            style={{ background: n.readAt ? "transparent" : "var(--color-primary-soft)" }}
          >
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: n.readAt ? "var(--color-border-strong)" : "var(--color-primary)" }}
              aria-hidden
            />
            <button type="button" onClick={() => void open(n)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {n.title}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {presentNotificationBody(n.body)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {formatDateTime(n.createdAt)}
              </p>
            </button>
            {!n.readAt ? (
              <button
                type="button"
                onClick={() => void markRead(n.id)}
                disabled={pendingId === n.id}
                aria-label="Okundu işaretle"
                className="shrink-0 rounded-md p-1.5 transition hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
              >
                <Check className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
