import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listTeacherAvailabilityRequestsTool } from "@/lib/services";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TeacherAvailabilityReview } from "@/components/teacher-availability-review";
import { TeacherAvailabilityEditor } from "@/components/teacher-availability-editor";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/**
 * Yönetici öğretmen müsaitliğini doğrudan düzenler (2026-09-17). Öğretmen
 * öneri yolu kapatıldı; önceden gelmiş bekleyen öneriler hâlâ incelenebilir.
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
          Müsait günler ve saatler
        </p>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Müsaitliği yalnız yöneticiler düzenler; öğretmen kendi portalında yalnız görüntüler.
        </p>
        <TeacherAvailabilityEditor
          teacherId={teacher.id}
          initialRows={teacher.availability}
          branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
        />
      </Card>

      {pending.length > 0 ? (
        <section className="mb-4">
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Onay bekleyen eski öneriler
          </p>
          <div className="space-y-3">
            {pending.map((r) => (
              <TeacherAvailabilityReview key={r.id} request={r} currentAvailability={teacher.availability} />
            ))}
          </div>
        </section>
      ) : null}

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
