/**
 * 2026-10-15 (owner) — öğrenci/öğretmen KALICI SİLME planlayıcısı. Saf fonksiyon: anlık görüntü → plan.
 *
 * Önizleme ve silme AYNI planı kullanır: önizleme planı + parmak izini (`fingerprint`) döner; silme
 * kilit altında anlık görüntüyü yeniden okur, planı yeniden kurar ve parmak izi farklıysa HİÇBİR ŞEY
 * yazmaz (CONFLICT → kullanıcı yeniden önizler ve yeniden onaylar).
 *
 * İki sonuç:
 * - "delete": korunması gereken geçmiş yok → kişiye ait tüm bağımlı kayıtlar ve kişi satırı silinir.
 * - "anonymize": kesinleşmiş tahsilat, imzalı sözleşme, hakedişe girmiş ders veya başka kişilerin
 *   geçmişi var → yalnız kişiye ait silinebilir kayıtlar silinir, korunanlar kalır; kişi satırı
 *   yerinde anonimleştirilir (ad "Silinmiş öğrenci (Ö-12)", iletişim/kimlik alanları boş) ve
 *   `purgedAt` ile işaretlenir — Silinenler listesinden de çıkar, geri alınamaz.
 * Foreign key'ler RESTRICT kalır; geniş CASCADE yok. Paylaşılan kayıtlar (grup dersi, oda, başka
 * öğrenci/öğretmen, ortak veli hesabı) silinmez; yalnız bu kişiyle bağlantısı kaldırılır.
 */
import { createHash } from "node:crypto";

export type PurgeKind = "student" | "teacher";
export type PurgeOutcome = "delete" | "anonymize";

/** Silme/bağlantı kaldırma için tablo anahtarları — DB ve dosya yürütücüleri bu anahtarları eşler. */
export type PurgeTableKey =
  | "lessons"
  | "attendances"
  | "series"
  | "makeups"
  | "payments"
  | "contracts"
  | "documents"
  | "checkouts"
  | "followUps"
  | "clubMemberships"
  | "portalAccess"
  | "feedbackInvites"
  | "lessonAssessments"
  | "periodicAssessments"
  | "homeworkSubmissions"
  | "homework"
  | "teacherFeedback"
  | "studentFeedback"
  | "curriculumTopics"
  | "socialMediaConsents"
  | "kvkkConsents"
  | "riskLogs"
  | "notifications"
  | "profilePhotos"
  | "communicationMessages"
  | "availabilityRequests"
  | "teachingMaterials"
  | "trialLessons"
  | "feeRules"
  | "payoutExclusions"
  | "payouts"
  | "students";

export type PurgeDetachKey = "tasks" | "clubApplications" | "trialConversions" | "clubs";

export const PURGE_TABLE_LABELS: Record<PurgeTableKey | PurgeDetachKey, string> = {
  lessons: "Ders kaydı",
  attendances: "Yoklama kaydı",
  series: "Ders serisi",
  makeups: "Telafi kaydı",
  payments: "Ödeme/borç satırı",
  contracts: "Sözleşme",
  documents: "Evrak/dosya",
  checkouts: "Online ödeme denemesi",
  followUps: "Tahsilat takip kaydı",
  clubMemberships: "Grup dersi üyeliği",
  portalAccess: "Portal erişim bağı",
  feedbackInvites: "Değerlendirme davet linki",
  lessonAssessments: "Ders değerlendirmesi",
  periodicAssessments: "Dönem raporu",
  homeworkSubmissions: "Ödev teslimi",
  homework: "Ödev",
  teacherFeedback: "Öğretmen geri bildirimi",
  studentFeedback: "Öğrenci geri bildirimi",
  curriculumTopics: "Müfredat konusu",
  socialMediaConsents: "Fotoğraf/sosyal medya izni",
  kvkkConsents: "KVKK onay kaydı",
  riskLogs: "Devamsızlık risk kaydı",
  notifications: "Bildirim",
  profilePhotos: "Profil fotoğrafı",
  communicationMessages: "Mesaj taslağı/kaydı",
  availabilityRequests: "Müsaitlik talebi",
  teachingMaterials: "Ders materyali",
  trialLessons: "Deneme dersi",
  feeRules: "Ücret kuralı",
  payoutExclusions: "Hakediş hariç tutma kaydı",
  payouts: "Hakediş kaydı",
  students: "Öğrenci kaydı (öğretmeni bu kişi)",
  tasks: "Görev (iş takibi)",
  clubApplications: "Grup dersi başvurusu",
  trialConversions: "Deneme dersi dönüşüm bağı",
  clubs: "Grup dersi öğretmen listesi",
};

