/**
 * Öğretmenin bekleyen 4 haftalık raporları. Form TEK yerde açılır (`/gelisim/[öğrenci]?sekme=donemsel`): taslak
 * (önceki 4 dersin özeti) yalnız orada, tek öğrenci dilimiyle üretilir — listede ders raporları okunmaz.
 */

import Link from "@/components/link";
import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export type PendingPeriodicListItem = {
  studentId: string;
  studentName: string;
  periodStart: string;
  periodEnd: string;
  lessonCount: number;
};

export function PeriodicAssessmentPendingList({ items }: { items: PendingPeriodicListItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Bekleyen 4 haftalık rapor yok" description="4 dersi tamamlanan öğrencinin raporu burada açılır." />;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link key={`${item.studentId}:${item.periodStart}`} href={`/gelisim/${item.studentId}?sekme=donemsel`}>
          <Card className="!p-3 hover:border-[var(--color-border-strong)]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.studentName}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatDate(item.periodStart)} – {formatDate(item.periodEnd)} · {item.lessonCount} ders
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-[var(--color-primary)]">Raporu yaz</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
