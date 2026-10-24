"use client";

/**
 * 2026-10-10 — TEK BRANŞ KAYIT FORMU (yeni öğrenci kaydındaki her branş kartı, öğrenci sayfasında "Branş ekle" ve
 * "Branşı düzenle" AYNI bileşeni kullanır).
 *
 * Eskiden üç ayrı uygulama vardı; ek MEB branşı MEB alanlarını göstermiyordu, ek branşta ilk tahsilat/ders günü/paket
 * yoktu. Artık bir branşın TÜM ayarları (öğrenci türü + MEB bilgileri, ders planı, paket/ücret/indirim/kampanya, ödeme,
 * kayıt anı ilk tahsilatı) burada, her branş için eksiksiz ve birbirinden bağımsızdır. Bileşen tamamen KONTROLLÜDÜR:
 * durum üst bileşendeki `EnrollmentDraft`'tadır (kararlı `key`, dizi sırası değil); doğrulama ve ücret/ilk tahsilat
 * hesabı sunucuyla ortak saf modüllerden gelir (`enrollment-form.ts`, `enrollment-form-context.ts`).
 */
import { useEffect, useMemo, useRef } from "react";
import { Input, Label, Select } from "@/components/ui";
import { LessonScheduleSlotsPicker } from "@/components/lesson-schedule-slots-picker";
import { STUDENT_TYPES } from "@/lib/types";
import type { StudentTermType } from "@/lib/types";
import { MEB_LEVEL_OPTIONS } from "@/lib/student-level-rules";
import { LESSON_DURATION_OPTIONS } from "@/lib/lesson-duration";
import { STACKING_RULE_LABELS } from "@/lib/discount-campaigns";
import { sanitizeAmountInput } from "@/lib/amount-input";
import {
  draftIsMeb,
  ENROLLMENT_WEEKLY_OPTIONS,
  type EnrollmentDraft,
  type EnrollmentFieldErrors,
  type EnrollmentFormMode,
} from "@/lib/enrollment-form";
import { computeEnrollmentDerived, groupDraftDefaults, type EnrollmentFormContext } from "@/lib/enrollment-form-context";

const money = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;
const digits = (v: string) => v.replace(/[^\d]/g, "");

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

function Req() {
  return (
    <span className="text-rose-600" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="border-b border-[var(--color-border)] pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{children}</h4>;
}

/**
 * React 19 form action'ları bittiğinde native `form.reset()` çağırır; kontrollü `<select>`/checkbox'ların DOM durumu
 * ilk seçeneğe/işaretsize döner ama React durumu doğrudur (görünen ≠ gönderilen). Kök kapsayıcıdaki işaretli alanların
 * DOM'u, sunucu sonucu (`syncToken`) değiştikten sonra React durumundan geri yazılır.
 */
function useDomResync(root: React.RefObject<HTMLDivElement | null>, token: unknown) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.querySelectorAll<HTMLSelectElement>("select[data-v]").forEach((s) => {
      const want = s.dataset.v ?? "";
      if (s.value !== want) s.value = want;
    });
    el.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-c]").forEach((c) => {
      const want = c.dataset.c === "1";
      if (c.checked !== want) c.checked = want;
    });
  }, [root, token]);
}

