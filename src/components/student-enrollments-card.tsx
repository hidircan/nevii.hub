"use client";

/**
 * 2026-10-04 — öğrencinin eğitimleri (tek öğrenci, N eğitim).
 * 2026-10-09 — BRANŞ KAYITLARI: ana/yedek ayrımı yok, tüm branşlar eşittir.
 * 2026-10-10 — "Branş ekle" ve "Düzenle" artık yeni öğrenci kaydındaki branş kartıyla AYNI bileşeni
 * (`EnrollmentFormFields`) ve AYNI doğrulamayı (`enrollment-form.ts`) kullanır: öğrenci türü + MEB alanları, paket/kampanya/
 * indirim, ödeme, ders günü seçici ve (yeni branşta) kayıt anı ilk tahsilatı. Birinin değişikliği diğer branşları etkilemez;
 * sonlandırma yalnız o branşı kapatır; öğretmen değişikliği geçmiş dersleri değiştirmez.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { EnrollmentFormFields } from "@/components/enrollment-form-fields";
import { actionUpsertStudentEnrollment } from "@/lib/actions";
import {
  emptyEnrollmentDraft,
  enrollmentUpsertPayload,
  validateEnrollmentDraft,
  type EnrollmentDraft,
  type EnrollmentFieldErrors,
} from "@/lib/enrollment-form";
import { computeEnrollmentDerived, groupDraftDefaults, type EnrollmentFormContext } from "@/lib/enrollment-form-context";
import type { StudentTermType } from "@/lib/types";

export type EnrollmentCardRow = {
  id: string;
  instrument: string;
  teacherId?: string;
  lessonDurationMinutes?: number;
  weeklyLessonCount: number;
  active: boolean;
  /** Kayıt güncellenme zamanı (iyimser eşzamanlılık: başka biri değiştirdiyse yazım reddedilir). */
  updatedAt?: string;
  endDate?: string;
  endReason?: string;
  studentTypes: string[];
  packageName?: string;
  monthlyFee: number;
  paymentMethod?: string;
  paymentDueDay?: number;
  startDate?: string;
  branchId?: string;
  /** Bu branşın güncel sözleşmesi (varsa) — kartta bilgi. */
  currentContractNumber?: string;
  /** Düzenleme formunun başlangıç durumu (sunucuda `draftFromTerms` ile kurulur). */
  draft: EnrollmentDraft;
};

const METHOD_LABEL: Record<string, string> = { credit_card: "Kredi kartı", cash: "Nakit", transfer: "Havale/EFT" };
const trDate = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const money = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

/** Sunucu alan adı → form alan adı (MEB sınav bayrağı formda "mebExamStatus"). */
const SERVER_FIELD_TO_FORM: Record<string, string> = { mebExamAttended: "mebExamStatus", overrideReason: "overrideReason" };

