"use client";

import Link from "@/components/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

export type CriticalDeleteImpact = {
  /** Etki özeti satırları (etiket, değer). */
  lines: [string, ReactNode][];
  /** false → silme yapılamaz; `blockReason` gösterilir, yalnız Vazgeç kalır. */
  allowed: boolean;
  blockReason?: string;
  criticalPasswordConfigured: boolean;
};

/**
 * 9. tur — paket ve iş silmede ortak, iki adımlı onay (öğrenci silmeyle aynı desen).
 * 1: etki özeti + silmenin ne anlama geldiği. 2: gerekçe + ad teyidi + kurum sahibinin
 * belirlediği kritik işlem şifresi. Şifre istemcide karşılaştırılmaz/saklanmaz; yalnız
 * sunucuya gönderilir ve gönderimden sonra alan temizlenir. Asıl kural/yetki/audit sunucuda.
 */
export function CriticalDeleteDialog({
  triggerLabel,
  title,
  meaning,
  confirmationName,
  confirmationLabel = "Onay için adı aynen yazın",
  submitLabel,
  loadImpact,
  onSubmit,
}: {
  triggerLabel: string;
  title: string;
  /** Silmenin sonucu — kullanıcıya açık cümleyle. */
  meaning: string;
  /** Kullanıcının aynen yazması gereken ad (veya "SİL"). */
  confirmationName: string;
  /** Teyit alanının etiketi; verilmezse "Onay için adı aynen yazın". */
  confirmationLabel?: string;
  submitLabel: string;
  loadImpact: () => Promise<{ ok: true; data: CriticalDeleteImpact } | { ok: false; message: string }>;
  onSubmit: (input: { criticalPassword: string; reason: string; confirmation: string }) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [impact, setImpact] = useState<CriticalDeleteImpact | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 10. tur iş #5 — ModalShell ile AYNI geçiş-odak deseni (bkz. oradaki kök neden notu).
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
    setStep(1);
    setReason("");
    setConfirmation("");
    setPassword("");
    setError(null);
    setImpact(null);
    const res = await loadImpact();
    if (res.ok) setImpact(res.data);
    else setError(res.message);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit({ criticalPassword: password, reason, confirmation });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
  }

  const canSubmit = reason.trim().length >= 5 && confirmation.trim().length > 0 && password.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-danger)] px-2.5 py-1 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]"
      >
        {triggerLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
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
            aria-labelledby={titleId}
            className="w-full max-w-lg rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" aria-hidden />
              {title} ({step}/2)
            </h3>

            {!impact && !error ? (
              <p className="mt-3 flex items-center gap-2 text-[var(--color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Bağlı kayıtlar denetleniyor…
              </p>
            ) : null}

            {impact && step === 1 ? (
              <div className="mt-3 space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  {impact.lines.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-[var(--color-text-muted)]">{label}</dt>
                      <dd className="font-medium text-[var(--color-text)]">{value}</dd>
                    </div>
                  ))}
                </dl>
                {impact.allowed ? (
                  <p className="text-[var(--color-text)]">{meaning}</p>
                ) : (
                  <p className="rounded-md border border-[var(--color-warning)] px-3 py-2 text-[var(--color-warning)]" role="status">
                    {impact.blockReason}
                  </p>
                )}
                {impact.allowed && !impact.criticalPasswordConfigured ? (
                  <p className="rounded-md border border-[var(--color-warning)] px-3 py-2 text-[var(--color-warning)]">
                    Kritik işlem şifresi belirlenmemiş; silme yapılamaz. Kurum sahibi{" "}
                    <Link href="/panel/ayarlar/guvenlik" className="font-semibold underline">
                      Ayarlar → Güvenlik
                    </Link>{" "}
                    ekranından belirlemeli.
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    {impact.allowed ? "Vazgeç" : "Kapat"}
                  </Button>
                  {impact.allowed ? (
                    <Button type="button" variant="danger" disabled={!impact.criticalPasswordConfigured} onClick={() => setStep(2)}>
                      Devam et
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {impact && step === 2 ? (
              <div className="mt-3 space-y-3">
                <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 font-medium text-[var(--color-danger)]">{meaning}</p>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">Silme gerekçesi (en az 5 karakter)</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    aria-label="Silme gerekçesi"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                    placeholder="Örn. Yanlışlıkla iki kez oluşturuldu"
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">
                    {confirmationLabel}: <strong>{confirmationName}</strong>
                  </span>
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
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
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(1)}>
                    Geri
                  </Button>
                  <Button type="button" variant="danger" disabled={!canSubmit || busy} onClick={() => void submit()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {submitLabel}
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 font-medium text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
