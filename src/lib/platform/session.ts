import { notFound, redirect } from "next/navigation";
import { requireSessionContext } from "../auth/session";
import type { ServiceContext } from "../services/context";

/** Oturumu zorunlu kılar; rol kontrolü YAPMAZ (yalnız /platform kök layout'u 403 ekranı için). */
export async function requirePlatformSession(nextPath: string): Promise<ServiceContext> {
  let session: ServiceContext;
  try {
    session = await requireSessionContext();
  } catch {
    // Control Center (2026-09-28) — platform oturumsuzluğu ayrı kapıya
    // (/platform/giris) yönlenir; kurum girişi (/login) değişmez.
    redirect(`/platform/giris?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

/**
 * Her /platform sayfası ve alt layout'u bunu çağırır. Layout'taki 403 ekranına
 * GÜVENİLMEZ (App Router'da layout ve sayfa paralel render edilir): rol
 * HYPER_ADMIN değilse sayfa segmenti 404 ile kesilir — veri okunmaz.
 */
export async function requireHyperAdminPage(nextPath: string): Promise<ServiceContext> {
  const session = await requirePlatformSession(nextPath);
  if (session.role !== "HYPER_ADMIN") notFound();
  return session;
}

export function isPlatformForbidden(session: ServiceContext): boolean {
  return session.role !== "HYPER_ADMIN";
}
