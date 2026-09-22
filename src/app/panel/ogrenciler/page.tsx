import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { StudentsTable, type StudentRow } from "@/components/students-table";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { effectiveStudentTypes } from "@/lib/student-types";
import { listContractSummariesByStudent, type StudentContractSummary } from "@/lib/contracts";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

export default async function OgrencilerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogrenciler");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const students = [...data.students].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const canManage = (session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN") && kurum.scope.mode === "single";

  /**
   * D — Sözleşme filtreleri için tenant'ın tüm sözleşme ÖZETLERİ TEK sorguda
   * (öğrenci başına okuma YOK; 500 öğrencide 500 sorgu olmaz).
   * Merged "tüm kurumlar" görünümünde sözleşme okuması tek tenant'a bağlı
   * olduğu için atlanır — filtre orada "sözleşmesi yok" göstermek yerine
   * hiç çalışmaz (aşağıda boş map).
   */
  const contractSummaries =
    kurum.scope.mode === "single"
      ? await listContractSummariesByStudent(kurum.scope.tenantId)
      : new Map<string, StudentContractSummary>();

  const rows: StudentRow[] = students.map((s) => {
    const contract = contractSummaries.get(s.id);
    const studentPayments = data.payments.filter((p) => p.studentId === s.id);
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
      createdAt: s.createdAt,
    };
  });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Öğrenciler" }} />
      <PageHeader
        title="Öğrenciler"
        actions={
          <Link
            href="/panel/ogrenciler/yeni"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            <UserPlus className="h-4 w-4" /> Yeni Öğrenci
          </Link>
        }
      />

      <StudentsTable
        rows={rows}
        canManage={canManage}
        tenantId={kurum.scope.mode === "single" ? kurum.scope.tenantId : undefined}
        userId={session.userId}
      />
    </div>
  );
}
