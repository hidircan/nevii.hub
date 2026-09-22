"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Archive, RotateCcw, Trash2, UserCheck, X } from "lucide-react";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { actionBulkStudentAction } from "@/lib/actions";

export type BulkAction = "branch" | "teacher" | "instrument" | "package" | "deactivate" | "activate" | "soft_delete" | "restore";

export type BulkOptions = {
  branches: { id: string; name: string }[];
  teachers: { id: string; name: string; instruments: string[] }[];
  instruments: string[];
  packages: { id: string; title: string }[];
};

type Selected = { id: string; name: string; active: boolean };

const TITLES: Record<BulkAction, string> = {
  branch: "Şube değiştir",
  teacher: "Öğretmen değiştir",
  instrument: "Enstrüman değiştir",
  package: "Paket değiştir",
  deactivate: "Pasife al",
  activate: "Aktifleştir",
  soft_delete: "Silinenlere taşı",
  restore: "Silinenlerden geri al",
};

/** Her aksiyonun etki özeti ve geri alınabilirlik notu — diyalogda aynen gösterilir. */
const IMPACT: Record<BulkAction, { effect: string; undo: string; danger?: boolean }> = {
  branch: {
    effect: "Öğrenci kartındaki şube değişir. Planlanmış dersler, sözleşme ve ödemeler DEĞİŞMEZ.",
    undo: "Geri alınabilir: aynı işlemle eski şubeyi seçin. Her öğrencinin değişiklik geçmişine yazılır.",
  },
  teacher: {
    effect: "Öğrenci kartındaki öğretmen değişir. Planlanmış dersler mevcut öğretmende kalır; dersleri Ders Programı'ndan devredin.",
    undo: "Geri alınabilir. Öğretmeni öğrencinin enstrümanını öğretmiyorsa o öğrenci atlanır.",
  },
  instrument: {
    effect: "Öğrencinin enstrümanı seçilenle değiştirilir. Mevcut öğretmeni bu enstrümanı öğretmiyorsa öğrenci atlanır.",
    undo: "Geri alınabilir: aynı işlemle eski enstrümanı seçin.",
  },
  package: {
    effect: "Paket değişir ve aylık ücret, öğrencinin ders süresine göre yeniden hesaplanır. Mevcut sözleşme/taksitler değişmez; yeni ücret sonraki planlamada geçerlidir.",
    undo: "Geri alınabilir, ancak elle girilmiş ücret istisnası varsa korunmaz — ödeme profilinden kontrol edin.",
  },
  deactivate: {
    effect: "Öğrenciler pasife alınır ve varsayılan listeden çıkar. Kayıtlar, sözleşme ve ödemeler korunur.",
    undo: "Geri alınabilir: Arşiv görünümünden seçip Aktifleştir.",
  },
  activate: {
    effect: "Pasif öğrenciler yeniden aktif olur.",
    undo: "Geri alınabilir: Pasife al.",
  },
  soft_delete: {
    effect: "Öğrenciler pasife alınır ve Silinenler'e taşınır. Sözleşme, ödeme, evrak ve denetim kayıtları KORUNUR. Kalıcı silme toplu yapılamaz.",
    undo: "Geri alınabilir: Öğrenciler → Silinen öğrenciler → seç → Geri al.",
    danger: true,
  },
  restore: {
    effect: "Öğrenciler Silinenler'den çıkar ve pasif olarak listeye döner.",
    undo: "Ayrıca aktifleştirmeniz gerekir.",
  },
};

