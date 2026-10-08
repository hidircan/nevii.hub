import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedStudentData } from "@/lib/institution/context";
import { listStudentContractsTool } from "@/lib/services";
import { ContractPanel, type RegistrationSummary } from "@/components/contract-panel";
import { paymentMethodLabelTr } from "@/lib/utils";
import { DEBT_SOURCE_LABEL, debtSourceOf } from "@/lib/payment-profile";
import {
  contractEnrollmentId,
  effectiveEnrollments,
  enrollmentDisplayName,
  enrollmentTerms,
  lessonEnrollmentId,
  paymentEnrollmentId,
  studentWithEnrollmentTerms,
  UNASSIGNED_ENROLLMENT_LABEL,
} from "@/lib/student-enrollments";
import { AssignEnrollmentControl } from "@/components/assign-enrollment-control";
import { contractStatusLabel } from "@/lib/contracts";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { isFormalContractDuration } from "@/lib/contracts";
import { selectCurrentContract } from "@/lib/contract-list-helpers";
import { deriveLessonScheduleTextFromLessons } from "@/lib/lesson-schedule-text";
import { buildContractPrefill, clampDurationMonths, DEFAULT_CONTRACT_DURATION_MONTHS } from "@/lib/contract-prefill";
import { diagnoseContractAnnexTemplates } from "@/lib/contract-annexes";
import { listTemplates } from "@/lib/documents";
import { ContractAnnexTemplateNotice } from "@/components/contract-annex-template-notice";

/**
 * FAZ (2026-2027 SÖZLEŞME KAYNAĞI) — Bağımsız Sözleşme Merkezi. Önceden
 * `[studentId]/page.tsx` içine gömülü, yalnızca `#sozlesme` çapa-kaydırması
 * ile erişilen bir bölümdü (bkz. docs/contracts/2026_2027_OFFICIAL_CONTRACT_FULL_AUDIT.md
 * "K. UI/UX gereksinimi"). Bu sayfa AYNI `ContractPanel` bileşenini yeniden
 * kullanır — yeni bir paralel sözleşme UI'ı İCAT EDİLMEDİ, yalnızca kendi
 * URL'i/H1'i/erişilebilir odak noktası olan BAĞIMSIZ bir rota haline
 * getirildi (bkz. docs/contracts/INDEPENDENT_CONTRACT_CENTER_IMPLEMENTATION_REPORT.md).
 */
