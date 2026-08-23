import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { listTrialLessonsTool } from "@/lib/services";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { TrialLessonCreateForm } from "@/components/trial-lesson-create-form";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** PRODUCT_BACKLOG §5 — deneme dersleri operasyon ekranı */
export default async function TrialLessonsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/deneme");
  }
  if (session.role === "STUDENT") redirect("/login");

  const data = await readData();
  const result = await listTrialLessonsTool(session);
  const trials = result.ok ? result.data.trials : [];

  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName }));

  return (
    <div className="space-y-6">
      <PageHeader title="Deneme dersleri" />
      <Card>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-amber-600">
          Deneme dersi planla
        </p>
        <TrialLessonCreateForm teachers={teachers} branches={branches} />
      </Card>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Kayıtlar ({trials.length})</h2>
        {trials.length === 0 ? (
          <EmptyState title="Henüz deneme dersi yok" />
        ) : (
          <div className="space-y-2">
            {trials.map((t) => (
              <Card key={t.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{t.name}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {t.phone} · {t.instrument} · {formatDateTime(t.startAt)} · {t.durationMinutes} dk
                    </p>
                  </div>
                  <Badge status={t.status}>{t.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <Link href="/panel/program" className="text-sm font-medium text-amber-700">
        ← Ders programı
      </Link>
    </div>
  );
}
