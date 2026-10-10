import { ChangeHistory } from "@/components/change-history";
import { notFound } from "next/navigation";
import { getSocialMediaConsentTool } from "@/lib/services";
import { Card } from "@/components/ui";
import { SectionEditCard } from "@/components/section-edit-card";
import { StudentProfileEditor } from "@/components/student-profile-editor";
import { StudentPortalAccessCard } from "@/components/portal-access-card";
import { StudentTermTypeEditor } from "@/components/student-term-type-editor";
import { NationalIdReveal } from "@/components/national-id-reveal";
import { maskNationalId } from "@/lib/pii/tc-identity";
import { canViewFullNationalId } from "@/lib/pii";
import { REFERRAL_SOURCE_LABELS } from "@/lib/types";
import { effectiveStudentTypes } from "@/lib/student-types";
import { isMebStudent, resolveMebExamStatus, MEB_EXAM_STATUS_LABELS } from "@/lib/meb";
import { computeAge, formatDate } from "@/lib/utils";
import { loadStudentPageContext } from "../_context";
import { Field } from "../_components/fields";
import { ContractReturnBanner } from "../_components/contract-return-banner";

export const dynamic = "force-dynamic";

/**
 * Bilgiler sekmesi — kimlik, iletişim ve portal erişimi.
 * Eski tek sayfadaki "Temel Bilgiler" + "İletişim" + "Portal Erişimi"
 * bölümlerinin birleşimi: üçü de aynı kişinin aynı kaydını düzenliyor,
 * ayrı ayrı gezilmesi için bir sebep yoktu.
 */
