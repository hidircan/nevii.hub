import { Card } from "@/components/ui";
import { buildConfigSnapshot } from "@/lib/platform/config-snapshot";
import { sanitizeLogoUrl, withLogoVersion, logoUrlStamp } from "@/lib/institution-logo";

/**
 * Marka önizlemesi (salt-okunur): KAYITLI efektif değerlerin web + mobil
 * karşılamada nasıl görüneceğinin taslağı. Düzenleme alttaki editörden
 * yapılır — önizleme ile kaydetme ayrımı bu başlıkla belirgindir.
 * Logo sanitize + sürüm damgalı; metinler düz metin render edilir.
 */
export async function BrandPreview({ tenantId }: { tenantId: string }) {
  const snapshot = await buildConfigSnapshot(tenantId, null);
  const b = snapshot.branding.institution;
  const safeLogo = sanitizeLogoUrl(b.logoUrl);
  const logo = safeLogo ? (withLogoVersion(safeLogo, logoUrlStamp(safeLogo)) ?? safeLogo) : null;
  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Önizleme — kayıtlı marka (salt-okunur)</h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Aşağıdaki görünüm KAYITLI değerlerden üretilir; değişiklik editörden kaydedilmeden burası değişmez.
      </p>
      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
        <div className="mx-auto max-w-sm text-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="mx-auto mb-3 h-12 w-auto max-w-[180px] rounded bg-white object-contain p-1" />
          ) : (
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">(logo kayıtlı değil — kurum adı metin gösterilir)</p>
          )}
          <p
            className="text-xl font-semibold"
            style={{ color: b.colorPrimary || "var(--color-text)" }}
          >
            {b.name || "(kurum adı kayıtlı değil)"}
          </p>
          {b.loginMessage ? (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{b.loginMessage}</p>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">(karşılama metni kayıtlı değil)</p>
          )}
          <div className="mx-auto mt-4 flex max-w-[240px] justify-center gap-2" aria-hidden>
            <span className="h-4 flex-1 rounded" style={{ background: b.colorPrimary || "var(--color-surface-muted)" }} />
            <span className="h-4 flex-1 rounded" style={{ background: b.colorAccent || "var(--color-surface-muted)" }} />
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">birincil · vurgu</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Mobil karşılama aynı kayıtlı değerleri snapshot üzerinden okur (config v{snapshot.configVersion}); yeni mobil
        sürüm gerektiren öğeler mobil sekmesinde listelenir.
      </p>
    </Card>
  );
}
