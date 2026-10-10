import { notFound } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { SectionEditCard } from "@/components/section-edit-card";
import { TeacherProfileEditor } from "@/components/teacher-profile-editor";
import { TeacherInstrumentsEditor } from "@/components/teacher-instruments-editor";
import { TeacherPortalAccessCard } from "@/components/portal-access-card";
import { NationalIdReveal } from "@/components/national-id-reveal";
import { maskNationalId } from "@/lib/pii/tc-identity";
import { canViewFullNationalId } from "@/lib/pii";
import { activeInstrumentOptions } from "@/lib/instrument-options";
import type { Instrument } from "@/lib/types";
import { computeAge, formatDate } from "@/lib/utils";
import { loadTeacherPageContext } from "../_context";
import { Field } from "../_components/fields";

export const dynamic = "force-dynamic";

/**
 * Bilgiler — Genel + İletişim + Portal + Uzmanlık + Özlük + Sözleşme.
 * Eskiden ayrı #anchor bölümleriydi; hepsi aynı kişinin aynı kaydı.
 */
export default async function TeacherInfoTab({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const { session, data, teacher, canManage } = await loadTeacherPageContext(teacherId);
  if (!teacher) notFound();

  const instrumentOptions = (await activeInstrumentOptions(session)) as Instrument[];

  const branch = data.settings.branches.find((b) => b.id === teacher.branchId);
  const canViewSensitive = canManage;
  const age = teacher.birthDate ? computeAge(teacher.birthDate) : null;
  const now = new Date();
  const contractDaysLeft = teacher.contractEndDate
    ? Math.ceil((new Date(teacher.contractEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const profileEditorInitial = {
    name: teacher.name,
    email: teacher.email,
    phone: teacher.phone,
    branchIds: teacher.branchIds,
    employmentType: teacher.employmentType,
    hireDate: teacher.hireDate?.slice(0, 10),
    terminationDate: teacher.terminationDate?.slice(0, 10),
    contractStartDate: teacher.contractStartDate?.slice(0, 10),
    contractEndDate: teacher.contractEndDate?.slice(0, 10),
    address: teacher.address,
    emergencyContactName: teacher.emergencyContactName,
    emergencyContactPhone: teacher.emergencyContactPhone,
    personnelNotes: teacher.personnelNotes,
    birthDate: teacher.birthDate?.slice(0, 10),
    highSchool: teacher.highSchool,
    university: teacher.university,
    graduationYear: teacher.graduationYear,
    maxDailyLessons: teacher.maxDailyLessons,
    weeklyHoursThreshold: teacher.weeklyHoursThreshold,
  };
  const profileEditor = (
    <TeacherProfileEditor
      teacherId={teacher.id}
      primaryBranchId={teacher.branchId}
      branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
      hasNationalId={!!teacher.nationalIdCipher}
      initial={profileEditorInitial}
    />
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Genel Bilgiler</h2>
        <SectionEditCard
          canEdit={canManage}
          edit={profileEditor}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field
                label="Doğum tarihi"
                value={
                  teacher.birthDate
                    ? `${formatDate(teacher.birthDate)}${age !== null ? ` (${age} yaş)` : ""}`
                    : "Eklenmemiş"
                }
              />
              <Field
                label="T.C. kimlik no"
                custom={
                  teacher.nationalIdCipher ? (
                    <NationalIdReveal
                      entity="teacher"
                      entityId={teacher.id}
                      masked={maskNationalId(teacher.nationalIdLast2)}
                      canReveal={canViewSensitive && canViewFullNationalId(session.role)}
                    />
                  ) : (
                    <span className="text-[var(--color-text-muted)]">Girilmemiş</span>
                  )
                }
              />
              <Field label="Lise" value={teacher.highSchool || "Eklenmemiş"} />
              <Field label="Üniversite" value={teacher.university || "Eklenmemiş"} />
              <Field label="Mezuniyet yılı" value={teacher.graduationYear ? String(teacher.graduationYear) : "Eklenmemiş"} />
              <Field label="Şube" value={branch?.name ?? "Eklenmemiş"} />
              <Field label="Günlük ders limiti" value={String(teacher.maxDailyLessons)} />
              <Field
                label="Hakediş ödeme eşiği (haftalık saat)"
                value={teacher.weeklyHoursThreshold !== undefined ? `${teacher.weeklyHoursThreshold} sa` : "Tanımlı değil"}
              />
              <Field
                label="Ek atanmış şubeler"
                value={
                  (teacher.branchIds ?? [])
                    .map((id) => data.settings.branches.find((b) => b.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "Yok"
                }
              />
            </dl>
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">İletişim</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="E-posta" value={teacher.email || "Eklenmemiş"} />
              <Field label="Telefon" value={teacher.phone || "Eklenmemiş"} />
              <Field
                label="Adres"
                value={canViewSensitive ? teacher.address || "Eklenmemiş" : "Yalnız yetkili rol görebilir"}
              />
              <Field label="Acil durum kişisi" value={teacher.emergencyContactName || "Eklenmemiş"} />
              <Field label="Acil durum telefonu" value={teacher.emergencyContactPhone || "Eklenmemiş"} />
            </dl>
          }
          edit={profileEditor}
        />
      </section>

      {canManage ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Portal Erişimi</h2>
          <TeacherPortalAccessCard teacherId={teacher.id} defaultEmail={teacher.email || undefined} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Uzmanlık ve Branşlar</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            !teacher.instrumentLevels || teacher.instrumentLevels.length === 0 ? (
              <EmptyState title="Enstrüman seviyesi tanımlanmamış" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {teacher.instrumentLevels.map((skill) => (
                  <div key={skill.instrument} className="rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] px-3 py-2">
                    <p className="text-sm font-medium text-[var(--color-text)]">{skill.instrument}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{skill.level}</p>
                  </div>
                ))}
              </div>
            )
          }
          edit={
            <TeacherInstrumentsEditor
              teacherId={teacher.id}
              instrumentOptions={instrumentOptions}
              initialRows={
                teacher.instrumentLevels && teacher.instrumentLevels.length > 0
                  ? teacher.instrumentLevels
                  : teacher.instruments.map((i) => ({ instrument: i, level: "Başlangıç" as const }))
              }
            />
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Özlük / İstihdam</h2>
        <SectionEditCard
          canEdit={canManage}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field
                label="Çalışma türü"
                value={
                  teacher.employmentType === "tam_zamanli"
                    ? "Tam zamanlı"
                    : teacher.employmentType === "yari_zamanli"
                      ? "Yarı zamanlı"
                      : teacher.employmentType === "serbest"
                        ? "Serbest"
                        : "Eklenmemiş"
                }
              />
              <Field label="İşe giriş" value={teacher.hireDate ? formatDate(teacher.hireDate) : "Eklenmemiş"} />
              <Field label="Ayrılış" value={teacher.terminationDate ? formatDate(teacher.terminationDate) : "Eklenmemiş"} />
              <Field
                label="Sözleşme"
                value={
                  teacher.contractStartDate
                    ? `${formatDate(teacher.contractStartDate)} – ${teacher.contractEndDate ? formatDate(teacher.contractEndDate) : "belirsiz"}`
                    : "Eklenmemiş"
                }
              />
              <Field label="Özlük notu" value={teacher.personnelNotes || "Eklenmemiş"} />
            </dl>
          }
          edit={profileEditor}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Sözleşme</h2>
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field
              label="Başlangıç"
              value={teacher.contractStartDate ? formatDate(teacher.contractStartDate) : "Belirtilmemiş"}
            />
            <Field label="Bitiş" value={teacher.contractEndDate ? formatDate(teacher.contractEndDate) : "Belirsiz süreli"} />
            <Field label="Kalan gün" value={contractDaysLeft !== null ? `${contractDaysLeft} gün` : "—"} />
          </dl>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Sözleşme bitişine 30 gün kala yöneticiye tekilleştirilmiş bildirim gönderilir (mevcut bildirim
            akışı — bu ekran yalnız görüntüler, bildirim mantığını değiştirmez).
          </p>
        </Card>
      </section>
    </div>
  );
}
