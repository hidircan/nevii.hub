import { format, isSameDay, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import type { AppData, Lesson, MakeupRequest, Student, Teacher } from "./types";
import { DEFAULT_COLLECTIONS_SETTINGS } from "./types";
import { resolveCollectionsIban } from "./collections-due";

function phoneToWa(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.startsWith("90")) return digits;
  return digits;
}

function fmtWhen(iso: string) {
  return format(new Date(iso), "d MMMM yyyy · HH:mm", { locale: tr });
}

export interface WaMessage {
  id: string;
  title: string;
  audience: "veli" | "öğretmen" | "okul";
  channel: "WhatsApp";
  toName: string;
  toPhone: string;
  body: string;
  waLink: string;
}

function build(toName: string, toPhone: string, title: string, audience: WaMessage["audience"], body: string): WaMessage {
  const wa = phoneToWa(toPhone);
  return {
    id: `${title}-${toPhone}-${body.slice(0, 12)}`,
    title,
    audience,
    channel: "WhatsApp",
    toName,
    toPhone,
    body,
    waLink: `https://wa.me/${wa}?text=${encodeURIComponent(body)}`,
  };
}

/** Telafi hakkı oluşunca veliye */
export function templateMakeupCreated(
  school: string,
  student: Student,
  req: MakeupRequest,
  branchName: string
): WaMessage {
  const branch = branchName || "";
  const body =
    `Merhaba ${student.parentName},\n\n` +
    `${school} — ${branch} şubesi.\n` +
    `${student.name} için telafi hakkı oluştu.\n` +
    `Enstrüman: ${req.instrument}\n` +
    `Sebep: ${req.reason}\n` +
    `Son kullanım: ${fmtWhen(req.expiresAt)}\n\n` +
    `Uygun saati birlikte planlamak için bu mesaja yanıt verebilir veya okulu arayabilirsiniz.\n` +
    `Teşekkürler.`;
  return build(student.parentName, student.parentPhone, "Telafi hakkı oluştu", "veli", body);
}

/** Telafi onaylanınca veliye */
export function templateMakeupConfirmed(
  school: string,
  student: Student,
  lesson: Lesson,
  teacher: Teacher,
  branchName: string
): WaMessage {
  const body =
    `Merhaba ${student.parentName},\n\n` +
    `${school}\n` +
    `${student.name} için telafi dersi planlandı ✅\n\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `👩‍🏫 ${teacher.name}\n` +
    `📍 ${branchName} şubesi\n\n` +
    `Katılım sağlayamayacaksanız lütfen en az 24 saat önce bildiriniz.\n` +
    `Görüşmek üzere.`;
  return build(student.parentName, student.parentPhone, "Telafi onaylandı", "veli", body);
}

/** Telafi onaylanınca öğretmene */
export function templateTeacherMakeupAssigned(
  school: string,
  teacher: Teacher,
  student: Student,
  lesson: Lesson,
  branchName: string
): WaMessage {
  const body =
    `Merhaba ${teacher.name},\n\n` +
    `${school} — yeni telafi dersi atandı.\n\n` +
    `Öğrenci: ${student.name}\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `📍 ${branchName}\n\n` +
    `Programınızda görünüyor. İyi dersler.`;
  return build(teacher.name, teacher.phone, "Öğretmene telafi ataması", "öğretmen", body);
}

/** Yarınki ders hatırlatması */
export function templateLessonReminder(
  school: string,
  student: Student,
  lesson: Lesson,
  teacher: Teacher,
  branchName: string
): WaMessage {
  const body =
    `Merhaba ${student.parentName},\n\n` +
    `Yarın ders hatırlatması — ${school}\n\n` +
    `Öğrenci: ${student.name}\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument} · ${teacher.name}\n` +
    `📍 ${branchName} şubesi\n\n` +
    `Görüşmek üzere 🎼`;
  return build(student.parentName, student.parentPhone, "Ders hatırlatması", "veli", body);
}

