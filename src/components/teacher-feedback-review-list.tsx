"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { apiFetchJson } from "@/lib/api/client-fetch";
import type { TeacherFeedbackCriterionKey, TeacherFeedbackStatus } from "@/lib/types";

const CRITERIA_LABELS: Record<TeacherFeedbackCriterionKey, string> = {
  clarity: "Anlaşılırlık",
  communication: "İletişim",
  effectiveness: "Verimlilik",
  motivation: "Motivasyon",
  punctuality: "Düzen",
};

const STATUS_LABELS: Record<TeacherFeedbackStatus, string> = {
  pending: "Bekliyor",
  reviewed: "İncelendi",
  actioned: "Aksiyon Alındı",
  archived: "Arşivlendi",
};

export type ReviewFeedbackRow = {
  id: string;
  scores: Record<TeacherFeedbackCriterionKey, number>;
  continueWithTeacher?: "yes" | "unsure" | "no";
  comment?: string;
  status: TeacherFeedbackStatus;
  sharedWithTeacher: boolean;
  submitterRole: string;
  createdAt: string;
};

export function TeacherFeedbackReviewList({ rows }: { rows: ReviewFeedbackRow[] }) {
  const router = useRouter();
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { studentName: string; submittedBy: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Satır bazlı — üç ayrı aksiyon (reveal/status/toggle) aynı satırda
  // paylaşılan tek bir global hata state'ine yazarsa, hata yanlış satırın
  // altında (veya reveal paneli kapalıyken hiç) görünmez olurdu.
  const [error, setError] = useState<{ rowId: string; message: string } | null>(null);

  async function onReveal(feedbackId: string) {
    if (reason.trim().length < 5) {
      setError({ rowId: feedbackId, message: "Gerekçe en az 5 karakter olmalı." });
      return;
    }
    setBusy(feedbackId);
    setError(null);
    const result = await apiFetchJson<{ studentName: string; submittedBy: string }>(
      "/api/v1/teacher-feedback/reveal-identity",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, reason: reason.trim() }),
      }
    );
    setBusy(null);
    if (!result.ok) {
      setError({ rowId: feedbackId, message: result.error.message || "Kimlik açılamadı" });
      return;
    }
    setRevealed((prev) => ({ ...prev, [feedbackId]: result.data }));
    setRevealingId(null);
    setReason("");
  }

  async function onStatusChange(feedbackId: string, status: TeacherFeedbackStatus) {
    setBusy(feedbackId);
    setError(null);
    const result = await apiFetchJson("/api/v1/teacher-feedback/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId, status }),
    });
    setBusy(null);
    if (!result.ok) {
      setError({ rowId: feedbackId, message: result.error.message || "Durum güncellenemedi." });
      return;
    }
    router.refresh();
  }

  async function onToggleShared(feedbackId: string, shared: boolean) {
    setBusy(feedbackId);
    setError(null);
    const result = await apiFetchJson("/api/v1/teacher-feedback/shared", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedbackId, shared }),
    });
    setBusy(null);
    if (!result.ok) {
      setError({ rowId: feedbackId, message: result.error.message || "Paylaşım tercihi güncellenemedi." });
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Bu filtreye uyan geri bildirim yok.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {row.submitterRole === "STUDENT" ? "Öğrenci" : row.submitterRole === "STUDENT_LINK" ? "Değerlendirme bağlantısı" : "Veli"} · {formatDateTime(row.createdAt)}
              </p>
              {revealed[row.id] ? (
                <p className="mt-0.5 text-sm font-semibold text-[var(--color-danger)]">
                  Kimlik: {revealed[row.id]!.studentName}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealingId(row.id)}
                  className="mt-0.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                >
                  Kimliği göster (gerekçe gerekli)
                </button>
              )}
            </div>
            <select
              value={row.status}
              onChange={(e) => void onStatusChange(row.id, e.target.value as TeacherFeedbackStatus)}
              disabled={busy === row.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
            >
              {(Object.keys(STATUS_LABELS) as TeacherFeedbackStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {revealingId === row.id ? (
            <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-2.5">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
                Kimliği neden açıyorsunuz?
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ör. veli şikayeti takibi için gerekli"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
              />
              <div className="mt-2 flex gap-2">
                <Button className="!px-2.5 !py-1 !text-xs" disabled={busy === row.id} onClick={() => void onReveal(row.id)}>
                  Aç
                </Button>
                <Button variant="ghost" className="!px-2.5 !py-1 !text-xs" onClick={() => setRevealingId(null)}>
                  Vazgeç
                </Button>
              </div>
              {error?.rowId === row.id ? (
                <p className="mt-1 text-[11px] text-[var(--color-danger)]">{error.message}</p>
              ) : null}
            </div>
          ) : null}

          {error?.rowId === row.id && revealingId !== row.id ? (
            <p className="mt-1.5 text-[11px] text-[var(--color-danger)]">{error.message}</p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {(Object.keys(CRITERIA_LABELS) as TeacherFeedbackCriterionKey[]).map((k) => (
              <div key={k} className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-2 py-1.5 text-center">
                <p className="text-sm font-semibold text-[var(--color-text)]">{row.scores[k]}</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">{CRITERIA_LABELS[k]}</p>
              </div>
            ))}
          </div>

          {row.continueWithTeacher ? (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Devam etmek ister mi:{" "}
              <span className="font-medium text-[var(--color-text)]">
                {row.continueWithTeacher === "yes" ? "Evet" : row.continueWithTeacher === "no" ? "Hayır" : "Kararsız"}
              </span>
            </p>
          ) : null}

          {row.comment ? (
            <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
              <p className="text-sm text-[var(--color-text)]">{row.comment}</p>
              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={row.sharedWithTeacher}
                  disabled={busy === row.id}
                  onChange={(e) => void onToggleShared(row.id, e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                />
                Öğretmenin anonim özetinde paylaş
              </label>
            </div>
          ) : null}

          <div className="mt-2">
            <Badge status={row.status}>{STATUS_LABELS[row.status]}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
