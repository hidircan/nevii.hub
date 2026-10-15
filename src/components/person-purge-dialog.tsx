"use client";

import Link from "@/components/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { actionGetPersonPurgePreview, actionPurgePerson } from "@/lib/actions";
import type { PersonPurgePreview } from "@/lib/services/tools";
import type { PurgeBucket, PurgeFinancialSummary, PurgeMode } from "@/lib/person-purge";
import { formatMoney } from "@/lib/utils";

/**
 * 2026-10-15 (owner) — öğrenci/öğretmen KALICI SİLME. Silinenler / Kaldırılanlar'dan açılır.
 * Sunucudaki gerçek kayıtlardan önizleme yüklenmeden onay açılmaz; kişi adı yazılır, "geri alınamaz" kutusu
 * işaretlenir, kritik işlem şifresi girilir. Sunucu aynı planı kilit altında yeniden kurar: önizlemeden sonra
 * kayıtlar değiştiyse hiçbir şey silinmez, burada önizleme yenilenir ve onay sıfırlanır.
 * Kurum sahibine ayrıca "Yanlış oluşturuldu — her şeyi sil" modu açılır (finansal kayıtlar dahil); mod değişince
 * önizleme yeniden yüklenir ve tüm onaylar sıfırlanır.
 */
export function PersonPurgeDialog({
  kind,
  id,
  name,
  compact = false,
}: {
  kind: "student" | "teacher";
  id: string;
  name: string;
  /** Liste satırında küçük buton. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PersonPurgePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [mode, setMode] = useState<PurgeMode>("standard");
  const [canWipe, setCanWipe] = useState(false);
  const [financialAck, setFinancialAck] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changedNotice, setChangedNotice] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
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

  async function loadPreview(m: PurgeMode = mode): Promise<PersonPurgePreview | null> {
    setLoading(true);
    const res = await actionGetPersonPurgePreview(kind, id, m);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return null;
    }
    setPreview(res.data);
    setCanWipe(res.data.canWipe);
    return res.data;
  }

  function resetConfirmations() {
    setConfirmationName("");
    setUnderstood(false);
    setFinancialAck(false);
    setPassword("");
  }

  async function switchMode(next: PurgeMode) {
    if (next === mode || busy) return;
    setMode(next);
    setPreview(null);
    setError(null);
    setChangedNotice(false);
    resetConfirmations();
    await loadPreview(next);
  }

  async function openDialog() {
    setOpen(true);
    setPreview(null);
    setReason("");
    resetConfirmations();
    setMode("standard");
    setError(null);
    setChangedNotice(false);
    setWarnings([]);
    await loadPreview("standard");
  }

  async function submit() {
    if (busy || !preview) return;
    setBusy(true);
    setError(null);
    const res = await actionPurgePerson({
      kind,
      id,
      expectedFingerprint: preview.fingerprint,
      confirmationName,
      criticalPassword: password,
      reason,
      mode: preview.mode,
      financialAcknowledged: preview.mode === "wipe" ? financialAck : undefined,
    });
    setPassword("");
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      // Kayıtlar değiştiyse yeni önizleme + yeniden onay (ad ve onay kutusu sıfırlanır).
      const before = preview.fingerprint;
      const fresh = await loadPreview();
      if (fresh && fresh.fingerprint !== before) {
        setChangedNotice(true);
        setConfirmationName("");
        setUnderstood(false);
        setFinancialAck(false);
      }
      return;
    }
    setBusy(false);
    if (res.data.warnings.length) {
      setWarnings(res.data.warnings);
      return;
    }
    finish();
  }

  function finish() {
    setOpen(false);
    router.push(kind === "student" ? "/panel/ogrenciler?silinenler=1&status=all" : "/panel/ogretmenler");
    router.refresh();
  }

  const who = kind === "student" ? "öğrenci" : "öğretmen";
  const wipe = preview?.mode === "wipe";
  const canSubmit =
    !!preview &&
    preview.eligible &&
    preview.criticalPasswordConfigured &&
    understood &&
    (!wipe || financialAck) &&
    reason.trim().length >= 5 &&
    confirmationName.trim().length > 0 &&
    password.length > 0 &&
    !loading;

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-medium hover:bg-[var(--color-danger-soft)] ${compact ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"}`}
        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
        aria-label={`${name} kaydını kalıcı sil`}
      >
        Kalıcı sil
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
            aria-labelledby={`purge-title-${id}`}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={`purge-title-${id}`} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--color-danger)" }} aria-hidden />
              <span className="min-w-0 break-words">
                {name} — kalıcı sil
              </span>
            </h3>

            {loading && !preview ? (
              <p className="mt-3 flex items-center gap-2 text-[var(--color-text-muted)]" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Sunucudaki kayıtlar inceleniyor…
              </p>
            ) : null}

            {warnings.length ? (
              <div className="mt-3 space-y-2" role="status">
                <p className="font-medium text-[var(--color-text)]">Kalıcı silme tamamlandı.</p>
                {warnings.map((w) => (
                  <p key={w} style={{ color: "var(--color-warning)" }}>
                    {w}
                  </p>
                ))}
                <div className="flex justify-end">
                  <Button type="button" onClick={finish}>
                    Tamam
                  </Button>
                </div>
              </div>
            ) : preview ? (
              <div className="mt-3 space-y-3">
                {changedNotice ? (
                  <p className="rounded-md border px-3 py-2 font-medium" role="alert" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Önizlemeden sonra kayıtlar değişti. Aşağıdaki güncel önizlemeyi inceleyip yeniden onaylayın.
                  </p>
                ) : null}

                {canWipe ? (
                  <fieldset className="rounded-md border border-[var(--color-border)] px-3 py-2">
                    <legend className="px-1 font-semibold text-[var(--color-text)]">Silme türü</legend>
                    <label className="flex items-start gap-2 py-0.5">
                      <input
                        type="radio"
                        name={`purge-mode-${id}`}
                        checked={mode === "standard"}
                        disabled={busy || loading}
                        onChange={() => void switchMode("standard")}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>Kalıcı sil</strong> — tahsilat, imzalı sözleşme ve hakediş geçmişi varsa korunur, kişi anonimleştirilir.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 py-0.5">
                      <input
                        type="radio"
                        name={`purge-mode-${id}`}
                        checked={mode === "wipe"}
                        disabled={busy || loading}
                        onChange={() => void switchMode("wipe")}
                        className="mt-0.5"
                      />
                      <span>
                        <strong style={{ color: "var(--color-danger)" }}>Yanlış oluşturuldu — her şeyi sil</strong> — kişi ve ona bağlı
                        TÜM kayıtlar, <strong>finansal kayıtlar dahil</strong>, silinir. Yalnız hatalı açılmış kayıtlar için.
                      </span>
                    </label>
                  </fieldset>
                ) : null}

                <p className="rounded-md px-3 py-2" style={{ background: "var(--color-surface-muted)" }}>
                  <strong>{preview.personName}</strong>
                  {preview.displayId ? ` · ${preview.displayId}` : ""} —{" "}
                  {wipe ? (
                    <>
                      yanlış oluşturulmuş kayıt: {who} kaydı ve ona bağlı tüm kayıtlar — <strong>finansal kayıtlar dahil</strong> —{" "}
                      <strong>tamamen silinir</strong>. Anonim iz kalmaz.
                    </>
                  ) : preview.outcome === "delete" ? (
                    <>korunması gereken geçmişi yok; {who} kaydı ve aşağıdaki bağlı kayıtlar <strong>tamamen silinir</strong>.</>
                  ) : (
                    <>
                      korunması gereken geçmişi var; {who} kaydı silinmez, <strong>anonimleştirilir</strong> (“{preview.anonymizedName}”).
                      Kişiye ait diğer kayıtlar silinir.
                    </>
                  )}
                </p>

                {preview.blockers.length ? (
                  <div className="rounded-md border px-3 py-2" role="alert" style={{ borderColor: "var(--color-danger)" }}>
                    <p className="font-semibold" style={{ color: "var(--color-danger)" }}>
                      Şu an kalıcı silinemez:
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {preview.blockers.map((b) => (
                        <li key={b.reason}>
                          {b.reason} <span className="text-[var(--color-text-muted)]">Çözüm: {b.fix}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {wipe && preview.financial ? <FinancialSummary kind={kind} f={preview.financial} /> : null}

                <BucketList title="Kalıcı silinecek" buckets={preview.remove} empty="Bağlı kayıt yok." tone="danger" />
                <BucketList title="Silinmeyecek, yalnız bağlantısı kaldırılacak" buckets={preview.detach} />
                <BucketList title="Korunacak" buckets={preview.keep} />

                {preview.accounts.length ? (
                  <section>
                    <h4 className="font-semibold text-[var(--color-text)]">Giriş hesapları</h4>
                    <ul className="mt-1 space-y-1">
                      {preview.accounts.map((a) => (
                        <li key={a.userId}>
                          {a.maskedEmail}:{" "}
                          {a.action === "close"
                            ? "yalnız bu kişiye ait — hesap kapatılır, açık oturumlar ve bekleyen davet/şifre linkleri geçersiz olur."
                            : "başka öğrenci/rol için de kullanılıyor — hesap SİLİNMEZ, yalnız bu kişiye erişimi kaldırılır."}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="text-[var(--color-text-muted)]">Bu kişiye bağlı giriş hesabı yok.</p>
                )}

                {preview.effects.length ? (
                  <section>
                    <h4 className="font-semibold text-[var(--color-text)]">Etkiler</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {preview.effects.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <p className="text-[var(--color-text-muted)]">
                  Denetim kaydında kim, ne zaman ve kaç kayıt olduğu tutulur; ad ve gerekçe metni tutulmaz. Kurumun veritabanı
                  yedekleri kendi saklama süresine tabidir — bu işlem uygulamadaki kayıtları siler.
                </p>

                {!preview.criticalPasswordConfigured ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Kritik işlem şifresi belirlenmemiş; kalıcı silme yapılamaz.{" "}
                    <Link href="/panel/ayarlar/guvenlik" className="font-semibold underline">
                      Ayarlar → Güvenlik
                    </Link>{" "}
                    ekranından belirleyin.
                  </p>
                ) : null}

                {preview.eligible && preview.criticalPasswordConfigured ? (
                  <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
                    <p className="rounded-md px-3 py-2 font-semibold" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
                      Bu işlem GERİ ALINAMAZ. Silinen kayıtlar geri getirilemez.
                    </p>
                    <label className="block">
                      <span className="font-medium text-[var(--color-text)]">Gerekçe</span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                        placeholder="Örn. Demo kaydı / yanlışlıkla açılmış kayıt"
                      />
                    </label>
                    <label className="block">
                      <span className="font-medium text-[var(--color-text)]">
                        Onay için adı aynen yazın: <strong>{preview.personName}</strong>
                      </span>
                      <input
                        value={confirmationName}
                        onChange={(e) => setConfirmationName(e.target.value)}
                        autoComplete="off"
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
                      <span>Yukarıdaki önizlemeyi okudum; kayıtların kalıcı silineceğini ve geri alınamayacağını anlıyorum.</span>
                    </label>
                    {wipe ? (
                      <label className="flex items-start gap-2 font-medium" style={{ color: "var(--color-danger)" }}>
                        <input type="checkbox" checked={financialAck} onChange={(e) => setFinancialAck(e.target.checked)} className="mt-0.5" />
                        <span>
                          Tahsilat, borç, sözleşme ve hakediş kayıtlarının da kalıcı silineceğini; tahsilat/finans raporlarının ve
                          makbuzların bu tutarlar olmadan görüneceğini anlıyorum.
                        </span>
                      </label>
                    ) : null}
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
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-between gap-2">
                  <Button type="button" variant="ghost" disabled={busy || loading} onClick={() => void loadPreview(mode)}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> Önizlemeyi yenile
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                      Vazgeç
                    </Button>
                    <Button type="button" variant="danger" disabled={!canSubmit || busy} onClick={() => void submit()}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      {wipe ? "Her şeyi kalıcı olarak sil" : "Kalıcı olarak sil"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "Tahsil edilen" ile "ödenmemiş borç" ayrı satır (finans kuralı); tutarlar sunucudaki gerçek satırlardan. */
function FinancialSummary({ kind, f }: { kind: "student" | "teacher"; f: PurgeFinancialSummary }) {
  const rows: [string, string][] =
    kind === "student"
      ? [
          ["Tahsil edilen", `${f.collectedCount} satır · ${formatMoney(f.collectedTotal)}`],
          ["Ödenmemiş borç", `${f.debtCount} satır · ${formatMoney(f.debtTotal)}`],
          ["Sözleşme", `${f.contractCount} (${f.signedContractCount} imzalı)`],
        ]
      : [["Hakediş", `${f.payoutCount} kayıt · ${formatMoney(f.payoutTotal)} (${f.paidPayoutCount} ödenmiş)`]];
  return (
    <section className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-soft)" }}>
      <h4 className="font-semibold" style={{ color: "var(--color-danger)" }}>
        Finansal kayıtlar da silinecek
      </h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--color-text-muted)]">{k}</dt>
            <dd className="font-semibold tabular-nums text-[var(--color-text)]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BucketList({
  title,
  buckets,
  empty,
  tone,
}: {
  title: string;
  buckets: PurgeBucket[];
  empty?: string;
  tone?: "danger";
}) {
  if (!buckets.length && !empty) return null;
  return (
    <section>
      <h4 className="font-semibold" style={{ color: tone === "danger" ? "var(--color-danger)" : "var(--color-text)" }}>
        {title}
      </h4>
      {buckets.length ? (
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {buckets.map((b) => (
            <li key={`${title}-${b.key}`} className="flex justify-between gap-2">
              <span className="min-w-0">
                {b.label}
                {b.note ? <span className="block text-[var(--color-text-muted)]">{b.note}</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{b.ids.length}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[var(--color-text-muted)]">{empty}</p>
      )}
    </section>
  );
}