export type PurgePerson = {
  id: string;
  name: string;
  displayId?: string;
  active: boolean;
  deletedAt?: string;
  purgedAt?: string;
};

export type PurgeLessonRow = {
  id: string;
  studentId: string;
  teacherId: string;
  startAt: string;
  status: string;
  seriesId?: string;
  clubSessionId?: string;
};
export type PurgePaymentRow = {
  id: string;
  amount: number;
  paidAmount: number;
  status: string;
  contractId?: string;
  lessonId?: string;
  clubMembershipId?: string;
};
export type PurgeContractRow = { id: string; status: string; signedAt?: string; documentInstanceId?: string };
export type PurgePayoutRow = { id: string; teacherId: string; periodStart: string; periodEnd: string; status: string };
/** Kişiye bağlı giriş hesabı. `otherLinks` > 0 ise hesap başka öğrenci/rol için de kullanılıyor — kapatılmaz. */
export type PurgeAccountRow = {
  userId: string;
  role: string;
  email: string;
  otherLinks: number;
  portalAccessIds: string[];
};

export type StudentPurgeSnapshot = {
  kind: "student";
  person: PurgePerson;
  lessons: PurgeLessonRow[];
  attendances: { id: string; lessonId: string }[];
  series: { id: string }[];
  makeups: { id: string; attendanceId: string; sourceLessonId: string; confirmedLessonId?: string }[];
  payments: PurgePaymentRow[];
  contracts: PurgeContractRow[];
  checkouts: { id: string; paymentId: string; status: string }[];
  followUps: { id: string; paymentId: string }[];
  /** Derslerinin öğretmenlerine ait hakedişler (dönem kapsaması için). */
  payouts: PurgePayoutRow[];
  documents: { id: string }[];
  clubMemberships: { id: string }[];
  /** Kişiye ait, başka kayda bağlı olmayan tablolar — her zaman silinir (kvkkConsents hariç: anonimleştirmede korunur). */
  owned: Partial<Record<PurgeTableKey, string[]>>;
  detach: Partial<Record<PurgeDetachKey, string[]>>;
  accounts: PurgeAccountRow[];
  teacherNames: Record<string, string>;
  nowIso: string;
};

export type TeacherPurgeSnapshot = {
  kind: "teacher";
  person: PurgePerson;
  lessons: PurgeLessonRow[];
  series: { id: string; status: string }[];
  makeups: { id: string }[];
  payouts: PurgePayoutRow[];
  feeRules: string[];
  payoutExclusions: string[];
  /** Bu öğretmeni ana öğretmen veya branş öğretmeni olarak taşıyan öğrenciler (silinmiş/anonim dahil). */
  students: { id: string; name: string; active: boolean; deletedAt?: string; activeLink: boolean }[];
  /** Öğretmene ait, kimseyle paylaşılmayan kayıtlar — her zaman silinir. */
  owned: Partial<Record<PurgeTableKey, string[]>>;
  /** Öğrencilerin geçmişinde kalan kayıtlar — varsa öğretmen satırı korunur (anonimleştirilir). */
  history: Partial<Record<PurgeTableKey, string[]>>;
  detach: Partial<Record<PurgeDetachKey, string[]>>;
  accounts: PurgeAccountRow[];
  nowIso: string;
};

export type PurgeSnapshot = StudentPurgeSnapshot | TeacherPurgeSnapshot;

export type PurgeBucket = { key: PurgeTableKey | PurgeDetachKey; label: string; ids: string[]; note?: string };
export type PurgeAccountAction = { userId: string; role: string; maskedEmail: string; action: "close" | "unlink"; portalAccessIds: string[] };

