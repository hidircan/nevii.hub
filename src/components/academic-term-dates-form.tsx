"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateAcademicTermDates } from "@/lib/actions";
import { ACADEMIC_TERM_DATE_FIELDS, ACADEMIC_TERM_DATE_LABELS, type AcademicTermDates } from "@/lib/academic-term-dates";
import { Button, Card } from "@/components/ui";

export function AcademicTermDatesForm({ initial }: { initial: AcademicTermDates }) {
  const router = useRouter();
  const [values, setValues] = useState<AcademicTermDates>(initial);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AcademicTermDates, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    const result = await actionUpdateAcademicTermDates(values);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      return;
    }
    setSuccess("Dönem tarihleri kaydedildi.");
    router.refresh();
  }

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-[var(--color-text)]">Akademik dönem tarihleri</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Güz ve Yaz dönemlerinin başlangıç/bitiş tarihleri Yoklama Takvimi, Ders Programı ve döküm
        ekranlarında aynı çözümleyiciyle kullanılır. Geçersiz tarih sessizce varsayılana düşmez.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {ACADEMIC_TERM_DATE_FIELDS.map((field) => (
          <div key={field}>
            <label htmlFor={field} className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
              {ACADEMIC_TERM_DATE_LABELS[field]}
            </label>
            <input
              id={field}
              type="date"
              value={values[field]}
              onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
              aria-invalid={Boolean(fieldErrors[field])}
            />
            {fieldErrors[field] ? (
              <p className="mt-1 text-xs font-medium text-[var(--color-danger)]" role="alert">
                {fieldErrors[field]}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm font-medium text-[var(--color-success)]" role="status">
          {success}
        </p>
      ) : null}
      <div className="mt-4">
        <Button type="button" onClick={() => void handleSave()} disabled={submitting}>
          {submitting ? "Kaydediliyor…" : "Dönem tarihlerini kaydet"}
        </Button>
      </div>
    </Card>
  );
}
