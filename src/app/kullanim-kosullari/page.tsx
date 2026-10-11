import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = getSiteConfig();
  return { title: `Kullanım Koşulları · ${cfg.appName}` };
}

/**
 * Public kullanım koşulları — kurumun verdiği hesaplarla kullanılan,
 * eğitim yönetimi amaçlı bir B2B2C ürününe uygun sade koşullar.
 */
export default async function TermsPage() {
  const cfg = getSiteConfig();
  return (
    <LegalPage title="Kullanım Koşulları">
      <LegalSection heading="1. Hizmetin konusu">
        <p>
          {cfg.appName}, kursların ders programı, yoklama, telafi, ödev, duyuru ve ödeme takibi süreçlerini yönetmesini
          sağlayan bir platformdur. Hesaplar kurumunuz tarafından oluşturulur; herkese açık bireysel kayıt yoktur.
        </p>
      </LegalSection>
      <LegalSection heading="2. Hesap ve güvenlik">
        <ul className="list-disc space-y-1 pl-5">
          <li>Giriş bilgileriniz kişiseldir; başkalarıyla paylaşmayınız.</li>
          <li>Şifrenizi düzenli aralıklarla güncelleyin; yetkisiz kullanımı kurumunuza bildirin.</li>
          <li>Veli hesapları yalnızca ilişkili öğrencilerin bilgilerini gösterir; bu kapsam dışına çıkılamaz.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Kabul edilebilir kullanım">
        <ul className="list-disc space-y-1 pl-5">
          <li>Platformu yalnızca eğitim ve kurum iletişimi amaçlarıyla kullanın.</li>
          <li>Başkalarına ait hesaplara erişmeye çalışmayın; güvenlik önlemlerini atlatmayın.</li>
          <li>Yüklediğiniz dosya ve mesajların içeriğinden siz sorumlusunuz; hukuka aykırı içerik yüklemeyin.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="4. Roller ve yetkiler">
        <p>
          Öğrenci, veli, öğretmen ve yönetici rolleri farklı yetkilere sahiptir. Örneğin veliler ödev görüntüleyebilir
          ancak öğrenci adına teslim yapamaz; öğretmenler kendi programlarını görüntüler; yoklama ve tahsilat gibi idari
          işlemler yöneticiler tarafından yürütülür.
        </p>
      </LegalSection>
      <LegalSection heading="5. Ödemeler">
        <p>
          Platformda görünen borç ve ödeme bilgileri bilgilendirme amaçlıdır; kayıtlar kurumunuzun muhasebesiyle
          birlikte değerlendirilir. Çevrimiçi kart ödemeleri, ödeme kuruluşunun güvenli sayfasında tamamlanır;{" "}
          {cfg.appName} kart bilgilerinizi almaz ve saklamaz.
        </p>
      </LegalSection>
      <LegalSection heading="6. Bildirimler">
        <p>
          Ders hatırlatmaları ve duyurular, uygulama içi bildirim merkezi ve (izin verirseniz) cihaz push bildirimleri
          yoluyla iletilir. Bildirim tercihlerinizi uygulama içinden yönetebilirsiniz.
        </p>
      </LegalSection>
      <LegalSection heading="7. Hizmetin sürekliliği">
        <p>
          Hizmetin kesintisiz olması hedeflenir; bakım, güncelleme veya mücbir sebeplerle kısa süreli kesintiler
          olabilir. Kritik değişiklikler uygulama içinden duyurulur.
        </p>
      </LegalSection>
      <LegalSection heading="8. Hesabın kapatılması">
        <p>
          Hesabınızın silinmesini isterseniz{" "}
          <a className="text-[var(--color-primary)] hover:underline" href="/hesap-silme-talebi">
            hesap silme talebi sayfasındaki
          </a>{" "}
          adımları izleyin. Kurumdan ayrılmanız hâlinde erişiminiz kurumunuz tarafından kapatılabilir.
        </p>
      </LegalSection>
      <LegalSection heading="9. Koşulların güncellenmesi">
        <p>
          Bu koşullar gerektiğinde güncellenebilir; önemli değişiklikler uygulama içinden duyurulur. Güncel metin her
          zaman bu sayfada yayımlanır.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