/** Ödeme hatırlatması */
export function templatePaymentReminder(
  school: string,
  student: Student,
  amount: number,
  dueDate: string,
  paymentDetails?: { bankLabel?: string; iban?: string }
): WaMessage {
  const bankLine =
    paymentDetails?.iban ? `Banka: ${paymentDetails.bankLabel}\nIBAN: ${paymentDetails.iban}\n\n` : "";
  const body =
    `Merhaba ${student.parentName},\n\n` +
    `${school} ödeme hatırlatması.\n` +
    `Öğrenci: ${student.name}\n` +
    `Tutar: ${new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount)}\n` +
    `Vade: ${format(new Date(dueDate), "d MMMM yyyy", { locale: tr })}\n\n` +
    bankLine +
    `Ödeme bilgisini okuldan teyit edebilirsiniz.\nTeşekkürler.`;
  return build(student.parentName, student.parentPhone, "Ödeme hatırlatması", "veli", body);
}

/** Devamsızlık sonrası veli */
export function templateAbsenceNotice(
  school: string,
  student: Student,
  lesson: Lesson,
  reason: string
): WaMessage {
  const body =
    `Merhaba ${student.parentName},\n\n` +
    `${school}: ${student.name} bugünkü dersine katılamadı.\n` +
    `Ders: ${fmtWhen(lesson.startAt)} · ${lesson.instrument}\n` +
    `Not: ${reason}\n\n` +
    `Politika gereği telafi hakkı oluşturuldu. Size uygun saati planlayacağız.`;
  return build(student.parentName, student.parentPhone, "Devamsızlık bildirimi", "veli", body);
}

