import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { listTeachingMaterialsForTeacherTool } from "@/lib/services";
import { Card, EmptyState } from "@/components/ui";
import { TeachingMaterialForm } from "@/components/teaching-material-form";

export const dynamic = "force-dynamic";

/**
 * EPIC 6D (IMPLEMENTATION_PLAN.md) — öğretmenin materyal/pratik videosu
 * paylaştığı ekran. Hedefleme sunucu tarafında uygulanır (bkz.
 * matchesMaterialAudience) — bu sayfa yalnızca oluşturma formunu ve kendi
 * paylaştıklarının listesini gösterir.
 */
export default async function TeacherMaterialsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/materyaller");
  }

  const result = await listTeachingMaterialsForTeacherTool(session);
  const materials = result.ok ? result.data.materials : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Materyaller</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <Card>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
            Yeni materyal paylaş
          </p>
          <TeachingMaterialForm />
        </Card>

        <section>
          <p className="mb-2 px-1 text-sm font-semibold text-[var(--color-text)] dark:text-slate-200">
            Paylaştıklarım
          </p>
          {materials.length === 0 ? (
            <EmptyState title="Henüz materyal paylaşmadınız" />
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <Card key={m.id} className="!p-4">
                  <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{m.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{m.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {[m.targetStudentType, m.targetInstrument, m.targetLevel].filter(Boolean).join(" · ") ||
                      "Tüm öğrencilere görünür"}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
