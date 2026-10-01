import Link from "@/components/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  FlaskConical,
  Info,
  Users,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { LessonStatusBadge } from "@/components/lesson-status-badge";
import { DashboardBranchSwitcher } from "@/components/dashboard-branch-switcher";
import { DashboardGrid } from "@/components/dashboard-layout-editor";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { InstitutionWelcome } from "@/components/institution-welcome";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedDashboardData } from "@/lib/institution/context";
import { getUserPreferences } from "@/lib/user-preferences";
import { listContractSummariesByStudent, listTerminalContractIdsForScope } from "@/lib/contracts";
import { listTasks } from "@/lib/tasks";
import { buildDashboardSummary, type DashboardAction } from "@/lib/dashboard/daily-summary";
import {
  resolveDashboardLayout,
  type DashboardSectionKey,
} from "@/lib/dashboard/layout-prefs";
import {
  getScreenWidget,
  permittedScreenWidgets,
  screenWidgetMetric,
  type ScreenWidgetAccess,
} from "@/lib/dashboard/screen-widgets";
import { buildTrialDigest, type TrialDigestItem } from "@/lib/dashboard/trial-digest";
import { listTrialLessonsTool } from "@/lib/services";
import { canViewFinanceAndStaffSummary } from "@/lib/auth/platform-access";
import { canAccessTeacherEarnings } from "@/lib/platform/teacher-earnings-access";
import { computeSetupProgress } from "@/lib/setup-progress";
import { computeTeacherPayoutOverview } from "@/lib/teacher-payout-overview";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, formatDateTr } from "@/lib/timezone";
import { formatMoney, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * C — GÜNLÜK ÖZET (2026-09-20, baştan tasarlandı).
 *
 * ESKİ EKRAN: sabit 4 istatistik kartı + "bugünün aksiyonları" rozetleri +
 * üç küçük kart. Şube kavramı YOKTU (tüm kurum tek yığın), rol farkı yoktu
 * (Nilüfer, Ezgi ve Nihal aynı ekranı görüyordu), sözleşme/iş-takip
 * tamamen dışarıdaydı ve tahsilat yalnızca ilk 4 satırla, vadesiz
 * gösteriliyordu.
 *
 * TASARIM KARARLARI:
 *  1) ÖNCE AKSİYON, SONRA BİLGİ. Ekranın ilk ekranında yalnız "bugün birinin
 *     bir şey yapması gereken" kalemler var; "sadece bilgi" olanlar ayrı ve
 *     sessiz bir şeritte. Her şeyi uyarı rengine boyamak, bir süre sonra
 *     hiçbir şeyin uyarı olmaması demektir.
 *  2) ŞUBE FARKINDALIĞI. Varsayılan şube kullanıcı hesabında saklanır
 *     (Nihal → Evka 3, Ezgi → Erzene); herkes diğer şubeye geçebilir ama
 *     bu yetkiyi değiştirmez, yalnız süzgeçtir.
 *  3) ROL FARKINDALIĞI. Personel/hakediş bloğu yalnız kurum sahibine
 *     (SUPER_ADMIN) gösterilir — sidebar'daki mevcut RBAC ile aynı sınır;
 *     panel kendi, gevşek bir kapı AÇMAZ.
 *  4) YOĞUN AMA DÜZENLİ. Tek bir 12 kolonluk ızgara, sabit dikey ritim,
 *     kart içi boşluklar küçük; listeler satır-tabanlı (kart yığını değil)
 *     çünkü operasyon ekranında tarama hızı dekorasyondan önemlidir.
 *  5) KİŞİSEL DÜZEN. Bölüm görünürlüğü / sırası / genişliği hesaba yazılır
 *     (`UserPreference.dashboardJson`); rol varsayılanı + kullanıcı override.
 */
