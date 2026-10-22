import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addDays, subDays } from "date-fns";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { readLessonWindow } from "@/lib/store";
import { listAssessedLessonIds } from "@/lib/assessment";
import { pendingLessonAssessments, PENDING_LESSON_WINDOW_DAYS } from "@/lib/reports/pending";
import { isOwnStudent } from "@/lib/teacher-portal-scope";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ReportListItem, ReportSectionTitle, ReportShell } from "@/components/reports/report-shell";
import { StudentPicker } from "@/components/reports/student-picker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gelişim raporları", robots: { index: false } };

/**
 * Rapor portalı (2026-10-14) — öğretmenlerin telefondan gelişim raporu doldurduğu sade site (`neviihub.com/gelisim`).
 * Kota: tam okuma yok — referans + son 15 günün ders penceresi; raporlu dersler yalnız `lessonId` ile sorgulanır.
 */
export default async function ReportHomePage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/gelisim");
  }
  if (session.role === "STUDENT") redirect("/ogrenci");

  const now = new Date();
  const data = await readLessonWindow(subDays(now, PENDING_LESSON_WINDOW_DAYS + 1).toISOString(), addDays(now, 1).toISOString());
  const institution = data.settings.shortName || data.settings.name;

  if (session.role !== "TEACHER" || !session.teacherId) {
    return (
      <ReportShell institution={institution} title="Gelişim raporları">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
          Bu sayfa öğretmenlerin rapor yazması içindir. Gönderilen raporları ve bekleyenleri{" "}
          <Link href="/panel/raporlar" className="font-medium text-[var(--color-primary)] underline">
            Raporlar ekranından
          </Link>{" "}
          takip edebilirsiniz.
        </div>
      </ReportShell>
    );
  }

  const teacherId = session.teacherId;
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const students = data.students
    .filter((s) => s.active && !s.deletedAt && isOwnStudent(s, teacherId))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const studentName = new Map(students.map((s) => [s.id, s.name]));
  const myLessons = data.lessons.filter((l) => l.teacherId === teacherId && studentName.has(l.studentId));
  const assessed = await listAssessedLessonIds(session.tenantId, myLessons.map((l) => l.id));
  const pendingLessons = pendingLessonAssessments(myLessons, assessed, teacherId, now.getTime());

  const periodicResult = await listPendingPeriodicAssessmentsTool(
    { role: session.role, userId: session.userId, tenantId: session.tenantId, teacherId, channel: "web" },
    {}
  );
  const pendingPeriods = periodicResult.ok ? periodicResult.data.items : [];

  return (
    <ReportShell
      institution={institution}
      title="Gelişim raporları"
      subtitle={`Merhaba${teacher ? ` ${teacher.name.split(" ")[0]}` : ""}. Raporu bekleyen derslerinize dokunup formu doldurabilirsiniz.`}
    >
      <section className="space-y-2">
        <ReportSectionTitle count={pendingLessons.length}>Raporu bekleyen dersler</ReportSectionTitle>
        {pendingLessons.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
            Son {PENDING_LESSON_WINDOW_DAYS} günde raporu bekleyen dersiniz yok.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingLessons.map((l) => (
              <ReportListItem
                key={l.id}
                href={`/gelisim/${l.studentId}?ders=${encodeURIComponent(l.id)}`}
                title={studentName.get(l.studentId) ?? "Öğrenci"}
                meta={`${formatDateTime(l.startAt)}${l.instrument ? ` · ${l.instrument}` : ""}`}
                badge="Ders"
              />
            ))}
          </ul>
        )}
      </section>

      {pendingPeriods.length > 0 ? (
        <section className="space-y-2">
          <ReportSectionTitle count={pendingPeriods.length}>4 haftalık / 4 derslik onay bekleyenler</ReportSectionTitle>
          <ul className="space-y-2">
            {pendingPeriods.map((p) => (
              <ReportListItem
                key={`${p.studentId}:${p.periodStart}`}
                href={`/gelisim/${p.studentId}?sekme=donemsel&donem=${encodeURIComponent(p.periodStart)}`}
                title={p.studentName}
                meta={`${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}${p.draft ? ` · ${p.draft.lessonCount} ders · Ort. ${p.draft.overallScore.toFixed(1)}/5` : ""}`}
                badge="4 ders özeti"
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <ReportSectionTitle count={students.length}>Öğrencilerim</ReportSectionTitle>
        <StudentPicker
          students={students.map((s) => ({ id: s.id, name: s.name, meta: (s.instruments as string[]).slice(0, 2).join(", ") }))}
        />
      </section>
    </ReportShell>
  );
}
