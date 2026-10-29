import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { PageHeader, EmptyState } from "@/components/ui";
import { AttendanceCalendarPanel } from "@/components/attendance-calendar-panel";
import { effectiveEnrollments, enrollmentDisplayName } from "@/lib/student-enrollments";
import { StudentAttendancePicker } from "@/components/student-attendance-picker";
import { attendancePickerStudents, resolveAttendanceCalendarStudentId } from "@/lib/attendance-calendar";

export const dynamic = "force-dynamic";

/**
 * ÖNCELİK — Yoklama Takvimi: öğrenci odaklı yoklama ekranı. Ders Programı ile
 * AYNI kaynağı (Lesson satırı, `setLessonOpsFlagTool`/`LessonOpsActions`)
 * kullanan `AttendanceCalendarPanel`'i gömer — ikinci bir yoklama yazma yolu
 * YOK. Varsayılan dönem seçimi öğrencinin (server tarafında, tenant-scoped
 * veriden okunan) `termType` alanından gelir; `studentId` query param'ı
 * yalnızca bu sayfanın scoped öğrenci listesinde varsa kabul edilir —
 * aksi halde seçici gösterilir, takvim render edilmez.
 */
export default async function YoklamaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/yoklama");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const sp = await searchParams;
  const requestedStudentId = typeof sp.studentId === "string" ? sp.studentId : null;

  const scopedStudentIds = data.students.map((s) => s.id);
  const studentId = resolveAttendanceCalendarStudentId(requestedStudentId, scopedStudentIds);
  const student = studentId ? data.students.find((s) => s.id === studentId) ?? null : null;

  const studentOptions = attendancePickerStudents(data.students, studentId).map(({ student: s, inactive }) => ({
    id: s.id,
    name: inactive ? `${s.name} (pasif)` : s.name,
    branchName: data.settings.branches.find((b) => b.id === s.branchId)?.shortName,
  }));

  // "Tüm kurumlar" birleşik görünümde hiçbir yazma yapılamaz (bkz. CLAUDE.md
  // Multi-tenancy notu) — bu yalnızca UI'daki ikinci savunma, asıl engel
  // server-side tenant çözümlemesindedir.
  const canEdit = (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN") && kurum.scope.mode === "single";

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      {student ? (
        <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      ) : (
        <AssistantPageContext entity={{ kind: "page", label: "Yoklama Takvimi" }} />
      )}
      <PageHeader title="Yoklama Takvimi" />

      <div className="mb-4">
        <StudentAttendancePicker students={studentOptions} selectedStudentId={studentId} />
      </div>

      {!student ? (
        <EmptyState title="Öğrenci seçilmedi" description="Takvimi görüntülemek için yukarıdan bir öğrenci seçin." />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{student.name}</h2>
          <AttendanceCalendarPanel
            key={student.id}
            studentId={student.id}
            termType={student.termType ?? "guz"}
            canEdit={canEdit}
            studentActive={student.active}
            branches={(() => {
              // 2026-10-09 — çok branşlı öğrencide takvim/tahsilat branş başınadır.
              const list = effectiveEnrollments(student, data.teachers);
              return list.map((e) => ({ id: e.id, label: `${enrollmentDisplayName(e, list, data.teachers)}${e.active ? "" : " (sonlandı)"}` }));
            })()}
            initialBranchId={effectiveEnrollments(student, data.teachers).find((e) => e.active)?.id}
          />
        </>
      )}
    </div>
  );
}
