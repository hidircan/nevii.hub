"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAssistant } from "@/components/ai/assistant-context";
import { AssistantChatBody } from "@/components/ai/assistant-chat-body";
import { getRouteQuickActions, type AssistantSession } from "@/components/ai/assistant-quick-actions";
import { useEffect, useMemo, useState } from "react";
import type { AppRole } from "@/lib/auth/types";
import { BRAND } from "@/lib/brand";

/**
 * Nevii Hub AI büyük sohbet — popup ile aynı conversationId / geçmiş.
 * (Route slug /panel/maestron-ai kalıyor — bkz. BRAND_MIGRATION_INVENTORY.md.)
 */
export default function NeviiHubAiPage() {
  const pathname = usePathname();
  const { entity, activeConversationId, setActiveConversationId, close } = useAssistant();
  const [session, setSession] = useState<AssistantSession>(null);

  useEffect(() => {
    // Büyük ekran açıkken küçük popup'ı kapat.
    close();
  }, [close]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok) {
          setSession({
            role: json.data.role as AppRole,
            teacherId: json.data.teacherId,
            studentId: json.data.studentId,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const quickActions = useMemo(
    () => getRouteQuickActions(pathname, session, entity),
    [pathname, session, entity]
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text)]">{BRAND.assistantName}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {entity ? `Bağlam: ${entity.label}` : "Operasyon asistanı — ekran bağlamına göre öneriler"}
          </p>
        </div>
        <Link
          href="/panel"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Panele dön
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <AssistantChatBody
          quickActions={quickActions}
          initialConversationId={activeConversationId}
          onConversationIdChange={setActiveConversationId}
          hideChrome
        />
      </div>
    </div>
  );
}
