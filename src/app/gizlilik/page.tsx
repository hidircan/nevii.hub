import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = getSiteConfig();
  return { title: `Gizlilik Politikası · ${cfg.appName}` };
}

/**
 * Public gizlilik politikası — uygulamanın GERÇEK veri akışını anlatır:
 * kurumun verdiği portal hesapları, ders/yoklama/ödev kayıtları, barındırılan
 * (hosted) ödeme sayfası, push bildirim token'ları, profil fotoğrafları.
 * Kart verisi toplanmaz/saklanmaz. Doğrulanmamış kurum bilgisi YOK.
 */
export default async function PrivacyPage() {
  const cfg = getSiteConfig();
  return (
    <LegalPage title="Gizlilik Politikası">
      <LegalSection heading="1. Bu metin neyi kapsar?">
        <p>
          Bu politika, {cfg.appName} web ve mobil uygulamalarının hangi kişisel verileri, hangi amaçlarla ve hangi
          hukuki sebeplerle işlediğini açıklar. {cfg.appName}, kursların ders programı, yoklama, telafi, ödev ve ödeme
          takibini yapan bir kurum yönetim platformudur; hesaplar kurumunuz tarafından oluşturulur.
        </p>
      </LegalSection>
      <LegalSection heading="2. İşlenen veriler">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Hesap bilgileri:</strong> e-posta adresi, rol (öğrenci/veli/öğretmen/yönetici) ve giriş kayıtları.
            Şifreler geri döndürülemez şekilde özetlenerek saklanır.
          </li>
          <li>
            <strong>Öğrenci/veli bilgileri:</strong> ad-soyad, telefon, enstrüman, öğretmen ve şube eşleşmesi, veli-öğrenci
            ilişki kayıtları.
          </li>
          <li>
            <strong>Eğitim kayıtları:</strong> ders programı, yoklama durumu, telafi talepleri, ödevler ve yüklenen ödev
            dosyaları, gelişim değerlendirmeleri.
          </li>
          <li>
            <strong>Ödeme kayıtları:</strong> tahakkuk ve tahsilat bilgileri (tutar, vade, ödeme durumu). Çevrimiçi kart
            ödemeleri, ödeme kuruluşunun kendi güvenli (hosted) sayfasında alınır; kart numarası, son kullanma tarihi ve
            CVV {cfg.appName} sistemlerine <strong>hiç ulaşmaz ve saklanmaz</strong>.
          </li>
          <li>
            <strong>Bildirim verileri:</strong> cihaz push token&apos;ları ve bildirim tercihleri. Token&apos;lar yalnızca
            hatırlatma ve bilgilendirme göndermek için kullanılır.
          </li>
          <li>
            <strong>Profil fotoğrafı (isteğe bağlı):</strong> yüklemeniz hâlinde görüntülenir; dilediğinizde
            kaldırabilirsiniz.
          </li>
          <li>
            <strong>Teknik kayıtlar:</strong> güvenlik ve denetim amaçlı işlem kayıtları (ör. giriş denemeleri, önemli
            işlemlerin denetim izleri).
          </li>
        </ul>
      </LegalSection>
      <LegalSection heading="3. Verilerin kullanım amaçları">
        <p>
          Veriler; derslerin planlanması ve yürütülmesi, yoklama ve telafi süreçleri, veli-öğrenci bilgilendirmesi,
          ödeme takibi, bildirim gönderimi, güvenliğin sağlanması ve yasal yükümlülüklerin yerine getirilmesi
          amaçlarıyla işlenir.
        </p>
      </LegalSection>
      <LegalSection heading="4. Verilerin paylaşımı">
        <p>
          Verileriniz üçüncü kişilerle pazarlama amacıyla paylaşılmaz. Sınırlı paylaşım yalnızca hizmetin çalışması için
          zorunlu taraflarla yapılır: barındırma (hosting) sağlayıcısı, push bildirim altyapısı, ödeme kuruluşu
          (yalnızca ödeme işlemi için) ve yasal zorunluluk hâlinde yetkili kamu kurumları.
        </p>
      </LegalSection>
      <LegalSection heading="5. Saklama süreleri">
        <p>
          Veriler, hesabınız aktif olduğu sürece ve sonrasında yasal saklama yükümlülükleri (ör. mali kayıtlar ve
          denetim izleri) için gereken süre boyunca tutulur. Hesap silme taleplerinde, yasal olarak saklanması zorunlu
          kayıtlar hariç verileriniz silinir veya anonimleştirilir.
        </p>
      </LegalSection>
      <LegalSection heading="6. Haklarınız">
        <p>
          Verilerinize erişme, düzeltilmesini isteme, silinmesini talep etme ve işlemeye itiraz etme haklarına
          sahipsiniz. Hesap silme talebinizi uygulamadan (Hesabım → Gizlilik ve veri → Hesap silme talebi) veya{" "}
          <a className="text-[var(--color-primary)] hover:underline" href="/hesap-silme-talebi">
            hesap silme talebi sayfasından
          </a>{" "}
          iletebilirsiniz.
          {cfg.orgEmail ? (
            <>
              {" "}Gizlilik sorularınız için <strong>{cfg.orgEmail}</strong> adresine yazabilirsiniz.
            </>
          ) : (
            <> Gizlilik sorularınız için kurumunuzla iletişime geçebilirsiniz.</>
          )}
        </p>
      </LegalSection>
      <LegalSection heading="7. Çocukların verileri">
        <p>
          Öğrenci hesapları (reşit olmayanlar dâhil) kurum tarafından, eğitim hizmetinin yürütülmesi amacıyla
          oluşturulur. Veli erişimleri, velinin yalnızca kendi çocuğunun bilgilerini görmesiyle sınırlıdır.
        </p>
      </LegalSection>
      <LegalSection heading="8. Güvenlik">
        <p>
          Veriler şifreli bağlantılarla taşınır, rol bazlı yetkilendirme uygulanır ve her kurumun verisi diğer
          kurumlardan yalıtılır. Olası bir ihlalde ilgili kullanıcılar ve gerektiğinde yetkili kurumlar
          bilgilendirilir.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
