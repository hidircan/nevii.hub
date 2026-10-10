import { redirect, notFound } from "next/navigation";
import { listTeacherAvailabilityRequestsTool } from "@/lib/services";
import { Badge, Card } from "@/components/ui";
import { TeacherAvailabilityReview } from "@/components/teacher-availability-review";
import { TeacherAvailabilityEditor } from "@/components/teacher-availability-editor";
import { formatDateTime } from "@/lib/utils";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/**
 * Yönetici öğretmen müsaitliğini doğrudan düzenler. Öğretmen öneri yolu
 * kapatıldı; önceden gelmiş bekleyen öneriler hâlâ incelenebilir.
 * Layout kimlik başlığını sağlar — burada geri/başlık tekrarlanmaz.
 */
export default async function TeacherAvailabilityTab({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const { session, data, teacher, canManage } = await loadTeacherPageContext(teacherId);
  if (!canManage) redirect("/panel");
  if (!teacher) notFound();

  const requestsResult = await listTeacherAvailabilityRequestsTool(session, { teacherId });
  const requests = requestsResult.ok ? requestsResult.data.requests : [];
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">Müsait günler ve saatler</p>
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
        <section>
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Onay bekleyen eski öneriler</p>
          <div className="space-y-3">
            {pending.map((r) => (
              <TeacherAvailabilityReview key={r.id} request={r} currentAvailability={teacher.availability} />
            ))}
          </div>
        </section>
      ) : null}

      {reviewed.length > 0 ? (
        <section>
          <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Geçmiş öneriler</p>
          <div className="space-y-2">
            {reviewed.map((r) => (
              <Card key={r.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--color-text-muted)]">{formatDateTime(r.createdAt)}</p>
                  <Badge status={r.status}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </div>
                {r.reviewNote ? (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Not: {r.reviewNote}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
