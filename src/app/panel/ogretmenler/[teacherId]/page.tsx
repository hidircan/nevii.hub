import Link from "@/components/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { computeTeacherEarningsWithRevisions } from "@/lib/teacher-payout";
import { formatDate, formatMoney, formatTime } from "@/lib/utils";
import { loadTeacherLessonsData, loadTeacherPageContext } from "./_context";
import { readScopedPayoutWindow } from "@/lib/institution/context";
import { MiniStat } from "./_components/fields";
import { isActiveOwnStudent } from "@/lib/teacher-portal-scope";

export const dynamic = "force-dynamic";

/**
 * Öğretmen ÖZETİ — kompakt durum: aktiflik, şube, öğrenci/ders sayıları,
 * uyarılar ve sekme kısayolları. Tam bölümler ayrı route'larda.
 */
export default async function TeacherOverviewTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const [{ teacher, canManage }, data] = await Promise.all([loadTeacherPageContext(teacherId), loadTeacherLessonsData(teacherId)]);
  if (!teacher) notFound();

  const branch = data.settings.branches.find((b) => b.id === teacher.branchId);
  // 2026-10-14 — sekme etiketi ve "Öğrenci" kutusu Öğrenciler sekmesiyle AYNI kural (yalnız aktif ilişki).
  const activeStudents = data.students.filter((s) => isActiveOwnStudent(s, teacher.id));
  const lessons = data.lessons.filter((l) => l.teacherId === teacher.id && l.status !== "cancelled");

  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const todayCount = lessons.filter((l) => l.startAt.slice(0, 10) === todayYmd).length;
  const weekCount = lessons.filter((l) => {
    const t = new Date(l.startAt).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  }).length;
  const upcomingAll = lessons
    .filter((l) => new Date(l.startAt) >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const upcoming = upcomingAll.slice(0, 3);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  // DB egress (2026-10-18): ayın hakediş penceresi (öğretmen ana sayfasıyla aynı dilim) — eskiden tam okuma.
  const { kurum } = await loadTeacherPageContext(teacherId);
  const payoutWindow = await readScopedPayoutWindow(
    kurum.scope,
    new Date(new Date(`${monthStart}T00:00:00.000Z`).getTime() - 2 * 86_400_000),
    new Date(new Date(`${monthEnd}T23:59:59.999Z`).getTime() + 2 * 86_400_000)
  );
  const earnings = computeTeacherEarningsWithRevisions(payoutWindow, teacher.id, monthStart, monthEnd);
  const teacherFeeRules = data.teacherFeeRules.filter((r) => r.teacherId === teacher.id);

  const contractDaysLeft = teacher.contractEndDate
    ? Math.ceil((new Date(teacher.contractEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const alerts: { key: string; label: string; href: string; tone: "danger" | "warning" }[] = [];
  if (!teacher.active) {
    alerts.push({
      key: "inactive",
      label: "Öğretmen pasif (arşivlenmiş)",
      href: `/panel/ogretmenler/${teacher.id}/bilgiler`,
      tone: "warning",
    });
  }
  if (contractDaysLeft !== null && contractDaysLeft < 0) {
    alerts.push({
      key: "contract-expired",
      label: `Sözleşme süresi doldu (${formatDate(teacher.contractEndDate!)})`,
      href: `/panel/ogretmenler/${teacher.id}/bilgiler`,
      tone: "danger",
    });
  } else if (contractDaysLeft !== null && contractDaysLeft <= 30) {
    alerts.push({
      key: "contract-expiring",
      label: `Sözleşme ${contractDaysLeft} gün içinde bitiyor`,
      href: `/panel/ogretmenler/${teacher.id}/bilgiler`,
      tone: "warning",
    });
  }
  if (teacherFeeRules.length === 0 && canManage) {
    alerts.push({
      key: "no-fee",
      label: "Saatlik hakediş ücreti tanımlanmamış",
      href: `/panel/ogretmenler/${teacher.id}/hakedis`,
      tone: "warning",
    });
  }
  if (teacher.availability.length === 0) {
    alerts.push({
      key: "no-availability",
      label: "Müsaitlik tanımlanmamış",
      href: `/panel/ogretmenler/${teacher.id}/musaitlik`,
      tone: "warning",
    });
  }

  const quickLinks = [
    { href: `/panel/ogretmenler/${teacher.id}/bilgiler`, label: "Bilgiler" },
    { href: `/panel/ogretmenler/${teacher.id}/program`, label: "Program" },
    { href: `/panel/ogretmenler/${teacher.id}/musaitlik`, label: "Müsaitlik" },
    { href: `/panel/ogretmenler/${teacher.id}/ogrenciler`, label: `Öğrenciler (${activeStudents.length})` },
    { href: `/panel/ogretmenler/${teacher.id}/yoklama`, label: "Yoklama" },
    { href: `/panel/ogretmenler/${teacher.id}/performans`, label: "Performans" },
    { href: `/panel/ogretmenler/${teacher.id}/hakedis`, label: "Hakediş" },
    { href: `/panel/ogretmenler/${teacher.id}/odemeler`, label: "Ödemeler" },
    { href: `/panel/ogretmenler/${teacher.id}/geri-bildirim`, label: "Geri Bildirim" },
    { href: `/panel/evraklar?teacherId=${teacher.id}`, label: "Evraklar" },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Aksiyon gerekli</h2>
        {alerts.length === 0 ? (
          <div
            className="flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--color-success) 30%, transparent)",
              background: "var(--color-success-soft)",
              color: "var(--color-success)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Bu öğretmen için bekleyen bir aksiyon yok.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium transition hover:opacity-90"
                  style={{
                    borderColor: `color-mix(in srgb, var(--color-${a.tone}) 35%, transparent)`,
                    background: `var(--color-${a.tone}-soft)`,
                    color: `var(--color-${a.tone})`,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {a.label}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Durum" value={teacher.active ? "Aktif" : "Pasif"} tone={teacher.active ? "success" : "danger"} />
        <MiniStat label="Şube" value={branch?.shortName ?? "—"} />
        <MiniStat label="Öğrenci" value={String(activeStudents.length)} />
        <MiniStat label="Bugün / Bu hafta" value={`${todayCount} / ${weekCount}`} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label="Bu ay bekleyen hakediş" value={formatMoney(earnings.totalAmount)} />
        <MiniStat label="Yaklaşan ders" value={String(upcomingAll.length)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
              <CalendarDays className="h-4 w-4 text-[var(--color-text-muted)]" />
              Yaklaşan dersler
            </h2>
            <Link
              href={`/panel/ogretmenler/${teacher.id}/program`}
              className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            >
              Program →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Planlanmış yaklaşan ders yok.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((l) => {
                const student = data.students.find((s) => s.id === l.studentId);
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium text-[var(--color-text)]">
                        {formatDate(l.startAt)} · {formatTime(l.startAt)}–{formatTime(l.endAt)}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                        {student?.name ?? "—"} · {l.instrument}
                      </span>
                    </span>
                    <Badge>{l.instrument}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Hızlı bağlantılar</h2>
          <ul className="grid grid-cols-2 gap-2">
            {quickLinks.map((q) => (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
                >
                  {q.label}
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
