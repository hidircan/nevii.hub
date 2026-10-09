import { NextResponse } from "next/server";
import type { ServiceErrorCode, ServiceResult } from "../services/result";

const STATUS: Record<ServiceErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Tüm JSON API yanıtları kişiseldir: CDN/ara-proxy'nin yanlış cache'lemesini
 * engellemek için merkezi `private, no-store` + `Vary: Authorization`.
 * Dosya indirme uçları kendi header'larını zaten taşır (değişmez).
 */
const PRIVATE_JSON_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
} as const;

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true as const, data }, { status: init?.status ?? 200, headers: PRIVATE_JSON_HEADERS });
}

export function jsonFail(
  code: ServiceErrorCode,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    {
      ok: false as const,
      error: details !== undefined ? { code, message, details } : { code, message },
    },
    { status: STATUS[code] ?? 500, headers: PRIVATE_JSON_HEADERS }
  );
}

/** Map ServiceResult → HTTP response (no business logic) */
export function fromServiceResult<T>(result: ServiceResult<T>) {
  if (result.ok) return jsonOk(result.data);
  return jsonFail(result.error.code, result.error.message, result.error.details);
}

export async function readJsonBody(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) return { ok: true, body: {} };
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonFail("VALIDATION_ERROR", "Invalid JSON body"),
    };
  }
}
