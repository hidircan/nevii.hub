import { redirect } from "next/navigation";
import { actionCancelMakeup, actionConfirmSlot } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { foldTurkishForSearch } from "@/lib/normalize";
import { buildStudentMakeupSummary, MAKEUP_STAGE_LABEL } from "@/lib/makeup-student-summary";
import { effectiveEnrollments, enrollmentDisplayName } from "@/lib/student-enrollments";
import { MakeupDecisionForm } from "@/components/makeup-decision-form";
import { GenerateSuggestionsForm } from "@/components/generate-suggestions-form";
import { ManualMakeupPlanForm } from "@/components/manual-makeup-plan-form";
import Link from "@/components/link";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatDateTime, formatTime } from "@/lib/utils";
import { isRoomSchedulable, makeupDurationMinutes, validateLessonSlot } from "@/lib/makeup-engine";
import { isTeacherSchedulable } from "@/lib/teacher-branches";
import type { Instrument } from "@/lib/types";
import { CheckCircle2, Download, Sparkles, X } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { QuickTaskLink } from "@/components/quick-task-link";
import { MakeupWindowDaysEditor } from "@/components/makeup-window-days-editor";
import { MakeupPolicyDialog } from "@/components/makeup-policy-dialog";
import { MakeupHistoryTable } from "@/components/makeup-history-table";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { MakeupFilterBar, type MakeupSelectedPerson } from "@/components/makeup-filter-bar";
import { MakeupSuggestionsDisclosure } from "@/components/makeup-suggestions-disclosure";
import {
  filterMakeupRequests,
  isActiveTeacher,
  makeupFilterHref,
  MAKEUP_PAGE_SIZES,
  paginateMakeup,
  parseMakeupPageSize,
  makeupStudentOptions,
  makeupTeacherOptions,
  parseMakeupFilters,
  studentBranchIds,
  teacherBranchIds,
} from "@/lib/makeup-filters";
import { isActiveStudent } from "@/lib/payment-scope";

const MORE_SUGGESTIONS_COUNT = 18;

export const dynamic = "force-dynamic";

type Durum = "tumu" | "acil" | "oneri-var" | "oneri-yok";
const DURUM_LABEL: Record<Durum, string> = {
  tumu: "Tümü",
  acil: "Süresi 3 gün içinde doluyor",
  "oneri-var": "Önerisi hazır",
  "oneri-yok": "Henüz önerisi yok",
};
const URGENT_DAYS = 3;

function daysLeftLabel(days: number): string {
  if (days < 0) return "Süresi doldu";
  if (days === 0) return "Bugün son gün";
  return `${days} gün kaldı`;
}

/**
 * 2026-09-30 yeniden tasarım — yönetici önce süresi en yakın dolan talebi görür; her önerinin
 * NEDEN uygun olduğu yazılır ve öneri ekranda YENİDEN doğrulanır (oda pasife alındı, saat doldu,
 * saat geçti…) — artık uygun olmayan öneri gerekçesiyle kilitlenir. Kayıt anında sunucu aynı
 * `validateLessonSlot` kuralını bir kez daha uygular.
 */
const MAX_SUMMARY_STUDENTS = 10;

