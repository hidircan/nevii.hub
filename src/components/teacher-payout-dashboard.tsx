"use client";

/**
 * 2026-09-30 — Öğretmen hakediş ekranı (yeniden tasarım).
 * Akış: dönem seç → özet (hesaplanan · düzeltme · net · ödenen · kalan) → uyarılar → işlemler →
 * ders kalemleri (kaynak + hariç tut) → ödeme ve düzeltme defteri.
 * Kurallar sunucuda (payout-ledger.ts, teacher-payout.ts): ödenmiş kayıt yeniden yazılmaz, yanlış
 * ödeme/düzeltme ters kayıtla geri alınır, iptal yalnız ödemesiz kayıtta.
 */
import { useState } from "react";
import Link from "@/components/link";
import { Loader2 } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { tr } from "date-fns/locale";
import { ModalShell, modalButton } from "@/components/modal-shell";
import {
  actionAddTeacherPayoutAdjustment,
  actionAddTeacherPayoutPayment,
  actionCancelTeacherPayout,
  actionComputeTeacherPayout,
  actionCreateTeacherPayout,
  actionDeleteTeacherPayout,
  actionResetTeacherPayoutRevision,
  actionReverseTeacherPayoutAdjustment,
  actionReverseTeacherPayoutPayment,
  actionReviseTeacherPayout,
  actionSetLessonPayoutExclusion,
  actionSettleTeacherPayoutDrift,
  actionUpdateTeacherPayoutPaymentMethod,
  type ComputeTeacherPayoutActionResult,
} from "@/lib/actions";
import { Badge, Button, Card, Select } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

const METHOD_LABEL: Record<string, string> = { cash: "Nakit", transfer: "Havale" };
const STATUS_LABEL: Record<string, string> = { pending: "Bekliyor", partial: "Kısmi ödendi", paid: "Ödendi", cancelled: "İptal" };
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function periodFor(year: number, month: number) {
  const anchor = new Date(year, month - 1, 1);
  return { periodStart: format(startOfMonth(anchor), "yyyy-MM-dd"), periodEnd: format(endOfMonth(anchor), "yyyy-MM-dd") };
}

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;

type DialogKind =
  | { kind: "payment" }
  | { kind: "adjust" }
  | { kind: "reversePayment"; paymentId: string; amount: number }
  | { kind: "reverseAdjust"; adjustmentId: string; amount: number }
  | { kind: "cancel" }
  | { kind: "delete"; payoutId: string }
  | { kind: "settle"; drift: number }
  | { kind: "exclude"; lessonId: string; label: string; exclude: boolean }
  | { kind: "revise" }
  | { kind: "reset" };

type Draft = { minutes?: string; hourlyRate?: string; amount?: string };

