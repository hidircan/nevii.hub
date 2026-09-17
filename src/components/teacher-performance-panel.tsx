"use client";

/**
 * Faz 2 — açıklanabilir öğretmen performans raporu. 2026-09-17: "bekleyen
 * öğretmen yoklaması" işaretleme bloğu kaldırıldı (yoklama tek yetki modeli). Öğrenci yoklaması burada HİÇ gösterilmez/
 * kullanılmaz — skor yalnız öğretmenin kendi katılımı + öğrenci geri
 * bildirimine dayanır (bkz. src/lib/teacher-performance.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Input, Label } from "@/components/ui";

type Report = {
  version: string;
  periodStart: string;
  periodEnd: string;
  plannedLessonCount: number;
  attendedCount: number;
  absentCount: number;
  excusedCount: number;
  pendingCount: number;
  attendanceRate: number | null;
  feedbackAverage: number | null;
  feedbackCount: number;
  score: number | null;
  components: {
    attendance: { weight: number; value: number | null; contribution: number | null };
    feedback: { weight: number; value: number | null; contribution: number | null };
  };
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function TeacherPerformancePanel({ teacherId }: { teacherId: string }) {
  const [periodStart, setPeriodStart] = useState(monthAgoIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    (signal: { cancelled: boolean }) => {
      setLoading(true);
      setError(null);
      fetch(`/api/v1/teachers/${teacherId}/performance?periodStart=${periodStart}&periodEnd=${periodEnd}`, {
        credentials: "same-origin",
      })
        .then((r) => r.json())
        .then((json) => {
          if (signal.cancelled) return;
          if (!json.ok) {
            setError(json.error?.message || "Rapor yüklenemedi.");
            return;
          }
          setReport(json.data);
        })
        .catch(() => !signal.cancelled && setError("Bağlantı hatası."))
        .finally(() => !signal.cancelled && setLoading(false));
    },
    [teacherId, periodStart, periodEnd]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // Doğrudan effect gövdesinde senkron setState çağrısı yerine (react-hooks/
    // set-state-in-effect), makrotask'a ertelenmiş çağrı — bkz. notification-bell.tsx
    // AYNI desen.
    const timer = setTimeout(() => loadReport(signal), 0);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [loadReport]);

  const scoreLabel = useMemo(() => {
    if (!report || report.score === null) return "Yetersiz veri";
    return `${report.score} / 100`;
  }, [report]);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Başlangıç</Label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div>
          <Label>Bitiş</Label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>

      {error ? <p className="text-xs font-medium text-[#8b3a3a]">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p>
      ) : report ? (
        <>
          <Card className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  Toplam performans skoru ({report.version})
                </p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{scoreLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-4">
                <div>
                  Planlanan ders: <span className="font-medium text-[var(--color-text)]">{report.plannedLessonCount}</span>
                </div>
                <div>
                  Geldi: <span className="font-medium text-[var(--color-text)]">{report.attendedCount}</span>
                </div>
                <div>
                  Gelmedi: <span className="font-medium text-[var(--color-text)]">{report.absentCount}</span>
                </div>
                <div>
                  Mazeretli: <span className="font-medium text-[var(--color-text)]">{report.excusedCount}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <p className="font-medium text-[var(--color-text)]">
                  Katılım oranı — ağırlık %{Math.round(report.components.attendance.weight * 100)}
                </p>
                <p className="text-[var(--color-text-muted)]">
                  {report.attendanceRate !== null
                    ? `%${Math.round(report.attendanceRate * 100)} (${report.attendedCount}/${report.attendedCount + report.absentCount + report.excusedCount})`
                    : "Henüz işaretlenmiş ders yok"}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <p className="font-medium text-[var(--color-text)]">
                  Öğrenci geri bildirimi — ağırlık %{Math.round(report.components.feedback.weight * 100)}
                </p>
                <p className="text-[var(--color-text-muted)]">
                  {report.feedbackAverage !== null
                    ? `${report.feedbackAverage} / 5 (${report.feedbackCount} yanıt)`
                    : "Yeterli sayıda geri bildirim yok"}
                </p>
              </div>
            </div>
          </Card>

        </>
      ) : null}
    </div>
  );
}
