import Link from "next/link";
import { redirect } from "next/navigation";
import { isSameDay, parseISO, startOfMonth, endOfMonth, format } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  CreditCard,
  RefreshCcw,
  GraduationCap,
  Wallet,
} from "lucide-react";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { getDashboardStats } from "@/lib/store";
import { actionResetDemo } from "@/lib/actions";
import { SetupResetAction } from "@/components/setup-reset-action";
import { formatDateTime, formatMoney, formatTime, isOutstandingPaymentStatus } from "@/lib/utils";
import { buildDemoMessages } from "@/lib/whatsapp-templates";
import { computeSetupProgress } from "@/lib/setup-progress";
import { computeTeacherPayoutOverview } from "@/lib/teacher-payout-overview";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

/**
 * İş 4A — "Bugünün aksiyonları" TAMAMEN token tabanlı: her aksiyon türü
 * ayrı parlak bir kart rengiyle boyanmaz, durum yalnız kontrollü bir
 * durum tonuyla (success/warning/danger/info token'ları) anlatılır — hepsi
 * `globals.css`'teki tek token sözlüğünden gelir, bu yüzden Kurumsal ve
 * Atölye temalarında otomatik olarak doğru/profesyonel görünür.
 */
type ActionTone = "danger" | "warning" | "primary" | "info";

const TONE_STYLE: Record<ActionTone, { border: string; bg: string; text: string }> = {
  danger: { border: "var(--color-danger)", bg: "var(--color-danger-soft)", text: "var(--color-danger)" },
  warning: { border: "var(--color-warning)", bg: "var(--color-warning-soft)", text: "var(--color-warning)" },
  primary: { border: "var(--color-primary)", bg: "var(--color-primary-soft)", text: "var(--color-primary-soft-text)" },
  info: { border: "var(--color-info)", bg: "var(--color-info-soft)", text: "var(--color-info)" },
};

