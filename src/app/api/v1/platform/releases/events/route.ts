import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/http";
import { RELEASE_EVENT_SIGNATURE_HEADER, ingestReleaseEvent, releaseEventSchema, verifyReleaseEventSignature } from "@/lib/platform/releases";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/platform/releases/events — imzalı CI olayı (ileride GitHub Action).
 *
 * Kullanıcı JWT'si KULLANILMAZ; kimlik = HMAC imzası (`x-neviios-signature:
 * t=<unix>,v1=<hex>`, 5 dk tolerans). `RELEASE_EVENT_SECRET` tanımlı değilse
 * uç KAPALIDIR (503) — "secret yok → kontrolsüz kabul" asla yapılmaz. Bu
 * turda hiçbir sağlayıcıya webhook kaydedilmedi.
 */
export async function POST(request: Request) {
  const secret = process.env.RELEASE_EVENT_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: { code: "NOT_CONFIGURED", message: "Release olay alımı yapılandırılmamış (RELEASE_EVENT_SECRET yok)." } }, { status: 503 });
  }
  const raw = await request.text();
  if (raw.length > 100_000) return jsonFail("VALIDATION_ERROR", "Olay çok büyük");
  if (!verifyReleaseEventSignature(raw, request.headers.get(RELEASE_EVENT_SIGNATURE_HEADER), secret)) {
    return jsonFail("UNAUTHORIZED", "Geçersiz imza");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonFail("VALIDATION_ERROR", "Geçersiz JSON");
  }
  const parsed = releaseEventSchema.safeParse(json);
  if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz olay");
  const res = await ingestReleaseEvent(parsed.data);
  if (!res.ok) return jsonFail(res.error.code, res.error.message);
  return NextResponse.json({ ok: true, data: res.data });
}
