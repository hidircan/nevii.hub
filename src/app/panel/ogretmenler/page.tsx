import Link from "@/components/link";
import { redirect } from "next/navigation";
import { subDays, format } from "date-fns";
import { CreditCard, UserPlus, Wallet } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { dayName } from "@/lib/utils";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { computeTeacherPerformanceReportV2 } from "@/lib/teacher-performance-v2";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
import { TeacherArchiveAction } from "@/components/teacher-archive-action";
import { TeacherPerformanceInfo } from "@/components/teacher-performance-info";
import { TeacherListView } from "@/components/teacher-list-view";

export const dynamic = "force-dynamic";

export default async function OgretmenlerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogretmenler");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const canSeePerformance = session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN";
  const canManage = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";

  // Liste görünümü artık eski (all-time) computeTeacherPerformanceScore yerine
  // teacher-performance-v2 kullanır — aynı skor modeli/ağırlıklandırma detay
  // ekranıyla (/panel/ogretmenler/[teacherId]/performans) birebir tutarlı olsun
  // diye. Varsayılan dönem son 30 gün (detay ekranıyla aynı varsayılan).
  // `readScopedData` zaten tüm öğretmenleri tek seferde getirdiği için, burada
  // N+1 STORE okuması yok — yalnızca teacher başına v2'nin kendi iç
  // feedback/task/homework sorguları paralel (`Promise.all`) çalışır.
  const now = new Date();
  const periodStart = format(subDays(now, 30), "yyyy-MM-dd");
  const periodEnd = format(now, "yyyy-MM-dd");
  const performanceEntries = canSeePerformance
    ? await Promise.all(
        data.teachers
          .filter((t) => t.active)
          .map(async (t) => [t.id, await computeTeacherPerformanceReportV2(data, session.tenantId, t.id, periodStart, periodEnd)] as const)
      )
    : [];
  const performanceById = new Map(performanceEntries);

  // 8. tur (D) — arama/şube/enstrüman/durum/sıralama/sayfalama istemcide
  // (`TeacherListView`, URL parametreleri). Varsayılan hâlâ yalnız aktifler;
  // eski `?durum=arsiv` bağlantısı "Pasif" filtresine karşılık gelir.
  const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName ?? id;
  const activeStudentCount = new Map<string, number>();
  for (const s of data.students) if (s.active && s.teacherId) activeStudentCount.set(s.teacherId, (activeStudentCount.get(s.teacherId) ?? 0) + 1);
  const listRows = data.teachers.map((t) => ({
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
  const instrumentOptions = Array.from(new Set(data.teachers.flatMap((t) => t.instruments))).sort((a, b) => a.localeCompare(b, "tr"));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Öğretmenler" }} />
      <PageHeader
        title="Öğretmenler"
        actions={
          <Link
            href="/panel/ogretmenler/yeni"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            <UserPlus className="h-4 w-4" /> Yeni Öğretmen
          </Link>
        }
      />

      <TeacherListView
        rows={listRows}
        branches={data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }))}
        instruments={instrumentOptions}
        cards={Object.fromEntries(
          data.teachers.map((t) => {
            const studentCount = activeStudentCount.get(t.id) ?? 0;
            const weekLessons = data.lessons.filter((l) => l.teacherId === t.id && l.status !== "cancelled").length;
            return [
              t.id,
              <Card key={t.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/panel/ogretmenler/${t.id}`}
                      className="font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] dark:text-slate-50"
                    >
                      {t.name}
                    </Link>
                    <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      {[t.branchId, ...(t.branchIds ?? []).filter((b) => b !== t.branchId)].map(branchName).join(", ")} ·{" "}
                      {t.email} · {t.phone}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {t.instruments.map((i) => (
                        <Badge key={i}>{i}</Badge>
                      ))}
                    </div>
                    {canManage ? (
                      <TeacherArchiveAction teacherId={t.id} teacherName={t.name} archived={!t.active} />
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[var(--color-surface-muted)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Öğrenci</p>
                    <p className="text-lg font-semibold">{studentCount}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-muted)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Kayıtlı ders</p>
                    <p className="text-lg font-semibold">{weekLessons}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Müsaitlik
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {t.availability.map((a) => (
                      <span
                        key={`${a.dayOfWeek}-${a.start}`}
                        className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800"
                      >
                        {dayName(a.dayOfWeek)} {a.start}–{a.end}
                      </span>
                    ))}
                  </div>
                </div>

                {canSeePerformance && performanceById.get(t.id) ? (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                    {(() => {
                      const perf = performanceById.get(t.id)!;
                      return (
                        <Link
                          href={`/panel/ogretmenler/${t.id}/performans`}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--color-surface-muted)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm text-[var(--color-text-muted)]">
                                Performans skoru:{" "}
                                <span className="font-semibold text-[var(--color-text)]">
                                  {perf.score === null ? "Yetersiz veri" : `${perf.score}/100`}
                                </span>
                              </p>
                              <Badge status="scheduled">v2</Badge>
                              <TeacherPerformanceInfo />
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Son 30 gün · detay için tıklayın</p>
                          </div>
                          <AiInsightTrigger
                            capabilityId="teacherPerformanceScore"
                            label="AI ile performans yorumu"
                            iconOnly
                            payload={{ teacherName: t.name, ...perf }}
                          />
                        </Link>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
                  <Link
                    href={`/panel/ogretmenler/${t.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-soft-text)] hover:bg-[var(--color-primary-soft)]/70"
                  >
                    Detay
                  </Link>
                  <Link
                    href={`/panel/ogretmenler/${t.id}/hakedis`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                  >
                    <Wallet className="h-3.5 w-3.5" /> Hakediş
                  </Link>
                  <Link
                    href={`/panel/ogretmenler/${t.id}/odemeler`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Ödeme geçmişi
                  </Link>
                </div>
              </Card>,
            ];
          })
        )}
      />
    </div>
  );
}
