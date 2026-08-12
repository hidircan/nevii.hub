"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { actionSetNationalId, actionUpdateStudentProfile } from "@/lib/actions";
import { EDUCATION_METHODS } from "@/lib/types";

export type StudentProfileEditorBranch = { id: string; name: string };

type FieldErrors = Partial<
  Record<
    | "name"
    | "email"
    | "branchId"
    | "educationMethod"
    | "phone"
    | "parentName"
    | "parentPhone"
    | "birthDate"
    | "nationalId",
    string
  >
>;

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function validateStudentForm(input: {
  name: string;
  email: string;
  branchId: string;
  educationMethod: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  birthDate: string;
  nationalId: string;
}) {
  const errors: FieldErrors = {};

  if (!input.name.trim()) errors.name = "Öğrenci adı boş bırakılamaz.";
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = "Geçerli bir e-posta adresi girin. Örnek: ad@kurum.com";
  }
  if (!input.branchId.trim()) errors.branchId = "Devam etmek için bir şube seçin.";
  if (
    input.educationMethod.trim() &&
    !EDUCATION_METHODS.includes(input.educationMethod as (typeof EDUCATION_METHODS)[number])
  ) {
    errors.educationMethod = "Geçerli bir eğitim metodu seçin.";
  }
  if (!input.phone.trim()) errors.phone = "Öğrenci telefonu boş bırakılamaz.";
  if (!input.parentName.trim()) errors.parentName = "Veli adı boş bırakılamaz.";
  if (!input.parentPhone.trim()) errors.parentPhone = "Veli telefonu boş bırakılamaz.";
  if (input.birthDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate.trim())) {
    errors.birthDate = "Doğum tarihini takvimden seçin.";
  }
  if (input.nationalId.trim() && normalizeDigits(input.nationalId).length !== 11) {
    errors.nationalId = "T.C. kimlik numarası 11 haneli olmalı ve yalnızca rakam içermelidir.";
  }

  return errors;
}

function resolveFriendlyError(message: string) {
  if (message.includes("Invalid input")) {
    return "Kaydetme başarısız oldu. Lütfen işaretli alanları kontrol edin; özellikle e-posta, şube, telefon, tarih ve T.C. kimlik no alanlarını düzeltin.";
  }
  return message;
}

function inputClassName(hasError: boolean) {
  return hasError ? "border-red-500 focus-visible:outline-red-500" : undefined;
}

