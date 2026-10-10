/**
 * Sözleşme / öğrenci dökümü ödeme planı — ortak presentation/view-model.
 *
 * Sözleşmedeki ödeme planı tablosu (MADDE 4) ile yönetici öğrenci dökümündeki
 * ödeme planı tablosu AYNI veriyi FARKLI mantıkla hesaplamasın diye tek
 * kaynaktır: iki tablo da ödeme türü etiketini buradan çözer.
 *
 * Kural (P0 revizyonu):
 * - Yalnız GERÇEK tahsilatı olan satırın (status paid/partial) ödeme türü
 *   gösterilir — kaydın `method` alanından, `paymentMethodLabelTr` etiketiyle.
 * - Henüz tahsil edilmemiş / bekleyen (pending/overdue) satırda, bekleyen
 *   kaydın taşıdığı PLANLANAN yöntem bile olsa `—` gösterilir: o satırın
 *   ödeme türü henüz belirlenmemiştir, uydurulmaz.
 */
import { formatDateTime, paymentMethodLabelTr } from "./utils";
import type { ContractInstallmentSnapshot, Payment, Teacher } from "./types";

/** Ödeme türü henüz belirlenmemiş/ödenmemiş plan satırı — ürün diliyle tutarlı boş durum. */
export const PLAN_PAYMENT_METHOD_UNDETERMINED = "—";

/** Tahsilatı alan kullanıcı artık aktif değil/geçersiz — audit izi korunur, ad gizlenmez. */
export const COLLECTOR_INACTIVE_LABEL = "Pasif/silinmiş kullanıcı";

/** Bu satırda fiilen tahsilat var mı (ödendi/kısmi ödendi). */
export function isCollectedPayment(payment: Pick<Payment, "status" | "paidAmount" | "paidAt">): boolean {
  if (payment.status === "paid" || payment.status === "partial") return true;
  return (payment.paidAmount ?? 0) > 0 && !!payment.paidAt;
}

/**
 * Bir plan satırının "Ödeme Türü" hücresi. Tahsilat yoksa `—` (asla planlanan
 * yöntem uydurulmaz).
 */
export function resolvePlanRowPaymentMethodLabel(
  payment: Pick<Payment, "status" | "paidAmount" | "paidAt" | "method"> | undefined | null
): string {
  if (!payment || !isCollectedPayment(payment)) return PLAN_PAYMENT_METHOD_UNDETERMINED;
  return paymentMethodLabelTr(payment.method);
}

export type ContractPlanViewRow = {
  sequence: number;
  dueDate: string;
  amount: number;
  kind?: ContractInstallmentSnapshot["kind"];
  periodLabel?: string;
  paymentMethodLabel: string;
};

/**
 * Sözleşme taksit snapshot'ları + sözleşmeye bağlı canlı Payment kayıtlarından
 * (contractId + installmentSequence eşleşmesi) görünüm satırları üretir.
 * Aynı sözleşme/sıra için birden çok kayıt varsa tahsil edilmiş olan
 * önceliklidir (bekleyen satır, ödenmiş satırı gizlemez).
 */
