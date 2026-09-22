import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { TeacherPayoutHistory } from "@/components/teacher-payout-history";
import { loadTeacherPageContext } from "../_context";

export const dynamic = "force-dynamic";

/** Öğretmen ödeme geçmişi — layout altında. */
export default async function TeacherPayoutHistoryTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const { session, data, teacher } = await loadTeacherPageContext(teacherId);

  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }
  if (!teacher) notFound();

  const payouts = data.teacherPayouts.filter((p) => p.teacherId === teacherId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Ödeme Geçmişi</h2>
        <Link
          href={`/panel/ogretmenler/${teacherId}/hakedis`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Hakediş dökümüne dön
        </Link>
      </div>
      <TeacherPayoutHistory payouts={payouts} />
    </div>
  );
}
