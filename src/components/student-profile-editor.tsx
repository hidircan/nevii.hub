"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  actionProvisionStudentPortalAccess,
  actionInviteStudentPortalAccess,
  actionSetNationalId,
  actionUpdateStudentProfile,
} from "@/lib/actions";
import { EDUCATION_METHODS, STUDENT_TYPES, REFERRAL_SOURCES, REFERRAL_SOURCE_LABELS } from "@/lib/types";
import type { ReferralSource, StudentType } from "@/lib/types";

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
  /**
   * P0 (2026-09-05, ikinci tur) — hangi telefon/ad alanının GERÇEKTEN
   * zorunlu olduğunu ödeme/iletişim muhatabı belirler; kayıt formuyla
   * (`new-student-form.tsx`) ve sunucu şemasıyla (`validation.ts`
   * studentSchema `.refine`'ları) AYNI kural. Bu ekran daha önce üçünü de
   * koşulsuz zorunlu tutuyordu — kayıt ekranında girilmesi gerekmeyen bir
   * alan, düzenlemede kaydı bloke ediyordu.
   */
  accountResponsibility: "PARENT_MANAGED" | "SELF_MANAGED";
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
  const parentIsResponsible = input.accountResponsibility === "PARENT_MANAGED";
  if (!parentIsResponsible && !input.phone.trim()) {
    errors.phone = "Öğrenci telefonu zorunludur — ödeme/iletişim muhatabı öğrencinin kendisi olarak seçili.";
  }
  if (parentIsResponsible && !input.parentName.trim()) {
    errors.parentName = "Veli adı soyadı zorunludur — ödeme/iletişim muhatabı veli olarak seçili.";
  }
  if (parentIsResponsible && !input.parentPhone.trim()) {
    errors.parentPhone = "Veli telefonu zorunludur — ödeme/iletişim muhatabı veli olarak seçili.";
  }
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
  showPortalInvite = true,
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
    /** P1 revizyonu — "Bizi nereden buldunuz?" (opsiyonel; Diğer'de serbest metin). */
    referralSource?: ReferralSource;
    referralSourceDetail?: string;
    communicationOptOut?: boolean;
    /** P0 (2026-09-05) — kayıt tarihi ve DERS BAŞLANGIÇ tarihi ayrı iki alan. */
    enrollmentStartDate?: string;
    lessonStartDate?: string;
    accountResponsibility?: "PARENT_MANAGED" | "SELF_MANAGED";
    /** Faz 1B — birden fazla öğrenci türü; boşsa "hiç seçilmemiş" demektir. */
    studentTypes?: StudentType[];
  };
  hasNationalId?: boolean;
  /** Called after a successful save (e.g. to collapse the section back to read-only). */
  onSaved?: () => void;
  /** Bu bileşen aynı sayfada birden fazla yerde render edilebiliyor — davet widget'ı yalnızca birinde gösterilsin. */
  showPortalInvite?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [branchId, setBranchId] = useState(initial.branchId ?? "");
  const [educationMethod, setEducationMethod] = useState(initial.educationMethod ?? "");
  const [studentTypes, setStudentTypes] = useState<StudentType[]>(initial.studentTypes ?? []);
  const [phone, setPhone] = useState(initial.phone);
  const [parentName, setParentName] = useState(initial.parentName);
  const [parentPhone, setParentPhone] = useState(initial.parentPhone);
  const [motherName, setMotherName] = useState(initial.motherName ?? "");
  const [fatherName, setFatherName] = useState(initial.fatherName ?? "");
  const [referralSource, setReferralSource] = useState<"" | ReferralSource>(initial.referralSource ?? "");
  const [referralSourceDetail, setReferralSourceDetail] = useState(initial.referralSourceDetail ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate?.slice(0, 10) ?? "");
  const [birthPlace, setBirthPlace] = useState(initial.birthPlace ?? "");
  const [schoolOrOccupation, setSchoolOrOccupation] = useState(initial.schoolOrOccupation ?? "");
  const [communicationOptOut, setCommunicationOptOut] = useState(!!initial.communicationOptOut);
  // P0 (2026-09-05) — sözleşme adımından "Öğrenci Kaydını Düzenle" ile dönen
  // kullanıcı bu iki tarihi buradan düzeltir; ilk tahsilat/sözleşme önizlemesi
  // dönüşte TAZE veriyle yeniden hesaplanır (bkz. resolveLessonStartDay).
  const [enrollmentStartDate, setEnrollmentStartDate] = useState(initial.enrollmentStartDate?.slice(0, 10) ?? "");
  const [lessonStartDate, setLessonStartDate] = useState(initial.lessonStartDate?.slice(0, 10) ?? "");
  const [accountResponsibility, setAccountResponsibility] = useState(
    initial.accountResponsibility ?? "PARENT_MANAGED"
  );
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
      accountResponsibility,
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
        referralSource: referralSource || undefined,
        referralSourceDetail: referralSourceDetail || undefined,
        address: address || undefined,
        birthDate: birthDate || undefined,
        birthPlace: birthPlace || undefined,
        schoolOrOccupation: schoolOrOccupation || undefined,
        communicationOptOut,
        enrollmentStartDate: enrollmentStartDate || undefined,
        lessonStartDate: lessonStartDate || undefined,
        accountResponsibility,
        studentTypes,
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

      <div>
        <Label>Öğrenci türleri (birden fazla seçilebilir)</Label>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {STUDENT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={studentTypes.includes(t)}
                onChange={(e) =>
                  setStudentTypes((prev) => (e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)))
                }
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Öğrenci telefonu{accountResponsibility === "PARENT_MANAGED" ? " (opsiyonel)" : ""}</Label>
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
          <Label>Veli adı{accountResponsibility === "SELF_MANAGED" ? " (opsiyonel)" : ""}</Label>
          <Input className={inputClassName(!!fieldErrors.parentName)} value={parentName} onChange={(e) => setParentName(e.target.value)} />
          {fieldErrors.parentName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.parentName}</p> : null}
        </div>

        <div>
          <Label>Veli telefonu{accountResponsibility === "SELF_MANAGED" ? " (opsiyonel)" : ""}</Label>
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

      <div>
        <Label>Bizi nereden buldunuz? (opsiyonel)</Label>
        <Select
          value={referralSource}
          onChange={(e) => setReferralSource(e.target.value as "" | ReferralSource)}
        >
          <option value="">Seçiniz (opsiyonel)</option>
          {REFERRAL_SOURCES.map((value) => (
            <option key={value} value={value}>
              {REFERRAL_SOURCE_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      {referralSource === "diger" ? (
        <div>
          <Label>Kaynak açıklaması (opsiyonel)</Label>
          <Input
            value={referralSourceDetail}
            onChange={(e) => setReferralSourceDetail(e.target.value)}
            placeholder="Örn. komşumuz Ayşe Hanım önerdi"
          />
        </div>
      ) : null}

      {/*
        P0 (2026-09-05) — KAYIT tarihi ile DERS BAŞLANGIÇ tarihi ayrı iki
        alandır; ilk tahsilat/sözleşme dönemi ders başlangıcından itibaren
        hesaplanır (bkz. resolveLessonStartDay, period-lesson-billing.ts).
      */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Kayıt tarihi</Label>
          <Input type="date" value={enrollmentStartDate} onChange={(e) => setEnrollmentStartDate(e.target.value)} />
        </div>
        <div>
          <Label>Ders başlangıç tarihi</Label>
          <Input type="date" value={lessonStartDate} onChange={(e) => setLessonStartDate(e.target.value)} />
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Boş bırakılırsa kayıt tarihi geçerlidir. İlk tahsilat yalnızca bu tarihten sonraki dersleri sayar.
          </p>
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

      <div>
        <Label>Ödeme/iletişim muhatabı</Label>
        <Select
          value={accountResponsibility}
          onChange={(e) => setAccountResponsibility(e.target.value as "PARENT_MANAGED" | "SELF_MANAGED")}
        >
          <option value="PARENT_MANAGED">Veli</option>
          <option value="SELF_MANAGED">Öğrencinin kendisi</option>
        </Select>
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

      {showPortalInvite ? <StudentPortalInvite studentId={studentId} defaultEmail={email} /> : null}
    </div>
  );
}

/**
 * Karma Öğrenci Portalı — "Portal erişimi oluştur / davet gönder"; kayıt
 * oluşturma anındaki checkbox'tan bağımsız, sonradan tetiklenebilen İKİNCİ
 * bilinçli admin aksiyonu (task #34). Faz 4 — iki mod: "E-posta ile davet"
 * (varsayılan, önerilen — hiçbir şifre admin'e/e-postaya açık gösterilmez,
 * kullanıcı `/hesap-aktivasyon` linkiyle KENDİ şifresini belirler) veya
 * "Anında erişim" (eski davranış — geçici şifre TEK SEFERLİK gösterilir,
 * admin elden/WhatsApp ile iletir; SMTP yapılandırılmamış ortamlarda yedek).
 */
function StudentPortalInvite({ studentId, defaultEmail }: { studentId: string; defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [accessType, setAccessType] = useState<"SELF" | "GUARDIAN">("SELF");
  const [mode, setMode] = useState<"email" | "instant">("email");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{ delivered: boolean; blocked?: boolean } | null>(null);

  function onInvite() {
    setError(null);
    setTempPassword(null);
    setEmailStatus(null);
    if (!email.trim()) {
      setError("Davet göndermek için bir e-posta adresi girin.");
      return;
    }
    startTransition(async () => {
      if (mode === "email") {
        const result = await actionInviteStudentPortalAccess({ studentId, email: email.trim(), accessType });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setEmailStatus({ delivered: result.delivered, blocked: result.blocked });
        return;
      }
      const result = await actionProvisionStudentPortalAccess({ studentId, email: email.trim(), accessType });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTempPassword(result.tempLoginPassword ?? null);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-[var(--color-border)] p-3">
      <p className="text-sm font-medium text-[var(--color-text)]">Öğrenci Portalı erişimi</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>E-posta</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@email.com" />
        </div>
        <div>
          <Label>Erişim türü</Label>
          <Select value={accessType} onChange={(e) => setAccessType(e.target.value as "SELF" | "GUARDIAN")}>
            <option value="SELF">Öğrencinin kendisi</option>
            <option value="GUARDIAN">Veli</option>
          </Select>
        </div>
      </div>
      <div>
        <Label>Yöntem</Label>
        <Select value={mode} onChange={(e) => setMode(e.target.value as "email" | "instant")}>
          <option value="email">E-posta ile davet gönder (kullanıcı kendi şifresini oluşturur)</option>
          <option value="instant">Anında erişim (geçici şifre bir kez gösterilir)</option>
        </Select>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {tempPassword ? (
        <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 p-2">
          <p className="text-xs text-emerald-800">
            Erişim oluşturuldu. Geçici şifre (yalnızca ŞİMDİ görünür, bir daha gösterilmez):{" "}
            <strong>{tempPassword}</strong>
          </p>
          <p className="text-[11px] text-emerald-700">
            Şifreyi kopyalayıp ilgili kişiye elden/WhatsApp ile iletin, ardından kapatın.
          </p>
          <Button variant="ghost" onClick={() => setTempPassword(null)}>
            Kapat
          </Button>
        </div>
      ) : null}
      {emailStatus ? (
        emailStatus.delivered ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
            Davet e-postası gönderildi. Kullanıcı linke tıklayıp kendi şifresini belirleyene kadar erişim
            &quot;davet edildi&quot; durumunda kalır.
          </p>
        ) : (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı (SMTP)
            yapılandırılmamış. Üretim ortamında SMTP eklenene kadar &quot;Anında erişim&quot; yöntemini kullanın.
          </p>
        )
      ) : null}
      <Button onClick={onInvite} disabled={pending} variant="secondary">
        {pending ? "Gönderiliyor..." : "Portal erişimi oluştur / davet gönder"}
      </Button>
    </div>
  );
}
