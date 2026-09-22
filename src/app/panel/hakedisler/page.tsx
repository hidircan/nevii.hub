import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { computeTeacherEarningsWithRevisions } from "@/lib/teacher-payout";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Ödendi",
  no_lessons: "Ders yok",
};

/**
 * ÖNCELİK 3 — kurum çapında öğretmen hakediş özeti. Eskiden sidebar'daki
 * "Öğretmen Hakedişleri" linki `/panel/ogretmenler?view=hakedis` gibi ölü
 * bir query param'a gidiyordu (sayfa hiç okumuyordu) — bu, gerçek, ayrı bir
 * ekran.
 */
export default async function TeacherPayoutOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; teacherId?: string; status?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/hakedisler");
  }
  // Hakediş erişimi: kurum politikası (SUPER_ADMIN her zaman; SCHOOL_ADMIN / unified BRANCH_MANAGER kuruma göre).
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }

  const { month, teacherId: teacherFilter, status: statusFilter } = await searchParams;
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);

  const monthAnchor = month && /^\d{4}-\d{2}$/.test(month) ? parseISO(`${month}-01`) : new Date();
  const periodStart = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(monthAnchor), "yyyy-MM-dd");
  const monthParam = format(monthAnchor, "yyyy-MM");
  const prevMonthParam = format(addMonths(monthAnchor, -1), "yyyy-MM");
  const nextMonthParam = format(addMonths(monthAnchor, 1), "yyyy-MM");

  const activeTeachers = data.teachers.filter((t) => t.active);

  const rows = activeTeachers.map((teacher) => {
    const existingPayout = data.teacherPayouts.find(
      (p) => p.teacherId === teacher.id && p.periodStart === periodStart && p.periodEnd === periodEnd
    );
    const earnings = computeTeacherEarningsWithRevisions(data, teacher.id, periodStart, periodEnd);
    const lessonCount = earnings.totalLessons;
    const totalAmount = existingPayout ? existingPayout.totalAmount : earnings.totalAmount;
    const status = existingPayout ? existingPayout.status : lessonCount > 0 ? "pending" : "no_lessons";
    return {
      teacher,
      lessonCount,
      totalAmount,
      status,
      missingFeeRule: earnings.missingFeeRuleLessonIds.length,
    };
  });

  const filteredRows = rows.filter((r) => {
    if (teacherFilter && r.teacher.id !== teacherFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const totalPending = rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.totalAmount, 0);
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.totalAmount, 0);
  const totalMissingFeeRule = rows.reduce((s, r) => s + r.missingFeeRule, 0);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="Öğretmen Hakedişleri" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/panel/hakedisler?month=${prevMonthParam}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          <ChevronLeft className="h-4 w-4" /> Önceki ay
        </Link>
        <span className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] ring-1 ring-slate-200">
          {format(monthAnchor, "MMMM yyyy", { locale: tr })}
        </span>
        <Link
          href={`/panel/hakedisler?month=${nextMonthParam}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Sonraki ay <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Bekleyen toplam" value={formatMoney(totalPending)} accent="warning" />
        <StatCard label="Ödenen toplam" value={formatMoney(totalPaid)} accent="success" />
        <StatCard label="Ücret kuralı eksik ders" value={totalMissingFeeRule} accent="danger" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="month" value={monthParam} />
            <select
              name="teacherId"
              defaultValue={teacherFilter ?? ""}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
            >
              <option value="">Tüm öğretmenler</option>
              {activeTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
            >
              <option value="">Tüm durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="paid">Ödendi</option>
              <option value="no_lessons">Ders yok</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Filtrele
            </button>
            {teacherFilter || statusFilter ? (
              <Link
                href={`/panel/hakedisler?month=${monthParam}`}
                className="text-xs font-medium text-[var(--color-text-muted)] hover:text-rose-600"
              >
                Filtreleri Temizle
              </Link>
            ) : null}
          </form>
          <span className="ml-auto text-xs font-medium text-[var(--color-text-muted)]">
            {filteredRows.length} öğretmen
          </span>
        </div>
      </Card>

      {filteredRows.length === 0 ? (
        <EmptyState title="Sonuç yok" description="Bu filtrelerle eşleşen öğretmen bulunamadı." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Öğretmen</th>
                <th className="px-4 py-3">Ders sayısı</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.teacher.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{r.teacher.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.lessonCount}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(r.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge status={r.status === "no_lessons" ? undefined : r.status}>
                      {PAYOUT_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                    {r.missingFeeRule > 0 ? (
                      <span className="ml-2 text-xs text-rose-600">{r.missingFeeRule} ders için ücret kuralı eksik</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/panel/ogretmenler/${r.teacher.id}/hakedis`}
                      className="text-sm font-medium text-amber-700 hover:underline"
                    >
                      Detay →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