/** Demo için örnek mesaj listesi üret */
export function buildDemoMessages(data: AppData): WaMessage[] {
  const school = data.settings.name;
  const msgs: WaMessage[] = [];

  const now = new Date();
  for (const att of data.attendances.filter((a) => a.status === "absent")) {
    const lesson = data.lessons.find((l) => l.id === att.lessonId);
    if (!lesson || !isSameDay(parseISO(lesson.startAt), now)) continue;
    const student = data.students.find((s) => s.id === att.studentId);
    if (!student) continue;
    msgs.push(templateAbsenceNotice(school, student, lesson, att.reason || "Devamsızlık"));
  }

  for (const req of data.makeupRequests.filter(
    (m) => m.status === "pending" || m.status === "suggested" || m.status === "awaiting_info"
  )) {
    const student = data.students.find((s) => s.id === req.studentId);
    if (!student) continue;
    const branch = data.settings.branches.find((b) => b.id === req.branchId);
    msgs.push(templateMakeupCreated(school, student, req, branch?.shortName ?? ""));
  }

  for (const req of data.makeupRequests.filter((m) => m.status === "confirmed" && m.confirmedLessonId)) {
    const student = data.students.find((s) => s.id === req.studentId);
    const lesson = data.lessons.find((l) => l.id === req.confirmedLessonId);
    const teacher = data.teachers.find((t) => t.id === lesson?.teacherId);
    if (!student || !lesson || !teacher) continue;
    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
    msgs.push(templateMakeupConfirmed(school, student, lesson, teacher, branch?.shortName || ""));
    msgs.push(templateTeacherMakeupAssigned(school, teacher, student, lesson, branch?.shortName || ""));
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  for (const lesson of data.lessons.filter(
    (l) => isSameDay(parseISO(l.startAt), tomorrow) && l.status === "scheduled"
  )) {
    const student = data.students.find((s) => s.id === lesson.studentId);
    const teacher = data.teachers.find((t) => t.id === lesson.teacherId);
    const branch = data.settings.branches.find((b) => b.id === lesson.branchId);
    if (!student || !teacher) continue;
    msgs.push(templateLessonReminder(school, student, lesson, teacher, branch?.shortName || ""));
  }

  const collectionsSettings = data.settings.collectionsSettings ?? DEFAULT_COLLECTIONS_SETTINGS;
  for (const p of data.payments.filter((x) => x.status === "overdue" || x.status === "pending")) {
    const student = data.students.find((s) => s.id === p.studentId);
    if (!student) continue;
    const { bankLabel, iban } = resolveCollectionsIban(student.studentType, collectionsSettings);
    msgs.push(
      templatePaymentReminder(school, student, p.amount - p.paidAmount, p.dueDate, { bankLabel, iban })
    );
  }

  return msgs;
}

/** Ders planlama iletişim taslağı — otomatik gönderim yapmaz, yalnızca taslak üretir. */
export type LessonCommunicationMessage = {
  audience: "veli" | "öğretmen";
  toName: string;
  toPhone: string;
  body: string;
  /** Telefon kayıtlı değilse null — bozuk wa.me linki asla üretilmez. */
  waLink: string | null;
  missingPhoneReason?: string;
};

export type LessonCommunicationDraft = {
  parent: LessonCommunicationMessage;
  teacher: LessonCommunicationMessage;
};

export type MakeupLessonCommunicationDraft = LessonCommunicationDraft & {
  kind: "makeup_lesson_scheduled";
  smsBody: string;
  smsSendable: boolean;
  smsBlockReason?: string;
  whatsappDeliveryNote: string;
};

function buildLessonMessage(
  audience: LessonCommunicationMessage["audience"],
  toName: string,
  toPhone: string,
  body: string
): LessonCommunicationMessage {
  const digits = toPhone.replace(/\D/g, "");
  if (!digits) {
    return {
      audience,
      toName,
      toPhone,
      body,
      waLink: null,
      missingPhoneReason: "Telefon numarası kayıtlı değil.",
    };
  }
  const wa = phoneToWa(toPhone);
  return {
    audience,
    toName,
    toPhone,
    body,
    waLink: `https://wa.me/${wa}?text=${encodeURIComponent(body)}`,
  };
}

/** Yeni ders planlanınca veliye taslak */
export function templateLessonScheduled(
  school: string,
  student: Student,
  lesson: Lesson,
  teacher: Teacher,
  branchName: string
): string {
  return (
    `Merhaba ${student.parentName},\n\n` +
    `${school}\n` +
    `${student.name} için yeni bir ders planlandı.\n\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `👩‍🏫 ${teacher.name}\n` +
    `📍 ${branchName} şubesi\n\n` +
    `Katılım sağlayamayacaksanız lütfen önceden bildiriniz.\n` +
    `Görüşmek üzere.`
  );
}

/** Yeni ders planlanınca öğretmene taslak */
export function templateTeacherLessonAssigned(
  school: string,
  teacher: Teacher,
  student: Student,
  lesson: Lesson,
  branchName: string
): string {
  return (
    `Merhaba ${teacher.name},\n\n` +
    `${school} — programınıza yeni bir ders eklendi.\n\n` +
    `Öğrenci: ${student.name}\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `📍 ${branchName}\n\n` +
    `Programınızda görünüyor. İyi dersler.`
  );
}

/**
 * Admin bir ders planladığında OTOMATİK mesaj gönderilmez — yalnızca bu saf
 * fonksiyon çağrılıp UI'da admin'in açık onayıyla erişilebilen bir taslak
 * üretilir. Telefon kayıtlı değilse `waLink` null döner; hiçbir zaman bozuk
 * bir wa.me linki üretilmez.
 */
export function buildLessonCommunicationDraft(
  school: string,
  student: Student,
  teacher: Teacher,
  lesson: Lesson,
  branchName: string
): LessonCommunicationDraft {
  return {
    parent: buildLessonMessage(
      "veli",
      student.parentName,
      student.parentPhone,
      templateLessonScheduled(school, student, lesson, teacher, branchName)
    ),
    teacher: buildLessonMessage(
      "öğretmen",
      teacher.name,
      teacher.phone,
      templateTeacherLessonAssigned(school, teacher, student, lesson, branchName)
    ),
  };
}

export function templateMakeupLessonScheduledSms(
  school: string,
  student: Student,
  lesson: Lesson
): string {
  return `${school}: ${student.name} için telafi dersi ${fmtWhen(lesson.startAt)} (${lesson.instrument}).`;
}

export function buildMakeupLessonScheduledDraft(
  school: string,
  student: Student,
  teacher: Teacher,
  lesson: Lesson,
  branchName: string
): MakeupLessonCommunicationDraft {
  const parentBody =
    `Merhaba ${student.parentName},\n\n` +
    `${school}\n` +
    `${student.name} için bir telafi dersi planlandı.\n\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `👩‍🏫 ${teacher.name}\n` +
    `📍 ${branchName} şubesi\n\n` +
    `Katılamayacaksanız lütfen önceden bildiriniz.`;
  const teacherBody =
    `Merhaba ${teacher.name},\n\n` +
    `${school} — programınıza telafi dersi eklendi.\n\n` +
    `Öğrenci: ${student.name}\n` +
    `📅 ${fmtWhen(lesson.startAt)}\n` +
    `🎵 ${lesson.instrument}\n` +
    `📍 ${branchName}`;
  const smsBody = templateMakeupLessonScheduledSms(school, student, lesson);
  const optOut = Boolean(student.communicationOptOut);
  const phoneOk = Boolean(student.parentPhone?.replace(/\D/g, ""));
  let smsBlockReason: string | undefined;
  if (optOut) smsBlockReason = "İletişim izni kapalı.";
  else if (!phoneOk) smsBlockReason = "Veli telefonu kayıtlı değil.";
  return {
    kind: "makeup_lesson_scheduled",
    parent: buildLessonMessage("veli", student.parentName, student.parentPhone, parentBody),
    teacher: buildLessonMessage("öğretmen", teacher.name, teacher.phone, teacherBody),
    smsBody,
    smsSendable: !optOut && phoneOk,
    smsBlockReason,
    whatsappDeliveryNote: "wa.me bağlantısı teslim kanıtı değildir.",
  };
}

/** Statik şablon katalogu (kopyala-yapıştır) */
export const TEMPLATE_CATALOG = [
  {
    key: "makeup_created",
    title: "Telafi hakkı oluştu",
    when: "Yoklamada devamsızlık / okul iptali sonrası",
    sample: `Merhaba {veli_adı},

{okul} — {şube} şubesi.
{öğrenci} için telafi hakkı oluştu.
Enstrüman: {enstrüman}
Sebep: {sebep}
Son kullanım: {son_tarih}

Uygun saati birlikte planlamak için yanıt verebilirsiniz.
Teşekkürler.`,
  },
  {
    key: "makeup_confirmed",
    title: "Telafi onaylandı",
    when: "Slot onaylandığında veliye",
    sample: `Merhaba {veli_adı},

{okul}
{öğrenci} için telafi dersi planlandı ✅

📅 {tarih_saat}
🎵 {enstrüman}
👩‍🏫 {öğretmen}
📍 {şube} şubesi

Katılamayacaksanız lütfen 24 saat önce bildiriniz.`,
  },
  {
    key: "teacher_assigned",
    title: "Öğretmene telafi ataması",
    when: "Slot onaylandığında öğretmene",
    sample: `Merhaba {öğretmen},

{okul} — yeni telafi dersi atandı.
Öğrenci: {öğrenci}
📅 {tarih_saat}
🎵 {enstrüman}
📍 {şube}

Programınızda görünüyor. İyi dersler.`,
  },
  {
    key: "lesson_reminder",
    title: "Ders hatırlatması",
    when: "Dersden 1 gün önce",
    sample: `Merhaba {veli_adı},

Yarın ders hatırlatması — {okul}
Öğrenci: {öğrenci}
📅 {tarih_saat}
🎵 {enstrüman} · {öğretmen}
📍 {şube} şubesi

Görüşmek üzere 🎼`,
  },
  {
    key: "payment",
    title: "Ödeme hatırlatması",
    when: "Vade yaklaşınca / gecikince",
    sample: `Merhaba {veli_adı},

{okul} ödeme hatırlatması.
Öğrenci: {öğrenci}
Tutar: {tutar}
Vade: {vade}

Ödeme bilgisini okuldan teyit edebilirsiniz.
Teşekkürler.`,
  },
  {
    key: "absence",
    title: "Devamsızlık bildirimi",
    when: "Öğrenci derse gelmediğinde",
    sample: `Merhaba {veli_adı},

{okul}: {öğrenci} bugünkü dersine katılamadı.
Ders: {tarih_saat} · {enstrüman}
Not: {sebep}

Politika gereği telafi hakkı oluşturuldu.`,
  },
] as const;