export type PurgePlan = {
  kind: PurgeKind;
  personId: string;
  personName: string;
  displayId?: string;
  outcome: PurgeOutcome;
  /** Engel yoksa ve kişi Silinenler'deyse true. */
  eligible: boolean;
  blockers: { reason: string; fix: string }[];
  /** Kalıcı silinecek kayıtlar. */
  remove: PurgeBucket[];
  /** Silinmeyen, yalnız bu kişiyle bağlantısı kaldırılan kayıtlar. */
  detach: PurgeBucket[];
  /** Korunan kayıtlar (anonim kişiye bağlı kalır). */
  keep: PurgeBucket[];
  accounts: PurgeAccountAction[];
  /** Kullanıcıya gösterilecek somut yan etkiler (gelecek ders, hakediş, grup dersi...). */
  effects: string[];
  /** Anonimleştirmede kişinin yeni görünen adı. */
  anonymizedName: string;
  fingerprint: string;
};

const ACTIVE_LESSON = new Set(["scheduled", "in_progress"]);

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email ? "***" : "—";
  return `${(user ?? "").slice(0, 1)}***@${domain}`;
}

export function anonymizedPersonName(kind: PurgeKind, displayId?: string): string {
  const base = kind === "student" ? "Silinmiş öğrenci" : "Silinmiş öğretmen";
  return displayId ? `${base} (${displayId})` : base;
}

/** Tahsil edilmiş tutar — `payment-profile.collectedAmountOf` ile AYNI tanım (istemci-güvenli kopya değil; saf). */
function collected(p: PurgePaymentRow): number {
  if (p.status === "voided") return 0;
  if (p.status === "paid") return p.paidAmount > 0 ? p.paidAmount : p.amount;
  return Math.max(0, p.paidAmount ?? 0);
}

function bucket(key: PurgeBucket["key"], ids: Iterable<string>, note?: string): PurgeBucket | null {
  const list = [...new Set(ids)].sort();
  return list.length ? { key, label: PURGE_TABLE_LABELS[key], ids: list, ...(note ? { note } : {}) } : null;
}

function compact(xs: (PurgeBucket | null)[]): PurgeBucket[] {
  return xs.filter((x): x is PurgeBucket => x !== null);
}

function accountActions(accounts: PurgeAccountRow[]): PurgeAccountAction[] {
  return [...accounts]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((a) => ({
      userId: a.userId,
      role: a.role,
      maskedEmail: maskEmail(a.email),
      action: a.otherLinks > 0 ? "unlink" : "close",
      portalAccessIds: [...a.portalAccessIds].sort(),
    }));
}

