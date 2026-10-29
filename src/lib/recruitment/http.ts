/** Herkese açık kariyer uçları için ortak HTTP yardımcıları. */
import { consumeRateLimit } from "../rate-limit";

export function clientIp(req: Request): string {
  // Vercel'de `x-real-ip` platform tarafından yazılır (istemci taklit edemez); yoksa XFF'nin ilk öğesi.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

/** Gövde okunmadan önce boyut kontrolü (4 MB CV + form payı). */
export function tooLarge(req: Request, maxBytes = 4_700_000): boolean {
  const len = Number(req.headers.get("content-length") ?? "0");
  return Number.isFinite(len) && len > maxBytes;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function limited(bucket: string, req: Request, max: number, windowMs: number): boolean {
  return !consumeRateLimit(bucket, clientIp(req), { windowMs, max });
}

export async function readCvFromForm(form: FormData): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  const f = form.get("cv");
  if (!f || typeof f === "string") return null;
  const file = f as File;
  if (file.size === 0) return null;
  return { fileName: file.name || "cv", mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) };
}