export function StudentsBulkBar({
  selected,
  options,
  deletedView,
  onClear,
}: {
  selected: Selected[];
  options: BulkOptions;
  deletedView: boolean;
  onClear: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<BulkAction | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: { name: string; message: string }[] } | null>(null);

  if (selected.length === 0 && !result) return null;

  const hasInactive = selected.some((s) => !s.active);
  const hasActive = selected.some((s) => s.active);

  function open(a: BulkAction) {
    setAction(a);
    setTarget("");
    setReason("");
    setPassword("");
    setError(null);
    setResult(null);
  }

  function close() {
    if (busy) return;
    setAction(null);
    setPassword("");
  }

  const needsTarget = action === "branch" || action === "teacher" || action === "instrument" || action === "package";
  const canSubmit =
    !!action &&
    !busy &&
    (!needsTarget || !!target) &&
    (action !== "soft_delete" || (reason.trim().length >= 5 && password.length > 0));

  async function submit() {
    if (!action || !canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await actionBulkStudentAction({
      action,
      studentIds: selected.map((s) => s.id),
      branchId: action === "branch" ? target : undefined,
      teacherId: action === "teacher" ? target : undefined,
      instrument: action === "instrument" ? target : undefined,
      packageId: action === "package" ? target : undefined,
      criticalPassword: action === "soft_delete" ? password : undefined,
      reason: action === "soft_delete" ? reason : undefined,
    });
    setBusy(false);
    setPassword("");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAction(null);
    setResult({ updated: res.data.updated.length, skipped: res.data.skipped.map((x) => ({ name: x.name, message: x.message })) });
    onClear();
    router.refresh();
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]";

  return (
    <>
      <div
        role="region"
        aria-label="Toplu işlem"
        className="sticky bottom-3 z-30 mx-auto mt-3 flex max-w-5xl flex-wrap items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 shadow-[var(--shadow-md)]"
      >
        {result && selected.length === 0 ? (
          <>
            <p className="mr-auto text-xs text-[var(--color-text)]">
              <strong>{result.updated}</strong> öğrenci güncellendi
              {result.skipped.length > 0 ? `, ${result.skipped.length} öğrenci atlandı:` : "."}
              {result.skipped.length > 0 ? (
                <span className="mt-1 block text-[var(--color-text-muted)]">
                  {result.skipped.slice(0, 5).map((x) => `${x.name} — ${x.message}`).join(" · ")}
                  {result.skipped.length > 5 ? ` · +${result.skipped.length - 5} diğer` : ""}
                </span>
              ) : null}
            </p>
            <button type="button" className={btn} onClick={() => setResult(null)}>
              Kapat
            </button>
          </>
        ) : (
          <>
            <span className="mr-1 text-xs font-semibold text-[var(--color-text)]">{selected.length} öğrenci seçildi</span>
            {deletedView ? (
              <button type="button" className={btn} onClick={() => open("restore")}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Geri al
              </button>
            ) : (
              <>
                <button type="button" className={btn} onClick={() => open("branch")}>
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden /> Şube
                </button>
                <button type="button" className={btn} onClick={() => open("teacher")}>
                  Öğretmen
                </button>
                <button type="button" className={btn} onClick={() => open("instrument")}>
                  Enstrüman
                </button>
                <button type="button" className={btn} onClick={() => open("package")}>
                  Paket
                </button>
                {hasActive ? (
                  <button type="button" className={btn} onClick={() => open("deactivate")}>
                    <Archive className="h-3.5 w-3.5" aria-hidden /> Pasife al
                  </button>
                ) : null}
                {hasInactive ? (
                  <button type="button" className={btn} onClick={() => open("activate")}>
                    <UserCheck className="h-3.5 w-3.5" aria-hidden /> Aktifleştir
                  </button>
                ) : null}
                <button
                  type="button"
                  className={btn}
                  style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                  onClick={() => open("soft_delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Silinenlere taşı
                </button>
              </>
            )}
            <button type="button" className={`${btn} ml-auto`} onClick={onClear} aria-label="Seçimi temizle">
              <X className="h-3.5 w-3.5" aria-hidden /> Seçimi temizle
            </button>
          </>
        )}
      </div>

      <ModalShell
        open={!!action}
        tone={action && IMPACT[action].danger ? "danger" : "default"}
        busy={busy}
        title={action ? `${TITLES[action]} — ${selected.length} öğrenci` : ""}
        onClose={close}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={close} disabled={busy}>
              Vazgeç
            </button>
            <button
              type="button"
              className={action && IMPACT[action].danger ? modalButton.danger : modalButton.primary}
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {busy ? "Uygulanıyor…" : `${selected.length} öğrenciye uygula`}
            </button>
          </>
        }
      >
        {action ? (
          <div className="space-y-3">
            {action === "branch" ? (
              <TargetSelect label="Yeni şube" value={target} onChange={setTarget} options={options.branches.map((b) => ({ value: b.id, label: b.name }))} />
            ) : action === "teacher" ? (
              <TargetSelect
                label="Yeni öğretmen"
                value={target}
                onChange={setTarget}
                options={options.teachers.map((t) => ({ value: t.id, label: `${t.name} (${t.instruments.join(", ")})` }))}
              />
            ) : action === "instrument" ? (
              <TargetSelect label="Yeni enstrüman" value={target} onChange={setTarget} options={options.instruments.map((i) => ({ value: i, label: i }))} />
            ) : action === "package" ? (
              <TargetSelect label="Yeni paket" value={target} onChange={setTarget} options={options.packages.map((p) => ({ value: p.id, label: p.title }))} />
            ) : null}

            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5 text-xs">
              <p className="font-semibold text-[var(--color-text)]">Etki</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">{IMPACT[action].effect}</p>
              <p className="mt-1.5 font-semibold text-[var(--color-text)]">Geri alınabilirlik</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">{IMPACT[action].undo}</p>
              <p className="mt-1.5 font-semibold text-[var(--color-text)]">Etkilenecek öğrenciler</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">
                {selected.slice(0, 8).map((s) => s.name).join(", ")}
                {selected.length > 8 ? ` ve ${selected.length - 8} öğrenci daha` : ""}
              </p>
            </div>

            {action === "soft_delete" ? (
              <>
                <label className="block text-xs font-medium text-[var(--color-text)]">
                  Silme gerekçesi (en az 5 karakter)
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--color-text)]">
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

            <p className="text-[11px] text-[var(--color-text-muted)]">
              İşlem her öğrencinin değişiklik geçmişine ve Denetim Kaydı&apos;na adınızla yazılır. Uygun olmayan öğrenciler
              gerekçesiyle atlanır; diğerleri etkilenmez.
            </p>
            {error ? (
              <p role="alert" className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalShell>
    </>
  );
}

function TargetSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-xs font-medium text-[var(--color-text)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
      >
        <option value="">Seçin…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
