"use client";

/**
 * 2026-10-04 — öğrencinin eğitimleri (tek öğrenci, N eğitim).
 * 2026-10-09 — BRANŞ KAYITLARI: ana/yedek ayrımı yok, tüm branşlar eşittir. Her branş kendi öğrenci türü, öğretmeni,
 * ders süresi/haftalık ders sayısı, paketi/ücreti/indirimi, ödeme yöntemi/günü, kayıt ve ders başlangıç tarihleri, ders
 * gün/saati ve sözleşme süresiyle AYNI formdan düzenlenir; birini değiştirmek diğerini etkilemez. Sonlandırma yalnız o
 * branşı kapatır (bitiş tarihi + gerekçe); öğretmen değişikliği geçmiş dersleri değiştirmez.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { actionUpsertStudentEnrollment } from "@/lib/actions";
import { STUDENT_TYPES } from "@/lib/types";

export type EnrollmentCardRow = {
  id: string;
  instrument: string;
  teacherId?: string;
  branchId?: string;
  lessonDurationMinutes?: number;
  weeklyLessonCount: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
  endReason?: string;
  studentTypes: string[];
  packageId?: string;
  packageName?: string;
  monthlyFee: number;
  discountType?: string;
  discountValue?: number;
  monthlyFeeManualOverride?: boolean;
  paymentMethod?: string;
  paymentDueDay?: number;
  lessonStartDate?: string;
  lessonScheduleText?: string;
  intendedDurationMonths?: number;
  /** Bu branşın güncel sözleşmesi (varsa) — kartta bilgi. */
  currentContractNumber?: string;
};
type TeacherOpt = { id: string; name: string; instruments: string[]; active: boolean };
type PackageOpt = { id: string; title: string };
type BranchOpt = { id: string; name: string };

type Draft = {
  id?: string;
  instrument: string;
  teacherId: string;
  lessonDurationMinutes: number;
  weeklyLessonCount: number;
  branchId: string;
  studentTypes: string[];
  packageId: string;
  monthlyFee: string;
  discountType: string;
  discountValue: string;
  overrideAmount: string;
  overrideReason: string;
  paymentMethod: string;
  paymentDueDay: string;
  startDate: string;
  lessonStartDate: string;
  lessonScheduleText: string;
  intendedDurationMonths: string;
};

const METHOD_LABEL: Record<string, string> = { credit_card: "Kredi kartı", cash: "Nakit", transfer: "Havale/EFT" };
const ymd = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const trDate = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const money = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;
const digits = (v: string) => v.replace(/[^\d]/g, "");

function draftFrom(e: EnrollmentCardRow | undefined, fallback: { instrument: string; teacherId: string; branchId: string }): Draft {
  return {
    id: e?.id,
    instrument: e?.instrument ?? fallback.instrument,
    teacherId: e?.teacherId ?? fallback.teacherId,
    lessonDurationMinutes: e?.lessonDurationMinutes ?? 40,
    weeklyLessonCount: e?.weeklyLessonCount ?? 1,
    branchId: e?.branchId ?? fallback.branchId,
    studentTypes: e?.studentTypes ?? [],
    packageId: e?.packageId ?? "",
    monthlyFee: e ? String(e.monthlyFee) : "",
    discountType: e?.discountType === "amount" || e?.discountType === "fixed" ? "amount" : e?.discountType ? "percent" : "",
    discountValue: e?.discountValue !== undefined ? String(e.discountValue) : "",
    overrideAmount: e?.monthlyFeeManualOverride ? String(e.monthlyFee) : "",
    overrideReason: "",
    paymentMethod: e?.paymentMethod ?? "",
    paymentDueDay: e?.paymentDueDay ? String(e.paymentDueDay) : "",
    startDate: ymd(e?.startDate),
    lessonStartDate: ymd(e?.lessonStartDate),
    lessonScheduleText: e?.lessonScheduleText ?? "",
    intendedDurationMonths: e?.intendedDurationMonths ? String(e.intendedDurationMonths) : "",
  };
}

