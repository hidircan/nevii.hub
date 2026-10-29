import { Card } from "@/components/ui";
import type { MobileControlRow } from "@/lib/platform/mobile-policy";
import { MOBILE_BINARY_REQUIRED } from "@/lib/platform/mobile-policy";

const ENTITLEMENT_LABEL: Record<string, string> = {
  plan: "pakette",
  addon: "eklenti",
  override: "platform özel izni",
  none: "pakette yok",
};

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "açık" : "kapalı";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Mobil kontrol matrisi (salt-okunur sunucu görünümü): her kontrol için
 * paket hakkı / ayar değeri + kaynağı / efektif sonuç / istemci etkisi.
 * Düzenleme alttaki ayar editöründen yapılır (kritik anahtarlar onay +
 * denetim kaydıyla); burası kararın okunabilir özetidir.
 */
export function MobileControlMatrix({ rows }: { rows: MobileControlRow[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Kontrol özeti: hak, ayar, sonuç, telefona yansıma</h2>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Sonuç = paket hakkı <em>ve</em> ayar birlikte. Hak yoksa düğme açık olsa bile erişim verilmez; sunucu reddeder.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th scope="col" className="py-2 pr-3 font-medium">Kontrol</th>
              <th scope="col" className="py-2 pr-3 font-medium">Paket hakkı</th>
              <th scope="col" className="py-2 pr-3 font-medium">Ayar ve kaynağı</th>
              <th scope="col" className="py-2 pr-3 font-medium">Sonuç</th>
              <th scope="col" className="py-2 font-medium">Telefona yansıma</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b align-top last:border-0" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2 pr-3 font-medium text-[var(--color-text)]">
                  {r.label}
                  {r.danger ? (
                    <p role="note" className="mt-1 max-w-56 text-xs font-normal text-[var(--color-warning)]">
                      {r.danger}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">
                  {r.entitled ? (
                    <span className="text-[var(--color-success)]">var ({ENTITLEMENT_LABEL[r.entitlementSource] ?? r.entitlementSource})</span>
                  ) : (
                    <span className="text-[var(--color-danger)]">yok</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">
                  <code>{fmtValue(r.settingValue)}</code> · {r.settingSource === "platform" ? "platform varsayılanı" : r.settingSource === "tenant" ? "kurum ayarı" : r.settingSource}
                </td>
                <td className="py-2 pr-3 text-xs font-semibold">
                  {r.effective ? (
                    <span className="text-[var(--color-success)]">açık</span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">kapalı</span>
                  )}
                </td>
                <td className="py-2 text-xs text-[var(--color-text-muted)]">{r.clientEffect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-4 text-xs font-semibold text-[var(--color-text)]">Uzaktan değişir / yeni sürüm ister</h3>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Yukarıdaki tüm kontroller uzaktan değişir (uygulama yeniden açıldığında uygulanır).
        Aşağıdakiler yeni mobil sürüm gerektirir:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-muted)]">
        {MOBILE_BINARY_REQUIRED.map((b) => (
          <li key={b.label}>
            <strong className="text-[var(--color-text)]">{b.label}:</strong> {b.detail}
          </li>
        ))}
      </ul>
    </Card>
  );
}
