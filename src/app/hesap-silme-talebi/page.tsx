import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = getSiteConfig();
  return { title: `Hesap Silme Talebi · ${cfg.appName}` };
}

/**
 * Public hesap-silme bilgilendirme sayfası — oturum GEREKTİRMEZ (mağaza
 * incelemesi ve giriş yapamayan kullanıcılar için). Kimlik doğrulamasız
 * silme YOK: girişli kullanıcı uygulama içinden talebini oluşturur;
 * giriş yapamayan kullanıcı kurumuyla iletişime geçer.
 */
export default async function DeletionRequestPage() {
  const cfg = getSiteConfig();
  return (
    <LegalPage title="Hesap Silme Talebi">
      <LegalSection heading="Nasıl talep oluşturulur?">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Uygulamaya giriş yapın</strong> (web veya mobil).
          </li>
          <li>
            <strong>Hesabım → Gizlilik ve veri → Hesap silme talebi</strong> adımlarını izleyin.
          </li>
          <li>Bilgilendirmeyi okuyup onayı işaretleyin ve talebi gönderin.</li>
          <li>Talebinizin durumunu aynı ekrandan takip edebilirsiniz; bekleyen talebi geri çekebilirsiniz.</li>
        </ol>
        <p className="mt-3">
          Giriş yapamıyorsanız (ör. şifrenizi unuttuysanız), önce{" "}
          <Link className="text-[var(--color-primary)] hover:underline" href="/login">
            giriş sayfasındaki
          </Link>{" "}
          şifre sıfırlama adımlarını deneyin veya kurumunuzla iletişime geçin. Güvenliğiniz için kimliğiniz
          doğrulanmadan silme işlemi yapılmaz.
        </p>
      </LegalSection>
      <LegalSection heading="Talebiniz nasıl işlenir?">
        <ul className="list-disc space-y-1 pl-5">
          <li>Talebiniz kurum yöneticiniz tarafından incelenir (onay/red).</li>
          <li>
            Onaylanan taleplerde profil, iletişim ve eğitim içerik verileriniz silinir veya anonimleştirilir; işlem
            tamamlanınca durumunuz &quot;işlendi&quot; olarak güncellenir.
          </li>
          <li>
            Yasal saklama zorunluluğu olan sınırlı kayıtlar (ör. mali belgeler ve güvenlik denetim izleri) mevzuatın
            gerektirdiği süre boyunca korunur; bunun dışındaki veriler silinir.
          </li>
        </ul>
      </LegalSection>
      <LegalSection heading="Silinen ve saklanan veriler">
        <p>
          <strong>Silinir/anonimleştirilir:</strong> hesap profili, iletişim bilgileri, ders/yoklama/ödev eşleşmeleri,
          bildirim kayıtları ve cihaz token&apos;ları, profil fotoğrafı.
        </p>
        <p>
          <strong>Yasal zorunlulukla saklanır:</strong> muhasebe ve ödeme belgeleri ile güvenlik denetim kayıtları —
          yalnızca mevzuatın gerektirdiği süre ve kapsamda, erişimi kısıtlı şekilde.
        </p>
      </LegalSection>
      <LegalSection heading="Sorularınız mı var?">
        <p>
          {cfg.orgEmail ? (
            <>
              Gizlilik ve silme talepleri için <strong>{cfg.orgEmail}</strong> adresine yazabilirsiniz.
            </>
          ) : (
            <>Gizlilik ve silme talepleri için kurumunuzla iletişime geçebilirsiniz.</>
          )}{" "}
          Veri işlemeye dair genel bilgi için{" "}
          <Link className="text-[var(--color-primary)] hover:underline" href="/gizlilik">
            Gizlilik Politikası
          </Link>
          &apos;nı inceleyin.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
