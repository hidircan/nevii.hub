"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { actionBulkPurgeStudents, actionGetBulkStudentPurgePreview } from "@/lib/actions";
import type { BulkPurgeItemResult, BulkPurgePreview } from "@/lib/services/tools";

const ACTION_LABEL: Record<string, string> = {
  delete: "silinecek",
  detach: "bağlantısı kaldırılacak",
  recalc: "yeniden hesaplanacak",
  keep: "korunacak",
  exception: "korunacak (istisna)",
  reassign: "devredilecek",
};
const STATUS_LABEL: Record<BulkPurgeItemResult["status"], string> = { success: "Başarılı", blocked: "Engellendi", error: "Hata" };
const STATUS_COLOR: Record<BulkPurgeItemResult["status"], string> = {
  success: "var(--color-success)",
  blocked: "var(--color-warning)",
  error: "var(--color-danger)",
};

/**
 * 2026-10-17 — Silinen öğrenciler: seçili kayıtlar için toplu kalıcı silme. Önizleme ve silme tekli kalıcı silmeyle
 * aynı plan/çekirdeği kullanır (sunucu: `bulkPurgeStudentsTool`). Sonuç kayıt bazında: başarılı / engellendi / hata.
 */
export function StudentsBulkPurgeDialog({
  studentIds: ids,
  max,
  onClose,
  onDone,
}: {
  /** Açılış anındaki seçim (üst bileşen dondurur, her açılışta yeniden bağlanır). */
  studentIds: string[];
  max: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const tooMany = ids.length > max;
  const [preview, setPreview] = useState<BulkPurgePreview | null>(null);
  const [loading, setLoading] = useState(!tooMany);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [count, setCount] = useState("");
  const [results, setResults] = useState<BulkPurgeItemResult[] | null>(null);

  useEffect(() => {
    if (tooMany) return;
    let cancelled = false;
    void actionGetBulkStudentPurgePreview(ids).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setPreview(res.data);
      else setError(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [ids, tooMany]);

  const eligible = preview?.students.filter((s) => s.eligible) ?? [];
  const blocked = preview?.students.filter((s) => !s.eligible) ?? [];
  const n = ids.length;
  const canSubmit =
    !!preview && !busy && !results && eligible.length > 0 && reason.trim().length >= 5 && password.length > 0 && count.trim() === String(n);

  function close() {
    if (busy) return;
    if (results) onDone();
    onClose();
  }

  async function submit() {
    if (!preview || !canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await actionBulkPurgeStudents({
      studentIds: ids,
      fingerprints: preview.fingerprints,
      confirmationCount: count,
      criticalPassword: password,
      reason,
    });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setResults(res.data.results);
    router.refresh();
  }

  const summary = results
    ? (["success", "blocked", "error"] as const).map((st) => ({ st, n: results.filter((r) => r.status === st).length }))
    : [];

  return (
    <ModalShell
      open
      tone="danger"
      busy={busy}
      title={`Kalıcı olarak sil — ${n} öğrenci`}
      onClose={close}
      footer={
        results ? (
          <button type="button" className={modalButton.primary} onClick={close}>
            Kapat
          </button>
        ) : (
          <>
            <button type="button" className={modalButton.secondary} onClick={close} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className={modalButton.danger} disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Siliniyor…" : `${eligible.length} öğrenciyi kalıcı olarak sil`}
            </button>
          </>
        )
      }
    >
      <div className="space-y-3 text-xs">
        {tooMany ? (
          <p role="alert" style={{ color: "var(--color-danger)" }}>
            Toplu kalıcı silme tek seferde en fazla {max} öğrenciyle yapılabilir; {n} öğrenci seçili. Seçimi azaltıp işlemi
            parça parça yapın.
          </p>
        ) : null}
        {loading ? <p className="text-[var(--color-text-muted)]">Etki önizlemesi yükleniyor…</p> : null}

        {results ? (
          <>
            <p className="font-semibold text-[var(--color-text)]">
              {summary.map((x) => `${x.n} ${STATUS_LABEL[x.st].toLocaleLowerCase("tr")}`).join(" · ")}
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id} className="rounded-md border border-[var(--color-border)] p-2">
                  <span className="font-semibold" style={{ color: STATUS_COLOR[r.status] }}>
                    {STATUS_LABEL[r.status]}
                  </span>{" "}
                  <span className="font-medium text-[var(--color-text)]">{r.name}</span>
                  <span className="block text-[var(--color-text-muted)]">{r.message}</span>
                  {r.warnings?.map((w) => (
                    <span key={w} className="block text-[var(--color-warning)]">
                      {w}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : preview ? (
          <>
            <div className="rounded-md border border-[var(--color-danger)] p-2.5">
              <p className="font-semibold" style={{ color: "var(--color-danger)" }}>
                Bu işlem GERİ ALINAMAZ.
              </p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">
                Geçmişi olmayan öğrenci tamamen silinir; dersi/tahsilatı olan öğrenci anonimleştirilir (ad ve iletişim
                bilgileri silinir, finansal geçmiş anonim kişiye bağlı korunur). Kurallar tekli kalıcı silmeyle aynıdır.
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
              <p className="font-semibold text-[var(--color-text)]">
                {eligible.length} öğrenci işlenecek: {eligible.filter((s) => s.outcome === "delete").length} tamamen silinecek,{" "}
                {eligible.filter((s) => s.outcome === "anonymize").length} anonimleştirilecek
              </p>
              {preview.totals.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[var(--color-text-muted)]">
                  {preview.totals.map((t) => (
                    <li key={`${t.action}|${t.label}`}>
                      {t.label}: {t.count} — {ACTION_LABEL[t.action] ?? t.action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[var(--color-text-muted)]">Bağlı kayıt yok.</p>
              )}
            </div>
            {blocked.length > 0 || preview.missing.length > 0 ? (
              <div className="rounded-md border border-[var(--color-warning)] p-2.5">
                <p className="font-semibold text-[var(--color-text)]">
                  {blocked.length + preview.missing.length} öğrenci işlenmeyecek (engellendi):
                </p>
                <ul className="mt-1 space-y-0.5 text-[var(--color-text-muted)]">
                  {blocked.map((s) => (
                    <li key={s.id}>
                      {s.name} — {s.blockers.map((b) => `${b.reason} ${b.fix}`).join(" ")}
                    </li>
                  ))}
                  {preview.missing.length ? <li>{preview.missing.length} kayıt bulunamadı veya zaten kalıcı silinmiş.</li> : null}
                </ul>
              </div>
            ) : null}

            {!preview.criticalPasswordConfigured ? (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                Kritik işlem şifresi belirlenmemiş. Kurum sahibi Ayarlar → Güvenlik ekranından şifreyi belirlemeden kalıcı
                silme yapılamaz.
              </p>
            ) : eligible.length > 0 ? (
              <>
                <label className="block font-medium text-[var(--color-text)]">
                  Silme gerekçesi (en az 5 karakter)
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />
                </label>
                <label className="block font-medium text-[var(--color-text)]">
                  Onay için seçili öğrenci sayısını yazın: <strong>{n}</strong>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />
                </label>
                <label className="block font-medium text-[var(--color-text)]">
                  Kritik işlem şifresi
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-[var(--color-text-muted)]">
                    Kurum sahibinin Ayarlar → Güvenlik ekranında belirlediği şifre. Kişisel giriş şifreniz kabul edilmez.
                  </span>
                </label>
              </>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p role="alert" className="font-medium" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
