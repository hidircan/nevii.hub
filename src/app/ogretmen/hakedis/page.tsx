import Link from "next/link";
import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { readData } from "@/lib/store";
import { requireSessionContext } from "@/lib/auth/session";
import { ownPayouts } from "@/lib/teacher-portal-scope";
import { Badge, Card } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Öğretmenin kendi geçmiş hakediş kayıtları — yalnızca session.teacherId ile kapsamlanır. */
export default async function TeacherOwnPayoutsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/hakedis");
  }
  if (session.role === "PARENT") redirect("/veli");

  const data = await readData();
  const teacherId = session.teacherId || "t2";
  const teacher = data.teachers.find((t) => t.id === teacherId) ?? data.teachers[0];
  if (!teacher) redirect("/login");

  const payouts = ownPayouts(data.teacherPayouts, teacher.id).sort((a, b) =>
    b.periodStart.localeCompare(a.periodStart)
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-slate-50">
      <header className="border-b border-cyan-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <BackButton fallbackHref="/ogretmen" />
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Geçmiş Hakedişlerim</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        {payouts.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Henüz oluşturulmuş bir hakediş kaydınız yok.</p>
          </Card>
        ) : (
          payouts.map((p) => (
            <Link key={p.id} href={`/ogretmen/hakedis/${p.id}`}>
              <Card className="transition hover:border-cyan-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[var(--color-text)] dark:text-slate-50">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {p.totalMinutes} dk · {formatMoney(p.totalAmount)}
                    </p>
                    {p.status === "paid" && p.paidAt ? (
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        Ödendi: {formatDate(p.paidAt)}
                        {p.method ? ` · ${p.method}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <Badge status={p.status} />
                </div>
              </Card>
            </Link>
          ))
        )}
      </main>
    </div>
  );
}
