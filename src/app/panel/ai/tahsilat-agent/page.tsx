import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CircleDollarSign, Target, TrendingUp } from "lucide-react";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { formatMoney } from "@/lib/utils";
import { TahsilatQueue } from "@/components/tahsilat-queue";
import { getCollectionRoi, listFollowUpCases, mergeCollectionRoi } from "@/lib/tahsilat/cases";
import { buildTahsilatQueue } from "@/lib/tahsilat/queue";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { CollectionsIntakeScan } from "@/components/collections-intake-scan";

export const dynamic = "force-dynamic";

export default async function TahsilatAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ai/tahsilat-agent");
  }

  const { studentId: studentFilter } = await searchParams;
  const kurum = await getInstitutionContext(session);
  const tenantIds = kurum.scope.mode === "all" ? kurum.scope.tenantIds : [kurum.scope.tenantId];
  const data = await readScopedData(kurum.scope);
  const roi = mergeCollectionRoi(await Promise.all(tenantIds.map((tid) => getCollectionRoi(tid))));
  const followUpCases = (await Promise.all(tenantIds.map((tid) => listFollowUpCases(tid)))).flat();
  const filteredStudent = studentFilter
    ? data.students.find((s) => s.id === studentFilter)
    : undefined;

  const rows = buildTahsilatQueue(data, followUpCases, new Date(), studentFilter);
  const overdueCount = rows.filter((r) => r.paymentStatus === "overdue").length;
  const trackedOutstanding = rows.reduce((sum, r) => sum + r.remaining, 0);
  const successRateLabel = roi.successRate === null ? "—" : `%${Math.round(roi.successRate * 100)}`;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/ai" label="AI Özet'e dön" className="mb-3" />
      <PageHeader
        title="Tahsilat"
        actions={
          <Link href="/panel/odemeler" className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Ödemeleri yönet <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {studentFilter ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-900">
              {filteredStudent
                ? `${filteredStudent.name} için filtrelendi.`
                : "Bu öğrenci için kayıt bulunamadı — filtre boş sonuç veriyor."}
            </p>
            <Link
              href="/panel/ai/tahsilat-agent"
              className="text-sm font-medium text-amber-700 hover:text-amber-900"
            >
              Tümünü göster ×
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Takip edilen alacak"
          value={formatMoney(trackedOutstanding)}
          hint={`${rows.length} açık kayıt`}
          accent="primary"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Gecikmiş ödeme"
          value={overdueCount}
          hint="Öncelikli takip"
          accent="danger"
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Bu ay tahsil edilen"
          value={formatMoney(roi.attributedThisMonth)}
          hint={`${roi.resolvedThisMonth} vaka kapandı`}
          accent="success"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Başarı oranı"
          value={successRateLabel}
          hint={
            roi.closedThisMonth === 0
              ? "Bu ay henüz kapanan vaka yok"
              : `${roi.resolvedThisMonth} ödendi · ${roi.lostThisMonth} sonuçsuz`
          }
          accent="info"
          icon={<Target className="h-5 w-5" />}
        />
      </div>

      {(session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN") && kurum.scope.mode === "single" ? (
        (() => {
          const untracked = rows.filter((r) => r.caseStatus === "draft");
          if (untracked.length === 0) return null;
          return (
            <Card className="mt-6">
              <p className="mb-2 text-sm font-medium text-[var(--color-text)] dark:text-slate-200">
                Takibi başlamamış {untracked.length} kayıt — hangisi öncelikli?
              </p>
              <CollectionsIntakeScan
                tenantId={kurum.scope.tenantId}
                payload={{
                  untrackedCount: untracked.length,
                  totalUntrackedAmount: untracked.reduce((sum, r) => sum + r.remaining, 0),
                  topCases: untracked.slice(0, 5).map((r) => ({
                    studentName: r.studentName,
                    remaining: r.remaining,
                    daysOverdue: r.daysOverdue,
                  })),
                }}
              />
            </Card>
          );
        })()
      ) : null}

      <Card className="mt-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Bugünün takip kuyruğu</h2>
        </div>
        <TahsilatQueue
          rows={rows}
          canWrite={kurum.scope.mode === "single"}
          tenantId={kurum.scope.mode === "single" ? kurum.scope.tenantId : ""}
          canUseAiDraft={session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN"}
        />
      </Card>
    </div>
  );
}
