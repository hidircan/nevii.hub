"use client";

import Link from "@/components/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { actionDeletePayment, actionGetPaymentDeletionPlan } from "@/lib/actions";
import type { PaymentDeletionAction, PaymentDeletionPlan } from "@/lib/services/tools";

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n) + " ₺";
}

/**
 * 2026-10-03 — yanlışlıkla oluşturulmuş ödemeyi silme / yanlış girilen tahsilatı geri alma. Ne olacağına
 * sunucu karar verir (getPaymentDeletionPlanTool); burada açıkça gösterilir. Onay: gerekçe + kritik işlem şifresi.
 */
export function PaymentDeleteDialog({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PaymentDeletionPlan | null>(null);
  const [action, setAction] = useState<PaymentDeletionAction | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus?.();
    };
  }, [open]);

  async function openDialog() {
    setOpen(true);
    setPlan(null);
    setAction(null);
    setReason("");
    setPassword("");
    setError(null);
    const res = await actionGetPaymentDeletionPlan(paymentId);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPlan(res.data);
    setAction(res.data.actions.length === 1 ? res.data.actions[0]! : null);
  }

  async function submit() {
    if (busy || !action) return;
    setBusy(true);
    setError(null);
    const res = await actionDeletePayment({ paymentId, action, criticalPassword: password, reason });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const canSubmit = !!plan?.criticalPasswordConfigured && !!action && reason.trim().length >= 5 && password.length > 0;
  const removeText =
    plan?.removeMode === "void"
      ? `Kayıt İPTAL edilir: hiçbir borç ve tahsilat toplamında sayılmaz, listede "İptal edildi" olarak kalır. ` +
        `Bu ödemenin ${plan.followUpCaseCount} tahsilat takip kaydı ve ${plan.checkoutAttemptCount} online ödeme denemesi olduğu için ` +
        "geçmişi korumak amacıyla kalıcı silinmez."
      : "Kayıt KALICI olarak silinir (geri alınamaz); denetim kaydında kim, ne zaman, neden sildiği ve silinen tutarlar saklanır.";

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-danger-soft)]"
        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
      >
        Sil
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`payment-delete-title-${paymentId}`}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={`payment-delete-title-${paymentId}`} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} aria-hidden />
              Ödemeyi sil
            </h3>

            {!plan && !error ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Ödeme kontrol ediliyor…
              </p>
            ) : null}

            {plan ? (
              <div className="mt-3 space-y-3 text-xs">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <dt className="text-[var(--color-text-muted)]">Öğrenci</dt>
                  <dd className="font-medium">{plan.studentName}</dd>
                  <dt className="text-[var(--color-text-muted)]">Açıklama</dt>
                  <dd className="font-medium">{plan.description}</dd>
                  <dt className="text-[var(--color-text-muted)]">Tutar / ödenen</dt>
                  <dd className="font-medium">
                    {formatTL(plan.amount)} / {formatTL(plan.paidAmount)}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Tür</dt>
                  <dd className="font-medium">{plan.contractInstallment ? "Sözleşme taksidi" : "Bağımsız ödeme kaydı"}</dd>
                </dl>

                {plan.actions.length === 0 ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    {plan.blockedReason}
                  </p>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 font-semibold text-[var(--color-text)]">Ne yapılsın?</legend>
                    {plan.actions.includes("reverse_collection") ? (
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`pay-del-${paymentId}`} checked={action === "reverse_collection"} onChange={() => setAction("reverse_collection")} />
                        <span>
                          <strong>Yalnız tahsilatı geri al.</strong> Yanlış girilen {formatTL(plan.paidAmount)} tahsilat kaldırılır; ödeme
                          kaydı {plan.contractInstallment ? "(sözleşme taksidi) " : ""}borç olarak kalır ve vadesine göre bekliyor/gecikmiş görünür.
                        </span>
                      </label>
                    ) : null}
                    {plan.actions.includes("remove") ? (
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`pay-del-${paymentId}`} checked={action === "remove"} onChange={() => setAction("remove")} />
                        <span>
                          <strong>Kaydı sil (yanlışlıkla oluşturuldu).</strong> {removeText}
                        </span>
                      </label>
                    ) : null}
                    {plan.contractInstallment ? (
                      <p className="text-[var(--color-text-muted)]">Sözleşme taksidi silinmez; tutar/plan değişikliği öğrencinin Sözleşme ekranından yapılır.</p>
                    ) : null}
                  </fieldset>
                )}

                {plan.actions.length > 0 && !plan.criticalPasswordConfigured ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Kritik işlem şifresi belirlenmemiş; silme yapılamaz.{" "}
                    <Link href="/panel/ayarlar/guvenlik" className="font-semibold underline">
                      Ayarlar → Güvenlik
                    </Link>{" "}
                    ekranından belirleyin.
                  </p>
                ) : null}

                {plan.actions.length > 0 ? (
                  <>
                    <label className="block">
                      <span className="font-medium text-[var(--color-text)]">Gerekçe</span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        aria-label="Silme gerekçesi"
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                        placeholder="Örn. Aynı tahsilat iki kez girildi"
                      />
                    </label>
                    <label className="block">
                      <span className="font-medium text-[var(--color-text)]">Kritik işlem şifresi</span>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                      />
                    </label>
                  </>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                    Vazgeç
                  </Button>
                  {plan.actions.length > 0 ? (
                    <Button type="button" variant="danger" disabled={!canSubmit || busy} onClick={() => void submit()}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {action === "reverse_collection" ? "Tahsilatı geri al" : "Kaydı sil"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-xs font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
