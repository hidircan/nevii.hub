import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";
import { PeriodicAssessmentPendingList } from "@/components/periodic-assessment-pending-list";

export const dynamic = "force-dynamic";

/** Faz 3B — öğretmenin bekleyen dört haftalık genel gelişim değerlendirmeleri. */
export default async function TeacherPeriodicAssessmentPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/donemsel-degerlendirme");
  }

  const result = await listPendingPeriodicAssessmentsTool(
    { role: session.role, userId: session.userId, tenantId: session.tenantId, teacherId: session.teacherId, channel: "web" },
    {}
  );
  const items = result.ok ? result.data.items : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)]">4 Haftalık Değerlendirme</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        <p className="text-xs text-[var(--color-text-muted)]">
          Her öğrenci için ilk dersinden itibaren 4 haftalık dönemler tamamlandıkça burada listelenir. Bir dönem
          için değerlendirme gönderildikten sonra o dönem tekrar görünmez.
        </p>
        <PeriodicAssessmentPendingList items={items} />
      </main>
    </div>
  );
}
