import Link from "@/components/link";
import { redirect } from "next/navigation";
import { PORTAL_RECORD_MISSING_REDIRECT } from "@/lib/auth/portal-record-missing";
import { ArrowLeft } from "lucide-react";
import { readReferenceData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { listTeachingMaterialsForStudentTool } from "@/lib/services";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — öğretmenin öğrenciye hedeflediği
 * materyal/pratik videoları. Hedefleme sunucu tarafında yapılır (bkz.
 * listTeachingMaterialsForStudentTool + matchesMaterialAudience).
 */
export default async function StudentMaterialsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/materyaller");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");

  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı (cookie/JWT tercihi
  // sunucuda doğrulanır); `|| "s1"` yedeği KALDIRILDI (başka öğrencinin verisi asla açılmaz).
  const studentId = await getPortalPageStudentId(session);
  if (!studentId) redirect(PORTAL_RECORD_MISSING_REDIRECT);
  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student || (session.role === "STUDENT" && (!student.active || student.deletedAt))) {
    redirect(PORTAL_RECORD_MISSING_REDIRECT);
  }

  const result = await listTeachingMaterialsForStudentTool(session, { studentId: student.id });
  const materials = result.ok ? result.data.materials : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50">
      <header className="border-b border-emerald-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link href="/ogrenci" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            <ArrowLeft className="h-4 w-4" /> Geri
          </Link>
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Materyaller</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-2 px-4 py-6 pb-24">
        {materials.length === 0 ? (
          <EmptyState title="Henüz materyal yok" description="Öğretmeniniz materyal paylaştığında burada görünecek." />
        ) : (
          materials.map((m) => (
            <Card key={m.id}>
              <p className="font-medium text-[var(--color-text)] dark:text-slate-50">{m.title}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{m.description}</p>
              {m.fileData ? (
                <a
                  href={`/api/v1/teaching-materials/${m.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-emerald-600 hover:underline"
                >
                  Dosyayı görüntüle
                </a>
              ) : null}
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
