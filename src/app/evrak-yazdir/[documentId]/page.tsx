import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getDocumentInstanceTool } from "@/lib/services";
import { documentKindLabel } from "@/lib/documents";
import { readReferenceData } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { DocumentPrintActions } from "@/components/document-print-actions";
import { resolveSafeReturnTo, returnToLabel } from "@/lib/safe-return-to";
import { printSurfaceCss } from "@/lib/contract-print-theme";

export const dynamic = "force-dynamic";

/**
 * Evraklar — A4 odaklı, sade yazdırma görünümü. Makbuz sayfasıyla
 * (`/makbuz/[paymentId]`) AYNI desen: `/panel` layout'unun (sidebar/nav)
 * DIŞINDA, kendi kök sayfası — böylece tarayıcı yazdırmasında panel
 * navigasyonu hiç DOM'da yer almaz (gizlemeye gerek yok, zaten yok).
 * Admin-only; içerik `getDocumentInstanceTool` üzerinden AYNI tenant/RBAC
 * kontrolünden geçer — belge başka kuruma aitse burada da erişilemez.
 *
 * P0 (2026-09-05) — kullanıcı raporu: KVKK Aydınlatma Metni ve Fotoğraf/
 * Video Açık Rıza Formu ayrı iki buton/iki ayrı belge basımı gerektiriyordu
 * ("bölünmüş" akış). Belge KAYITLARI (DocumentInstance, kendi versiyon/
 * referans geçmişiyle) KASITLI olarak ayrı kalır — ikisi hukuken farklı
 * belgeler, tek bir kayıtta birleştirmek versiyon geçmişini bozar. Yalnızca
 * YAZDIRMA GÖRÜNÜMÜ birleşti: `?also=<ikinciBelgeId>` verilirse iki belge
 * TEK sayfada, aralarında sayfa sonu ile, art arda gösterilir — kullanıcı
 * tek "Yazdır"a basar, iki metni de tek çıktıda alır.
 */
export default async function DocumentPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ also?: string; returnTo?: string }>;
}) {
  const { documentId } = await params;
  const { also, returnTo } = await searchParams;
  const safeReturnTo = resolveSafeReturnTo(returnTo);
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/evrak-yazdir/${documentId}`);
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect(homePathForRole(session.role));
  }

  const result = await getDocumentInstanceTool(session, { documentId });
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="text-lg font-semibold text-[var(--color-text)]">Evrak bulunamadı.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Bu belge silinmiş olabilir veya kurumunuza ait değil.</p>
        <Link href="/panel/evraklar" className="mt-6 inline-block text-sm font-medium text-amber-600 hover:text-amber-700">
          Evraklar Merkezine dön
        </Link>
      </div>
    );
  }

  const doc = result.data.document;
  const data = await readReferenceData();
  const branch = doc.branchId ? data.settings.branches.find((b) => b.id === doc.branchId) : undefined;

  // İkinci belge (varsa) — geçersiz/erişilemez `also` sessizce YOK SAYILIR,
  // tek belgelik akış (mevcut, çok daha yaygın kullanım) asla kırılmaz.
  const secondResult = also ? await getDocumentInstanceTool(session, { documentId: also }) : null;
  const secondDoc = secondResult?.ok ? secondResult.data.document : null;
  const docs = secondDoc ? [doc, secondDoc] : [doc];

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 16mm; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-2xl">
        <DocumentPrintActions
          backHref={safeReturnTo ?? `/panel/evraklar/${doc.id}`}
          backLabel={safeReturnTo ? returnToLabel(safeReturnTo) : "Evrak detayına dön"}
        />
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          Sayfa numarası ve tarih bilgisi için yazdırma penceresinde &quot;Üstbilgiler ve altbilgiler&quot;
          seçeneğini açık bırakın — tarayıcı bunu otomatik ekler. PDF için hedef olarak
          &quot;PDF olarak kaydet&quot;i seçin.
        </p>

        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-6">
            <div>
              <p className="text-lg font-semibold text-[var(--color-text)]">{data.settings.name}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{branch?.address ?? data.settings.city}</p>
            </div>
          </div>

          {docs.map((d, i) => (
            <div
              key={d.id}
              className={i > 0 ? "mt-10 border-t-2 border-dashed border-[var(--color-border-strong)] pt-10 print:break-before-page print:border-none" : ""}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Oluşturulma tarihi: {formatDate(d.createdAt, "d MMMM yyyy")}
                </p>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Referans</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-text-muted)]">{d.reference}</p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Belge Türü</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{documentKindLabel(d.kind)}</p>
                </div>
              </div>

              {d.renderedHtml ? (
                <div className="prose prose-sm mt-6 max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: d.renderedHtml }} />
                </div>
              ) : (
                <p className="mt-6 text-sm text-[var(--color-text-muted)]">İçerik yok.</p>
              )}

              {/*
                Şablonun kendi imza/tarih alanları (varsa) `renderedHtml` içinde
                zaten yer alır ve BOŞ bırakılmışsa sistem bunu ZORLA doldurmaz.
                Bu aşağıdaki blok, şablondan bağımsız, yazdırma görünümünün genel
                "imza alanı" iskeletidir (makbuz sayfasıyla aynı konvansiyon) —
                iki belge birlikte basılırken HER İKİSİ de kendi imza alanını
                taşır, çünkü ikisi hukuken ayrı ayrı imzalanan/onaylanan
                belgelerdir.
              */}
              <div className="mt-12 flex gap-10 border-t border-[var(--color-border)] pt-10 print:break-inside-avoid">
                <div className="min-w-[200px] max-w-xs flex-1">
                  <div className="h-16 border-b border-slate-400" />
                  <p className="mt-2 text-center text-xs font-medium text-[var(--color-text-muted)]">Tarih</p>
                </div>
                <div className="min-w-[200px] max-w-xs flex-1">
                  <div className="h-16 border-b border-slate-400" />
                  <p className="mt-2 text-center text-xs font-medium text-[var(--color-text-muted)]">İmza</p>
                </div>
              </div>
            </div>
          ))}

          <p className="mt-10 text-center text-[11px] text-[var(--color-text-muted)]">Bu belge sistem tarafından oluşturulmuştur.</p>
        </div>
      </div>
    </div>
  );
}
