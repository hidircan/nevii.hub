import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { actionComputeTeacherPayout } from "@/lib/actions";
import { TeacherPayoutDashboard } from "@/components/teacher-payout-dashboard";
import { FeeRuleManager } from "@/components/fee-rule-manager";
import { loadTeacherPageContext } from "../_context";
import { ChangeHistory } from "@/components/change-history";

export const dynamic = "force-dynamic";

/**
 * Hakediş + saatlik ücret kuralları. Eski ana sayfadaki #ucret bölümü buraya
 * taşındı; dönem dökümü ile ücret tanımı aynı sorumluluk alanında.
 */
export default async function TeacherPayoutTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const { session, kurum, data, teacher, canManage } = await loadTeacherPageContext(teacherId);

  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }
  if (!teacher) notFound();

  const now = new Date();
  const periodStart = format(startOfMonth(now), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const initialResult = await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd });
  const teacherFeeRules = data.teacherFeeRules.filter((r) => r.teacherId === teacher.id);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Dönem Hakedişi</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/ogretmen-hakedis-yazdir/${teacher.id}?periodStart=${periodStart}&periodEnd=${periodEnd}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Aylık döküm
            </Link>
            <Link
              href={`/ogretmen-hakedis-yazdir/${teacher.id}?periodStart=${now.getFullYear()}-01-01&periodEnd=${now.getFullYear()}-12-31`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              Yıllık döküm
            </Link>
          </div>
        </div>
        <TeacherPayoutDashboard
          teacherId={teacherId}
          teacherName={teacher.name}
          initialYear={now.getFullYear()}
          initialMonth={now.getMonth() + 1}
          initialResult={initialResult}
          initialThreshold={teacher.weeklyHoursThreshold}
          canWrite={kurum.scope.mode === "single"}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Saatlik Hakediş Ücreti</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Dakika-başı ücret kuralı (Ücret Kuralları ile aynı kaynak; burada yalnız bu öğretmen). Yeni kural
          geçmiş ödenmiş hakediş kayıtlarını değiştirmez.
        </p>
        <FeeRuleManager
          teachers={[{ id: teacher.id, name: teacher.name }]}
          branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))}
          rules={teacherFeeRules}
          canWrite={kurum.scope.mode === "single" && canManage}
        />
      </section>

      <ChangeHistory
        title="Hakediş değişiklik geçmişi"
        tenantId={session.tenantId}
        entityType="TeacherPayout"
        entityIds={data.teacherPayouts.filter((p) => p.teacherId === teacher.id).map((p) => p.id)}
        teachers={data.teachers}
      />
    </div>
  );
}
