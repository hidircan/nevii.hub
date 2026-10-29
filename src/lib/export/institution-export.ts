/**
 * Kurum verisi dışa aktarımı (EPIC 0, `IMPLEMENTATION_PLAN.md`). Saf
 * dönüşüm — hiçbir I/O yapmaz, `readData()`'nın ZATEN tenant-scoped
 * döndürdüğü `AppData`'yı CSV'ye çevirir. Bu yüzden export'un kendisi
 * "tenant-safe"tir; asıl izolasyon garantisi `readData()`'nın ALS/oturum
 * tabanlı kapsamlamasından gelir (bkz. `src/lib/store.ts`) — burada AYRICA
 * hiçbir tenantId filtresi/parametre alınmaz, alınamaz.
 */
import type {
  Announcement,
  AppData,
  Homework,
  HomeworkSubmission,
  LessonAssessment,
  Notification,
  TeacherAvailabilityRequest,
  TeacherFeedback,
  TeachingMaterial,
  StudentCurriculumTopic,
  Task,
} from "../types";
import { MEB_EXAM_STATUS_LABELS, resolveMebExamStatus } from "../meb";
import { effectiveEnrollments, enrollmentTerms, isPersistedEnrollmentId } from "../student-enrollments";
import { effectiveStudentTypes } from "../student-types";

export type ExportEntity =
  | "students"
  | "teachers"
  | "lessons"
  | "attendances"
  | "payments"
  | "makeupRequests"
  | "notifications"
  | "announcements"
  | "lessonAssessments"
  | "teacherAvailabilityRequests"
  | "homework"
  | "homeworkSubmissions"
  | "teachingMaterials"
  | "teacherFeedback"
  | "studentCurriculumTopics"
  | "tasks";

export const EXPORT_ENTITIES: ExportEntity[] = [
  "students",
  "teachers",
  "lessons",
  "attendances",
  "payments",
  "makeupRequests",
  "notifications",
  "announcements",
  "lessonAssessments",
  "teacherAvailabilityRequests",
  "homework",
  "homeworkSubmissions",
  "teachingMaterials",
  "teacherFeedback",
  "studentCurriculumTopics",
  "tasks",
];

/**
 * `AppData`'nın dışında, standalone modüllerde tutulan varlıklar
 * (EPIC 1/5/6/7/9 — bkz. src/lib/notifications, announcements, assessment,
 * homework.ts, teaching-materials.ts, teacher-availability.ts,
 * teacher-feedback.ts). Yalnızca istenen `entity` için doldurulur —
 * `readData()` gibi her zaman tam gelmez, çağıran taraf (API rotası)
 * yalnızca ihtiyaç duyduğunu tenant-scoped olarak burada geçirir.
 */
export type StandaloneExportData = {
  notifications?: Notification[];
  announcements?: Announcement[];
  lessonAssessments?: LessonAssessment[];
  teacherAvailabilityRequests?: TeacherAvailabilityRequest[];
  homework?: Homework[];
  homeworkSubmissions?: HomeworkSubmission[];
  teachingMaterials?: TeachingMaterial[];
  teacherFeedback?: TeacherFeedback[];
  studentCurriculumTopics?: StudentCurriculumTopic[];
  /** İş Takip modülü — src/lib/tasks.ts, AppData'nın dışında tutulur. */
  tasks?: Task[];
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.map(csvCell).join(",");
  const lines = rows.map((row) => columns.map((c) => csvCell(row[c])).join(","));
  return [header, ...lines].join("\r\n");
}

function branchName(data: AppData, branchId: string): string {
  return data.settings.branches.find((b) => b.id === branchId)?.name ?? branchId;
}

/**
 * `AppData` (zaten tek kuruma kapsamlanmış) → varlık adı → CSV içeriği.
 * Yalnızca `entities` içinde istenenler üretilir. Kayıt yoksa yine de
 * başlık satırı içeren boş bir CSV döner (boş durum, hata değil).
 */
