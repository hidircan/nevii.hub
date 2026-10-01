import Link from "@/components/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { readReferenceData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { Card, EmptyState, Badge } from "@/components/ui";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Öğretmenin gelişim değerlendirmesi oluşturabileceği kendi öğrencileri. */
export default async function TeacherAssessmentStudentsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/degerlendirme");
  }

  const data = await readReferenceData();
  const teacherId = session.teacherId || "t1";
  const students = data.students.filter((s) => s.active && s.teacherId === teacherId);
  const pendingResult = await listPendingPeriodicAssessmentsTool(
    { role: session.role, userId: session.userId, tenantId: session.tenantId, teacherId: session.teacherId, channel: "web" },
    {}
  );
  const pendingCount = pendingResult.ok ? pendingResult.data.items.length : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)]">Gelişim Değerlendirmesi</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-2 px-4 py-6 pb-24">
        <Link href="/ogretmen/donemsel-degerlendirme">
          <Card className="!p-4 hover:border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--color-text)]">4 Haftalık Genel Değerlendirme</p>
                <p className="text-sm text-[var(--color-text-muted)]">Dönemsel gelişim değerlendirmelerini gönder</p>
              </div>
              {pendingCount > 0 ? <Badge status="pending">{pendingCount} bekliyor</Badge> : <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />}
            </div>
          </Card>
        </Link>

        {students.length === 0 ? (
          <EmptyState
            title="Öğrenci bulunamadı"
            description="Değerlendirme oluşturabileceğiniz aktif öğrenciniz yok."
          />
        ) : (
          students.map((student) => (
            <Link key={student.id} href={`/ogretmen/degerlendirme/${student.id}`}>
              <Card className="!p-4 hover:border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{student.name}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">{student.instruments.join(", ")}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                </div>
              </Card>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
