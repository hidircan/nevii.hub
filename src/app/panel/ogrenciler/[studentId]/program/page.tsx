import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { StudentUpcomingLessons, StudentPastLessons, StudentAttendanceList } from "@/components/student-lesson-lists";
import { AttendanceCalendarPanel } from "@/components/attendance-calendar-panel";
import { formatDateTime } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";

export const dynamic = "force-dynamic";

/**
 * Program & Yoklama sekmesi — "bu öğrenci derslerine geliyor mu?" sorusunun
 * tek ekranı: yaklaşan/geçmiş dersler, işaretlenmiş yoklama, yıllık takvim ve
 * telafi talepleri. Eskiden bunlar dört ayrı bölüm hâlinde aynı uzun sayfada
 * dağınıktı; aralarında gezmek için scroll gerekiyordu.
 */
export default async function StudentScheduleTab({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { data, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const lessons = data.lessons
    .filter((l) => l.studentId === student.id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const now = new Date();
  const upcoming = lessons.filter((l) => new Date(l.startAt) >= now).reverse();
  const past = lessons.filter((l) => new Date(l.startAt) < now);
  const attendanceLessons = lessons.filter((l) => l.studentAttended || l.lessonProcessed || l.opsMakeupFlag);
  const makeupRequests = data.makeupRequests
    .filter((m) => m.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Dersler ve Ders Programı
          <Link
            href={`/panel/program?studentId=${student.id}`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Programda Aç →
          </Link>
        </h2>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Yaklaşan</p>
        <StudentUpcomingLessons lessons={upcoming} teachers={data.teachers} />
        <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Geçmiş</p>
        <StudentPastLessons lessons={past} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yoklama — Geldi / İşlendi / Telafi</h2>
        <StudentAttendanceList lessons={attendanceLessons} />
      </section>

      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Yoklama Takvimi
          <Link
            href={`/ogrenci-dokum/${studentId}`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Yazdır
          </Link>
        </h2>
        <AttendanceCalendarPanel
          studentId={studentId}
          termType={student.termType ?? "guz"}
          canEdit={canManage}
          studentActive={student.active}
        />
      </section>

      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Telafiler
          <Link href="/panel/telafi" className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Telafi Merkezinde Aç →
          </Link>
        </h2>
        {makeupRequests.length === 0 ? (
          <EmptyState title="Telafi kaydı yok" />
        ) : (
          <div className="space-y-2">
            {makeupRequests.map((m) => (
              <Card key={m.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {m.instrument} · {m.reason}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">Son tarih: {formatDateTime(m.expiresAt)}</p>
                  </div>
                  <Badge status={m.status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
