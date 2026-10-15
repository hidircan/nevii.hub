# Google Play — mağaza paketi (2026-10-15)

Uygulama: **Nevii Hub** · paket `com.neviihub.mobile` · EAS `nevii-production` (sürüm kodu EAS'ta, `autoIncrement`).
Kaynak taslak: `docs/mobile/MOBILE_STORE_PACK.md` (bu klasör onun Play'e hazır hâlidir).

## 1. Görseller (bu klasörde)

| Klasör | İçerik | Ölçü | Play gereksinimi |
|---|---|---|---|
| `icon/icon-512.png` | Uygulama ikonu (NH monogram, `apps/mobile/assets/icon.png`'den) | 512×512 PNG | 512×512, ≤1 MB ✓ |
| `feature-graphic/feature-graphic-1024x500.png` | Öne çıkan görsel | 1024×500 PNG | 1024×500 ✓ |
| `screenshots/phone/*.png` | Gerçek uygulama ekranları (8) | 1080×1920 | 2–8 adet, 9:16 ✓ |
| `screenshots/tablet/*.png` | Gerçek uygulama ekranları (4) | 1200×1920 | 7"/10" tablet ✓ |
| `mockups/*.png` | Çerçeve + başlıklı tanıtım kareleri (5, TR) | 1080×1920 | Telefon ekran görüntüsü olarak yüklenebilir |

Nasıl üretildi: mobil uygulamanın kendi kodu (Expo Router / React Native) Expo web ile yerel API'ye karşı çalıştırıldı ve
Playwright ile telefon (360×640 @3) / tablet (800×1280 @1.5) boyutunda çekildi. Veriler **yerel demo** verisidir;
öğrenci/öğretmen/kurum/şube adları kurgusal adlarla değiştirildi (gerçek kişi verisi YOK). Web'de olmayan iki yerel
modül (bildirim, güvenli depolama) yalnız bu geçici çekim kopyasında taklit edildi — uygulama koduna dokunulmadı.
Yönetici rolünün mobil portalı politika gereği kapalı olduğu için yönetici ekranı yok (açıklamada da vaat edilmez).

## 2. Mağaza girişi

**Uygulama adı (≤30):** Nevii Hub

**Kısa açıklama (≤80)**
- TR (72): Ders programı, ödevler, gelişim ve ödemeler — kurumunuzun mobil portalı.
- EN (71): Lessons, homework, progress and payments — your school’s mobile portal.

**Uzun açıklama — TR**

Nevii Hub, müzik ve sanat kurslarının öğrencilerini, velilerini ve öğretmenlerini kurumlarıyla buluşturan mobil portaldır.
Hesabınız kurumunuz tarafından oluşturulur; giriş yaptığınızda rolünüze uygun ekranları görürsünüz.

Öğrenciler ve veliler için
• Sıradaki ders ve haftalık ders programı
• Ödevler ve teslimler
• Devam durumu ve gelişim raporları
• Ödeme dökümü ve makbuzlar
• Ders hatırlatma bildirimleri (tercihlerinizden yönetilir)

Öğretmenler için
• Günlük ve haftalık ders programı
• Öğrenci listesi, ödev ve materyal paylaşımı
• Hakediş özeti

Gizlilik ve güvenlik
• Verileriniz kurum bazında yalıtılır; yalnız kendi kayıtlarınızı görürsünüz.
• Kart bilgileri uygulamaya girilmez; ödemeler ödeme kuruluşunun güvenli sayfasında yapılır.
• Hesabınızın silinmesini uygulama içinden (Hesabım → Gizlilik ve veri) veya https://neviihub.com/hesap-silme-talebi
  adresinden isteyebilirsiniz.

Not: Uygulamada kayıt ekranı yoktur; giriş bilgilerinizi kurumunuzdan alırsınız. Görünen özellikler kurumunuzun
açtığı modüllere göre değişebilir.

**Uzun açıklama — EN**

Nevii Hub is the mobile portal that connects music and arts school students, parents and teachers with their school.
Your account is created by your school; after signing in you see the screens for your role.

For students and parents
• Next lesson and weekly schedule
• Homework and submissions
• Attendance and progress reports
• Payment history and receipts
• Lesson reminder notifications (managed in your preferences)

For teachers
• Daily and weekly schedule
• Student list, homework and material sharing
• Compensation summary

Privacy and security
• Data is isolated per school; you only see your own records.
• Card details are never entered in the app; payments are made on the payment provider’s secure page.
• You can request account deletion in the app (Account → Privacy and data) or at https://neviihub.com/hesap-silme-talebi

Note: There is no sign-up screen; your school provides your sign-in details. Available features depend on the modules
your school enables.

**Diğer giriş alanları (öneri — owner onaylar)**
- Kategori: **Eğitim** · Etiketler: Eğitim, Okul yönetimi
- İletişim e-postası: info@neviihub.com (gelen kutusu Cloudflare yönlendirmesiyle çalışıyor) · Web: https://neviihub.com
- Gizlilik politikası: https://neviihub.com/gizlilik (canlı, 200) · Hesap silme: https://neviihub.com/hesap-silme-talebi (canlı, 200)

## 3. Uygulama içeriği beyanları — TASLAK (kanıtlı)

| Beyan | Önerilen cevap | Kanıt (repo) | Güven |
|---|---|---|---|
| Gizlilik politikası | https://neviihub.com/gizlilik | `src/app/gizlilik/page.tsx` | Kesin |
| Reklam | Uygulamada reklam **yok** | `apps/mobile/package.json` — reklam SDK'sı yok | Kesin |
| Uygulama erişimi | Bazı işlevler giriş ister → inceleme için test hesabı verilecek; kayıt ekranı yok | `app/login.tsx`, kurum hesabı modeli | Kesin (hesap owner'dan) |
| Hesap silme | Uygulama içi + web URL'si | `apps/mobile/app/hesap-silme-talebi.tsx`, `src/app/hesap-silme-talebi/page.tsx` | Kesin |
| Veri güvenliği — toplanan | Ad, e-posta, telefon (hesap); eğitim kayıtları (ders, yoklama, ödev, gelişim); ödeme **durumu/tutarı** (kart yok); isteğe bağlı fotoğraf/dosya (profil, ödev/materyal); uygulama içi push jetonu | `app.json` plugin'leri (image-picker yalnız galeri, document-picker), `src/push/*` | Kesin |
| Veri güvenliği — konum, kişiler, mikrofon, kamera | **Toplanmaz** (kamera/mikrofon/kayıt izinleri engelli) | `app.json` `blockedPermissions`, image-picker `cameraPermission: false` | Kesin |
| Analitik / çökme raporu | Üçüncü taraf analitik/çökme SDK'sı **yok** | bağımlılık listesi | Kesin |
| Şifreleme (aktarım) | Evet, HTTPS | `api-url-policy` (production https zorunlu) | Kesin |
| Paylaşım | Üçüncü taraflarla satış/paylaşım yok; hizmet sağlayıcılar (barındırma, push altyapısı, ödeme kuruluşu) işleyici | `src/app/gizlilik/page.tsx` | Owner/hukuk teyidi |
| Finansal özellikler | Finansal ürün/hizmet **sunmaz**; kurs ücreti bilgisi gösterir, ödeme kuruluşu sayfasına yönlendirir (gerçek dünya hizmeti → Play Faturalandırma kapsamı dışı) | `docs/mobile/MOBILE_STORE_PACK.md` §8 | Yüksek |
| Sağlık / haber / devlet | Hayır | — | Kesin |

### Belirsiz — varsayılmadı, owner kararı gerekiyor
1. **Hedef kitle ve çocuklar:** öğrenciler reşit olmayabilir (veli hesabıyla kapsanır). 13 yaş altı hedef kitle seçilirse
   Aileler politikası devreye girer. Öneri: hedef yaş **18+** (hesap yetişkin veli/öğretmen/yönetici; çocuk erişimi kurum
   ve veli üzerinden) — hukuki karar owner'ın.
2. **İçerik derecelendirmesi (IARC):** kullanıcılar arası etkileşim var mı? Ödev teslimi/materyal yalnız öğretmen–öğrenci
   arasında; herkese açık sohbet yok. Öneri: "kullanıcı etkileşimi: sınırlı/yok" — owner teyidi.
3. **Veri güvenliği formunda "isteğe bağlı mı":** fotoğraf/dosya isteğe bağlı; hesap verileri zorunlu (kurum tutar).
4. **Veri saklama süresi:** gizlilik metnindeki süreler Play formuna aynen aktarılmalı (owner/hukuk).

## 4. İnceleme test hesabı
Canlı API'ye bağlanan sürüm için **canlıda sentetik bir test öğrencisi + test öğretmeni** gerekir (gerçek kişi verisi
olmadan). Canlı veri değişikliği owner onayı ister — bu oturumda oluşturulmadı. Kimlik bilgileri bu repoya YAZILMAZ;
Play Console → Uygulama erişimi formuna girilir.

## 5. Durum ve sonraki adımlar
- Play Console'a erişim: oturum `hidircanyagiz@gmail.com`'da açık ama bu hesapta geliştirici hesabı yok (ilk sürüm başka
  bir Google hesabında). Owner doğru hesapla giriş yapınca: mağaza girişi + görseller + beyanlar taslak olarak girilir,
  gerekiyorsa yeni AAB (`eas build -p android --profile production`, sürüm kodu EAS'ta otomatik artar) iç teste gönderilir.
- **Üretime gönderme düğmesine owner "gönder" demeden basılmaz.**

## 6. Kaynak şablonlar
`_kaynak/feature.html` (1024×500) ve `_kaynak/mockup.html` (1080×1920; `?s=<ekran>&k=<üst başlık>&t=<başlık>`) —
`icon.png` ve ekran görüntüleri yanına kopyalanıp tarayıcıda o boyutta açılarak yeniden üretilir (başlık değişikliği için).