export function StudentEnrollmentsCard({
  studentId,
  studentBranchId,
  enrollments,
  teachers,
  instrumentOptions,
  packages = [],
  branches = [],
  canManage,
}: {
  studentId: string;
  studentBranchId: string;
  enrollments: EnrollmentCardRow[];
  teachers: TeacherOpt[];
  instrumentOptions: string[];
  packages?: PackageOpt[];
  branches?: BranchOpt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ending, setEnding] = useState<{ row: EnrollmentCardRow; endDate: string; endReason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const teacherName = (id?: string) => teachers.find((t) => t.id === id)?.name ?? "Öğretmen atanmamış";
  const teachersFor = (instrument: string) => teachers.filter((t) => t.active && t.instruments.includes(instrument));
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;

  async function send(enrollment: Record<string, unknown> & { instrument: string; teacherId: string; lessonDurationMinutes: number }) {
    setBusy(true);
    setError(null);
    setWarnings([]);
    const res = await actionUpsertStudentEnrollment({ studentId, enrollment });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    setWarnings(res.warnings ?? []);
    router.refresh();
    return true;
  }

  async function saveDraft(d: Draft) {
    const num = (v: string) => (v.trim() === "" ? undefined : Number(digits(v)));
    const ok = await send({
      ...(d.id ? { id: d.id } : {}),
      instrument: d.instrument,
      teacherId: d.teacherId,
      lessonDurationMinutes: d.lessonDurationMinutes,
      weeklyLessonCount: d.weeklyLessonCount,
      branchId: d.branchId || undefined,
      studentTypes: d.studentTypes,
      packageId: d.packageId,
      ...(d.packageId
        ? {
            ...(d.discountType && d.discountValue.trim() !== ""
              ? { discountType: d.discountType, discountValue: Number(d.discountValue.replace(",", ".")) }
              : { discountType: "none" }),
            ...(d.overrideAmount.trim() !== ""
              ? { monthlyFeeOverrideAmount: num(d.overrideAmount), monthlyFeeOverrideReason: d.overrideReason }
              : { dropFeeOverride: true }),
          }
        : { monthlyFee: num(d.monthlyFee) ?? 0 }),
      ...(d.paymentMethod ? { paymentMethod: d.paymentMethod } : {}),
      ...(d.paymentDueDay.trim() !== "" ? { paymentDueDay: num(d.paymentDueDay) } : {}),
      ...(d.startDate ? { startDate: d.startDate } : {}),
      ...(d.lessonStartDate ? { lessonStartDate: d.lessonStartDate } : {}),
      lessonScheduleText: d.lessonScheduleText.trim(),
      ...(d.intendedDurationMonths.trim() !== "" ? { intendedDurationMonths: num(d.intendedDurationMonths) } : {}),
    });
    if (ok) setDraft(null);
  }

  const activeCount = enrollments.filter((e) => e.active).length;

  return (
    <Card className="!p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Branş kayıtları</h2>
        {canManage && !draft ? (
          <button
            type="button"
            onClick={() => {
              const instrument = instrumentOptions.find((i) => !enrollments.some((e) => e.active && e.instrument === i)) ?? instrumentOptions[0] ?? "";
              setEnding(null);
              setDraft(draftFrom(undefined, { instrument, teacherId: teachersFor(instrument)[0]?.id ?? "", branchId: studentBranchId }));
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
                  {branchName(e.branchId) && branches.length > 1 ? ` · ${branchName(e.branchId)}` : ""}
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
                    setDraft(draftFrom(e, { instrument: e.instrument, teacherId: teachersFor(e.instrument)[0]?.id ?? "", branchId: studentBranchId }));
                  }}
                >
                  Düzenle
                </button>
                {e.teacherId && e.active && activeCount > 1 ? (
                  <button
                    type="button"
                    className="font-medium text-[var(--color-text-muted)] hover:underline"
                    onClick={() => {
                      setDraft(null);
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

      {draft ? (
        <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-4">
          <p className="text-xs font-semibold text-[var(--color-text)] sm:col-span-4">{draft.id ? `${draft.instrument} branş kaydını düzenle` : "Yeni branş kaydı"}</p>
          <div>
            <Label>Enstrüman / branş</Label>
            <Select
              value={draft.instrument}
              disabled={Boolean(draft.id)}
              onChange={(ev) => setDraft({ ...draft, instrument: ev.target.value, teacherId: teachersFor(ev.target.value)[0]?.id ?? "" })}
            >
              {instrumentOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Öğretmen</Label>
            {teachersFor(draft.instrument).length === 0 ? (
              <p className="text-xs text-amber-700">&quot;{draft.instrument}&quot; veren aktif öğretmen yok.</p>
            ) : (
              <Select value={draft.teacherId} onChange={(ev) => setDraft({ ...draft, teacherId: ev.target.value })}>
                {teachersFor(draft.instrument).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label>Ders süresi</Label>
            <Select value={String(draft.lessonDurationMinutes)} onChange={(ev) => setDraft({ ...draft, lessonDurationMinutes: Number(ev.target.value) })}>
              {[30, 40, 50].map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Haftalık ders</Label>
            <Select value={String(draft.weeklyLessonCount)} onChange={(ev) => setDraft({ ...draft, weeklyLessonCount: Number(ev.target.value) })}>
              {[1, 2, 3].map((m) => (
                <option key={m} value={m}>
                  Haftada {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-4">
            <Label>Öğrenci türü (bu branş için)</Label>
            <div className="flex flex-wrap gap-3 text-xs">
              {STUDENT_TYPES.map((t) => (
                <label key={t} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={draft.studentTypes.includes(t)}
                    onChange={(ev) =>
                      setDraft({
                        ...draft,
                        studentTypes: ev.target.checked ? [...draft.studentTypes, t] : draft.studentTypes.filter((x) => x !== t),
                      })
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Paket</Label>
            <Select value={draft.packageId} onChange={(ev) => setDraft({ ...draft, packageId: ev.target.value })}>
              <option value="">Paketsiz — aylık ücreti yaz</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          {draft.packageId ? (
            <>
              <div>
                <Label>İndirim (isteğe bağlı)</Label>
                <div className="flex gap-1">
                  <Select value={draft.discountType} onChange={(ev) => setDraft({ ...draft, discountType: ev.target.value })}>
                    <option value="">Yok</option>
                    <option value="percent">%</option>
                    <option value="amount">₺</option>
                  </Select>
                  <Input
                    inputMode="decimal"
                    value={draft.discountValue}
                    disabled={!draft.discountType}
                    onChange={(ev) => setDraft({ ...draft, discountValue: ev.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Elle aylık ücret (isteğe bağlı)</Label>
                <Input inputMode="numeric" value={draft.overrideAmount} onChange={(ev) => setDraft({ ...draft, overrideAmount: digits(ev.target.value) })} />
              </div>
              <div>
                <Label>Elle ücret gerekçesi</Label>
                <Input value={draft.overrideReason} maxLength={300} disabled={!draft.overrideAmount} onChange={(ev) => setDraft({ ...draft, overrideReason: ev.target.value })} />
              </div>
            </>
          ) : (
            <div>
              <Label>Aylık ücret (₺)</Label>
              <Input inputMode="numeric" value={draft.monthlyFee} onChange={(ev) => setDraft({ ...draft, monthlyFee: digits(ev.target.value) })} />
            </div>
          )}
          <div>
            <Label>Ödeme yöntemi</Label>
            <Select value={draft.paymentMethod} onChange={(ev) => setDraft({ ...draft, paymentMethod: ev.target.value })}>
              <option value="">Seçilmedi</option>
              <option value="credit_card">Kredi kartı</option>
              <option value="cash">Nakit</option>
              <option value="transfer">Havale/EFT</option>
            </Select>
          </div>
          <div>
            <Label>Ödeme günü (ayın)</Label>
            <Input inputMode="numeric" maxLength={2} value={draft.paymentDueDay} onChange={(ev) => setDraft({ ...draft, paymentDueDay: digits(ev.target.value) })} />
          </div>
          <div>
            <Label>Kayıt tarihi</Label>
            <Input type="date" value={draft.startDate} onChange={(ev) => setDraft({ ...draft, startDate: ev.target.value })} />
          </div>
          <div>
            <Label>Ders başlangıcı</Label>
            <Input type="date" value={draft.lessonStartDate} onChange={(ev) => setDraft({ ...draft, lessonStartDate: ev.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Ders gün/saati</Label>
            <Input
              value={draft.lessonScheduleText}
              maxLength={200}
              placeholder="Salı 15:00, Perşembe 16:00"
              onChange={(ev) => setDraft({ ...draft, lessonScheduleText: ev.target.value })}
            />
          </div>
          <div>
            <Label>Sözleşme süresi (ay)</Label>
            <Input inputMode="numeric" maxLength={2} value={draft.intendedDurationMonths} onChange={(ev) => setDraft({ ...draft, intendedDurationMonths: digits(ev.target.value) })} />
          </div>
          {branches.length > 1 ? (
            <div>
              <Label>Şube</Label>
              <Select value={draft.branchId} onChange={(ev) => setDraft({ ...draft, branchId: ev.target.value })}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex items-end gap-2 sm:col-span-4">
            <Button type="button" disabled={busy || !draft.teacherId} onClick={() => void saveDraft(draft)}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <button type="button" className="text-xs text-[var(--color-text-muted)] hover:underline" onClick={() => setDraft(null)}>
              Vazgeç
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] sm:col-span-4">
            Paket seçilirse aylık ücret paket fiyatı, ders süresi ve indirimden sunucuda hesaplanır. Bu branşın değişikliği diğer
            branşları etkilemez; öğretmen değişikliği geçmiş dersleri değiştirmez. Sözleşme ve ödeme planı Sözleşme Merkezi&apos;nde
            bu branş seçilerek oluşturulur.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
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
