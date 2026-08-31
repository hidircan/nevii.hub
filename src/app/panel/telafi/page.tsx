import { redirect } from "next/navigation";
import { actionCancelMakeup, actionConfirmSlot } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { MakeupDecisionForm } from "@/components/makeup-decision-form";
import { GenerateSuggestionsForm } from "@/components/generate-suggestions-form";
import { ManualMakeupPlanForm } from "@/components/manual-makeup-plan-form";
import { formatDateTime, formatTime } from "@/lib/utils";
import { CheckCircle2, Download, Sparkles, X } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AiInsightTrigger } from "@/components/ai/ai-insight-trigger";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { QuickTaskLink } from "@/components/quick-task-link";
import { MakeupWindowDaysEditor } from "@/components/makeup-window-days-editor";

const MORE_SUGGESTIONS_COUNT = 18;

export const dynamic = "force-dynamic";

export default async function TelafiPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/telafi");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const requests = [...data.makeupRequests].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const OPEN_STATUSES = ["pending", "suggested", "awaiting_info"];
  const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const done = requests.filter((r) => !OPEN_STATUSES.includes(r.status));
  const canWrite = kurum.scope.mode === "single";
  const nowMs = new Date().getTime();

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Telafi Merkezi" }} />
      <PageHeader
        title="Telafi Merkezi"
        description="Açık talepleri planlayın, onaylayın veya iptal edin."
      />

      <div className="mb-4 flex flex-wrap items-stretch gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:p-2.5">
        <div className="flex min-w-[7.5rem] flex-1 flex-col justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Açık talepler</p>
          <p className="text-xl font-semibold tabular-nums text-[var(--color-text)]">{open.length}</p>
        </div>
        <div className="flex min-w-[7.5rem] flex-1 flex-col justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Onaylanan</p>
          <p className="text-xl font-semibold tabular-nums text-[var(--color-text)]">
            {requests.filter((r) => r.status === "confirmed").length}
          </p>
        </div>
        <div className="flex min-w-[10rem] flex-[1.4] flex-col justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <MakeupWindowDaysEditor
            currentDays={data.settings.makeupWindowDays}
            monthlyAllowance={data.settings.monthlyMakeupAllowance ?? 2}
            canWrite={canWrite}
            compact
          />
        </div>
        {open.length > 0 ? (
          <div className="flex items-center justify-end sm:ml-auto">
            <AiInsightTrigger
              capabilityId="makeupSlotSuggestion"
              label="AI ile öncelik özeti"
              compact
              payload={{
                openCount: open.length,
                oldestRequestAt: open.reduce(
                  (min, r) => (r.createdAt < min ? r.createdAt : min),
                  open[0].createdAt
                ),
                byInstrument: open.reduce<Record<string, number>>((acc, r) => {
                  acc[r.instrument] = (acc[r.instrument] || 0) + 1;
                  return acc;
                }, {}),
                expiringSoon: open.filter(
                  (r) => new Date(r.expiresAt).getTime() - nowMs < 3 * 24 * 60 * 60 * 1000
                ).length,
              }}
            />
          </div>
        ) : null}
      </div>

      {!canWrite ? (
        <p className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft,var(--color-surface-muted))] px-3 py-2 text-xs font-medium text-[var(--color-warning)]">
          &quot;Tüm kurumlar&quot; görünümündesiniz — telafi onayı/iptali/planlaması için üstteki kurum
          seçiciden tek bir kurum seçin.
        </p>
      ) : null}

      <h2 className="mb-2 text-base font-semibold text-[var(--color-text)]">Aksiyon bekleyenler</h2>
      {open.length === 0 ? (
        <EmptyState
          title="Açık telafi talebi yok"
          description="Gelmedi veya okul iptalini işaretlediğiniz dersler buraya gelir; ardından uygun plan önerisi yapabilirsiniz."
        />
      ) : (
        <div className="space-y-3">
          {open.map((req) => {
            const student = data.students.find((s) => s.id === req.studentId);
            const teacher = data.teachers.find((t) => t.id === req.teacherId);
            return (
              <Card key={req.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">{student?.name}</h3>
                      <Badge status={req.status} />
                      <Badge status="makeup">{req.instrument}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                      Tercih öğretmen: <span className="font-medium">{teacher?.name}</span> ·{" "}
                      {data.settings.branches.find((b) => b.id === req.branchId)?.shortName} ·{" "}
                      {req.reason}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Oluşturulma: {formatDateTime(req.createdAt)} · Son kullanım: {" "}
                      {formatDateTime(req.expiresAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {req.policyNote?.split("·").map((part, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-lg bg-[var(--color-surface-muted)] px-2 py-1 text-xs text-[var(--color-text-muted)]"
                        >
                          {part.trim()}
                        </span>
                      ))}
                    </div>
                    {canWrite ? (
                      <div className="mt-2">
                        <QuickTaskLink
                          context={{ studentId: req.studentId, teacherId: req.teacherId, branchId: req.branchId }}
                          returnTo="/panel/telafi"
                          label="Bu talep için görev oluştur"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <GenerateSuggestionsForm requestId={req.id} pendingLabel="Aranıyor..." disabled={!canWrite}>
                      <Sparkles className="h-4 w-4" />
                      {req.suggestedSlots.length ? "Saatleri yenile" : "En uygun saatleri bul"}
                    </GenerateSuggestionsForm>
                    <MakeupDecisionForm
                      action={actionCancelMakeup}
                      hiddenFields={{ requestId: req.id }}
                      pendingLabel="İptal ediliyor..."
                      variant="ghost"
                      disabled={!canWrite}
                      placeholder="İptal/ret gerekçesi (zorunlu)…"
                    >
                      <X className="h-4 w-4" />
                      İptal / reddet
                    </MakeupDecisionForm>
                    <QuickTaskLink
                      relatedEntityType="makeup"
                      relatedEntityId={req.id}
                      relatedEntityLabel={student?.name ?? req.id}
                      title={`Telafi planlama — ${student?.name ?? ""}`}
                      label="Görev oluştur"
                      returnTo="/panel/telafi"
                    />
                  </div>
                </div>

                {req.suggestedSlots.length > 0 ? (
                  <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      Önerilen planlar (skora göre sıralı)
                    </p>
                    <p className="mb-3 mt-1 text-xs text-[var(--color-text-muted)]">
                      Bunlar en yüksek puanlı uygun seçeneklerdir; başka bir saat de
                      planlayabilirsiniz.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {req.suggestedSlots.map((slot, idx) => {
                        const slotTeacher = data.teachers.find((t) => t.id === slot.teacherId);
                        const room = data.rooms.find((r) => r.id === slot.roomId);
                        const branch = data.settings.branches.find((b) => b.id === slot.branchId);
                        return (
                          <div
                            key={`${slot.startAt}-${slot.teacherId}-${idx}`}
                            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-[var(--color-text)]">
                                  {formatDateTime(slot.startAt)}
                                </p>
                                <p className="text-sm text-[var(--color-text-muted)]">
                                  {formatTime(slot.startAt)}–{formatTime(slot.endAt)} ·{" "}
                                  {slotTeacher?.name}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)]">
                                  {branch?.shortName} · {room?.name}
                                </p>
                              </div>
                              <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                                Skor {slot.score}
                              </span>
                            </div>
                            <ul className="mt-2 space-y-0.5">
                              {slot.reasons.map((r) => (
                                <li key={r} className="text-[11px] text-[var(--color-text-muted)]">
                                  · {r}
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3">
                              <MakeupDecisionForm
                                action={actionConfirmSlot}
                                hiddenFields={{ requestId: req.id, slot: JSON.stringify(slot) }}
                                pendingLabel="Onaylanıyor..."
                                variant="success"
                                disabled={!canWrite}
                                placeholder="Onay notu (zorunlu)…"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Planı onayla
                              </MakeupDecisionForm>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <GenerateSuggestionsForm
                      requestId={req.id}
                      maxSlots={MORE_SUGGESTIONS_COUNT}
                      variant="secondary"
                      pendingLabel="Aranıyor..."
                      disabled={!canWrite}
                      className="mt-3"
                    >
                      Daha fazla uygun saat göster
                    </GenerateSuggestionsForm>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                    Henüz saat önerilmedi. “En uygun saatleri bul” ile öğretmen müsaitliği, oda ve
                    çakışmaları tarayın.
                  </p>
                )}

                {(() => {
                  const teachers = data.teachers
                    .filter((t) => t.active && t.instruments.includes(req.instrument))
                    .map((t) => ({ id: t.id, name: t.name, branchId: t.branchId }));
                  const rooms = data.rooms
                    .filter((r) => r.instruments.includes(req.instrument))
                    .map((r) => ({ id: r.id, name: r.name, branchId: r.branchId }));
                  if (!student || teachers.length === 0 || rooms.length === 0) return null;
                  return (
                    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                      <ManualMakeupPlanForm
                        requestId={req.id}
                        preferredTeacherId={req.teacherId}
                        sourceBranchId={req.branchId}
                        lessonDurationMinutes={data.settings.lessonDurationMinutes}
                        teachers={teachers}
                        rooms={rooms}
                        canWrite={canWrite}
                      />
                    </div>
                  );
                })()}
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
      {done.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Öğrenci</th>
                  <th className="px-4 py-3">Enstrüman</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Onaylı ders</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Karar notu</th>
                  <th className="px-4 py-3">Karar tarihi</th>
                </tr>
              </thead>
              <tbody>
                {done.map((req) => {
                  const student = data.students.find((s) => s.id === req.studentId);
                  const lesson = data.lessons.find((l) => l.id === req.confirmedLessonId);
                  return (
                    <tr key={req.id} className="border-b border-slate-50 dark:border-slate-800">
                      <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">{student?.name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{req.instrument}</td>
                      <td className="px-4 py-3">
                        <Badge status={req.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {lesson ? formatDateTime(lesson.startAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {req.slaDeadline ? formatDateTime(req.slaDeadline) : "—"}
                        {(req.slaEscalationLevel ?? 0) >= 5 ? (
                          <span className="ml-1 font-semibold text-rose-600">Aşıldı</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {req.decisionNote ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {req.decidedAt ? formatDateTime(req.decidedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
      ) : null}
    </div>
  );
}