const TONE_STYLE: Record<DashboardAction["tone"], { border: string; bg: string; text: string }> = {
  danger: { border: "var(--color-danger)", bg: "var(--color-danger-soft)", text: "var(--color-danger)" },
  warning: { border: "var(--color-warning)", bg: "var(--color-warning-soft)", text: "var(--color-warning)" },
  primary: { border: "var(--color-primary)", bg: "var(--color-primary-soft)", text: "var(--color-primary-soft-text)" },
  info: { border: "var(--color-info)", bg: "var(--color-info-soft)", text: "var(--color-info)" },
};


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sube?: string }>;
}) {
  const { sube } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel");
  }

  const kurum = await getInstitutionContext(session);
  const now = new Date();
  const today = toZonedYmd(now, DEFAULT_APP_TIMEZONE);
  // DB egress: kurumun tüm dersleri yerine bu ayın (bugün dahil) ders penceresi, ödemelerin yalnız özet
  // alanları, telafiler ve kayıtlı hakedişler (bkz. reference-data.ts `DashboardData`). Pencere, özet ve
  // ay hakediş hesabının kendi gün süzgecinden ±2–3 gün geniş; "gelecekte planlı ders" DB'den.
  const monthStartDay = `${today.slice(0, 7)}-01`;
  const data = await readScopedDashboardData(
    kurum.scope,
    new Date(Date.parse(`${monthStartDay}T00:00:00Z`) - 2 * 86_400_000),
    new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000),
    now
  );
  const prefs = await getUserPreferences(session.userId, session.tenantId);
  // Widget yetkisi = sidebar görünürlüğü (panel/layout.tsx ile aynı kapılar).
  const widgetAccess: ScreenWidgetAccess = {
    role: session.role,
    canViewFinanceAndStaffSummary: canViewFinanceAndStaffSummary(session),
    canViewTeacherEarnings: await canAccessTeacherEarnings(session),
  };
  const layout = resolveDashboardLayout(prefs.dashboard, session.role, widgetAccess);
  const visibleKeys = new Set(layout.visible.map((s) => s.key));

  const branchIds = new Set(data.settings.branches.map((b) => b.id));
  const savedDefault = prefs.dashboard?.defaultBranchId;
  const defaultBranchId = savedDefault && (savedDefault === "all" || branchIds.has(savedDefault)) ? savedDefault : "all";
  const activeBranchId = sube && (sube === "all" || branchIds.has(sube)) ? sube : defaultBranchId;

  // Sözleşme özetleri ve görevler TEK sorguda; merged "tüm kurumlar"
  // görünümünde sözleşme okuması tek tenant'a bağlı olduğu için atlanır.
  // Deneme listesi yalnız bölüm görünürken çekilir (tek ek sorgu); ekran
  // widget'ları ek sorgu yapmaz — hepsi aşağıdaki özetten türetilir.
  const [contractsByStudent, tasks, terminalContractIds, trialsResult] = await Promise.all([
    kurum.scope.mode === "single"
      ? listContractSummariesByStudent(kurum.scope.tenantId)
      : Promise.resolve(new Map()),
    kurum.scope.mode === "single" ? listTasks(kurum.scope.tenantId) : Promise.resolve([]),
    listTerminalContractIdsForScope(kurum.scope),
    kurum.scope.mode === "single" && visibleKeys.has("trials") ? listTrialLessonsTool(session) : Promise.resolve(null),
  ]);
  const trialDigest =
    trialsResult && trialsResult.ok
      ? buildTrialDigest(trialsResult.data.trials, {
          branchId: activeBranchId,
          now: new Date(),
          teachers: data.teachers,
          branches: data.settings.branches,
        })
      : null;

  const summary = buildDashboardSummary(
    data,
    { branchId: activeBranchId, today },
    contractsByStudent,
    tasks,
    terminalContractIds
  );
  const setupProgress = computeSetupProgress(data);

  // Rol sınırı — sidebar'daki "Finans Özeti"/"Personel" ile AYNI: yalnız kurum sahibi.
  const isOwner = session.role === "SUPER_ADMIN";
  const payoutOverview = isOwner
    ? computeTeacherPayoutOverview(data, monthStartDay, today)
    : null;

  const branchLabel =
    activeBranchId === "all"
      ? "Tüm şubeler"
      : (data.settings.branches.find((b) => b.id === activeBranchId)?.shortName ?? activeBranchId);

  const widgetSummary = {
    todayLessons: summary.counts.todayLessons,
    activeStudents: summary.counts.activeStudents,
    activeTeachers: summary.counts.activeTeachers,
    openMakeups: summary.counts.openMakeups,
    overdueTotal: summary.money.overdueTotal,
    overdueTotalLabel: formatMoney(summary.money.overdueTotal),
    openTasks: summary.taskSummary.open,
    // 10. tur iş #6 — Günlük Özet'e YALNIZCA bu kompakt finans göstergesi eklenir.
    collectedThisMonth: summary.money.collectedThisMonth,
    collectedThisMonthLabel: formatMoney(summary.money.collectedThisMonth),
  };
  const widgetNodes: Partial<Record<DashboardSectionKey, React.ReactNode>> = {};
  for (const key of layout.addedWidgets) {
    const def = getScreenWidget(key);
    if (!def) continue;
    const metric = screenWidgetMetric(def, widgetSummary);
    widgetNodes[key] = (
      <Link
        href={def.href}
        className="flex h-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 transition hover:border-[var(--color-primary)]"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{def.category}</span>
          <span className="block truncate text-sm font-semibold text-[var(--color-text)]">{def.label}</span>
          {metric ? (
            <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
              <span
                className="text-base font-semibold tabular-nums"
                style={{
                  color:
                    metric.tone === "danger"
                      ? "var(--color-danger)"
                      : metric.tone === "warning"
                        ? "var(--color-warning)"
                        : "var(--color-text)",
                }}
              >
                {metric.value}
              </span>{" "}
              {metric.caption}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">Ekranı aç</span>
          )}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      </Link>
    );
  }

  const sectionNodes: Partial<Record<DashboardSectionKey, React.ReactNode>> = {
    ...widgetNodes,
    trials: trialDigest ? (
      <Card>
        <SectionHeader
          icon={<FlaskConical className="h-4 w-4" />}
          title="Deneme dersleri"
          href="/panel/deneme"
          hrefLabel="Tümü"
        />
        {trialDigest.today.length + trialDigest.upcoming.length + trialDigest.needsAction.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {branchLabel} için bugün, önümüzdeki 7 günde veya takip bekleyen deneme dersi yok.
          </p>
        ) : (
          <div className="space-y-3">
            <TrialGroup title="Bugün" items={trialDigest.today} timeOnly />
            <TrialGroup title="Önümüzdeki 7 gün" items={trialDigest.upcoming} />
            <TrialGroup title="Takip bekleyen" items={trialDigest.needsAction} />
          </div>
        )}
      </Card>
    ) : null,
    actions: (
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
          <AlertTriangle className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden />
          Aksiyon gerekli
        </h2>
        {summary.actions.length === 0 ? (
          <div
            className="flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--color-success) 30%, transparent)",
              background: "var(--color-success-soft)",
              color: "var(--color-success)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            {branchLabel} için bugün bekleyen aksiyon yok.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {summary.actions.map((a) => {
              const tone = TONE_STYLE[a.tone];
              return (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition hover:opacity-90"
                    style={{
                      borderColor: `color-mix(in srgb, ${tone.border} 35%, transparent)`,
                      background: tone.bg,
                      color: tone.text,
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{a.label}</span>
                      <span className="block text-xs opacity-90">{a.detail}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {summary.signals.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1 font-medium">
              <Info className="h-3.5 w-3.5" aria-hidden />
              Bilgi:
            </span>
            {summary.signals.map((s) => (
              <span key={s.key}>
                {s.label} — {s.detail}
              </span>
            ))}
          </p>
        ) : null}
      </section>
    ),
    metrics: (
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Bugünkü ders" value={String(summary.counts.todayLessons)} />
        <Metric label="Aktif öğrenci" value={String(summary.counts.activeStudents)} />
        <Metric label="Aktif öğretmen" value={String(summary.counts.activeTeachers)} />
        <Metric label="Bu ay tahsil" value={formatMoney(summary.money.collectedThisMonth)} tone="success" />
        <Metric label="Açık bakiye" value={formatMoney(summary.money.outstandingTotal)} />
        <Metric
          label="Gecikmiş"
          value={formatMoney(summary.money.overdueTotal)}
          tone={summary.money.overdueTotal > 0 ? "danger" : undefined}
        />
      </section>
    ),
    todaySchedule: (
      <Card>
        <SectionHeader
          icon={<CalendarClock className="h-4 w-4" />}
          title="Bugünün programı"
          href="/panel/program"
          hrefLabel="Tüm program"
        />
        {summary.todayLessons.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {branchLabel} için bugün planlanmış ders yok.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {summary.todayLessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: l.teacherColor ?? "var(--color-border-strong)" }}
                  aria-hidden
                />
                <span className="w-[92px] shrink-0 text-sm font-semibold tabular-nums text-[var(--color-text)]">
                  {formatTime(l.startAt)}–{formatTime(l.endAt)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-[var(--color-text)]">{l.studentName}</span>
                  <span className="text-[var(--color-text-muted)]">
                    {" "}
                    · {l.instrument} · {l.teacherName} · {l.branchShortName} · {l.roomName}
                  </span>
                </span>
                {l.awaitingAttendance ? (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                  >
                    Yoklama bekliyor
                  </span>
                ) : (
                  <LessonStatusBadge status={l.status as Parameters<typeof LessonStatusBadge>[0]["status"]} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    collections: (
      <Card>
        <SectionHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Tahsilat"
          href="/panel/odemeler"
          hrefLabel="Ödemeler"
        />
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-danger)" }}>
          Gecikmiş ({summary.overdue.length})
        </p>
        {summary.overdue.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">Gecikmiş tahsilat yok.</p>
        ) : (
          <ul className="mb-3 divide-y divide-[var(--color-border)]">
            {summary.overdue.map((r) => (
              <li key={r.paymentId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link
                  href={`/panel/odemeler/${r.studentId}`}
                  className="min-w-0 truncate font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {r.studentName}
                  {r.branchShortName ? (
                    <span className="text-xs font-normal text-[var(--color-text-muted)]"> · {r.branchShortName}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums" style={{ color: "var(--color-danger)" }}>
                    {formatMoney(r.remaining)}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">
                    {Math.abs(r.daysUntilDue)} gün gecikti
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Yaklaşan vade ({summary.upcomingDue.length})
        </p>
        {summary.upcomingDue.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Önümüzdeki 14 günde vadesi gelen taksit yok.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {summary.upcomingDue.map((r) => (
              <li key={r.paymentId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link
                  href={`/panel/odemeler/${r.studentId}`}
                  className="min-w-0 truncate text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {r.studentName}
                </Link>
                <span className="shrink-0 text-right">
                  <span className="block font-medium tabular-nums">{formatMoney(r.remaining)}</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">
                    {r.daysUntilDue === 0 ? "Bugün" : `${r.daysUntilDue} gün sonra`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    contracts: (
      <Card>
        <SectionHeader
          icon={<FileWarning className="h-4 w-4" />}
          title="Sözleşme durumu"
          href="/panel/ogrenciler?contract=none&contract=expired&contract=expiring"
          hrefLabel="Öğrencilerde aç"
        />
        {summary.contractWatch.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Sözleşmesi eksik, süresi geçmiş veya yakında bitecek öğrenci yok.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {summary.contractWatch.map((c) => (
              <li key={c.studentId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link
                  href={`/panel/ogrenciler/${c.studentId}/sozlesmeler`}
                  className="min-w-0 truncate text-[var(--color-text)] hover:text-[var(--color-primary)]"
                >
                  {c.studentName}
                  {c.branchShortName ? (
                    <span className="text-xs text-[var(--color-text-muted)]"> · {c.branchShortName}</span>
                  ) : null}
                </Link>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={
                    c.state === "expiring"
                      ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
                      : { background: "var(--color-danger-soft)", color: "var(--color-danger)" }
                  }
                >
                  {c.state === "missing"
                    ? "Sözleşme yok"
                    : c.state === "expired"
                      ? `Süresi geçti · ${c.endDate}`
                      : `Bitiyor · ${c.endDate}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    branchLoad: (
      <Card>
        <SectionHeader icon={<Users className="h-4 w-4" />} title="Şube yoğunluğu" />
        <ul className="divide-y divide-[var(--color-border)]">
          {summary.branchLoad.map((b) => (
            <li key={b.branchId} className="py-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--color-text)]">{b.name}</span>
                <span className="tabular-nums text-[var(--color-text-muted)]">
                  {b.todayLessonCount} ders · {b.activeStudentCount} öğrenci
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span>Açık bakiye {formatMoney(b.outstandingAmount)}</span>
                {b.overdueAmount > 0 ? (
                  <span style={{ color: "var(--color-danger)" }}>Gecikmiş {formatMoney(b.overdueAmount)}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    ),
    tasks: (
      <Card>
        <SectionHeader
          icon={<ClipboardList className="h-4 w-4" />}
          title="İş takip"
          href="/panel/is-takip/liste"
          hrefLabel="Listeye git"
        />
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Açık" value={String(summary.taskSummary.open)} compact />
          <Metric
            label="Gecikmiş"
            value={String(summary.taskSummary.overdue)}
            tone={summary.taskSummary.overdue > 0 ? "danger" : undefined}
            compact
          />
          <Metric label="Bugün" value={String(summary.taskSummary.dueToday)} compact />
        </dl>

        {summary.teacherAttention.length > 0 ? (
          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Öğretmen — dikkat
            </p>
            <ul className="space-y-1.5 text-xs">
              {summary.teacherAttention.map((t) => (
                <li key={t.teacherId}>
                  <Link
                    href={`/panel/ogretmenler/${t.teacherId}`}
                    className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                  >
                    {t.teacherName}
                  </Link>
                  <span className="block text-[var(--color-text-muted)]">{t.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    ),
    payout:
      isOwner && payoutOverview ? (
        <Card>
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title="Bu ay öğretmen hakedişleri (yalnız kurum sahibi)"
            href="/panel/hakedisler"
            hrefLabel="Hakedişler"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Bu ay bekleyen" value={formatMoney(payoutOverview.pendingTotal)} tone="warning" />
            <Metric label="Bu ay ödenen" value={formatMoney(payoutOverview.paidTotal)} tone="success" />
            <Metric label="Aktif öğretmen" value={String(summary.counts.activeTeachers)} />
            <Metric
              label="Ücret kuralı eksik ders"
              value={String(payoutOverview.missingFeeRuleLessonCount)}
              tone={payoutOverview.missingFeeRuleLessonCount > 0 ? "danger" : undefined}
            />
          </div>
          {payoutOverview.missingFeeRuleLessonCount > 0 ? (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-xs"
              style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
            >
              {payoutOverview.missingFeeRuleLessonCount} tamamlanmış derste ücret kuralı eksik — hakediş eksiksiz
              hesaplanamıyor. Ücret Kuralları ekranından eksik kuralı tanımlayın.
            </p>
          ) : null}
        </Card>
      ) : null,
  };

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <InstitutionWelcome session={session} />
      <AssistantPageContext entity={{ kind: "page", label: "Günlük özet" }} />
      <PageHeader
        title="Günlük özet"
        description={`${formatDateTr(new Date())} · ${branchLabel}`}
      />

      {!setupProgress.isReady ? (
        <Link
          href="/panel/kurulum"
          className="mb-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Okul kurulumunu tamamla ({setupProgress.completedCount}/{setupProgress.totalCount}) →
        </Link>
      ) : null}

      <DashboardGrid
        leading={
          <DashboardBranchSwitcher
            branches={data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }))}
            activeBranchId={activeBranchId}
            defaultBranchId={defaultBranchId}
          />
        }
        role={session.role}
        sections={sectionNodes}
        initialOrder={layout.order}
        initialHidden={layout.hidden}
        initialSpans={layout.spans}
        initialSavedViews={prefs.dashboard?.savedViews ?? []}
        initialActiveViewId={prefs.dashboard?.activeViewId}
        widgetCatalog={permittedScreenWidgets(widgetAccess).map((w) => ({ key: w.key, label: w.label, category: w.category }))}
      />
    </div>
  );
}

function TrialGroup({ title, items, timeOnly }: { title: string; items: TrialDigestItem[]; timeOnly?: boolean }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 6);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title} · {items.length}
      </p>
      <ul className="divide-y divide-[var(--color-border)]">
        {shown.map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 py-2 hover:opacity-80">
              <span className="w-[92px] shrink-0 text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {timeOnly ? formatTime(t.startAt) : `${formatDateTr(t.startAt).slice(0, 5)} ${formatTime(t.startAt)}`}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-[var(--color-text)]">{t.name}</span>
                <span className="text-[var(--color-text-muted)]">
                  {" "}
                  · {t.instrument} · {t.teacherName} · {t.branchName}
                </span>
                {t.prepNote ? <span className="block text-xs text-[var(--color-text-muted)]">Not: {t.prepNote}</span> : null}
              </span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={
                  t.action
                    ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
                    : { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }
                }
              >
                {t.action ?? t.statusLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > shown.length ? (
        <Link href="/panel/deneme" className="text-xs font-medium text-[var(--color-primary)]">
          +{items.length - shown.length} deneme daha →
        </Link>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  href,
  hrefLabel,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
        <span className="text-[var(--color-text-muted)]" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {href ? (
        <Link href={href} className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          {hrefLabel ?? "Aç"} →
        </Link>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success" | "warning";
  compact?: boolean;
}) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "success"
        ? "var(--color-success)"
        : tone === "warning"
          ? "var(--color-warning)"
          : "var(--color-text)";
  return (
    <div
      className={
        compact
          ? "rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-2 py-1.5"
          : "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
      }
    >
      <p className="truncate text-base font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
