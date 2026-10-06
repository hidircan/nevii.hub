import { redirect } from "next/navigation";
import { actionCancelMakeup, actionConfirmSlot } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { foldTurkishForSearch } from "@/lib/normalize";
import { buildStudentMakeupSummary, MAKEUP_STAGE_LABEL } from "@/lib/makeup-student-summary";
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
const HISTORY_PAGE_SIZE = 25;
const MAX_SUMMARY_STUDENTS = 10;

export default async function TelafiPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; sayfa?: string }> }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/telafi");
  }
  const { durum: durumParam, q: qParam, sayfa } = await searchParams;
  // 2026-10-04 — isme göre arama: Türkçe harf katlamalı ("şule" = "Şule" = "sule"); sunucuda süzülür,
  // istemciye yalnız eşleşen satırlar gider. Geçmiş liste sayfalıdır.
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
  const requests = [...data.makeupRequests]
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
  const historyPages = Math.max(1, Math.ceil(doneAll.length / HISTORY_PAGE_SIZE));
  const historyPage = Math.min(historyPages, Math.max(1, Number.parseInt(sayfa ?? "1", 10) || 1));
  const done = doneAll.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);
  const hrefWith = (params: { durum?: string; q?: string; sayfa?: number }) => {
    const sp = new URLSearchParams();
    if (params.durum && params.durum !== "tumu") sp.set("durum", params.durum);
    if (params.q) sp.set("q", params.q);
    if (params.sayfa && params.sayfa > 1) sp.set("sayfa", String(params.sayfa));
    const qs = sp.toString();
    return qs ? `/panel/telafi?${qs}` : "/panel/telafi";
  };
  const summaryStudents = matchingStudentIds
    ? data.students
        .filter((s) => matchingStudentIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .slice(0, MAX_SUMMARY_STUDENTS)
    : [];
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
              href={hrefWith({ durum: key, q })}
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

      <form method="get" action="/panel/telafi" role="search" className="mb-3 flex flex-wrap items-center gap-2">
        {durum !== "tumu" ? <input type="hidden" name="durum" value={durum} /> : null}
        <label htmlFor="telafi-ara" className="sr-only">Öğrenci veya veli adına göre ara</label>
        <input
          id="telafi-ara"
          name="q"
          defaultValue={q}
          placeholder="Öğrenci veya veli adı ara…"
          className="min-w-[14rem] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        <button type="submit" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white">
          Ara
        </button>
        {q ? (
          <Link href={hrefWith({ durum })} className="text-sm font-medium text-[var(--color-text-muted)] hover:underline">
            Aramayı temizle
          </Link>
        ) : null}
      </form>

      {q ? (
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
                  {summaryStudents.map((st) => {
                    const sum = buildStudentMakeupSummary(data, st.id, now);
                    return (
                      <tr key={st.id}>
                        <td className="px-3 py-2">
                          <Link href={`/panel/ogrenciler/${st.id}/program#telafiler`} className="font-medium text-[var(--color-primary)] hover:underline">
                            {st.name}
                          </Link>
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
        <div className="space-y-4">
          {visible.map((req) => {
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
                <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">
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
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {sourceLesson ? <>Kaçan ders: {formatDateTime(sourceLesson.startAt)}. </> : null}
                      Öğretmeni {teacher?.name ?? "—"}, {branchName(req.branchId)} şubesi.
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">Neden: {req.reason}</p>
                  </div>
                  <div
                    className={`shrink-0 rounded-[var(--radius-md)] border px-3 py-2 text-right ${
                      left <= URGENT_DAYS ? "border-rose-300 bg-rose-50 text-rose-800" : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">{daysLeftLabel(left)}</p>
                    <p className="text-xs">Son gün {formatDateTime(req.expiresAt)}</p>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">Önerilen saatler</h4>
                    <GenerateSuggestionsForm requestId={req.id} pendingLabel="Uygun saatler aranıyor..." disabled={!canWrite || Boolean(noRoomReason)}>
                      <Sparkles className="h-4 w-4" />
                      {req.suggestedSlots.length ? "Önerileri yenile" : "Uygun saatleri bul"}
                    </GenerateSuggestionsForm>
                  </div>

                  {noRoomReason ? (
                    <p className="mb-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{noRoomReason}</p>
                  ) : null}

                  {checked.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Henüz öneri yok. “Uygun saatleri bul” bugünden sonraki saatlerde öğretmenin çalışma saatlerini, bu
                      şubenin aktif odalarını, açık günleri ve öğretmen/oda/öğrenci çakışmalarını tarar. Geçmiş bir tarihe
                      planlamak için aşağıdaki “Başka bir saat planla” formunu kullanın.
                    </p>
                  ) : (
                    <ol className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                      {checked.map(({ slot, check }, idx) => {
                        const slotTeacher = data.teachers.find((t) => t.id === slot.teacherId);
                        const room = data.rooms.find((r) => r.id === slot.roomId);
                        return (
                          <li
                            key={`${slot.startAt}-${slot.teacherId}-${idx}`}
                            className={`grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_16rem] ${check.ok ? "" : "bg-[var(--color-surface-muted)]"}`}
                          >
                            <div>
                              <p className="font-semibold text-[var(--color-text)]">
                                {formatDateTime(slot.startAt)}
                                {idx === 0 && check.ok ? (
                                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">En uygun</span>
                                ) : null}
                              </p>
                              <p className="text-sm text-[var(--color-text-muted)]">
                                {formatTime(slot.startAt)}–{formatTime(slot.endAt)}, {slotTeacher?.name ?? "—"}
                              </p>
                              <p className="text-sm text-[var(--color-text-muted)]">
                                {room?.name ?? "Oda bulunamadı"}, {branchName(slot.branchId)} şubesi
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
                  {checked.length > 0 ? (
                    <GenerateSuggestionsForm
                      requestId={req.id}
                      maxSlots={MORE_SUGGESTIONS_COUNT}
                      variant="ghost"
                      pendingLabel="Uygun saatler aranıyor..."
                      disabled={!canWrite}
                      className="mt-2"
                    >
                      Daha fazla uygun saat göster
                    </GenerateSuggestionsForm>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Planlanan ders programa ve yoklama takvimine turuncu “Planlanan telafi” olarak eklenir; veliye mesaj
                    otomatik gönderilmez, taslak hazırlanır. Kayıt anında uygunluk yeniden kontrol edilir.
                  </p>

                  {(() => {
                    const teachers = data.teachers
                      .filter((t) => isTeacherSchedulable(t) && t.instruments.includes(req.instrument as Instrument))
                      .map((t) => ({ id: t.id, name: t.name, branchId: t.branchId, branchIds: t.branchIds ?? [] }));
                    // Yalnız aktif odalar; öğretmenin şubelerine göre formda daraltılır (sunucu kuralıyla aynı).
                    const rooms = usableRooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }));
                    if (!student || teachers.length === 0 || rooms.length === 0) return null;
                    return (
                      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
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
                      </div>
                    );
                  })()}

                  <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4">
                    <div className="w-full sm:w-72">
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
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
        <Pagination page={historyPage} totalPages={historyPages} hrefForPage={(p) => hrefWith({ durum, q, sayfa: p })} />
        </>
      ) : null}
    </div>
  );
}
