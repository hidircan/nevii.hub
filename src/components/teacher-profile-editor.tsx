"use client";

/**
 * Package D — öğretmen genel (ad, doğum tarihi, eğitim, günlük limit),
 * iletişim, özlük/idari alanları + ek şube ataması + T.C. kimlik girişi. Yalnızca SCHOOL_ADMIN/SUPER_ADMIN render edilir (çağıran taraftan);
 * backend'de de yalnız bu roller yazabilir (`updateTeacherProfileTool`/
 * `setNationalIdTool` RBAC'ı) — bu bileşen ikinci bir savunma katmanıdır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { actionUpdateTeacherProfile, actionSetNationalId, actionInviteTeacherAccount } from "@/lib/actions";

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
    birthDate?: string;
    highSchool?: string;
    university?: string;
    graduationYear?: number;
    maxDailyLessons?: number;
  };
  hasNationalId: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [primaryId, setPrimaryId] = useState(primaryBranchId);
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
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [highSchool, setHighSchool] = useState(initial.highSchool ?? "");
  const [university, setUniversity] = useState(initial.university ?? "");
  const [graduationYear, setGraduationYear] = useState(initial.graduationYear ? String(initial.graduationYear) : "");
  const [maxDailyLessons, setMaxDailyLessons] = useState(initial.maxDailyLessons ? String(initial.maxDailyLessons) : "");
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
        branchId: primaryId,
        branchIds: branchIds.filter((b) => b !== primaryId),
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
        birthDate: birthDate || undefined,
        highSchool: highSchool || undefined,
        university: university || undefined,
        graduationYear: graduationYear ? Number(graduationYear) : undefined,
        maxDailyLessons: maxDailyLessons ? Number(maxDailyLessons) : undefined,
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Doğum tarihi</Label>
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div>
          <Label>Günlük ders limiti</Label>
          <Input type="number" min={1} max={20} value={maxDailyLessons} onChange={(e) => setMaxDailyLessons(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Lise</Label>
          <Input value={highSchool} onChange={(e) => setHighSchool(e.target.value)} />
        </div>
        <div>
          <Label>Üniversite</Label>
          <Input value={university} onChange={(e) => setUniversity(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Mezuniyet yılı</Label>
        <Input type="number" min={1950} max={2100} value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} />
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

      <div>
        <Label>Birincil şube</Label>
        <Select
          value={primaryId}
          onChange={(e) => {
            // Eski birincil şube ek şube olarak kalır — mevcut dersleri sahipsiz kalmasın.
            const prev = primaryId;
            setBranchIds((ids) => (ids.includes(prev) ? ids : [...ids, prev]));
            setPrimaryId(e.target.value);
          }}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      {branches.length > 1 ? (
        <div>
          <Label>Ders verdiği şubeler (birden fazla seçilebilir)</Label>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => {
              const isPrimary = b.id === primaryId;
              return (
                <label key={b.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={isPrimary || branchIds.includes(b.id)}
                    disabled={isPrimary}
                    onChange={() => toggleBranch(b.id)}
                    className="h-3.5 w-3.5"
                  />
                  {b.name}
                  {isPrimary ? <span className="text-[var(--color-text-muted)]">(birincil)</span> : null}
                </label>
              );
            })}
          </div>
          {primaryId !== primaryBranchId ? (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Birincil şube değişiyor. Eski şube ek şube olarak işaretli bırakıldı; öğretmen artık orada ders vermeyecekse
              işaretini kaldırın (o şubedeki mevcut dersler silinmez).
            </p>
          ) : null}
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
        {pending ? "Kaydediliyor…" : "Öğretmen bilgilerini kaydet"}
      </Button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {saved ? <p className="text-xs font-medium text-emerald-600">Kaydedildi.</p> : null}

      {initial.email ? <TeacherAccountInvite teacherId={teacherId} /> : null}
    </div>
  );
}

/**
 * Faz 4 — öğretmen hesap daveti. Hiçbir şifre gösterilmez/e-postalanmaz;
 * öğretmen `/hesap-aktivasyon` linkiyle kendi şifresini belirler
 * (bkz. `inviteTeacherAccountTool`, `StudentPortalInvite` ile AYNI desen).
 */
function TeacherAccountInvite({ teacherId }: { teacherId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ delivered: boolean; blocked?: boolean } | null>(null);

  function onInvite() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await actionInviteTeacherAccount({ teacherId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStatus({ delivered: result.delivered, blocked: result.blocked });
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-[var(--color-border)] p-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Öğretmen Portalı erişimi</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {status ? (
        status.delivered ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
            Davet e-postası gönderildi. Öğretmen linke tıklayıp kendi şifresini belirleyene kadar hesap pasif kalır.
          </p>
        ) : (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı (SMTP) yapılandırılmamış.
          </p>
        )
      ) : null}
      <Button type="button" onClick={onInvite} disabled={pending} variant="secondary">
        {pending ? "Gönderiliyor..." : "Giriş daveti gönder"}
      </Button>
    </div>
  );
}
