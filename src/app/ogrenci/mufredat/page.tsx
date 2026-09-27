import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { listCurriculumForStudentTool } from "@/lib/services";
import { CurriculumSummaryCard } from "@/components/curriculum-summary-card";

export const dynamic = "force-dynamic";

export default async function StudentCurriculumPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/mufredat");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");

  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı.
  const studentId = await getPortalPageStudentId(session);
  if (!studentId) {
    redirect("/ogrenci");
  }

  const result = await listCurriculumForStudentTool(session, { studentId });
  const topics = result.ok ? result.data.topics : [];
  const overallPercent = result.ok ? result.data.overallPercent : 0;
  const progressExplanation = result.ok
    ? result.data.progressExplanation
    : "Müfredat yüklenemedi.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50">
      <header className="border-b border-emerald-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link
            href="/ogrenci"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Geri
          </Link>
          <p className="text-sm font-semibold text-[var(--color-text)]">Müfredatım</p>
          <span className="w-10" aria-hidden />
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        <CurriculumSummaryCard
          overallPercent={overallPercent}
          progressExplanation={progressExplanation}
          topics={topics as { id: string; title: string; status: string; progressPercent: number; updatedAt: string }[]}
        />
      </main>
    </div>
  );
}
