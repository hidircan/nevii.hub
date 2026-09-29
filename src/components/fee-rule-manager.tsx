"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { actionCreateFeeRule, actionRemoveFeeRule, actionUpdateFeeRule } from "@/lib/actions";
import { ModalShell, modalButton } from "@/components/modal-shell";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";
import { INSTRUMENTS, type Instrument } from "@/lib/types";
import type { TeacherFeeRule } from "@/lib/types";

type TeacherOption = { id: string; name: string };
type BranchOption = { id: string; shortName: string };

const ALL_BRANCHES = "";
const ALL_INSTRUMENTS = "";

/** Depolanan `perMinuteRate` kuruş hassasiyetinde float olduğundan ×60 dönüşümü küçük yuvarlama artıkları bırakabilir. */
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyForm(defaultTeacherId: string) {
  return {
    teacherId: defaultTeacherId,
    branchId: ALL_BRANCHES,
    instrument: ALL_INSTRUMENTS as Instrument | "",
    hourlyRate: "",
    effectiveFrom: "",
    effectiveTo: "",
  };
}

export function FeeRuleManager({
  teachers,
  branches,
  rules,
  canWrite,
}: {
  teachers: TeacherOption[];
  branches: BranchOption[];
  rules: TeacherFeeRule[];
  /** "Tüm kurumlar" görünümünde false — ücret kuralı eklenemez/güncellenemez. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState(() => emptyForm(teachers[0]?.id ?? ""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // 2026-09-30 — kural kaldırma: kullanılmadıysa kalıcı sil, kullanıldıysa tarihten itibaren devre dışı.
  const [removing, setRemoving] = useState<TeacherFeeRule | null>(null);
  const [removeForm, setRemoveForm] = useState({ mode: "deactivate" as "delete" | "deactivate", fromDate: "", reason: "", password: "" });
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function submitRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const res = await actionRemoveFeeRule({
      ruleId: removing.id,
      mode: removeForm.mode,
      fromDate: removeForm.mode === "deactivate" ? removeForm.fromDate || undefined : undefined,
      reason: removeForm.reason,
      criticalPassword: removeForm.mode === "delete" ? removeForm.password : undefined,
    });
    setRemoveBusy(false);
    if (!res.ok) {
      setRemoveError(res.message);
      return;
    }
    setRemoving(null);
    setSuccess(
      res.data.mode === "deleted"
        ? "Kural kalıcı olarak silindi."
        : `Kural ${res.data.effectiveTo ? formatDate(res.data.effectiveTo) : ""} sonrasında devre dışı. ${res.data.affectedOpenLessons > 0 ? `${res.data.affectedOpenLessons} kayda geçmemiş ders artık başka bir kurala ihtiyaç duyuyor (Hakedişler ekranında "ücret kuralı eksik" görünür).` : ""}`
    );
    router.refresh();
  }

  const teacherName = useMemo(() => {
    const map = new Map(teachers.map((t) => [t.id, t.name]));
    return (id: string) => map.get(id) ?? "Bilinmeyen öğretmen";
  }, [teachers]);

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.shortName]));
    return (id?: string) => (id ? map.get(id) ?? id : "Tüm şubeler");
  }, [branches]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => teacherName(a.teacherId).localeCompare(teacherName(b.teacherId), "tr")),
    [rules, teacherName]
  );

  function startEdit(rule: TeacherFeeRule) {
    setEditingRuleId(rule.id);
    setError(null);
    setSuccess(null);
    setForm({
      teacherId: rule.teacherId,
      branchId: rule.branchId ?? ALL_BRANCHES,
      instrument: rule.instrument ?? ALL_INSTRUMENTS,
      hourlyRate: String(roundToCents(rule.perMinuteRate * 60)),
      effectiveFrom: rule.effectiveFrom.slice(0, 10),
      effectiveTo: rule.effectiveTo ? rule.effectiveTo.slice(0, 10) : "",
    });
  }

  function cancelEdit() {
    setEditingRuleId(null);
    setError(null);
    setForm(emptyForm(teachers[0]?.id ?? ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const hourlyRate = Number(form.hourlyRate);
    if (!form.teacherId) {
      setError("Öğretmen seçimi zorunludur.");
      return;
    }
    if (!(hourlyRate > 0)) {
      setError("Saatlik ücret sıfırdan büyük olmalıdır.");
      return;
    }
    if (!form.effectiveFrom) {
      setError("Başlangıç tarihi zorunludur.");
      return;
    }

    setSubmitting(true);
    const payload = {
      teacherId: form.teacherId,
      branchId: form.branchId || undefined,
      instrument: form.instrument || undefined,
      perMinuteRate: roundToCents(hourlyRate / 60),
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || undefined,
    };

    const result = editingRuleId
      ? await actionUpdateFeeRule({ ruleId: editingRuleId, ...payload })
      : await actionCreateFeeRule(payload);

    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSuccess(editingRuleId ? "Ücret kuralı güncellendi." : "Yeni ücret kuralı eklendi.");
    setEditingRuleId(null);
    setForm(emptyForm(teachers[0]?.id ?? ""));
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">Mevcut kurallar</h2>
          <span className="text-xs text-[var(--color-text-muted)]">{sortedRules.length} kural</span>
        </div>
        {sortedRules.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
            Henüz hiçbir öğretmen için ücret kuralı tanımlanmadı.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)] dark:border-slate-800 dark:bg-slate-900/60 dark:text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Öğretmen</th>
                <th className="px-4 py-3">Şube</th>
                <th className="px-4 py-3">Enstrüman</th>
                <th className="px-4 py-3">Saatlik ücret</th>
                <th className="px-4 py-3">Geçerlilik</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((r) => (
                <tr key={r.id} className={`border-b border-slate-50 ${editingRuleId === r.id ? "bg-amber-50/50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-[var(--color-text)] dark:text-slate-50">{teacherName(r.teacherId)}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{branchName(r.branchId)}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                    {r.instrument ?? <Badge>Tüm enstrümanlar</Badge>}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatMoney(roundToCents(r.perMinuteRate * 60))}/sa</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                    {formatDate(r.effectiveFrom)} –{" "}
                    {r.effectiveTo ? formatDate(r.effectiveTo) : "süresiz"}
                    {r.deactivatedAt ? (
                      <span className="block text-[11px]">Devre dışı bırakıldı: {r.deactivationReason ?? "—"}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      className="!py-1.5 text-xs"
                      onClick={() => startEdit(r)}
                      disabled={!canWrite}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Düzenle
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="ml-1 !py-1.5 text-xs"
                      onClick={() => {
                        setRemoving(r);
                        setRemoveError(null);
                        setRemoveForm({ mode: "deactivate", fromDate: new Date().toISOString().slice(0, 10), reason: "", password: "" });
                      }}
                      disabled={!canWrite}
                    >
                      <X className="h-3.5 w-3.5" /> Kaldır
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-[var(--color-text)] dark:text-slate-50">
            {editingRuleId ? "Kuralı düzenle" : "Yeni kural ekle"}
          </h2>
          {editingRuleId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:text-slate-300"
              aria-label="Düzenlemeyi iptal et"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Öğretmen</Label>
            <Select
              value={form.teacherId}
              onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}
              disabled={Boolean(editingRuleId)}
              required
            >
              <option value="">Seçin…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Şube (opsiyonel daraltma)</Label>
            <Select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
              <option value={ALL_BRANCHES}>Tüm şubeler</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Enstrüman (opsiyonel daraltma)</Label>
            <Select
              value={form.instrument}
              onChange={(e) => setForm((f) => ({ ...f, instrument: e.target.value as Instrument | "" }))}
            >
              <option value={ALL_INSTRUMENTS}>Tüm enstrümanlar</option>
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Saatlik ücret (₺)</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={form.hourlyRate}
              onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Başlangıç tarihi</Label>
            <Input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Bitiş tarihi (opsiyonel — boşsa süresiz)</Label>
            <Input
              type="date"
              value={form.effectiveTo}
              onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
            />
          </div>

          {!canWrite ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              &quot;Tüm kurumlar&quot; görünümündesiniz — kural eklemek/güncellemek için üstteki kurum
              seçiciden tek bir kurum seçin.
            </p>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting || !canWrite}>
            {submitting ? "Kaydediliyor…" : editingRuleId ? "Kuralı güncelle" : "Kuralı ekle"}
          </Button>
        </form>
      </Card>
      <ModalShell
        open={!!removing}
        busy={removeBusy}
        tone="warning"
        title={removing ? `${teacherName(removing.teacherId)} — ücret kuralını kaldır` : ""}
        onClose={() => !removeBusy && setRemoving(null)}
        footer={
          <>
            <button type="button" className={modalButton.secondary} onClick={() => setRemoving(null)} disabled={removeBusy}>
              Vazgeç
            </button>
            <button
              type="button"
              className={removeForm.mode === "delete" ? modalButton.danger : modalButton.primary}
              disabled={removeBusy || removeForm.reason.trim().length < 5 || (removeForm.mode === "delete" && !removeForm.password)}
              onClick={() => void submitRemove()}
            >
              {removeBusy ? "Kaydediliyor…" : removeForm.mode === "delete" ? "Kalıcı sil" : "Devre dışı bırak"}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" checked={removeForm.mode === "deactivate"} onChange={() => setRemoveForm({ ...removeForm, mode: "deactivate" })} />
            <span>
              <span className="font-medium">Bir tarihten itibaren devre dışı bırak</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                Tarihten önceki dersler ve kayıtlı hakedişler aynen kalır (kayıt, hangi kuralla hesaplandığını saklar). Tarihten
                sonraki kayda geçmemiş dersler başka bir kurala ihtiyaç duyar.
              </span>
            </span>
          </label>
          {removeForm.mode === "deactivate" ? (
            <label className="block pl-6 text-xs font-medium">
              Devre dışı başlangıcı
              <input
                type="date"
                value={removeForm.fromDate}
                onChange={(e) => setRemoveForm({ ...removeForm, fromDate: e.target.value })}
                className="mt-1 block rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          <label className="flex items-start gap-2">
            <input type="radio" checked={removeForm.mode === "delete"} onChange={() => setRemoveForm({ ...removeForm, mode: "delete" })} />
            <span>
              <span className="font-medium">Kalıcı sil</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                Yalnız hiç kullanılmamış kural silinebilir (kayıtlı hakedişte veya işlenmiş derste kullanılıyorsa reddedilir). Kritik
                işlem şifresi gerekir.
              </span>
            </span>
          </label>
          <label className="block text-xs font-medium">
            Gerekçe (en az 5 karakter)
            <textarea
              value={removeForm.reason}
              onChange={(e) => setRemoveForm({ ...removeForm, reason: e.target.value })}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            />
          </label>
          {removeForm.mode === "delete" ? (
            <label className="block text-xs font-medium">
              Kritik işlem şifresi
              <input
                type="password"
                autoComplete="off"
                value={removeForm.password}
                onChange={(e) => setRemoveForm({ ...removeForm, password: e.target.value })}
                className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          {removeError ? (
            <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
              {removeError}
            </p>
          ) : null}
        </div>
      </ModalShell>
    </div>
  );
}