export default async function StudentInfoTab({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ duzenle?: string; sozlesmeDon?: string }>;
}) {
  const { studentId } = await params;
  const { duzenle, sozlesmeDon } = await searchParams;
  const { session, data, student, canManage } = await loadStudentPageContext(studentId);
  if (!student) notFound();

  const consentResult = await getSocialMediaConsentTool(session, { studentId: student.id });
  const socialMediaConsent = consentResult.ok ? consentResult.data.consent : undefined;

  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const age = student.birthDate ? computeAge(student.birthDate) : null;

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
    referralSource: student.referralSource,
    referralSourceDetail: student.referralSourceDetail,
    address: student.address,
    birthDate: student.birthDate,
    birthPlace: student.birthPlace,
    schoolOrOccupation: student.schoolOrOccupation,
    communicationOptOut: student.communicationOptOut,
    enrollmentStartDate: student.enrollmentStartDate,
    lessonStartDate: student.lessonStartDate,
    accountResponsibility: student.accountResponsibility,
    studentTypes: effectiveStudentTypes(student),
    lessonDurationMinutes: student.lessonDurationMinutes,
    level: student.level,
    mebLevelStartDate: student.mebLevelStartDate,
    mebLevelEndDate: student.mebLevelEndDate,
    mebExamDate: student.mebExamDate,
    mebExamAttended: student.mebExamAttended,
  };

  const mebStudent = isMebStudent(student);
  const mebExamStatus = resolveMebExamStatus(student);
  const mebIncomplete =
    mebStudent && (!student.level || !student.mebLevelStartDate || !student.mebLevelEndDate);

  const editor = (
    <StudentProfileEditor
      studentId={student.id}
      branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
      hasNationalId={!!student.nationalIdCipher}
      initial={profileEditorInitial}
      showPortalInvite={false}
    />
  );

  return (
    <div className="space-y-6">
      {sozlesmeDon && canManage ? <ContractReturnBanner studentId={student.id} /> : null}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Temel Bilgiler</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Doğum tarihi"
                value={
                  student.birthDate
                    ? `${formatDate(student.birthDate)}${age !== null ? ` (${age} yaş)` : ""}`
                    : "Eklenmemiş"
                }
              />
              <Field
                label="T.C. kimlik no"
                custom={
                  student.nationalIdCipher ? (
                    <NationalIdReveal
                      entity="student"
                      entityId={student.id}
                      masked={maskNationalId(student.nationalIdLast2)}
                      canReveal={canManage && canViewFullNationalId(session.role)}
                    />
                  ) : (
                    <span className="text-[var(--color-text-muted)]">Girilmemiş</span>
                  )
                }
              />
              <Field label="Adres" value={canManage ? student.address || "Eklenmemiş" : "Yalnız yetkili rol görebilir"} />
              <Field label="Şube" value={branch?.name ?? "Eklenmemiş"} />
              <Field label="Paket" value={student.packageName.split("—")[0]?.trim() ?? student.packageName} />
              <Field label="Eğitim metodu" value={student.educationMethod ?? "Eklenmemiş"} />
              <Field label="Seviye" value={student.level ?? "Eklenmemiş"} />
              <Field label="Kayıt tarihi" value={student.enrollmentStartDate ? formatDate(student.enrollmentStartDate) : "Eklenmemiş"} />
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
              <Field
                label="Bizi nereden buldunuz?"
                value={
                  student.referralSource
                    ? student.referralSourceDetail
                      ? `${REFERRAL_SOURCE_LABELS[student.referralSource]} — ${student.referralSourceDetail}`
                      : REFERRAL_SOURCE_LABELS[student.referralSource]
                    : "Belirtilmemiş"
                }
              />
            </dl>
          }
          edit={editor}
          defaultEditing={duzenle === "kayit"}
        />
      </section>

      {mebStudent ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">MEB Bilgileri</h2>
          <Card>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="MEB seviyesi" value={student.level ? `${student.level}. Seviye` : "Eklenmemiş"} />
              <Field
                label="MEB seviye başlangıç tarihi"
                value={student.mebLevelStartDate ? formatDate(student.mebLevelStartDate) : "Eklenmemiş"}
              />
              <Field
                label="MEB seviye bitiş tarihi"
                value={student.mebLevelEndDate ? formatDate(student.mebLevelEndDate) : "Eklenmemiş"}
              />
              <Field
                label="MEB sınav tarihi"
                value={student.mebExamDate ? formatDate(student.mebExamDate) : "Eklenmemiş"}
              />
              <Field label="Sınava girdi mi?" value={MEB_EXAM_STATUS_LABELS[mebExamStatus]} />
            </dl>
            {mebIncomplete ? (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                Bu MEB kaydının seviye/dönem bilgileri eksik — MEB Panelinden tamamlayın. Kayıt okunmaya ve diğer
                alanları düzenlenmeye devam eder.
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">İletişim</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Veli adı" value={student.parentName || "Eklenmemiş"} />
              <Field label="Veli telefonu" value={student.parentPhone || "Eklenmemiş"} />
              <Field label="Öğrenci telefonu" value={student.phone || "Eklenmemiş"} />
              <Field label="E-posta" value={student.email || "Eklenmemiş"} />
              <Field
                label="İletişim tercihi"
                value={student.communicationOptOut ? "Tahsilat hatırlatmalarından çıktı" : "Standart"}
              />
            </dl>
          }
          edit={editor}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Dönem ve İzinler</h2>
        <Card>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Field
              label="Yoklama Takvimi dönemi"
              custom={
                canManage ? (
                  <StudentTermTypeEditor studentId={student.id} initialTermType={student.termType ?? "guz"} />
                ) : (
                  <span className="text-[var(--color-text)]">
                    {student.termType === "yaz" ? "Yaz Dönemi" : "Güz Dönemi"}
                  </span>
                )
              }
            />
            <Field
              label="Sosyal medya / fotoğraf-video izni"
              value={
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

      {canManage ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Portal Erişimi</h2>
          <StudentPortalAccessCard studentId={student.id} defaultEmail={student.email || undefined} />
        </section>
      ) : null}

      {canManage ? (
        <ChangeHistory
          tenantId={session.tenantId}
          entityType="Student"
          entityIds={[student.id]}
          entityName={student.name}
          teachers={data.teachers}
        />
      ) : null}
    </div>
  );
}
