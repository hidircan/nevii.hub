import { redirect, notFound } from "next/navigation";
import { listTeacherFeedbackForReviewTool } from "@/lib/services";
import { Card, EmptyState, StatCard } from "@/components/ui";
import { TeacherFeedbackReviewList } from "@/components/teacher-feedback-review-list";
import { AiFeedbackSummaryButton } from "@/components/ai-feedback-summary-button";
import { TEACHER_FEEDBACK_CRITERIA } from "@/lib/teacher-feedback";
import type { TeacherFeedbackCriterionKey } from "@/lib/types";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

/**
 * Yönetici inceleme ekranı — ham kimlik VARSAYILAN gizli (maskeli liste),
 * gerekçeli/audit'li reveal aksiyonu her satırda mevcut.
 */
export default async function TeacherFeedbackReviewTab({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ status?: string; sourceType?: string }>;
}) {
  const { teacherId } = await params;
  const { status, sourceType } = await searchParams;

  const { session, teacher, canManage } = await loadTeacherPageContext(teacherId);
  if (!canManage) redirect("/panel");
  if (!teacher) notFound();

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
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Geri Bildirim İncelemesi</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Ham öğrenci kimliği varsayılan gizli; her satırdan gerekçeli/audit&apos;li olarak açılabilir.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam yanıt" value={rows.length} />
        <StatCard label="Bekleyen" value={pendingCount} accent="warning" />
        <StatCard label="Devam etmek istiyor" value={continueCounts.yes} accent="success" />
        <StatCard label="Devam etmek istemiyor" value={continueCounts.no} accent="danger" />
      </div>

      {rows.length > 0 ? (
        <Card>
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

      <AiFeedbackSummaryButton subject="teacher" subjectId={teacher.id} />

      {rows.length === 0 ? (
        <EmptyState title="Geri bildirim yok" description="Bu öğretmen için henüz inceleme kaydı bulunmuyor." />
      ) : (
        <TeacherFeedbackReviewList rows={rows} />
      )}
    </div>
  );
}
