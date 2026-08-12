"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { actionMarkNotificationRead } from "@/lib/actions";
import type { Notification } from "@/lib/types";

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onMarkRead(id: string) {
    setPendingId(id);
    await actionMarkNotificationRead(id);
    setPendingId(null);
    router.refresh();
  }

  if (notifications.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Henüz bildiriminiz yok.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <Card
          key={n.id}
          className={`!p-4 ${n.readAt ? "" : "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-primary)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{n.title}</p>
                <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{n.body}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(n.createdAt)}</p>
              </div>
            </div>
            {!n.readAt ? (
              <button
                type="button"
                onClick={() => void onMarkRead(n.id)}
                disabled={pendingId === n.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}
              >
                <Check className="h-3 w-3" /> Okundu
              </button>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
