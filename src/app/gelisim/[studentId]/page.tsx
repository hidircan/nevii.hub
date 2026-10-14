import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readStudentScope } from "@/lib/store";
import { isOwnStudent, ownStudentLessons } from "@/lib/teacher-portal-scope";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";
import { cn } from "@/lib/utils";
import { ReportShell } from "@/components/reports/report-shell";
import { LessonAssessmentMobileForm } from "@/components/reports/lesson-assessment-mobile-form";
import { PeriodicAssessmentMobileForm } from "@/components/reports/periodic-assessment-mobile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gelişim raporu", robots: { index: false } };

type Props = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ sekme?: string; ders?: string; donem?: string }>;
};

/** Rapor portalı (2026-10-14) — tek öğrenci: ders gelişimi / 4 haftalık form. Kota: tek öğrenci dilimi. */
export default async function ReportStudentPage({ params, searchParams }: Props) {
  const { studentId } = await params;
  const { sekme, ders, donem } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/gelisim/${encodeURIComponent(studentId)}`);
  }
  if (session.role !== "TEACHER" || !session.teacherId) redirect("/gelisim");
  const teacherId = session.teacherId;

  const data = await readStudentScope(studentId);
  const institution = data.settings.shortName || data.settings.name;
  const student = data.students.find((s) => s.id === studentId);
  if (!student || student.deletedAt || !isOwnStudent(student, teacherId)) {
    return (
      <ReportShell institution={institution} title="Öğrenci bulunamadı" backHref="/gelisim">
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
          Bu öğrenci size atanmamış veya kaydı bulunamadı. Listeden kendi öğrencinizi seçin; öğrenciniz görünmüyorsa
          kurum yöneticisinden branş kaydınızı kontrol etmesini isteyin.
        </p>
      </ReportShell>
    );
  }

  const teacher = data.teachers.find((t) => t.id === teacherId);
  const nowIso = new Date().toISOString();
  const lessons = ownStudentLessons(data.lessons, teacherId, student.id)
    .filter((l) => l.startAt <= nowIso && l.status !== "cancelled")
    .slice(0, 10)
    .map((l) => ({ id: l.id, startAt: l.startAt, instrument: l.instrument }));

  const periodic = await listPendingPeriodicAssessmentsTool(
    { role: session.role, userId: session.userId, tenantId: session.tenantId, teacherId, channel: "web" },
    {}
  );
  const periods = (periodic.ok ? periodic.data.items : []).filter((p) => p.studentId === student.id);
  const period = periods.find((p) => p.periodStart === donem) ?? periods[0];
  const tab = sekme === "donemsel" ? "donemsel" : "ders";
  const done = { href: "/gelisim", label: "Bekleyen raporlara dön" };

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] text-sm font-medium transition",
      active ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-muted)]"
    );

  return (
    <ReportShell institution={institution} title={student.name} backHref="/gelisim">
      <nav aria-label="Rapor türü" className="flex gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface-muted)] p-1">
        <Link href={`/gelisim/${student.id}`} aria-current={tab === "ders" ? "page" : undefined} className={tabClass(tab === "ders")}>
          Ders gelişimi
        </Link>
        <Link
          href={`/gelisim/${student.id}?sekme=donemsel`}
          aria-current={tab === "donemsel" ? "page" : undefined}
          className={tabClass(tab === "donemsel")}
        >
          4 haftalık{periods.length > 0 ? ` (${periods.length})` : ""}
        </Link>
      </nav>

      {tab === "ders" ? (
        <LessonAssessmentMobileForm
          studentId={student.id}
          lessons={lessons}
          defaultLessonId={ders}
          teacherName={teacher?.name ?? ""}
          draftOwner={teacherId}
          doneHref={done}
        />
      ) : period ? (
        <PeriodicAssessmentMobileForm
          key={period.periodStart}
          studentId={student.id}
          period={{ periodStart: period.periodStart, periodEnd: period.periodEnd }}
          draftOwner={teacherId}
          doneHref={done}
        />
      ) : (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-muted)]">
          Bu öğrenci için bekleyen 4 haftalık değerlendirme yok. Bir sonraki dönem tamamlandığında burada görünecek.
        </p>
      )}
    </ReportShell>
  );
}