export function StudentProfileEditor({
  studentId,
  branches,
  initial,
  hasNationalId = false,
  onSaved,
}: {
  studentId: string;
  branches: StudentProfileEditorBranch[];
  initial: {
    name: string;
    email?: string;
    branchId?: string;
    educationMethod?: string;
    phone: string;
    parentName: string;
    parentPhone: string;
    motherName?: string;
    fatherName?: string;
    address?: string;
    birthDate?: string;
    birthPlace?: string;
    schoolOrOccupation?: string;
    communicationOptOut?: boolean;
  };
  hasNationalId?: boolean;
  /** Called after a successful save (e.g. to collapse the section back to read-only). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [branchId, setBranchId] = useState(initial.branchId ?? "");
  const [educationMethod, setEducationMethod] = useState(initial.educationMethod ?? "");
  const [phone, setPhone] = useState(initial.phone);
  const [parentName, setParentName] = useState(initial.parentName);
  const [parentPhone, setParentPhone] = useState(initial.parentPhone);
  const [motherName, setMotherName] = useState(initial.motherName ?? "");
  const [fatherName, setFatherName] = useState(initial.fatherName ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate?.slice(0, 10) ?? "");
  const [birthPlace, setBirthPlace] = useState(initial.birthPlace ?? "");
  const [schoolOrOccupation, setSchoolOrOccupation] = useState(initial.schoolOrOccupation ?? "");
  const [communicationOptOut, setCommunicationOptOut] = useState(!!initial.communicationOptOut);
  const [nationalId, setNationalId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSave() {
    setError(null);
    setSaved(false);

    const nextErrors = validateStudentForm({
      name,
      email,
      branchId,
      educationMethod,
      phone,
      parentName,
      parentPhone,
      birthDate,
      nationalId,
    });

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setError("Lütfen işaretli alanları düzeltip tekrar kaydedin.");
      return;
    }

    startTransition(async () => {
      const result = await actionUpdateStudentProfile({
        studentId,
        name,
        email: email || undefined,
        branchId: branchId || undefined,
        educationMethod: educationMethod || undefined,
        phone,
        parentName,
        parentPhone,
        motherName: motherName || undefined,
        fatherName: fatherName || undefined,
        address: address || undefined,
        birthDate: birthDate || undefined,
        birthPlace: birthPlace || undefined,
        schoolOrOccupation: schoolOrOccupation || undefined,
        communicationOptOut,
      });

      if (!result.ok) {
        setError(resolveFriendlyError(result.message));
        return;
      }

      if (nationalId.trim()) {
        const idResult = await actionSetNationalId({
          entity: "student",
          entityId: studentId,
          nationalId: normalizeDigits(nationalId),
        });

        if (!idResult.ok) {
          setFieldErrors((prev) => ({
            ...prev,
            nationalId: resolveFriendlyError(idResult.message),
          }));
          setError(resolveFriendlyError(idResult.message));
          return;
        }

        setNationalId("");
      }

      setFieldErrors({});
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
          <Input className={inputClassName(!!fieldErrors.name)} value={name} onChange={(e) => setName(e.target.value)} />
          {fieldErrors.name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <Label>E-posta</Label>
          <Input className={inputClassName(!!fieldErrors.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Şube</Label>
          <Select className={inputClassName(!!fieldErrors.branchId)} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Şube seçin</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {fieldErrors.branchId ? <p className="mt-1 text-xs text-red-600">{fieldErrors.branchId}</p> : null}
        </div>

        <div>
          <Label>Eğitim metodu</Label>
          <Select className={inputClassName(!!fieldErrors.educationMethod)} value={educationMethod} onChange={(e) => setEducationMethod(e.target.value)}>
            <option value="">Belirtilmemiş</option>
            {EDUCATION_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          {fieldErrors.educationMethod ? <p className="mt-1 text-xs text-red-600">{fieldErrors.educationMethod}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Öğrenci telefonu</Label>
          <Input className={inputClassName(!!fieldErrors.phone)} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xxxx" />
          {fieldErrors.phone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p> : null}
        </div>

        <div>
          <Label>Doğum tarihi</Label>
          <Input className={inputClassName(!!fieldErrors.birthDate)} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          {fieldErrors.birthDate ? <p className="mt-1 text-xs text-red-600">{fieldErrors.birthDate}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Veli adı</Label>
          <Input className={inputClassName(!!fieldErrors.parentName)} value={parentName} onChange={(e) => setParentName(e.target.value)} />
          {fieldErrors.parentName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.parentName}</p> : null}
        </div>

        <div>
          <Label>Veli telefonu</Label>
          <Input className={inputClassName(!!fieldErrors.parentPhone)} value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="05xx xxx xxxx" />
          {fieldErrors.parentPhone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.parentPhone}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Anne adı</Label>
          <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} />
        </div>
        <div>
          <Label>Baba adı</Label>
          <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Doğum yeri</Label>
          <Input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
        </div>
        <div>
          <Label>Okul / Meslek</Label>
          <Input value={schoolOrOccupation} onChange={(e) => setSchoolOrOccupation(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Adres</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      <div>
        <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
        <Input
          className={inputClassName(!!fieldErrors.nationalId)}
          inputMode="numeric"
          maxLength={11}
          placeholder={hasNationalId ? "Yeni numara girerek güncelleyebilirsiniz" : "11 haneli"}
          value={nationalId}
          onChange={(e) => setNationalId(normalizeDigits(e.target.value))}
        />
        {fieldErrors.nationalId ? <p className="mt-1 text-xs text-red-600">{fieldErrors.nationalId}</p> : null}
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {hasNationalId
            ? "Sistemde kayıtlı bir T.C. kimlik no var. Yeni numara girerseniz mevcut kayıt güncellenir."
            : "T.C. kimlik numarası şifreli olarak saklanır."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
        <input type="checkbox" checked={communicationOptOut} onChange={(e) => setCommunicationOptOut(e.target.checked)} />
        Tahsilat / hatırlatma mesajlarından çıkar
      </label>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {saved ? <p className="text-xs text-emerald-600">Kaydedildi.</p> : null}

      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Kaydediliyor..." : "Bilgileri Kaydet"}
        </Button>
      </div>
    </div>
  );
}
