import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import {
  PAYOUT_SCOPE_LABEL,
  buildPayoutOverviewRows,
  parsePayoutScope,
  passiveTeacherOpenPayouts,
  rowsInPayoutScope,
  sumPayoutRows,
} from "@/lib/payout-overview";
import { ScopeTabs } from "@/components/scope-tabs";
import { PayoutThresholdCell } from "@/components/payout-threshold-cell";
import { PayoutPolicyPanel } from "@/components/payout-policy-panel";
import { payoutsOverlappingMonth, resolvePayoutPolicy } from "@/lib/teacher-payout";
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
  searchParams: Promise<{ month?: string; teacherId?: string; status?: string; kapsam?: string }>;
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

  const { month, teacherId: teacherFilter, status: statusFilter, kapsam } = await searchParams;
  const scope = parsePayoutScope(kapsam);
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);

  const monthAnchor = month && /^\d{4}-\d{2}$/.test(month) ? parseISO(`${month}-01`) : new Date();
  const periodStart = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(monthAnchor), "yyyy-MM-dd");
  const monthParam = format(monthAnchor, "yyyy-MM");
  const prevMonthParam = format(addMonths(monthAnchor, -1), "yyyy-MM");
  const nextMonthParam = format(addMonths(monthAnchor, 1), "yyyy-MM");

  // Kapsam tek kaynaktan (payout-overview.ts): pasif öğretmenin hakkı listeden/toplamdan sessizce düşmez.
  const allRows = buildPayoutOverviewRows(data, periodStart, periodEnd);
  const rows = rowsInPayoutScope(allRows, scope);
  const scopeTeachers = rows.map((r) => r.teacher);

  const filteredRows = rows.filter((r) => {
    if (teacherFilter && r.teacher.id !== teacherFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const totals = sumPayoutRows(rows);
  const activeTotals = sumPayoutRows(rowsInPayoutScope(allRows, "aktif"));
  const passiveTotals = sumPayoutRows(rowsInPayoutScope(allRows, "pasif"));
  const passiveOpenAllPeriods = passiveTeacherOpenPayouts(data);
  const scopeHref = (key: string) => {
    const params = new URLSearchParams({ month: monthParam });
    if (key !== "aktif") params.set("kapsam", key);
    return `/panel/hakedisler?${params.toString()}`;
  };
  const withScope = (href: string) => (scope === "aktif" ? href : `${href}&kapsam=${scope}`);
  const monthLabel = format(monthAnchor, "MMMM yyyy", { locale: tr });

  // 2026-09-29 — ayın hakediş politikası (kurum geneli). Birleşik görünümde yazma yok.
  const policies = data.teacherPayoutPolicies ?? [];
  const policyRecord = kurum.scope.mode === "all" ? undefined : policies.find((p) => p.month === monthParam);
  const currentPolicy = policyRecord ? resolvePayoutPolicy(data, "", monthParam) : { policy: "per_teacher_rule" as const };
  const lastFixed = [...policies].filter((p) => p.policy === "fixed_duration").sort((a, b) => b.month.localeCompare(a.month))[0];
  const ratePrefill = currentPolicy.policy === "fixed_duration" ? currentPolicy : (lastFixed ?? {});
  const lockedPayouts = payoutsOverlappingMonth(data.teacherPayouts, monthParam);
  const unsupportedCount =
    currentPolicy.policy === "fixed_duration"
      ? allRows.reduce((sum, r) => sum + r.missingFeeRule, 0)
      : 0;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="Öğretmen Hakedişleri" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={withScope(`/panel/hakedisler?month=${prevMonthParam}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          <ChevronLeft className="h-4 w-4" /> Önceki ay
        </Link>
        <span className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] ring-1 ring-slate-200">
          {monthLabel}
        </span>
        <Link
          href={withScope(`/panel/hakedisler?month=${nextMonthParam}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Sonraki ay <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <PayoutPolicyPanel
        key={`${monthParam}-${policyRecord?.setAt ?? "none"}`}
        month={monthParam}
        monthLabel={monthLabel}
        current={currentPolicy}
        explicit={Boolean(policyRecord)}
        setAtLabel={policyRecord ? format(parseISO(policyRecord.setAt), "d MMM yyyy HH:mm", { locale: tr }) : undefined}
        prefill={{ rate30: ratePrefill.rate30, rate40: ratePrefill.rate40, rate50: ratePrefill.rate50 }}
        lockedCount={lockedPayouts.length}
        lockedPaidCount={lockedPayouts.filter((p) => p.status === "paid").length}
        unsupportedCount={unsupportedCount}
        canEdit={session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN"}
        readOnlyReason={
          kurum.scope.mode === "all" ? "“Tüm kurumlar” görünümünde politika değiştirilemez; üstten tek bir kurum seçin." : undefined
        }
      />

      <div className="mb-3">
        <ScopeTabs
          label="Hakediş kapsamı"
          active={scope}
          items={(["aktif", "pasif", "tum"] as const).map((key) => ({
            key,
            label: PAYOUT_SCOPE_LABEL[key],
            count: rowsInPayoutScope(allRows, key).length,
            href: scopeHref(key),
          }))}
        />
      </div>
      {/* Üç yükümlülük hiçbir zaman tek sayıda karışmaz — hangi görünümde olunursa olunsun ayrı yazılır. */}
      <dl className="mb-4 grid gap-x-6 gap-y-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-3">
        <div>
          <dt className="inline">Aktif öğretmen hakedişi ({monthLabel}): </dt>
          <dd className="inline font-semibold text-[var(--color-text)]">{formatMoney(activeTotals.pending)} bekliyor</dd>
        </div>
        <div>
          <dt className="inline">Pasif öğretmene kalan ({monthLabel}): </dt>
          <dd className="inline font-semibold text-[var(--color-text)]">{formatMoney(passiveTotals.pending)}</dd>
        </div>
        <div>
          <dt className="inline">Pasif öğretmen, tüm dönemler (kayıtlı, ödenmemiş): </dt>
          <dd className="inline font-semibold text-[var(--color-text)]">
            {formatMoney(passiveOpenAllPeriods.total)} · {passiveOpenAllPeriods.count} kayıt
          </dd>
        </div>
      </dl>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={scope === "pasif" ? "Pasif öğretmene kalan yükümlülük" : "Bekleyen toplam"}
          value={formatMoney(totals.pending)}
          hint={`${PAYOUT_SCOPE_LABEL[scope]} · ${monthLabel}`}
          accent="warning"
        />
        <StatCard label="Ödenen toplam" value={formatMoney(totals.paid)} hint={`${PAYOUT_SCOPE_LABEL[scope]} · ${monthLabel}`} accent="success" />
        <StatCard label="Tutarı hesaplanamayan ders" value={totals.missingFeeRule} accent="danger" />
      </div>
      <p className="-mt-3 mb-6 text-xs text-[var(--color-text-muted)]">
        Tutarlar bu ay için seçili hakediş politikasıyla hesaplanır; kayıtlı hakediş varsa kayıttaki (donmuş) tutar esas alınır.
        Pasif öğretmen yalnız bu ayda işlenmiş dersi veya kayıtlı hakedişi varsa listelenir. &quot;Tüm dönemler&quot; yalnız
        kayda geçmiş hakedişleri toplar; hiç hakediş oluşturulmamış eski aylar hesaplanmaz.
      </p>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="month" value={monthParam} />
            {scope !== "aktif" ? <input type="hidden" name="kapsam" value={scope} /> : null}
            <select
              name="teacherId"
              defaultValue={teacherFilter ?? ""}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
            >
              <option value="">Tüm öğretmenler</option>
              {scopeTeachers.map((t) => (
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
                href={scopeHref(scope)}
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
                {/* 10. tur iş #11 — eşik yönetimi bu ekranda (öğretmen başına, satır-içi). */}
                <th className="px-4 py-3">Eşik (sa/hafta)</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.teacher.id} className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                    {r.teacher.name}
                    {!r.active ? (
                      <span className="ml-2 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                        Pasif
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.lessonCount}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(r.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge status={r.status === "no_lessons" ? undefined : r.status}>
                      {PAYOUT_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                    {r.missingFeeRule > 0 ? (
                      <span className="ml-2 text-xs text-rose-600">
                        {r.missingFeeRule} ders için tutar hesaplanamadı (
                        {currentPolicy.policy === "fixed_duration" ? "süre 30/40/50 dk değil" : "ücret kuralı eksik"})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    <PayoutThresholdCell
                      teacherId={r.teacher.id}
                      teacherName={r.teacher.name}
                      threshold={r.teacher.weeklyHoursThreshold}
                      canEdit={session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN"}
                    />
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
