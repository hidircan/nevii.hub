"use client";

/**
 * Faz 2 — açıklanabilir öğretmen performans raporu + öğretmen yoklaması
 * işaretleme (yalnız admin). Öğrenci yoklaması burada HİÇ gösterilmez/
 * kullanılmaz — skor yalnız öğretmenin kendi katılımı + öğrenci geri
 * bildirimine dayanır (bkz. src/lib/teacher-performance.ts).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";

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

type PendingLesson = { id: string; startAt: string; endAt: string; studentName: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function TeacherPerformancePanel({
  teacherId,
  canMark,
  pendingLessons,
}: {
  teacherId: string;
  canMark: boolean;
  /** Seçili dönemdeki, henüz öğretmen yoklaması işaretlenmemiş dersler (sunucuda hesaplanır). */
  pendingLessons: PendingLesson[];
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(monthAgoIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [markingId, setMarkingId] = useState<string | null>(null);

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

  function markAttendance(lessonId: string, status: "geldi" | "gelmedi" | "mazeretli") {
    setMarkingId(lessonId);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/lessons/${lessonId}/teacher-attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error?.message || "İşaretlenemedi.");
          return;
        }
        router.refresh();
      } finally {
        setMarkingId(null);
      }
    });
  }

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
            {report.pendingCount > 0 ? (
              <p className="mt-3 text-xs text-amber-700">
                {report.pendingCount} ders bu dönemde henüz öğretmen yoklaması işaretlenmedi.
              </p>
            ) : null}
          </Card>

          {canMark ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Bekleyen öğretmen yoklaması
              </h3>
              {pendingLessons.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">Bekleyen ders yok.</p>
              ) : (
                <div className="space-y-1.5">
                  {pendingLessons.map((l) => (
                    <Card key={l.id} className="!p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-[var(--color-text)]">
                          {formatDate(l.startAt)} {formatTime(l.startAt)} · {l.studentName}
                        </span>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending && markingId === l.id}
                            onClick={() => markAttendance(l.id, "geldi")}
                          >
                            Geldi
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={pending && markingId === l.id}
                            onClick={() => markAttendance(l.id, "gelmedi")}
                          >
                            Gelmedi
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending && markingId === l.id}
                            onClick={() => markAttendance(l.id, "mazeretli")}
                          >
                            Mazeretli
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