function fingerprintOf(plan: Omit<PurgePlan, "fingerprint" | "effects" | "personName">): string {
  const ser = (bs: PurgeBucket[]) => bs.map((b) => [b.key, b.ids]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const payload = JSON.stringify({
    k: plan.kind,
    id: plan.personId,
    o: plan.outcome,
    e: plan.eligible,
    b: plan.blockers.map((x) => x.reason),
    r: ser(plan.remove),
    d: ser(plan.detach),
    keep: ser(plan.keep),
    a: plan.accounts.map((a) => [a.userId, a.action, a.portalAccessIds]),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function finish(p: Omit<PurgePlan, "fingerprint">): PurgePlan {
  return { ...p, fingerprint: fingerprintOf(p) };
}

function precondition(kind: PurgeKind, person: PurgePerson): { reason: string; fix: string }[] {
  if (person.purgedAt) return [{ reason: "Bu kayıt zaten kalıcı silinmiş.", fix: "Sayfayı yenileyin." }];
  if (!person.deletedAt) {
    return kind === "student"
      ? [{ reason: "Öğrenci henüz silinmemiş.", fix: 'Önce öğrenci sayfasında "Öğrenciyi sil" ile Silinenler\'e taşıyın; kalıcı silme oradan yapılır.' }]
      : [{ reason: "Öğretmen henüz listeden kaldırılmamış.", fix: 'Önce öğretmeni pasife alıp "Listeden kaldır" deyin; kalıcı silme Kaldırılanlar listesinden yapılır.' }];
  }
  return [];
}

export function planStudentPurge(s: StudentPurgeSnapshot): PurgePlan {
  const blockers = precondition("student", s.person);
  const lessonById = new Map(s.lessons.map((l) => [l.id, l]));
  const activePayouts = s.payouts.filter((p) => p.status !== "cancelled");

  // 1) Kesin koruma tetikleyicileri.
  const keepPayments = new Set(s.payments.filter((p) => collected(p) > 0).map((p) => p.id));
  const keepContracts = new Set(s.contracts.filter((c) => c.signedAt || c.status === "signed" || c.status === "recorded").map((c) => c.id));
  const keepLessons = new Set(
    s.lessons
      .filter((l) => activePayouts.some((p) => p.teacherId === l.teacherId && p.periodStart <= l.startAt && l.startAt <= p.periodEnd))
      .map((l) => l.id)
  );
  const succeededCheckout = new Set(s.checkouts.filter((c) => c.status === "succeeded" || c.status === "paid").map((c) => c.paymentId));
  for (const id of succeededCheckout) keepPayments.add(id);
  const keepMakeups = new Set<string>();

  // 2) Bağımlılıkları sabit noktaya kadar yay (tahsil edilmiş taksit → sözleşmesi; korunan sözleşme → tüm taksitleri;
  //    korunan ödeme → bağlı ders; korunan ders ↔ telafisi).
  const attendanceLesson = new Map(s.attendances.map((a) => [a.id, a.lessonId]));
  for (let changed = true; changed; ) {
    changed = false;
    const add = (set: Set<string>, id: string | undefined) => {
      if (id && !set.has(id)) {
        set.add(id);
        changed = true;
      }
    };
    for (const p of s.payments) {
      if (keepPayments.has(p.id)) {
        add(keepContracts, p.contractId);
        if (p.lessonId && lessonById.has(p.lessonId)) add(keepLessons, p.lessonId);
      }
      if (p.contractId && keepContracts.has(p.contractId)) add(keepPayments, p.id);
    }
    for (const m of s.makeups) {
      const src = attendanceLesson.get(m.attendanceId) ?? m.sourceLessonId;
      const touched = keepLessons.has(src) || (m.confirmedLessonId !== undefined && keepLessons.has(m.confirmedLessonId));
      if (touched || keepMakeups.has(m.id)) {
        add(keepMakeups, m.id);
        add(keepLessons, src);
        if (m.confirmedLessonId && lessonById.has(m.confirmedLessonId)) add(keepLessons, m.confirmedLessonId);
      }
    }
  }
  const keepSeries = new Set(s.lessons.filter((l) => keepLessons.has(l.id) && l.seriesId).map((l) => l.seriesId!));
  const keepAttendances = new Set(s.attendances.filter((a) => keepLessons.has(a.lessonId)).map((a) => a.id));
  const keepDocs = new Set(s.contracts.filter((c) => keepContracts.has(c.id) && c.documentInstanceId).map((c) => c.documentInstanceId!));
  const keepMemberships = new Set(s.payments.filter((p) => keepPayments.has(p.id) && p.clubMembershipId).map((p) => p.clubMembershipId!));
  const outcome: PurgeOutcome =
    keepPayments.size + keepContracts.size + keepLessons.size + keepMakeups.size > 0 ? "anonymize" : "delete";

  // 3) Engeller: korunan sözleşmenin/ödemenin açık borcu ve süren online ödeme.
  const terminal = new Set(s.contracts.filter((c) => c.status === "cancelled" || c.status === "superseded").map((c) => c.id));
  const openDebt = s.payments
    .filter((p) => keepPayments.has(p.id) && p.status !== "paid" && p.status !== "voided" && !(p.contractId && terminal.has(p.contractId)))
    .reduce((sum, p) => sum + Math.max(0, p.amount - p.paidAmount), 0);
  if (openDebt > 0) {
    blockers.push({
      reason: `Korunan sözleşme/ödeme kayıtlarında ${openDebt.toLocaleString("tr-TR")} ₺ açık borç var.`,
      fix: "Önce öğrencinin Ödemeler sekmesinde borcu tahsil edin, iptal edin veya sözleşmeyi Sözleşmeler sekmesinden iptal edin.",
    });
  }
  const pendingCheckouts = s.checkouts.filter((c) => c.status === "pending" || c.status === "processing").length;
  if (pendingCheckouts > 0) {
    blockers.push({
      reason: `${pendingCheckouts} online ödeme işlemi hâlâ sürüyor.`,
      fix: "Ödeme sonuçlanana kadar bekleyin (birkaç dakika) ve önizlemeyi yenileyin.",
    });
  }

  const not = (keep: Set<string>) => (id: string) => !keep.has(id);
  const removeLessons = s.lessons.map((l) => l.id).filter(not(keepLessons));
  const removePayments = s.payments.map((p) => p.id).filter(not(keepPayments));
  const removedPaymentSet = new Set(removePayments);
  const owned = { ...s.owned };
  const keptOwned: Partial<Record<PurgeTableKey, string[]>> = {};
  if (outcome === "anonymize" && owned.kvkkConsents?.length) {
    keptOwned.kvkkConsents = owned.kvkkConsents;
    delete owned.kvkkConsents;
  }

  const upcoming = s.lessons.filter((l) => !keepLessons.has(l.id) && ACTIVE_LESSON.has(l.status) && l.startAt > s.nowIso);
  const group = s.lessons.filter((l) => !keepLessons.has(l.id) && l.clubSessionId);
  const effects: string[] = [];
  if (upcoming.length) effects.push(`${upcoming.length} gelecek ders silinir; öğretmen ve oda programında o saatler boşalır. Başka öğretmen atanmaz.`);
  if (group.length) effects.push(`${group.length} grup dersi kaydında yalnız bu öğrencinin satırı silinir; grup dersi, öğretmeni ve diğer üyeler etkilenmez.`);
  const realizedByTeacher = new Map<string, number>();
  for (const l of s.lessons) {
    if (keepLessons.has(l.id) || ACTIVE_LESSON.has(l.status) || l.status === "cancelled") continue;
    realizedByTeacher.set(l.teacherId, (realizedByTeacher.get(l.teacherId) ?? 0) + 1);
  }
  for (const [tid, n] of realizedByTeacher) {
    effects.push(`${s.teacherNames[tid] ?? "Öğretmen"}: henüz hakedişi oluşturulmamış ${n} geçmiş ders silinir ve sonraki hakediş hesabında sayılmaz.`);
  }
  if (keepLessons.size) effects.push(`${keepLessons.size} ders kesinleşmiş hakedişe veya korunan ödemeye bağlı olduğu için korunur; öğretmen hakedişi değişmez.`);
  if (outcome === "anonymize") {
    effects.push(
      `Öğrenci satırı silinmez, anonimleştirilir: ad "${anonymizedPersonName("student", s.person.displayId)}" olur; telefon, e-posta, veli, adres, TC, doğum bilgisi ve notlar silinir. Kayıt Silinenler'den de kalkar ve geri alınamaz.`
    );
  }
  if (keepContracts.size) effects.push("İmzalı sözleşme belgesi yasal saklama için olduğu gibi korunur (belgedeki imzacı bilgileri dahil).");

  return finish({
    kind: "student",
    personId: s.person.id,
    personName: s.person.name,
    displayId: s.person.displayId,
    outcome,
    eligible: blockers.length === 0,
    blockers,
    remove: compact([
      bucket("lessons", removeLessons, upcoming.length ? `${upcoming.length} tanesi gelecek tarihli` : undefined),
      bucket("attendances", s.attendances.map((a) => a.id).filter(not(keepAttendances))),
      bucket("makeups", s.makeups.map((m) => m.id).filter(not(keepMakeups))),
      bucket("series", s.series.map((x) => x.id).filter(not(keepSeries))),
      bucket("payments", removePayments, "Tahsilatı olmayan (ödenmemiş) satırlar"),
      bucket("contracts", s.contracts.map((c) => c.id).filter(not(keepContracts)), "İmzalanmamış ve tahsilatı olmayan"),
      bucket("documents", s.documents.map((d) => d.id).filter(not(keepDocs))),
      bucket("checkouts", s.checkouts.filter((c) => removedPaymentSet.has(c.paymentId)).map((c) => c.id)),
      bucket("followUps", s.followUps.filter((f) => removedPaymentSet.has(f.paymentId)).map((f) => f.id)),
      bucket("clubMemberships", s.clubMemberships.map((m) => m.id).filter(not(keepMemberships))),
      ...(Object.entries(owned) as [PurgeTableKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
    ]),
    detach: compact((Object.entries(s.detach) as [PurgeDetachKey, string[]][]).map(([k, ids]) => bucket(k, ids))),
    keep: compact([
      bucket("payments", keepPayments, "Tahsilatı olan veya korunan sözleşmeye bağlı"),
      bucket("contracts", keepContracts, "İmzalı veya tahsilatı olan"),
      bucket("documents", keepDocs, "Korunan sözleşmenin belgesi"),
      bucket("lessons", keepLessons, "Hakedişe giren veya korunan ödemeye bağlı"),
      bucket("attendances", keepAttendances),
      bucket("makeups", keepMakeups),
      bucket("series", keepSeries),
      bucket("checkouts", s.checkouts.filter((c) => !removedPaymentSet.has(c.paymentId)).map((c) => c.id)),
      bucket("followUps", s.followUps.filter((f) => !removedPaymentSet.has(f.paymentId)).map((f) => f.id)),
      bucket("clubMemberships", keepMemberships),
      ...(Object.entries(keptOwned) as [PurgeTableKey, string[]][]).map(([k, ids]) => bucket(k, ids, "Saklanan verinin hukuki dayanağı")),
    ]),
    accounts: accountActions(s.accounts),
    effects,
    anonymizedName: anonymizedPersonName("student", s.person.displayId),
  });
}

export function planTeacherPurge(s: TeacherPurgeSnapshot): PurgePlan {
  const blockers = precondition("teacher", s.person);
  // Listeden kaldırmadaki kapılar kalıcı silmede de geçerli (kaldırıldıktan sonra veri değişmiş olabilir).
  const upcoming = s.lessons.filter((l) => ACTIVE_LESSON.has(l.status) && l.startAt > s.nowIso).length;
  if (upcoming) blockers.push({ reason: `İleri tarihli ${upcoming} planlı dersi var.`, fix: "Ders Programı'nda bu dersleri başka öğretmene taşıyın veya iptal edin; sistem öğretmeni kendiliğinden değiştirmez." });
  const activeSeries = s.series.filter((x) => x.status === "active").length;
  if (activeSeries) blockers.push({ reason: `${activeSeries} aktif ders serisi var.`, fix: "Ders Programı'nda seriyi sonlandırın veya başka öğretmene devredin." });
  const activeStudents = s.students.filter((x) => x.active && !x.deletedAt && x.activeLink);
  if (activeStudents.length) {
    const names = activeStudents.slice(0, 5).map((x) => x.name).join(", ");
    blockers.push({
      reason: `${activeStudents.length} aktif öğrencinin öğretmeni (${names}${activeStudents.length > 5 ? "…" : ""}).`,
      fix: "Öğrenciler ekranında bu öğrencileri başka öğretmene atayın.",
    });
  }
  const openPayouts = s.payouts.filter((p) => p.status === "pending" || p.status === "partial").length;
  if (openPayouts) blockers.push({ reason: `Ödenmemiş ${openPayouts} hakedişi var.`, fix: "Hakedişler ekranında ödeyin veya iptal edin." });

  const keptPayouts = s.payouts.filter((p) => p.status !== "cancelled").map((p) => p.id);
  const cancelledPayouts = s.payouts.filter((p) => p.status === "cancelled").map((p) => p.id);
  const historyCount =
    s.lessons.length + s.series.length + s.makeups.length + keptPayouts.length + s.students.length +
    Object.values(s.history).reduce((n, ids) => n + (ids?.length ?? 0), 0);
  const outcome: PurgeOutcome = historyCount > 0 ? "anonymize" : "delete";

  const effects: string[] = [];
  if (outcome === "anonymize") {
    effects.push(
      `Öğretmen satırı silinmez, anonimleştirilir: geçmiş ders, yoklama, hakediş ve öğrenci değerlendirmelerinde ad "${anonymizedPersonName("teacher", s.person.displayId)}" görünür; telefon, e-posta, TC, adres, acil durum kişisi ve özlük notları silinir. Kayıt geri alınamaz.`
    );
  }
  if (s.detach.clubs?.length) effects.push(`${s.detach.clubs.length} grup dersinin öğretmen listesinden çıkarılır; grup dersi ve üyeleri silinmez, yerine kimse atanmaz.`);
  const studentsOnRecord = s.students.length;
  if (studentsOnRecord) effects.push(`${studentsOnRecord} öğrenci kaydında (silinmiş/pasif) geçmiş öğretmen olarak kalır; öğrenciler silinmez.`);

  const deleteIfFull = (key: PurgeTableKey, ids: string[]) => (outcome === "delete" ? bucket(key, ids) : null);
  const keepIfAnon = (key: PurgeTableKey, ids: string[], note?: string) => (outcome === "anonymize" ? bucket(key, ids, note) : null);
  return finish({
    kind: "teacher",
    personId: s.person.id,
    personName: s.person.name,
    displayId: s.person.displayId,
    outcome,
    eligible: blockers.length === 0,
    blockers,
    remove: compact([
      ...(Object.entries(s.owned) as [PurgeTableKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
      deleteIfFull("feeRules", s.feeRules),
      deleteIfFull("payoutExclusions", s.payoutExclusions),
      deleteIfFull("payouts", cancelledPayouts),
    ]),
    detach: compact((Object.entries(s.detach) as [PurgeDetachKey, string[]][]).map(([k, ids]) => bucket(k, ids))),
    keep: compact([
      bucket("lessons", s.lessons.map((l) => l.id), "Öğrencilerin ders/yoklama geçmişi"),
      bucket("series", s.series.map((x) => x.id)),
      bucket("makeups", s.makeups.map((m) => m.id)),
      bucket("payouts", keptPayouts, "Kesinleşmiş hakediş"),
      bucket("students", s.students.map((x) => x.id), "Öğrenciler silinmez"),
      ...(Object.entries(s.history) as [PurgeTableKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
      keepIfAnon("feeRules", s.feeRules, "Geçmiş hakediş hesabı için"),
      keepIfAnon("payoutExclusions", s.payoutExclusions),
      keepIfAnon("payouts", cancelledPayouts, "İptal edilmiş hakediş"),
    ]),
    accounts: accountActions(s.accounts),
    effects,
    anonymizedName: anonymizedPersonName("teacher", s.person.displayId),
  });
}

export function planPersonPurge(s: PurgeSnapshot): PurgePlan {
  return s.kind === "student" ? planStudentPurge(s) : planTeacherPurge(s);
}

/** Planın bucket'larından tablo → id listesi (yürütücüler için). */
export function bucketIds(buckets: PurgeBucket[], key: PurgeBucket["key"]): string[] {
  return buckets.find((b) => b.key === key)?.ids ?? [];
}

export class PurgeConflictError extends Error {
  constructor(message = "PURGE_CONFLICT") {
    super(message);
  }
}

/** Öğrenci anonimleştirmede silinen/boşaltılan kişisel alanlar (DB ve dosya yürütücüsü AYNI listeyi kullanır). */
export const STUDENT_PII_CLEAR = [
  "parentName",
  "parentPhone",
  "motherName",
  "fatherName",
  "referralSourceDetail",
  "specialNotes",
  "birthDate",
  "address",
  "nationalIdCipher",
  "nationalIdLast2",
  "birthPlace",
  "schoolOrOccupation",
  "monthlyFeeOverrideReason",
  "paymentPauseReason",
  "lessonScheduleText",
  "deletionReason",
] as const;

export const TEACHER_PII_CLEAR = [
  "highSchool",
  "university",
  "graduationYear",
  "nationalIdCipher",
  "nationalIdLast2",
  "birthDate",
  "address",
  "emergencyContactName",
  "emergencyContactPhone",
  "personnelNotes",
  "deletionReason",
] as const;

/** Kapatılan hesabın e-postası — benzersiz (tenantId,email) kısıtını serbest bırakır, adres saklanmaz. */
export function closedAccountEmail(userId: string): string {
  return `silindi+${userId}@invalid.neviihub.local`;
}
