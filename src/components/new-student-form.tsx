"use client";

/**
 * P0-2 (2026-08-29, "Invalid input" runtime hatası düzeltmesi) — bu form
 * ÖNCEDEN `yeni/page.tsx` içinde düz `<form action={actionAddStudent}>`
 * (useActionState YOK) olarak yaşıyordu; herhangi bir doğrulama hatası
 * `actionAddStudent`'ın THROW etmesine ve bunun da yakalanmamış bir sunucu
 * action hatası olarak istemciye "Runtime Error" şeklinde sızmasına yol
 * açıyordu — form KAYBOLUYOR, girilen veriler SİLİNİYORDU.
 *
 * Artık `useActionState` kullanır: `actionAddStudent` normal kullanıcı
 * hatalarında (eksik/geçersiz alan, iş kuralı ihlali) ASLA throw etmez,
 * `NewStudentFormState` döner. React bu durumda formu YENİDEN MONTE ETMEZ —
 * uncontrolled input'ların DOM değerleri KORUNUR, yalnızca hata state'i
 * güncellenir. Alan bazlı hatalar ilgili alanın altında, genel özet üstte
 * (role="alert", odak otomatik taşınır) gösterilir. `isPending` ile submit
 * butonu devre dışı bırakılır — çift submit duplicate kayıt OLUŞTURMAZ.
 */


import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { actionAddStudent, type NewStudentFormState } from "@/lib/actions";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { ClubRegistrationCard, type ClubOption } from "@/components/club-registration-card";
import { NewStudentEnrollments, EnrollmentReview, enrollmentCardId } from "@/components/new-student-enrollments";
import { REFERRAL_SOURCES, REFERRAL_SOURCE_LABELS } from "@/lib/types";
import type { StudentTermType } from "@/lib/types";
import {
  emptyEnrollmentDraft,
  parseEnrollmentDraftsJson,
  summarizeEnrollmentErrors,
  validateEnrollmentDrafts,
  type EnrollmentDraft,
  type EnrollmentFieldErrors,
} from "@/lib/enrollment-form";
import { computeEnrollmentDerived, type EnrollmentFormContext } from "@/lib/enrollment-form-context";

type KvkkTextOption = { version: number; bodyText: string };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

/** P0-C — tüm zorunlu alan etiketlerinde AYNI görsel işaretçi (kırmızı `*`, ekran okuyucu için erişilebilir). */
function RequiredMark() {
  return (
    <span className="text-rose-600" aria-hidden="true">
      {" "}
      *
    </span>
  );
}


