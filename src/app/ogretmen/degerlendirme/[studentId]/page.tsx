import Link from "@/components/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { readStudentScope } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { listAssessmentsForStudentTool } from "@/lib/services";
import { computeOverallScore } from "@/lib/assessment/score";
import { Card, EmptyState } from "@/components/ui";
import { LessonAssessmentForm } from "@/components/lesson-assessment-form";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherAssessmentFormPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/ogretmen/degerlendirme/${studentId}`);
  }

  // Kota (2026-10-13): yalnız bu öğrencinin dersleri gerekir → tek öğrenci dilimi (tam okuma değil).
  const data = await readStudentScope(studentId);
  const teacherId = session.teacherId || "t1";
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const student = data.students.find((s) => s.id === studentId);

  if (!student || student.teacherId !== teacherId) {
    redirect("/ogretmen/degerlendirme");
  }

  const lessons = data.lessons
    .filter((l) => l.studentId === studentId && l.teacherId === teacherId)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .map((l) => ({ id: l.id, startAt: l.startAt }));

  const pastResult = await listAssessmentsForStudentTool(session, { studentId });
  const past = pastResult.ok ? pastResult.data.assessments : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen/degerlendirme" />
          <p className="text-sm font-semibold text-[var(--color-text)]">{student.name}</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yeni değerlendirme</h2>
          <LessonAssessmentForm
            studentId={studentId}
            lessons={lessons}
            defaultTeacherName={teacher?.name ?? ""}
          />
        </Card>

        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Geçmiş değerlendirmeler</h2>
        {past.length === 0 ? (
          <EmptyState title="Henüz değerlendirme yok" />
        ) : (
          <div className="space-y-2">
            {past.map((a) => (
              <Link key={a.id} href={`/degerlendirme/${a.id}`}>
                <Card className="!p-4 hover:border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-500" />
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {formatDate(a.createdAt, "d MMMM yyyy")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-amber-700">
                      {computeOverallScore(a).toFixed(1)} / 5
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
