import Link from "@/components/link";
import { redirect } from "next/navigation";
import { addDays, subDays, format } from "date-fns";
import { AlertTriangle, ChevronRight, CreditCard, Mail, Phone, Upload, UserPlus, Wallet } from "lucide-react";
import { Badge, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedLessonWindow } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { computeTeacherPerformanceReportV2 } from "@/lib/teacher-performance-v2";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
import { TeacherListView } from "@/components/teacher-list-view";
import { TEACHER_ROW_GRID } from "@/lib/teacher-list-filter";

export const dynamic = "force-dynamic";

const DAY_MS = 1000 * 60 * 60 * 24;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toLocaleUpperCase("tr");
}

function scoreTone(score: number) {
  if (score >= 80) return "text-[var(--color-success)]";
  if (score >= 60) return "text-[var(--color-warning)]";
  return "text-[var(--color-danger)]";
}

const iconLinkClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]";

export default async function OgretmenlerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogretmenler");
  }
  const kurum = await getInstitutionContext(session);
  const now = new Date();
  // Bu hafta (Pzt–Paz) — aşağıdaki planlı ders sayısı için.
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()));
  // DB egress (2026-10-10): sayfa yalnız son 30 günün (performans) ve bu haftanın derslerine bakar — kurumun TÜM
  // ders/ödeme geçmişi yerine bu aralığın ±2–3 günlük payla penceresi okunur (saat dilimi/gün sınırı payı).
  const data = await readScopedLessonWindow(kurum.scope, subDays(now, 33), addDays(weekStart, 9));
  const canSeePerformance = session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN";
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  // 2026-10-03 — listeden kaldırılan öğretmenler hiçbir listede görünmez; geçmiş kayıtlar ve raporlar adı korur.
  const teachers = data.teachers.filter((t) => !t.deletedAt);
  const removedTeachers = canManage ? data.teachers.filter((t) => t.deletedAt) : [];

  // Skor modeli detay ekranıyla (/panel/ogretmenler/[teacherId]/performans) aynı: teacher-performance-v2,
  // son 30 gün. `readScopedData` tek okuma; öğretmen başına v2 iç sorguları paralel çalışır.
  const periodStart = format(subDays(now, 30), "yyyy-MM-dd");
  const periodEnd = format(now, "yyyy-MM-dd");
  const performanceEntries = canSeePerformance
    ? await Promise.all(
        teachers
          .filter((t) => t.active)
          .map(async (t) => [t.id, await computeTeacherPerformanceReportV2(data, session.tenantId, t.id, periodStart, periodEnd)] as const)
      )
    : [];
  const performanceById = new Map(performanceEntries);

  // Bu hafta (Pzt–Paz) planlı ders sayısı — eski "tüm zamanlar kayıtlı ders" sayısının yerine.
  const weekEnd = weekStart.getTime() + 7 * DAY_MS;
  const weekLessonCount = new Map<string, number>();
  for (const l of data.lessons) {
    if (l.status === "cancelled") continue;
    const t = new Date(l.startAt).getTime();
    if (t >= weekStart.getTime() && t < weekEnd) weekLessonCount.set(l.teacherId, (weekLessonCount.get(l.teacherId) ?? 0) + 1);
  }
  const activeStudentCount = new Map<string, number>();
  for (const s of data.students) if (s.active && s.teacherId) activeStudentCount.set(s.teacherId, (activeStudentCount.get(s.teacherId) ?? 0) + 1);
  const teachersWithFee = new Set(data.teacherFeeRules.map((r) => r.teacherId));

  // Detay "Özet" sekmesindeki uyarılarla aynı kurallar — listede yalnız aktif öğretmenler için.
  function attentionFor(t: (typeof teachers)[number]) {
    if (!t.active) return [];
    const out: { label: string; href: string; tone: "danger" | "warning" }[] = [];
    const daysLeft = t.contractEndDate ? Math.ceil((new Date(t.contractEndDate).getTime() - now.getTime()) / DAY_MS) : null;
    if (daysLeft !== null && daysLeft < 0) out.push({ label: "Sözleşme süresi doldu", href: "bilgiler", tone: "danger" });
    else if (daysLeft !== null && daysLeft <= 30) out.push({ label: `Sözleşme ${daysLeft} gün içinde bitiyor`, href: "bilgiler", tone: "warning" });
    if (t.availability.length === 0) out.push({ label: "Müsaitlik tanımlı değil", href: "musaitlik", tone: "warning" });
    if (canManage && !teachersWithFee.has(t.id)) out.push({ label: "Hakediş ücreti tanımlı değil", href: "hakedis", tone: "warning" });
    return out;
  }

  const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName ?? id;
  const listRows = teachers.map((t) => ({
    id: t.id,
    displayId: t.displayId,
    name: t.name,
    email: t.email,
    phone: t.phone,
    branchId: t.branchId,
    branchIds: t.branchIds,
    instruments: t.instruments,
    active: t.active,
    studentCount: activeStudentCount.get(t.id) ?? 0,
  }));
  const instrumentOptions = Array.from(new Set(teachers.flatMap((t) => t.instruments))).sort((a, b) => a.localeCompare(b, "tr"));

  const activeTeachers = teachers.filter((t) => t.active);
  const summary = [
    { label: "Aktif öğretmen", value: activeTeachers.length },
    { label: "Aktif öğrenci", value: activeTeachers.reduce((n, t) => n + (activeStudentCount.get(t.id) ?? 0), 0) },
    { label: "Bu hafta ders", value: activeTeachers.reduce((n, t) => n + (weekLessonCount.get(t.id) ?? 0), 0) },
    { label: "İlgilenilmesi gereken", value: activeTeachers.filter((t) => attentionFor(t).length > 0).length, warn: true },
  ];

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Öğretmenler" }} />
      <PageHeader
        title="Öğretmenler"
        description="Öğretmen kadrosu, ders yükü ve dikkat gerektiren kayıtlar."
        actions={
          <>
            {canManage ? (
              <Link
                href="/panel/veri-aktar"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)] active:scale-[0.98]"
              >
                <Upload className="h-4 w-4" /> Toplu aktar
              </Link>
            ) : null}
            <Link
              href="/panel/ogretmenler/yeni"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            >
              <UserPlus className="h-4 w-4" /> Yeni Öğretmen
            </Link>
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] sm:grid-cols-4">
        {summary.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "px-5 py-4",
              i % 2 === 1 && "border-l border-[var(--color-border)]",
              i >= 2 && "border-t border-[var(--color-border)] sm:border-t-0",
              i === 2 && "sm:border-l"
            )}
          >
            <dt className="text-xs font-medium text-[var(--color-text-muted)]">{s.label}</dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
                s.warn && s.value > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-text)]"
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <TeacherListView
        rows={listRows}
        showPerformance={canSeePerformance}
        branches={data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }))}
        instruments={instrumentOptions}
        cards={Object.fromEntries(
          teachers.map((t) => {
            const studentCount = activeStudentCount.get(t.id) ?? 0;
            const weekLessons = weekLessonCount.get(t.id) ?? 0;
            const perf = performanceById.get(t.id);
            const attention = attentionFor(t);
            const branchLabel = [t.branchId, ...(t.branchIds ?? []).filter((b) => b !== t.branchId)].map(branchName).join(", ");
            const href = `/panel/ogretmenler/${t.id}`;
            return [
              t.id,
              <div
                key={t.id}
                className={cn(
                  "grid gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-[var(--color-surface-muted)]/60",
                  TEACHER_ROW_GRID,
                  "lg:items-center",
                  !t.active && "opacity-70"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-sm font-semibold text-[var(--color-primary-soft-text)]"
                  >
                    {initials(t.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={href} className="truncate font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                        {t.name}
                      </Link>
                      {t.displayId ? <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{t.displayId}</span> : null}
                      {t.active ? null : <Badge status="cancelled">Pasif</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
                      {t.phone ? (
                        <a href={`tel:${t.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]">
                          <Phone className="h-3 w-3" /> {t.phone}
                        </a>
                      ) : null}
                      {t.email ? (
                        <a href={`mailto:${t.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-[var(--color-primary)]">
                          <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{t.email}</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="min-w-0 pl-[3.25rem] lg:pl-0">
                  <p className="truncate text-sm text-[var(--color-text)]">{branchLabel || "Şube atanmamış"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.instruments.length ? t.instruments.map((i) => <Badge key={i}>{i}</Badge>) : (
                      <span className="text-xs text-[var(--color-text-muted)]">Enstrüman atanmamış</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-6 pl-[3.25rem] text-sm lg:block lg:pl-0">
                  <p>
                    <span className="font-semibold tabular-nums text-[var(--color-text)]">{studentCount}</span>{" "}
                    <span className="text-[var(--color-text-muted)]">öğrenci</span>
                  </p>
                  <p>
                    <span className="font-semibold tabular-nums text-[var(--color-text)]">{weekLessons}</span>{" "}
                    <span className="text-[var(--color-text-muted)]">ders bu hafta</span>
                  </p>
                </div>

                {canSeePerformance ? (
                  <div className="flex items-center gap-1 pl-[3.25rem] lg:pl-0">
                    {perf ? (
                      <>
                        <Link
                          href={`${href}/performans`}
                          className="rounded-[var(--radius-md)] px-1 text-sm hover:bg-[var(--color-surface-muted)]"
                          title="Son 30 günün performans skoru, detay için tıklayın"
                        >
                          {perf.score === null ? (
                            <span className="text-[var(--color-text-muted)]">Yetersiz veri</span>
                          ) : (
                            <>
                              <span className={cn("text-lg font-semibold tabular-nums", scoreTone(perf.score))}>{perf.score}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">/100</span>
                            </>
                          )}
                        </Link>
                        <AiInsightTrigger
                          capabilityId="teacherPerformanceScore"
                          label="AI ile performans yorumu"
                          iconOnly
                          payload={{ teacherName: t.name, ...perf }}
                        />
                      </>
                    ) : (
                      <span className="text-sm text-[var(--color-text-muted)]">Pasif</span>
                    )}
                  </div>
                ) : null}

                <div className="flex items-center gap-1.5 pl-[3.25rem] lg:justify-end lg:pl-0">
                  <Link href={`${href}/hakedis`} className={iconLinkClass} aria-label={`${t.name} hakediş`} title="Hakediş">
                    <Wallet className="h-4 w-4" />
                  </Link>
                  <Link href={`${href}/odemeler`} className={iconLinkClass} aria-label={`${t.name} ödeme geçmişi`} title="Ödeme geçmişi">
                    <CreditCard className="h-4 w-4" />
                  </Link>
                  <Link
                    href={href}
                    className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] px-3 text-xs font-semibold text-[var(--color-primary-soft-text)] transition hover:brightness-95 active:scale-[0.98]"
                  >
                    Detay <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {attention.length ? (
                  <ul className="col-span-full flex flex-wrap gap-2 pl-[3.25rem]">
                    {attention.map((a) => (
                      <li key={a.label}>
                        <Link
                          href={`${href}/${a.href}`}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition hover:opacity-85"
                          style={{ background: `var(--color-${a.tone}-soft)`, color: `var(--color-${a.tone})` }}
                        >
                          <AlertTriangle className="h-3 w-3" /> {a.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>,
            ];
          })
        )}
      />

      {removedTeachers.length > 0 ? (
        <details className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--color-text-muted)]">
            Listeden kaldırılan öğretmenler ({removedTeachers.length})
          </summary>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Geçmiş ders, yoklama ve hakediş kayıtları korunur. Geri almak için öğretmenin sayfasını açın.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {removedTeachers.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/panel/ogretmenler/${t.id}`}
                  className="inline-flex rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
