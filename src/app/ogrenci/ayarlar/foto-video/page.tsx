import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { listSocialMediaConsentHistoryTool } from "@/lib/services";
import { Badge, Card, PageHeader } from "@/components/ui";
import { actionWithdrawSocialMediaConsent } from "@/lib/actions";
import { formatDateTime } from "@/lib/utils";
import type { SocialMediaScope } from "@/lib/types";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<SocialMediaScope, string> = {
  photo: "Fotoğraf",
  video: "Video",
  name: "Ad Soyad",
  voice: "Ses",
  website: "Kurumun resmi internet sitesi",
  instagram: "Kurumun resmi Instagram ve diğer sosyal medya hesapları",
  print_materials: "Kurumun basılı tanıtım materyalleri (broşür, afiş vb.)",
  digital_ads: "Kurumun dijital tanıtım/reklam çalışmaları",
  in_house_board: "Kurum içi pano ve etkinlik tanıtımları",
  other: "Diğer",
};

const STATUS_LABELS: Record<string, string> = {
  granted: "İzin verildi",
  denied: "İzin verilmedi",
  withdrawn: "Geri çekildi",
  expired: "Süresi doldu",
};

/**
 * 2026-2027 kaynağı Fotoğraf/Video Açık Rıza Formu — PORTAL-CONTRACT-001.
 * `/ogrenci/ayarlar/kvkk` ile AYNI desen: konu (öğrenci veya
 * accessType=GUARDIAN velisi) KENDİ rıza tarihçesini görür, "geleceğe
 * etkili" geri çekebilir (kaynak: "Açık rızamı ... geri çekebileceğimi ...
 * biliyorum"). Yeni bir rıza VERMEK bu sayfadan YAPILAMAZ — bu, personelin
 * kayıt/sözleşme akışında yürüttüğü, temsilci kimliği/ilişkisi doğrulanan
 * bir işlemdir (bkz. contract-panel.tsx); burada yalnızca GÖRÜNTÜLEME ve
 * GERİ ÇEKME vardır.
 */
export default async function OgrenciFotoVideoConsentPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/ayarlar/foto-video");
  }
  if (session.role !== "STUDENT") redirect("/ogrenci");
  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı.
  const portalStudentId = await getPortalPageStudentId(session);
  if (!portalStudentId) redirect("/ogrenci");

  const result = await listSocialMediaConsentHistoryTool(session, { studentId: portalStudentId });
  const history = result.ok ? result.data.history : [];
  const latest = history[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Fotoğraf/Video İznim"
        description="Fotoğraf/Video Açık Rıza Formu'na verdiğiniz yanıtın tarihçesi — istediğiniz zaman geleceğe etkili olmak üzere geri çekebilirsiniz."
      />

      <Card>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz kaydedilmiş bir fotoğraf/video izin yanıtınız yok.</p>
        ) : (
          <div className="space-y-3">
            {history.map((c) => {
              const isLatest = c.id === latest?.id;
              return (
                <div key={c.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--color-text)]">
                      {STATUS_LABELS[c.status] ?? c.status}
                      {isLatest ? (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          GÜNCEL
                        </span>
                      ) : null}
                    </p>
                    <Badge status={c.withdrawnAt || c.status === "withdrawn" ? "cancelled" : "confirmed"} />
                  </div>
                  {c.scopes.length > 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Kanallar: {c.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-[var(--color-text-muted)]">Tarih: {formatDateTime(c.grantedAt)}</p>
                  {c.withdrawnAt ? (
                    <p className="text-xs text-[var(--color-text-muted)]">Geri çekme: {formatDateTime(c.withdrawnAt)}</p>
                  ) : isLatest && c.status !== "withdrawn" ? (
                    <form
                      action={async () => {
                        "use server";
                        await actionWithdrawSocialMediaConsent({ studentId: portalStudentId });
                      }}
                      className="mt-2"
                    >
                      <button
                        type="submit"
                        className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                      >
                        İzni geri çek
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Link href="/ogrenci" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
          ← Öğrenci paneline dön
        </Link>
      </p>
    </div>
  );
}
