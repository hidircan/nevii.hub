import { getTenantSettings } from "@/lib/platform/service";
import { sanitizeLogoUrl, withLogoVersion, logoUrlStamp } from "@/lib/institution-logo";
import type { ServiceContext } from "@/lib/services/context";

/**
 * Kurum karşılama şeridi (Control Center 2026-09-28): panel ana sayfasının
 * üstünde, kurumun NeviiOS'ta kayıtlı adı + logosu + karşılama metnini
 * gösterir. Değerler DOĞRU tenant üzerinden (oturumun tenant'ı) efektif
 * çözümlemeden gelir; yapılandırılmamışsa HİÇBİR ŞEY render edilmez
 * (boş şerit yok). Logo sanitize + sürüm damgalıdır (eski logo cache'i
 * gösterilmez); metin düz metin olarak render edilir (HTML yok).
 */
export async function InstitutionWelcome({ session }: { session: ServiceContext }) {
  let name = "";
  let logo: string | null = null;
  let message = "";
  let primary = "";
  try {
    const res = await getTenantSettings(session, session.tenantId);
    if (res.ok) {
      const find = (k: string) => res.data.settings.find((s) => s.key === k)?.effectiveValue;
      name = String(find("institution.name") ?? "");
      const rawLogo = find("institution.logoUrl");
      const safe = sanitizeLogoUrl(typeof rawLogo === "string" ? rawLogo : null);
      logo = safe ? (withLogoVersion(safe, logoUrlStamp(safe)) ?? safe) : null;
      message = String(find("institution.loginMessage") ?? "");
      primary = String(find("institution.colorPrimary") ?? "");
    }
  } catch {
    // marka okunamazsa şerit gösterilmez — panel çalışmaya devam eder
  }
  if (!name.trim() && !logo && !message.trim()) return null;
  return (
    <section
      aria-label="Kurum karşılaması"
      className="mb-4 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-10 w-auto max-w-[120px] shrink-0 rounded bg-white object-contain p-0.5" />
      ) : null}
      <div className="min-w-0">
        {name.trim() ? (
          <p className="truncate text-sm font-semibold" style={primary ? { color: primary } : { color: "var(--color-text)" }}>
            {name}
          </p>
        ) : null}
        {message.trim() ? <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{message}</p> : null}
      </div>
    </section>
  );
}
