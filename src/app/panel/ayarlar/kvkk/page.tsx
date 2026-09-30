import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readReferenceData } from "@/lib/store";
import { listConsentTextVersionsTool } from "@/lib/services";
import { PageHeader, Card, Input, Label, Button } from "@/components/ui";
import { actionCreateConsentTextVersion, actionUpdateConsentSettings } from "@/lib/actions";
import { DEFAULT_CONSENT_SETTINGS } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEFAULT_CONSENT_TYPE = "kvkk_general";

/**
 * Faz 8 (KVKK) — hukuki metin versiyonları + tenant rıza ayarları yönetimi.
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN (hassas kişisel veri, requireConsentAccess
 * ile AYNI düzey). `?type=` query param ile hangi consentType'ın tarihçesi
 * gösterileceği seçilir — varsayılan "kvkk_general" (portal first-login
 * gate'inin kullandığı sabit tür, bkz. /ogrenci/layout.tsx).
 */
export default async function KvkkAyarlariPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/kvkk");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const { type } = await searchParams;
  const consentType = type?.trim() || DEFAULT_CONSENT_TYPE;

  const [data, versionsResult] = await Promise.all([readReferenceData(), listConsentTextVersionsTool(session, { consentType })]);
  const versions = versionsResult.ok ? versionsResult.data.versions : [];
  const settings = data.settings.consentSettings ?? DEFAULT_CONSENT_SETTINGS;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="KVKK Açık Rıza Ayarları"
        description="Hukuki metin versiyonları ve rıza gerektiren özellikler burada yönetilir. Metin değiştiğinde mevcut onaylar otomatik olarak 'güncel değil' sayılır — yeniden onay istenir."
      />

      <Card className="mb-6">
        <form method="get" className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <Label>Rıza türü</Label>
            <Input name="type" defaultValue={consentType} placeholder="ör. kvkk_general, whatsapp_messaging" />
          </div>
          <Button type="submit">Görüntüle</Button>
        </form>

        <h2 className="mb-2 font-semibold text-[var(--color-text)]">
          &quot;{consentType}&quot; metin geçmişi
        </h2>
        {versions.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            Bu tür için henüz bir metin yayınlanmamış — yayınlanana kadar portal first-login gate&apos;i
            (ve bu türle kısıtlanan özellikler) uygulanmaz.
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <p className="mb-1 font-medium text-[var(--color-text)]">
                  v{v.version} — yürürlük: {formatDateTime(v.effectiveFrom)}
                </p>
                <p className="whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">{v.bodyText}</p>
              </div>
            ))}
          </div>
        )}

        <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Yeni versiyon yayınla</h3>
        <form
          action={async (formData: FormData) => {
            "use server";
            await actionCreateConsentTextVersion(formData);
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="consentType" value={consentType} />
          <div>
            <Label>Metin</Label>
            <textarea
              name="bodyText"
              required
              rows={6}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2"
            />
          </div>
          <div>
            <Label>Yürürlük tarihi</Label>
            <Input name="effectiveFrom" type="datetime-local" required />
          </div>
          <div>
            <Button type="submit">Yayınla</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-[var(--color-text)]">Rıza ayarları</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await actionUpdateConsentSettings(formData);
          }}
          className="grid gap-3"
        >
          <div>
            <Label>Kısıtlanan özellikler (virgülle ayırın)</Label>
            <Input
              name="restrictedFeatures"
              defaultValue={settings.restrictedFeatures.join(", ")}
              placeholder="ör. whatsapp_messaging, photo_sharing"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Listedeki her özellik adı, aynı isimli bir rıza türüne (`consentType`) karşılık gelir —
              geçerli rızası olmayan bir kişi için o özellik kısıtlanır.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="record-device-info"
              type="checkbox"
              name="recordDeviceInfo"
              defaultChecked={settings.recordDeviceInfo}
              className="h-4 w-4"
            />
            <label htmlFor="record-device-info" className="text-sm text-[var(--color-text)]">
              Rıza kayıtlarında IP/cihaz bilgisi tutulsun (varsayılan kapalı — veri minimizasyonu)
            </label>
          </div>
          <div>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
