import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireSessionContext } from "@/lib/auth/session";
import { getOwnTeacherFeedbackSummaryTool } from "@/lib/services";
import { Card, EmptyState } from "@/components/ui";
import { TEACHER_FEEDBACK_CRITERIA, TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES } from "@/lib/teacher-feedback";

export const dynamic = "force-dynamic";

/**
 * Öğretmenin GÖREBİLECEĞİ TEK geri bildirim ekranı — ham kayıt/kimlik asla
 * yok, yalnızca anonim eşik sağlanınca kriter ortalamaları + devam tercihi
 * dağılımı + yönetimin paylaşmayı seçtiği kimliksiz yorumlar.
 */
export default async function TeacherFeedbackSummaryPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/geri-bildirim");
  }
  if (session.role === "PARENT") redirect("/veli");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const result = await getOwnTeacherFeedbackSummaryTool(session);
  const summary = result.ok ? result.data : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)]">Geri bildirim özeti</p>
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <p className="px-1 text-xs text-[var(--color-text-muted)]">
          Bu özet tamamen anonimdir — hangi öğrenci/velinin ne yazdığını asla göremezsiniz. Yalnızca en az{" "}
          {TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES} yanıt toplandığında görünür.
        </p>

        {!summary || !summary.eligible ? (
          <EmptyState
            title="Henüz yeterli yanıt yok"
            description={`En az ${TEACHER_FEEDBACK_MIN_ANONYMOUS_RESPONSES} anonim yanıt toplanınca burada bir özet göreceksiniz (şu an: ${summary?.responseCount ?? 0}).`}
          />
        ) : (
          <>
            <Card>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
                Kriter ortalamaları ({summary.responseCount} yanıt)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {TEACHER_FEEDBACK_CRITERIA.map(({ key, label }) => (
                  <div key={key} className="rounded-lg bg-cyan-50 p-3 text-center">
                    <p className="text-lg font-semibold text-cyan-800">{summary.criteriaAverages?.[key]}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{label}</p>
                  </div>
                ))}
              </div>
            </Card>

            {summary.continueDistribution ? (
              <Card>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
                  Derslere devam tercihi
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-emerald-700">{summary.continueDistribution.yes}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Evet</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-amber-700">{summary.continueDistribution.unsure}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Kararsız</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-rose-700">{summary.continueDistribution.no}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Hayır</p>
                  </div>
                </div>
              </Card>
            ) : null}

            {summary.sharedComments.length > 0 ? (
              <Card>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-cyan-600">
                  Yönetimin paylaştığı yapıcı görüşler
                </p>
                <div className="space-y-2">
                  {summary.sharedComments.map((comment, i) => (
                    <p key={i} className="rounded-lg bg-[var(--color-surface-muted)] p-2.5 text-sm text-[var(--color-text-muted)]">
                      {comment}
                    </p>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
