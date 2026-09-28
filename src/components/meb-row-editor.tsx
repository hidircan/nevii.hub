"use client";

/**
 * MEB Paneli satır düzenleyici — tablodaki TÜM iş alanları revize edilir:
 * MEB seviyesi, dönem başlangıç/bitiş, sınav tarihi + katılım, şube.
 *
 * Kurallar:
 * - Öğretmen/enstrüman bu diyalogda DEĞİŞTİRİLEMEZ (MT-003) — salt görüntü
 *   + güvenli akışa (Öğrenciler › toplu işlem) yönlendirme metni.
 * - Şube değişiminde önce etki özeti alınır (öğretmen uyumu + gelecek planlı
 *   ders sayısı); özet ONAYLANMADAN kayıt gönderilmez. Öğretmenin hedef
 *   şubede görevli OLMAMASI sunucuda hard block'tur (sessiz öğretmen
 *   değişimi ASLA yapılmaz; mevcut planlı dersler OTOMATİK taşınmaz).
 * - Kaydedince diyalog kapanır + liste tazelenir; aynı satır yeniden
 *   açıldığında sunucudan TAZE değerler görünür (kalıcılık).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  actionGetMebStudentEditImpact,
  actionUpdateMebStudent,
} from "@/lib/actions";
import type { MebEditImpact, MebPanelRow } from "@/lib/services/tools";
import { MEB_LEVEL_OPTIONS, isValidMebLevel } from "@/lib/student-level-rules";

export type MebEditorBranch = { id: string; name: string };

function inputClassName(hasError: boolean) {
  return hasError ? "border-red-500 focus-visible:outline-red-500" : undefined;
}

export function MebRowEditor({
  row,
  branches,
}: {
  row: MebPanelRow;
  branches: MebEditorBranch[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(row.level ?? "");
  const [startDate, setStartDate] = useState(row.mebLevelStartDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(row.mebLevelEndDate?.slice(0, 10) ?? "");
  const [examDate, setExamDate] = useState(row.mebExamDate?.slice(0, 10) ?? "");
  const [examStatus, setExamStatus] = useState<"" | "not_attended" | "attended">(() =>
    row.mebExamAttended === true ? "attended" : row.mebExamAttended === false ? "not_attended" : ""
  );
  const [branchId, setBranchId] = useState(row.branchId);
  const [impact, setImpact] = useState<MebEditImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [branchConfirmed, setBranchConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const branchChanged = branchId !== row.branchId;

  function resetToRow() {
    setLevel(row.level ?? "");
    setStartDate(row.mebLevelStartDate?.slice(0, 10) ?? "");
    setEndDate(row.mebLevelEndDate?.slice(0, 10) ?? "");
    setExamDate(row.mebExamDate?.slice(0, 10) ?? "");
    setExamStatus(row.mebExamAttended === true ? "attended" : row.mebExamAttended === false ? "not_attended" : "");
    setBranchId(row.branchId);
    setImpact(null);
    setImpactError(null);
    setBranchConfirmed(false);
    setFieldErrors({});
    setError(null);
    setSaved(false);
  }

  function loadImpact(nextBranchId: string) {
    setImpact(null);
    setImpactError(null);
    setBranchConfirmed(false);
    if (nextBranchId === row.branchId) return;
    startTransition(async () => {
      const result = await actionGetMebStudentEditImpact({ studentId: row.id, branchId: nextBranchId });
      if (!result.ok) {
        setImpactError(result.message);
        return;
      }
      setImpact(result.impact);
    });
  }

  function onSave() {
    setError(null);
    setFieldErrors({});
    setSaved(false);
    startTransition(async () => {
      const result = await actionUpdateMebStudent({
        studentId: row.id,
        level: level || undefined,
        mebLevelStartDate: startDate || undefined,
        mebLevelEndDate: endDate || undefined,
        mebExamDate: examDate || undefined,
        mebExamAttended: examStatus === "attended" ? true : examStatus === "not_attended" ? false : undefined,
        branchId: branchChanged ? branchId : undefined,
        branchChangeConfirmed: branchChanged ? branchConfirmed : undefined,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
      // Kısa bir başarı gösterimi sonrası kapat — liste TAZE veriyle gelir.
      setTimeout(() => {
        setOpen(false);
        resetToRow();
      }, 900);
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          resetToRow();
          setOpen(true);
        }}
      >
        Düzenle
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${row.name} MEB bilgileri`}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-[var(--color-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                {row.name}
                {row.displayId ? <span className="ml-2 font-normal text-[var(--color-text-muted)]">{row.displayId}</span> : null}
              </h3>
              <button
                type="button"
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div>
              <Label>MEB seviyesi</Label>
              <Select className={inputClassName(!!fieldErrors.level)} value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Seviye seçin</option>
                {level && !isValidMebLevel(level) ? <option value={level}>{level} (eski değer — 1–8 seçin)</option> : null}
                {MEB_LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}. Seviye
                  </option>
                ))}
              </Select>
              {fieldErrors.level ? <p className="mt-1 text-xs text-red-600">{fieldErrors.level}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>MEB seviye başlangıç tarihi</Label>
                <Input
                  className={inputClassName(!!fieldErrors.mebLevelStartDate)}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {fieldErrors.mebLevelStartDate ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.mebLevelStartDate}</p>
                ) : null}
              </div>
              <div>
                <Label>MEB seviye bitiş tarihi</Label>
                <Input
                  className={inputClassName(!!fieldErrors.mebLevelEndDate)}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {fieldErrors.mebLevelEndDate ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.mebLevelEndDate}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>MEB sınav tarihi (opsiyonel)</Label>
                <Input
                  className={inputClassName(!!fieldErrors.mebExamDate)}
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
                {fieldErrors.mebExamDate ? <p className="mt-1 text-xs text-red-600">{fieldErrors.mebExamDate}</p> : null}
              </div>
              <div>
                <Label>Sınava girdi mi?</Label>
                <Select
                  className={inputClassName(!!fieldErrors.mebExamAttended)}
                  value={examStatus}
                  onChange={(e) => setExamStatus(e.target.value as "" | "not_attended" | "attended")}
                >
                  <option value="">Bilinmiyor</option>
                  <option value="not_attended">Girmedi</option>
                  <option value="attended">Girdi</option>
                </Select>
                {fieldErrors.mebExamAttended ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.mebExamAttended}</p>
                ) : null}
              </div>
            </div>

            <div>
              <Label>Şube</Label>
              <Select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  loadImpact(e.target.value);
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Öğretmen: {row.teacherName ?? "—"} — öğretmen/enstrüman değişimi bu panelden yapılamaz (Öğrenciler ›
                toplu işlem akışını kullanın).
              </p>
            </div>

            {branchChanged ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {impactError ? (
                  <p>{impactError}</p>
                ) : impact ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Şube değişimi etki özeti</p>
                    <p>
                      Öğretmen ({impact.teacherName ?? "—"}){" "}
                      {impact.teacherServesTargetBranch
                        ? "hedef şubede görevli — uyumlu."
                        : "hedef şubede GÖREVLİ DEĞİL — bu durumda kayıt yapılmaz."}
                    </p>
                    <p>
                      Bu öğrencinin gelecekte {impact.futureLessonCount} planlı dersi var — şube değişimi bunları
                      OTOMATİK taşımaz; gerekiyorsa Ders Programından ayrıca düzenleyin.
                    </p>
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" checked={branchConfirmed} onChange={(e) => setBranchConfirmed(e.target.checked)} />
                      Etki özetini okudum, şube değişimini onaylıyorum
                    </label>
                  </div>
                ) : (
                  <p>Etki özeti yükleniyor…</p>
                )}
              </div>
            ) : null}

            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            {saved ? <p className="text-xs text-emerald-600">Kaydedildi.</p> : null}

            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Vazgeç</Button>
              <Button onClick={onSave} disabled={pending || (branchChanged && (!impact || !branchConfirmed))}>
                {pending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