export function TeacherPayoutDashboard({
  teacherId,
  teacherName,
  initialYear,
  initialMonth,
  initialResult,
  canWrite,
}: {
  teacherId: string;
  teacherName: string;
  initialYear: number;
  initialMonth: number;
  initialResult: ComputeTeacherPayoutActionResult;
  /** "Tüm kurumlar" görünümünde false. */
  canWrite: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [result, setResult] = useState(initialResult);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [createMethod, setCreateMethod] = useState<"" | "cash" | "transfer">("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [form, setForm] = useState({ reason: "", password: "", amount: "", date: "", method: "" as "" | "cash" | "transfer", note: "" });
  const [dialogError, setDialogError] = useState<string | null>(null);

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
  const existing = result.ok ? result.existingPayout : null;
  const hasPayments = (existing?.paidAmount ?? 0) > 0.005;
  const periodLabel = format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: tr });

  async function load(y = year, m = month, keepMessage = false) {
    setLoading(true);
    if (!keepMessage) setMessage(null);
    setEditing(false);
    setDraft({});
    const { periodStart, periodEnd } = periodFor(y, m);
    setResult(await actionComputeTeacherPayout({ teacherId, periodStart, periodEnd }));
    setLoading(false);
  }

  function changePeriod(y: number, m: number) {
    setYear(y);
    setMonth(m);
    void load(y, m);
  }

  async function createPayout() {
    setBusy(true);
    setMessage(null);
    const { periodStart, periodEnd } = periodFor(year, month);
    const res = await actionCreateTeacherPayout({ teacherId, periodStart, periodEnd, paymentMethod: createMethod || undefined });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: `Hakediş kaydı oluşturuldu: ${formatMoney(res.payout.totalAmount)}.` } : { ok: false, text: res.message });
    if (res.ok) await load(year, month, true);
  }

  async function updateMethod(method: "cash" | "transfer") {
    if (!existing) return;
    setBusy(true);
    const res = await actionUpdateTeacherPayoutPaymentMethod({ payoutId: existing.id, method });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "Varsayılan ödeme yöntemi güncellendi." } : { ok: false, text: res.message });
    if (res.ok) await load(year, month, true);
  }

  function open(d: DialogKind) {
    setDialog(d);
    setDialogError(null);
    setForm({
      reason: "",
      password: "",
      amount: d.kind === "payment" && existing ? String(Math.max(0, existing.balance)) : "",
      date: format(new Date(), "yyyy-MM-dd"),
      method: (existing?.method as "cash" | "transfer" | undefined) ?? "",
      note: "",
    });
  }

  // ─── Revizyon taslağı (yalnız ödemesiz kayıtta) ───
  function effectiveLine(line: { lessonId: string; durationMinutes: number; hourlyRate?: number; amount: number }) {
    const d = draft[line.lessonId];
    const minutes = d?.minutes ? Number(d.minutes) : line.durationMinutes;
    const rate = d?.hourlyRate ? Number(d.hourlyRate) : line.hourlyRate;
    const touched = Boolean(d?.minutes || d?.hourlyRate);
    const amount = d?.amount ? Number(d.amount) : touched && rate !== undefined ? Math.round(((minutes * rate) / 60) * 100) / 100 : line.amount;
    return { minutes, rate, amount };
  }
  function buildOverrides() {
    if (!result.ok) return {};
    const out: Record<string, { minutes?: number; hourlyRate?: number; amount?: number }> = {};
    for (const line of result.lines) {
      const saved = existing?.lineOverrides[line.lessonId] ?? {};
      const d = draft[line.lessonId] ?? {};
      const merged = {
        minutes: d.minutes ? Number(d.minutes) : saved.minutes,
        hourlyRate: d.hourlyRate ? Number(d.hourlyRate) : saved.hourlyRate,
        amount: d.amount ? Number(d.amount) : d.minutes || d.hourlyRate ? undefined : saved.amount,
      };
      if (merged.minutes !== undefined || merged.hourlyRate !== undefined || merged.amount !== undefined) out[line.lessonId] = merged;
    }
    return out;
  }
  const draftTotal = result.ok ? Math.round(result.lines.reduce((s, l) => s + effectiveLine(l).amount, 0) * 100) / 100 : 0;
  const changedLines = Object.values(draft).filter((d) => d.minutes || d.hourlyRate || d.amount).length;

  const needsPassword =
    dialog !== null &&
    (dialog.kind === "reversePayment" ||
      dialog.kind === "delete" ||
      (hasPayments && (dialog.kind === "adjust" || dialog.kind === "reverseAdjust" || dialog.kind === "settle")));
  const needsReason = dialog !== null && dialog.kind !== "payment";

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    setDialogError(null);
    const reason = form.reason.trim();
    const password = form.password || undefined;
    const pid = existing?.id ?? "";
    let res: { ok: boolean; message?: string };
    let okText = "";
    switch (dialog.kind) {
      case "payment": {
        const amount = form.amount.trim() ? Number(form.amount.replace(",", ".")) : undefined;
        res = await actionAddTeacherPayoutPayment({ payoutId: pid, amount, paidAt: form.date || undefined, method: form.method || undefined, note: form.note || undefined });
        okText = "Ödeme kaydedildi.";
        break;
      }
      case "adjust":
        res = await actionAddTeacherPayoutAdjustment({ payoutId: pid, amount: Number(form.amount.replace(",", ".")), reason, criticalPassword: password });
        okText = "Düzeltme kaydı eklendi.";
        break;
      case "reversePayment":
        res = await actionReverseTeacherPayoutPayment({ payoutId: pid, paymentId: dialog.paymentId, reason, criticalPassword: form.password });
        okText = "Ödeme ters kayıtla geri alındı.";
        break;
      case "reverseAdjust":
        res = await actionReverseTeacherPayoutAdjustment({ payoutId: pid, adjustmentId: dialog.adjustmentId, reason, criticalPassword: password });
        okText = "Düzeltme geri alındı.";
        break;
      case "cancel":
        res = await actionCancelTeacherPayout({ payoutId: pid, reason });
        okText = "Hakediş kaydı iptal edildi. Dönemi güncel hesapla yeniden oluşturabilirsiniz.";
        break;
      case "delete":
        res = await actionDeleteTeacherPayout({ payoutId: dialog.payoutId, reason, criticalPassword: form.password });
        okText = "İptal edilmiş kayıt kalıcı olarak silindi.";
        break;
      case "settle":
        res = await actionSettleTeacherPayoutDrift({ payoutId: pid, reason, criticalPassword: password });
        okText = existing?.status === "pending" ? "Kayıt güncel hesapla yeniden hesaplandı." : "Fark düzeltme kaydı olarak eklendi.";
        break;
      case "exclude": {
        const r = await actionSetLessonPayoutExclusion({ lessonId: dialog.lessonId, exclude: dialog.exclude, reason });
        res = r;
        if (r.ok) {
          okText = `${dialog.exclude ? "Ders hakedişten hariç tutuldu" : "Ders tekrar hakedişe dahil edildi"}.${
            r.data.recalculated ? " Bekleyen kayıt yeniden hesaplandı." : ""
          }${r.data.needsAdjustment.length ? " Ödemeli kayıtta fark oluştu — aşağıdan düzeltme kaydıyla kapatın." : ""}`;
        }
        break;
      }
      case "revise": {
        const r = await actionReviseTeacherPayout({ payoutId: pid, reason, criticalPassword: password, lineOverrides: buildOverrides() });
        res = r.ok ? { ok: true } : r;
        okText = "Döküm revize edildi.";
        break;
      }
      case "reset": {
        const r = await actionResetTeacherPayoutRevision({ payoutId: pid, reason, criticalPassword: password });
        res = r.ok ? { ok: true } : r;
        okText = "Satır düzeltmeleri geri alındı.";
        break;
      }
    }
    setBusy(false);
    if (!res.ok) {
      setDialogError(res.message ?? "İşlem uygulanamadı.");
      return;
    }
    setDialog(null);
    setMessage({ ok: true, text: okText });
    await load(year, month, true);
  }

  const dialogTitle: Record<DialogKind["kind"], string> = {
    payment: "Ödeme ekle",
    adjust: "Düzeltme kaydı ekle",
    reversePayment: "Ödemeyi ters kayıtla geri al",
    reverseAdjust: "Düzeltmeyi geri al",
    cancel: "Hakediş kaydını iptal et",
    delete: "İptal edilmiş kaydı kalıcı sil",
    settle: existing?.status === "pending" ? "Güncel hesaba göre yeniden hesapla" : "Farkı düzeltme kaydı olarak ekle",
    exclude: dialog?.kind === "exclude" && !dialog.exclude ? "Dersi tekrar hakedişe dahil et" : "Dersi hakedişten hariç tut",
    revise: "Dökümü revize et",
    reset: "Satır düzeltmelerini geri al",
  };

  return (
    <div className="space-y-4">
      {!canWrite ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm font-medium text-amber-800">
          &quot;Tüm kurumlar&quot; görünümündesiniz — hakediş işlemleri için üstten tek bir kurum seçin.
        </p>
      ) : null}

      {/* Dönem */}
      <Card className="!py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onChange={(e) => changePeriod(year, Number(e.target.value))} className="w-auto" aria-label="Ay">
            {MONTHS.map((l, i) => (
              <option key={l} value={i + 1}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={year} onChange={(e) => changePeriod(Number(e.target.value), month)} className="w-auto" aria-label="Yıl">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" aria-label="Yükleniyor" /> : null}
          <Link href={`/panel/ogretmenler/${teacherId}/odemeler`} className="ml-auto text-sm font-medium text-amber-700 hover:underline">
            Ödeme geçmişi →
          </Link>
        </div>
      </Card>

      {!result.ok ? (
        <Card className="border-rose-200 bg-rose-50/60">
          <p className="text-sm text-rose-700">{result.message}</p>
        </Card>
      ) : (
        <>
          {/* Özet */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {teacherName} · {periodLabel}
              </p>
              {existing ? (
                <Badge status={existing.status}>{STATUS_LABEL[existing.status] ?? existing.status}</Badge>
              ) : (
                <Badge status="pending">Canlı hesap · kayıt yok</Badge>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric label={`Ders dökümü (${result.totalLessons} ders · ${result.totalMinutes} dk)`} value={formatMoney(existing?.totalAmount ?? result.totalAmount)} />
              <Metric label="Düzeltmeler" value={existing ? signed(existing.netAmount - existing.totalAmount) : "—"} />
              <Metric label="Net hakediş" value={formatMoney(existing?.netAmount ?? result.totalAmount)} strong />
              <Metric label="Ödenen" value={formatMoney(existing?.paidAmount ?? 0)} />
              <Metric
                label={(existing?.balance ?? 0) < 0 ? "Fazla ödeme" : "Kalan"}
                value={formatMoney(Math.abs(existing?.balance ?? result.totalAmount))}
                tone={(existing?.balance ?? 0) < 0 ? "danger" : "warning"}
              />
            </dl>
            <PolicyLine byMonth={result.pricingByMonth} />
          </Card>

          {/* Uyarılar */}
          {existing && Math.abs(existing.drift) >= 0.01 ? (
            <Alert tone="warning">
              Kayıt, güncel hesaptan <strong>{signed(existing.drift)}</strong> farklı (kayıttan sonra politika, ücret kuralı, ders
              veya hariç tutma değişti).{" "}
              {existing.status === "pending"
                ? "Ödeme yapılmadığı için kayıt güncel hesapla yenilenebilir."
                : "Ödeme yapıldığı için kayıt yeniden yazılmaz; fark düzeltme kaydıyla kapatılır."}
              {canWrite ? (
                <button type="button" className="ml-2 font-semibold underline" onClick={() => open({ kind: "settle", drift: existing.drift })}>
                  {existing.status === "pending" ? "Yeniden hesapla" : "Farkı düzeltme olarak ekle"}
                </button>
              ) : null}
            </Alert>
          ) : null}
          {!existing && result.missingFeeRuleLessonIds.length > 0 ? (
            <Alert tone="danger">
              <strong>{result.missingFeeRuleLessonIds.length}</strong> derste geçerli ücret kuralı yok; kayıt oluşturulamaz. Kuralı{" "}
              <Link href="/panel/ucret-kurallari" className="font-semibold underline">
                Ücret Kuralları
              </Link>{" "}
              ekranında tanımlayın ya da hatalı dersi aşağıdan &quot;Hariç tut&quot; ile hesaptan çıkarın.
            </Alert>
          ) : null}
          {result.unsupportedDurationLessonIds.length > 0 ? (
            <Alert tone="info">
              <strong>{result.unsupportedDurationLessonIds.length}</strong> dersin süresi 30/40/50 dk değil; tutarı en yakın üst
              tarifeden orantılı hesaplandı (&quot;Süre istisnası&quot; rozeti). Farklı tutar gerekiyorsa kayıttan sonra
              &quot;Dökümü revize et&quot; ile düzeltin.
            </Alert>
          ) : null}
          {result.cancelledPayout && !existing ? (
            <Alert tone="info">
              Bu dönemin <strong>iptal edilmiş</strong> bir kaydı var
              {result.cancelledPayout.cancelledAt ? ` (${formatDate(result.cancelledPayout.cancelledAt)})` : ""}
              {result.cancelledPayout.cancelReason ? ` — ${result.cancelledPayout.cancelReason}` : ""}. Yeniden oluşturduğunuzda güncel
              hesapla aynı kayıt yenilenir.
              {canWrite && !result.cancelledPayout.hadPayments ? (
                <button type="button" className="ml-2 font-semibold underline" onClick={() => open({ kind: "delete", payoutId: result.cancelledPayout!.id })}>
                  Kalıcı sil
                </button>
              ) : null}
            </Alert>
          ) : null}

          {/* İşlemler */}
          {canWrite ? (
            <Card className="!py-3">
              <div className="flex flex-wrap items-center gap-2">
                {!existing ? (
                  <>
                    <Select value={createMethod} onChange={(e) => setCreateMethod(e.target.value as "" | "cash" | "transfer")} className="w-auto !py-1 text-xs" aria-label="Ödeme yöntemi">
                      <option value="">Yöntem: varsayılan</option>
                      <option value="cash">Nakit</option>
                      <option value="transfer">Havale</option>
                    </Select>
                    <Button onClick={() => void createPayout()} disabled={busy || !result.canCreatePayout || result.lines.length === 0}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Hakediş kaydı oluştur
                    </Button>
                    <span className="text-xs text-[var(--color-text-muted)]">Kayıt, ders kalemlerini ve politikayı bu anki haliyle dondurur.</span>
                  </>
                ) : editing ? (
                  <>
                    <span className="text-xs text-[var(--color-text-muted)]">Süre, saatlik ücret veya tutarı düzenleyin.</span>
                    <span className="ml-auto text-xs font-semibold">Yeni döküm: {formatMoney(draftTotal)}</span>
                    <Button variant="secondary" onClick={() => { setEditing(false); setDraft({}); }}>
                      Vazgeç
                    </Button>
                    <Button onClick={() => open({ kind: "revise" })} disabled={changedLines === 0}>
                      Revizyonu kaydet ({changedLines})
                    </Button>
                  </>
                ) : (
                  <>
                    {existing.balance > 0.005 ? <Button onClick={() => open({ kind: "payment" })}>Ödeme ekle</Button> : null}
                    <Button variant="secondary" onClick={() => open({ kind: "adjust" })}>
                      Düzeltme ekle (+/−)
                    </Button>
                    {!hasPayments ? (
                      <Button variant="secondary" onClick={() => setEditing(true)}>
                        Dökümü revize et
                      </Button>
                    ) : null}
                    {!hasPayments && existing.originalTotalAmount !== undefined ? (
                      <Button variant="secondary" onClick={() => open({ kind: "reset" })}>
                        Revizyonu geri al
                      </Button>
                    ) : null}
                    {!hasPayments ? (
                      <Button variant="secondary" onClick={() => open({ kind: "cancel" })}>
                        Kaydı iptal et
                      </Button>
                    ) : null}
                    <label className="ml-auto text-xs text-[var(--color-text-muted)]">
                      Varsayılan yöntem:
                      <Select
                        value={existing.method ?? ""}
                        onChange={(e) => e.target.value && void updateMethod(e.target.value as "cash" | "transfer")}
                        className="ml-1 w-auto !py-1 text-xs"
                        disabled={busy}
                      >
                        <option value="">—</option>
                        <option value="cash">Nakit</option>
                        <option value="transfer">Havale</option>
                      </Select>
                    </label>
                  </>
                )}
              </div>
              {hasPayments && existing ? (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Bu kayda ödeme yapıldı: döküm yeniden yazılmaz ve kayıt iptal edilmez. Farklar düzeltme kaydıyla, hatalı ödeme ters
                  kayıtla yönetilir.
                </p>
              ) : null}
            </Card>
          ) : null}
          {message ? (
            <p role="status" className={`text-sm ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {message.text}
            </p>
          ) : null}

          {/* Ders kalemleri */}
          <Card className="overflow-x-auto p-0">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
              <h3 className="text-sm font-semibold">Ders kalemleri</h3>
              <span className="text-xs text-[var(--color-text-muted)]">{existing?.hasSnapshot ? "Kayıttaki (donmuş) döküm" : "Canlı hesap"}</span>
            </div>
            {result.lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">{periodLabel} döneminde hakedişe konu ders yok.</p>
            ) : (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2">Öğrenci · kaynak</th>
                    <th className="px-3 py-2">Süre</th>
                    <th className="px-3 py-2">Birim</th>
                    <th className="px-3 py-2">Tutar</th>
                    <th className="px-3 py-2 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line) => {
                    const src = result.lineSources[line.lessonId];
                    return (
                      <tr key={line.lessonId} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">{formatDate(line.lessonDate)}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{line.studentName ?? "—"}</span>
                          <span className="block text-[11px] text-[var(--color-text-muted)]">
                            {line.branchName ?? "Şube yok"}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {src?.state === "missing" ? <Tag tone="danger">Programda yok — yalnız hakediş kalemi</Tag> : null}
                            {src?.state === "not_processed" ? <Tag tone="warning">Ders artık &quot;İşlendi&quot; değil</Tag> : null}
                            {src?.demo ? <Tag tone="warning">Test/demo verisi</Tag> : null}
                            {line.issue === "duration-exception" ? <Tag tone="info">Süre istisnası (orantılı)</Tag> : null}
                            {line.original ? <Tag tone="info">Revize</Tag> : null}
                            {src?.programHref ? (
                              <Link href={src.programHref} className="text-[11px] font-medium text-amber-700 hover:underline">
                                Programda aç →
                              </Link>
                            ) : null}
                          </span>
                        </td>
                        {editing ? (
                          <>
                            <td className="px-2 py-2">
                              <EditCell label="Süre (dk)" value={draft[line.lessonId]?.minutes} placeholder={String(line.durationMinutes)} onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], minutes: v } }))} />
                            </td>
                            <td className="px-2 py-2">
                              <EditCell label="Saatlik ücret" value={draft[line.lessonId]?.hourlyRate} placeholder={line.hourlyRate !== undefined ? String(line.hourlyRate) : "—"} onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], hourlyRate: v } }))} />
                            </td>
                            <td className="px-2 py-2">
                              <EditCell label="Tutar" value={draft[line.lessonId]?.amount} placeholder={String(effectiveLine(line).amount)} onChange={(v) => setDraft((d) => ({ ...d, [line.lessonId]: { ...d[line.lessonId], amount: v } }))} />
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">
                              {line.durationMinutes} dk
                              {line.original && line.original.durationMinutes !== line.durationMinutes ? (
                                <span className="block text-[11px] line-through">{line.original.durationMinutes} dk</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">
                              {line.hourlyRate !== undefined ? `${formatMoney(line.hourlyRate)}/sa` : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {line.issue === "missing-fee-rule" ? (
                                <Tag tone="danger">Ücret kuralı eksik</Tag>
                              ) : (
                                <span className="font-medium">{formatMoney(line.amount)}</span>
                              )}
                              {line.original && line.original.amount !== line.amount ? (
                                <span className="block text-[11px] text-[var(--color-text-muted)] line-through">{formatMoney(line.original.amount)}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {canWrite ? (
                                <button
                                  type="button"
                                  className="text-xs font-medium text-rose-700 hover:underline"
                                  onClick={() => open({ kind: "exclude", lessonId: line.lessonId, label: `${formatDate(line.lessonDate)} ${line.studentName ?? ""}`, exclude: true })}
                                >
                                  Hariç tut
                                </button>
                              ) : null}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {(result.excludedLessons ?? []).length > 0 ? (
              <div className="border-t border-[var(--color-border)] px-4 py-3">
                <p className="mb-1 text-xs font-semibold text-[var(--color-text)]">Hakedişten hariç tutulan dersler (ders kaydı değişmedi)</p>
                <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
                  {result.excludedLessons!.map((x) => (
                    <li key={x.lessonId}>
                      {formatDate(x.lessonDate)} · {x.studentName ?? "—"} — {x.reason}
                      {canWrite ? (
                        <button
                          type="button"
                          className="ml-2 font-medium text-amber-700 hover:underline"
                          onClick={() => open({ kind: "exclude", lessonId: x.lessonId, label: `${formatDate(x.lessonDate)} ${x.studentName ?? ""}`, exclude: false })}
                        >
                          Tekrar dahil et
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {/* Defter */}
          {existing ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-0">
                <h3 className="border-b border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold">Ödemeler</h3>
                {existing.payments.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[var(--color-text-muted)]">Henüz ödeme yok.</p>
                ) : (
                  <ul className="divide-y divide-[var(--color-border)] text-sm">
                    {existing.payments.map((x) => (
                      <li key={x.id} className={`flex flex-wrap items-start gap-2 px-4 py-2.5 ${x.reversedAt ? "opacity-60" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium ${x.reversedAt ? "line-through" : ""}`}>
                            {formatMoney(x.amount)} · {formatDate(x.paidAt)}
                            {x.method ? ` · ${METHOD_LABEL[x.method] ?? x.method}` : ""}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {x.note ? `${x.note} · ` : ""}
                            {x.byName ?? (x.legacy ? "Eski kayıt" : "")}
                            {x.reversedAt ? ` · Ters kayıt ${formatDate(x.reversedAt)}${x.reversedByName ? ` (${x.reversedByName})` : ""}: ${x.reverseReason ?? ""}` : ""}
                          </p>
                        </div>
                        {canWrite && !x.reversedAt ? (
                          <button type="button" className="text-xs font-medium text-rose-700 hover:underline" onClick={() => open({ kind: "reversePayment", paymentId: x.id, amount: x.amount })}>
                            Ters kayıt
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-0">
                <h3 className="border-b border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold">Düzeltmeler</h3>
                {existing.adjustments.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[var(--color-text-muted)]">Düzeltme kaydı yok.</p>
                ) : (
                  <ul className="divide-y divide-[var(--color-border)] text-sm">
                    {existing.adjustments.map((a) => (
                      <li key={a.id} className={`flex flex-wrap items-start gap-2 px-4 py-2.5 ${a.reversedAt ? "opacity-60" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium ${a.reversedAt ? "line-through" : ""}`}>
                            {signed(a.amount)} · {a.kind === "recalc" ? "Hesap farkı" : "Elle düzeltme"}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {a.reason} · {formatDate(a.createdAt)}
                            {a.byName ? ` · ${a.byName}` : ""}
                            {a.reversedAt ? ` · Geri alındı: ${a.reverseReason ?? ""}` : ""}
                          </p>
                        </div>
                        {canWrite && !a.reversedAt ? (
                          <button type="button" className="text-xs font-medium text-rose-700 hover:underline" onClick={() => open({ kind: "reverseAdjust", adjustmentId: a.id, amount: a.amount })}>
                            Geri al
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : null}
        </>
      )}

      <ModalShell
        open={!!dialog}
        busy={busy}
        tone={dialog && ["reversePayment", "delete", "cancel"].includes(dialog.kind) ? "warning" : "default"}
        title={dialog ? `${teacherName} — ${dialogTitle[dialog.kind]}` : ""}
        onClose={() => !busy && setDialog(null)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setDialog(null)} disabled={busy}>
              Vazgeç
            </button>
            <button
              type="button"
              className={dialog?.kind === "delete" ? modalButton.danger : modalButton.primary}
              disabled={busy || (needsReason && form.reason.trim().length < 5) || (needsPassword && !form.password) || (dialog?.kind === "adjust" && !Number(form.amount.replace(",", ".")))}
              onClick={() => void submit()}
            >
              {busy ? "Kaydediliyor…" : "Onayla"}
            </button>
          </>
        }
      >
        {dialog && result.ok ? (
          <div className="space-y-3 text-sm">
            <DialogExplain dialog={dialog} existing={existing} draftTotal={draftTotal} changedLines={changedLines} />
            {dialog.kind === "payment" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Tutar (kalan ${formatMoney(existing?.balance ?? 0)})`}>
                  <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Ödeme tarihi">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Yöntem">
                  <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as "" | "cash" | "transfer" })} className={inputCls}>
                    <option value="">—</option>
                    <option value="cash">Nakit</option>
                    <option value="transfer">Havale</option>
                  </select>
                </Field>
                <Field label="Not (opsiyonel)">
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} maxLength={300} />
                </Field>
              </div>
            ) : null}
            {dialog.kind === "adjust" ? (
              <Field label="Tutar (ek ödeme için +, kesinti için −; örn. -250)">
                <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
              </Field>
            ) : null}
            {needsReason ? (
              <Field label="Gerekçe (en az 5 karakter)">
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} maxLength={500} className={inputCls} />
              </Field>
            ) : null}
            {needsPassword ? (
              <Field label="Kritik işlem şifresi">
                <input type="password" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
              </Field>
            ) : null}
            {dialogError ? (
              <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
                {dialogError}
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-[var(--color-text)]">
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? "var(--color-danger)" : tone === "warning" ? "var(--color-warning)" : "var(--color-text)";
  return (
    <div>
      <dt className="text-[11px] text-[var(--color-text-muted)]">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? "text-xl font-semibold" : "text-base font-medium"}`} style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

function Tag({ tone, children }: { tone: "danger" | "warning" | "info"; children: React.ReactNode }) {
  const style =
    tone === "danger"
      ? { background: "var(--color-danger-soft)", color: "var(--color-danger)" }
      : tone === "warning"
        ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
        : { background: "var(--color-surface-muted)", color: "var(--color-text-muted)" };
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={style}>
      {children}
    </span>
  );
}

function Alert({ tone, children }: { tone: "danger" | "warning" | "info"; children: React.ReactNode }) {
  const border = tone === "danger" ? "var(--color-danger)" : tone === "warning" ? "var(--color-warning)" : "var(--color-border)";
  return (
    <div role={tone === "info" ? "note" : "alert"} className="rounded-xl border bg-[var(--color-surface)] px-4 py-3 text-sm" style={{ borderColor: border }}>
      {children}
    </div>
  );
}

function PolicyLine({ byMonth }: { byMonth: Record<string, { policy: string; rate30?: number; rate40?: number; rate50?: number }> }) {
  const entries = Object.entries(byMonth ?? {});
  if (entries.length === 0) return null;
  return (
    <p className="mt-3 text-xs text-[var(--color-text-muted)]">
      Politika:{" "}
      {entries.map(([m, t], i) => (
        <span key={m}>
          {i > 0 ? " · " : ""}
          {entries.length > 1 ? `${m}: ` : ""}
          <strong className="text-[var(--color-text)]">
            {t.policy === "fixed_duration"
              ? `Süreye göre sabit (30 dk ${formatMoney(t.rate30 ?? 0)} · 40 dk ${formatMoney(t.rate40 ?? 0)} · 50 dk ${formatMoney(t.rate50 ?? 0)})`
              : "Öğretmen bazlı dakika ücreti"}
          </strong>
        </span>
      ))}
      {" — "}
      <Link href="/panel/hakedisler" className="underline">
        Hakedişler ekranından değiştir
      </Link>
    </p>
  );
}

function DialogExplain({
  dialog,
  existing,
  draftTotal,
  changedLines,
}: {
  dialog: DialogKind;
  existing: Extract<ComputeTeacherPayoutActionResult, { ok: true }>["existingPayout"];
  draftTotal: number;
  changedLines: number;
}) {
  const box = (text: React.ReactNode) => <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 text-xs">{text}</div>;
  switch (dialog.kind) {
    case "payment":
      return box("Ödeme defterine yeni bir satır eklenir. Kalan bakiyeyi aşan tutar kabul edilmez (çift ödeme koruması); kısmi ödeme yapabilirsiniz.");
    case "adjust":
      return box("Döküm değişmez; net hakedişe gerekçeli bir +/− satır eklenir. Satır silinmez, gerekirse geri alınır (iz kalır).");
    case "reversePayment":
      return box(<>Bu ödeme ({formatMoney(dialog.amount)}) silinmez; ters kayıtla toplamdan çıkar ve kalan bakiye artar. Öğretmene gerçekten ödeme yapıldıysa bunu kullanmayın — farkı düzeltme kaydıyla yönetin.</>);
    case "reverseAdjust":
      return box(<>Düzeltme ({signed(dialog.amount)}) geri alınır; satır iz olarak kalır.</>);
    case "cancel":
      return box("Kayıt iptal edilir: toplamlardan çıkar, öğretmen portalında görünmez, dönemi yeniden oluşturabilirsiniz. Kayıt ve iptal gerekçesi izde kalır.");
    case "delete":
      return box("İptal edilmiş ve hiç ödemesi olmamış kayıt kalıcı silinir. Silme, silen kişi ve gerekçe denetim kaydında kalır.");
    case "settle":
      return box(
        existing?.status === "pending" ? (
          <>Kayıt güncel hesapla yeniden dondurulur (fark {signed(dialog.drift)}). Elle yapılan satır düzeltmeleri korunur.</>
        ) : (
          <>Ödenmiş tutar değişmez; {signed(dialog.drift)} tutarında &quot;hesap farkı&quot; düzeltme kaydı eklenir.</>
        )
      );
    case "exclude":
      return box(
        dialog.exclude ? (
          <>
            <strong>{dialog.label}</strong> hakedişte sayılmaz. Ders, takvim, yoklama ve öğrenci ödemesi DEĞİŞMEZ. Ders gerçekten
            hatalıysa &quot;Programda aç&quot; ile dersin kendisini düzeltin veya iptal edin. Bekleyen kayıt kendiliğinden yeniden
            hesaplanır; ödemeli kayıtta fark düzeltme önerisi çıkar.
          </>
        ) : (
          <>
            <strong>{dialog.label}</strong> tekrar hakedişe dahil edilir.
          </>
        )
      );
    case "revise":
      return box(
        <>
          Döküm {formatMoney(existing?.totalAmount ?? 0)} → {formatMoney(draftTotal)} ({changedLines} satır). Orijinal hesap korunur,
          &quot;Revizyonu geri al&quot; ile dönülebilir.
        </>
      );
    case "reset":
      return box(<>Satır düzeltmeleri silinir; döküm orijinal hesaba döner ({formatMoney(existing?.originalTotalAmount ?? existing?.totalAmount ?? 0)}).</>);
  }
}

function EditCell({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      aria-label={label}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums"
    />
  );
}
