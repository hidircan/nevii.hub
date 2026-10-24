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
 *
 * Mod "wipe" (2026-10-15, owner): "Yanlış oluşturuldu — her şeyi sil". Finans kuralının ("ödeme satırları
 * silinmez") BİLİNÇLİ, owner onaylı tek istisnası: kişinin KENDİ tahsilat/borç/sözleşme/hakediş satırları da
 * silinir, kişi satırı silinir (anonimleştirme yok). Başka kişinin kaydı yine silinmez/değişmez: başka
 * öğretmenin hakedişine girmiş ders, sağlayıcıda tahsil edilmiş online ödeme, öğretmenin öğrenci geçmişi →
 * ENGEL (önizlemede somut çözümüyle). Yalnız kurum sahibi; önizlemede finansal özet ayrı gösterilir.
 */
import { createHash } from "node:crypto";
import { applyPayoutLineOverrides, toDayKey, type TeacherEarningsResult } from "./teacher-payout";
import type { TeacherPayoutLineOverride, TeacherPayoutSnapshotLine } from "./types";
import { formatMoney } from "./utils";

export type PurgeKind = "student" | "teacher";
export type PurgeOutcome = "delete" | "anonymize";
/** "standard": korunması gereken geçmiş varsa anonimleştir. "wipe": yanlış oluşturulmuş kayıt — kişinin finansı dahil her şeyi sil. */
export type PurgeMode = "standard" | "wipe";

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
  | "callLogs"
  | "messageLogs"
  | "availabilityRequests"
  | "teachingMaterials"
  | "trialLessons"
  | "feeRules"
  | "payoutExclusions"
  | "payouts"
  | "students";

export type PurgeDetachKey =
  | "tasks"
  | "paymentTasks"
  | "clubApplications"
  | "trialConversions"
  | "clubs"
  | "lessonPayments"
  | "seriesLessons"
  | "makeupPlans";

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
  callLogs: "Arama kaydı (CRM)",
  messageLogs: "Gelen mesaj kaydı (CRM)",
  availabilityRequests: "Müsaitlik talebi",
  teachingMaterials: "Ders materyali",
  trialLessons: "Deneme dersi",
  feeRules: "Ücret kuralı",
  payoutExclusions: "Hakediş hariç tutma kaydı",
  payouts: "Hakediş kaydı",
  students: "Öğrenci kaydı (öğretmeni bu kişi)",
  tasks: "Görev (iş takibi)",
  paymentTasks: "Görev (silinen ödeme satırına bağlı)",
  clubApplications: "Grup dersi başvurusu",
  trialConversions: "Deneme dersi dönüşüm bağı",
  clubs: "Grup dersi öğretmen listesi",
  lessonPayments: "Derse bağlı ödeme satırı (öğrencinin borcu/tahsilatı korunur)",
  seriesLessons: "Başka öğretmene taşınmış seri dersi",
  makeupPlans: "Telafi planı kaldırılır (hak ve kaynak ders korunur, talep Telafi Merkezi'nde yeniden açık)",
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
  /** 2026-10-23 — grup dersi oturumu (diğer katılımcılarla ortak). */
  groupSessionId?: string;
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
/** `lessonIds`: hakedişin dondurulmuş satırlarındaki dersler (`lineSnapshot`); yoksa dönem kapsaması kullanılır. */
export type PurgePayoutRow = {
  id: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  lessonIds?: string[];
  totalAmount?: number;
  /** Tam silmede hakediş yeniden yazımı için: dondurulmuş satırlar, satır düzeltmeleri, eşzamanlılık sayacı. */
  lineSnapshot?: TeacherPayoutSnapshotLine[];
  lineOverrides?: Record<string, TeacherPayoutLineOverride>;
  version?: number;
};

/**
 * Tam silmede başka öğretmenin hakedişine etkisi (sessiz değişiklik yok — önizlemede tutarıyla gösterilir):
 * - "recalc": ödemesi olmayan (bekleyen) kayıt — yalnız bu kişinin satırları çıkarılır, toplam kalan satırlardan
 *   (satır düzeltmeleri dahil, `recomputePayoutData` ile aynı formül) yeniden hesaplanır. Diğer satırlar değişmez.
 * - "scrub": ödemeli/kısmi/iptal kayıt — tutar DEĞİŞMEZ (para ödenmiş); satırlardaki öğrenci adı/kimliği silinir.
 * - "legacy": satır dökümü olmayan eski kayıt — tutar değişmez, dökümde silinen dersler artık görünmez.
 */
export type PurgePayoutChange = {
  payoutId: string;
  teacherId: string;
  teacherName: string;
  period: string;
  status: string;
  action: "recalc" | "scrub" | "legacy";
  lessonIds: string[];
  before: number;
  after: number;
  version: number;
};

/** Öğretmen tam silmede seçenekler: dersleri sil veya başka öğretmene devret; öğrenci ataması her durumda hedefe devredilir. */
export type WipeOptions = { lessonAction?: "delete" | "reassign"; targetTeacherId?: string };

export type PurgeReassign = {
  targetTeacherId: string;
  targetTeacherName: string;
  lessons: string[];
  series: string[];
  makeups: string[];
  students: string[];
  history: Partial<Record<PurgeTableKey, string[]>>;
};
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
  /** Ödeme satırına `Task.paymentId` ile bağlı görevler (FK yok — silinen ödemede bağ kaldırılır). */
  paymentTasks?: { id: string; paymentId: string }[];
  /** Kişiye ait, başka kayda bağlı olmayan tablolar — her zaman silinir (kvkkConsents hariç: anonimleştirmede korunur). */
  owned: Partial<Record<PurgeTableKey, string[]>>;
  detach: Partial<Record<PurgeDetachKey, string[]>>;
  accounts: PurgeAccountRow[];
  teacherNames: Record<string, string>;
  /** Grup oturumu → bu öğrenci dışındaki üye satırı sayısı (0 ise oturum programdan kalkar). */
  groupSessionOthers?: Record<string, number>;
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
  /**
   * Tam silme için derslerine bağlı başka kayıtlar (FK sırası): yoklamalar, bu derslere bağlı başka öğretmenin telafi
   * talepleri, derse bağlı ödeme satırları (FK yok — bağ kaldırılır), seriye ait ama başka öğretmene taşınmış dersler.
   */
  lessonLinks?: { attendances: string[]; makeups: string[]; payments: string[]; seriesLessons: string[]; makeupPlans?: string[] };
  /** Devir hedefi adayları (kurumdaki diğer öğretmenler). */
  teachers?: { id: string; name: string; active: boolean; deletedAt?: string }[];
  /** 2026-10-23 — öğretmeni bu kişi olan grup dersi tanımları (aktif olan varken silme açılmaz). */
  groupLessons?: { id: string; name: string; status: string }[];
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

/** Önizlemedeki finansal özet (yalnız "wipe"). "Tahsil edilen" ile "borç" ayrı alan — finans kuralı. */
export type PurgeFinancialSummary = {
  collectedCount: number;
  collectedTotal: number;
  debtCount: number;
  debtTotal: number;
  contractCount: number;
  signedContractCount: number;
  payoutCount: number;
  payoutTotal: number;
  paidPayoutCount: number;
};

export type PurgePlan = {
  kind: PurgeKind;
  mode: PurgeMode;
  /** Yalnız "wipe": silinecek finansal kayıtların sayı + tutar özeti. */
  financial?: PurgeFinancialSummary;
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
  /** Tam silme: başka öğretmenlerin hakedişlerine etkisi (öğretmen/dönem/tutar). */
  payoutChanges: PurgePayoutChange[];
  /** Öğretmen tam silme: devredilen kayıtlar (açık hedef öğretmen). */
  reassign?: PurgeReassign;
  options?: WipeOptions;
  /** Önizleme için 7 ürün grubu (türetilmiş; parmak izine planın kendisi girer). */
  groups: PurgeGroup[];
  /** Öğretmen tam silmede devir hedefi seçimi için. */
  targetCandidates?: { id: string; name: string }[];
  fingerprint: string;
};

export type PurgeGroupAction = "delete" | "detach" | "recalc" | "keep" | "exception" | "reassign";
export type PurgeGroupItem = { label: string; count: number; action: PurgeGroupAction; note?: string };
export type PurgeGroup = { key: string; title: string; items: PurgeGroupItem[] };

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

type PlanCore = Omit<PurgePlan, "fingerprint" | "groups" | "payoutChanges" | "targetCandidates"> & { payoutChanges?: PurgePayoutChange[] };

function fingerprintOf(plan: PlanCore): string {
  const ser = (bs: PurgeBucket[]) => bs.map((b) => [b.key, b.ids]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const payload = JSON.stringify({
    k: plan.kind,
    m: plan.mode,
    id: plan.personId,
    o: plan.outcome,
    e: plan.eligible,
    b: plan.blockers.map((x) => x.reason),
    r: ser(plan.remove),
    d: ser(plan.detach),
    keep: ser(plan.keep),
    a: plan.accounts.map((a) => [a.userId, a.action, a.portalAccessIds]),
    // Onaylanan kapsam: seçenekler, devir ve hakediş etkisi (sürüm dahil) — biri değişirse silme yazmaz.
    ...(plan.options ? { opt: [plan.options.lessonAction ?? null, plan.options.targetTeacherId ?? null] } : {}),
    ...(plan.reassign ? { ra: plan.reassign } : {}),
    ...(plan.payoutChanges?.length ? { pc: plan.payoutChanges.map((c) => [c.payoutId, c.action, c.lessonIds, c.after, c.version]) } : {}),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function finish(p: PlanCore & { targetCandidates?: PurgePlan["targetCandidates"] }): PurgePlan {
  const full = { ...p, payoutChanges: p.payoutChanges ?? [] };
  return { ...full, groups: planGroups(full), fingerprint: fingerprintOf(full) };
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

/**
 * Hakediş hesabıyla AYNI dahil etme kuralı: kurum saat dilimindeki gün anahtarı (`toDayKey`) dönem içinde mi.
 * Dondurulmuş satırı olan hakedişte o satırlardaki dersler de ayrıca sayılır (ikisinin birleşimi — güvenli taraf).
 */
function payoutCoversLesson(p: PurgePayoutRow, l: PurgeLessonRow): boolean {
  if (p.teacherId !== l.teacherId) return false;
  if (p.lessonIds?.includes(l.id)) return true;
  const day = toDayKey(l.startAt);
  return toDayKey(p.periodStart) <= day && day <= toDayKey(p.periodEnd);
}

const trDay = (iso: string) => toDayKey(iso).split("-").reverse().join(".");

/** Ders kovası notu: tarih aralığı + gelecek tarihli adet. */
function lessonScope(lessons: PurgeLessonRow[], nowIso: string): string | undefined {
  if (!lessons.length) return undefined;
  const days = lessons.map((l) => l.startAt).sort();
  const upcoming = lessons.filter((l) => ACTIVE_LESSON.has(l.status) && l.startAt > nowIso).length;
  return `${trDay(days[0]!)}–${trDay(days[days.length - 1]!)}${upcoming ? `, ${upcoming} tanesi gelecek tarihli` : ""}`;
}

/** Silinen derslerin programa/hakedişe/grup dersine somut etkileri (iki modda aynı metin). */
function studentLessonEffects(s: StudentPurgeSnapshot, keepLessons: Set<string>): { effects: string[]; upcoming: number } {
  const upcoming = s.lessons.filter((l) => !keepLessons.has(l.id) && ACTIVE_LESSON.has(l.status) && l.startAt > s.nowIso);
  const group = s.lessons.filter((l) => !keepLessons.has(l.id) && l.clubSessionId);
  const effects: string[] = [];
  if (upcoming.length) effects.push(`${upcoming.length} gelecek ders silinir; öğretmen ve oda programında o saatler boşalır. Başka öğretmen atanmaz.`);
  if (group.length) {
    effects.push(`${group.length} grup dersi kaydında yalnız bu öğrencinin satırı silinir; grup dersi, öğretmeni ve diğer üyeler etkilenmez.`);
    const solo = new Set(group.filter((l) => (s.groupSessionOthers?.[l.clubSessionId!] ?? 1) === 0).map((l) => l.clubSessionId!));
    if (solo.size) effects.push(`${solo.size} grup oturumunun tek üyesi bu öğrenci; o oturumlar programdan kalkar.`);
  }
  const realizedByTeacher = new Map<string, number>();
  for (const l of s.lessons) {
    if (keepLessons.has(l.id) || ACTIVE_LESSON.has(l.status) || l.status === "cancelled") continue;
    realizedByTeacher.set(l.teacherId, (realizedByTeacher.get(l.teacherId) ?? 0) + 1);
  }
  for (const [tid, n] of realizedByTeacher) {
    effects.push(`${s.teacherNames[tid] ?? "Öğretmen"}: henüz hakedişi oluşturulmamış ${n} geçmiş ders silinir ve sonraki hakediş hesabında sayılmaz.`);
  }
  return { effects, upcoming: upcoming.length };
}

/** Silinen ödeme satırına `Task.paymentId` ile bağlı görevler — görev silinmez, yalnız ödeme bağı kalkar. */
function paymentTaskIds(s: StudentPurgeSnapshot, removedPayments: Set<string>): string[] {
  return (s.paymentTasks ?? []).filter((t) => removedPayments.has(t.paymentId)).map((t) => t.id);
}

export function planStudentPurge(s: StudentPurgeSnapshot, mode: PurgeMode = "standard"): PurgePlan {
  if (mode === "wipe") return planStudentWipe(s);
  const blockers = precondition("student", s.person);
  const lessonById = new Map(s.lessons.map((l) => [l.id, l]));
  const activePayouts = s.payouts.filter((p) => p.status !== "cancelled");

  // 1) Kesin koruma tetikleyicileri.
  const keepPayments = new Set(s.payments.filter((p) => collected(p) > 0).map((p) => p.id));
  const keepContracts = new Set(s.contracts.filter((c) => c.signedAt || c.status === "signed" || c.status === "recorded").map((c) => c.id));
  const keepLessons = new Set(s.lessons.filter((l) => activePayouts.some((p) => payoutCoversLesson(p, l))).map((l) => l.id));
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

  const { effects, upcoming } = studentLessonEffects(s, keepLessons);
  if (keepLessons.size) effects.push(`${keepLessons.size} ders kesinleşmiş hakedişe veya korunan ödemeye bağlı olduğu için korunur; öğretmen hakedişi değişmez.`);
  if (outcome === "anonymize") {
    effects.push(
      `Öğrenci satırı silinmez, anonimleştirilir: ad "${anonymizedPersonName("student", s.person.displayId)}" olur; telefon, e-posta, veli, adres, TC, doğum bilgisi ve notlar silinir. Kayıt Silinenler'den de kalkar ve geri alınamaz.`
    );
  }
  if (keepContracts.size) effects.push("İmzalı sözleşme belgesi yasal saklama için olduğu gibi korunur (belgedeki imzacı bilgileri dahil).");

  return finish({
    kind: "student",
    mode: "standard",
    personId: s.person.id,
    personName: s.person.name,
    displayId: s.person.displayId,
    outcome,
    eligible: blockers.length === 0,
    blockers,
    remove: compact([
      bucket("lessons", removeLessons, upcoming ? `${upcoming} tanesi gelecek tarihli` : undefined),
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
    detach: compact([
      ...(Object.entries(s.detach) as [PurgeDetachKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
      bucket("paymentTasks", paymentTaskIds(s, removedPaymentSet)),
    ]),
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

/**
 * "Yanlış oluşturuldu — her şeyi sil" (öğrenci). Kişinin TÜM kayıtları silinir — tahsil edilmiş ödeme, imzalı
 * sözleşme ve belgesi dahil; kişi satırı silinir. Öğretmen hakedişleri AYNI işlemde ele alınır (`studentPayoutChanges`):
 * bekleyen kayıttan yalnız bu öğrencinin satırları çıkar ve toplam yeniden hesaplanır; ödenmiş kaydın tutarı
 * değişmez, satırlardaki öğrenci kimliği silinir. Tek somut istisna: sağlayıcıda tahsil edilmiş online ödeme (gerçek
 * para — DB'den silmek dış işlemi yok etmez; iade sağlayıcıdan yapılır).
 */
function planStudentWipe(s: StudentPurgeSnapshot): PurgePlan {
  const blockers = precondition("student", s.person);
  const payoutChanges = studentPayoutChanges(s);
  const online = s.checkouts.filter((c) => c.status === "succeeded" || c.status === "paid");
  if (online.length) {
    // Somut istisna: yalnız sağlayıcıda gerçekleşmiş online tahsilat. Manuel/demo tahsilat bu kurala girmez.
    const onlinePayments = new Set(online.map((c) => c.paymentId));
    const amount = s.payments.filter((p) => onlinePayments.has(p.id)).reduce((n, p) => n + collected(p), 0);
    blockers.push({
      reason: `Somut istisna — bu öğrenci adına ${online.length} online ödeme (${formatMoney(amount)}) ödeme sağlayıcısında tahsil edilmiş. Veritabanından silmek sağlayıcıdaki gerçek işlemi geri almaz.`,
      fix: "Gerekli işlem: ödemeyi sağlayıcı panelinden iade edin; ardından standart kalıcı silmeyi kullanın (online tahsilat izi anonim olarak korunur, diğer her şey silinir). Elle girilen tahsilatlar bu istisnaya girmez.",
    });
  }
  const pendingCheckouts = s.checkouts.filter((c) => c.status === "pending" || c.status === "processing").length;
  if (pendingCheckouts > 0) {
    blockers.push({
      reason: `${pendingCheckouts} online ödeme işlemi hâlâ sürüyor.`,
      fix: "Ödeme sonuçlanana kadar bekleyin (birkaç dakika) ve önizlemeyi yenileyin.",
    });
  }

  const paid = s.payments.filter((p) => collected(p) > 0);
  const open = s.payments.filter((p) => p.status !== "paid" && p.status !== "voided" && p.amount - p.paidAmount > 0);
  const signed = s.contracts.filter((c) => c.signedAt || c.status === "signed" || c.status === "recorded");
  const financial: PurgeFinancialSummary = {
    collectedCount: paid.length,
    collectedTotal: paid.reduce((n, p) => n + collected(p), 0),
    debtCount: open.length,
    debtTotal: open.reduce((n, p) => n + Math.max(0, p.amount - p.paidAmount), 0),
    contractCount: s.contracts.length,
    signedContractCount: signed.length,
    payoutCount: 0,
    payoutTotal: 0,
    paidPayoutCount: 0,
  };
  const { effects } = studentLessonEffects(s, new Set());
  effects.unshift(
    `Finansal kayıtlar da silinecek: ${financial.collectedCount} tahsilatlı satır (tahsil edilen ${formatMoney(financial.collectedTotal)}), ${financial.debtCount} ödenmemiş borç satırı (kalan ${formatMoney(financial.debtTotal)}), ${financial.contractCount} sözleşme (${financial.signedContractCount} imzalı) ve belgeleri. Bu tutarlar tahsilat/finans raporlarından ve makbuzlardan kalkar; geri alınamaz.`
  );
  effects.push("Öğrenci satırı da silinir (anonimleştirilmez); kayıt hiçbir listede görünmez.");
  const all = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

  return finish({
    kind: "student",
    mode: "wipe",
    financial,
    personId: s.person.id,
    personName: s.person.name,
    displayId: s.person.displayId,
    outcome: "delete",
    eligible: blockers.length === 0,
    blockers,
    remove: compact([
      bucket("lessons", all(s.lessons), lessonScope(s.lessons, s.nowIso)),
      bucket("attendances", all(s.attendances)),
      bucket("makeups", all(s.makeups)),
      bucket("series", all(s.series)),
      bucket("payments", all(s.payments), `Tahsil edilen ${formatMoney(financial.collectedTotal)} · kalan borç ${formatMoney(financial.debtTotal)}`),
      bucket("contracts", all(s.contracts), signed.length ? `${signed.length} tanesi imzalı` : undefined),
      bucket("documents", all(s.documents)),
      bucket("checkouts", all(s.checkouts)),
      bucket("followUps", all(s.followUps)),
      bucket("clubMemberships", all(s.clubMemberships)),
      ...(Object.entries(s.owned) as [PurgeTableKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
    ]),
    detach: compact([
      ...(Object.entries(s.detach) as [PurgeDetachKey, string[]][]).map(([k, ids]) => bucket(k, ids)),
      bucket("paymentTasks", paymentTaskIds(s, new Set(all(s.payments)))),
    ]),
    keep: [],
    accounts: accountActions(s.accounts),
    effects: [...effects, ...payoutChangeEffects(payoutChanges)],
    anonymizedName: anonymizedPersonName("student", s.person.displayId),
    payoutChanges,
  });
}

/** Öğrencinin derslerini içeren öğretmen hakedişleri → ne olacağı (öğretmen/dönem/tutar). */
function studentPayoutChanges(s: StudentPurgeSnapshot): PurgePayoutChange[] {
  const mine = new Set(s.lessons.map((l) => l.id));
  const out: PurgePayoutChange[] = [];
  for (const p of [...s.payouts].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = {
      payoutId: p.id,
      teacherId: p.teacherId,
      teacherName: s.teacherNames[p.teacherId] ?? "Öğretmen",
      period: `${trDay(p.periodStart)}–${trDay(p.periodEnd)}`,
      status: p.status,
      before: p.totalAmount ?? 0,
      version: p.version ?? 0,
    };
    if (!p.lineSnapshot) {
      const covered = s.lessons.filter((l) => payoutCoversLesson(p, l)).map((l) => l.id).sort();
      if (covered.length && p.status !== "cancelled") out.push({ ...base, action: "legacy", lessonIds: covered, after: base.before });
      continue;
    }
    const lessonIds = p.lineSnapshot.filter((l) => mine.has(l.lessonId)).map((l) => l.lessonId).sort();
    if (!lessonIds.length) continue;
    if (p.status === "pending") {
      const next = purgePayoutRewrite(p, { action: "recalc", lessonIds }, "");
      out.push({ ...base, action: "recalc", lessonIds, after: next.totalAmount ?? base.before });
    } else {
      out.push({ ...base, action: "scrub", lessonIds, after: base.before });
    }
  }
  return out;
}

const PAYOUT_STATUS_TR: Record<string, string> = { pending: "ödenmemiş", partial: "kısmen ödenmiş", paid: "ödenmiş", cancelled: "iptal edilmiş" };

function payoutChangeEffects(changes: PurgePayoutChange[]): string[] {
  return changes.map((c) => {
    const head = `${c.teacherName} — ${c.period} hakedişi (${PAYOUT_STATUS_TR[c.status] ?? c.status}), bu öğrencinin ${c.lessonIds.length} dersi`;
    if (c.action === "recalc") return `${head}: satırlar çıkarılır, toplam ${formatMoney(c.before)} → ${formatMoney(c.after)} olarak yeniden hesaplanır. Diğer satırlar değişmez.`;
    if (c.action === "scrub") return `${head}: ödeme yapılmış olduğu için tutar (${formatMoney(c.before)}) DEĞİŞMEZ; satırlardaki öğrenci adı silinir. Fazla ödeme varsa Hakedişler ekranında düzeltme kaydıyla kapatılır.`;
    return `${head}: satır dökümü olmayan eski kayıt — tutar (${formatMoney(c.before)}) değişmez, dökümde bu dersler artık görünmez.`;
  });
}

/**
 * Hakediş satırlarını tam silme için yeniden yazar (önizleme ve iki yürütücü AYNI fonksiyonu kullanır).
 * "recalc": satırlar çıkar, düzeltmeler süzülür, toplam `recomputePayoutData` ile aynı formülle kalan satırlardan.
 * "scrub": yalnız kimlik alanları — tutar alanları döndürülmez.
 */
export function purgePayoutRewrite(
  p: { lineSnapshot?: TeacherPayoutSnapshotLine[] | null; lineOverrides?: Record<string, TeacherPayoutLineOverride> | null },
  change: { action: "recalc" | "scrub"; lessonIds: string[] },
  anonymizedName: string
): {
  lineSnapshot: TeacherPayoutSnapshotLine[];
  lineOverrides?: Record<string, TeacherPayoutLineOverride> | null;
  totalAmount?: number;
  totalMinutes?: number;
  originalTotalAmount?: number | null;
  originalTotalMinutes?: number | null;
} {
  const drop = new Set(change.lessonIds);
  const lines = p.lineSnapshot ?? [];
  if (change.action === "scrub") {
    return { lineSnapshot: lines.map((l) => (drop.has(l.lessonId) ? { ...l, studentId: "", studentName: anonymizedName } : l)) };
  }
  const kept = lines.filter((l) => !drop.has(l.lessonId));
  const overrides = Object.fromEntries(Object.entries(p.lineOverrides ?? {}).filter(([id]) => !drop.has(id)));
  const has = Object.keys(overrides).length > 0;
  const asResult = { lines: kept } as unknown as TeacherEarningsResult;
  const base = applyPayoutLineOverrides(asResult, undefined);
  const revised = applyPayoutLineOverrides(asResult, has ? overrides : undefined);
  return {
    lineSnapshot: kept,
    lineOverrides: has ? overrides : null,
    totalAmount: revised.totalAmount,
    totalMinutes: revised.totalMinutes,
    originalTotalAmount: has ? base.totalAmount : null,
    originalTotalMinutes: has ? base.totalMinutes : null,
  };
}

/**
 * "Yanlış oluşturuldu — her şeyi sil" (öğretmen). Silinen: öğretmenin KENDİ kayıtları — tüm hakedişleri (ödenmiş
 * dahil), ücret kuralları, hariç tutmalar, evrak/fotoğraf/mesaj; öğretmen satırı. Ders/seri/telafi ve öğretmenin
 * yazdığı öğrenci kayıtları (değerlendirme, ödev, geri bildirim, deneme dersi) önizlemede seçilen işlemle:
 * - "delete": silinir (yoklamaları, bu derslere bağlı telafiler dahil); derse bağlı ödeme satırı SİLİNMEZ, yalnız
 *   ders bağı kalkar. Grup dersi satırı silinmez (diğer öğrencilerin programı) → devir gerekir.
 * - "reassign": açıkça seçilen öğretmene devredilir.
 * Öğrenci ataması (öğrenci.öğretmen zorunlu alan + branş kayıtları) her iki durumda seçilen öğretmene devredilir;
 * öğrenci silinmez, öğretmen sessizce değiştirilmez — hedef seçilmeden silme açılmaz.
 */
function planTeacherWipe(s: TeacherPurgeSnapshot, opts: WipeOptions = {}): PurgePlan {
  const blockers = precondition("teacher", s.person);
  const action = opts.lessonAction ?? "delete";
  const candidates = (s.teachers ?? []).filter((t) => t.id !== s.person.id && !t.deletedAt);
  const target = opts.targetTeacherId ? candidates.find((t) => t.id === opts.targetTeacherId) : undefined;
  if (opts.targetTeacherId && !target) {
    blockers.push({ reason: "Seçilen devir öğretmeni bulunamadı veya listeden kaldırılmış.", fix: "Aşağıdaki listeden başka bir öğretmen seçin." });
  }
  const links = s.lessonLinks ?? { attendances: [], makeups: [], payments: [], seriesLessons: [] };
  const historyIds = Object.values(s.history).reduce((n, ids) => n + (ids?.length ?? 0), 0);
  const teaching = s.lessons.length + s.series.length + s.makeups.length + historyIds;
  const groupLessons = s.lessons.filter((l) => l.clubSessionId || l.groupSessionId);
  pushActiveGroupLessonBlocker(blockers, s);
  if (teaching && action === "reassign" && !target) {
    blockers.push({ reason: `${s.lessons.length} ders, ${s.series.length} seri, ${s.makeups.length} telafi ve ${historyIds} öğrenci kaydı devredilecek.`, fix: "Aşağıdan devredilecek öğretmeni seçin." });
  }
  if (action === "delete" && groupLessons.length) {
    blockers.push({
      reason: `${groupLessons.length} grup dersi satırı başka öğrencilerle ortak oturumda; silmek diğer öğrencilerin programını bozar.`,
      fix: "\"Dersleri başka öğretmene devret\"i seçip hedef öğretmeni belirleyin.",
    });
  }
  if (s.students.length && !target) {
    blockers.push({
      reason: `${s.students.length} öğrencinin kaydında öğretmen olarak bu kişi var (pasif/silinmiş dahil); öğrenciler silinmez ve öğretmensiz kalamaz.`,
      fix: "Aşağıdan öğrencilerin devredileceği öğretmeni seçin.",
    });
  }
  const paidPayouts = s.payouts.filter((p) => p.status === "paid");
  const financial: PurgeFinancialSummary = {
    collectedCount: 0,
    collectedTotal: 0,
    debtCount: 0,
    debtTotal: 0,
    contractCount: 0,
    signedContractCount: 0,
    payoutCount: s.payouts.length,
    payoutTotal: s.payouts.filter((p) => p.status !== "cancelled").reduce((n, p) => n + (p.totalAmount ?? 0), 0),
    paidPayoutCount: paidPayouts.length,
  };
  const del = action === "delete";
  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  const reassign: PurgeReassign | undefined = target
    ? {
        targetTeacherId: target.id,
        targetTeacherName: target.name,
        lessons: del ? [] : ids(s.lessons).sort(),
        series: del ? [] : ids(s.series).sort(),
        makeups: del ? [] : ids(s.makeups).sort(),
        students: ids(s.students).sort(),
        // Devirde hakediş hariç tutmaları da hedefe geçer ("hariç" anlamı korunur); silmede öğretmenle silinir.
        history: del
          ? {}
          : Object.fromEntries(
              Object.entries({ ...s.history, payoutExclusions: s.payoutExclusions }).filter(([, v]) => v?.length).map(([k, v]) => [k, [...v!].sort()])
            ),
      }
    : undefined;
  const effects = [
    `Finansal kayıtlar da silinecek: ${financial.payoutCount} hakediş kaydı (iptal olmayanların toplamı ${formatMoney(financial.payoutTotal)}, ${financial.paidPayoutCount} tanesi ödenmiş), ${s.feeRules.length} ücret kuralı ve ${s.payoutExclusions.length} hariç tutma kaydı. Ödeme geçmişi ve muhasebe izi de kalkar; geri alınamaz.`,
    "Öğretmen satırı da silinir (anonimleştirilmez).",
  ];
  const upcoming = s.lessons.filter((l) => ACTIVE_LESSON.has(l.status) && l.startAt > s.nowIso).length;
  if (teaching && del) {
    effects.push(
      `${s.lessons.length} ders (${upcoming} gelecek tarihli), yoklamaları, ${s.makeups.length + links.makeups.length} telafi kaydı ve ${s.series.length} seri silinir; öğrenciler silinmez. Başka öğretmen atanmaz, saatler programda boşalır.`
    );
    if (links.payments.length) effects.push(`${links.payments.length} ödeme satırı derse bağlıydı: satır ve tutarı öğrencide KALIR, yalnız ders bağı kaldırılır.`);
    if (historyIds) effects.push(`Bu öğretmenin yazdığı ${historyIds} öğrenci kaydı (değerlendirme, ödev, geri bildirim, deneme dersi) silinir.`);
  }
  if (reassign && !del && teaching) {
    effects.push(
      `${s.lessons.length} ders (${upcoming} gelecek tarihli), ${s.series.length} seri, ${s.makeups.length} telafi ve ${historyIds} öğrenci kaydı ${reassign.targetTeacherName} öğretmenine devredilir. Gelecek derslerde ${reassign.targetTeacherName} öğretmeninin programıyla çakışma olabilir — Ders Programı'nda kontrol edin.`,
      `${reassign.targetTeacherName} öğretmeninin kayıtlı hakedişleri kendiliğinden DEĞİŞMEZ; devredilen geçmiş dersler Hakedişler ekranında fark olarak görünür.`
    );
  }
  if (reassign && s.students.length) effects.push(`${s.students.length} öğrencinin öğretmeni (ana kayıt ve branş kayıtları) ${reassign.targetTeacherName} olarak değişir.`);
  if (s.detach.clubs?.length) {
    effects.push(
      reassign && !del
        ? `${s.detach.clubs.length} grup dersinin öğretmen listesinde bu kişinin yerine ${reassign.targetTeacherName} yazılır.`
        : `${s.detach.clubs.length} grup dersinin öğretmen listesinden çıkarılır; grup dersi ve üyeleri silinmez, yerine kimse atanmaz.`
    );
  }
  const history = (Object.entries(s.history) as [PurgeTableKey, string[]][]).map(([k, v]) => (del ? bucket(k, v) : null));

  return finish({
    kind: "teacher",
    mode: "wipe",
    financial,
    personId: s.person.id,
    personName: s.person.name,
    displayId: s.person.displayId,
    outcome: "delete",
    eligible: blockers.length === 0,
    blockers,
    remove: compact([
      del ? bucket("lessons", ids(s.lessons), lessonScope(s.lessons, s.nowIso)) : null,
      del ? bucket("attendances", links.attendances) : null,
      del ? bucket("makeups", [...ids(s.makeups), ...links.makeups]) : null,
      del ? bucket("series", ids(s.series)) : null,
      ...history,
      ...(Object.entries(s.owned) as [PurgeTableKey, string[]][]).map(([k, v]) => bucket(k, v)),
      bucket("feeRules", s.feeRules),
      reassign && !del ? null : bucket("payoutExclusions", s.payoutExclusions),
      bucket("payouts", s.payouts.map((p) => p.id), paidPayouts.length ? `${paidPayouts.length} tanesi ödenmiş` : undefined),
    ]),
    detach: compact([
      ...(Object.entries(s.detach) as [PurgeDetachKey, string[]][]).map(([k, v]) => bucket(k, v)),
      del ? bucket("lessonPayments", links.payments) : null,
      del ? bucket("seriesLessons", links.seriesLessons) : null,
      del ? bucket("makeupPlans", links.makeupPlans ?? []) : null,
    ]),
    keep: [],
    accounts: accountActions(s.accounts),
    effects,
    anonymizedName: anonymizedPersonName("teacher", s.person.displayId),
    options: { lessonAction: action, ...(opts.targetTeacherId ? { targetTeacherId: opts.targetTeacherId } : {}) },
    reassign,
    targetCandidates: candidates.map((t) => ({ id: t.id, name: t.name })).sort((x, y) => x.name.localeCompare(y.name, "tr")),
  });
}

/** Aktif grup dersinin öğretmeni silinemez: tanım öğretmensiz kalır, sistem öğretmeni kendiliğinden değiştirmez. */
function pushActiveGroupLessonBlocker(blockers: { reason: string; fix: string }[], s: TeacherPurgeSnapshot) {
  const active = (s.groupLessons ?? []).filter((g) => g.status === "active");
  if (!active.length) return;
  blockers.push({
    reason: `${active.length} aktif grup dersinin öğretmeni (${active.slice(0, 3).map((g) => g.name).join(", ")}${active.length > 3 ? "…" : ""}).`,
    fix: "Grup Dersleri ekranında bu grupların öğretmenini değiştirin veya grubu sonlandırın.",
  });
}

export function planTeacherPurge(s: TeacherPurgeSnapshot, mode: PurgeMode = "standard", opts: WipeOptions = {}): PurgePlan {
  if (mode === "wipe") return planTeacherWipe(s, opts);
  const blockers = precondition("teacher", s.person);
  // Listeden kaldırmadaki kapılar kalıcı silmede de geçerli (kaldırıldıktan sonra veri değişmiş olabilir).
  pushActiveGroupLessonBlocker(blockers, s);
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
    mode: "standard",
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

export function planPersonPurge(s: PurgeSnapshot, mode: PurgeMode = "standard", opts: WipeOptions = {}): PurgePlan {
  return s.kind === "student" ? planStudentPurge(s, mode) : planTeacherPurge(s, mode, opts);
}

/** Önizleme grupları (ürün dili). Planın bucket'larından türetilir — yeni anahtar eklenirse "Diğer"e düşer. */
const GROUPS: { key: string; title: string; keys: (PurgeTableKey | PurgeDetachKey)[] }[] = [
  { key: "schedule", title: "Ders programı / seri dersler", keys: ["lessons", "series", "seriesLessons", "clubMemberships", "clubs"] },
  { key: "attendance", title: "Yoklama ve telafi", keys: ["attendances", "makeups", "riskLogs"] },
  { key: "finance", title: "Borç/tahakkuk / tahsilat", keys: ["payments", "checkouts", "followUps", "paymentTasks", "lessonPayments"] },
  { key: "payout", title: "Hakediş satırları ve etkilenen dönemler", keys: ["payouts", "feeRules", "payoutExclusions"] },
  { key: "documents", title: "Sözleşme, evrak ve dosyalar", keys: ["contracts", "documents", "profilePhotos", "teachingMaterials", "socialMediaConsents", "kvkkConsents"] },
  { key: "access", title: "Portal erişimi, hesap ve oturumlar", keys: ["portalAccess", "feedbackInvites"] },
];

export function planGroups(plan: Pick<PurgePlan, "remove" | "detach" | "keep" | "accounts" | "payoutChanges" | "reassign" | "blockers">): PurgeGroup[] {
  const groupOf = (k: string) => GROUPS.find((g) => (g.keys as string[]).includes(k))?.key ?? "other";
  const out = new Map<string, PurgeGroupItem[]>([...GROUPS.map((g) => [g.key, []] as [string, PurgeGroupItem[]]), ["other", []]]);
  const push = (k: string, item: PurgeGroupItem) => out.get(groupOf(k))!.push(item);
  for (const b of plan.remove) push(b.key, { label: b.label, count: b.ids.length, action: "delete", note: b.note });
  for (const b of plan.detach) push(b.key, { label: b.label, count: b.ids.length, action: "detach", note: b.note });
  for (const b of plan.keep) push(b.key, { label: b.label, count: b.ids.length, action: "keep", note: b.note });
  for (const c of plan.payoutChanges) {
    out.get("payout")!.push({
      label: `${c.teacherName} — ${c.period}`,
      count: c.lessonIds.length,
      action: c.action === "recalc" ? "recalc" : "exception",
      note:
        c.action === "recalc"
          ? `Bekleyen hakediş: ${formatMoney(c.before)} → ${formatMoney(c.after)}`
          : `${PAYOUT_STATUS_TR[c.status] ?? c.status}: tutar ${formatMoney(c.before)} değişmez${c.action === "scrub" ? ", satırdaki öğrenci adı silinir" : " (eski kayıt)"}`,
    });
  }
  if (plan.reassign) {
    const r = plan.reassign;
    const to = `→ ${r.targetTeacherName}`;
    if (r.lessons.length) out.get("schedule")!.push({ label: "Ders kaydı", count: r.lessons.length, action: "reassign", note: to });
    if (r.series.length) out.get("schedule")!.push({ label: "Ders serisi", count: r.series.length, action: "reassign", note: to });
    if (r.makeups.length) out.get("attendance")!.push({ label: "Telafi kaydı", count: r.makeups.length, action: "reassign", note: to });
    if (r.students.length) out.get("other")!.push({ label: "Öğrenci ataması (öğrenciler silinmez)", count: r.students.length, action: "reassign", note: to });
    const h = Object.values(r.history).reduce((n, v) => n + (v?.length ?? 0), 0);
    if (h) out.get("other")!.push({ label: "Değerlendirme/ödev/geri bildirim/deneme dersi", count: h, action: "reassign", note: to });
  }
  for (const a of plan.accounts) {
    out.get("access")!.push({
      label: `Giriş hesabı ${a.maskedEmail}`,
      count: 1,
      action: a.action === "close" ? "delete" : "keep",
      note: a.action === "close" ? "Hesap kapatılır, oturumlar ve bekleyen linkler geçersiz olur" : "Başka öğrenci/rol için de kullanılıyor — yalnız bu kişiye erişim kalkar",
    });
  }
  for (const b of plan.blockers.filter((x) => x.reason.startsWith("Somut istisna"))) {
    out.get("finance")!.push({ label: b.reason, count: 0, action: "exception", note: b.fix });
  }
  const titles: Record<string, string> = Object.fromEntries([...GROUPS.map((g) => [g.key, g.title]), ["other", "CRM, görev, not ve diğer ilişkiler"]]);
  return [...out].filter(([, items]) => items.length).map(([key, items]) => ({ key, title: titles[key]!, items }));
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

/**
 * Öğretmen tam silme ("Dersleri sil"): kaynak dersi BAŞKA öğretmende olan, yalnız planlanan telafi dersi silinen
 * öğretmende olan talep SİLİNMEZ — Telafi Merkezi "Planı sil" ile aynı geçiş: plan kalkar, hak ve kaynak ders
 * korunur, açık talep yeniden "bekliyor"; kapanmış talepte yalnız plan bağı temizlenir. Silmek kaynak dersi
 * "Telafi" işaretli ama talepsiz bırakırdı (2026-10-15 telafi hatasının aynısı).
 */
export function unplanMakeupForPurge<T extends { status: string; changeLog?: unknown }>(row: T, lessonId: string, nowIso: string) {
  const closed = row.status === "cancelled" || row.status === "expired";
  const entry = { action: "plan_deleted", at: nowIso, by: "kalici-silme", from: lessonId, note: "Planlanan telafi dersinin öğretmeni kalıcı silindi." };
  return {
    confirmedLessonId: null,
    ...(closed ? {} : { status: "pending", slaDeadline: null, slaEscalationLevel: 0 }),
    changeLog: [...(Array.isArray(row.changeLog) ? row.changeLog : []), entry],
  };
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
