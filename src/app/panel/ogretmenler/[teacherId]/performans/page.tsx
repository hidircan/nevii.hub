import Link from "@/components/link";
import { redirect, notFound } from "next/navigation";
import { subDays, format } from "date-fns";
import { getTeacherPerformanceReportV2Tool } from "@/lib/services";
import { EmptyState } from "@/components/ui";
import { TeacherPerformanceV2Dashboard } from "@/components/teacher-performance-v2-dashboard";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

/** Detaylı performans v2 — layout altında; özet sayfasında tekrarlanmaz. */
export default async function TeacherPerformanceTab({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string }>;
}) {
  const { teacherId } = await params;
  const { periodStart: periodStartParam, periodEnd: periodEndParam } = await searchParams;

  const { session, teacher } = await loadTeacherPageContext(teacherId);
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    redirect("/panel");
  }
  if (session.role === "TEACHER" && session.teacherId !== teacherId) {
    redirect("/panel");
  }
  if (!teacher) notFound();

  const now = new Date();
  const periodStart = periodStartParam || format(subDays(now, 30), "yyyy-MM-dd");
  const periodEnd = periodEndParam || format(now, "yyyy-MM-dd");

  const result = await getTeacherPerformanceReportV2Tool(session, { teacherId, periodStart, periodEnd });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Detaylı Performans</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Yoklama, geri bildirim, iş takip ve ödev disiplini tek raporda.
          </p>
        </div>
        <Link
          href={`/ogretmen-performans-yazdir/${teacher.id}?periodStart=${periodStart}&periodEnd=${periodEnd}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
        >
          Yazdır / PDF
        </Link>
      </div>
      {result.ok ? (
        <TeacherPerformanceV2Dashboard
          teacherId={teacher.id}
          periodStart={periodStart}
          periodEnd={periodEnd}
          report={result.data}
        />
      ) : (
        <EmptyState title="Rapor yüklenemedi" description={result.error.message} />
      )}
    </div>
  );
}
