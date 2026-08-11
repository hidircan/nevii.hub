import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listTeacherAvailabilityRequestsTool } from "@/lib/services";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TeacherAvailabilityReview } from "@/components/teacher-availability-review";
import { dayName, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — yönetici müsaitlik önerilerini onaylar/
 * reddeder. Onaylanan öneri hemen Teacher.availability'ye uygulanır.
 */
export default async function TeacherAvailabilityReviewPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}/musaitlik`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === teacherId);

  if (!teacher) {
    return (
      <div>
        <PageHeader title="Müsaitlik" description="Öğretmen bulunamadı." />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu öğretmen kurumunuza kayıtlı değil veya kaldırılmış olabilir."
        />
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mt-4 text-amber-600 hover:text-amber-700" />
      </div>
    );
  }

  const requestsResult = await listTeacherAvailabilityRequestsTool(session, { teacherId });
  const requests = requestsResult.ok ? requestsResult.data.requests : [];
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div>
      <BackButton fallbackHref={`/panel/ogretmenler/${teacher.id}`} label="Öğretmen detayına dön" className="mb-3" />
      <PageHeader title={`${teacher.name} — Müsaitlik`} />

      <Card className="mb-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
          Şu anki müsaitlik
        </p>
        {teacher.availability.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Kayıtlı müsaitlik yok.</p>
        ) : (
          <div className="space-y-1">
            {teacher.availability
              .slice()
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((w) => (
                <p key={w.dayOfWeek} className="text-sm text-[var(--color-text-muted)] dark:text-slate-300">
                  {dayName(w.dayOfWeek)}: {w.start}–{w.end}
                </p>
              ))}
          </div>
        )}
      </Card>

      <section className="mb-4">
        <p className="mb-2 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
          Onay bekleyen öneriler
        </p>
        {pending.length === 0 ? (
          <EmptyState title="Bekleyen öneri yok" />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <TeacherAvailabilityReview key={r.id} request={r} currentAvailability={teacher.availability} />
            ))}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section>
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Geçmiş öneriler
          </p>
          <div className="space-y-2">
            {reviewed.map((r) => (
              <Card key={r.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{formatDateTime(r.createdAt)}</p>
                  <Badge status={r.status}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </div>
                {r.reviewNote ? (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Not: {r.reviewNote}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
