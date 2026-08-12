"use client";

/**
 * Package D — öğretmen özlük/idari alanları + ek şube ataması + T.C. kimlik
 * girişi. Yalnızca SCHOOL_ADMIN/SUPER_ADMIN render edilir (çağıran taraftan);
 * backend'de de yalnız bu roller yazabilir (`updateTeacherProfileTool`/
 * `setNationalIdTool` RBAC'ı) — bu bileşen ikinci bir savunma katmanıdır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { actionUpdateTeacherProfile, actionSetNationalId } from "@/lib/actions";

export type TeacherProfileEditorBranch = { id: string; name: string };

export function TeacherProfileEditor({
  teacherId,
  primaryBranchId,
  branches,
  initial,
  hasNationalId,
  onSaved,
}: {
  teacherId: string;
  primaryBranchId: string;
  branches: TeacherProfileEditorBranch[];
  /** Called after a successful save (e.g. to collapse the section back to read-only). */
  onSaved?: () => void;
  initial: {
    name: string;
    email?: string;
    phone?: string;
    branchIds?: string[];
    employmentType?: "tam_zamanli" | "yari_zamanli" | "serbest";
    hireDate?: string;
    terminationDate?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    address?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    personnelNotes?: string;
  };
  hasNationalId: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [branchIds, setBranchIds] = useState<string[]>(initial.branchIds ?? []);
  const [employmentType, setEmploymentType] = useState(initial.employmentType ?? "");
  const [hireDate, setHireDate] = useState(initial.hireDate ?? "");
  const [terminationDate, setTerminationDate] = useState(initial.terminationDate ?? "");
  const [contractStartDate, setContractStartDate] = useState(initial.contractStartDate ?? "");
  const [contractEndDate, setContractEndDate] = useState(initial.contractEndDate ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(initial.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(initial.emergencyContactPhone ?? "");
  const [personnelNotes, setPersonnelNotes] = useState(initial.personnelNotes ?? "");
  const [nationalId, setNationalId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleBranch(branchId: string) {
    setBranchIds((prev) => (prev.includes(branchId) ? prev.filter((b) => b !== branchId) : [...prev, branchId]));
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await actionUpdateTeacherProfile({
        teacherId,
        name,
        email: email || undefined,
        phone: phone || undefined,
        branchIds,
        employmentType: (employmentType || undefined) as
          | "tam_zamanli"
          | "yari_zamanli"
          | "serbest"
          | undefined,
        hireDate: hireDate || undefined,
        terminationDate: terminationDate || undefined,
        contractStartDate: contractStartDate || undefined,
        contractEndDate: contractEndDate || undefined,
        address: address || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        personnelNotes: personnelNotes || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (nationalId.trim()) {
        const idResult = await actionSetNationalId({ entity: "teacher", entityId: teacherId, nationalId });
        if (!idResult.ok) {
          setError(idResult.message);
          return;
        }
        setNationalId("");
      }
      setSaved(true);
      router.refresh();
      onSaved?.();
    });
  }

  const otherBranches = branches.filter((b) => b.id !== primaryBranchId);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Ad soyad</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>E-posta</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Telefon</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xxxx" />
      </div>
      {!hasNationalId ? (
        <div>
          <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
          <Input
            inputMode="numeric"
            maxLength={11}
            placeholder="11 haneli"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
          />
        </div>
      ) : null}

      {otherBranches.length > 0 ? (
        <div>
          <Label>Ek atanmış şubeler (birincil şube her zaman dahildir)</Label>
          <div className="flex flex-wrap gap-2">
            {otherBranches.map((b) => (
              <label key={b.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={() => toggleBranch(b.id)}
                  className="h-3.5 w-3.5"
                />
                {b.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Çalışma türü</Label>
          <Select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
          >
            <option value="">Belirtilmemiş</option>
            <option value="tam_zamanli">Tam zamanlı</option>
            <option value="yari_zamanli">Yarı zamanlı</option>
            <option value="serbest">Serbest</option>
          </Select>
        </div>
        <div>
          <Label>İşe giriş tarihi</Label>
          <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Ayrılış tarihi</Label>
          <Input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
        </div>
        <div />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Sözleşme başlangıç</Label>
          <Input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} />
        </div>
        <div>
          <Label>Sözleşme bitiş</Label>
          <Input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Adres</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Acil durum kişisi</Label>
          <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
        </div>
        <div>
          <Label>Acil durum telefonu</Label>
          <Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Özlük notu</Label>
        <Input value={personnelNotes} onChange={(e) => setPersonnelNotes(e.target.value)} />
      </div>

      <Button type="button" variant="secondary" disabled={pending} onClick={onSave}>
        {pending ? "Kaydediliyor…" : "Özlük bilgilerini kaydet"}
      </Button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {saved ? <p className="text-xs font-medium text-emerald-600">Kaydedildi.</p> : null}
    </div>
  );
}
