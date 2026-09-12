import { redirect } from "next/navigation";
import Link from "next/link";
import { subDays, format } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { getTeacherPerformanceReportV2Tool } from "@/lib/services";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { EmptyState, PageHeader } from "@/components/ui";
import { TeacherPerformanceV2Dashboard } from "@/components/teacher-performance-v2-dashboard";

export const dynamic = "force-dynamic";

export default async function TeacherPerformanceV2Page({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string }>;
}) {
  const { teacherId } = await params;
  const { periodStart: periodStartParam, periodEnd: periodEndParam } = await searchParams;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}/performans`);
  }

  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN" && session.role !== "TEACHER") {
    redirect("/panel");
  }
  if (session.role === "TEACHER" && session.teacherId !== teacherId) {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);

  if (!teacher) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Öğretmen Performansı" description="Öğretmen bulunamadı." />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu öğretmen kurumunuza kayıtlı değil veya kaldırılmış olabilir."
        />
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mt-4 text-amber-600 hover:text-amber-700" />
      </div>
    );
  }

  const now = new Date();
  const periodStart = periodStartParam || format(subDays(now, 30), "yyyy-MM-dd");
  const periodEnd = periodEndParam || format(now, "yyyy-MM-dd");

  const result = await getTeacherPerformanceReportV2Tool(session, { teacherId, periodStart, periodEnd });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "teacher", id: teacher.id, label: teacher.name }} />
      <BackButton fallbackHref={`/panel/ogretmenler/${teacher.id}`} label="Öğretmen detayına dön" className="mb-3" />
      <PageHeader
        title={`${teacher.name} — Detaylı Performans`}
        description="Yoklama, geri bildirim, iş takip ve ödev disiplini tek raporda."
        actions={
          <Link
            href={`/ogretmen-performans-yazdir/${teacher.id}?periodStart=${periodStart}&periodEnd=${periodEnd}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            Yazdır / PDF
          </Link>
        }
      />
      {result.ok ? (
        <TeacherPerformanceV2Dashboard teacherId={teacher.id} periodStart={periodStart} periodEnd={periodEnd} report={result.data} />
      ) : (
        <EmptyState title="Rapor yüklenemedi" description={result.error.message} />
      )}
    </div>
  );
}
