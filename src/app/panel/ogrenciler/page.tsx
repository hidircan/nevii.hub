import { isLiveObligation } from "@/lib/payment-profile";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { StudentsTable, type StudentRow } from "@/components/students-table";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedStudentListData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { effectiveStudentTypes } from "@/lib/student-types";
import { listContractSummariesByStudent, type StudentContractSummary, listTerminalContractIdsForScope } from "@/lib/contracts";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";

export const dynamic = "force-dynamic";

export default async function OgrencilerPage({
  searchParams,
}: {
  searchParams: Promise<{ silinenler?: string }>;
}) {
  const { silinenler } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogrenciler");
  }
  const kurum = await getInstitutionContext(session);
  // DB egress: ders/yoklama satırları yok; ödemelerden yalnız durum rozeti alanları (tüm satırlar).
  const data = await readScopedStudentListData(kurum.scope);
  // Geri alınabilir silinen öğrenciler varsayılan listede YOKTUR; yalnız silme yetkisi olanlar
  // (kurum sahibi + kurum yöneticileri) "Silinenler" görünümünde görür (geri almak için detaya gider).
  const isOwner = canRunCriticalActions(session.role);
  const showDeleted = isOwner && silinenler === "1";
  const deletedCount = data.students.filter((s) => s.deletedAt).length;
  const students = data.students
    .filter((s) => (showDeleted ? Boolean(s.deletedAt) : !s.deletedAt))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const canManage = (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN") && kurum.scope.mode === "single";

  /**
   * D — Sözleşme filtreleri için tenant'ın tüm sözleşme ÖZETLERİ TEK sorguda
   * (öğrenci başına okuma YOK; 500 öğrencide 500 sorgu olmaz).
   * Merged "tüm kurumlar" görünümünde sözleşme okuması tek tenant'a bağlı
   * olduğu için atlanır — filtre orada "sözleşmesi yok" göstermek yerine
   * hiç çalışmaz (aşağıda boş map).
   */
  const activeInstruments =
    kurum.scope.mode === "single" ? await resolveActiveInstrumentNames(kurum.scope.tenantId) : [];

  const terminalContractIds = await listTerminalContractIdsForScope(kurum.scope);
  const contractSummaries =
    kurum.scope.mode === "single"
      ? await listContractSummariesByStudent(kurum.scope.tenantId)
      : new Map<string, StudentContractSummary>();

  // F — kaydı oluşturan / denemeden dönüştüren kişi adları TEK sorguda (ham kimlik asla gösterilmez).
  const actorNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: students.flatMap((s) => [s.createdByUserId, s.convertedByUserId]),
    teachers: data.teachers,
  });

  const rows: StudentRow[] = students.map((s) => {
    const contract = contractSummaries.get(s.id);
    // İptal/yenilenmiş sözleşmenin ödenmemiş taksiti öğrenciyi "gecikmiş" göstermez.
    const studentPayments = data.payments.filter(
      (p) => p.studentId === s.id && (p.status === "paid" || p.status === "voided" || isLiveObligation(p, terminalContractIds))
    );
    const paymentStatus: StudentRow["paymentStatus"] =
      studentPayments.length === 0
        ? "none"
        : studentPayments.some((p) => p.status === "overdue")
          ? "overdue"
          : studentPayments.some((p) => p.status === "partial")
            ? "partial"
            : studentPayments.every((p) => p.status === "paid")
              ? "paid"
              : "pending";
    return {
      id: s.id,
      name: s.name,
      branchName: data.settings.branches.find((b) => b.id === s.branchId)?.shortName,
      instruments: s.instruments,
      teacherName: data.teachers.find((t) => t.id === s.teacherId)?.name,
      packageName: s.packageName,
      monthlyFee: s.monthlyFee,
      active: s.active,
      studentTypes: effectiveStudentTypes(s),
      enrollmentStartDate: s.enrollmentStartDate,
      enrollmentEndDate: s.enrollmentEndDate,
      level: s.level,
      targetExam: s.targetExam,
      educationMethod: s.educationMethod,
      paymentStatus,
      contractNumber: contract?.contractNumber,
      contractStartDate: contract?.enrollmentStartDate,
      contractEndDate: contract?.enrollmentEndDate,
      contractStatus: contract?.status,
      intendedDurationMonths: s.intendedDurationMonths,
      createdAt: s.createdAt,
      displayId: s.displayId,
      createdByName: s.createdByUserId ? actorNames.get(s.createdByUserId) : undefined,
      convertedByName: s.convertedByUserId ? actorNames.get(s.convertedByUserId) : undefined,
      fromTrial: Boolean(s.convertedFromTrialId),
    };
  });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Öğrenciler" }} />
      <PageHeader
        title="Öğrenciler"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (deletedCount > 0 || showDeleted) ? (
              showDeleted ? (
                <Link
                  href="/panel/ogrenciler"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                >
                  ← Tüm öğrenciler
                </Link>
              ) : (
                <Link
                  href="/panel/ogrenciler?silinenler=1&status=all"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                >
                  Silinen öğrenciler ({deletedCount})
                </Link>
              )
            ) : null}
            <Link
              href="/panel/ogrenciler/yeni"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              <UserPlus className="h-4 w-4" /> Yeni Öğrenci
            </Link>
          </div>
        }
      />

      {showDeleted ? (
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          <strong>Silinen öğrenciler ({deletedCount})</strong> — geri almak için öğrenciyi açın.
        </p>
      ) : null}

      <StudentsTable
        rows={rows}
        canManage={canManage}
        deletedView={showDeleted}
        bulkOptions={
          canManage && canRunCriticalActions(session.role)
            ? {
                branches: data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name })),
                teachers: data.teachers
                  .filter((t) => t.active)
                  .map((t) => ({ id: t.id, name: t.name, instruments: t.instruments }))
                  .sort((a, b) => a.name.localeCompare(b.name, "tr")),
                instruments: activeInstruments,
                packages: (data.packages ?? [])
                  .filter((p) => p.status === "active")
                  .map((p) => ({ id: p.id, title: p.title })),
              }
            : undefined
        }
        tenantId={kurum.scope.mode === "single" ? kurum.scope.tenantId : undefined}
        userId={session.userId}
      />
    </div>
  );
}