export function StudentEnrollmentsCard({
  studentId,
  enrollments,
  formContext,
  termType,
  canManage,
  initialEditId,
  initialAddGroupLessonId,
}: {
  /** 2026-10-23 — Grup Dersleri → "Mevcut öğrenciyi ekle": branş ekleme formu bu grupla açık başlar. */
  initialAddGroupLessonId?: string;
  /** Bilgiler sekmesindeki "Bu branşı düzenle" bağlantısından gelen branş: düzenleme formu açık başlar. */
  initialEditId?: string;
  studentId: string;
  enrollments: EnrollmentCardRow[];
  formContext: EnrollmentFormContext;
  termType: StudentTermType;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ mode: "add" | "edit"; draft: EnrollmentDraft; updatedAt?: string } | null>(() => {
    const row = initialEditId ? enrollments.find((e) => e.id === initialEditId) : undefined;
    if (row && canManage) return { mode: "edit", draft: row.draft, updatedAt: row.updatedAt };
    const group = initialAddGroupLessonId ? formContext.groupLessons?.find((g) => g.id === initialAddGroupLessonId) : undefined;
    return group && canManage ? { mode: "add", draft: emptyEnrollmentDraft(groupDraftDefaults(group, formContext.personBranchId)) } : null;
  });
  const [fieldErrors, setFieldErrors] = useState<EnrollmentFieldErrors>({});
  const [ending, setEnding] = useState<{ row: EnrollmentCardRow; endDate: string; endReason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [syncToken, setSyncToken] = useState(0);
  const teacherName = (id?: string) => formContext.teachers.find((t) => t.id === id)?.name ?? "Öğretmen atanmamış";
  const branchName = (id?: string) => formContext.branches.find((b) => b.id === id)?.name;

  async function send(enrollment: Record<string, unknown> & { instrument: string; teacherId: string; lessonDurationMinutes: number }) {
    setBusy(true);
    setError(null);
    setWarnings([]);
    const res = await actionUpsertStudentEnrollment({ studentId, enrollment });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.fieldErrors) {
        const mapped: EnrollmentFieldErrors = {};
        for (const [k, m] of Object.entries(res.fieldErrors)) mapped[SERVER_FIELD_TO_FORM[k] ?? k] = m;
        setFieldErrors(mapped);
      }
      return false;
    }
    setWarnings(res.warnings ?? []);
    router.refresh();
    return true;
  }

  async function saveDraft() {
    if (!editing) return;
    const { mode, draft } = editing;
    const suggested = mode === "add" ? computeEnrollmentDerived(formContext, draft, termType).suggestion?.suggestedAmount : undefined;
    const errs = validateEnrollmentDraft(draft, { mode, suggestedFirstPayment: suggested });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Formda düzeltilmesi gereken alanlar var — aşağıda işaretlendi.");
      return;
    }
    const ok = await send(enrollmentUpsertPayload(draft, mode, mode === "edit" ? editing.updatedAt : undefined));
    if (ok) {
      setEditing(null);
      setFieldErrors({});
    }
  }

  const activeCount = enrollments.filter((e) => e.active).length;

  return (
    <Card className="!p-4" id="brans-kayitlari">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Branş kayıtları</h2>
        {canManage && !editing ? (
          <button
            type="button"
            onClick={() => {
              setEnding(null);
              setError(null);
              setFieldErrors({});
              setEditing({ mode: "add", draft: emptyEnrollmentDraft() });
            }}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            + Branş kaydı ekle
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-[var(--color-border)] text-sm">
        {enrollments.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="min-w-0">
              <p>
                <span className="font-medium text-[var(--color-text)]">{e.instrument}</span>
                <span className="text-[var(--color-text-muted)]"> · {teacherName(e.teacherId)}</span>
                {e.lessonDurationMinutes ? <span className="text-[var(--color-text-muted)]"> · {e.lessonDurationMinutes} dk</span> : null}
                <span className="text-[var(--color-text-muted)]"> · haftada {e.weeklyLessonCount}</span>
                {e.active ? (
                  <span className="ml-2"><Badge status="confirmed">Aktif</Badge></span>
                ) : (
                  <span className="ml-2"><Badge status="cancelled">Sonlandı{e.endDate ? ` · ${trDate(e.endDate)}` : ""}</Badge></span>
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-1 text-xs text-[var(--color-text-muted)]">
                {e.studentTypes.length ? e.studentTypes.map((t) => <Badge key={t}>{t}</Badge>) : <span>Tür belirtilmemiş</span>}
                <span>
                  · {e.packageName || "Paketsiz"} · Aylık {money(e.monthlyFee)}
                  {e.paymentMethod ? ` · ${METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod}` : ""}
                  {e.paymentDueDay ? ` · ayın ${e.paymentDueDay}. günü` : ""}
                  {e.startDate ? ` · kayıt ${trDate(e.startDate)}` : ""}
                  {branchName(e.branchId) && formContext.branches.length > 1 ? ` · ${branchName(e.branchId)}` : ""}
                  {e.currentContractNumber ? ` · sözleşme ${e.currentContractNumber}` : " · sözleşme yok"}
                </span>
              </p>
              {!e.active && e.endReason ? <p className="text-xs text-[var(--color-text-muted)]">Sonlandırma gerekçesi: {e.endReason}</p> : null}
            </div>
            {canManage ? (
              <span className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                  onClick={() => {
                    setEnding(null);
                    setError(null);
                    setFieldErrors({});
                    setEditing({ mode: "edit", draft: e.draft, updatedAt: e.updatedAt });
                  }}
                >
                  Düzenle
                </button>
                {e.teacherId && e.active && activeCount > 1 ? (
                  <button
                    type="button"
                    className="font-medium text-[var(--color-text-muted)] hover:underline"
                    onClick={() => {
                      setEditing(null);
                      setEnding({ row: e, endDate: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }), endReason: "" });
                    }}
                  >
                    Sonlandır
                  </button>
                ) : null}
                {e.teacherId && !e.active ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="font-medium text-[var(--color-text-muted)] hover:underline"
                    onClick={() =>
                      void send({ id: e.id, instrument: e.instrument, teacherId: e.teacherId!, lessonDurationMinutes: e.lessonDurationMinutes ?? 40, active: true })
                    }
                  >
                    Yeniden aç
                  </button>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage && activeCount === 1 && enrollments.length > 1 ? (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          Tek aktif branş sonlandırılamaz; öğrenci kurumdan tamamen ayrılıyorsa öğrenciyi pasife alın.
        </p>
      ) : null}


      {ending ? (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-3">
          <p className="text-xs font-medium text-[var(--color-text)] sm:col-span-3">
            {ending.row.instrument} branşı sonlandırılacak — diğer branşlar ve öğrenci kaydı etkilenmez. Geçmiş ders, sözleşme ve ödeme kayıtları silinmez.
          </p>
          <div>
            <Label>Bitiş tarihi</Label>
            <Input type="date" value={ending.endDate} onChange={(ev) => setEnding({ ...ending, endDate: ev.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Gerekçe (isteğe bağlı)</Label>
            <Input value={ending.endReason} maxLength={300} onChange={(ev) => setEnding({ ...ending, endReason: ev.target.value })} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                const r = ending.row;
                const ok = await send({
                  id: r.id,
                  instrument: r.instrument,
                  teacherId: r.teacherId!,
                  lessonDurationMinutes: r.lessonDurationMinutes ?? 40,
                  active: false,
                  endDate: ending.endDate || undefined,
                  endReason: ending.endReason.trim() || undefined,
                });
                if (ok) setEnding(null);
              }}
            >
              {busy ? "Kaydediliyor…" : "Branşı sonlandır"}
            </Button>
            <button type="button" className="text-xs text-[var(--color-text-muted)] hover:underline" onClick={() => setEnding(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-2 space-y-3 rounded-lg border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold text-[var(--color-text)]">
            {editing.mode === "edit" ? `${editing.draft.instrument} branş kaydını düzenle` : "Yeni branş kaydı"}
          </p>
          <EnrollmentFormFields
            ctx={formContext}
            mode={editing.mode}
            draft={editing.draft}
            errors={fieldErrors}
            onChange={(patch) => {
              setEditing((cur) => (cur ? { ...cur, draft: { ...cur.draft, ...patch } } : cur));
              setSyncToken((n) => n + 1);
            }}
            termType={termType}
            syncToken={syncToken}
            idPrefix={`enr-${editing.draft.key}`}
          />
          <div className="flex items-end gap-2">
            <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <button
              type="button"
              className="text-xs text-[var(--color-text-muted)] hover:underline"
              onClick={() => {
                setEditing(null);
                setFieldErrors({});
                setError(null);
              }}
            >
              Vazgeç
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Bu branşın değişikliği diğer branşları etkilemez; öğretmen değişikliği geçmiş dersleri değiştirmez. Sözleşme ve ödeme planı Sözleşme Merkezi&apos;nde bu branş
            seçilerek oluşturulur.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-600" role="alert">{error}</p> : null}
      {warnings.length ? (
        <ul className="mt-2 space-y-1 text-xs font-medium text-amber-700" role="status">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
