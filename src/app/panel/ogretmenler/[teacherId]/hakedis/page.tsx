import { redirect } from "next/navigation";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { requireSessionContext } from "@/lib/auth/session";
import { actionComputeTeacherPayout } from "@/lib/actions";
import { EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TeacherPayoutDashboard } from "@/components/teacher-payout-dashboard";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

export default async function TeacherPayoutPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}/hakedis`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);

  if (!teacher) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Hakediş" description="Öğretmen bulunamadı." />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu öğretmen kurumunuza kayıtlı değil veya kaldırılmış olabilir."
        />
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mt-4 text-amber-600 hover:text-amber-700" />
      </div>
    );
  }

  const now = new Date();
  const periodStart = format(startOfMonth(now), "yyyy-MM-dd");
  const periodEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const initialResult = await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "teacher", id: teacher.id, label: teacher.name }} />
      <BackButton fallbackHref={`/panel/ogretmenler/${teacher.id}`} label="Öğretmen detayına dön" className="mb-3" />
      <PageHeader title={`${teacher.name} — Hakediş`} />
      <TeacherPayoutDashboard
        teacherId={teacherId}
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
        initialResult={initialResult}
        canWrite={kurum.scope.mode === "single"}
      />
    </div>
  );
}
