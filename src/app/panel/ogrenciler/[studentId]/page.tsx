import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
  KeyRound,
  RefreshCcw,
  Star,
  User,
  Users,
} from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import {
  getAssessmentReportTool,
  listCurriculumForStudentTool,
  listHomeworkForStudentTool,
  listStudentDocumentsTool,
  listTeachingMaterialsForStudentTool,
  getSocialMediaConsentTool,
  listTeacherFeedbackTool,
  listStudentFeedbackTool,
  listStudentContractsTool,
} from "@/lib/services";
import { RegistrationSuccessPanel } from "@/components/registration-success-panel";
import { TEACHER_FEEDBACK_CRITERIA } from "@/lib/teacher-feedback";
import { AiFeedbackSummaryButton } from "@/components/ai-feedback-summary-button";
import { STUDENT_FEEDBACK_CRITERIA } from "@/lib/student-feedback";
import type {
  TeacherFeedback,
  TeacherFeedbackCriterionKey,
  StudentFeedback,
  StudentFeedbackCriterionKey,
} from "@/lib/types";
import { computeOverallScore } from "@/lib/assessment/score";
import { computeStudentPaymentSummary, sortPaymentsForProfile } from "@/lib/payment-profile";
import { computeStudentMonthlyAmount } from "@/lib/student-payment-profile";
import { contractStatusLabel } from "@/lib/contracts";
import { effectivePaymentDueRanges, formatPaymentDueRanges } from "@/lib/payment-due-ranges";
import { effectiveStudentTypes } from "@/lib/student-types";
import { StudentPaymentProfileEditor } from "@/components/student-payment-profile-editor";
import { StudentLessonPauseControl } from "@/components/student-lesson-pause-control";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { StudentUpcomingLessons, StudentPastLessons, StudentAttendanceList } from "@/components/student-lesson-lists";
import { AttendanceCalendarPanel } from "@/components/attendance-calendar-panel";
import { StudentTermTypeEditor } from "@/components/student-term-type-editor";
import { StudentProfileEditor } from "@/components/student-profile-editor";
import { StudentPortalAccessCard } from "@/components/portal-access-card";
import { StudentArchiveToggle } from "@/components/student-archive-toggle";
import { SectionEditCard } from "@/components/section-edit-card";
import { BackButton } from "@/components/back-button";
import { NationalIdReveal } from "@/components/national-id-reveal";
import { maskNationalId } from "@/lib/pii/tc-identity";
import { canViewFullNationalId } from "@/lib/pii";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { computeAge } from "@/lib/utils";
import { documentKindLabel } from "@/lib/documents";
import { QuickTaskLink } from "@/components/quick-task-link";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "#genel", icon: User, label: "Genel Bilgiler" },
  { href: "#veli", icon: Users, label: "Veli ve İletişim" },
  { href: "#portal-erisimi", icon: KeyRound, label: "Portal Erişimi" },
  { href: "#program", icon: CalendarDays, label: "Dersler ve Program" },
  { href: "#yoklama", icon: ClipboardCheck, label: "Yoklama" },
  { href: "#yoklama-takvimi", icon: CalendarDays, label: "Yoklama Takvimi" },
  { href: "#telafi", icon: RefreshCcw, label: "Telafiler" },
  { href: "#odeme", icon: CreditCard, label: "Ödemeler" },
  { href: "#sozlesme", icon: FileText, label: "Sözleşmeler" },
  { href: "#gelisim", icon: GraduationCap, label: "Eğitim / Gelişim" },
  { href: "#odev", icon: BookOpen, label: "Ödev / Materyal" },
  { href: "#evrak", icon: FileText, label: "Evraklar" },
  { href: "#degerlendirmeler", icon: Star, label: "Değerlendirmeler" },
] as const;

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{
    yeniKayit?: string;
    sure?: string;
    davetUyari?: string;
    /** P0 (2026-09-05) — sözleşme adımından dönüş: hangi bölüm düzenleme modunda açılsın. */
    duzenle?: string;
    /** Sözleşme adımına geri dönüş için taşınan süre (ay) — sözleşme formunun ön-doldurması. */
    sozlesmeSure?: string;
  }>;
}) {
  const { studentId } = await params;
  const { yeniKayit, sure, davetUyari, duzenle, sozlesmeSure } = await searchParams;
  const isNewStudent = yeniKayit === "1";
  const rawIntendedDuration = Number(sure);
  const intendedDurationMonths =
    Number.isInteger(rawIntendedDuration) && rawIntendedDuration >= 1 && rawIntendedDuration <= 12 ? rawIntendedDuration : 3;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogrenciler/${studentId}`);
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
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

  const teacher = data.teachers.find((t) => t.id === student.teacherId);
  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const canViewSensitive = session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN";

  const lessons = data.lessons
    .filter((l) => l.studentId === student.id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const now = new Date();
  const upcoming = lessons.filter((l) => new Date(l.startAt) >= now).reverse();
  const past = lessons.filter((l) => new Date(l.startAt) < now);
  const attendanceLessons = lessons.filter((l) => l.studentAttended || l.lessonProcessed || l.opsMakeupFlag);

  const makeupRequests = data.makeupRequests
    .filter((m) => m.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const payments = sortPaymentsForProfile(data.payments.filter((p) => p.studentId === student.id));
  const paymentSummary = computeStudentPaymentSummary(payments);

  const [homeworkResult, materialsResult, curriculumResult, assessmentResult, documentsResult, consentResult, contractsResult] =
    await Promise.all([
      listHomeworkForStudentTool(session, { studentId: student.id }),
      listTeachingMaterialsForStudentTool(session, { studentId: student.id }),
      listCurriculumForStudentTool(session, { studentId: student.id }),
      getAssessmentReportTool(session, { studentId: student.id }),
      listStudentDocumentsTool(session, { studentId: student.id }),
      getSocialMediaConsentTool(session, { studentId: student.id }),
      listStudentContractsTool(session, { studentId: student.id }),
    ]);
  // Karşılıklı Değerlendirmeler — yalnız admin, yalnız BU öğrenciye kapsamlı.
  // Araçların studentId filtresi yok (yalnız teacherId) — tüm tenant kaydı
  // çekilip burada studentId'ye göre daraltılır (demo ölçeğinde güvenle kabul edilir).
  let teacherFeedbackAboutTeachers: TeacherFeedback[] = [];
  let studentFeedbackFromTeachers: StudentFeedback[] = [];
  if (canViewSensitive) {
    const [tfResult, sfResult] = await Promise.all([
      listTeacherFeedbackTool(session, {}),
      listStudentFeedbackTool(session, { studentId: student.id }),
    ]);
    teacherFeedbackAboutTeachers = tfResult.ok
      ? tfResult.data.feedback.filter((f) => f.studentId === student.id)
      : [];
    studentFeedbackFromTeachers = sfResult.ok ? sfResult.data.feedback : [];
  }

  const homework = homeworkResult.ok ? homeworkResult.data.homework : [];
  const materials = materialsResult.ok ? materialsResult.data.materials : [];
  const curriculumTopics = curriculumResult.ok ? curriculumResult.data.topics : [];
  const curriculumOverall = curriculumResult.ok ? curriculumResult.data.overallPercent : 0;
  const assessments = assessmentResult.ok ? assessmentResult.data.assessments : [];
  const documents = documentsResult.ok ? documentsResult.data.documents : [];
  const socialMediaConsent = consentResult.ok ? consentResult.data.consent : undefined;
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  const packages = data.packages ?? [];
  const canManagePaymentProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const studentPackage = packages.find((p) => p.id === student.packageId);
  const monthlyAmount = computeStudentMonthlyAmount(
    student,
    studentPackage,
    (student.lessonDurationMinutes as 30 | 40 | 50 | undefined) ?? 30
  );

  const age = student.birthDate ? computeAge(student.birthDate) : null;
  const canEditProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const profileEditorInitial = {
    name: student.name,
    email: student.email,
    branchId: student.branchId,
    educationMethod: student.educationMethod,
    phone: student.phone,
    parentName: student.parentName,
    parentPhone: student.parentPhone,
    motherName: student.motherName,
    fatherName: student.fatherName,
    address: student.address,
    birthDate: student.birthDate,
    birthPlace: student.birthPlace,
    schoolOrOccupation: student.schoolOrOccupation,
    communicationOptOut: student.communicationOptOut,
    enrollmentStartDate: student.enrollmentStartDate,
    lessonStartDate: student.lessonStartDate,
    accountResponsibility: student.accountResponsibility,
    studentTypes: effectiveStudentTypes(student),
  };

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "student", id: student.id, label: student.name }} />
      <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" className="mb-3" />
      <PageHeader
        title={student.name}
        description={`${student.displayId ? `${student.displayId} · ` : ""}${branch?.shortName ?? "—"} · ${student.packageName.split("—")[0]?.trim() ?? student.packageName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QuickTaskLink
              relatedEntityType="student"
              relatedEntityId={student.id}
              relatedEntityLabel={student.name}
              title={`Öğrenci takibi — ${student.name}`}
              label="Bu öğrenci için görev oluştur"
              returnTo={`/panel/ogrenciler/${student.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-bg)]"
            />
            <StudentArchiveToggle studentId={student.id} active={student.active} />
          </div>
        }
      />

      {isNewStudent ? (
        <RegistrationSuccessPanel
          studentId={student.id}
          studentName={student.name}
          packageLabel={student.packageName.split("—")[0]?.trim() ?? student.packageName}
          monthlyFee={student.monthlyFee}
          paymentMethod={student.paymentMethod}
          enrollmentStartDate={student.enrollmentStartDate}
          intendedDurationMonths={intendedDurationMonths}
          inviteWarning={davetUyari}
        />
      ) : null}

      <Card className="mb-6 !p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge status={student.active ? "confirmed" : "cancelled"}>
            {student.active ? "Aktif" : "Pasif"}
          </Badge>
          {effectiveStudentTypes(student).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {student.educationMethod ? <Badge>{student.educationMethod}</Badge> : null}
          <span className="text-sm text-[var(--color-text-muted)]">
            Öğretmen: {teacher?.name ?? "—"} · Kayıt: {student.enrollmentStartDate ? formatDate(student.enrollmentStartDate) : formatDate(student.createdAt)}
          </span>
        </div>
        {/*
          MT-003 — bu ekranda öğretmen/enstrüman DEĞİŞTİRİLEMEZ (mevcut
          akış yalnızca oluşturmada seçim yapıyor); burada yalnızca kayıt
          zamanında geçerli olan atamanın artık geçersiz hâle geldiğini
          (öğretmen pasife alındı veya enstrüman kombinasyonu artık uyumsuz)
          açık Türkçe uyarıyla göstererek sessiz veri kaybını/otomatik
          değişimi önlüyoruz.
        */}
        {teacher && (!teacher.active || !student.instruments.some((i) => teacher.instruments.includes(i))) ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            {!teacher.active
              ? `Uyarı: atanmış öğretmen "${teacher.name}" artık pasif.`
              : `Uyarı: atanmış öğretmen "${teacher.name}" artık "${student.instruments.join(", ")}" enstrümanını öğretmiyor.`}{" "}
            Devam etmeden önce Öğretmenler ekranından uygunluğu kontrol edin.
          </p>
        ) : null}
      </Card>

      <nav aria-label="Bölümler" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
          >
            <s.icon className="h-3.5 w-3.5" aria-hidden />
            {s.label}
          </a>
        ))}
      </nav>

      {/*
        P0 (2026-09-05) — sözleşme adımından "Öğrenci Kaydını Düzenle" ile
        gelindiyse, sözleşmeye dönüş TEK tıkla ve AYNI süre bilgisiyle olur —
        kullanıcı tarayıcı geri tuşuna muhtaç bırakılmaz. Öğrenci verisi
        kaydedildiği için sözleşme sayfası (force-dynamic) dönüşte TAZE veriyle
        yeniden hesaplanır; bayat sözleşme/önizleme durumu kalmaz.
      */}
      {sozlesmeSure ? (
        <Card className="mb-6 !border-[var(--color-primary)] !p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-text)]">
              Kayıt bilgilerini düzenliyorsunuz. Değişiklikleri kaydettikten sonra sözleşme adımına dönebilirsiniz —
              sözleşme önizlemesi ve tahsilat hesabı güncel verilerle yeniden oluşturulur.
            </p>
            <Link
              href={`/panel/ogrenciler/${student.id}/sozlesmeler?yeniKayit=1&sure=${encodeURIComponent(sozlesmeSure)}`}
              className="inline-flex shrink-0 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              Sözleşme adımına dön →
            </Link>
          </div>
        </Card>
      ) : null}

      <section id="genel" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Temel Bilgiler</h2>
        <SectionEditCard
          canEdit={canEditProfile}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Doğum tarihi" value={student.birthDate ? `${formatDate(student.birthDate)}${age !== null ? ` (${age} yaş)` : ""}` : "Eklenmemiş"} />
              <Field
                label="T.C. kimlik no"
                custom={
                  student.nationalIdCipher ? (
                    <NationalIdReveal
                      entity="student"
                      entityId={student.id}
                      masked={maskNationalId(student.nationalIdLast2)}
                      canReveal={canViewSensitive && canViewFullNationalId(session.role)}
                    />
                  ) : (
                    <span className="text-[var(--color-text-muted)]">Girilmemiş</span>
                  )
                }
              />
              <Field label="Adres" value={canViewSensitive ? student.address || "Eklenmemiş" : "Yalnız yetkili rol görebilir"} />
              <Field label="Şube" value={branch?.name ?? "Eklenmemiş"} />
              <Field label="Paket" value={student.packageName.split("—")[0]?.trim() ?? student.packageName} />
              <Field label="Eğitim metodu" value={student.educationMethod ?? "Eklenmemiş"} />
              <Field label="Seviye" value={student.level ?? "Eklenmemiş"} />
              <Field label="Kayıt tarihi" value={student.enrollmentStartDate ? formatDate(student.enrollmentStartDate) : "Eklenmemiş"} />
              {/* P0 (2026-09-05) — ders başlangıcı kayıt tarihinden ayrı; girilmemişse kayıt tarihi geçerlidir. */}
              <Field
                label="Ders başlangıç tarihi"
                value={
                  student.lessonStartDate
                    ? formatDate(student.lessonStartDate)
                    : student.enrollmentStartDate
                      ? `${formatDate(student.enrollmentStartDate)} (kayıt tarihi)`
                      : "Eklenmemiş"
                }
              />
              <Field label="Ders süresi" value={student.lessonDurationMinutes ? `${student.lessonDurationMinutes} dk` : "Eklenmemiş"} />
              <Field label="Doğum yeri" value={student.birthPlace ?? "Eklenmemiş"} />
              <Field label="Okulu / mesleği" value={student.schoolOrOccupation ?? "Eklenmemiş"} />
            </dl>
          }
          edit={
            <StudentProfileEditor
              studentId={student.id}
              branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
              hasNationalId={!!student.nationalIdCipher}
              initial={profileEditorInitial}
              showPortalInvite={false}
            />
          }
          defaultEditing={duzenle === "kayit"}
        />

        <Card className="mt-3">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Field
              label="Yoklama Takvimi dönemi"
              custom={
                canEditProfile ? (
                  <StudentTermTypeEditor studentId={student.id} initialTermType={student.termType ?? "guz"} />
                ) : (
                  <span className="text-[var(--color-text)]">{student.termType === "yaz" ? "Yaz Dönemi" : "Güz Dönemi"}</span>
                )
              }
            />
            <Field
              label="Sosyal medya izni"
              value={
                // Faz 2 — geri çekilmiş/reddedilmiş izin sessizce "verildi" ile
                // karışmasın diye HER durum ayrı, açık bir Türkçe etiketle
                // gösterilir; "hiç kayıt yok" ile "reddedildi" birbirinden
                // görünür biçimde ayrıştırılır (kural F).
                socialMediaConsent
                  ? socialMediaConsent.status === "granted"
                    ? `Verildi — ${formatDate(socialMediaConsent.grantedAt)}`
                    : socialMediaConsent.status === "withdrawn"
                      ? `Geri çekildi — ${socialMediaConsent.withdrawnAt ? formatDate(socialMediaConsent.withdrawnAt) : "—"}`
                      : socialMediaConsent.status === "denied"
                        ? `Verilmedi — ${formatDate(socialMediaConsent.grantedAt)}`
                        : `Süresi doldu — ${formatDate(socialMediaConsent.grantedAt)}`
                  : "Henüz kaydedilmemiş"
              }
            />
          </dl>
        </Card>
      </section>

      <section id="veli" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">İletişim</h2>
        <SectionEditCard
          canEdit={canEditProfile}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Veli adı" value={student.parentName || "Eklenmemiş"} />
              <Field label="Veli telefonu" value={student.parentPhone || "Eklenmemiş"} />
              <Field label="Öğrenci telefonu" value={student.phone || "Eklenmemiş"} />
              <Field label="E-posta" value={student.email || "Eklenmemiş"} />
              <Field label="İletişim tercihi" value={student.communicationOptOut ? "Tahsilat hatırlatmalarından çıktı" : "Standart"} />
            </dl>
          }
          edit={
            <StudentProfileEditor
              studentId={student.id}
              branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
              hasNationalId={!!student.nationalIdCipher}
              initial={profileEditorInitial}
              showPortalInvite={false}
            />
          }
        />
      </section>

      {canEditProfile ? (
        <section id="portal-erisimi" className="mb-8 scroll-mt-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Portal Erişimi</h2>
          <StudentPortalAccessCard studentId={student.id} defaultEmail={student.email || undefined} />
        </section>
      ) : null}

      <section id="program" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Dersler ve Ders Programı
          <Link href={`/panel/program?studentId=${student.id}`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Programda Aç →
          </Link>
        </h2>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Yaklaşan</p>
        <StudentUpcomingLessons lessons={upcoming} teachers={data.teachers} />
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Geçmiş</p>
        <StudentPastLessons lessons={past} />
      </section>

      <section id="yoklama" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yoklama — Geldi / İşlendi / Telafi</h2>
        <StudentAttendanceList lessons={attendanceLessons} />
      </section>

      <section id="yoklama-takvimi" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Yoklama Takvimi</h2>
        <AttendanceCalendarPanel
          studentId={studentId}
          termType={student.termType ?? "guz"}
          canEdit={session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN"}
          studentActive={student.active}
          defaultMonthlyAmount={monthlyAmount.netAmount ?? undefined}
        />
      </section>

      <section id="telafi" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Telafiler
          <Link href="/panel/telafi" className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Telafi Merkezinde Aç →
          </Link>
        </h2>
        {makeupRequests.length === 0 ? (
          <EmptyState title="Telafi kaydı yok" />
        ) : (
          <div className="space-y-2">
            {makeupRequests.map((m) => (
              <Card key={m.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{m.instrument} · {m.reason}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Son tarih: {formatDateTime(m.expiresAt)}</p>
                  </div>
                  <Badge status={m.status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="odeme" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Finans / Ödeme
          <Link href={`/panel/odemeler/${student.id}`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Ödeme Detayında Aç →
          </Link>
        </h2>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Toplam tahakkuk" value={formatMoney(paymentSummary.totalBilled)} />
          <MiniStat label="Tahsil edilen" value={formatMoney(paymentSummary.totalCollected)} />
          <MiniStat label="Kalan" value={formatMoney(paymentSummary.remaining)} />
          <MiniStat label="Gecikmiş kalan" value={formatMoney(paymentSummary.overdueRemaining)} />
        </div>

        <StudentLessonPauseControl
          studentId={student.id}
          canManage={canManagePaymentProfile}
          paymentPauseStatus={student.paymentPauseStatus}
          paymentPausedAt={student.paymentPausedAt}
          paymentPauseReason={student.paymentPauseReason}
        />

        <SectionEditCard
          canEdit={canManagePaymentProfile}
          className="mb-6"
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Paket" value={studentPackage ? studentPackage.title : "Seçilmedi (serbest metin paket kullanılıyor)"} />
              <Field label="Ders süresi" value={student.lessonDurationMinutes ? `${student.lessonDurationMinutes} dk` : "Eklenmemiş"} />
              <Field
                label="Ödeme yöntemi"
                value={
                  student.paymentMethod === "credit_card"
                    ? "Kredi kartı"
                    : student.paymentMethod === "cash"
                      ? "Nakit"
                      : student.paymentMethod === "transfer"
                        ? "Havale/EFT"
                        : "Eklenmemiş"
                }
              />
              <Field label="Ödeme günü" value={formatPaymentDueRanges(effectivePaymentDueRanges(student))} />
              <Field
                label="İndirim"
                value={
                  student.discountType && student.discountValue
                    ? `${student.discountType === "percentage" ? `%${student.discountValue}` : formatMoney(student.discountValue)}`
                    : "Yok"
                }
              />
              <Field label="Özel tutar (override)" value={student.paymentAmount ? formatMoney(student.paymentAmount) : "Yok"} />
              <Field
                label="Beklenen net aylık tutar"
                value={
                  monthlyAmount.netAmount !== null
                    ? `${formatMoney(monthlyAmount.netAmount)}${monthlyAmount.overrideAmount !== null ? " (override)" : ""}`
                    : "Belirlenemedi"
                }
              />
            </dl>
          }
          edit={
            <StudentPaymentProfileEditor
              studentId={student.id}
              packages={packages}
              initialPackageId={student.packageId}
              initialDurationMinutes={student.lessonDurationMinutes}
              initialPaymentMethod={student.paymentMethod}
              initialPaymentDueRanges={effectivePaymentDueRanges(student)}
              initialDiscountType={student.discountType === "percentage" || student.discountType === "fixed" ? student.discountType : undefined}
              initialDiscountValue={student.discountValue}
              initialOverrideAmount={student.paymentAmount}
            />
          }
        />

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Ödeme Geçmişi</h3>
        {payments.length === 0 ? (
          <EmptyState title="Ödeme kaydı yok" />
        ) : (
          <div className="space-y-2">
            {payments.slice(0, 8).map((p) => (
              <Card key={p.id} className="!p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{p.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Vade: {formatDate(p.dueDate)}</p>
                    {p.lessonId ? (
                      <a href="#program" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                        Kaynak ders →
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatMoney(p.amount - p.paidAmount)}</span>
                    <Badge status={p.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="sozlesme" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Sözleşmeler ve Belgeler</h2>
        <Card className="!p-4">
          {contracts.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Bu öğrenci için henüz bir sözleşme kaydı oluşturulmamış.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--color-text-muted)]">Güncel sözleşme:</span>
              <span className="font-medium text-[var(--color-text)]">{contracts[0]!.contractNumber}</span>
              <Badge status={contracts[0]!.status}>{contractStatusLabel(contracts[0]!.status)}</Badge>
              <span className="text-xs text-[var(--color-text-muted)]">({contracts.length} kayıt)</span>
            </div>
          )}
          <Link
            href={`/panel/ogrenciler/${student.id}/sozlesmeler`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            Sözleşme Merkezi&apos;ne Git →
          </Link>
        </Card>
      </section>

      <section id="gelisim" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Eğitim / Müzikal Gelişim</h2>
        <Card className="mb-3 !p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Müfredat ilerlemesi</p>
            <p className="text-lg font-semibold text-[var(--color-primary)]">%{curriculumOverall}</p>
          </div>
        </Card>
        {curriculumTopics.length > 0 ? (
          <div className="mb-3 space-y-2">
            {curriculumTopics.slice(0, 6).map((topic) => (
              <Card key={topic.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--color-text)]">{topic.title}</p>
                  <Badge status={topic.status}>{topic.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
        {assessments.length === 0 ? (
          <EmptyState title="Henüz gelişim değerlendirmesi yok" />
        ) : (
          <div className="space-y-2">
            {assessments.slice(0, 5).map((a) => (
              <Link key={a.id} href={`/degerlendirme/${a.id}`}>
                <Card className="!p-3 transition hover:border-[var(--color-primary)]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--color-text)]">{formatDate(a.createdAt)}</p>
                    <p className="text-sm font-semibold text-[var(--color-primary)]">{computeOverallScore(a).toFixed(1)} / 5</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
        <Link href={`/degerlendirme/rapor/${student.id}`} className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          Tam raporu görüntüle →
        </Link>
      </section>

      <section id="odev" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Ödevler ve Materyaller</h2>
        {homework.length === 0 ? (
          <EmptyState title="Ödev yok" />
        ) : (
          <div className="mb-3 space-y-2">
            {homework.slice(0, 5).map((hw) => (
              <Card key={hw.id} className="!p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">{hw.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Son teslim: {formatDate(hw.dueDate)}</p>
              </Card>
            ))}
          </div>
        )}
        {materials.length > 0 ? (
          <div className="space-y-2">
            {materials.slice(0, 5).map((m) => (
              <Card key={m.id} className="!p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">{m.title}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      <section id="evrak" className="scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Evraklar
          <Link href={`/panel/evraklar?studentId=${student.id}`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Evraklar Merkezinde Aç →
          </Link>
        </h2>
        {documents.length === 0 ? (
          <EmptyState title="Bu öğrenciye bağlı evrak yok" description="Evraklar Merkezi'nden yeni bir belge oluşturabilirsiniz." />
        ) : (
          <div className="space-y-2">
            {documents.map((d) => (
              <Card key={d.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Link
                      href={`/panel/evraklar/${d.id}`}
                      className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {d.reference}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {documentKindLabel(d.kind)} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <Badge status={d.status}>{d.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {canViewSensitive ? (
        <section id="degerlendirmeler" className="mb-8 scroll-mt-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Karşılıklı Değerlendirmeler</h2>

          <div className="mb-4">
            <AiFeedbackSummaryButton subject="student" subjectId={student.id} />
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Öğrencinin öğretmen değerlendirmeleri
            </p>
            {teacherFeedbackAboutTeachers.length === 0 ? (
              <EmptyState
                title="Henüz değerlendirme yok"
                description="Bu öğrencinin öğretmenleri hakkında yaptığı değerlendirme bulunmuyor."
              />
            ) : (
              <div className="space-y-2">
                {teacherFeedbackAboutTeachers.map((f) => {
                  const t = data.teachers.find((tt) => tt.id === f.teacherId);
                  return (
                    <Card key={f.id} className="!p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {t?.name ?? "Bilinmeyen öğretmen"}{" "}
                          <span className="text-xs font-normal text-[var(--color-text-muted)]">
                            · {formatDate(f.createdAt)}
                          </span>
                        </p>
                        <Badge status={f.status}>{f.status}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {TEACHER_FEEDBACK_CRITERIA.map(({ key, label }: { key: TeacherFeedbackCriterionKey; label: string }) => (
                          <div key={key} className="text-center">
                            <p className="text-sm font-semibold text-[var(--color-primary)]">{f.scores[key]}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
                          </div>
                        ))}
                      </div>
                      {f.comment ? (
                        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{f.comment}</p>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Öğretmenlerin öğrenci değerlendirmeleri
            </p>
            {studentFeedbackFromTeachers.length === 0 ? (
              <EmptyState
                title="Henüz değerlendirme yok"
                description="Öğretmenlerin bu öğrenci için yaptığı değerlendirme bulunmuyor."
              />
            ) : (
              <div className="space-y-2">
                {studentFeedbackFromTeachers.map((f) => {
                  const t = data.teachers.find((tt) => tt.id === f.teacherId);
                  return (
                    <Card key={f.id} className="!p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {t?.name ?? "Bilinmeyen öğretmen"}{" "}
                          <span className="text-xs font-normal text-[var(--color-text-muted)]">
                            · {formatDate(f.createdAt)}
                          </span>
                        </p>
                        <Badge status={f.status}>{f.status}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {STUDENT_FEEDBACK_CRITERIA.map(({ key, label }: { key: StudentFeedbackCriterionKey; label: string }) => (
                          <div key={key} className="text-center">
                            <p className="text-sm font-semibold text-[var(--color-primary)]">{f.scores[key]}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
                          </div>
                        ))}
                      </div>
                      {f.comment ? (
                        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{f.comment}</p>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value, custom }: { label: string; value?: string; custom?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-text)]">{custom ?? value}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="!p-3 text-center">
      <p className="text-sm font-semibold text-[var(--color-text)]">{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
    </Card>
  );
}
