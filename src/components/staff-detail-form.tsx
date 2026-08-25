"use client";

/**
 * Faz 9A — personel detay sayfasındaki tam özlük düzenleme formu.
 * `staff-manager.tsx`nin `onCreate` istemci-taraflı hata gösterimiyle AYNI
 * desen (actionUpdateStaffMemberExtended TC/IBAN checksum veya avans limiti
 * gibi doğrulama hatalarını fail(...) ile döndürebilir — sessizce
 * yutulmamalı).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateStaffMemberExtended } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import type { StaffMember } from "@/lib/types";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Tam zamanlı",
  part_time: "Yarı zamanlı",
  contract: "Sözleşmeli",
  intern: "Stajyer",
};

export function StaffDetailForm({
  staff,
  branches,
}: {
  staff: StaffMember;
  branches: { id: string; shortName: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await actionUpdateStaffMemberExtended(staff.id, formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>Ad Soyad</Label>
        <Input name="name" required defaultValue={staff.name} />
      </div>
      <div>
        <Label>Rol / Görev</Label>
        <Input name="position" required defaultValue={staff.position} />
      </div>
      <div>
        <Label>Telefon</Label>
        <Input name="phone" defaultValue={staff.phone ?? ""} />
      </div>
      <div>
        <Label>E-posta</Label>
        <Input name="email" type="email" defaultValue={staff.email ?? ""} />
      </div>
      <div>
        <Label>Adres</Label>
        <Input name="address" defaultValue={staff.address ?? ""} />
      </div>
      <div>
        <Label>Doğum tarihi</Label>
        <Input name="birthDate" type="date" defaultValue={staff.birthDate ?? ""} />
      </div>
      <div>
        <Label>Şube</Label>
        <Select name="branchId" defaultValue={staff.branchId ?? ""}>
          <option value="">—</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.shortName}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Durum</Label>
        <Select name="status" defaultValue={staff.status}>
          <option value="active">Aktif</option>
          <option value="on_leave">İzinli</option>
          <option value="passive">Pasif</option>
          <option value="terminated">İşten ayrıldı</option>
        </Select>
      </div>
      <div>
        <Label>İstihdam türü</Label>
        <Select name="employmentType" defaultValue={staff.employmentType ?? ""}>
          <option value="">—</option>
          {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Departman</Label>
        <Input name="department" defaultValue={staff.department ?? ""} />
      </div>
      <div>
        <Label>Personel numarası</Label>
        <Input name="employeeNumber" defaultValue={staff.employeeNumber ?? ""} />
      </div>
      <div>
        <Label>İşe başlama tarihi</Label>
        <Input name="hireDate" type="date" defaultValue={staff.hireDate ?? ""} />
      </div>
      <div>
        <Label>İşten ayrılma tarihi</Label>
        <Input name="terminationDate" type="date" defaultValue={staff.terminationDate ?? ""} />
      </div>

      <div className="sm:col-span-2 lg:col-span-3 mt-2 border-t border-[var(--color-border)] pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Sözleşme ve SGK
        </p>
      </div>
      <div>
        <Label>Sözleşme başlangıcı</Label>
        <Input name="contractStartDate" type="date" defaultValue={staff.contractStartDate ?? ""} />
      </div>
      <div>
        <Label>Sözleşme bitişi</Label>
        <Input name="contractEndDate" type="date" defaultValue={staff.contractEndDate ?? ""} />
      </div>
      <div>
        <Label>SGK durumu</Label>
        <Input name="sgkStatus" placeholder="Serbest metin" defaultValue={staff.sgkStatus ?? ""} />
      </div>

      <div className="sm:col-span-2 lg:col-span-3 mt-2 border-t border-[var(--color-border)] pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Acil durum</p>
      </div>
      <div>
        <Label>Acil durum kişisi</Label>
        <Input name="emergencyContactName" defaultValue={staff.emergencyContactName ?? ""} />
      </div>
      <div>
        <Label>Acil durum telefonu</Label>
        <Input name="emergencyContactPhone" defaultValue={staff.emergencyContactPhone ?? ""} />
      </div>

      <div className="sm:col-span-2 lg:col-span-3 mt-2 border-t border-[var(--color-border)] pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Hassas kimlik / finans (yalnızca değiştirmek için doldurun)
        </p>
      </div>
      <div>
        <Label>T.C. kimlik no</Label>
        <Input name="nationalId" placeholder="Değiştirmek için girin" />
      </div>
      <div>
        <Label>IBAN</Label>
        <Input name="iban" placeholder="TR.. (değiştirmek için girin)" />
      </div>
      <div>
        <Label>Yıllık izin hakkı (gün)</Label>
        <Input name="annualLeaveAllowanceDays" type="number" min={0} defaultValue={staff.annualLeaveAllowanceDays ?? ""} />
      </div>
      <div>
        <Label>Yıllık avans limiti</Label>
        <Input name="annualAdvanceLimit" type="number" min={0} defaultValue={staff.annualAdvanceLimit ?? ""} />
      </div>
      <div>
        <Label>Aylık maaş</Label>
        <Input name="monthlySalary" type="number" min={0} defaultValue={staff.monthlySalary ?? ""} />
      </div>
      <div>
        <Label>Saatlik ücret</Label>
        <Input name="hourlyRate" type="number" min={0} defaultValue={staff.hourlyRate ?? ""} />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <Label>Özlük notları (yalnız yönetici görür)</Label>
        <Input name="personnelNotes" defaultValue={staff.personnelNotes ?? ""} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Label>Genel not</Label>
        <Input name="notes" defaultValue={staff.notes ?? ""} />
      </div>

      {error ? <p className="text-xs font-medium text-rose-600 sm:col-span-2 lg:col-span-3">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-600 sm:col-span-2 lg:col-span-3">Kaydedildi.</p> : null}
      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