export function buildContractPlanViewRows(input: {
  installments: ContractInstallmentSnapshot[];
  payments: Payment[];
  contractId?: string;
}): ContractPlanViewRow[] {
  const bySequence = new Map<number, Payment>();
  for (const p of input.payments) {
    if (p.installmentSequence == null) continue;
    if (input.contractId && p.contractId && p.contractId !== input.contractId) continue;
    const current = bySequence.get(p.installmentSequence);
    if (!current) {
      bySequence.set(p.installmentSequence, p);
      continue;
    }
    const currentCollected = isCollectedPayment(current);
    const nextCollected = isCollectedPayment(p);
    if (nextCollected && !currentCollected) {
      bySequence.set(p.installmentSequence, p);
    } else if (nextCollected === currentCollected && (p.paidAt ?? "") > (current.paidAt ?? "")) {
      bySequence.set(p.installmentSequence, p);
    }
  }
  return [...input.installments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((inst) => ({
      sequence: inst.sequence,
      dueDate: inst.dueDate,
      amount: inst.amount,
      kind: inst.kind,
      periodLabel: inst.periodLabel,
      paymentMethodLabel: resolvePlanRowPaymentMethodLabel(bySequence.get(inst.sequence)),
    }));
}

/**
 * Dökümdeki AY satırı için "Ödeme Türü": o ayın planına bağlı kayıtlardan
 * tahsil edilmiş olanın (yoksa `—`). Ay planı `paymentIds` taşır (bkz.
 * attendance-calendar-plan.ts CalendarMonthPlan).
 */
export function resolveStatementMonthPaymentMethodLabel(input: {
  paymentIds: string[] | undefined;
  payments: Payment[];
}): string {
  const rows = (input.paymentIds ?? [])
    .map((id) => input.payments.find((p) => p.id === id))
    .filter((p): p is Payment => !!p && isCollectedPayment(p))
    .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
  const last = rows[rows.length - 1];
  return resolvePlanRowPaymentMethodLabel(last);
}

// ─── Tahsil eden görünen adı ────────────────────────────────────────────────
// Audit bütünlüğü: `Payment.receivedByUserId` (kalıcı kimlik) ASLA değişmez;
// yalnız GÖRÜNTÜLEME katmanında ad-soyad çözülür. E-posta normal durumda
// gösterilmez.

/** Öğretmen kaydından görünen ad çözümü: önce kullanıcı-teacher bağı, sonra e-posta eşleşmesi. */
export function findTeacherDisplayNameForUser(
  teachers: Pick<Teacher, "id" | "name" | "email">[],
  user: { teacherId?: string; email?: string } | null | undefined
): string | undefined {
  if (!user) return undefined;
  if (user.teacherId) {
    const byId = teachers.find((t) => t.id === user.teacherId);
    if (byId?.name?.trim()) return byId.name.trim();
  }
  const email = user.email?.trim().toLowerCase();
  if (email) {
    const byEmail = teachers.find((t) => t.email?.trim().toLowerCase() === email);
    if (byEmail?.name?.trim()) return byEmail.name.trim();
  }
  return undefined;
}

/**
 * E-posta yerel parçasından zarif görünen-ad tahmini ("ezgi.guclu" →
 * "Ezgi Guclu"). Yalnız AD BULUNAMADIĞINDA kullanılır — normal durumda
 * öğretmen kaydındaki gerçek ad gösterilir, e-posta ASLA aynen yazılmaz.
 * Türkçe başlıklandırma (I/ı/İ/i) için tr yerel ayarı kullanılır.
 */
export function humanizeEmailLocalPart(email: string | undefined | null): string | undefined {
  const local = (email ?? "").split("@")[0] ?? "";
  const parts = local
    .split(/[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9]+/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\d+$/.test(p));
  if (parts.length === 0) return undefined;
  return parts
    .map((p) => {
      const lower = p.toLocaleLowerCase("tr");
      return lower.slice(0, 1).toLocaleUpperCase("tr") + lower.slice(1);
    })
    .join(" ");
}

/**
 * Tahsil eden hücresinin görünen adı. `receivedByUserId` korunur (audit),
 * burada yalnız görüntü metni üretilir.
 * - Öğretmen adı bulunursa: ad soyad.
 * - Kullanıcı pasif/silinmişse: "Pasif/silinmiş kullanıcı" (iz kaybolmaz).
 * - Aktif ama adsızsa: e-posta tahminiyle zarif fallback (e-posta aynen yazılmaz).
 */
export function resolveCollectorDisplayName(input: {
  teacherName?: string | null;
  displayName?: string | null;
  email?: string | null;
  active: boolean;
}): string {
  const teacherName = input.teacherName?.trim();
  if (teacherName) return teacherName;
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  if (!input.active) return COLLECTOR_INACTIVE_LABEL;
  return humanizeEmailLocalPart(input.email) ?? "Kayıtlı kullanıcı";
}

/**
 * Birden çok tahsilatçının görünen adlarını tek seferde çözer (N+1 yerine
 * toplu). `receivedByUserId` kimlikleri aynen korunur — yalnız görüntü
 * metni üretilir, hiçbir kayda yazılmaz.
 */
export async function resolveCollectorDisplayNames(input: {
  userIds: string[];
  teachers: Pick<Teacher, "id" | "name" | "email">[];
}): Promise<Map<string, string>> {
  const { getUserById, getUserAccountStatus } = await import("./auth/users");
  const names = new Map<string, string>();
  for (const userId of input.userIds) {
    const [user, status] = await Promise.all([getUserById(userId), getUserAccountStatus(userId)]);
    if (!status && !user) {
      names.set(userId, COLLECTOR_INACTIVE_LABEL);
      continue;
    }
    const email = status?.email ?? user?.email;
    const teacherName = findTeacherDisplayNameForUser(input.teachers, {
      teacherId: user?.teacherId,
      email,
    });
    names.set(
      userId,
      resolveCollectorDisplayName({ teacherName, displayName: status?.displayName, email, active: status?.active ?? false })
    );
  }
  return names;
}

/**
 * İşlemi yapan / raporu alan kişilerin görünen adları (toplu).
 * Önce personel kaydı (Ezgi Güçlü), sonra kullanıcı adı / öğretmen / e-posta tahmini.
 * Ham kullanıcı kimliği asla basılmaz.
 */
export async function resolveActorLabels(input: {
  tenantId: string;
  userIds: (string | null | undefined)[];
  teachers: Pick<Teacher, "id" | "name" | "email">[];
}): Promise<Map<string, string>> {
  const ids = Array.from(new Set(input.userIds.filter((id): id is string => Boolean(id))));
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const { listStaff } = await import("./staff");
    const staff = await listStaff(input.tenantId);
    for (const s of staff) {
      if (s.portalUserId && ids.includes(s.portalUserId) && s.name.trim()) out.set(s.portalUserId, s.name.trim());
    }
  } catch {
    // personel listesi yoksa kullanıcı çözümlemesine düş.
  }
  const rest = ids.filter((id) => !out.has(id));
  const names = await resolveCollectorDisplayNames({ userIds: rest, teachers: input.teachers });
  for (const id of rest) out.set(id, names.get(id) ?? "Kayıtlı kullanıcı");
  return out;
}

/** Tek kişi için `resolveActorLabels`. */
export async function resolveActorLabel(input: {
  tenantId: string;
  userId: string;
  teachers: Pick<Teacher, "id" | "name" | "email">[];
}): Promise<string> {
  const names = await resolveActorLabels({ tenantId: input.tenantId, userIds: [input.userId], teachers: input.teachers });
  return names.get(input.userId) ?? "Kayıtlı kullanıcı";
}

/** Rapor baskısı künyesi — raporu alan kişinin adı ve alınma anı (tarih + saat). */
export async function resolvePrintStamp(input: {
  tenantId: string;
  userId: string;
  teachers: Pick<Teacher, "id" | "name" | "email">[];
  now?: Date;
}): Promise<{ viewer: string; printedAt: string }> {
  const viewer = await resolveActorLabel(input);
  return { viewer, printedAt: formatDateTime((input.now ?? new Date()).toISOString()) };
}
