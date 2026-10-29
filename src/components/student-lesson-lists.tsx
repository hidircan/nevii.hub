"use client";

/**
 * Öğrenci detayındaki Yaklaşan Dersler / Geçmiş Dersler / Yoklama bölümleri
 * için sayfalama — sayfa başına SABİT 3 kayıt, sayfa boyutu seçici YOK
 * (bkz. PaginationControls'un 10/30/50 seçici; burada istenmiyor). Sayfalama
 * MATEMATİĞİ `usePagination` (pagination-controls.tsx) ile paylaşılır; yalnız
 * görsel kontrol (Prev/Next) buraya özel, sabit-3 için hafif bir sürüm.
 * Her bölüm kendi client component'i olduğu için (server page.tsx dersleri
 * FULL/filtrelenmiş diziyle geçirir) sayfalama state'i bölümler arasında
 * BAĞIMSIZDIR — ayrı `usePagination` çağrıları, paylaşılan state yok.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePagination } from "@/components/pagination-controls";
import { Badge, Card, EmptyState } from "@/components/ui";
import { LessonOpsBadges } from "@/components/lesson-ops-actions";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import type { Lesson, Teacher } from "@/lib/types";

const PAGE_SIZE = 3;

function SmallPager({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-end gap-1.5 border-t border-[var(--color-border)] px-1 py-2 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Önceki sayfa"
        className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-1 text-[var(--color-text-muted)]">
        Sayfa {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Sonraki sayfa"
        className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-strong)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function StudentUpcomingLessons({ lessons, teachers }: { lessons: Lesson[]; teachers: Teacher[] }) {
  const { pageItems, page, setPage, totalPages, totalCount } = usePagination(lessons, PAGE_SIZE);

  if (totalCount === 0) return <EmptyState title="Yaklaşan ders yok" />;

  return (
    <div className="mb-4">
      <div className="space-y-2">
        {pageItems.map((l) => {
          const t = teachers.find((tt) => tt.id === l.teacherId);
          return (
            <Card key={l.id} className="!p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{formatDateTime(l.startAt)}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{l.instrument} · {t?.name ?? "—"}</p>
                </div>
                <Badge status={l.type === "makeup" ? "makeup" : l.status} />
              </div>
            </Card>
          );
        })}
      </div>
      <SmallPager page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}

export function StudentPastLessons({ lessons }: { lessons: Lesson[] }) {
  const { pageItems, page, setPage, totalPages, totalCount } = usePagination(lessons, PAGE_SIZE);

  if (totalCount === 0) return <EmptyState title="Geçmiş ders yok" />;

  return (
    <div>
      <div className="space-y-2">
        {pageItems.map((l) => (
          <Card key={l.id} className="!p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {formatDate(l.startAt)} · {formatTime(l.startAt)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{l.instrument}</p>
              </div>
              <Badge status={l.type === "makeup" ? "makeup" : l.status} />
            </div>
          </Card>
        ))}
      </div>
      <SmallPager page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}

export function StudentAttendanceList({ lessons }: { lessons: Lesson[] }) {
  const { pageItems, page, setPage, totalPages, totalCount } = usePagination(lessons, PAGE_SIZE);

  if (totalCount === 0) return <EmptyState title="Henüz yoklama kaydı yok" />;

  return (
    <div>
      <div className="space-y-2">
        {pageItems.map((l) => (
          <Card key={l.id} className="!p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[var(--color-text)]">{formatDate(l.startAt)} · {formatTime(l.startAt)}</p>
              <LessonOpsBadges
                plannedMakeup={l.type === "makeup"}
                studentAttended={l.studentAttended}
                lessonProcessed={l.lessonProcessed}
                opsMakeupFlag={l.opsMakeupFlag}
                studentAbsent={l.studentAbsent}
                studentExcused={l.studentExcused}
              />
            </div>
          </Card>
        ))}
      </div>
      <SmallPager page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
