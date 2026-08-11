import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listTeacherFeedbackForReviewTool } from "@/lib/services";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TeacherFeedbackReviewList } from "@/components/teacher-feedback-review-list";
import { TEACHER_FEEDBACK_CRITERIA } from "@/lib/teacher-feedback";
import type { TeacherFeedbackCriterionKey } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Yönetici inceleme ekranı — ham kimlik VARSAYILAN gizli (maskeli liste),
 * gerekçeli/audit'li reveal aksiyonu her satırda mevcut.
 */
export default async function TeacherFeedbackReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ status?: string; sourceType?: string }>;
}) {
  const { teacherId } = await params;
  const { status, sourceType } = await searchParams;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}/geri-bildirim`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!teacher) {
    return (
      <div>
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mb-3" />
        <PageHeader title="Öğretmen bulunamadı" />
        <EmptyState title="Öğretmen bulunamadı" description="Bu kayıt mevcut kurum kapsamınızda değil." />
      </div>
    );
  }

  const result = await listTeacherFeedbackForReviewTool(session, { teacherId, status, sourceType });
  const rows = result.ok ? result.data.feedback : [];

  const criteriaAverages: Partial<Record<TeacherFeedbackCriterionKey, number>> = {};
  for (const { key } of TEACHER_FEEDBACK_CRITERIA) {
    if (rows.length === 0) continue;
    const sum = rows.reduce((s, r) => s + (r.scores[key] ?? 0), 0);
    criteriaAverages[key] = Math.round((sum / rows.length) * 10) / 10;
  }
  const continueCounts = { yes: 0, unsure: 0, no: 0 };
  for (const r of rows) {
    if (r.continueWithTeacher) continueCounts[r.continueWithTeacher] += 1;
  }
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      <BackButton fallbackHref={`/panel/ogretmenler/${teacher.id}`} label="Öğretmen detayına dön" className="mb-3" />
      <PageHeader
        title={`${teacher.name} — Geri Bildirim İncelemesi`}
        description="Ham öğrenci kimliği varsayılan gizli; her satırdan gerekçeli/audit'li olarak açılabilir."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam yanıt" value={rows.length} />
        <StatCard label="Bekleyen" value={pendingCount} accent="warning" />
        <StatCard label="Devam etmek istiyor" value={continueCounts.yes} accent="success" />
        <StatCard label="Devam etmek istemiyor" value={continueCounts.no} accent="danger" />
      </div>

      {rows.length > 0 ? (
        <Card className="mb-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Kriter ortalamaları (1–5)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TEACHER_FEEDBACK_CRITERIA.map(({ key, label }) => (
              <div key={key} className="text-center">
                <p className="text-lg font-semibold text-[var(--color-primary)]">{criteriaAverages[key] ?? "—"}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <TeacherFeedbackReviewList rows={rows} />
    </div>
  );
}
