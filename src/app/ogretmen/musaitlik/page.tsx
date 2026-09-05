import { redirect } from "next/navigation";
import { PORTAL_RECORD_MISSING_REDIRECT } from "@/lib/auth/portal-record-missing";
import { BackButton } from "@/components/back-button";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { listTeacherAvailabilityRequestsTool } from "@/lib/services";
import { Badge, Card } from "@/components/ui";
import { TeacherAvailabilityForm } from "@/components/teacher-availability-form";
import { dayName, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/**
 * EPIC 9 (IMPLEMENTATION_PLAN.md) — öğretmen kendi müsaitliğini DOĞRUDAN
 * değiştiremez, yalnızca öneri gönderir (bkz. proposeTeacherAvailabilityTool).
 */
export default async function TeacherAvailabilityPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/musaitlik");
  }

  const data = await readData();
  const teacherId = session.teacherId || "t2";
  const teacher = data.teachers.find((t) => t.id === teacherId) ?? data.teachers[0];
  if (!teacher) redirect(PORTAL_RECORD_MISSING_REDIRECT);

  const requestsResult = await listTeacherAvailabilityRequestsTool(session, { teacherId: teacher.id });
  const requests = requestsResult.ok ? requestsResult.data.requests : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Müsaitliğim</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <Card>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cyan-600">Şu anki müsaitlik</p>
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
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Değişiklik için aşağıdan öneri gönderin — yönetici onayı sonrası uygulanır.
          </p>
        </Card>

        <Card>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
            Yeni müsaitlik önerisi
          </p>
          <TeacherAvailabilityForm current={teacher.availability} />
        </Card>

        {requests.length > 0 ? (
          <section>
            <p className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
              Geçmiş önerilerim
            </p>
            <div className="space-y-2">
              {requests.map((r) => (
                <Card key={r.id} className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {formatDateTime(r.createdAt)}
                    </p>
                    <Badge status={r.status}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </div>
                  {r.reviewNote ? (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      Yönetici notu: {r.reviewNote}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
