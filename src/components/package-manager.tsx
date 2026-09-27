"use client";

/**
 * Paket listesi + inline düzenleme/arşiv. Oluşturma ayrı route:
 * `/panel/paketler/yeni` (PackageCreateForm).
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { actionCreatePackage, actionDeletePackage, actionGetPackageDeletionImpact, actionUpdatePackage } from "@/lib/actions";
import { CriticalDeleteDialog } from "@/components/critical-delete-dialog";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { activeStudentCountForPackage, packageStatusLabel } from "@/lib/packages";
import type { Package, Student } from "@/lib/types";

/** Odaklı oluşturma formu — `/panel/paketler/yeni` ve testler için paylaşılır. */
export function PackageCreateForm({ onCreated }: { onCreated?: (packageId: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onCreate(formData: FormData) {
    setFormError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await actionCreatePackage(formData);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setSuccess("Paket oluşturuldu.");
      if (onCreated) onCreated(result.packageId);
      else router.push("/panel/paketler");
      router.refresh();
    });
  }

  return (
    <form action={onCreate} className="space-y-3">
      <div>
        <Label>Başlık</Label>
        <Input name="title" required placeholder="Örn. Bireysel ders + 4 grup solfej dersi" />
      </div>
      <div>
        <Label>Açıklama</Label>
        <Input name="description" placeholder="Örn. 8 özel ders + 8 grup solfej hediye" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label>30 dk fiyatı (TL)</Label>
          <Input name="price30Min" type="number" min={0} step={1} required />
        </div>
        <div>
          <Label>40 dk fiyatı (TL)</Label>
          <Input name="price40Min" type="number" min={0} step={1} required />
        </div>
        <div>
          <Label>50 dk fiyatı (TL)</Label>
          <Input name="price50Min" type="number" min={0} step={1} required />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Aylık ders adedi (opsiyonel)</Label>
          <Input name="monthlyLessonCount" type="number" min={0} step={1} />
        </div>
        <div>
          <Label>Grup solfej / ek ders adedi (opsiyonel)</Label>
          <Input name="groupLessonCount" type="number" min={0} step={1} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Varsayılan ders süresi (opsiyonel)</Label>
          <Select name="defaultDurationMinutes" defaultValue="">
            <option value="">Belirtilmemiş</option>
            <option value="30">30 dk</option>
            <option value="40">40 dk</option>
            <option value="50">50 dk</option>
          </Select>
        </div>
        <div>
          <Label>Varsayılan ödeme günü (opsiyonel)</Label>
          <Input name="defaultPaymentDueDay" type="number" min={1} max={28} step={1} />
        </div>
      </div>
      <div>
        <Label>Dönem etiketi (opsiyonel)</Label>
        <Select name="termLabel" defaultValue="">
          <option value="">Genel (her iki dönem)</option>
          <option value="guz">Güz</option>
          <option value="yaz">Yaz</option>
        </Select>
      </div>
      <div>
        <Label>Kapsam notu (opsiyonel)</Label>
        <Input name="notes" placeholder="Paket kapsamını açıklayan not" />
      </div>
      {formError ? (
        <p className="text-xs font-medium text-[var(--color-danger)]" role="alert">
          {formError}
        </p>
      ) : null}
      {success ? <p className="text-xs font-medium text-[var(--color-success)]">{success}</p> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Kaydediliyor…" : "Paketi oluştur"}
      </Button>
    </form>
  );
}

export function PackageManager({
  packages,
  students,
  canWrite,
  canDeletePackages = false,
}: {
  packages: Package[];
  students: Student[];
  canWrite: boolean;
  /** 9. tur — kalıcı silme (kritik işlem şifresi) yalnız SUPER_ADMIN/SCHOOL_ADMIN; sunucu ayrıca uygular. */
  canDeletePackages?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function toggleStatus(pkg: Package) {
    if (pkg.status === "active") {
      const activeCount = activeStudentCountForPackage({ students }, pkg.id);
      if (activeCount > 0) {
        const confirmed = window.confirm(
          `Bu paket ${activeCount} öğrencide aktif kullanılıyor. Pasifleştirirseniz yeni öğrenciler bu paketi seçemez, mevcut öğrenciler etkilenmez. Devam edilsin mi?`
        );
        if (!confirmed) return;
      }
    }
    startTransition(async () => {
      const result = await actionUpdatePackage({
        packageId: pkg.id,
        status: pkg.status === "active" ? "archived" : "active",
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!canWrite ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          &quot;Tüm kurumlar&quot; görünümündesiniz — paket eklemek/düzenlemek için üstteki kurum seçiciden tek bir kurum seçin.
        </p>
      ) : null}

      <Card>
        <h2 className="mb-3 font-semibold text-[var(--color-text)]">Paket listesi</h2>
        {packages.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz paket tanımlanmamış.</p>
        ) : (
          <div className="space-y-2">
            {packages.map((pkg) => {
              const activeCount = activeStudentCountForPackage({ students }, pkg.id);
              return (
                <div key={pkg.id} className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[var(--color-text)]">{pkg.title}</p>
                        <Badge status={pkg.status === "active" ? "confirmed" : "archived"}>
                          {packageStatusLabel(pkg.status)}
                        </Badge>
                        {pkg.termLabel ? (
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {pkg.termLabel === "yaz" ? "Yaz" : "Güz"}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {activeCount} öğrencide aktif
                        </span>
                      </div>
                      {pkg.description ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{pkg.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        30 dk: {formatMoney(pkg.price30Min)} · 40 dk: {formatMoney(pkg.price40Min)} · 50 dk:{" "}
                        {formatMoney(pkg.price50Min)}
                      </p>
                      {pkg.monthlyLessonCount !== undefined || pkg.groupLessonCount !== undefined ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {pkg.monthlyLessonCount !== undefined ? `Aylık ${pkg.monthlyLessonCount} ders` : null}
                          {pkg.monthlyLessonCount !== undefined && pkg.groupLessonCount !== undefined ? " · " : null}
                          {pkg.groupLessonCount !== undefined ? `${pkg.groupLessonCount} grup solfej / ek ders` : null}
                        </p>
                      ) : null}
                      {pkg.defaultDurationMinutes || pkg.defaultPaymentDueDay ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {pkg.defaultDurationMinutes ? `Varsayılan süre: ${pkg.defaultDurationMinutes} dk` : null}
                          {pkg.defaultDurationMinutes && pkg.defaultPaymentDueDay ? " · " : null}
                          {pkg.defaultPaymentDueDay ? `Varsayılan ödeme günü: ${pkg.defaultPaymentDueDay}` : null}
                        </p>
                      ) : null}
                      {pkg.notes ? (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Not: {pkg.notes}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        Son güncelleme: {new Date(pkg.updatedAt).toLocaleString("tr-TR")}
                      </p>
                    </div>
                    {canWrite ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === pkg.id ? null : pkg.id)}
                          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"
                        >
                          {editingId === pkg.id ? "Kapat" : "Düzenle"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleStatus(pkg)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                        >
                          {pkg.status === "active" ? (
                            <>
                              <Archive className="h-3 w-3" /> Arşivle
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-3 w-3" /> Aktif et
                            </>
                          )}
                        </button>
                        {canDeletePackages ? (
                          <CriticalDeleteDialog
                            triggerLabel="Sil"
                            title={`${pkg.title} — paketi sil`}
                            meaning="Paket KALICI olarak silinir ve geri alınamaz. Hiçbir öğrenci, ödeme veya sözleşme kaydı bu paketi kullanmadığı için geçmiş etkilenmez."
                            confirmationName={pkg.title}
                            submitLabel="Paketi kalıcı sil"
                            loadImpact={async () => {
                              const res = await actionGetPackageDeletionImpact(pkg.id);
                              if (!res.ok) return res;
                              const d = res.data;
                              return {
                                ok: true,
                                data: {
                                  allowed: d.hardDeleteEligible,
                                  blockReason: d.blockReason,
                                  criticalPasswordConfigured: d.criticalPasswordConfigured,
                                  lines: [
                                    ["Durum", packageStatusLabel(d.status)],
                                    ["Bağlı öğrenci", `${d.linkedStudentCount} (${d.linkedActiveStudentCount} aktif)`],
                                    ["Adla eşleşen eski kayıt", d.nameMatchStudentCount],
                                  ],
                                },
                              };
                            }}
                            onSubmit={async ({ criticalPassword, reason, confirmation }) => {
                              const res = await actionDeletePackage({
                                packageId: pkg.id,
                                confirmationTitle: confirmation,
                                criticalPassword,
                                reason,
                                expectedUpdatedAt: pkg.updatedAt,
                              });
                              if (res.ok) router.refresh();
                              return res.ok ? { ok: true } : res;
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {editingId === pkg.id ? <PackageEditForm pkg={pkg} onSaved={() => router.refresh()} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {formError ? (
        <p className="text-xs font-medium text-[var(--color-danger)]" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function PackageEditForm({ pkg, onSaved }: { pkg: Package; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(pkg.title);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [price30Min, setPrice30Min] = useState(String(pkg.price30Min));
  const [price40Min, setPrice40Min] = useState(String(pkg.price40Min));
  const [price50Min, setPrice50Min] = useState(String(pkg.price50Min));
  const [monthlyLessonCount, setMonthlyLessonCount] = useState(
    pkg.monthlyLessonCount !== undefined ? String(pkg.monthlyLessonCount) : ""
  );
  const [groupLessonCount, setGroupLessonCount] = useState(
    pkg.groupLessonCount !== undefined ? String(pkg.groupLessonCount) : ""
  );
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(
    pkg.defaultDurationMinutes !== undefined ? String(pkg.defaultDurationMinutes) : ""
  );
  const [defaultPaymentDueDay, setDefaultPaymentDueDay] = useState(
    pkg.defaultPaymentDueDay !== undefined ? String(pkg.defaultPaymentDueDay) : ""
  );
  const [notes, setNotes] = useState(pkg.notes ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await actionUpdatePackage({
        packageId: pkg.id,
        title,
        description: description || undefined,
        price30Min: Number(price30Min),
        price40Min: Number(price40Min),
        price50Min: Number(price50Min),
        monthlyLessonCount: monthlyLessonCount.trim() === "" ? undefined : Number(monthlyLessonCount),
        groupLessonCount: groupLessonCount.trim() === "" ? undefined : Number(groupLessonCount),
        defaultDurationMinutes: defaultDurationMinutes.trim() === "" ? undefined : Number(defaultDurationMinutes),
        defaultPaymentDueDay: defaultPaymentDueDay.trim() === "" ? undefined : Number(defaultPaymentDueDay),
        notes: notes.trim() === "" ? undefined : notes,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
      <div>
        <Label>Başlık</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <Label>Açıklama</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label>30 dk</Label>
          <Input type="number" min={0} step={1} value={price30Min} onChange={(e) => setPrice30Min(e.target.value)} />
        </div>
        <div>
          <Label>40 dk</Label>
          <Input type="number" min={0} step={1} value={price40Min} onChange={(e) => setPrice40Min(e.target.value)} />
        </div>
        <div>
          <Label>50 dk</Label>
          <Input type="number" min={0} step={1} value={price50Min} onChange={(e) => setPrice50Min(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Aylık ders adedi</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={monthlyLessonCount}
            onChange={(e) => setMonthlyLessonCount(e.target.value)}
          />
        </div>
        <div>
          <Label>Grup solfej / ek ders adedi</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={groupLessonCount}
            onChange={(e) => setGroupLessonCount(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>Varsayılan ders süresi</Label>
          <Select value={defaultDurationMinutes} onChange={(e) => setDefaultDurationMinutes(e.target.value)}>
            <option value="">Belirtilmemiş</option>
            <option value="30">30 dk</option>
            <option value="40">40 dk</option>
            <option value="50">50 dk</option>
          </Select>
        </div>
        <div>
          <Label>Varsayılan ödeme günü</Label>
          <Input
            type="number"
            min={1}
            max={28}
            step={1}
            value={defaultPaymentDueDay}
            onChange={(e) => setDefaultPaymentDueDay(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Kapsam notu</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error ? <p className="text-xs font-medium text-[var(--color-danger)]">{error}</p> : null}
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Not: fiyat/açıklama değişikliği geçmiş tahsilat kayıtlarını etkilemez — yalnızca bundan sonraki yeni öğrenci kayıtları için geçerlidir.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
