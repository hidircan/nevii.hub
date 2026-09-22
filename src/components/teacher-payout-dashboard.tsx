"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { tr } from "date-fns/locale";
import { ModalShell, modalButton } from "@/components/modal-shell";
import {
  actionComputeTeacherPayout,
  actionCreateTeacherPayout,
  actionMarkTeacherPayoutPaid,
  actionReviseTeacherPayout,
  actionResetTeacherPayoutRevision,
  actionUnmarkTeacherPayoutPaid,
  actionUpdateTeacherPayoutPaymentMethod,
  actionUpdateTeacherProfile,
  type ComputeTeacherPayoutActionResult,
} from "@/lib/actions";
import { Badge, Button, Card, Select } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

const PAYMENT_METHOD_LABEL: Record<"cash" | "transfer", string> = {
  cash: "Nakit",
  transfer: "Havale",
};

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function periodFor(year: number, month: number) {
  const anchor = new Date(year, month - 1, 1);
  return {
    periodStart: format(startOfMonth(anchor), "yyyy-MM-dd"),
    periodEnd: format(endOfMonth(anchor), "yyyy-MM-dd"),
  };
}

export function TeacherPayoutDashboard({
  teacherId,
  teacherName,
  initialYear,
  initialMonth,
  initialResult,
  initialThreshold,
  canWrite,
}: {
  teacherId: string;
  teacherName: string;
  initialYear: number;
  initialMonth: number;
  initialResult: ComputeTeacherPayoutActionResult;
  initialThreshold?: number;
  /** "Tüm kurumlar" görünümünde false — hakediş hesaplanamaz/oluşturulamaz. */
  canWrite: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<"" | "cash" | "transfer">(
    initialResult.ok
      ? ((initialResult.existingPayout?.method as "cash" | "transfer" | undefined) ??
          initialResult.paymentMethodInfo?.defaultMethod ??
          "")
      : ""
  );
  const [updatingMethod, setUpdatingMethod] = useState(false);
  const [methodMessage, setMethodMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [threshold, setThreshold] = useState(initialThreshold ? String(initialThreshold) : "");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [paying, setPaying] = useState(false);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  // K — revizyon düzenleme taslağı: yalnız kullanıcının dokunduğu alanlar (lessonId → alan → metin).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, { minutes?: string; hourlyRate?: string; amount?: string }>>({});
  const [dialog, setDialog] = useState<null | "revise" | "reset" | "unpay">(null);
  const [dialogReason, setDialogReason] = useState("");
  const [dialogPassword, setDialogPassword] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Dönem her değiştiğinde seçim, o dönemin varsayılanına sıfırlanır — önceki
  // dönemden kalan bir seçim yanlışlıkla farklı bir döneme taşınmaz. Render
  // sırasında koşullu setState (React'ın önerdiği "adjust state on prop/state
  // change" deseni) — bir efekt DEĞİL, bu yüzden ekstra bir render turu/lint
  // uyarısı yaratmaz.
  const [syncedResult, setSyncedResult] = useState(result);
  if (result !== syncedResult) {
    setSyncedResult(result);
    setSelectedMethod(
      result.ok
        ? (result.existingPayout?.method as "cash" | "transfer" | undefined) ?? result.paymentMethodInfo?.defaultMethod ?? ""
        : ""
    );
    setMethodMessage(null);
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  async function handleUpdateMethod() {
    if (!result.ok || !result.existingPayout || !selectedMethod) return;
    setUpdatingMethod(true);
    setMethodMessage(null);
    const updated = await actionUpdateTeacherPayoutPaymentMethod({
      payoutId: result.existingPayout.id,
      method: selectedMethod,
    });
    setUpdatingMethod(false);
    if (!updated.ok) {
      setMethodMessage({ ok: false, text: updated.message });
      return;
    }
    setMethodMessage({ ok: true, text: "Ödeme yöntemi güncellendi." });
    await fetchPeriod(year, month);
  }

  async function fetchPeriod(nextYear: number, nextMonth: number, keepMessage = false) {
    setLoading(true);
    if (!keepMessage) setCreateMessage(null);
    const { periodStart, periodEnd } = periodFor(nextYear, nextMonth);
    const next = await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd });
    setResult(next);
    setLoading(false);
  }

  async function handleCreatePayout() {
    if (!result.ok) return;
    setCreating(true);
    setCreateMessage(null);
    const { periodStart, periodEnd } = periodFor(year, month);
    const created = await actionCreateTeacherPayout({
      teacherId,
      periodStart,
      periodEnd,
      paymentMethod: selectedMethod || undefined,
    });
    setCreating(false);
    if (!created.ok) {
      setCreateMessage({ ok: false, text: created.message });
      return;
    }
    setCreateMessage({
      ok: true,
      text: `Hakediş kaydı oluşturuldu: ${formatMoney(created.payout.totalAmount)}. Ödemeyi yaptığınızda “Hakedişi öde” ile kaydedin.`,
    });
    await fetchPeriod(year, month, true);
  }

  async function handleSaveThreshold() {
    const value = Number(threshold);
    if (!Number.isInteger(value) || value < 1 || value > 80) {
      setMethodMessage({ ok: false, text: "Eşik 1 ile 80 saat arasında tam sayı olmalı." });
      return;
    }
    setSavingThreshold(true);
    const saved = await actionUpdateTeacherProfile({ teacherId, weeklyHoursThreshold: value });
    setSavingThreshold(false);
    if (!saved.ok) {
      setMethodMessage({ ok: false, text: saved.message });
      return;
    }
    setMethodMessage({ ok: true, text: "Ödeme yöntemi eşiği kaydedildi." });
    await fetchPeriod(year, month, true);
  }

  async function handlePay() {
    if (!result.ok || !result.existingPayout || result.existingPayout.status === "paid") return;
    setPaying(true);
    setCreateMessage(null);
    const paid = await actionMarkTeacherPayoutPaid({
      payoutId: result.existingPayout.id,
      method: selectedMethod || result.existingPayout.method || undefined,
    });
    setPaying(false);
    if (!paid.ok) {
      setCreateMessage({ ok: false, text: paid.message });
      return;
    }
    setCreateMessage({ ok: true, text: "Hakediş ödendi olarak kaydedildi ve Ödeme Geçmişi’ne işlendi." });
    await fetchPeriod(year, month, true);
  }

  const existing = result.ok ? result.existingPayout : null;
  const isPaid = existing?.status === "paid";

  /** Taslağı uygulayarak satırın efektif değerleri (ekrandaki canlı önizleme). */
  function effectiveLine(line: { lessonId: string; durationMinutes: number; hourlyRate?: number; amount: number; original?: { durationMinutes: number; hourlyRate?: number; amount: number } }) {
    const d = draft[line.lessonId];
    const minutes = d?.minutes !== undefined && d.minutes !== "" ? Number(d.minutes) : line.durationMinutes;
    const rate = d?.hourlyRate !== undefined && d.hourlyRate !== "" ? Number(d.hourlyRate) : line.hourlyRate;
    const touchedCalc = (d?.minutes !== undefined && d.minutes !== "") || (d?.hourlyRate !== undefined && d.hourlyRate !== "");
    const amount =
      d?.amount !== undefined && d.amount !== ""
        ? Number(d.amount)
        : touchedCalc && rate !== undefined
          ? Math.round(((minutes * rate) / 60) * 100) / 100
          : line.amount;
    return { minutes, rate, amount };
  }

  function buildOverrides(): Record<string, { minutes?: number; hourlyRate?: number; amount?: number }> {
    if (!result.ok) return {};
    const out: Record<string, { minutes?: number; hourlyRate?: number; amount?: number }> = {};
    for (const line of result.lines) {
      // Kayıtlı düzeltmeler + yeni taslak birlikte gönderilir (revizyon tam kümeyi yazar).
      const saved = existing?.lineOverrides[line.lessonId] ?? {};
      const d = draft[line.lessonId] ?? {};
      const merged = {
        minutes: d.minutes !== undefined && d.minutes !== "" ? Number(d.minutes) : saved.minutes,
        hourlyRate: d.hourlyRate !== undefined && d.hourlyRate !== "" ? Number(d.hourlyRate) : saved.hourlyRate,
        amount: d.amount !== undefined && d.amount !== "" ? Number(d.amount) : d.minutes || d.hourlyRate ? undefined : saved.amount,
      };
      if (merged.minutes !== undefined || merged.hourlyRate !== undefined || merged.amount !== undefined) out[line.lessonId] = merged;
    }
    return out;
  }

  const draftTotal = result.ok ? Math.round(result.lines.reduce((s2, l) => s2 + effectiveLine(l).amount, 0) * 100) / 100 : 0;
  const changedLineCount = Object.keys(draft).filter((k) => Object.values(draft[k] ?? {}).some((v) => v !== undefined && v !== "")).length;

  function openDialog(kind: "revise" | "reset" | "unpay") {
    setDialog(kind);
    setDialogReason("");
    setDialogPassword("");
    setDialogError(null);
  }

  async function submitDialog() {
    if (!existing || !dialog) return;
    setDialogBusy(true);
    setDialogError(null);
    const common = { payoutId: existing.id, reason: dialogReason, criticalPassword: dialogPassword || undefined };
    const res =
      dialog === "revise"
        ? await actionReviseTeacherPayout({ ...common, lineOverrides: buildOverrides() })
        : dialog === "reset"
          ? await actionResetTeacherPayoutRevision(common)
          : await actionUnmarkTeacherPayoutPaid({ ...common, criticalPassword: dialogPassword });
    setDialogBusy(false);
    setDialogPassword("");
    if (!res.ok) {
      setDialogError(res.message);
      return;
    }
    setDialog(null);
    setEditing(false);
    setDraft({});
    setCreateMessage({
      ok: true,
      text:
        dialog === "revise"
          ? `Hakediş revize edildi: yeni toplam ${formatMoney(res.data.payout.totalAmount)}.`
          : dialog === "reset"
            ? "Revizyon geri alındı; orijinal hesap geçerli."
            : "Ödendi işareti geri alındı; hakediş yeniden “bekliyor” durumunda.",
    });
    await fetchPeriod(year, month, true);
  }

  return (
    <div>
      {!canWrite ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          &quot;Tüm kurumlar&quot; görünümündesiniz — hakediş hesaplamak/oluşturmak için üstteki kurum
          seçiciden tek bir kurum seçin.
        </p>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Ay</label>
            <Select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-auto"
            >
              {MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Yıl</label>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={() => fetchPeriod(year, month)} disabled={loading || !canWrite}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Getir
          </Button>
          <Link
            href={`/panel/ogretmenler/${teacherId}/odemeler`}
            className="ml-auto text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Ödeme geçmişini gör →
          </Link>
        </div>
      </Card>

      {!result.ok ? (
        <Card className="border-rose-200 bg-rose-50/60">
          <p className="text-sm text-rose-700">{result.message}</p>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Toplam ders</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text)] dark:text-slate-50">{result.totalLessons}</p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">Toplam dakika</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text)] dark:text-slate-50">{result.totalMinutes}</p>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/40">
              <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                Toplam hakediş{existing && existing.revisionCount > 0 ? " (revize)" : ""}
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatMoney(result.totalAmount)}</p>
            </Card>
          </div>

          {existing && existing.originalTotalAmount !== undefined ? (
            <Card className="mb-6 !py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold text-[var(--color-text)]">Revizyon</span>
                <span className="text-[var(--color-text-muted)]">
                  Orijinal hesap <strong className="text-[var(--color-text)]">{formatMoney(existing.originalTotalAmount)}</strong>
                  {" → "}revize <strong className="text-[var(--color-text)]">{formatMoney(existing.totalAmount)}</strong>
                  {" · "}fark{" "}
                  <strong
                    style={{
                      color:
                        existing.totalAmount - existing.originalTotalAmount >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {existing.totalAmount - existing.originalTotalAmount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(existing.totalAmount - existing.originalTotalAmount))}
                  </strong>
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {existing.revisionCount}. değişiklik · {existing.revisedByName ?? "—"}
                  {existing.revisedAt ? ` · ${formatDate(existing.revisedAt)}` : ""}
                  {existing.revisionReason ? ` · Gerekçe: ${existing.revisionReason}` : ""}
                </span>
              </div>
            </Card>
          ) : null}

          <Card className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Ödeme yöntemi eşiği
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-sm text-[var(--color-text-muted)]">
                Haftalık saat eşiği
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={threshold}
                  disabled={!canWrite}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1 block w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                />
              </label>
              <Button type="button" variant="secondary" onClick={handleSaveThreshold} disabled={!canWrite || savingThreshold}>
                {savingThreshold ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Eşiği kaydet
              </Button>
              <span className="text-xs text-[var(--color-text-muted)]">
                Eşik ve üstü nakit, altı havale varsayılanıdır. Kayıt oluştuktan sonra yöntemi ayrıca değiştirebilirsiniz.
              </span>
            </div>
            {result.paymentMethodInfo?.threshold === undefined ? (
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Eşik tanımlı değil — öğretmen profilinden haftalık ders saati eşiği girilmeden varsayılan yöntem
                üretilmez.
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Bu dönemdeki haftalık ortalama <strong>{result.paymentMethodInfo.weeklyHours.toFixed(1)} sa</strong>{" "}
                — eşik <strong>{result.paymentMethodInfo.threshold} sa</strong>. Varsayılan yöntem:{" "}
                <strong>
                  {result.paymentMethodInfo.defaultMethod ? PAYMENT_METHOD_LABEL[result.paymentMethodInfo.defaultMethod] : "—"}
                </strong>
                .
              </p>
            )}

            {result.existingPayout ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  Bu dönem için kayıt zaten oluşturulmuş — mevcut yöntem:{" "}
                  <strong>
                    {result.existingPayout.method
                      ? PAYMENT_METHOD_LABEL[result.existingPayout.method as "cash" | "transfer"]
                      : "—"}
                  </strong>
                </span>
                <Select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as "cash" | "transfer")}
                  className="w-auto"
                  disabled={!canWrite}
                >
                  <option value="cash">Nakit</option>
                  <option value="transfer">Havale</option>
                </Select>
                <Button type="button" variant="secondary" onClick={handleUpdateMethod} disabled={updatingMethod || !canWrite}>
                  {updatingMethod ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Yöntemi güncelle
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-sm text-[var(--color-text-muted)]">Oluştururken kullanılacak yöntem:</label>
                <Select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as "" | "cash" | "transfer")}
                  className="w-auto"
                  disabled={!canWrite}
                >
                  <option value="">Varsayılanı kullan</option>
                  <option value="cash">Nakit</option>
                  <option value="transfer">Havale</option>
                </Select>
              </div>
            )}
            {methodMessage ? (
              <p className={`mt-2 text-sm ${methodMessage.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {methodMessage.text}
              </p>
            ) : null}
          </Card>

          {result.missingFeeRuleLessonIds.length > 0 ? (
            <Card className="mb-6 border-amber-200 bg-amber-50/60">
              <p className="text-sm text-amber-900">
                <strong>{result.missingFeeRuleLessonIds.length}</strong> derste geçerli ücret kuralı bulunamadı.
                Bu dönem için hakediş oluşturulamaz — önce{" "}
                <Link href="/panel/ucret-kurallari" className="font-medium underline">
                  Ücret Kuralları
                </Link>{" "}
                sayfasından eksik kuralı tanımlayın.
              </p>
            </Card>
          ) : null}

          {existing && canWrite && result.lines.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Süre, saatlik ücret veya tutarı düzenleyin. Tutarı elle girmezseniz süre × saatlik ücretten hesaplanır.
                  </span>
                  <span className="ml-auto text-xs font-semibold text-[var(--color-text)]">
                    Yeni toplam: {formatMoney(draftTotal)}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => { setEditing(false); setDraft({}); }}>
                    Vazgeç
                  </Button>
                  <Button type="button" onClick={() => openDialog("revise")} disabled={changedLineCount === 0}>
                    Revizyonu kaydet ({changedLineCount})
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                    Dökümü revize et
                  </Button>
                  {existing.originalTotalAmount !== undefined ? (
                    <Button type="button" variant="secondary" onClick={() => openDialog("reset")}>
                      Revizyonu geri al
                    </Button>
                  ) : null}
                  {isPaid ? (
                    <Button type="button" variant="secondary" onClick={() => openDialog("unpay")}>
                      Ödendi işaretini geri al
                    </Button>
                  ) : null}
                  {isPaid ? (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      Ödenmiş hakedişte her değişiklik kritik işlem şifresi ister ve denetim kaydına yazılır.
                    </span>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <Card className="overflow-hidden p-0">
            {result.lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                {format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: tr })} döneminde tamamlanmış ders
                bulunamadı.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3">Öğrenci</th>
                    <th className="px-4 py-3">Şube</th>
                    <th className="px-4 py-3">Süre</th>
                    <th className="px-4 py-3">Saatlik ücret</th>
                    <th className="px-4 py-3">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line) => (
                    <tr key={line.lessonId} className="border-b border-slate-50 dark:border-slate-800">
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{formatDate(line.lessonDate)}</td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">
                        <Link
                          href={`/panel/ogrenciler/${line.studentId}`}
                          className="hover:text-amber-600 hover:underline"
                        >
                          {line.studentName ?? "—"}
                        </Link>
                        <button
                          type="button"
                          className="block text-[11px] font-normal text-amber-700 hover:underline"
                          onClick={() => setOpenLessonId(openLessonId === line.lessonId ? null : line.lessonId)}
                        >
                          Kaynak ders
                        </button>
                        {openLessonId === line.lessonId ? (
                          <span className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 text-[11px] font-normal text-[var(--color-text-muted)]">
                            {formatDate(line.lessonDate)} · {teacherName} · {line.branchName ?? "Şube yok"} · {line.durationMinutes} dk
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{line.branchName ?? "—"}</td>
                      {editing ? (
                        <>
                          <td className="px-2 py-2">
                            <EditCell
                              label={`${line.studentName ?? "Ders"} süre (dk)`}
                              value={draft[line.lessonId]?.minutes}
                              placeholder={String(line.durationMinutes)}
                              step="1"
                              onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], minutes: v } }))}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <EditCell
                              label={`${line.studentName ?? "Ders"} saatlik ücret`}
                              value={draft[line.lessonId]?.hourlyRate}
                              placeholder={line.hourlyRate !== undefined ? String(line.hourlyRate) : "—"}
                              step="0.01"
                              onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], hourlyRate: v } }))}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <EditCell
                              label={`${line.studentName ?? "Ders"} tutar`}
                              value={draft[line.lessonId]?.amount}
                              placeholder={String(effectiveLine(line).amount)}
                              step="0.01"
                              onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], amount: v } }))}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {line.durationMinutes} dk
                        {line.original && line.original.durationMinutes !== line.durationMinutes ? (
                          <span className="block text-[11px] line-through">{line.original.durationMinutes} dk</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        {line.hourlyRate !== undefined ? `${formatMoney(line.hourlyRate)}/sa` : "—"}
                        {line.original && line.original.hourlyRate !== line.hourlyRate && line.original.hourlyRate !== undefined ? (
                          <span className="block text-[11px] line-through">{formatMoney(line.original.hourlyRate)}/sa</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {line.original ? (
                          <span className="mr-1 rounded bg-[var(--color-warning-soft)] px-1 text-[10px] font-semibold text-[var(--color-warning)]">
                            Revize
                          </span>
                        ) : null}
                        {line.issue === "missing-fee-rule" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge status="pending">Ücret kuralı eksik</Badge>
                            <span className="text-[var(--color-text-muted)]">—</span>
                          </span>
                        ) : (
                          <span className="font-medium">{formatMoney(line.amount)}</span>
                        )}
                        {line.original && line.original.amount !== line.amount ? (
                          <span className="block text-[11px] text-[var(--color-text-muted)] line-through">{formatMoney(line.original.amount)}</span>
                        ) : null}
                      </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {result.existingPayout ? null : (
              <Button
                type="button"
                onClick={handleCreatePayout}
                disabled={!result.canCreatePayout || result.lines.length === 0 || creating || !canWrite}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Hakediş oluştur
              </Button>
            )}
            {result.existingPayout?.status === "paid" ? (
              <Badge status="paid">Bu dönemin hakedişi ödendi</Badge>
            ) : null}
            {result.existingPayout && result.existingPayout.status !== "paid" ? (
              <Button type="button" variant="secondary" onClick={handlePay} disabled={paying || !canWrite}>
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Hakedişi öde
              </Button>
            ) : null}
            {createMessage ? (
              <p className={`text-sm ${createMessage.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {createMessage.text}
              </p>
            ) : null}
          </div>
        </>
      )}

      <ModalShell
        open={!!dialog}
        busy={dialogBusy}
        tone={isPaid || dialog === "unpay" ? "warning" : "default"}
        title={
          dialog === "revise"
            ? `${teacherName} — hakediş revizyonu`
            : dialog === "reset"
              ? `${teacherName} — revizyonu geri al`
              : `${teacherName} — ödendi işaretini geri al`
        }
        onClose={() => !dialogBusy && setDialog(null)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setDialog(null)} disabled={dialogBusy}>
              Vazgeç
            </button>
            <button
              type="button"
              className={modalButton.primary}
              disabled={
                dialogBusy || dialogReason.trim().length < 5 || ((isPaid || dialog === "unpay") && dialogPassword.length === 0)
              }
              onClick={() => void submitDialog()}
            >
              {dialogBusy ? "Kaydediliyor…" : "Onayla ve kaydet"}
            </button>
          </>
        }
      >
        {result.ok && existing ? (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 text-xs">
              {dialog === "revise" ? (
                <>
                  <p>
                    Mevcut toplam <strong>{formatMoney(existing.totalAmount)}</strong> → yeni toplam{" "}
                    <strong>{formatMoney(draftTotal)}</strong> (fark{" "}
                    {draftTotal - existing.totalAmount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(draftTotal - existing.totalAmount))}). {changedLineCount} satır değişiyor.
                  </p>
                  <p className="mt-1 text-[var(--color-text-muted)]">
                    Orijinal hesap korunur; &quot;Revizyonu geri al&quot; ile istediğiniz an orijinale dönebilirsiniz.
                  </p>
                </>
              ) : dialog === "reset" ? (
                <p>
                  Tüm satır düzeltmeleri silinir, toplam orijinal hesaba döner:{" "}
                  <strong>{formatMoney(existing.originalTotalAmount ?? existing.totalAmount)}</strong>.
                </p>
              ) : (
                <p>
                  Hakediş &quot;bekliyor&quot; durumuna döner; ödeme tarihi silinir. Sonra revize edip yeniden &quot;Hakedişi öde&quot; ile
                  kaydedebilirsiniz. Öğretmene yapılmış gerçek bir ödeme varsa mutabakatı ayrıca yapın.
                </p>
              )}
              {isPaid && dialog !== "unpay" ? (
                <p className="mt-1.5 font-medium" style={{ color: "var(--color-warning)" }}>
                  Bu hakediş ödenmiş durumda. Değişiklik öğretmene ödenen tutarla fark yaratır; farkı ayrıca mutabık kalın.
                </p>
              ) : null}
            </div>
            <label className="block text-xs font-medium text-[var(--color-text)]">
              Gerekçe (en az 5 karakter)
              <textarea
                value={dialogReason}
                onChange={(e) => setDialogReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              />
            </label>
            {isPaid || dialog === "unpay" ? (
              <label className="block text-xs font-medium text-[var(--color-text)]">
                Kritik işlem şifresi
                <input
                  type="password"
                  autoComplete="off"
                  value={dialogPassword}
                  onChange={(e) => setDialogPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                />
              </label>
            ) : null}
            {dialogError ? (
              <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
                {dialogError}
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}

function EditCell({
  label,
  value,
  placeholder,
  step,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder: string;
  step: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-label={label}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
    />
  );
}