export function buildInstitutionExport(
  data: AppData,
  entities: ExportEntity[],
  extra: StandaloneExportData = {}
): Record<ExportEntity, string> {
  const out = {} as Record<ExportEntity, string>;

  if (entities.includes("students")) {
    // 2026-10-10 — BRANŞ BAŞINA SATIR: kalıcı branş kaydı olan öğrenci her branşı için ayrı satırdır (ücret, paket, öğretmen,
    // tür ve MEB bilgileri o branşın kendi kaydından; öğrenci satırındaki uyumluluk aynası değil). Branş kaydı olmayan
    // eski öğrenci tek satırdır ve branş sütunları boştur. Kişi sütunları (ad, iletişim, şube…) her satırda tekrarlanır.
    const rows: Record<string, unknown>[] = [];
    for (const s of data.students) {
      const person = {
        id: s.id,
        ad: s.name,
        email: s.email,
        telefon: s.phone,
        veliAdi: s.parentName,
        veliTelefon: s.parentPhone,
        sube: branchName(data, s.branchId),
        notlar: s.notes,
        kayitTarihi: s.createdAt,
      };
      const list = effectiveEnrollments(s, data.teachers).filter((e) => isPersistedEnrollmentId(e.id));
      if (list.length === 0) {
        rows.push({
          ...person,
          bransId: "",
          enstrumanlar: s.instruments,
          ogrenciTurleri: effectiveStudentTypes(s),
          ogretmenId: s.teacherId,
          paket: s.packageName,
          haftalikDersSayisi: s.weeklyLessonCount,
          aylikUcret: s.monthlyFee,
          aktif: s.active,
          bransAktif: "",
          mebSeviye: s.level ?? "",
          mebDonemBaslangic: s.mebLevelStartDate ?? "",
          mebDonemBitis: s.mebLevelEndDate ?? "",
          mebSinavTarihi: s.mebExamDate ?? "",
          mebSinavDurumu: MEB_EXAM_STATUS_LABELS[resolveMebExamStatus(s)],
        });
        continue;
      }
      for (const e of list) {
        const t = enrollmentTerms(s, e, data.teachers);
        const isMeb = t.studentTypes.includes("MEB");
        rows.push({
          ...person,
          bransId: e.id,
          enstrumanlar: [t.instrument],
          ogrenciTurleri: t.studentTypes,
          ogretmenId: t.teacherId ?? "",
          paket: t.packageName ?? "",
          haftalikDersSayisi: t.weeklyLessonCount,
          aylikUcret: t.monthlyFee,
          aktif: s.active,
          bransAktif: e.active,
          mebSeviye: isMeb ? (t.level ?? "") : "",
          mebDonemBaslangic: isMeb ? (t.mebLevelStartDate ?? "") : "",
          mebDonemBitis: isMeb ? (t.mebLevelEndDate ?? "") : "",
          mebSinavTarihi: isMeb ? (t.mebExamDate ?? "") : "",
          mebSinavDurumu: isMeb ? MEB_EXAM_STATUS_LABELS[resolveMebExamStatus({ mebExamDate: t.mebExamDate, mebExamAttended: t.mebExamAttended })] : "",
        });
      }
    }
    out.students = toCsv(
      [
        "id",
        "ad",
        "email",
        "telefon",
        "veliAdi",
        "veliTelefon",
        "sube",
        "bransId",
        "enstrumanlar",
        "ogrenciTurleri",
        "ogretmenId",
        "paket",
        "haftalikDersSayisi",
        "aylikUcret",
        "aktif",
        "bransAktif",
        "notlar",
        "kayitTarihi",
        // MEB Paneli — yedek/dışa aktarma MEB alanlarını da taşır (eksikse boş hücre); çok branşlıda yalnız MEB branşının satırında.
        "mebSeviye",
        "mebDonemBaslangic",
        "mebDonemBitis",
        "mebSinavTarihi",
        "mebSinavDurumu",
      ],
      rows
    );
  }

  if (entities.includes("teachers")) {
    out.teachers = toCsv(
      ["id", "ad", "email", "telefon", "sube", "enstrumanlar", "aktif"],
      data.teachers.map((t) => ({
        id: t.id,
        ad: t.name,
        email: t.email,
        telefon: t.phone,
        sube: branchName(data, t.branchId),
        enstrumanlar: t.instruments,
        aktif: t.active,
      }))
    );
  }

  if (entities.includes("lessons")) {
    out.lessons = toCsv(
      ["id", "ogrenciId", "ogretmenId", "sube", "enstruman", "baslangic", "bitis", "tip", "durum"],
      data.lessons.map((l) => ({
        id: l.id,
        ogrenciId: l.studentId,
        ogretmenId: l.teacherId,
        sube: branchName(data, l.branchId),
        enstruman: l.instrument,
        baslangic: l.startAt,
        bitis: l.endAt,
        tip: l.type,
        durum: l.status,
      }))
    );
  }

  if (entities.includes("attendances")) {
    out.attendances = toCsv(
      ["id", "dersId", "ogrenciId", "durum", "sebep", "isaretlenmeZamani"],
      data.attendances.map((a) => ({
        id: a.id,
        dersId: a.lessonId,
        ogrenciId: a.studentId,
        durum: a.status,
        sebep: a.reason,
        isaretlenmeZamani: a.markedAt,
      }))
    );
  }

  if (entities.includes("payments")) {
    out.payments = toCsv(
      ["id", "ogrenciId", "tutar", "odenenTutar", "durum", "vadeTarihi", "odemeTarihi", "aciklama"],
      data.payments.map((p) => ({
        id: p.id,
        ogrenciId: p.studentId,
        tutar: p.amount,
        odenenTutar: p.paidAmount,
        durum: p.status,
        vadeTarihi: p.dueDate,
        odemeTarihi: p.paidAt,
        aciklama: p.description,
      }))
    );
  }

  if (entities.includes("makeupRequests")) {
    out.makeupRequests = toCsv(
      [
        "id",
        "olusturmaTarihi",
        "ogrenci",
        "veli",
        "anaOgretmen",
        "sube",
        "enstruman",
        "sebep",
        "durum",
        "slaSonTarihi",
        "slaSeviyesi",
        "kararNotu",
        "kararVeren",
        "kararTarihi",
        "sonKullanimTarihi",
        "onaylananDersId",
      ],
      data.makeupRequests.map((m) => {
        const student = data.students.find((s) => s.id === m.studentId);
        const teacher = data.teachers.find((t) => t.id === m.teacherId);
        return {
          id: m.id,
          olusturmaTarihi: m.createdAt,
          ogrenci: student?.name ?? m.studentId,
          veli: student?.parentName ?? "",
          anaOgretmen: teacher?.name ?? m.teacherId,
          sube: branchName(data, m.branchId),
          enstruman: m.instrument,
          sebep: m.reason,
          durum: m.status,
          slaSonTarihi: m.slaDeadline ?? "",
          slaSeviyesi: m.slaEscalationLevel ?? 0,
          kararNotu: m.decisionNote ?? "",
          kararVeren: m.decidedBy ?? "",
          kararTarihi: m.decidedAt ?? "",
          sonKullanimTarihi: m.expiresAt,
          onaylananDersId: m.confirmedLessonId,
        };
      })
    );
  }

  if (entities.includes("notifications") && extra.notifications) {
    out.notifications = toCsv(
      ["id", "hedefKullaniciId", "hedefOgrenciId", "tur", "baslik", "govde", "olusturmaTarihi", "okunmaTarihi"],
      extra.notifications.map((n) => ({
        id: n.id,
        hedefKullaniciId: n.targetUserId ?? "",
        hedefOgrenciId: n.targetStudentId ?? "",
        tur: n.kind,
        baslik: n.title,
        govde: n.body,
        olusturmaTarihi: n.createdAt,
        okunmaTarihi: n.readAt ?? "",
      }))
    );
  }

  if (entities.includes("announcements") && extra.announcements) {
    out.announcements = toCsv(
      [
        "id",
        "baslik",
        "govde",
        "hedefTuru",
        "durum",
        "sabitlenmis",
        "olusturan",
        "olusturmaTarihi",
        "yayinTarihi",
        "bitisTarihi",
      ],
      extra.announcements.map((a) => ({
        id: a.id,
        baslik: a.title,
        govde: a.body,
        hedefTuru: a.audienceType,
        durum: a.status,
        sabitlenmis: a.pinned,
        olusturan: a.createdBy,
        olusturmaTarihi: a.createdAt,
        yayinTarihi: a.publishAt ?? "",
        bitisTarihi: a.expireAt ?? "",
      }))
    );
  }

  if (entities.includes("lessonAssessments") && extra.lessonAssessments) {
    out.lessonAssessments = toCsv(
      [
        "id",
        "dersId",
        "ogrenciId",
        "ogretmenId",
        "teknikBecerisi",
        "notaOkuma",
        "muzikalite",
        "ritimDuyusu",
        "calismaDuzeni",
        "evOdeviTamamlama",
        "dersKatilimi",
        "motivasyon",
        "genelIlerleme",
        "hedefeUlasma",
        "gucluYonler",
        "sonrakiAdimlar",
        "gelisimAlani",
        "ogretmenImzasi",
        "olusturmaTarihi",
      ],
      extra.lessonAssessments.map((a) => ({
        id: a.id,
        dersId: a.lessonId,
        ogrenciId: a.studentId,
        ogretmenId: a.teacherId,
        teknikBecerisi: a.teknikBecerisi,
        notaOkuma: a.notaOkuma,
        muzikalite: a.muzikalite,
        ritimDuyusu: a.ritimDuyusu,
        calismaDuzeni: a.calismaDuzeni,
        evOdeviTamamlama: a.evOdeviTamamlama,
        dersKatilimi: a.dersKatilimi,
        motivasyon: a.motivasyon,
        genelIlerleme: a.genelIlerleme,
        hedefeUlasma: a.hedefeUlasma,
        gucluYonler: a.strengthNote,
        sonrakiAdimlar: a.nextStepsNote,
        gelisimAlani: a.improvementNote,
        ogretmenImzasi: a.teacherSignedName,
        olusturmaTarihi: a.createdAt,
      }))
    );
  }

  if (entities.includes("teacherAvailabilityRequests") && extra.teacherAvailabilityRequests) {
    out.teacherAvailabilityRequests = toCsv(
      ["id", "ogretmenId", "durum", "incelemeNotu", "inceleyen", "incelemeTarihi", "olusturmaTarihi"],
      extra.teacherAvailabilityRequests.map((r) => ({
        id: r.id,
        ogretmenId: r.teacherId,
        durum: r.status,
        incelemeNotu: r.reviewNote ?? "",
        inceleyen: r.reviewedBy ?? "",
        incelemeTarihi: r.reviewedAt ?? "",
        olusturmaTarihi: r.createdAt,
      }))
    );
  }

  if (entities.includes("homework") && extra.homework) {
    out.homework = toCsv(
      ["id", "ogretmenId", "ogrenciId", "baslik", "aciklama", "sonTeslimTarihi", "olusturmaTarihi"],
      extra.homework.map((h) => ({
        id: h.id,
        ogretmenId: h.teacherId,
        ogrenciId: h.studentId,
        baslik: h.title,
        aciklama: h.description,
        sonTeslimTarihi: h.dueDate,
        olusturmaTarihi: h.createdAt,
      }))
    );
  }

  if (entities.includes("homeworkSubmissions") && extra.homeworkSubmissions) {
    out.homeworkSubmissions = toCsv(
      ["id", "odevId", "ogrenciId", "not", "dosyaVarMi", "teslimTarihi", "ogretmenGeriBildirimi", "degerlendirmeTarihi"],
      extra.homeworkSubmissions.map((s) => ({
        id: s.id,
        odevId: s.homeworkId,
        ogrenciId: s.studentId,
        not: s.note ?? "",
        dosyaVarMi: Boolean(s.fileData),
        teslimTarihi: s.submittedAt,
        ogretmenGeriBildirimi: s.teacherFeedback ?? "",
        degerlendirmeTarihi: s.reviewedAt ?? "",
      }))
    );
  }

  if (entities.includes("teachingMaterials") && extra.teachingMaterials) {
    out.teachingMaterials = toCsv(
      ["id", "ogretmenId", "baslik", "aciklama", "hedefOgrenciTuru", "hedefEnstruman", "hedefSeviye", "dosyaVarMi", "olusturmaTarihi"],
      extra.teachingMaterials.map((m) => ({
        id: m.id,
        ogretmenId: m.teacherId,
        baslik: m.title,
        aciklama: m.description,
        hedefOgrenciTuru: m.targetStudentType ?? "",
        hedefEnstruman: m.targetInstrument ?? "",
        hedefSeviye: m.targetLevel ?? "",
        dosyaVarMi: Boolean(m.fileData),
        olusturmaTarihi: m.createdAt,
      }))
    );
  }

  if (entities.includes("teacherFeedback") && extra.teacherFeedback) {
    out.teacherFeedback = toCsv(
      ["id", "ogretmenId", "ogrenciId", "gonderenRolu", "puanlar", "yorum", "durum", "olusturmaTarihi"],
      extra.teacherFeedback.map((f) => ({
        id: f.id,
        ogretmenId: f.teacherId,
        ogrenciId: f.studentId,
        gonderenRolu: f.submitterRole,
        puanlar: JSON.stringify(f.scores),
        yorum: f.comment ?? "",
        durum: f.status,
        olusturmaTarihi: f.createdAt,
      }))
    );
  }


  if (entities.includes("studentCurriculumTopics") && extra.studentCurriculumTopics) {
    out.studentCurriculumTopics = toCsv(
      [
        "id",
        "studentId",
        "teacherId",
        "title",
        "status",
        "progressPercent",
        "sortOrder",
        "notes",
        "createdBy",
        "updatedBy",
        "createdAt",
        "updatedAt",
      ],
      extra.studentCurriculumTopics.map((t) => ({
        id: t.id,
        studentId: t.studentId,
        teacherId: t.teacherId,
        title: t.title,
        status: t.status,
        progressPercent: t.progressPercent,
        sortOrder: t.sortOrder,
        notes: t.notes ?? "",
        createdBy: t.createdBy,
        updatedBy: t.updatedBy,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  }

  if (entities.includes("tasks") && extra.tasks) {
    out.tasks = toCsv(
      [
        "id",
        "baslik",
        "durum",
        "oncelik",
        "kategori",
        "sorumluId",
        "olusturanId",
        "sonTarih",
        "ilerlemeYuzde",
        "ogrenciId",
        "ogretmenId",
        "sube",
        "olusturmaTarihi",
        "guncellemeTarihi",
      ],
      extra.tasks.map((t) => ({
        id: t.id,
        baslik: t.title,
        durum: t.status,
        oncelik: t.priority,
        kategori: t.category,
        sorumluId: t.assigneeId ?? "",
        olusturanId: t.createdById,
        sonTarih: t.dueDate ?? "",
        ilerlemeYuzde: t.progressPercent,
        ogrenciId: t.studentId ?? "",
        ogretmenId: t.teacherId ?? "",
        sube: t.branchId ? branchName(data, t.branchId) : "",
        olusturmaTarihi: t.createdAt,
        guncellemeTarihi: t.updatedAt,
      }))
    );
  }

  return out;
}