export default async function StudentContractsCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ yeniKayit?: string; sure?: string; davetUyari?: string; brans?: string }>;
}) {
  const { studentId } = await params;
  const { yeniKayit, sure, davetUyari, brans } = await searchParams;
  const isNewStudent = yeniKayit === "1";

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogrenciler/${studentId}/sozlesmeler`);
  }

  const kurum = await getInstitutionContext(session);
  // DB egress: yalnız bu öğrencinin dilimi — aşağıdaki her ağır erişim `studentId` ile süzülü.
  const data = await readScopedStudentData(kurum.scope, studentId);
  const student = data.students.find((s) => s.id === studentId);

  if (!student) {
    return (
      <div>
        <PageHeader title="Öğrenci bulunamadı" />
        <EmptyState
          title="Öğrenci bulunamadı"
          description="Bu kayıt mevcut kurum/şube kapsamınızda değil veya kaldırılmış olabilir."
        />
        <Link href="/panel/ogrenciler" className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          ← Öğrencilere dön
        </Link>
      </div>
    );
  }

  const contractsResult = await listStudentContractsTool(session, { studentId: student.id });
  const allContracts = contractsResult.ok ? contractsResult.data.contracts : [];
  // 2026-10-09 — BRANŞ SEKMELERİ: her branşın sözleşmesi, ön dolgusu, ilk tahsilatı ve taşınabilir borcu yalnız o
  // branştan gelir (ana/yedek ayrımı yok). Branşı belirtilmemiş eski sözleşmeler ayrı sekmede "Branşa bağla" ile bağlanır.
  const branchList = effectiveEnrollments(student, data.teachers);
  const multiBranch = branchList.length > 1;
  const branchName = (id?: string) => {
    const e = id ? branchList.find((x) => x.id === id) : undefined;
    return e ? enrollmentDisplayName(e, branchList, data.teachers) : UNASSIGNED_ENROLLMENT_LABEL;
  };
  const unassignedContracts = multiBranch ? allContracts.filter((c) => !contractEnrollmentId(student, c, data.teachers)) : [];
  const showUnassigned = brans === "__unassigned__" && unassignedContracts.length > 0;
  const selected = showUnassigned
    ? undefined
    : (branchList.find((e) => e.id === brans) ?? branchList.find((e) => e.active) ?? branchList[0]);
  const terms = selected ? enrollmentTerms(student, selected, data.teachers) : undefined;
  const branchStudent = terms ? studentWithEnrollmentTerms(student, terms) : student;
  const contracts = selected ? allContracts.filter((c) => contractEnrollmentId(student, c, data.teachers) === selected.id) : allContracts;
  const branchPayments = data.payments.filter(
    (p) =>
      p.studentId === student.id &&
      (!selected || paymentEnrollmentId(student, p, { contracts: allContracts, lessons: data.lessons }, data.teachers) === selected.id)
  );
  const branchLessons = data.lessons.filter(
    (l) => l.studentId === student.id && (!selected || lessonEnrollmentId(student, l, data.teachers) === selected.id)
  );

  // 2026-09-19 — süre KALICI kayıttan (Student.intendedDurationMonths); URL `sure` yalnız eski bağlantılar için yedek.
  const savedDurationMonths = clampDurationMonths(branchStudent.intendedDurationMonths) ?? clampDurationMonths(sure);
  const intendedDurationMonths = savedDurationMonths ?? DEFAULT_CONTRACT_DURATION_MONTHS;
  // P0 revizyonu — kayıtta GERÇEKTEN alınmış ilk tahsilatın kaydı: sözleşme
  // önizlemesindeki "İlk Tahsilat Tarihi"/"Ödeme Türü" bu kaynaktan beslenir.
  // Yoksa prefill boş kalır, önizleme "Henüz tahsil edilmedi" gösterir —
  // ders başlangıç tarihi asla tahsilat tarihi gibi yazılmaz. (2026-10-09: yalnız bu branşın.)
  const registrationFirstPayment = branchPayments.find((p) => p.source === "registration_first_payment");
  const selfManaged = student.accountResponsibility === "SELF_MANAGED";
  const registration: RegistrationSummary = {
    registeredAt: branchStudent.enrollmentStartDate,
    contractStartDay: (branchStudent.lessonStartDate ?? branchStudent.enrollmentStartDate)?.slice(0, 10),
    intendedDurationMonths: savedDurationMonths ?? undefined,
    lessonDurationMinutes: branchStudent.lessonDurationMinutes,
    weeklyLessonCount: branchStudent.weeklyLessonCount,
    monthlyFee: branchStudent.monthlyFee,
    paymentMethod: branchStudent.paymentMethod,
    paymentMethodLabel: paymentMethodLabelTr(branchStudent.paymentMethod),
    firstPayment: registrationFirstPayment
      ? {
          paymentId: registrationFirstPayment.id,
          amount: registrationFirstPayment.amount,
          paidAt: registrationFirstPayment.paidAt ?? registrationFirstPayment.dueDate,
          method: registrationFirstPayment.method,
          methodLabel: paymentMethodLabelTr(registrationFirstPayment.method),
        }
      : undefined,
    firstCollectionIncludesNextMonth: registrationFirstPayment?.firstCollectionIncludesNextMonth,
    signatoryName: selfManaged ? student.name : student.parentName,
    signatoryRelationship: selfManaged ? "öğrenci" : "veli",
    address: student.address,
    // 2026-10-04 — T.C. tam değeri istemciye gönderilmez; yalnız kayıtta olup olmadığı (son 2 hane).
    studentNationalIdLast2: student.nationalIdLast2 || undefined,
    // Sözleşmenin branşı sekmeden gelir (formda ikinci bir seçici yok).
    educations: selected ? [{ id: selected.id, instrument: selected.instrument, label: branchName(selected.id), primary: true }] : [],
    openStandaloneDebts: branchPayments
      .filter(
        (p) =>
          !p.contractId &&
          // Kulüp ücreti sözleşmeye hiçbir koşulda taşınmaz (2026-10-05).
          p.source !== "club" &&
          (p.status === "pending" || p.status === "overdue") &&
          p.paidAmount === 0 &&
          p.amount > 0
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((p) => ({
        id: p.id,
        label: p.installmentPeriodLabel ?? p.description,
        dueDate: p.dueDate,
        amount: p.amount,
        sourceLabel: DEBT_SOURCE_LABEL[debtSourceOf(p)],
      })),
  };
  // Ön doldurma sözleşme geçmişine DEĞİL, öğrencinin kayıt verisine dayanır:
  // iptal edilmiş bir sözleşmeden sonra da form dolu açılır (boş önizleme kök nedeni).
  const contractPrefill = buildContractPrefill({
    student: branchStudent,
    latestContract: selectCurrentContract(contracts) ?? undefined,
    registrationFirstPayment,
    requestedDurationMonths: sure,
    /**
     * K (2026-09-20) — ÖNCELİK: kayıtta seçilen gün/saat (kalıcı,
     * `Student.lessonScheduleText`). Yoksa (bu alan eklenmeden önce
     * oluşturulmuş kayıtlar) öğrencinin GERÇEK derslerinden türetilir —
     * hiçbir kayıt boş kalmaz. Eskiden yalnız ikinci yol vardı ve o da
     * saatleri UTC okuduğu için 3 saat kaymış gösteriyordu.
     */
    lessonScheduleText: branchStudent.lessonScheduleText || deriveLessonScheduleTextFromLessons(branchLessons),
  });
  const canManagePaymentProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const isFormal = isFormalContractDuration(intendedDurationMonths);
  // P0 (2026-09-05) — birleşik çıktının EK bölümlerini besleyen şablonlar
  // eksik/stub ise yöneticiye AÇIKÇA söylenir (sessizce zayıf belge üretilmez).
  const annexDiagnostics = canManagePaymentProfile
    ? diagnoseContractAnnexTemplates(await listTemplates(session.tenantId))
    : [];

  return (
    <div>
      {/* Kimlik başlığı, kurum kapsamı notu ve sekme navigasyonu ÜST LAYOUT'tan
          gelir (bkz. `[studentId]/layout.tsx`) — burada tekrarlanmaz. */}
      <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Sözleşme Merkezi</h2>

      {multiBranch ? (
        <nav aria-label="Branşlar" className="mb-4 flex flex-wrap gap-2">
          {branchList.map((e) => {
            const on = !showUnassigned && selected?.id === e.id;
            return (
              <Link
                key={e.id}
                href={`/panel/ogrenciler/${student.id}/sozlesmeler?brans=${encodeURIComponent(e.id)}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  on
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-text-inverted)]"
                    : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {branchName(e.id)}
                {!e.active ? " (sonlandı)" : ""}
              </Link>
            );
          })}
          {unassignedContracts.length > 0 ? (
            <Link
              href={`/panel/ogrenciler/${student.id}/sozlesmeler?brans=__unassigned__`}
              aria-current={showUnassigned ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                showUnassigned ? "border-amber-600 bg-amber-600 text-white" : "border-amber-400 text-amber-800 dark:text-amber-300"
              }`}
            >
              {UNASSIGNED_ENROLLMENT_LABEL} ({unassignedContracts.length})
            </Link>
          ) : null}
        </nav>
      ) : null}

      {showUnassigned ? (
        <Card className="mb-4 !p-4">
          <p className="mb-3 text-sm text-[var(--color-text)]">
            Bu sözleşmeler öğrenci birden fazla branşa sahip olmadan önce oluşturulmuş ve hangi branşa ait oldukları kayıtlardan
            kesin olarak belirlenemiyor. Sistem tahmin yapmaz: her birini ilgili branşa siz bağlayın. Bağlama, sözleşmenin tüm
            sürümlerini, taksitlerini ve ondan üretilen dersleri aynı branşa taşır; sözleşme içeriği değişmez.
          </p>
          <ul className="divide-y divide-[var(--color-border)] text-sm">
            {unassignedContracts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{c.contractNumber}</span> · v{c.versionNumber} · {c.programmeName} ·{" "}
                  {contractStatusLabel(c.status)}
                </span>
                {canManagePaymentProfile && kurum.scope.mode === "single" ? (
                  <AssignEnrollmentControl
                    studentId={student.id}
                    contractId={c.id}
                    branches={branchList.map((e) => ({ id: e.id, label: branchName(e.id) }))}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/*
        P0 (2026-09-05) — sözleşme adımına gelen kullanıcı kayıt bilgilerinde
        bir hata görürse TARAYICI GERİ TUŞUNA muhtaç kalmamalı. Bu görünür
        aksiyon, kayıt bölümünü doğrudan düzenleme modunda açar ve süreyi
        (`sure`) taşır; öğrenci verisi zaten kaydedilmiş olduğundan hiçbir
        alan kaybolmaz, dönüşte bu sayfa (force-dynamic) TAZE veriyle yeniden
        render edilir — bayat önizleme/tahsilat hesabı kalmaz.
      */}
      <ContractAnnexTemplateNotice diagnostics={annexDiagnostics} />

      {canManagePaymentProfile ? (
        <Link
          href={`/panel/ogrenciler/${student.id}/bilgiler?duzenle=kayit&sozlesmeDon=1`}
          className="mb-4 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
        >
          ← Öğrenci kaydına geri dön
        </Link>
      ) : null}

      {isNewStudent && davetUyari ? (
        <Card className="mb-4 !border-amber-300 !bg-amber-50 !p-4 dark:!border-amber-900 dark:!bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Öğrenci kaydı oluşturuldu ancak davet e-postası gönderilemedi.
          </p>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">{davetUyari}</p>
          <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-300/70">
            Daveti öğrenci detay sayfasından (&quot;Portal Erişimi&quot; bölümü) tekrar gönderebilirsiniz.
          </p>
        </Card>
      ) : null}

      {isNewStudent ? (
        <Card className="mb-4 !border-emerald-200 !bg-emerald-50 !p-4 dark:!border-emerald-900 dark:!bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {isFormal ? "Formal sözleşme oluşturulmaya hazır" : "Tanışma Paketi — Formal sözleşme gerekmiyor"}
          </p>
        </Card>
      ) : null}

      {showUnassigned ? null : !canManagePaymentProfile && contracts.length === 0 ? (
        <EmptyState title="Sözleşme bulunamadı" description="Bu öğrenci için henüz bir sözleşme kaydı oluşturulmamış." />
      ) : (
        <ContractPanel
          studentId={student.id}
          contracts={contracts}
          canManage={canManagePaymentProfile}
          autoOpenInitial={isNewStudent && isFormal}
          registration={registration}
          prefill={contractPrefill}
          schedulePickers={{
            teachers: data.teachers
              .filter((t) => t.active)
              .map((t) => ({ id: t.id, name: t.name })),
            // 10. tur iş #8 — yalnız aktif odalar (pasif/silinmiş gizlenir; sunucu da doğrular).
            rooms: data.rooms
              .filter((r) => r.active !== false && !r.deletedAt)
              .map((r) => ({ id: r.id, name: r.name })),
            defaultTeacherId: branchStudent.teacherId,
          }}
        />
      )}

    </div>
  );
}