export default async function DashboardPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const stats = getDashboardStats(data);
  const setupProgress = computeSetupProgress(data);
  const today = new Date().toISOString().slice(0, 10);
  const todayLessons = data.lessons
    .filter((l) => l.startAt.startsWith(today))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const openMakeupRequests = data.makeupRequests.filter(
    (m) => m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info"
  );
  const openMakeups = openMakeupRequests.slice(0, 5);

  const urgentPayments = data.payments
    .filter((p) => p.status === "overdue" || p.status === "partial")
    .slice(0, 4);

  // Bugünün aksiyonları — yalnızca gerçekten aksiyon gerektiren kalemler
  const unpaidPayments = data.payments.filter((p) => isOutstandingPaymentStatus(p.status));
  const totalOutstanding = unpaidPayments.reduce(
    (sum, p) => sum + Math.max(p.amount - p.paidAmount, 0),
    0
  );
  const hasOverduePayment = unpaidPayments.some((p) => p.status === "overdue");

  const now = new Date();
  const attendedLessonIds = new Set(data.attendances.map((a) => a.lessonId));
  const pendingAttendanceLessons = data.lessons.filter(
    (l) =>
      l.status === "scheduled" &&
      isSameDay(parseISO(l.startAt), now) &&
      parseISO(l.startAt) <= now &&
      !attendedLessonIds.has(l.id)
  );

  const pendingMessageCount = buildDemoMessages(data).length;

  const monthPeriodStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthPeriodEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const payoutOverview = computeTeacherPayoutOverview(data, monthPeriodStart, monthPeriodEnd);

  const actionCards: { key: string; href: string; label: string; detail: string; tone: ActionTone }[] = [];

  if (totalOutstanding > 0) {
    actionCards.push({
      key: "tahsilat",
      href: "/panel/ai/tahsilat-agent",
      label: hasOverduePayment ? "Gecikmiş tahsilat" : "Bekleyen tahsilat",
      detail: formatMoney(totalOutstanding),
      tone: hasOverduePayment ? "danger" : "warning",
    });
  }

  if (openMakeupRequests.length > 0) {
    actionCards.push({
      key: "telafi",
      href: "/panel/telafi",
      label: "Telafi bekliyor",
      detail: `${openMakeupRequests.length} talep`,
      tone: "warning",
    });
  }

  if (pendingAttendanceLessons.length > 0) {
    actionCards.push({
      key: "yoklama",
      href: "/panel/yoklama",
      label: "Yoklama bekliyor",
      detail: `${pendingAttendanceLessons.length} ders`,
      tone: "primary",
    });
  }

  if (pendingMessageCount > 0) {
    actionCards.push({
      key: "bildirim",
      href: "/panel/iletisim-merkezi",
      label: "Bekleyen WhatsApp mesajı",
      detail: `${pendingMessageCount} mesaj`,
      tone: "info",
    });
  }

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Panel özeti" }} />
      <PageHeader
        title="Günlük özet"
        actions={
          <>
            <SetupResetAction
              action={actionResetDemo}
              triggerLabel="Demo verisini sıfırla"
              triggerVariant="secondary"
              title="Demo verisi sıfırlansın mı?"
              bullets={[
                "Mevcut tüm öğretmen/öğrenci/ders/ödeme kayıtları silinir.",
                "Yerine örnek demo verisi (Nilüfer Acar Müzik Akademisi) yüklenir.",
                "Bu işlem geri alınamaz.",
              ]}
              confirmLabel="Demo verisini sıfırla"
            />
          </>
        }
      />

      {!setupProgress.isReady && (
        <Link
          href="/panel/kurulum"
          className="mb-6 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Okul kurulumunu tamamla ({setupProgress.completedCount}/{setupProgress.totalCount}) →
        </Link>
      )}

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-muted)]">Bugünün aksiyonları</h2>
        {actionCards.length === 0 ? (
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--color-success)", background: "var(--color-success-soft)", color: "var(--color-success)" }}
          >
            Bugün için bekleyen aksiyon bulunmuyor.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {actionCards.map((card) => {
              const tone = TONE_STYLE[card.tone];
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  className="block rounded-lg border px-4 py-3 transition hover:opacity-90"
                  style={{ borderColor: `color-mix(in srgb, ${tone.border} 35%, transparent)`, background: tone.bg, color: tone.text }}
                >
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-1 text-lg font-semibold">{card.detail}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Bugünkü dersler"
          value={stats.todayLessonCount}
          hint="Planlanan seanslar"
          accent="primary"
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <StatCard
          label="Açık telafi"
          value={stats.pendingMakeup}
          hint={`${stats.confirmedMakeup} onaylı telafi`}
          accent="warning"
          icon={<RefreshCcw className="h-5 w-5" />}
        />
        <StatCard
          label="Aktif öğrenci"
          value={stats.activeStudents}
          hint={`${stats.activeTeachers} öğretmen`}
          accent="info"
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <StatCard
          label="Tahsil edilen"
          value={formatMoney(stats.revenuePaid)}
          hint={`${formatMoney(stats.revenueDue)} bekleyen`}
          accent="success"
          icon={<CreditCard className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text)]">Bugünün programı</h2>
            <Link href="/panel/program" className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
              Tüm program →
            </Link>
          </div>
          {todayLessons.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Bugün planlanmış ders yok.</p>
          ) : (
            <div className="space-y-3">
              {todayLessons.map((lesson) => {
                const student = data.students.find((s) => s.id === lesson.studentId);
                const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
                const room = data.rooms.find((r) => r.id === lesson.roomId);
                const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
                return (
                  <div
                    key={lesson.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/70 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-1 rounded-full"
                        style={{ background: teacher?.color ?? "#A56A00" }}
                      />
                      <div>
                        <p className="font-medium text-[var(--color-text)]">
                          {formatTime(lesson.startAt)}–{formatTime(lesson.endAt)} · {lesson.instrument}
                        </p>
                        <p className="text-sm text-[var(--color-text-muted)]">
                          {student?.name} · {teacher?.name} · {branch?.shortName} · {room?.name}
                        </p>
                      </div>
                    </div>
                    <Badge status={lesson.type === "makeup" ? "makeup" : lesson.status} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" style={{ color: "var(--color-warning)" }} />
              <h2 className="font-semibold text-[var(--color-text)]">Bekleyen telafiler</h2>
            </div>
            {openMakeups.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Açık telafi yok — harika!</p>
            ) : (
              <ul className="space-y-3">
                {openMakeups.map((m) => {
                  const student = data.students.find((s) => s.id === m.studentId);
                  return (
                    <li
                      key={m.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: "var(--color-warning-soft)", background: "var(--color-warning-soft)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">{student?.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {m.instrument} · {m.reason}
                          </p>
                        </div>
                        <Badge status={m.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        Son tarih: {formatDateTime(m.expiresAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/panel/telafi"
              className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            >
              Telafi merkezine git →
            </Link>
          </Card>

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} />
              <h2 className="font-semibold text-[var(--color-text)]">Tahsilat uyarısı</h2>
            </div>
            {urgentPayments.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Geciken ödeme yok.</p>
            ) : (
              <ul className="space-y-2">
                {urgentPayments.map((p) => {
                  const student = data.students.find((s) => s.id === p.studentId);
                  return (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-text-muted)]">{student?.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatMoney(p.amount - p.paidAmount)}</span>
                        <Badge status={p.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="font-semibold text-[var(--color-text)]">Öğretmen Hakedişleri</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl p-3" style={{ background: "var(--color-warning-soft)" }}>
                <p className="text-lg font-semibold" style={{ color: "var(--color-warning)" }}>
                  {formatMoney(payoutOverview.pendingTotal)}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Bu ay bekleyen</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--color-success-soft)" }}>
                <p className="text-lg font-semibold" style={{ color: "var(--color-success)" }}>
                  {formatMoney(payoutOverview.paidTotal)}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Bu ay ödenen</p>
              </div>
            </div>
            {payoutOverview.missingFeeRuleLessonCount > 0 ? (
              <p
                className="mt-3 rounded-lg px-3 py-2 text-xs"
                style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
              >
                {payoutOverview.missingFeeRuleLessonCount} tamamlanmış derste ücret kuralı eksik —
                hakediş eksiksiz hesaplanamıyor.
              </p>
            ) : null}
            <Link
              href="/panel/ogretmenler"
              className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            >
              Hakedişleri görüntüle →
            </Link>
          </Card>
        </div>
      </div>

    </div>
  );
}
