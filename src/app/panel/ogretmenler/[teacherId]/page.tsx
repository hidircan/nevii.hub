import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  FileText,
  GraduationCap,
  ScrollText,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listStudentDocumentsTool, listInstrumentCatalogTool } from "@/lib/services";
import type { Instrument } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Pagination, clampPage } from "@/components/ui";
import { FeeRuleManager } from "@/components/fee-rule-manager";
import { NationalIdReveal } from "@/components/national-id-reveal";
import { maskNationalId } from "@/lib/pii/tc-identity";
import { canViewFullNationalId } from "@/lib/pii";
import { formatDate, formatMoney } from "@/lib/utils";
import { computeAge } from "@/lib/utils";
import { computeTeacherEarningsForPeriod } from "@/lib/teacher-payout";
import { TeacherInstrumentsEditor } from "@/components/teacher-instruments-editor";
import { TeacherProfileEditor } from "@/components/teacher-profile-editor";
import { SectionEditCard } from "@/components/section-edit-card";
import { BackButton } from "@/components/back-button";
import { TeacherArchiveAction } from "@/components/teacher-archive-action";
import { QuickTaskLink } from "@/components/quick-task-link";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "#genel", icon: User, label: "Genel Bilgiler" },
  { href: "#iletisim", icon: Users, label: "İletişim" },
  { href: "#uzmanlik", icon: GraduationCap, label: "Uzmanlık ve Branşlar" },
  { href: "#ozluk", icon: ScrollText, label: "Özlük / İstihdam" },
  { href: "#sozlesme", icon: ScrollText, label: "Sözleşme" },
  { href: "#program", icon: CalendarDays, label: "Ders Programı" },
  { href: "#ogrenciler", icon: Users, label: "Öğrenciler" },
  { href: "#hakedis", icon: Wallet, label: "Hakedişler" },
  { href: "#ucret", icon: Wallet, label: "Saatlik Ücret" },
  { href: "#odeme", icon: CreditCard, label: "Ödemeler" },
  { href: "#evrak", icon: FileText, label: "Evraklar" },
] as const;

const STUDENTS_PAGE_SIZE = 5;

