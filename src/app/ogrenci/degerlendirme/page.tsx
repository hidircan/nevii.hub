import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_RECORD_MISSING_REDIRECT } from "@/lib/auth/portal-record-missing";
import { ArrowLeft } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { readData } from "@/lib/store";
import { getOwnTeacherFeedbackThisMonthTool } from "@/lib/services";
import { TeacherFeedbackCards, type EligibleTeacher } from "@/components/teacher-feedback-cards";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Değerlendirmeye "yakın geçmiş" sayılan pencere. */
const RECENT_LESSON_WINDOW_DAYS = 90;

export default async function StudentTeacherFeedbackPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/degerlendirme");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role !== "STUDENT" && session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/login?next=/ogrenci/degerlendirme");
  }

  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı.
  const studentId = await getPortalPageStudentId(session);
  if (!studentId) redirect(PORTAL_RECORD_MISSING_REDIRECT);
  const data = await readData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student || (session.role === "STUDENT" && (!student.active || student.deletedAt))) {
    redirect(PORTAL_RECORD_MISSING_REDIRECT);
  }

  // Değerlendirilebilir öğretmenler: mevcut atanmış öğretmen + son
  // RECENT_LESSON_WINDOW_DAYS içinde bu öğrenciyle dersi olan öğretmenler.
  // URL/ID manipülasyonuyla ilişkisiz bir öğretmen asla bu listeye giremez
  // — liste tamamen sunucuda, öğrencinin GERÇEK ders kayıtlarından türetilir.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_LESSON_WINDOW_DAYS);
  const recentLessons = data.lessons.filter(
    (l) => l.studentId === student.id && new Date(l.startAt) >= cutoff
  );
  const teacherIds = new Set<string>(recentLessons.map((l) => l.teacherId));
  if (student.teacherId) teacherIds.add(student.teacherId);

  const eligibleTeachers: EligibleTeacher[] = [];
  for (const teacherId of teacherIds) {
    const teacher = data.teachers.find((t) => t.id === teacherId);
    if (!teacher) continue;
    const lastLesson = recentLessons
      .filter((l) => l.teacherId === teacherId)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
    const existingResult = await getOwnTeacherFeedbackThisMonthTool(session, { studentId: student.id, teacherId });
    eligibleTeachers.push({
      teacherId,
      name: teacher.name,
      instruments: teacher.instruments,
      lastLessonDate: lastLesson ? formatDate(lastLesson.startAt) : undefined,
      initialFeedback:
        existingResult.ok && existingResult.data.feedback
          ? {
              scores: existingResult.data.feedback.scores,
              continueWithTeacher: existingResult.data.feedback.continueWithTeacher,
              comment: existingResult.data.feedback.comment,
            }
          : null,
    });
  }
  eligibleTeachers.sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50">
      <header className="border-b border-emerald-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link href="/ogrenci" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Geri
          </Link>
          <p className="text-sm font-semibold text-[var(--color-text)]">Öğretmen değerlendirmesi</p>
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <p className="px-1 text-xs text-[var(--color-text-muted)]">
          Bu geri bildirim yalnızca okul yönetimi tarafından görüntülenir; öğretmenin kendisine veya başka
          bir öğrenciye/veliye gösterilmez. Kamuya açık bir puanlama veya sıralama değildir.
        </p>
        <TeacherFeedbackCards studentId={student.id} teachers={eligibleTeachers} />
      </main>
    </div>
  );
}
