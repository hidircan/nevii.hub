import { redirect, notFound } from "next/navigation";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { statementMonthPeriod } from "@/lib/teacher-earnings-statement";
import { actionComputeTeacherPayout } from "@/lib/actions";
import { TeacherPayoutDashboard } from "@/components/teacher-payout-dashboard";
import { FeeRuleManager } from "@/components/fee-rule-manager";
import { activeInstrumentOptions } from "@/lib/instrument-options";
import { loadTeacherPageContext } from "../_context";
import { readScopedTeacherPayouts } from "@/lib/institution/context";
import { ChangeHistory } from "@/components/change-history";

export const dynamic = "force-dynamic";

/**
 * Hakediş + saatlik ücret kuralları. Eski ana sayfadaki #ucret bölümü buraya
 * taşındı; dönem dökümü ile ücret tanımı aynı sorumluluk alanında.
 */
export default async function TeacherPayoutTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const { session, kurum, data, teacher, canManage } = await loadTeacherPageContext(teacherId);
  const teacherPayouts = await readScopedTeacherPayouts(kurum.scope, teacherId);

  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }
  if (!teacher) notFound();

  // İstanbul takvimine göre içinde bulunulan ay (sunucu UTC çalışır; ayın ilk saatlerinde önceki ay seçiliyordu).
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const initialYear = Number(today.slice(0, 4));
  const initialMonth = Number(today.slice(5, 7));
  const { periodStart, periodEnd } = statementMonthPeriod(initialYear, initialMonth);
  const initialResult = await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd });
  const teacherFeeRules = data.teacherFeeRules.filter((r) => r.teacherId === teacher.id);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Dönem Hakedişi</h2>
        <TeacherPayoutDashboard
          teacherId={teacherId}
          teacherName={teacher.name}
          initialYear={initialYear}
          initialMonth={initialMonth}
          initialResult={initialResult}
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
          instrumentOptions={await activeInstrumentOptions(session)}
        />
      </section>

      <ChangeHistory
        title="Hakediş değişiklik geçmişi"
        tenantId={session.tenantId}
        entityType="TeacherPayout"
        entityIds={teacherPayouts.filter((p) => p.teacherId === teacher.id).map((p) => p.id)}
        teachers={data.teachers}
      />
    </div>
  );
}