export default async function TeacherDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ ogrenciSayfa?: string }>;
}) {
  const { teacherId } = await params;
  const { ogrenciSayfa } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogretmenler/${teacherId}`);
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const catalogResult = await listInstrumentCatalogTool(session, {});
  const instrumentOptions = (
    catalogResult.ok
      ? catalogResult.data.entries.filter((e) => e.status === "active").map((e) => e.name)
      : undefined
  ) as Instrument[] | undefined;

  if (!teacher) {
    return (
      <div>
        <PageHeader title="Öğretmen bulunamadı" />
        <EmptyState
          title="Öğretmen bulunamadı"
          description="Bu kayıt mevcut kurum/şube kapsamınızda değil veya kaldırılmış olabilir."
        />
        <Link href="/panel/ogretmenler" className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          ← Öğretmenlere dön
        </Link>
      </div>
    );
  }

  const branch = data.settings.branches.find((b) => b.id === teacher.branchId);
  const canViewSensitive = session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN";

  const students = data.students
    .filter((s) => s.teacherId === teacher.id)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const studentsTotalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PAGE_SIZE));
  const studentsPage = clampPage(ogrenciSayfa, studentsTotalPages);
  const pagedStudents = students.slice(
    (studentsPage - 1) * STUDENTS_PAGE_SIZE,
    studentsPage * STUDENTS_PAGE_SIZE
  );
  const teacherFeeRules = data.teacherFeeRules.filter((r) => r.teacherId === teacher.id);
  const lessons = data.lessons
    .filter((l) => l.teacherId === teacher.id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const now = new Date();
  const upcomingLessons = lessons.filter((l) => new Date(l.startAt) >= now).length;
  const weekLessonCount = lessons.filter((l) => l.status !== "cancelled").length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const earnings = computeTeacherEarningsForPeriod(data, teacher.id, monthStart, monthEnd);
  const paidThisMonth = data.teacherPayouts
    .filter((p) => p.teacherId === teacher.id && p.periodStart === monthStart && p.periodEnd === monthEnd && p.status === "paid")
    .reduce((sum, p) => sum + p.totalAmount, 0);

  const documentsLists = await Promise.all(
    students.slice(0, 20).map((s) => listStudentDocumentsTool(session, { studentId: s.id }))
  );
  const documentCount = documentsLists.reduce(
    (sum, r) => sum + (r.ok ? r.data.documents.length : 0),
    0
  );

  const age = teacher.birthDate ? computeAge(teacher.birthDate) : null;
  const contractDaysLeft = teacher.contractEndDate
    ? Math.ceil((new Date(teacher.contractEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const canEditProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
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
  };

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/ogretmenler" label="Öğretmenlere dön" className="mb-3" />

      {/*
        ÖNCELİK 4 (devam) — öğretmen ekranı görsel revizyonu: fotoğraf/avatar
        YOK; öğretmen adı büyük, ortalanmış, düz metin bir başlık (h1) olarak
        görünür. Mevcut önemli bilgiler (durum/enstrümanlar/şube/iletişim/
        sözleşme uyarısı) altında düzenli bir kart bölümünde kalır — yalnızca
        listenin paylaştığı genel `PageHeader` (sol hizalı) bu sayfada
        KULLANILMAZ; diğer liste ekranları etkilenmez.
      */}
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">{teacher.name}</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          {branch?.shortName ?? "—"} · {teacher.instruments.join(", ")}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/panel/ogretmenler/${teacher.id}/geri-bildirim`}
            className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            Geri Bildirim İncelemesi →
          </Link>
          {session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN" ? (
            <QuickTaskLink
              relatedEntityType="teacher"
              relatedEntityId={teacher.id}
              relatedEntityLabel={teacher.name}
              title={`Öğretmen takibi — ${teacher.name}`}
              label="Bu öğretmen için görev oluştur"
              returnTo={`/panel/ogretmenler/${teacher.id}`}
              className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
            />
          ) : null}
          {session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN" ? (
            <TeacherArchiveAction teacherId={teacher.id} teacherName={teacher.name} archived={!teacher.active} />
          ) : null}
        </div>
      </div>

      <Card className="mb-6 !p-4">
        <div className="flex flex-wrap items-center justify-center gap-3 text-center">
          <Badge status={teacher.active ? "confirmed" : "cancelled"}>
            {teacher.active ? "Aktif" : "Pasif"}
          </Badge>
          {teacher.instruments.map((i) => (
            <Badge key={i}>{i}</Badge>
          ))}
          <span className="text-sm text-[var(--color-text-muted)]">
            {teacher.email} · {teacher.phone}
          </span>
          {contractDaysLeft !== null && contractDaysLeft <= 30 && contractDaysLeft >= 0 ? (
            <Badge status="pending">Sözleşme {contractDaysLeft} gün içinde bitiyor</Badge>
          ) : null}
        </div>
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

      <section id="genel" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Genel Bilgiler</h2>
        <Card>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <Field label="Doğum tarihi" value={teacher.birthDate ? `${formatDate(teacher.birthDate)}${age !== null ? ` (${age} yaş)` : ""}` : "Eklenmemiş"} />
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
              label="Ek atanmış şubeler"
              value={
                (teacher.branchIds ?? [])
                  .map((id) => data.settings.branches.find((b) => b.id === id)?.name)
                  .filter(Boolean)
                  .join(", ") || "Yok"
              }
            />
          </dl>
        </Card>
      </section>

      <section id="iletisim" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">İletişim</h2>
        <SectionEditCard
          canEdit={canEditProfile}
          readOnly={
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="E-posta" value={teacher.email || "Eklenmemiş"} />
              <Field label="Telefon" value={teacher.phone || "Eklenmemiş"} />
              <Field label="Adres" value={canViewSensitive ? teacher.address || "Eklenmemiş" : "Yalnız yetkili rol görebilir"} />
              <Field label="Acil durum kişisi" value={teacher.emergencyContactName || "Eklenmemiş"} />
              <Field label="Acil durum telefonu" value={teacher.emergencyContactPhone || "Eklenmemiş"} />
            </dl>
          }
          edit={
            <TeacherProfileEditor
              teacherId={teacher.id}
              primaryBranchId={teacher.branchId}
              branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
              hasNationalId={!!teacher.nationalIdCipher}
              initial={profileEditorInitial}
            />
          }
        />
      </section>

      <section id="uzmanlik" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Uzmanlık ve Branşlar</h2>
        <SectionEditCard
          canEdit={canEditProfile}
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

      <section id="ozluk" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Özlük / İstihdam</h2>
        <SectionEditCard
          canEdit={canEditProfile}
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
          edit={
            <TeacherProfileEditor
              teacherId={teacher.id}
              primaryBranchId={teacher.branchId}
              branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
              hasNationalId={!!teacher.nationalIdCipher}
              initial={profileEditorInitial}
            />
          }
        />
      </section>

      <section id="sozlesme" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Sözleşme</h2>
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Field label="Başlangıç" value={teacher.contractStartDate ? formatDate(teacher.contractStartDate) : "Belirtilmemiş"} />
            <Field label="Bitiş" value={teacher.contractEndDate ? formatDate(teacher.contractEndDate) : "Belirsiz süreli"} />
            <Field label="Kalan gün" value={contractDaysLeft !== null ? `${contractDaysLeft} gün` : "—"} />
          </dl>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Sözleşme bitişine 30 gün kala yöneticiye tekilleştirilmiş bildirim gönderilir (mevcut
            bildirim akışı — bu ekran yalnız görüntüler, bildirim mantığını değiştirmez).
          </p>
        </Card>
      </section>

      <section id="program" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Ders Programı
          <Link href={`/panel/ogretmenler/${teacher.id}/musaitlik`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Müsaitlikte Aç →
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="Kayıtlı ders" value={String(weekLessonCount)} />
          <MiniStat label="Yaklaşan ders" value={String(upcomingLessons)} />
          <MiniStat label="Günlük limit" value={String(teacher.maxDailyLessons)} />
        </div>
        <Link href="/panel/program" className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          Programda Aç →
        </Link>
      </section>

      <section id="ogrenciler" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
          Öğrenciler {students.length > 0 ? <span className="text-[var(--color-text-muted)]">({students.length})</span> : null}
        </h2>
        {students.length === 0 ? (
          <EmptyState title="Atanmış öğrenci yok" />
        ) : (
          <>
            <div className="space-y-2">
              {pagedStudents.map((s) => (
                <Link key={s.id} href={`/panel/ogrenciler/${s.id}`}>
                  <Card className="!p-3 transition hover:border-[var(--color-primary)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--color-text)]">{s.name}</p>
                      <Badge status={s.active ? "confirmed" : "cancelled"}>{s.active ? "Aktif" : "Pasif"}</Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <Pagination
              page={studentsPage}
              totalPages={studentsTotalPages}
              hrefForPage={(p) => `/panel/ogretmenler/${teacher.id}?ogrenciSayfa=${p}#ogrenciler`}
            />
          </>
        )}
      </section>

      <section id="hakedis" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Hakedişler
          <Link href={`/panel/ogretmenler/${teacher.id}/hakedis`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Hakediş Detayında Aç →
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Bu ay bekleyen" value={formatMoney(earnings.totalAmount)} />
          <MiniStat label="Bu ay ödenen" value={formatMoney(paidThisMonth)} />
        </div>
      </section>

      <section id="ucret" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Saatlik Hakediş Ücreti</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Bu öğretmenin dakika-başı ücret kuralı (bkz. Ücret Kuralları ekranıyla AYNI kaynak — burada yalnızca bu
          öğretmene daraltılmış görünür). Yeni bir kural eklemek geçmişte zaten onaylanmış/ödenmiş hakediş
          kayıtlarını ASLA değiştirmez; yalnızca bundan sonraki hesaplamalara veya belirttiğiniz geçerlilik
          tarihinden sonrasına uygulanır.
        </p>
        <FeeRuleManager
          teachers={[{ id: teacher.id, name: teacher.name }]}
          branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))}
          rules={teacherFeeRules}
          canWrite={kurum.scope.mode === "single"}
        />
      </section>

      <section id="odeme" className="mb-8 scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Ödemeler
          <Link href={`/panel/ogretmenler/${teacher.id}/odemeler`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Ödeme Geçmişinde Aç →
          </Link>
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">Tam ödeme geçmişi ve yöntem/tarih/tutar/durum detayları yukarıdaki bağlantıdan görüntülenir.</p>
      </section>

      <section id="evrak" className="scroll-mt-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--color-text)]">
          Evraklar
          <Link href={`/panel/evraklar?teacherId=${teacher.id}`} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            Evrak Oluştur / Merkezinde Aç →
          </Link>
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {documentCount > 0
            ? `Bu öğretmenin öğrencilerine bağlı ${documentCount} evrak var.`
            : "Bu öğretmenin öğrencilerine bağlı evrak bulunmuyor."}
        </p>
      </section>
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