export default async function TelafiPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; q?: string; sayfa?: string; gsayfa?: string; adet?: string; ogrenci?: string; sube?: string; ogretmen?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/telafi");
  }
  const { durum: durumParam, q: qParam, sayfa, gsayfa, adet, ogrenci, sube, ogretmen } = await searchParams;
  // 2026-10-07 — sayfa başı satır (10/50/100) hem açık talepler hem geçmiş listesine uygulanır.
  const pageSize = parseMakeupPageSize(adet);
  // 2026-10-04 — isme göre arama (eski `?q=` bağlantıları için korunur): Türkçe harf katlamalı; sunucuda süzülür.
  // 2026-10-06 — yeni filtreler kimlikle: `?ogrenci=` `?sube=` `?ogretmen=` (bkz. makeup-filters.ts).
  const q = (qParam ?? "").trim().slice(0, 80);
  const qFold = q ? foldTurkishForSearch(q) : "";
  const durum: Durum = durumParam && durumParam in DURUM_LABEL ? (durumParam as Durum) : "tumu";
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const matchingStudentIds = qFold
    ? new Set(
        data.students
          .filter((s) => foldTurkishForSearch(s.name).includes(qFold) || foldTurkishForSearch(s.parentName ?? "").includes(qFold))
          .map((s) => s.id)
      )
    : null;
  const filters = parseMakeupFilters(
    { ogrenci, sube, ogretmen },
    { students: data.students, teachers: data.teachers, branchIds: data.settings.branches.map((b) => b.id) }
  );
  // Filtreler sayaç ve sayfalamadan ÖNCE (AND). Filtre seçilmediğinde pasif kişilerin geçmiş talepleri GİZLENMEZ.
  const requests = filterMakeupRequests(data.makeupRequests, filters)
    .filter((r) => !matchingStudentIds || matchingStudentIds.has(r.studentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const OPEN_STATUSES = ["pending", "suggested", "awaiting_info"];
  const now = new Date();
  const daysLeft = (r: (typeof requests)[number]) => differenceInCalendarDays(parseISO(r.expiresAt), now);
  // Önce çözülmesi gereken en üstte: son kullanım tarihi en yakın olan.
  const open = requests
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const counts: Record<Durum, number> = {
    tumu: open.length,
    acil: open.filter((r) => daysLeft(r) <= URGENT_DAYS).length,
    "oneri-var": open.filter((r) => r.suggestedSlots.length > 0).length,
    "oneri-yok": open.filter((r) => r.suggestedSlots.length === 0).length,
  };
  const visible = open.filter((r) =>
    durum === "acil" ? daysLeft(r) <= URGENT_DAYS : durum === "oneri-var" ? r.suggestedSlots.length > 0 : durum === "oneri-yok" ? r.suggestedSlots.length === 0 : true
  );
  const doneAll = requests.filter((r) => !OPEN_STATUSES.includes(r.status));
  // Sayfalama filtre + durum sekmesinden SONRA; sayaçlar filtre kapsamının tamamından gelir.
  const openPaged = paginateMakeup(visible, sayfa, pageSize);
  const historyPaged = paginateMakeup(doneAll, gsayfa, pageSize);
  const done = historyPaged.items;
  // Durum sekmesi, sayfa ve sayfa başı geçişlerinde filtreler korunur.
  const hrefWith = (params: { durum?: string; sayfa?: number; gsayfa?: number; adet?: number }) =>
    makeupFilterHref({ ...filters, q, adet: pageSize, ...params });
  const summaryStudents = filters.studentId
    ? data.students.filter((s) => s.id === filters.studentId)
    : matchingStudentIds
      ? data.students
          .filter((s) => matchingStudentIds.has(s.id))
          .sort((a, b) => a.name.localeCompare(b.name, "tr"))
          .slice(0, MAX_SUMMARY_STUDENTS)
      : [];
  const selectedStudentRow = data.students.find((s) => s.id === filters.studentId);
  const selectedTeacherRow = data.teachers.find((t) => t.id === filters.teacherId);
  const selectedStudent: MakeupSelectedPerson | null = selectedStudentRow
    ? { id: selectedStudentRow.id, name: selectedStudentRow.name, branchIds: studentBranchIds(selectedStudentRow), inactive: !isActiveStudent(selectedStudentRow) }
    : null;
  const selectedTeacher: MakeupSelectedPerson | null = selectedTeacherRow
    ? { id: selectedTeacherRow.id, name: selectedTeacherRow.name, branchIds: teacherBranchIds(selectedTeacherRow), inactive: !isActiveTeacher(selectedTeacherRow) }
    : null;
  const canWrite = kurum.scope.mode === "single";
  const actorNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: done.map((r) => r.decidedBy),
    teachers: data.teachers,
  });
  const actorLabel = (userId?: string) => (userId ? actorNames.get(userId) ?? "Kayıtlı kullanıcı" : "Sistem");
  const nowMs = now.getTime();
  const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName ?? "";

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Telafi Merkezi" }} />
      <PageHeader
        title="Telafi Merkezi"
        actions={<MakeupPolicyDialog />}
      />

      <nav aria-label="Telafi talebi filtresi" className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(DURUM_LABEL) as Durum[]).map((key) => {
          const active = key === durum;
          const urgent = key === "acil" && counts.acil > 0;
          return (
            <Link
              key={key}
              href={hrefWith({ durum: key })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-surface)]"
                  : urgent
                    ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              {DURUM_LABEL[key]}
              <span className="tabular-nums font-semibold">{counts[key]}</span>
            </Link>
          );
        })}
      </nav>

      <MakeupFilterBar
        branches={data.settings.branches.map((b) => ({ id: b.id, name: b.shortName }))}
        studentOptions={makeupStudentOptions(data.students)}
        teacherOptions={makeupTeacherOptions(data.teachers)}
        filters={filters}
        selectedStudent={selectedStudent}
        selectedTeacher={selectedTeacher}
        durum={durum}
        pageSize={pageSize}
        legacyQuery={q}
      />

      {filters.studentId || q ? (
        <section aria-label="Öğrenci bazında telafi özeti" className="mb-5">
          {summaryStudents.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">&quot;{q}&quot; ile eşleşen öğrenci yok.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Öğrenci</th>
                    <th className="px-3 py-2 font-medium">Dönem hakkı (kalan / toplam)</th>
                    <th className="px-3 py-2 font-medium">{MAKEUP_STAGE_LABEL.pending}</th>
                    <th className="px-3 py-2 font-medium">{MAKEUP_STAGE_LABEL.planned}</th>
                    <th className="px-3 py-2 font-medium">{MAKEUP_STAGE_LABEL.completed}</th>
                    <th className="px-3 py-2 font-medium">İptal / süresi dolan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {summaryStudents.flatMap((st) => {
                    // 2026-10-09 — telafi hakkı branş başınadır: çok branşlı öğrencide her branş ayrı satır.
                    const studentRow = data.students.find((x) => x.id === st.id);
                    const branches = studentRow ? effectiveEnrollments(studentRow, data.teachers) : [];
                    const targets: { key: string; enrollmentId?: string; label?: string }[] =
                      branches.length > 1
                        ? branches.map((e) => ({ key: `${st.id}:${e.id}`, enrollmentId: e.id, label: enrollmentDisplayName(e, branches, data.teachers) }))
                        : [{ key: st.id }];
                    return targets.map((t) => ({ st, t, sum: buildStudentMakeupSummary(data, st.id, now, t.enrollmentId) }));
                  }).map(({ st, t, sum }) => {
                    return (
                      <tr key={t.key}>
                        <td className="px-3 py-2">
                          <Link href={`/panel/ogrenciler/${st.id}/program${t.enrollmentId ? `?brans=${encodeURIComponent(t.enrollmentId)}` : ""}#telafiler`} className="font-medium text-[var(--color-primary)] hover:underline">
                            {st.name}
                          </Link>
                          {t.label ? <span className="ml-1 text-[var(--color-text-muted)]">· {t.label}</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          {sum.quota.remaining} / {sum.quota.allowance}
                        </td>
                        <td className="px-3 py-2">{sum.counts.pending}</td>
                        <td className="px-3 py-2">{sum.counts.planned}</td>
                        <td className="px-3 py-2">{sum.counts.completed}</td>
                        <td className="px-3 py-2">{sum.counts.cancelled + sum.counts.expired}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {matchingStudentIds && matchingStudentIds.size > MAX_SUMMARY_STUDENTS ? (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {matchingStudentIds.size} öğrenci eşleşti; ilk {MAX_SUMMARY_STUDENTS} gösteriliyor — aramayı daraltın.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <MakeupWindowDaysEditor
            currentDays={data.settings.makeupWindowDays}
            monthlyAllowance={data.settings.monthlyMakeupAllowance ?? 2}
            canWrite={canWrite}
            compact
          />
        </div>
        {open.length > 0 ? (
          <AiInsightTrigger
            capabilityId="makeupSlotSuggestion"
            label="AI ile öncelik özeti"
            compact
            payload={{
              openCount: open.length,
              oldestRequestAt: open.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), open[0].createdAt),
              byInstrument: open.reduce<Record<string, number>>((acc, r) => {
                acc[r.instrument] = (acc[r.instrument] || 0) + 1;
                return acc;
              }, {}),
              expiringSoon: open.filter((r) => new Date(r.expiresAt).getTime() - nowMs < 3 * 24 * 60 * 60 * 1000).length,
            }}
          />
        ) : null}
      </div>

      {!canWrite ? (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft,var(--color-surface-muted))] px-3 py-2 text-xs font-medium text-[var(--color-warning)]">
          &quot;Tüm kurumlar&quot; görünümündesiniz — telafi onayı/iptali/planlaması için üstteki kurum
          seçiciden tek bir kurum seçin.
        </p>
      ) : null}

      {/* 2026-10-07 — satır limiti: sayfa başı 10/50/100 (bağlantı — JS gerektirmez), sayfalar arası geçiş altta. */}
      {visible.length > 0 || doneAll.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-text-muted)]">
          <p aria-live="polite">
            {visible.length} açık talep
            {openPaged.totalPages > 1 ? ` · ${(openPaged.page - 1) * pageSize + 1}–${Math.min(openPaged.page * pageSize, visible.length)} gösteriliyor` : ""}
          </p>
          <nav aria-label="Sayfa başı satır sayısı" className="flex items-center gap-1.5">
            <span>Sayfa başı</span>
            <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {MAKEUP_PAGE_SIZES.map((size) => {
                const current = size === pageSize;
                return (
                  <Link
                    key={size}
                    href={hrefWith({ durum, adet: size })}
                    aria-current={current ? "true" : undefined}
                    className={`px-2.5 py-1 text-sm font-medium tabular-nums transition-colors ${
                      current
                        ? "bg-[var(--color-text)] text-[var(--color-surface)]"
                        : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                    }`}
                  >
                    {size}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title={open.length === 0 ? "Açık telafi talebi yok" : "Bu filtrede talep yok"}
          description={
            open.length === 0
              ? "Yoklamada “Telafi” işaretlediğiniz dersler buraya gelir; ardından uygun saat bulup planlarsınız."
              : "Başka bir filtre seçin veya tüm talepleri görün."
          }
        />
      ) : (
        <div className="space-y-3">
          {openPaged.items.map((req) => {
            const student = data.students.find((s) => s.id === req.studentId);
            const teacher = data.teachers.find((t) => t.id === req.teacherId);
            const sourceLesson = data.lessons.find((l) => l.id === req.sourceLessonId);
            const left = daysLeft(req);
            const usableRooms = data.rooms.filter((r) => isRoomSchedulable(r) && r.instruments.includes(req.instrument as Instrument));
            // Öneriler yalnız talebin şubesindeki aktif odalardan gelir (başka şubeye düşülmez).
            const noRoomReason = !usableRooms.some((r) => r.branchId === req.branchId)
              ? `${branchName(req.branchId)} şubesinde ${req.instrument} dersine uygun aktif oda yok; otomatik öneri yapılamaz. Odalar ekranından bu şubedeki bir odaya enstrümanı ekleyin veya pasif odayı yeniden aktif edin${usableRooms.length > 0 ? "; ya da aşağıdan öğretmenin başka şubesindeki aktif bir odayı elle seçin" : ""}.`
              : null;
            // Öneri kaydedildiği andan sonra uygunluk değişmiş olabilir — aynı kuralla yeniden doğrula.
            // Telafi dersi kaynak dersin süresindedir (kurum varsayılanı DEĞİL) — kayıtla aynı kural.
            const durationMinutes = makeupDurationMinutes(data, req);
            const checked = req.suggestedSlots.map((slot) => ({
              slot,
              check: validateLessonSlot(
                data,
                req,
                { teacherId: slot.teacherId, roomId: slot.roomId, startAt: slot.startAt },
                { durationMinutes }
              ),
            }));
            return (
              <Card key={req.id} className="p-0">
                {/* 2026-10-06 — kompakt kart: kimlik/öğretmen/şube/durum/son gün üstte; öneriler varsayılan kapalı. */}
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[var(--color-text)]">
                        {student ? (
                          <Link href={`/panel/ogrenciler/${student.id}/program#telafiler`} className="hover:underline">
                            {student.name}
                          </Link>
                        ) : (
                          "Öğrenci bulunamadı"
                        )}
                      </h3>
                      <Badge status="makeup">{req.instrument}</Badge>
                      <Badge status={req.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                      Öğretmen {teacher?.name ?? "—"} · {branchName(req.branchId)} şubesi
                      {sourceLesson ? <> · Kaçan ders {formatDateTime(sourceLesson.startAt)}</> : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]" title={req.reason}>
                      Neden: {req.reason}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 self-start rounded-[var(--radius-md)] border px-2.5 py-1.5 sm:text-right ${
                      left <= URGENT_DAYS ? "border-rose-300 bg-rose-50 text-rose-800" : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">{daysLeftLabel(left)}</p>
                    <p className="text-xs">Son gün {formatDateTime(req.expiresAt)}</p>
                  </div>
                </div>

                {noRoomReason ? (
                  <p className="mx-3 mb-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-4">
                    {noRoomReason}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-3 py-2.5 sm:px-4">
                  <MakeupSuggestionsDisclosure requestId={req.id} count={req.suggestedSlots.length}>
                    <div className="pt-1">
                      {checked.length === 0 ? (
                        <p className="text-sm text-[var(--color-text-muted)]">
                          Henüz öneri yok. “Uygun saatleri bul” bugünden sonraki saatlerde öğretmenin çalışma saatlerini, bu
                          şubenin aktif odalarını, açık günleri ve öğretmen/oda/öğrenci çakışmalarını tarar. Geçmiş bir tarihe
                          planlamak için “Başka bir saat planla”yı kullanın.
                        </p>
                      ) : (
                        <ol className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                          {checked.map(({ slot, check }, idx) => {
                            const slotTeacher = data.teachers.find((t) => t.id === slot.teacherId);
                            const room = data.rooms.find((r) => r.id === slot.roomId);
                            return (
                              <li
                                key={`${slot.startAt}-${slot.teacherId}-${idx}`}
                                className={`grid gap-2 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_15rem] lg:items-start ${check.ok ? "" : "bg-[var(--color-surface-muted)]"}`}
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-[var(--color-text)]">
                                    {formatDateTime(slot.startAt)}
                                    {idx === 0 && check.ok ? (
                                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">En uygun</span>
                                    ) : null}
                                  </p>
                                  <p className="text-sm text-[var(--color-text-muted)]">
                                    {formatTime(slot.startAt)}–{formatTime(slot.endAt)}, {slotTeacher?.name ?? "—"} · {room?.name ?? "Oda bulunamadı"},{" "}
                                    {branchName(slot.branchId)}
                                  </p>
                                </div>
                                {check.ok ? (
                                  <ul className="space-y-0.5 text-xs text-[var(--color-text-muted)]">
                                    {slot.reasons.map((r) => (
                                      <li key={r} className="flex gap-1.5">
                                        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                                        {r}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="flex gap-1.5 text-sm text-rose-700">
                                    <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    Artık uygun değil: {check.message} “Önerileri yenile” ile güncel saatleri arayın.
                                  </p>
                                )}
                                <div>
                                  {check.ok ? (
                                    <MakeupDecisionForm
                                      action={actionConfirmSlot}
                                      hiddenFields={{ requestId: req.id, slot: JSON.stringify(slot) }}
                                      pendingLabel="Planlanıyor..."
                                      variant="success"
                                      disabled={!canWrite}
                                      placeholder="Planlama gerekçesi (isteğe bağlı)"
                                      noteRequired={false}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      Bu saate planla
                                    </MakeupDecisionForm>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Planlanan ders programa ve yoklama takvimine turuncu “Planlanan telafi” olarak eklenir; veliye mesaj
                          otomatik gönderilmez. Kayıt anında uygunluk yeniden kontrol edilir.
                        </p>
                        {checked.length > 0 ? (
                          <GenerateSuggestionsForm
                            requestId={req.id}
                            maxSlots={MORE_SUGGESTIONS_COUNT}
                            variant="ghost"
                            pendingLabel="Uygun saatler aranıyor..."
                            disabled={!canWrite}
                          >
                            Daha fazla uygun saat göster
                          </GenerateSuggestionsForm>
                        ) : null}
                      </div>
                    </div>
                  </MakeupSuggestionsDisclosure>
                  <GenerateSuggestionsForm
                    requestId={req.id}
                    variant="secondary"
                    pendingLabel="Uygun saatler aranıyor..."
                    disabled={!canWrite || Boolean(noRoomReason)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {req.suggestedSlots.length ? "Önerileri yenile" : "Uygun saatleri bul"}
                  </GenerateSuggestionsForm>

                  {(() => {
                    const teachers = data.teachers
                      .filter((t) => isTeacherSchedulable(t) && t.instruments.includes(req.instrument as Instrument))
                      .map((t) => ({ id: t.id, name: t.name, branchId: t.branchId, branchIds: t.branchIds ?? [] }));
                    // Yalnız aktif odalar; öğretmenin şubelerine göre formda daraltılır (sunucu kuralıyla aynı).
                    const rooms = usableRooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }));
                    if (!student || teachers.length === 0 || rooms.length === 0) return null;
                    return (
                      <ManualMakeupPlanForm
                        requestId={req.id}
                        preferredTeacherId={req.teacherId}
                        sourceBranchId={req.branchId}
                        lessonDurationMinutes={durationMinutes}
                        teachers={teachers}
                        rooms={rooms}
                        canWrite={canWrite}
                        expiresAt={req.expiresAt}
                      />
                    );
                  })()}

                  {/* İptal/ret gerekçe kutusu yalnız istenince açılır (yerel <details>: klavye + aria hazır). */}
                  <details className="group open:order-last open:basis-full">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                      <X className="h-4 w-4" aria-hidden="true" />
                      İptal / reddet
                    </summary>
                    <div className="mt-1 w-full sm:w-80">
                      <MakeupDecisionForm
                        action={actionCancelMakeup}
                        hiddenFields={{ requestId: req.id }}
                        pendingLabel="İptal ediliyor..."
                        variant="ghost"
                        disabled={!canWrite}
                        placeholder="İptal/ret gerekçesi (zorunlu)…"
                      >
                        <X className="h-4 w-4" />
                        Telafiyi iptal et / reddet
                      </MakeupDecisionForm>
                    </div>
                  </details>
                  {canWrite ? (
                    <QuickTaskLink
                      relatedEntityType="makeup"
                      relatedEntityId={req.id}
                      relatedEntityLabel={student?.name ?? req.id}
                      title={`Telafi planlama — ${student?.name ?? ""}`}
                      label="Görev oluştur"
                      returnTo="/panel/telafi"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination
        page={openPaged.page}
        totalPages={openPaged.totalPages}
        hrefForPage={(p) => hrefWith({ durum, sayfa: p, gsayfa: historyPaged.page })}
      />

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">Geçmiş / tamamlanan</h2>
        <a
          href="/api/v1/export?entity=makeupRequests"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" /> Tüm talepleri CSV indir
        </a>
      </div>
      {doneAll.length > 0 ? (
        <>
        <MakeupHistoryTable
          rows={done.map((req) => {
            const student = data.students.find((s) => s.id === req.studentId);
            const lesson = data.lessons.find((l) => l.id === req.confirmedLessonId);
            return {
              id: req.id,
              studentName: student?.name ?? "—",
              instrument: req.instrument,
              status: req.status,
              lessonLabel: lesson ? formatDateTime(lesson.startAt) : "—",
              slaLabel: req.slaDeadline ? formatDateTime(req.slaDeadline) : "—",
              slaBreached: (req.slaEscalationLevel ?? 0) >= 5,
              decisionNote: req.decisionNote ?? "—",
              decidedAt: req.decidedAt ?? "",
              decidedAtLabel: req.decidedAt ? formatDateTime(req.decidedAt) : "",
              actorName: actorLabel(req.decidedBy),
            };
          })}
        />
        <Pagination
          page={historyPaged.page}
          totalPages={historyPaged.totalPages}
          hrefForPage={(p) => hrefWith({ durum, sayfa: openPaged.page, gsayfa: p })}
        />
        </>
      ) : null}
    </div>
  );
}
