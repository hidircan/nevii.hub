"use client";

import Link from "@/components/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { actionGetPersonPurgePreview, actionPurgePerson } from "@/lib/actions";
import type { PersonPurgePreview } from "@/lib/services/tools";
import type { PurgeFinancialSummary, PurgeGroup, PurgeGroupAction, PurgeMode, WipeOptions } from "@/lib/person-purge";
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
  const [scopeAll, setScopeAll] = useState(false);
  const [wipeOpts, setWipeOpts] = useState<WipeOptions>({ lessonAction: "delete" });
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

  async function loadPreview(m: PurgeMode = mode, o: WipeOptions = wipeOpts): Promise<PersonPurgePreview | null> {
    setLoading(true);
    const res = await actionGetPersonPurgePreview(kind, id, m, kind === "teacher" && m === "wipe" ? o : {});
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
    setScopeAll(false);
    setPassword("");
  }

  /** Öğretmen tam silme seçeneği değişti → önizleme ve parmak izi yeniden, onaylar sıfır. */
  async function changeWipeOpts(next: WipeOptions) {
    if (busy) return;
    setWipeOpts(next);
    setError(null);
    resetConfirmations();
    await loadPreview("wipe", next);
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
    setWipeOpts({ lessonAction: "delete" });
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
      scopeAll: preview.mode === "wipe" ? scopeAll : undefined,
      ...(kind === "teacher" && preview.mode === "wipe" ? wipeOpts : {}),
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
        setScopeAll(false);
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
    (!wipe || (financialAck && scopeAll)) &&
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

                {/* 2026-10-15 — mod herkese görünür; yalnız kurum sahibi seçebilir (sunucu da aynı kuralı uygular). */}
                {preview ? (
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
                        disabled={busy || loading || !canWipe}
                        onChange={() => void switchMode("wipe")}
                        className="mt-0.5"
                      />
                      <span className={canWipe ? undefined : "opacity-70"}>
                        <strong style={{ color: "var(--color-danger)" }}>Yanlış oluşturuldu — bağlı finansallarıyla kalıcı sil</strong> — kişi
                        ve ona bağlı TÜM kayıtlar, <strong>tahsilat, borç ve sözleşmeler dahil</strong>, silinir. Yalnız hatalı açılmış
                        kayıtlar için.
                        {canWipe ? null : (
                          <span className="mt-0.5 block text-[var(--color-text-muted)]">
                            Bu seçeneği yalnız kurum sahibi kullanabilir. Kurum sahibi hesabıyla giriş yapıp aynı pencereyi açın.
                          </span>
                        )}
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

                {preview.blockers.length && !wipe ? (
                  <p className="rounded-md border px-3 py-2 font-medium" style={{ borderColor: "var(--color-warning)" }}>
                    Kayıt yanlışlıkla oluşturulduysa yukarıdan &quot;Yanlış oluşturuldu — bağlı finansallarıyla kalıcı sil&quot;i seçin;
                    borç ve ödeme kayıtları da birlikte silinir.{canWipe ? "" : " Bu seçenek yalnız kurum sahibinde açıktır."}
                  </p>
                ) : null}
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

                {wipe && kind === "teacher" ? (
                  <fieldset className="rounded-md border border-[var(--color-border)] px-3 py-2">
                    <legend className="px-1 font-semibold text-[var(--color-text)]">Ders, telafi ve öğrenci kayıtları</legend>
                    {(["delete", "reassign"] as const).map((a) => (
                      <label key={a} className="flex items-start gap-2 py-0.5">
                        <input
                          type="radio"
                          name={`purge-lesson-action-${id}`}
                          checked={(wipeOpts.lessonAction ?? "delete") === a}
                          disabled={busy || loading}
                          onChange={() => void changeWipeOpts({ ...wipeOpts, lessonAction: a })}
                          className="mt-0.5"
                        />
                        <span>
                          {a === "delete" ? (
                            <>
                              <strong>Dersleri sil</strong> — bu öğretmenin dersleri, yoklamaları, telafileri ve yazdığı öğrenci kayıtları silinir.
                              Grup dersi satırları silinmez (devir gerekir).
                            </>
                          ) : (
                            <>
                              <strong>Dersleri başka öğretmene devret</strong> — ders, seri, telafi ve öğrenci kayıtları aşağıda seçilen öğretmene geçer.
                            </>
                          )}
                        </span>
                      </label>
                    ))}
                    <label className="mt-1 block">
                      <span className="font-medium text-[var(--color-text)]">
                        Devredilecek öğretmen <span className="font-normal text-[var(--color-text-muted)]">(öğrenci ataması her iki seçenekte buraya geçer)</span>
                      </span>
                      <select
                        value={wipeOpts.targetTeacherId ?? ""}
                        disabled={busy || loading}
                        onChange={(e) => void changeWipeOpts({ ...wipeOpts, targetTeacherId: e.target.value || undefined })}
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                      >
                        <option value="">— Seçilmedi —</option>
                        {(preview.targetCandidates ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                ) : null}

                {wipe && preview.financial ? <FinancialSummary kind={kind} f={preview.financial} /> : null}

                <GroupList groups={preview.groups} />
                {!preview.accounts.length ? <p className="text-[var(--color-text-muted)]">Bu kişiye bağlı giriş hesabı yok.</p> : null}

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
                      <label className="flex items-start gap-2 font-medium">
                        <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} className="mt-0.5" />
                        <span>
                          Seçili kişiye ait tüm silinebilir kayıtları seç
                          <span className="block font-normal text-[var(--color-text-muted)]">
                            Kişi satırı silindiği için yukarıdaki gruplar birbirine bağlıdır ve birlikte seçilir (ders → yoklama → telafi; ödeme →
                            sözleşme → evrak). Yalnız bir kısmını silmek için &quot;Kalıcı sil&quot; (standart) türünü kullanın.
                          </span>
                        </span>
                      </label>
                    ) : null}
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

const ACTION_TONE: Record<PurgeGroupAction, string> = {
  delete: "var(--color-danger)",
  detach: "var(--color-text)",
  recalc: "var(--color-warning)",
  keep: "var(--color-text-muted)",
  exception: "var(--color-warning)",
  reassign: "var(--color-text)",
};
const ACTION_LABEL: Record<PurgeGroupAction, string> = {
  delete: "Silinecek",
  detach: "Bağı kaldırılacak",
  recalc: "Yeniden hesaplanacak",
  keep: "Korunacak",
  exception: "Somut istisna",
  reassign: "Devredilecek",
};

/** Önizleme — 7 ürün grubu; her satır: işlem, adet, kapsam/tutar notu (sunucudaki gerçek kayıtlardan). */
function GroupList({ groups }: { groups: PurgeGroup[] }) {
  if (!groups.length) return <p className="text-[var(--color-text-muted)]">Bağlı kayıt yok.</p>;
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <section key={g.key} className="rounded-md border border-[var(--color-border)] px-3 py-2">
          <h4 className="font-semibold text-[var(--color-text)]">{g.title}</h4>
          <ul className="mt-1 space-y-1">
            {g.items.map((it, i) => (
              <li key={`${g.key}-${i}`} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium" style={{ color: ACTION_TONE[it.action] }}>
                    {ACTION_LABEL[it.action]}:
                  </span>{" "}
                  {it.label}
                  {it.note ? <span className="block text-[var(--color-text-muted)]">{it.note}</span> : null}
                </span>
                {it.count ? <span className="shrink-0 font-semibold tabular-nums">{it.count}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
