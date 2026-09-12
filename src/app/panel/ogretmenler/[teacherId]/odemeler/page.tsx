import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { EmptyState, PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { TeacherPayoutHistory } from "@/components/teacher-payout-history";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

export default async function TeacherPayoutHistoryPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}/odemeler`);
  }
  // Hakediş erişimi: kurum politikası (SUPER_ADMIN her zaman; SCHOOL_ADMIN / unified BRANCH_MANAGER kuruma göre).
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }

  const data = await readData();
  const teacher = data.teachers.find((t) => t.id === teacherId);

  if (!teacher) {
    return (
      <div>
        <PageHeader title="Ödeme geçmişi" description="Öğretmen bulunamadı." />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu öğretmen kurumunuza kayıtlı değil veya kaldırılmış olabilir."
        />
        <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mt-4 text-amber-600 hover:text-amber-700" />
      </div>
    );
  }

  const payouts = data.teacherPayouts.filter((p) => p.teacherId === teacherId);

  return (
    <div>
      <AssistantPageContext entity={{ kind: "teacher", id: teacher.id, label: teacher.name }} />
      <BackButton fallbackHref={`/panel/ogretmenler/${teacher.id}`} label="Öğretmen detayına dön" className="mb-3" />
      <PageHeader
        title={`${teacher.name} — Ödeme Geçmişi`}
        actions={
          <Link
            href={`/panel/ogretmenler/${teacherId}/hakedis`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            Hakediş dökümüne dön
          </Link>
        }
      />
      <TeacherPayoutHistory payouts={payouts} />
    </div>
  );
}
