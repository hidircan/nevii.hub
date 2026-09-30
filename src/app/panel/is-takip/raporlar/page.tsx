import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Card, EmptyState, Input, Label, PageHeader, StatCard } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { getTaskReportTool } from "@/lib/services";
import type { TaskReport } from "@/lib/task-report";
import { listAssignableStaff, resolveStaffLabel, type AssignableStaff } from "@/lib/staff-directory";

export const dynamic = "force-dynamic";

/**
 * İş Takip — Yönetici Görev Raporları (Faz 3B-3B). Yalnız SUPER_ADMIN/
 * SCHOOL_ADMIN erişir (sayfa seviyesinde YANI SIRA `getTaskReportTool`
 * kendi içinde de aynı rolleri zorunlu kılar — çift katman, bkz. tools.ts).
 * Tüm hesaplama sunucuda (`getTaskReportTool` → `buildTaskReport`) tek
 * tenant-scoped sorguyla yapılır; bu sayfa yalnızca sonucu render eder,
 * ham görev listesi istemciye asla gönderilmez. Öğretmen navigasyonuna
 * (`/ogretmen/is-takip`) bilinçli olarak EKLENMEDİ — bu rota `/panel`
 * altında, sadece admin route ağacında.
 */
export default async function IsTakipRaporlarPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/is-takip/raporlar");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const sp = await searchParams;
  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const staff = await listAssignableStaff(session.tenantId, data.teachers);

  const reportRes = await getTaskReportTool(session, {
    startDate: sp.startDate || undefined,
    endDate: sp.endDate || undefined,
  });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/is-takip/kanban" label="İş Takip'e dön" className="mb-3" />
      <PageHeader title="İş Takip — Raporlar" />

      {!reportRes.ok ? (
        <EmptyState title="Rapor yüklenemedi" description={reportRes.error.message} />
      ) : (
        <ReportBody report={reportRes.data} staff={staff} startDate={sp.startDate} endDate={sp.endDate} />
      )}
    </div>
  );
}

function ReportBody({
  report,
  staff,
  startDate,
  endDate,
}: {
  report: TaskReport;
  staff: AssignableStaff[];
  startDate?: string;
  endDate?: string;
}) {
  const rate = report.completed.ratePercent;
  return (
    <div className="space-y-6">
      <Card>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <Label>Başlangıç tarihi</Label>
            <Input type="date" name="startDate" defaultValue={startDate ?? report.range.startYmd} />
          </div>
          <div>
            <Label>Bitiş tarihi</Label>
            <Input type="date" name="endDate" defaultValue={endDate ?? report.range.endYmd} />
          </div>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            Uygula
          </button>
          <Link
            href="/panel/is-takip/raporlar"
            className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Son 30 güne dön
          </Link>
        </form>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Görüntülenen aralık: {report.range.startYmd} — {report.range.endYmd}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Açık İş Yükü" value={report.openWorkload.total} accent="primary" />
        <StatCard label="Yapılacak" value={report.openWorkload.todo} accent="info" />
        <StatCard label="Devam Ediyor" value={report.openWorkload.inProgress} accent="info" />
        <StatCard label="Beklemede" value={report.openWorkload.blocked} accent="warning" />
        <StatCard label="Gecikmiş" value={report.overdueCount} accent="danger" />
      </div>

      <Card>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Tamamlanma oranı (seçili aralık)
        </p>
        <p className="text-2xl font-semibold text-[var(--color-text)]">
          {rate === null ? "— (bu aralıkta son tarihli görev yok)" : `%${rate}`}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Pay: bu aralıkta tamamlanan görev sayısı ({report.completed.inRange}) · Payda: son tarihi bu aralığa düşen
          görev sayısı ({report.completed.dueInRange}).
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Sorumlu bazında</h2>
        {report.byAssignee.length === 0 ? (
          <EmptyState title="Görev yok" description="Bu kurumda henüz görev bulunmuyor." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Sorumlu</th>
                  <th className="px-3 py-2">Açık</th>
                  <th className="px-3 py-2">Gecikmiş</th>
                  <th className="px-3 py-2">Tamamlanan (aralık)</th>
                </tr>
              </thead>
              <tbody>
                {report.byAssignee.map((row) => (
                  <tr key={row.assigneeId ?? "unassigned"} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">
                      {resolveStaffLabel(staff, row.assigneeId ?? undefined) ?? "Atanmadı"}
                    </td>
                    <td className="px-3 py-2">{row.open}</td>
                    <td className="px-3 py-2">{row.overdue}</td>
                    <td className="px-3 py-2">{row.completedInRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Kategoriye göre (açık görevler)</h2>
          {report.byCategory.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Açık görev yok.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {report.byCategory.map((row) => (
                <li key={row.category} className="flex items-center justify-between">
                  <span className="text-[var(--color-text)]">{row.category}</span>
                  <span className="font-medium text-[var(--color-text-muted)]">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Önceliğe göre (açık görevler)</h2>
          {report.byPriority.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Açık görev yok.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {report.byPriority.map((row) => (
                <li key={row.priority} className="flex items-center justify-between">
                  <span className="text-[var(--color-text)]">{row.priority}</span>
                  <span className="font-medium text-[var(--color-text-muted)]">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
