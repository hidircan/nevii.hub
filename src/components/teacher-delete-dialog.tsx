"use client";

import Link from "@/components/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { actionDeleteTeacher, actionGetTeacherDeletionImpact, actionRestoreDeletedTeacher } from "@/lib/actions";
import type { TeacherDeletionImpact } from "@/lib/services/tools";

/**
 * 2026-10-03 — pasif öğretmeni kaldırma (StudentDeleteDialog ile aynı iki adımlı desen).
 * 1. adım: bağımlılıklar (ileri tarihli ders, aktif seri/öğrenci, ödenmemiş hakediş, geçmiş kayıtlar) +
 *    yöntem; "Listeden kaldırma" ile "Kalıcı silme" ve "Kişisel veri silme" ayrımı açıkça yazılır.
 * 2. adım: gerekçe + öğretmenin adını aynen yazma + kritik işlem şifresi.
 * Sunucu (deleteTeacherTool) aynı kuralları ayrıca uygular ve her denemeyi audit'e yazar.
 */
export function TeacherDeleteDialog({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [impact, setImpact] = useState<TeacherDeletionImpact | null>(null);
  const [mode, setMode] = useState<"soft" | "hard">("soft");
  const [reason, setReason] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
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
    setStep(1);
    setMode("soft");
    setReason("");
    setConfirmationName("");
    setPassword("");
    setError(null);
    setImpact(null);
    const res = await actionGetTeacherDeletionImpact(teacherId);
    if (res.ok) setImpact(res.data);
    else setError(res.message);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await actionDeleteTeacher({ teacherId, mode, confirmationName, criticalPassword: password, reason });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    router.push(res.data.mode === "hard" ? "/panel/ogretmenler" : `/panel/ogretmenler/${teacherId}`);
    router.refresh();
  }

  const blocked = (impact?.blockers.length ?? 0) > 0;
  const canSubmit =
    !!impact?.criticalPasswordConfigured && !blocked && reason.trim().length >= 5 && confirmationName.trim().length > 0 && password.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-danger-soft)]"
        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
      >
        Öğretmeni sil
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
            aria-labelledby={`teacher-delete-title-${teacherId}`}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] outline-none sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={`teacher-delete-title-${teacherId}`} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} aria-hidden />
              {teacherName} — öğretmeni sil ({step}/2)
            </h3>

            {!impact && !error ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Bağımlılıklar hesaplanıyor…
              </p>
            ) : null}

            {impact && step === 1 ? (
              <div className="mt-3 space-y-3 text-xs">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <dt className="text-[var(--color-text-muted)]">Durum</dt>
                  <dd className="font-medium">{impact.active ? "Aktif" : "Pasif"}</dd>
                  <dt className="text-[var(--color-text-muted)]">Ders (toplam / ileri tarihli)</dt>
                  <dd className="font-medium">
                    {impact.lessonCount} / {impact.upcomingLessonCount}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Aktif ders serisi</dt>
                  <dd className="font-medium">{impact.activeSeriesCount}</dd>
                  <dt className="text-[var(--color-text-muted)]">Öğrenci (aktif / toplam)</dt>
                  <dd className="font-medium">
                    {impact.activeStudentCount} / {impact.studentCount}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Hakediş (ödenmemiş / toplam)</dt>
                  <dd className="font-medium" style={impact.openPayoutCount > 0 ? { color: "var(--color-danger)" } : undefined}>
                    {impact.openPayoutCount} / {impact.payoutCount}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Ücret kuralı · telafi · deneme</dt>
                  <dd className="font-medium">
                    {impact.feeRuleCount} · {impact.makeupRequestCount} · {impact.trialLessonCount}
                  </dd>
                  <dt className="text-[var(--color-text-muted)]">Giriş hesabı</dt>
                  <dd className="font-medium">{impact.hasLoginAccount ? "Var — kaldırılınca kapatılır" : "Yok"}</dd>
                </dl>

                {blocked ? (
                  <div className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
                    <p className="font-semibold">Şu an silinemez:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {impact.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <fieldset className="space-y-2" disabled={blocked}>
                  <legend className="mb-1 font-semibold text-[var(--color-text)]">Silme yöntemi</legend>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="teacher-delete-mode" checked={mode === "soft"} onChange={() => setMode("soft")} />
                    <span>
                      <strong>Listeden kaldır (önerilen, geri alınabilir).</strong> Öğretmen tüm listelerden ve yeni ders
                      seçimlerinden çıkar, giriş hesabı kapanır. Geçmiş ders, yoklama, hakediş kayıtları ve raporlardaki adı korunur;
                      Öğretmenler ekranındaki &quot;Listeden kaldırılanlar&quot;dan geri alınabilir.
                    </span>
                  </label>
                  <p className="text-[var(--color-text-muted)]">
                    <strong>Kalıcı silme</strong> ayrı bir adımdır: önce bu silmeyi yapın, sonra Listeden kaldırılanlar bölümünde kişinin
                    yanındaki &quot;Kalıcı sil&quot; ile neyin silineceğini, neyin korunacağını önizleyerek geri alınamaz biçimde silin.
                  </p>
                </fieldset>
                <p className="text-[var(--color-text-muted)]">
                  <strong>Kişisel veri silme</strong> (KVKK — iletişim ve kimlik bilgilerinin silinmesi) bu işlemlerden ayrıdır:
                  hakediş/ödeme kayıtlarının yasal saklama süresi değerlendirilerek ayrı talep ve onayla yapılır.
                </p>

                {!impact.criticalPasswordConfigured ? (
                  <p className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-warning)", color: "var(--color-warning)" }}>
                    Kritik işlem şifresi belirlenmemiş; silme yapılamaz.{" "}
                    <Link href="/panel/ayarlar/guvenlik" className="font-semibold underline">
                      Ayarlar → Güvenlik
                    </Link>{" "}
                    ekranından belirleyin.
                  </p>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Vazgeç
                  </Button>
                  <Button type="button" variant="danger" disabled={!impact.criticalPasswordConfigured || blocked} onClick={() => setStep(2)}>
                    Devam et
                  </Button>
                </div>
              </div>
            ) : null}

            {impact && step === 2 ? (
              <div className="mt-3 space-y-3 text-xs">
                <p className="rounded-md px-3 py-2 font-medium" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
                  {mode === "hard"
                    ? "Kalıcı silme seçildi. Bu işlem GERİ ALINAMAZ."
                    : "Listeden kaldırma seçildi. Geçmiş kayıtlar korunur; geri alınabilir."}
                </p>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">Silme gerekçesi</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    aria-label="Silme gerekçesi"
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
                    placeholder="Örn. Kurumdan ayrıldı, dersleri devredildi"
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-[var(--color-text)]">
                    Onay için öğretmenin adını aynen yazın: <strong>{impact.name}</strong>
                  </span>
                  <input
                    value={confirmationName}
                    onChange={(e) => setConfirmationName(e.target.value)}
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
                    {mode === "hard" ? "Kalıcı olarak sil" : "Listeden kaldır"}
                  </Button>
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

/** Listeden kaldırılmış öğretmenin sayfasında: açık durum bandı + yetkili için geri alma. */
export function TeacherDeletedBanner({
  teacherId,
  deletedAtLabel,
  reason,
  canRestore,
}: {
  teacherId: string;
  deletedAtLabel: string;
  reason?: string;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    const res = await actionRestoreDeletedTeacher(teacherId);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-soft)" }}>
      <p className="font-semibold" style={{ color: "var(--color-danger)" }}>
        Bu öğretmen listeden kaldırıldı (geri alınabilir) — {deletedAtLabel}.
      </p>
      {reason ? <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Gerekçe: {reason}</p> : null}
      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
        Geçmiş ders, yoklama ve hakediş kayıtları korunuyor. Geri alındığında öğretmen pasif olarak döner; giriş hesabı ayrıca açılır.
      </p>
      {canRestore ? (
        <div className="mt-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void restore()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kaldırmayı geri al
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs font-medium" role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
