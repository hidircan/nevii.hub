import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { StudentsTable, type StudentRow } from "@/components/students-table";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { computeAllStudentAttendanceRisks } from "@/lib/insights/attendance-risk";
import { effectiveStudentTypes } from "@/lib/student-types";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
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

  const risks = computeAllStudentAttendanceRisks(data);
  const atRisk = risks
    .filter((r) => r.riskLevel !== "low")
    .map((r) => ({ ...r, student: data.students.find((s) => s.id === r.studentId) }))
    .filter((r) => r.student)
    .sort((a, b) => (a.riskLevel === b.riskLevel ? 0 : a.riskLevel === "high" ? -1 : 1));

  const rows: StudentRow[] = students.map((s) => {
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

      {atRisk.length > 0 ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <p className="mb-2 text-sm font-medium text-[var(--color-text)] dark:text-slate-200">
            Devamsızlık riski ({atRisk.length} öğrenci)
          </p>
          <ul className="mb-3 space-y-1 text-sm">
            {atRisk.slice(0, 8).map((r) => (
              <li key={r.studentId} className="flex items-center justify-between gap-2">
                <span className="text-[var(--color-text-muted)] dark:text-slate-300">{r.student?.name}</span>
                <span
                  className={
                    r.riskLevel === "high"
                      ? "text-xs font-semibold text-rose-700"
                      : "text-xs font-semibold text-amber-700"
                  }
                >
                  {r.riskLevel === "high" ? "Yüksek risk" : "Orta risk"} · {r.absentCount} gelmedi
                  {r.consecutiveAbsences >= 2 ? ` · ${r.consecutiveAbsences} art arda` : ""}
                </span>
              </li>
            ))}
          </ul>
          <AiInsightTrigger
            capabilityId="attendanceRiskAssessment"
            label="AI ile yorumla"
            payload={{
              atRiskCount: atRisk.length,
              highRiskCount: atRisk.filter((r) => r.riskLevel === "high").length,
              topCases: atRisk.slice(0, 5).map((r) => ({
                studentName: r.student?.name,
                riskLevel: r.riskLevel,
                absentCount: r.absentCount,
                consecutiveAbsences: r.consecutiveAbsences,
              })),
            }}
          />
        </Card>
      ) : null}

      <StudentsTable
        rows={rows}
        canManage={canManage}
        tenantId={kurum.scope.mode === "single" ? kurum.scope.tenantId : undefined}
        userId={session.userId}
      />
    </div>
  );
}
