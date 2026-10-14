import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { buildStudentMakeupSummary, MAKEUP_STAGE_LABEL } from "@/lib/makeup-student-summary";
import { StudentUpcomingLessons, StudentPastLessons, StudentAttendanceList } from "@/components/student-lesson-lists";
import { AttendanceCalendarPanel } from "@/components/attendance-calendar-panel";
import { formatDateTime } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";
import { effectiveEnrollments, enrollmentDisplayName, lessonEnrollmentId } from "@/lib/student-enrollments";

export const dynamic = "force-dynamic";

/**
 * Program & Yoklama sekmesi — "bu öğrenci derslerine geliyor mu?" sorusunun
 * tek ekranı: yaklaşan/geçmiş dersler, işaretlenmiş yoklama, yıllık takvim ve
 * telafi talepleri. Eskiden bunlar dört ayrı bölüm hâlinde aynı uzun sayfada
 * dağınıktı; aralarında gezmek için scroll gerekiyordu.
 */
export default async function StudentScheduleTab({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ brans?: string }>;
}) {
  const { studentId } = await params;
  const { brans } = await searchParams;
  const { data, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  // 2026-10-09 — branş filtresi: "Tümü" (tüm branşlar, ders satırında enstrüman yazar) veya tek branş kaydı.
  // Ders branşı açık bağdan (yoksa tek eşleşmeden) çözülür — aynı enstrümanda iki kayıt karışmaz.
  const branchList = effectiveEnrollments(student, data.teachers);
  const branchOptions = branchList.map((e) => ({
    id: e.id,
    label: `${enrollmentDisplayName(e, branchList, data.teachers)}${e.active ? "" : " (sonlandı)"}`,
  }));
  const filterBranch = branchList.length > 1 && brans && branchList.some((e) => e.id === brans) ? brans : undefined;
  const lessons = data.lessons
    .filter((l) => l.studentId === student.id && (!filterBranch || lessonEnrollmentId(student, l, data.teachers) === filterBranch))
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const now = new Date();
  const upcoming = lessons.filter((l) => new Date(l.startAt) >= now).reverse();
  const past = lessons.filter((l) => new Date(l.startAt) < now);
  const attendanceLessons = lessons.filter((l) => l.studentAttended || l.lessonProcessed || l.opsMakeupFlag);
  // Telafi hakkı branş başınadır: branş seçiliyse hak ve talepler o branşın; "Tümü"de tek branşlı öğrenciyle aynı.
  const makeups = buildStudentMakeupSummary(data, student.id, undefined, filterBranch);

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
            href={`/ogrenci-dokum/${studentId}${
              (filterBranch ?? (branchList.length > 1 ? branchList.find((e) => e.active)?.id : undefined))
                ? `?brans=${encodeURIComponent(filterBranch ?? branchList.find((e) => e.active)!.id)}`
                : ""
            }`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Yazdır
          </Link>
        </h2>
        <AttendanceCalendarPanel
          key={filterBranch ?? "tumu"}
          studentId={studentId}
          termType={student.termType ?? "guz"}
          canEdit={canManage}
          studentActive={student.active}
          branches={branchOptions}
          initialBranchId={filterBranch ?? branchList.find((e) => e.active)?.id}
        />
      </section>

      <section id="telafiler" aria-labelledby="telafi-baslik">
        <h2 id="telafi-baslik" className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Telafiler
          <Link
            href={`/panel/telafi?ogrenci=${encodeURIComponent(student.id)}`}
            className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Telafi Merkezinde Aç →
          </Link>
        </h2>
        {/* 2026-10-04 — HAK (dönem kotası) ile TALEP/DERS aşamaları ayrı gösterilir; karıştırılmaz. */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Card className="!p-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">Dönem telafi hakkı · {makeups.quota.periodLabel}</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {makeups.quota.remaining} kalan / {makeups.quota.allowance}
            </p>
          </Card>
          {(["pending", "planned", "completed"] as const).map((k) => (
            <Card key={k} className="!p-3">
              <p className="text-[11px] text-[var(--color-text-muted)]">{MAKEUP_STAGE_LABEL[k]}</p>
              <p className="text-sm font-semibold text-[var(--color-text)]">{makeups.counts[k]}</p>
            </Card>
          ))}
          <Card className="!p-3">
            <p className="text-[11px] text-[var(--color-text-muted)]">İptal / süresi dolan</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">{makeups.counts.cancelled + makeups.counts.expired}</p>
          </Card>
        </div>
        {makeups.rows.length === 0 ? (
          <EmptyState title="Telafi kaydı yok" />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Kaynak ders</th>
                  <th className="px-3 py-2 font-medium">Eğitim / öğretmen</th>
                  <th className="px-3 py-2 font-medium">Süre</th>
                  <th className="px-3 py-2 font-medium">Telafi dersi</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {makeups.rows.map((r) => (
                  <tr key={r.requestId}>
                    <td className="px-3 py-2">
                      {r.sourceLessonAt ? formatDateTime(r.sourceLessonAt) : "—"}
                      <span className="block text-[var(--color-text-muted)]">{r.reason}</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.instrument}
                      <span className="block text-[var(--color-text-muted)]">{r.sourceTeacherName ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2">{r.durationMinutes ? `${r.durationMinutes} dk` : "—"}</td>
                    <td className="px-3 py-2">
                      {r.plannedLessonAt ? (
                        <>
                          {formatDateTime(r.plannedLessonAt)}
                          <span className="block text-[var(--color-text-muted)]">{r.plannedTeacherName ?? ""}</span>
                        </>
                      ) : r.stage === "pending" ? (
                        <span className="text-[var(--color-text-muted)]">Son gün {formatDateTime(r.expiresAt)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{MAKEUP_STAGE_LABEL[r.stage]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