export function EnrollmentFormFields({
  ctx,
  mode,
  draft,
  errors,
  onChange,
  termType,
  syncToken,
  idPrefix,
}: {
  ctx: EnrollmentFormContext;
  mode: EnrollmentFormMode;
  draft: EnrollmentDraft;
  errors: EnrollmentFieldErrors;
  onChange: (patch: Partial<EnrollmentDraft>) => void;
  termType: StudentTermType;
  /** Sunucu işlemi sonucu (form reset sonrası DOM'u React durumundan geri yazmak için). */
  syncToken?: unknown;
  idPrefix: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useDomResync(root, syncToken);

  const creating = mode !== "edit";
  const isMeb = draftIsMeb(draft);
  const derived = useMemo(() => computeEnrollmentDerived(ctx, draft, termType), [ctx, draft, termType]);
  const pkg = ctx.packages.find((p) => p.id === draft.packageId);
  const campaignMode = draft.campaignIds.length > 0;
  const eligibleTeachers = ctx.teachers.filter((t) => t.active && (!draft.instrument || t.instruments.includes(draft.instrument)));
  const personBranch = ctx.branches.find((b) => b.id === ctx.personBranchId);
  const hasStoredMeb = !isMeb && !!(draft.mebLevelStartDate || draft.mebLevelEndDate || draft.mebExamDate || draft.mebExamStatus);
  const fp = draft.firstPayment;
  const setFp = (patch: Partial<EnrollmentDraft["firstPayment"]>) => onChange({ firstPayment: { ...fp, ...patch } });
  const entered = fp.amount.trim() === "" ? undefined : Number(digits(fp.amount));
  const suggested = derived.suggestion?.suggestedAmount;
  const mismatch = creating && suggested !== undefined && entered !== undefined && Number.isFinite(entered) && entered !== suggested;
  const noCollection = entered === 0;
  const includeNext = fp.includeNextMonth ?? derived.suggestion?.includesNextMonth ?? false;
  const id = (name: string) => `${idPrefix}-${name}`;

  function setInstrument(instrument: string) {
    const teachers = ctx.teachers.filter((t) => t.active && t.instruments.includes(instrument));
    // Tek uygun öğretmen varsa önerilir; birden fazlaysa AÇIKÇA seçtirilir (ilk bulunan sessizce atanmaz).
    const keep = teachers.some((t) => t.id === draft.teacherId) ? draft.teacherId : teachers.length === 1 ? teachers[0]!.id : "";
    onChange({ instrument, teacherId: keep });
  }

  const group = draft.groupLessonId ? ctx.groupLessons?.find((g) => g.id === draft.groupLessonId) : undefined;
  const groupLocked = !!draft.groupLessonId;

  function selectGroup(groupLessonId: string) {
    const g = ctx.groupLessons?.find((x) => x.id === groupLessonId);
    if (!g) {
      onChange({ groupLessonId: "" });
      return;
    }
    // Koşullar gruptan gelir (sunucu yine zorlar); ücret önerilir, paket/indirimle değiştirilebilir.
    onChange(groupDraftDefaults(g, ctx.personBranchId));
  }

  function selectPackage(packageId: string) {
    const p = ctx.packages.find((x) => x.id === packageId);
    const patch: Partial<EnrollmentDraft> = { packageId };
    if (p) {
      if (p.defaultDurationMinutes === 30 || p.defaultDurationMinutes === 40 || p.defaultDurationMinutes === 50) {
        patch.lessonDurationMinutes = String(p.defaultDurationMinutes);
      }
      if (p.monthlyLessonCount && p.monthlyLessonCount > 0) {
        patch.weeklyLessonCount = String(Math.min(2, Math.max(1, Math.round(p.monthlyLessonCount / 4))));
      }
      if (p.defaultPaymentDueDay) patch.paymentDueDay = String(p.defaultPaymentDueDay);
    } else {
      patch.discountType = "";
      patch.discountValue = "";
      patch.overrideAmount = "";
      patch.overrideReason = "";
    }
    onChange(patch);
  }

  function toggleType(t: string, checked: boolean) {
    onChange({ studentTypes: checked ? [...draft.studentTypes.filter((x) => x !== t), t] : draft.studentTypes.filter((x) => x !== t) });
  }

  function toggleCampaign(cid: string) {
    const next = draft.campaignIds.includes(cid) ? draft.campaignIds.filter((c) => c !== cid) : [...draft.campaignIds, cid];
    onChange({ campaignIds: next, ...(next.length > 0 ? { discountType: "", discountValue: "", overrideAmount: "", overrideReason: "" } : {}) });
  }

  return (
    <div ref={root} className="space-y-4">
      {/* 0. Ders türü — bireysel / grup dersi (2026-10-23) */}
      {(creating && (ctx.groupLessons?.length ?? 0) > 0) || groupLocked ? (
        <div className="space-y-2">
          <SectionTitle>Ders türü</SectionTitle>
          {creating ? (
            <Select
              id={id("group")}
              value={draft.groupLessonId}
              data-v={draft.groupLessonId}
              onChange={(e) => selectGroup(e.target.value)}
              aria-invalid={!!errors.groupLessonId}
            >
              <option value="">Bireysel ders</option>
              {(ctx.groupLessons ?? []).map((g) => (
                <option key={g.id} value={g.id} disabled={g.seats >= g.capacity}>
                  Grup: {g.name} · {g.scheduleLabel} · {g.seats}/{g.capacity}
                  {g.seats >= g.capacity ? " (dolu)" : ""}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm font-medium text-[var(--color-text)]">Grup dersi: {group?.name ?? "bağlı grup"}</p>
          )}
          <FieldError message={errors.groupLessonId} />
          {groupLocked ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Grup dersinde enstrüman, öğretmen, şube, süre ve gün/saat gruptan gelir; ücret grup fiyatıyla önerilir. Sözleşme, ödeme ve ilk tahsilat
              bireysel kayıtla aynı işler. Öğretmen/saat değişikliği Grup Dersleri ekranından tüm grup için yapılır.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 1. Branş ve öğretmen */}
      <div className="space-y-3">
        <SectionTitle>Branş ve öğretmen</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label>
              Enstrüman
              <Req />
            </Label>
            <Select
              id={id("instrument")}
              value={draft.instrument}
              data-v={draft.instrument}
              disabled={mode === "edit" || groupLocked}
              onChange={(e) => setInstrument(e.target.value)}
              aria-invalid={!!errors.instrument}
            >
              <option value="">Enstrüman seçin</option>
              {ctx.instrumentOptions.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
            <FieldError message={errors.instrument} />
            {mode === "edit" ? (
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Geçmiş ders ve sözleşmeler bu kayda bağlı olduğu için enstrüman değiştirilemez; farklı bir enstrüman için yeni branş kaydı ekleyin.
              </p>
            ) : null}
          </div>
          <div>
            <Label>
              Öğretmen
              <Req />
            </Label>
            {draft.instrument && eligibleTeachers.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                &quot;{draft.instrument}&quot; öğretebilen aktif bir öğretmen yok. Önce Öğretmenler ekranından bu enstrümanı ekleyin/aktif edin.
              </p>
            ) : (
              <Select
                id={id("teacher")}
                value={draft.teacherId}
                data-v={draft.teacherId}
                disabled={groupLocked}
                onChange={(e) => onChange({ teacherId: e.target.value })}
                aria-invalid={!!errors.teacherId}
              >
                <option value="">{draft.instrument ? "Öğretmen seçin" : "Önce enstrüman seçin"}</option>
                {eligibleTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
            <FieldError message={errors.teacherId} />
          </div>
        </div>
        {ctx.branches.length > 1 ? (
          <div>
            <Label>Şube</Label>
            <Select
              id={id("branch")}
              value={draft.branchId}
              data-v={draft.branchId}
              disabled={groupLocked}
              onChange={(e) => onChange({ branchId: e.target.value })}
              aria-invalid={!!errors.branchId}
            >
              <option value="">Öğrencinin şubesi{personBranch ? ` (${personBranch.name})` : ""}</option>
              {ctx.branches
                .filter((b) => b.id !== ctx.personBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
            <FieldError message={errors.branchId} />
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Bu branş öğrencinin şubesinden farklı bir şubede veriliyorsa seçin; aksi halde öğrencinin şubesi kullanılır.
            </p>
          </div>
        ) : null}
      </div>

      {/* 2. Öğrenci türü, seviye, MEB */}
      <div className="space-y-3">
        <SectionTitle>Öğrenci türü ve seviye (bu branş için)</SectionTitle>
        <div>
          <Label>Öğrenci türü (opsiyonel, birden fazla seçilebilir)</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STUDENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={draft.studentTypes.includes(t)}
                  data-c={draft.studentTypes.includes(t) ? "1" : "0"}
                  onChange={(e) => toggleType(t, e.target.checked)}
                />
                {t}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Tür her branşta ayrıdır: aynı öğrencinin bir branşı MEB, diğeri başka türde olabilir.
          </p>
          <FieldError message={errors.studentTypes} />
        </div>
        {isMeb ? (
          <div className="space-y-3 rounded-lg border px-3 py-3" style={{ borderColor: "var(--color-primary)", background: "var(--color-surface-muted)" }}>
            <p className="text-sm font-semibold text-[var(--color-text)]">MEB bilgileri{draft.instrument ? ` — ${draft.instrument}` : ""}</p>
            <div>
              <Label>MEB seviyesi (opsiyonel)</Label>
              <Select id={id("level")} value={draft.level} data-v={draft.level} onChange={(e) => onChange({ level: e.target.value })} aria-invalid={!!errors.level}>
                <option value="">Seviye seçin</option>
                {MEB_LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={String(l)}>
                    {l}. Seviye
                  </option>
                ))}
              </Select>
              <FieldError message={errors.level} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label>MEB seviye başlangıç tarihi (opsiyonel)</Label>
                <Input id={id("mebStart")} type="date" value={draft.mebLevelStartDate} onChange={(e) => onChange({ mebLevelStartDate: e.target.value })} aria-invalid={!!errors.mebLevelStartDate} />
                <FieldError message={errors.mebLevelStartDate} />
              </div>
              <div>
                <Label>MEB seviye bitiş tarihi (opsiyonel)</Label>
                <Input id={id("mebEnd")} type="date" value={draft.mebLevelEndDate} onChange={(e) => onChange({ mebLevelEndDate: e.target.value })} aria-invalid={!!errors.mebLevelEndDate} />
                <FieldError message={errors.mebLevelEndDate} />
              </div>
              <div>
                <Label>MEB sınav tarihi (opsiyonel)</Label>
                <Input id={id("mebExam")} type="date" value={draft.mebExamDate} onChange={(e) => onChange({ mebExamDate: e.target.value })} aria-invalid={!!errors.mebExamDate} />
                <FieldError message={errors.mebExamDate} />
              </div>
              <div>
                <Label>Sınava girdi mi?</Label>
                <Select
                  id={id("mebStatus")}
                  value={draft.mebExamStatus}
                  data-v={draft.mebExamStatus}
                  onChange={(e) => onChange({ mebExamStatus: e.target.value as EnrollmentDraft["mebExamStatus"] })}
                  aria-invalid={!!errors.mebExamStatus}
                >
                  <option value="">Bilinmiyor</option>
                  <option value="not_attended">Girmedi</option>
                  <option value="attended">Girdi</option>
                </Select>
                <FieldError message={errors.mebExamStatus} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              MEB bilgileri zorunlu değildir; MEB Paneli&apos;nden de tamamlanabilir. İkisi de girilirse bitiş tarihi başlangıçtan önce olamaz;
              &quot;Girdi&quot; için sınav tarihi zorunludur ve gelecekte olamaz.
            </p>
          </div>
        ) : (
          <div>
            <Label>Seviye (opsiyonel)</Label>
            <Input id={id("levelText")} value={draft.level} onChange={(e) => onChange({ level: e.target.value })} placeholder="Örn. Başlangıç, Orta, İleri" />
            {hasStoredMeb ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Bu branşın kayıtlı MEB bilgileri var. MEB türü işaretli olmadığı için gösterilmiyor ve değiştirilmiyor; kayıtta saklanır, MEB&apos;i
                yeniden işaretlerseniz görünür.
              </p>
            ) : null}
          </div>
        )}
        <div>
          <Label>Hedef sınav / performans dönemi (opsiyonel)</Label>
          <Input id={id("targetExam")} value={draft.targetExam} onChange={(e) => onChange({ targetExam: e.target.value })} placeholder="Örn. 2027 Konservatuvar giriş sınavı" />
        </div>
      </div>

      {/* 3. Ders planı */}
      <div className="space-y-3">
        <SectionTitle>Ders planı</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <Label>
              Ders süresi
              <Req />
            </Label>
            <Select
              id={id("duration")}
              value={draft.lessonDurationMinutes}
              data-v={draft.lessonDurationMinutes}
              disabled={groupLocked}
              onChange={(e) => onChange({ lessonDurationMinutes: e.target.value })}
              aria-invalid={!!errors.lessonDurationMinutes}
            >
              {LESSON_DURATION_OPTIONS.map((m) => (
                <option key={m} value={String(m)}>
                  {m} dk
                </option>
              ))}
            </Select>
            <FieldError message={errors.lessonDurationMinutes} />
          </div>
          <div>
            <Label>
              Haftalık ders
              <Req />
            </Label>
            <Select
              id={id("weekly")}
              value={draft.weeklyLessonCount}
              data-v={draft.weeklyLessonCount}
              disabled={groupLocked}
              onChange={(e) => onChange({ weeklyLessonCount: e.target.value })}
              aria-invalid={!!errors.weeklyLessonCount}
            >
              {ENROLLMENT_WEEKLY_OPTIONS.map((m) => (
                <option key={m} value={String(m)}>
                  Haftada {m} ders
                </option>
              ))}
            </Select>
            <FieldError message={errors.weeklyLessonCount} />
          </div>
          <div>
            <Label>
              Kayıt tarihi
              {creating ? <Req /> : null}
            </Label>
            <Input id={id("start")} type="date" value={draft.startDate} onChange={(e) => onChange({ startDate: e.target.value })} aria-invalid={!!errors.startDate} />
            <FieldError message={errors.startDate} />
          </div>
          <div>
            <Label>Ders başlangıç tarihi</Label>
            <Input id={id("lessonStart")} type="date" value={draft.lessonStartDate} onChange={(e) => onChange({ lessonStartDate: e.target.value })} aria-invalid={!!errors.lessonStartDate} />
            <FieldError message={errors.lessonStartDate} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Ders başlangıç tarihi boşsa kayıt tarihi kullanılır. İlk tahsilat yalnız ders başlangıcından sonraki dersleri sayar.
        </p>
        <div>
          <Label>
            Ders günü ve saati{creating ? " (haftalık ders sayısı kadar farklı gün seçin)" : ""}
            {creating ? <Req /> : null}
          </Label>
          {groupLocked ? (
            <p className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]">{group?.scheduleLabel ?? draft.lessonScheduleText}</p>
          ) : (
            <LessonScheduleSlotsPicker value={draft.lessonScheduleText} onChange={(text) => onChange({ lessonScheduleText: text })} />
          )}
          <FieldError message={errors.lessonScheduleText} />
        </div>
        <div>
          <Label>
            Kayıt süresi (ay)
            {creating ? <Req /> : null}
          </Label>
          <Select
            id={id("months")}
            value={draft.intendedDurationMonths}
            data-v={draft.intendedDurationMonths}
            onChange={(e) => onChange({ intendedDurationMonths: e.target.value })}
            aria-invalid={!!errors.intendedDurationMonths}
          >
            {!creating && !draft.intendedDurationMonths ? <option value="">Belirtilmemiş</option> : null}
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)}>
                {m} aylık kayıt {m <= 2 ? "(Tanışma)" : "(Formal sözleşme)"}
              </option>
            ))}
          </Select>
          <FieldError message={errors.intendedDurationMonths} />
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            1–2 ay Tanışma paketidir. 3–12 ay formal sözleşme akışına yönlendirir; kesin süre bu branşın Sözleşme Merkezi ekranında onaylanır.
          </p>
        </div>
      </div>

      {/* 4. Paket, ücret, indirim */}
      <div className="space-y-3">
        <SectionTitle>Paket ve ücret</SectionTitle>
        <div>
          <Label>Paket</Label>
          <Select id={id("package")} value={draft.packageId} data-v={draft.packageId} onChange={(e) => selectPackage(e.target.value)} aria-invalid={!!errors.packageId}>
            <option value="">Paketsiz — aylık ücreti yazacağım</option>
            {ctx.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} — 30dk {p.price30Min.toLocaleString("tr-TR")} / 40dk {p.price40Min.toLocaleString("tr-TR")} / 50dk {p.price50Min.toLocaleString("tr-TR")} TL
              </option>
            ))}
          </Select>
          <FieldError message={errors.packageId} />
        </div>
        {ctx.campaigns.length > 0 ? (
          <div>
            <Label>Kampanyalar (opsiyonel — çoklu seçilebilir)</Label>
            <div className="space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
              {ctx.campaigns.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.campaignIds.includes(c.id)}
                    data-c={draft.campaignIds.includes(c.id) ? "1" : "0"}
                    onChange={() => toggleCampaign(c.id)}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-[var(--color-text)]">
                      {c.displayId ? `${c.displayId} · ` : ""}
                      {c.name}
                    </span>{" "}
                    <span className="text-[var(--color-text-muted)]">
                      · %{c.discountPercent} · {STACKING_RULE_LABELS[c.stackingRule]}
                      {c.maxUsageCount != null ? ` · ${c.usageCount}/${c.maxUsageCount} kullanım` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError message={errors.campaignIds} />
            {derived.excludedCampaignNotes.length > 0 ? <p className="mt-1 text-[11px] text-amber-700">{derived.excludedCampaignNotes.join(" ")}</p> : null}
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Kampanya seçiliyken manuel indirim kapalıdır. Şube ve tarih uygunluğu kayıtta sunucuda yeniden doğrulanır.
            </p>
          </div>
        ) : null}
        {!pkg ? (
          <div>
            <Label>
              Aylık ücret (₺)
              <Req />
            </Label>
            <Input
              id={id("fee")}
              inputMode="numeric"
              value={draft.monthlyFee}
              onChange={(e) => onChange({ monthlyFee: sanitizeAmountInput(e.target.value) })}
              placeholder="Örn. 3000 — %100 burslu için 0"
              aria-invalid={!!errors.monthlyFee}
            />
            <FieldError message={errors.monthlyFee} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>İndirim (opsiyonel)</Label>
              <div className="flex gap-1">
                <Select
                  value={campaignMode ? "" : draft.discountType}
                  data-v={campaignMode ? "" : draft.discountType}
                  disabled={campaignMode}
                  onChange={(e) => onChange({ discountType: e.target.value as EnrollmentDraft["discountType"] })}
                >
                  <option value="">{campaignMode ? "Kampanya uygulanıyor" : "İndirim yok"}</option>
                  <option value="percent">Yüzde (%)</option>
                  <option value="amount">Tutar (₺)</option>
                </Select>
                <Input
                  inputMode="decimal"
                  disabled={campaignMode || !draft.discountType}
                  value={campaignMode ? String(derived.campaignPercent ?? "") : draft.discountValue}
                  onChange={(e) => onChange({ discountValue: e.target.value })}
                  aria-invalid={!!errors.discountValue}
                />
              </div>
              <FieldError message={errors.discountValue} />
            </div>
            {!campaignMode ? (
              <div>
                <Label>Elle aylık ücret (opsiyonel)</Label>
                <Input inputMode="numeric" value={draft.overrideAmount} onChange={(e) => onChange({ overrideAmount: digits(e.target.value) })} />
                <Input
                  className="mt-1"
                  value={draft.overrideReason}
                  maxLength={300}
                  disabled={!draft.overrideAmount}
                  placeholder="Elle ücret gerekçesi (en az 3 karakter)"
                  onChange={(e) => onChange({ overrideReason: e.target.value })}
                  aria-invalid={!!errors.overrideReason}
                />
                <FieldError message={errors.overrideReason} />
              </div>
            ) : null}
          </div>
        )}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
          {derived.pricing ? (
            <>
              {derived.pricing.packageBaseMonthlyFee !== undefined && derived.pricing.packageBaseMonthlyFee !== derived.pricing.monthlyFee ? (
                <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                  <span>Liste / taban ücret</span>
                  <span>{money(derived.pricing.packageBaseMonthlyFee)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text)]">Nihai aylık ücret</span>
                <span className="font-bold text-[var(--color-text)]">{money(derived.pricing.monthlyFee)}</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Önizlemedir; kayıtta ücret sunucuda aynı kuralla yeniden hesaplanır ve yalnız bu branşa yazılır.
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Paket seçin ya da aylık ücreti yazın; nihai ücret burada görünür.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Ödeme türü (opsiyonel)</Label>
            <Select
              id={id("payMethod")}
              value={draft.paymentMethod}
              data-v={draft.paymentMethod}
              onChange={(e) => onChange({ paymentMethod: e.target.value as EnrollmentDraft["paymentMethod"] })}
            >
              <option value="">Belirtilmemiş</option>
              <option value="cash">Nakit</option>
              <option value="transfer">Havale/EFT</option>
              <option value="credit_card">Kredi kartı</option>
            </Select>
          </div>
          <div>
            <Label>Ödeme günü (ayın, opsiyonel)</Label>
            <Input
              id={id("dueDay")}
              inputMode="numeric"
              maxLength={2}
              value={draft.paymentDueDay}
              onChange={(e) => onChange({ paymentDueDay: digits(e.target.value).slice(0, 2) })}
              aria-invalid={!!errors.paymentDueDay}
            />
            <FieldError message={errors.paymentDueDay} />
          </div>
        </div>
      </div>

      {/* 5. Kayıt anı ilk tahsilat (yalnız yeni branş) */}
      {creating ? (
        <div className="space-y-3">
          <SectionTitle>İlk ödeme / kayıt anı tahsilatı{draft.instrument ? ` — ${draft.instrument}` : ""}</SectionTitle>
          <p className="text-xs text-[var(--color-text-muted)]">
            Her branşın ilk tahsilatı ayrı alınır ve yalnız bu branşa yazılır. Tutar önerilenle aynıysa gerekçe istenmez; farklıysa gerekçe zorunludur. Ücret %100
            burslu ise tutara 0 yazın (ödeme kaydı oluşmaz).
          </p>
          {derived.suggestion ? (
            <p className="rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-xs font-medium text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              Sistem önerilen ilk tahsilat: <strong>{money(derived.suggestion.suggestedAmount)}</strong>
              {" "}({derived.suggestion.plannedLessons} ders {derived.suggestion.exact ? "kesin" : "tahmini"}
              {derived.suggestion.exact ? "" : " — kesinleşmesi için ders günlerini seçin"}).{" "}
              <button type="button" className="underline" onClick={() => setFp({ amount: String(derived.suggestion!.suggestedAmount) })}>
                Öneriyi tutara yaz
              </button>
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Ücret ve haftalık ders sayısı belli olunca önerilen tutar burada görünür.</p>
          )}
          <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5"
              checked={includeNext}
              data-c={includeNext ? "1" : "0"}
              onChange={(e) => setFp({ includeNextMonth: e.target.checked })}
            />
            <span>
              İlk tahsilata takip eden ayın tam ücretini de ekle
              <span className="block text-[var(--color-text-muted)]">
                Kayıt ayında kurumun eşiğinden az ders kalıyorsa varsayılan olarak işaretlenir; seçiminiz korunur.
              </span>
            </span>
          </label>
          {mismatch ? (
            <div role="status" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex justify-between"><span>Sistem önerisi</span><span className="font-semibold">{money(suggested!)}</span></div>
              <div className="flex justify-between"><span>Fiili tahsilat</span><span className="font-semibold">{money(entered!)}</span></div>
              <div className="flex justify-between border-t border-amber-300/60 pt-1">
                <span>Fark</span>
                <span className="font-semibold">{entered! - suggested! > 0 ? "+" : ""}{money(entered! - suggested!)}</span>
              </div>
              <p className="pt-1">Tutar farklı olduğundan düzeltme gerekçesi zorunludur.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>
                Ödeme yöntemi
                {noCollection ? null : <Req />}
              </Label>
              <Select
                id={id("fpMethod")}
                value={fp.method}
                data-v={fp.method}
                onChange={(e) => setFp({ method: e.target.value as typeof fp.method })}
                aria-invalid={!!errors["firstPayment.method"]}
              >
                <option value="">Seçiniz</option>
                <option value="cash">Nakit</option>
                <option value="transfer">Havale/EFT</option>
                <option value="credit_card">Kredi kartı</option>
              </Select>
              <FieldError message={errors["firstPayment.method"]} />
            </div>
            <div>
              <Label>
                Tahsil edilen tutar (₺)
                <Req />
              </Label>
              <Input
                id={id("fpAmount")}
                inputMode="numeric"
                value={fp.amount}
                onChange={(e) => setFp({ amount: sanitizeAmountInput(e.target.value) })}
                placeholder={suggested !== undefined ? String(suggested) : "Örn. 3000"}
                aria-invalid={!!errors["firstPayment.amount"]}
              />
              <FieldError message={errors["firstPayment.amount"]} />
              {noCollection ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">0 ₺: gerçek tahsilat yok — ödeme kaydı oluşturulmaz (yalnız %100 burslu kayıtta).</p> : null}
            </div>
            <div>
              <Label>
                Tahsilat tarihi
                {noCollection ? null : <Req />}
              </Label>
              <Input id={id("fpDate")} type="date" value={fp.collectedAt} onChange={(e) => setFp({ collectedAt: e.target.value })} aria-invalid={!!errors["firstPayment.collectedAt"]} />
              <FieldError message={errors["firstPayment.collectedAt"]} />
            </div>
            <div>
              <Label>Dekont / referans no (varsa)</Label>
              <Input id={id("fpRef")} value={fp.reference} onChange={(e) => setFp({ reference: e.target.value })} placeholder="Opsiyonel" />
            </div>
          </div>
          <div>
            <Label>Tahsilat notu (opsiyonel)</Label>
            <Input id={id("fpNote")} value={fp.note} onChange={(e) => setFp({ note: e.target.value })} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>
              Düzeltme gerekçesi (yalnız tutar öneriden farklıysa zorunlu)
              {mismatch ? <Req /> : null}
            </Label>
            <Input
              id={id("fpReason")}
              value={fp.adjustmentReason}
              onChange={(e) => setFp({ adjustmentReason: e.target.value })}
              placeholder="Örn. Aile maddi zorluk, yönetici onayı"
              aria-invalid={!!errors["firstPayment.adjustmentReason"]}
            />
            <FieldError message={errors["firstPayment.adjustmentReason"]} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

