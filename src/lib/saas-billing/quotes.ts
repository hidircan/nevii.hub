/**
 * Herkese açık "Teklif iste" kayıtları — pilot/satış hunisi.
 *
 * - Satın alma (/abonelik) ve denemeden (/deneme) FARKLI akıştır: anında
 *   erişim veya otomatik davet ÜRETMEZ; platform ekibi inceler, kurumla
 *   iletişime geçip NeviiAds teklifi → checkout daveti yolunu işletir.
 * - YALNIZ JSON/memory deposunda tutulur (`saas-billing.json` içinde
 *   `quotes` dizisi; eski dosyalarda yoksa boş sayılır — şema değişikliği
 *   ve migration YOK). DB modda fail-closed: kayıt reddedilir.
 * - Spam/abuse: IP başına rate-limit route'ta, e-posta başına tek bekleyen kayıt.
 */
import { z } from "zod";
import { isDbMode } from "../config";
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";

export type SaasQuoteStatus = "pending" | "contacted" | "closed";

export type SaasQuoteRequestRecord = {
  id: string;
  institutionName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  planKey: string | null;
  note: string | null;
  status: SaasQuoteStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

const quoteRequestSchema = z.object({
  institutionName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.email().max(160),
  ownerPhone: z.string().trim().max(20).nullable().optional(),
  planKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,31}$/)
    .max(40)
    .nullable()
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** IP başına basit süreç-içi rate-limit (trial ile aynı desen). */
const quoteAttempts = new Map<string, { count: number; resetAt: number }>();

export function consumeQuoteRateLimit(ip: string): boolean {
  const now = Date.now();
  const cur = quoteAttempts.get(ip);
  if (!cur || cur.resetAt <= now) {
    quoteAttempts.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (cur.count >= 5) return false;
  cur.count += 1;
  return true;
}

export function __resetQuoteRateLimitForTests(): void {
  quoteAttempts.clear();
}

export async function submitQuoteRequest(args: {
  input: unknown;
  nowIso?: string;
}): Promise<ServiceResult<SaasQuoteRequestRecord>> {
  if (isDbMode) {
    return fail("FORBIDDEN", "Teklif isteği bu ortamda kapalı (DB tablosu yok).");
  }
  const parsed = quoteRequestSchema.safeParse(args.input);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz başvuru.");
  }
  const v = parsed.data;
  const now = args.nowIso ?? new Date().toISOString();
  const { listSaasQuoteRequests, saveSaasQuoteRequest } = await import("./store");
  const recent = await listSaasQuoteRequests(200);
  const dup = recent.find(
    (r) => r.ownerEmail.toLowerCase() === v.ownerEmail.toLowerCase() && r.status === "pending"
  );
  if (dup) {
    return fail("VALIDATION_ERROR", "Bu e-posta ile zaten bekleyen bir istek bulunuyor.");
  }
  const record: SaasQuoteRequestRecord = {
    id: uid("saas_qt"),
    institutionName: v.institutionName,
    ownerName: v.ownerName,
    ownerEmail: v.ownerEmail.toLowerCase(),
    ownerPhone: v.ownerPhone?.trim() || null,
    planKey: v.planKey?.trim() || null,
    note: v.note?.trim() || null,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
  };
  await saveSaasQuoteRequest(record);
  const { notifyOwnerNewRequest } = await import("./request-notify");
  await notifyOwnerNewRequest({ kind: "teklif", id: record.id, institutionName: record.institutionName, createdAt: now });
  return ok(record);
}

export async function decideQuoteRequest(args: {
  id: string;
  approve: boolean;
  decidedBy: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasQuoteRequestRecord>> {
  if (isDbMode) {
    return fail("FORBIDDEN", "Teklif isteği bu ortamda kapalı (DB tablosu yok).");
  }
  const { getSaasQuoteRequest, saveSaasQuoteRequest } = await import("./store");
  const rec = await getSaasQuoteRequest(args.id);
  if (!rec) return fail("NOT_FOUND", "Teklif isteği bulunamadı.");
  if (rec.status !== "pending") return fail("VALIDATION_ERROR", "İstek zaten karara bağlanmış.");
  const now = args.nowIso ?? new Date().toISOString();
  const next: SaasQuoteRequestRecord = {
    ...rec,
    status: args.approve ? "contacted" : "closed",
    decidedBy: args.decidedBy,
    decidedAt: now,
  };
  await saveSaasQuoteRequest(next);
  return ok(next);
}