export function NewStudentForm({
  enrollmentContext,
  kvkkText,
  prefill,
  trialSummary,
  clubs = [],
}: {
  /** 2026-10-05 — aktif kulüpler (kayıt türü Kurs + Kulüp / Sadece kulüp). */
  clubs?: ClubOption[];
  /** H — deneme dersinden dönüşümde formun ön değerleri (kullanıcı hâlâ düzenler). */
  prefill?: Record<string, string>;
  /** Ön doldurmanın kaynağı — formun üstünde bilgi bandı. */
  trialSummary?: string;
  /**
   * 2026-10-10 — branş formunun bağlamı (enstrüman/öğretmen/şube/paket/kampanya/çalışma günleri/ders eşiği). Üç ekran
   * (yeni kayıt, branş ekle, branş düzenle) AYNI bağlamla AYNI form bileşenini kullanır.
   */
  enrollmentContext: EnrollmentFormContext;
  kvkkText?: KvkkTextOption;
}) {
  const branches = enrollmentContext.branches;
  // Öğrencinin şubesi (kişi düzeyi) formda seçilir; branş kartlarındaki "Öğrencinin şubesi" seçeneği onu izler.
  const [personBranchId, setPersonBranchId] = useState(() => prefill?.branchId ?? branches[0]?.id ?? "");
  const ctx = useMemo(() => ({ ...enrollmentContext, personBranchId }), [enrollmentContext, personBranchId]);
  const [state, formAction, isPending] = useActionState<NewStudentFormState, FormData>(actionAddStudent, null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const fieldErrors = state?.fieldErrors ?? {};
  const hasError = !!state?.formError;
  // P0-4 — form action'ları başarı/hata fark etmeksizin uncontrolled alanları SIFIRLAR; kişi alanları `v(key)` ile geri
  // beslenir. Branş alanları kontrollüdür (durum `drafts`'ta) ve DOM'ları `EnrollmentFormFields` içinde geri yazılır.
  const values = state && "values" in state ? (state.values ?? {}) : {};
  const v = (key: string): string | undefined => values[key] ?? prefill?.[key];
  const checkedVal = (key: string, expected: string): boolean => v(key) === expected;
  // 2026-10-05 — Kayıt türü: kurs (varsayılan) | kurs + kulüp | sadece kulüp (kurs bölümleri devre dışı, gönderilmez).
  const [registrationKind, setRegistrationKind] = useState(() => v("registrationKind") || "course");
  const clubOnly = registrationKind === "club_only";

  const formRef = useRef<HTMLFormElement>(null);
  // P0-D — öğrenci e-postası/portal erişim türü CANLI izlenir ("Öğrencinin kendisi" seçiliyken davet e-postası senkron kalır).
  const [studentEmailLive, setStudentEmailLive] = useState(() => v("email") ?? "");
  const [portalAccessType, setPortalAccessType] = useState(() => v("invitePortalAccessType") || "GUARDIAN");
  const [accountResponsibility, setAccountResponsibility] = useState(() => v("accountResponsibility") || "PARENT_MANAGED");
  const [referralSource, setReferralSource] = useState(() => v("referralSource") ?? "");
  const [inviteToPortalChecked, setInviteToPortalChecked] = useState(() => checkedVal("inviteToPortal", "1"));
  const [useDifferentPortalEmail, setUseDifferentPortalEmail] = useState(
    () => portalAccessType === "SELF" && !!v("invitePortalEmail") && v("invitePortalEmail") !== v("email")
  );
  const [portalEmail, setPortalEmail] = useState(() => v("invitePortalEmail") ?? "");
  const portalEmailMirrorsStudent = portalAccessType === "SELF" && !useDifferentPortalEmail;
  const [termType, setTermType] = useState<StudentTermType>(() => (v("termType") === "yaz" ? "yaz" : "guz"));

  // 2026-10-10 — branş taslakları (kararlı anahtarlı). İlk branş deneme dersi/başvuru ön değerlerinden dolar; başka branşa
  // HİÇBİR değer kopyalanmaz. Hatalı gönderimden sonra aynı durum sayfada kalır (form yeniden monte edilmez).
  const [drafts, setDrafts] = useState<EnrollmentDraft[]>(() => {
    const restored = values.enrollments ? parseEnrollmentDraftsJson(values.enrollments) : null;
    if (restored?.ok) return restored.drafts;
    return [
      emptyEnrollmentDraft({
        instrument: prefill?.instrument ?? "",
        teacherId: prefill?.teacherId ?? "",
      }),
    ];
  });
  // Yeniden gönderim kimliği: aynı form oturumunda sabit; sunucu çift tık/yeniden denemeyi tek kayda indirger.
  const [registrationId] = useState(() => {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    return `reg_${c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`}`;
  });
  const [attempted, setAttempted] = useState(false);
  const [serverEnrollmentErrors, setServerEnrollmentErrors] = useState<Record<string, EnrollmentFieldErrors>>({});
  const [clientSummary, setClientSummary] = useState<string | null>(null);

  const suggestedByKey = useMemo(() => {
    const out: Record<string, number | undefined> = {};
    for (const d of drafts) out[d.key] = computeEnrollmentDerived(ctx, d, termType).suggestion?.suggestedAmount;
    return out;
  }, [drafts, ctx, termType]);
  const liveErrors = useMemo(() => validateEnrollmentDrafts(drafts, { mode: "register", suggestedByKey }), [drafts, suggestedByKey]);
  const shownErrors: Record<string, EnrollmentFieldErrors> = useMemo(() => {
    if (!attempted && Object.keys(serverEnrollmentErrors).length === 0) return {};
    const out: Record<string, EnrollmentFieldErrors> = {};
    for (const d of drafts) {
      const merged = { ...(attempted ? (liveErrors[d.key] ?? {}) : {}), ...(serverEnrollmentErrors[d.key] ?? {}) };
      if (Object.keys(merged).length > 0) out[d.key] = merged;
    }
    return out;
  }, [attempted, drafts, liveErrors, serverEnrollmentErrors]);

  function changeDrafts(next: EnrollmentDraft[]) {
    // Düzenlenen branşın sunucu hatası temizlenir (diğer branşların hatası kalır).
    setServerEnrollmentErrors((prev) => {
      const keep: Record<string, EnrollmentFieldErrors> = {};
      for (const d of next) {
        const before = drafts.find((x) => x.key === d.key);
        if (before === d && prev[d.key]) keep[d.key] = prev[d.key]!;
      }
      return keep;
    });
    setClientSummary(null);
    setDrafts(next);
  }

  /** Kişi alanlarından canlı izlenenler (kontrollü olmayan alanlar `onChange` ile okunur). */
  function syncLiveFields() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    setStudentEmailLive(String(fd.get("email") || ""));
    setPortalAccessType(String(fd.get("invitePortalAccessType") || "GUARDIAN"));
    setInviteToPortalChecked(fd.get("inviteToPortal") === "1");
    setPersonBranchId(String(fd.get("branchId") || ""));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (clubOnly) return;
    setAttempted(true);
    const errs = validateEnrollmentDrafts(drafts, { mode: "register", suggestedByKey });
    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      setClientSummary(`Branş bilgilerinde düzeltilmesi gereken alanlar var: ${summarizeEnrollmentErrors(drafts, errs, 3).join(" · ")}`);
      scrollToFirstEnrollmentError(errs);
    }
  }

  function scrollToFirstEnrollmentError(errs: Record<string, EnrollmentFieldErrors>) {
    const first = drafts.find((d) => errs[d.key]);
    if (!first) return;
    document.getElementById(enrollmentCardId(first.key))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Sunucu sonucu: branş hatalarını al, ilk hatalı branşa kaydır.
  useEffect(() => {
    const errs = state?.enrollmentErrors;
    if (errs && Object.keys(errs).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sunucu action sonucunu forma yansıtır
      setServerEnrollmentErrors(errs);
      scrollToFirstEnrollmentError(errs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // P0-A (2026-09-02) — GERÇEK kök neden (react-dom kaynağından doğrulandı,
  // bkz. `updateOptions`/`postMountWrapper` react-dom-client.development.js):
  // React 19 form action'ları tamamlandığında (başarı/hata fark etmeksizin)
  // native `<form>.reset()` çağırır. Metin `<input>`larında ZARARSIZDIR
  // (`.defaultValue` gerçekten `value` İÇERİK ATTRIBUTE'unu yansıtır, reset
  // doğru değere döner). AMA `<select>` için React eşleşen `<option>`'a
  // YALNIZ `.selected` IDL PROPERTY'sini yazar — `.defaultSelected`/`selected`
  // İÇERİK ATTRIBUTE'unu ASLA yazmaz — bu, controlled/uncontrolled/`key` ile
  // yeniden-mount fark etmeksizin GEÇERLİDİR (yeniden mount edilen bir
  // <select> bile, taze DOM node'unda AYNI eksik-attribute sorununu taşır).
  // Sonuç: tarayıcının native reset() algoritması hiçbir option'da
  // `defaultSelected` bulamaz ve HER ZAMAN ilk option'a ("Piyano" vb.) döner
  // — React'ın KENDİ state'i (ör. `instrument`) hâlâ doğru değeri bilir,
  // yalnız GÖRÜNEN DOM/bir sonraki submit'te taşınacak FormData yanlış olur.
  // `key` ile yeniden-mount denemesi (önceki deneme) BU YÜZDEN işe yaramadı.
  // Tek güvenilir çözüm: reset SONRASI, formdaki HER `<select>`/`<input>`ın
  // DOM değerini son GERÇEKTEN gönderilen `values`'tan (submit anında,
  // reset'ten ÖNCE `captureStudentFormValues` ile yakalanan FormData —
  // bkz. actions.ts) doğrudan DOM üzerinden GERİ YAZMAK. Tek noktadan tüm
  // alanlar için (yalnız enstrüman değil — aynı kusur `branchId`/`termType`/
  // `firstPaymentMethod`/`packageId`/`discountType` vb. HER <select>'i
  // etkiler), hidden/checkbox/radio hariç.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLSelectElement || el instanceof HTMLInputElement)) continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio" || el.type === "hidden")) {
        continue;
      }
      if (!el.name || !(el.name in values)) continue;
      const wanted = values[el.name];
      if (wanted !== undefined && el.value !== wanted) el.value = wanted;
    }
    // `values` bilerek deps dışı: bu efekt yalnız server action `state`
    // DEĞİŞTİĞİNDE (reset sonrası DOM'u son gönderilen değerlere geri
    // yazmak için) çalışmalı — her tuş vuruşunda `values` değiştiğinde
    // YENİDEN çalışırsa kullanıcı yazarken DOM'a müdahale eder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  // P0-C (2026-09-02) — üstteki genel özet ("Formda düzeltilmesi gereken
  // alanlar var") ODAKLANIR ama HANGİ alanın hatalı olduğunu göstermez;
  // kullanıcı formu elle kaydırıp bulmak zorunda kalıyordu. Alan-bazlı bir
  // hata varsa (ör. "İlk ödeme türü seçilmelidir", "Kayıt başlangıç tarihi
  // zorunludur") ilgili form kontrolüne (native `form.elements.namedItem` —
  // `name` ile eşleşen HERHANGİ bir alan/alan grubu için çalışır, ayrı ref
  // gerektirmez) otomatik kaydırılıp odaklanılır.
  useEffect(() => {
    const errorKeys = Object.keys(fieldErrors);
    const form = formRef.current;
    if (errorKeys.length === 0 || !form) return;
    for (const key of errorKeys) {
      const el = form.elements.namedItem(key);
      const target = el instanceof RadioNodeList ? el[0] : el;
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
        break;
      }
    }
    // `fieldErrors` bilerek deps dışı: aynı `state`ten türetilir, yalnız
    // `state` değiştiğinde (yeni submit sonucu) bir kez kaydırıp odaklanmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={() => syncLiveFields()}
      onSubmit={onSubmit}
      className="space-y-6"
      noValidate
    >
      {v("clubApplicationId") ? (
        <>
          <input type="hidden" name="clubApplicationId" value={v("clubApplicationId")} />
          <input type="hidden" name="clubApplicationClubId" value={v("clubApplicationClubId")} />
          <div className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-4 py-3 text-sm text-[var(--color-text)]">
            <p className="font-semibold">Grup dersi başvurusundan kayıt</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {trialSummary ?? "Bilgiler başvurudan dolduruldu."} Eksik zorunlu alanları siz tamamlayın; boş alanlar için değer uydurulmaz.
            </p>
          </div>
        </>
      ) : null}
      {v("convertedFromTrialId") ? (
        <>
          <input type="hidden" name="convertedFromTrialId" value={v("convertedFromTrialId")} />
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--color-trial)", background: "var(--color-trial-soft)", color: "var(--color-text)" }}
          >
            <p className="font-semibold">Deneme dersinden kayıt</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {trialSummary ?? "Bilgiler deneme kaydından dolduruldu."} Kaydı tamamladığınızda deneme &quot;kayda dönüştü&quot;
              olarak işaretlenir ve dönüşümü yapan kişi olarak siz kaydedilirsiniz.
            </p>
          </div>
        </>
      ) : null}
      {hasError ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.formError}
        </div>
      ) : null}

      {clubs.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Kayıt türü</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Kayıt türü">
            {[
              { key: "course", title: "Kurs", text: "Bireysel ders programı; sözleşme opsiyonel." },
              { key: "course_club", title: "Kurs + Kulüp", text: "Bireysel derslere ek olarak kulübe katılır." },
              { key: "club_only", title: "Sadece kulüp", text: "Bireysel ders ve sözleşme yok; yalnız kulüp ücreti." },
            ].map((k) => (
              <label
                key={k.key}
                className="cursor-pointer rounded-lg border px-3 py-2 text-sm"
                style={
                  registrationKind === k.key
                    ? { borderColor: "var(--color-primary)", background: "var(--color-primary-soft)" }
                    : { borderColor: "var(--color-border)" }
                }
              >
                <input
                  type="radio"
                  name="registrationKind"
                  value={k.key}
                  checked={registrationKind === k.key}
                  onChange={() => setRegistrationKind(k.key)}
                  className="sr-only"
                />
                <span className="block font-semibold text-[var(--color-text)]">{k.title}</span>
                <span className="block text-xs text-[var(--color-text-muted)]">{k.text}</span>
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      {/* 1. Temel Bilgiler — Öğrenci türü + Temel bilgiler + (eski ayrı "Kişisel bilgiler" başlığı KALDIRILDI, alanları buraya taşındı, yinelenmedi). */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Temel Bilgiler
        </h2>
        <div className="space-y-3">
          <div>
            <Label>
              Ad soyad
              <RequiredMark />
            </Label>
            <Input name="name" required aria-required defaultValue={v("name")} placeholder="Örn. Deniz Ak" aria-invalid={!!fieldErrors.name} />
            <FieldError message={fieldErrors.name} />
          </div>
          {/* P0 (2026-09-05) — kullanıcı raporu: bu alan önceden veli/öğrenci
              iletişim bilgilerinden SONRA geliyordu; hangi tarafın telefon/
              iletişim muhatabı olduğu, o kişinin bilgilerini girmeden ÖNCE
              bilinmesi daha mantıklı — bu yüzden buraya, iletişim
              bilgilerinin HEMEN ÖNÜNE taşındı. */}
          <div>
            <Label>Ödeme/iletişim muhatabı</Label>
            <Select
              name="accountResponsibility"
              value={accountResponsibility}
              onChange={(e) => setAccountResponsibility(e.target.value)}
            >
              <option value="PARENT_MANAGED">Veli (varsayılan)</option>
              <option value="SELF_MANAGED">Öğrencinin kendisi</option>
            </Select>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Ödeme/iletişimin kime ait olduğunu belirler — aşağıdaki zorunlu telefon alanını etkiler.
            </p>
          </div>
          <div>
            <Label>T.C. kimlik no (opsiyonel — şifreli saklanır)</Label>
            <Input name="nationalId" defaultValue={v("nationalId")} inputMode="numeric" maxLength={11} placeholder="11 haneli" aria-invalid={!!fieldErrors.nationalId} />
            <FieldError message={fieldErrors.nationalId} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Anne adı (opsiyonel)</Label>
              <Input name="motherName" defaultValue={v("motherName")} placeholder="Anne adı" />
            </div>
            <div>
              <Label>Baba adı (opsiyonel)</Label>
              <Input name="fatherName" defaultValue={v("fatherName")} placeholder="Baba adı" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>
                Veli adı
                {accountResponsibility === "PARENT_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="parentName"
                required={accountResponsibility === "PARENT_MANAGED"}
                aria-required={accountResponsibility === "PARENT_MANAGED"}
                defaultValue={v("parentName")}
                placeholder={accountResponsibility === "PARENT_MANAGED" ? "Veli adı" : "Veli adı (opsiyonel)"}
                aria-invalid={!!fieldErrors.parentName}
              />
              <FieldError message={fieldErrors.parentName} />
            </div>
            <div>
              <Label>
                Veli telefon
                {accountResponsibility === "PARENT_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="parentPhone"
                required={accountResponsibility === "PARENT_MANAGED"}
                aria-required={accountResponsibility === "PARENT_MANAGED"}
                defaultValue={v("parentPhone")}
                placeholder="05xx xxx xxxx"
                aria-invalid={!!fieldErrors.parentPhone}
              />
              <FieldError message={fieldErrors.parentPhone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Öğrenci e-posta (opsiyonel)</Label>
              <Input name="email" type="email" defaultValue={v("email")} placeholder="ogrenci@email.com" aria-invalid={!!fieldErrors.email} />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <Label>
                Öğrenci telefon
                {accountResponsibility === "SELF_MANAGED" ? <RequiredMark /> : null}
              </Label>
              <Input
                name="phone"
                required={accountResponsibility === "SELF_MANAGED"}
                aria-required={accountResponsibility === "SELF_MANAGED"}
                defaultValue={v("phone")}
                placeholder="05xx xxx xxxx"
                aria-invalid={!!fieldErrors.phone}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Doğum tarihi (opsiyonel)</Label>
              <Input name="birthDate" type="date" defaultValue={v("birthDate")} aria-invalid={!!fieldErrors.birthDate} />
              <FieldError message={fieldErrors.birthDate} />
            </div>
            <div>
              <Label>Doğum yeri (opsiyonel)</Label>
              <Input name="birthPlace" defaultValue={v("birthPlace")} placeholder="Örn. İzmir" />
            </div>
          </div>
          <div>
            <Label>Okulu / mesleği (opsiyonel)</Label>
            <Input name="schoolOrOccupation" defaultValue={v("schoolOrOccupation")} placeholder="Örn. Erzene İlkokulu 3-A" />
          </div>
          <div>
            <Label>Ev adresi (opsiyonel)</Label>
            <Input name="address" defaultValue={v("address")} placeholder="Opsiyonel" />
          </div>
          <div>
            <Label>Bizi nereden buldunuz? (opsiyonel)</Label>
            <Select
              name="referralSource"
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              aria-invalid={!!fieldErrors.referralSource}
            >
              <option value="">Seçiniz (opsiyonel)</option>
              {REFERRAL_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {REFERRAL_SOURCE_LABELS[value]}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.referralSource} />
          </div>
          {referralSource === "diger" ? (
            <div>
              <Label>Kaynak açıklaması (opsiyonel)</Label>
              <Input
                name="referralSourceDetail"
                defaultValue={v("referralSourceDetail")}
                placeholder="Örn. komşumuz Ayşe Hanım önerdi"
              />
            </div>
          ) : null}
          <div>
            <Label>
              Ana şube
              <RequiredMark />
            </Label>
            <Select
              name="branchId"
              required
              aria-required
              defaultValue={v("branchId") || branches[0]?.id}
              aria-invalid={!!fieldErrors.branchId}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.branchId} />
            {branches.length > 1 ? (
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Bir branşı başka şubede alıyorsa aşağıda o branşın kaydında şubesini seçin (ek şube).
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* 2026-10-05 — Sadece kulüp kaydında kurs bölümleri devre dışı: gönderilmez, doğrulanmaz. */}
      <fieldset disabled={clubOnly} className={clubOnly ? "hidden" : "m-0 min-w-0 space-y-6 border-0 p-0"}>
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Kayıt ayarları</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Yoklama Takvimi dönemi</Label>
              <Select name="termType" value={termType} onChange={(e) => setTermType(e.target.value === "yaz" ? "yaz" : "guz")}>
                <option value="guz">Güz Dönemi</option>
                <option value="yaz">Yaz Dönemi</option>
              </Select>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Öğrenci düzeyindedir; tüm branşların takvimi bu dönemi kullanır.</p>
            </div>
            <div>
              <Label>Not (opsiyonel)</Label>
              <Input name="notes" defaultValue={v("notes")} placeholder="Opsiyonel" />
            </div>
          </div>
        </Card>

        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Branş kayıtları</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Öğrenci kimliği yukarıda tek kez girildi. Her branş kendi kartında eşit olarak, kendi öğretmeni, türü (MEB dahil), paketi/ücreti ve kayıt anı
            ilk tahsilatıyla kaydedilir; ikinci branş birincinin ayarlarını devralmaz.
          </p>
          {clientSummary ? (
            <div role="alert" className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {clientSummary}
            </div>
          ) : null}
          <NewStudentEnrollments
            ctx={ctx}
            drafts={drafts}
            onChange={changeDrafts}
            errors={shownErrors}
            termType={termType}
            syncToken={state}
          />
          <input type="hidden" name="registrationId" value={registrationId} />
        </div>

        <EnrollmentReview ctx={ctx} drafts={drafts} errors={liveErrors} termType={termType} />
      </fieldset>

      {registrationKind !== "course" ? (
        <ClubRegistrationCard clubs={clubs} clubOnly={clubOnly} fieldErrors={fieldErrors} lockedClubId={v("clubApplicationId") ? v("clubApplicationClubId") : undefined} />
      ) : null}

      {/* 5. KVKK açık rıza — yalnız yürürlükte bir metin varsa.
          P0 (2026-09-05) — "Sosyal medya paylaşım (fotoğraf/video) izni var"
          onay kutusu BURADAN KALDIRILDI: aynı rıza sözleşme ekranındaki
          Fotoğraf/Video Açık Rıza Formu akışında (Madde 19) zaten alınıyor,
          aynı onay iki ayrı yerden sorulmuyor. Geçmiş kayıtlar
          (`SocialMediaConsent`) DEĞİŞMEDİ; öğrenci detayındaki "SOSYAL MEDYA
          İZNİ" alanı ve belge akışları aynen çalışmaya devam eder. */}
      {kvkkText ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            KVKK Açık Rıza
          </h2>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              KVKK Açık Rıza Metni (v{kvkkText.version})
            </p>
            <p className="mb-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">
              {kvkkText.bodyText}
            </p>
            <div className="flex items-center gap-2">
              <input
                id="kvkk-consent"
                type="checkbox"
                name="kvkkConsent"
                value="granted"
                defaultChecked={checkedVal("kvkkConsent", "granted")}
                className="h-4 w-4"
              />
              <label htmlFor="kvkk-consent" className="text-sm text-[var(--color-text)]">
                Veli/vasi yukarıdaki KVKK aydınlatma/açık rıza metnini okudu, onaylıyor
              </label>
            </div>
          </div>
        </Card>
      ) : null}

      {/* 6. Portal Erişimi — SPESİFİK OLARAK en altta (P0-C). */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          Portal erişimi (opsiyonel)
        </h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input type="checkbox" name="inviteToPortal" value="1" defaultChecked={checkedVal("inviteToPortal", "1")} />
            Kayıt tamamlanınca portal davet e-postası gönder
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Davet edilecek</Label>
              <Select name="invitePortalAccessType" defaultValue={v("invitePortalAccessType") || "GUARDIAN"}>
                <option value="GUARDIAN">Veli</option>
                <option value="SELF">Öğrencinin kendisi</option>
              </Select>
            </div>
            <div>
              <Label>Davet e-postası</Label>
              {/* P0-D (2026-09-02) — "Öğrencinin kendisi" seçiliyken (SELF) ve
                  kullanıcı bilinçli olarak "Farklı e-posta" DEMEDİYSE, bu alan
                  yukarıdaki öğrenci e-postasıyla OTOMATİK senkron kalır —
                  kullanıcı aynı e-postayı iki kez yazmak ZORUNDA kalmaz.
                  `readOnly` (disabled DEĞİL) — form submit'inde değeri yine
                  gönderilir. Veli (GUARDIAN) modunda davranış DEĞİŞMEDİ. */}
              <Input
                name="invitePortalEmail"
                type="email"
                value={portalEmailMirrorsStudent ? studentEmailLive : portalEmail}
                onChange={(e) => setPortalEmail(e.target.value)}
                readOnly={portalEmailMirrorsStudent}
                placeholder={
                  portalEmailMirrorsStudent
                    ? "Önce öğrenci e-postasını girin"
                    : portalAccessType === "SELF"
                      ? "ogrenci@email.com"
                      : "veli@email.com"
                }
                className={portalEmailMirrorsStudent ? "cursor-not-allowed opacity-80" : undefined}
              />
              {inviteToPortalChecked && portalAccessType === "SELF" && !studentEmailLive && !useDifferentPortalEmail ? (
                <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
                  Öğrencinin kendisine davet göndermek için yukarıda &quot;Temel Bilgiler&quot; bölümündeki öğrenci
                  e-postasını girin, ya da farklı bir davet e-postası kullanın.
                </p>
              ) : null}
            </div>
          </div>
          {portalAccessType === "SELF" ? (
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={useDifferentPortalEmail}
                onChange={(e) => setUseDifferentPortalEmail(e.target.checked)}
              />
              Farklı portal e-postası kullan (öğrenci e-postasından farklı bir adrese davet gönder)
            </label>
          ) : null}
          <p className="text-xs text-[var(--color-text-muted)]">
            Düz metin şifre asla gönderilmez — alıcı, e-postadaki tek kullanımlık bağlantıyla kendi şifresini
            oluşturur. İşaretlemezseniz giriş hesabı oluşturulmaz; daveti daha sonra öğrenci düzenleme ekranından da
            gönderebilirsiniz.
          </p>
        </div>
      </Card>

      {/*
        2026-09-22 ürün kararı — sözleşme kayıtta ZORUNLU DEĞİL. Öğrenci sözleşmesiz
        geçerli bir kayıt olarak yaşayabilir; sözleşme daha sonra Sözleşme Merkezi'nden
        aynı kanonik akışla oluşturulur.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        {!clubOnly ? (
          <Button type="submit" name="afterSave" value="contract" className="w-full" disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Kaydet ve sözleşme oluştur"}
          </Button>
        ) : null}
        <Button type="submit" name="afterSave" value="student" variant="secondary" className="w-full" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Sadece öğrenci kaydını oluştur"}
        </Button>
      </div>
      <p className="text-center text-xs text-[var(--color-text-muted)]">
        Sözleşme zorunlu değildir. &quot;Sadece öğrenci kaydını oluştur&quot; seçilirse öğrenci &quot;Sözleşme
        bekliyor&quot; olarak listelenir; sözleşmeyi daha sonra öğrencinin Sözleşme Merkezi&apos;nden oluşturabilirsiniz.
      </p>
    </form>
  );
}