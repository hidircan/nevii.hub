"use client";

/**
 * 2026-10-10 — YENİ ÖĞRENCİ KAYDI: EŞİT BRANŞ KARTLARI + SON KONTROL.
 *
 * Kişi (kimlik) bilgisi formun üstünde TEK kez girilir; burada her branş kendi kartında, birinci/ikinci ayrımı olmadan
 * (hiçbiri "ana" değildir) eksiksiz ayarlarla girilir. Kartlar kararlı anahtarla (`key`) yönetilir: ekleme/silme bir
 * kartın değerini diğerine taşımaz, hatalar "Piyano — MEB seviye başlangıç tarihi: …" biçiminde hangi branş + hangi alan
 * olduğunu söyler. Tüm taslaklar gizli `enrollments` alanında JSON olarak gönderilir; `registrationId` çift gönderimi
 * (retry/çift tık) tek kayda indirger.
 */
import { Plus, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { EnrollmentFormFields } from "@/components/enrollment-form-fields";
import {
  draftIsMeb,
  draftLabel,
  emptyEnrollmentDraft,
  ENROLLMENT_FIELD_LABELS,
  MAX_ENROLLMENT_DRAFTS,
  type EnrollmentDraft,
  type EnrollmentFieldErrors,
} from "@/lib/enrollment-form";
import { computeEnrollmentDerived, type EnrollmentFormContext } from "@/lib/enrollment-form-context";
import type { StudentTermType } from "@/lib/types";

const money = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;
const METHOD: Record<string, string> = { cash: "Nakit", transfer: "Havale/EFT", credit_card: "Kredi kartı" };

export const enrollmentCardId = (key: string) => `enrollment-card-${key}`;

export function NewStudentEnrollments({
  ctx,
  drafts,
  onChange,
  errors,
  termType,
  syncToken,
}: {
  ctx: EnrollmentFormContext;
  drafts: EnrollmentDraft[];
  onChange: (next: EnrollmentDraft[]) => void;
  /** Taslak anahtarı → alan → hata (istemci + sunucu birleşimi). */
  errors: Record<string, EnrollmentFieldErrors>;
  termType: StudentTermType;
  syncToken?: unknown;
}) {
  const patch = (key: string, p: Partial<EnrollmentDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...p } : d)));

  return (
    <div className="space-y-4">
      <input type="hidden" name="enrollments" value={JSON.stringify(drafts)} />
      {drafts.map((d, i) => {
        const errs = errors[d.key] ?? {};
        const errorCount = Object.keys(errs).length;
        return (
          <Card key={d.key} className="!p-0" >
            <section id={enrollmentCardId(d.key)} aria-label={`${draftLabel(d, i)} branş kaydı`} className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary)]">
                    {i + 1}
                  </span>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                    Branş kaydı {i + 1}
                    {d.instrument ? ` — ${d.instrument}` : ""}
                  </h3>
                  {draftIsMeb(d) ? <Badge>MEB</Badge> : null}
                  {errorCount > 0 ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{errorCount} alan düzeltilmeli</span>
                  ) : null}
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-rose-700"
                    aria-label={`${draftLabel(d, i)} branş kaydını kaldır`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Bu branşı kaldır
                  </button>
                ) : null}
              </div>
              <EnrollmentFormFields
                ctx={ctx}
                mode="register"
                draft={d}
                errors={errs}
                onChange={(p) => patch(d.key, p)}
                termType={termType}
                syncToken={syncToken}
                idPrefix={`enr-${d.key}`}
              />
            </section>
          </Card>
        );
      })}
      {drafts.length < MAX_ENROLLMENT_DRAFTS ? (
        <button
          type="button"
          onClick={() => onChange([...drafts, emptyEnrollmentDraft()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
        >
          <Plus className="h-4 w-4" /> Başka bir branş ekle
        </button>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">Bir kayıtta en fazla {MAX_ENROLLMENT_DRAFTS} branş eklenebilir.</p>
      )}
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Her branş bağımsızdır: kendi öğretmeni, türü (MEB dahil), paketi/ücreti, ödeme planı, ilk tahsilatı ve sözleşmesi vardır. Birinin değiştirilmesi diğerini
        etkilemez.
      </p>
    </div>
  );
}

/** Son kontrol — kaydetmeden önce kişi + tüm branşların özeti ve toplam ilk tahsilat. */
export function EnrollmentReview({
  ctx,
  drafts,
  errors,
  termType,
}: {
  ctx: EnrollmentFormContext;
  drafts: EnrollmentDraft[];
  errors: Record<string, EnrollmentFieldErrors>;
  termType: StudentTermType;
}) {
  const rows = drafts.map((d, i) => {
    const derived = computeEnrollmentDerived(ctx, d, termType);
    const teacher = ctx.teachers.find((t) => t.id === d.teacherId)?.name;
    const entered = d.firstPayment.amount.trim() === "" ? undefined : Number(d.firstPayment.amount.replace(/[^\d]/g, ""));
    return { d, i, derived, teacher, entered, errs: errors[d.key] ?? {} };
  });
  const total = rows.reduce((s, r) => s + (r.entered && Number.isFinite(r.entered) ? r.entered : 0), 0);
  const missing = rows.filter((r) => Object.keys(r.errs).length > 0).length;

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Son kontrol</h2>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Tek öğrenci kimliği, {drafts.length} branş kaydı. Kaydedildiğinde her branş kendi ödeme planı ve ilk tahsilatıyla ayrı açılır; hiçbir branş yarım kalmaz.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="py-1 pr-3 font-medium">Branş</th>
              <th className="py-1 pr-3 font-medium">Öğretmen</th>
              <th className="py-1 pr-3 font-medium">Tür</th>
              <th className="py-1 pr-3 font-medium">Haftalık / süre</th>
              <th className="py-1 pr-3 font-medium">Aylık ücret</th>
              <th className="py-1 pr-3 font-medium">İlk tahsilat</th>
              <th className="py-1 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, i, derived, teacher, entered, errs }) => (
              <tr key={d.key} className="border-b border-[var(--color-border)] align-top last:border-0">
                <td className="py-1.5 pr-3 font-medium text-[var(--color-text)]">{draftLabel(d, i)}</td>
                <td className="py-1.5 pr-3">{teacher ?? <span className="text-rose-600">Seçilmedi</span>}</td>
                <td className="py-1.5 pr-3">{d.studentTypes.length ? d.studentTypes.join(", ") : "—"}</td>
                <td className="py-1.5 pr-3">
                  {d.weeklyLessonCount}/hf · {d.lessonDurationMinutes} dk
                </td>
                <td className="py-1.5 pr-3">{derived.pricing ? money(derived.pricing.monthlyFee) : <span className="text-rose-600">Belirsiz</span>}</td>
                <td className="py-1.5 pr-3">
                  {entered === undefined ? (
                    <span className="text-rose-600">Girilmedi</span>
                  ) : entered === 0 ? (
                    "Tahsilat yok (0 ₺)"
                  ) : (
                    `${money(entered)}${d.firstPayment.method ? ` · ${METHOD[d.firstPayment.method]}` : ""}`
                  )}
                </td>
                <td className="py-1.5">
                  {Object.keys(errs).length === 0 ? (
                    <span className="text-emerald-700">Hazır</span>
                  ) : (
                    <span className="text-rose-700">
                      {Object.keys(errs)
                        .slice(0, 3)
                        .map((k) => ENROLLMENT_FIELD_LABELS[k] ?? k)
                        .join(", ")}
                      {Object.keys(errs).length > 3 ? "…" : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs font-medium text-[var(--color-text)]">
        Toplam girilen ilk tahsilat: {money(total)}
        {missing > 0 ? <span className="ml-2 text-rose-700">· {missing} branşta eksik/hatalı alan var</span> : null}
      </p>
    </Card>
  );
}
