"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleDollarSign, MessageCircle } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";
import { TahsilatMessageApproval } from "@/components/tahsilat-message-approval";
import type { TahsilatQueueRow } from "@/lib/tahsilat/queue";
import { useAssistant } from "@/components/ai/assistant-context";

type StageFilter = "all" | "draft" | "approved" | "sent" | "replied";

const STAGE_TABS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "draft", label: "Aksiyon bekliyor" },
  { value: "approved", label: "Gönderilecek" },
  { value: "sent", label: "Yanıt bekleniyor" },
  { value: "replied", label: "Ödeme bekleniyor" },
];

export function TahsilatQueue({
  rows,
  canWrite,
  tenantId,
  canUseAiDraft,
}: {
  rows: TahsilatQueueRow[];
  canWrite: boolean;
  tenantId: string;
  canUseAiDraft: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const { open } = useAssistant();

  const counts = useMemo(() => {
    const map: Record<StageFilter, number> = { all: rows.length, draft: 0, approved: 0, sent: 0, replied: 0 };
    for (const row of rows) {
      const mapped =
        row.caseStatus === "open" || row.caseStatus === "draft_ready" || row.caseStatus === "failed"
          ? "draft"
          : row.caseStatus === "sending"
            ? "approved"
            : row.caseStatus === "partial"
              ? "replied"
              : row.caseStatus;
      if (mapped === "draft" || mapped === "approved" || mapped === "sent" || mapped === "replied") {
        map[mapped] += 1;
      }
    }
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.studentName.toLowerCase().includes(query)) return false;
      const mapped =
        row.caseStatus === "open" || row.caseStatus === "draft_ready" || row.caseStatus === "failed"
          ? "draft"
          : row.caseStatus === "sending"
            ? "approved"
            : row.caseStatus === "partial"
              ? "replied"
              : row.caseStatus;
      if (stage !== "all" && mapped !== stage) return false;
      return true;
    });
  }, [rows, search, stage]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Öğrenci adına göre ara..."
          aria-label="Öğrenci adına göre ara"
          className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-amber-200 focus:ring-2 sm:w-auto"
        />
        <div className="flex flex-wrap gap-1.5">
          {STAGE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStage(tab.value)}
              aria-pressed={stage === tab.value}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                stage === tab.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label} ({counts[tab.value]})
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400">{filtered.length} sonuç</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
          Takip gerektiren açık ödeme yok. Agent kuyruğu temiz.
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Bu filtreye uyan kayıt yok" description="Arama veya sekme seçimini değiştirip tekrar deneyin." />
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.paymentId} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-50">{row.studentName}</p>
                    <Badge status={row.paymentStatus} />
                    {row.paymentStatus === "overdue" && row.daysOverdue > 0 ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        {row.daysOverdue} gün gecikti
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {row.description} · Vade: {formatDate(row.dueDate)}
                    {row.parentPhone ? ` · Veli tel: ${row.parentPhone}` : ""}
                  </p>
                  <p className="mt-1.5 text-xs font-medium text-amber-700">Sonraki adım: {row.nextAction}</p>
                  {row.lastContactAt ? (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Son iletişim: {formatDate(row.lastContactAt, "d MMM yyyy, HH:mm")}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{formatMoney(row.remaining)}</p>
                  {row.paidAmount > 0 ? (
                    <p className="text-xs text-slate-400">
                      Toplam {formatMoney(row.amount)} · Ödenen {formatMoney(row.paidAmount)}
                    </p>
                  ) : null}
                </div>
              </div>

              <TahsilatMessageApproval
                caseId={row.caseId}
                paymentId={row.paymentId}
                studentId={row.studentId}
                amount={row.remaining}
                initialStatus={row.caseStatus}
                studentName={row.studentName}
                parentName={row.parentName}
                parentPhone={row.parentPhone}
                initialMessage={row.suggestedMessage}
                canWrite={canWrite}
                tenantId={tenantId}
                canUseAiDraft={canUseAiDraft}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/panel/odemeler"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <CircleDollarSign className="h-4 w-4" /> Ödemeyi görüntüle
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    open({
                      mode: "panel",
                      prefill: `${row.studentName} (${row.studentId}) için tahsilat durumu hakkında ne önerirsin?`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4" /> AI Asistan&apos;a danış
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
