# NeviiHub Mobil — Gerçek Cihaz UAT Runbook'u

Branch: `feature/mobile-student-parent-p0` · Hedef: 1 Ekim 2026 canlı çıkış.
Kapsam: öğrenci SELF + veli (guardian) portal smoke testleri; teacher
bölümü yalnız referans maddelerdir (teacher UI bu turun sahipliğinde değil).

> Gizlilik: bu dokümana gerçek parola, token, secret, kullanıcı telefonu
> veya hassas kişisel bilgi YAZILMAYACAK. Test hesapları takma adla anılır
> (örn. `ogrenci-self-01`, `veli-guardian-01`).

Her test maddesi için kayıt şablonu:

- Ön koşul:
- Aksiyon:
- Beklenen sonuç:
- Geçti / Kaldı:
- Test eden:
- Tarih:
- Cihaz modeli:
- İşletim sistemi sürümü:
- Kanıt türü: screenshot / video / console-safe log
- Bug ID / not:

## 0. Expo SDK 57 Bundle Gate (UAT'den ÖNCE zorunlu)

Canonical mobil SDK **Expo SDK 57** (user-approved upgrade, 2026-09-14). Typecheck ve Vitest Metro'nun import
graph'ını çözmez — `@react-navigation/bottom-tabs` hatası ikisi yeşilken iPhone'da çıktı. Bu yüzden:

1. **Bundle gate** (repo kökünden): `npm run verify:mobile-bundle`
   - iOS Metro bundle: `expo export --platform ios` → `/tmp/neviihub-mobile-ios-export`
   - Android Metro bundle: `expo export --platform android` → `/tmp/neviihub-mobile-android-export`
   - Expo Router `app/` altındaki TÜM route'ları (teacher/student/parent/admin) bundle'a alır; tek bir çözülemeyen
     import tüm komutu fail eder. Exit 0 olmadan Expo Go / EAS Preview / TestFlight / Google Internal testine geçilmez.
2. **Dependency audit** (Expo Go öncesi, `apps/mobile`): `npx expo install --check` → "up to date";
   `npx expo-doctor` → tüm kontroller geçer.
3. **Expo Go başlatma** (cache temiz):
   `cd apps/mobile && EXPO_PUBLIC_API_URL=https://test.neviihub.com npx expo start --clear`
   iPhone'daki Expo Go SDK 57'yi desteklemeli (App Store'daki güncel sürüm); QR ile aç. localhost/LAN IP kullanılmaz.
4. **Dependency eklerken** `npx expo install <paket>` kullanılır (npm `@latest` değil): Expo, SDK 57 native modül
   sürümlerine uyumlu pin'i seçer; Expo Go yalnız bu native sürümleri taşır.
5. **Bundle hatası görülürse** (`Unable to resolve "<paket>"`) sırayla:
   a. Paket `apps/mobile/package.json`'da doğrudan var mı? Transit/hoisted pakete güvenilmez.
   b. SDK 57 `expo/bundledNativeModules.json`'da listeleniyor mu? Listeleniyorsa `npx expo install <paket>`.
   c. Listelenmiyorsa expo-router/Expo paketinin kendi içinde taşıyıp taşımadığına bak (ör. React Navigation →
      `expo-router/tabs`, `expo-router/react-navigation`); ayrı kopya kurmak context/instance ayrışmasına yol açar.
   d. Native modül Expo Go'da yoksa fake çözüm yok → development build gerekir; blocker olarak raporla.
6. `node_modules/`, `.expo/`, `dist/` ve `/tmp` export çıktısı Git'e ALINMAZ (`apps/mobile/.gitignore`).

## 1. Ön Koşullar

- [ ] §0 bundle gate exit 0 (`npm run verify:mobile-bundle`).
- [ ] Expo Go kurulu VEYA EAS preview build cihaza yüklü.
- [ ] Test backend HTTPS URL'si biliniyor (`EXPO_PUBLIC_API_URL` cihazdan erişilebilir).
- [ ] iPhone cihaz hazır (küçük ekran modeli — örn. SE — layout kontrolü için).
- [ ] Android orta segment cihaz hazır.
- [ ] Wi-Fi bağlantısı + mobil internet (hücresel) ayrı ayrı denenebilir.
- [ ] Zayıf ağ testi için: yavaş hotspot veya ağ kısma imkânı.
- [ ] Student SELF test hesabı (aktif `studentId` bağlı).
- [ ] Guardian test hesabı (aktif access record + child relationship bağlı).
- [ ] Teacher test hesabı (teacher smoke referansı için).
- [ ] Test tenant scope'u (gerçek kurum verisi DEĞİL).
- [ ] Guardian hesabında child ilişkisi YOKKEN davranışı test etmek için
      ilişkisiz ikinci bir guardian hesabı (missing-context testi).

## 2. iPhone Student Smoke Test

### ST-IOS-01 Login

- Ön koşul: uygulama taze açıldı, oturum yok.
- Aksiyon: student SELF hesabıyla giriş yap.
- Beklenen sonuç: öğrenci Ana Sayfa açılır; sıradaki ders / ödev özeti görünür.

### ST-IOS-02 Session restore

- Ön koşul: ST-IOS-01 geçti, oturum açık.
- Aksiyon: uygulamayı kill edip yeniden aç.
- Beklenen sonuç: login ekranına düşmeden Ana Sayfa açılır.

### ST-IOS-03 Program

- Ön koşul: oturum açık.
- Aksiyon: Program sekmesi → hafta ileri/geri gezinme → "Bu haftaya dön".
- Beklenen sonuç: gün grupları, ders kartları, BUGÜN rozeti doğru; boş hafta empty state.

### ST-IOS-04 Ders detayı

- Ön koşul: programda en az bir ders var.
- Aksiyon: ders kartına dokun.
- Beklenen sonuç: öğretmen, saat, oda/enstrüman (backend'den gelenler) görünür; olmayan bilgi uydurulmaz.

### ST-IOS-05 Ödev

- Ön koşul: oturum açık.
- Aksiyon: Ödevler sekmesi → filtreler (Bekleyen/Tamamlanan/Geçmiş) → ödev detayı.
- Beklenen sonuç: durum, son teslim, açıklama doğru; geçmiş ödev suçlayıcı dil İÇERMEZ.

### ST-IOS-06 Student-only action

- Ön koşul: PENDING ödev var.
- Aksiyon: ödev detayında not ekleyip "Teslim et".
- Beklenen sonuç: "Teslim gönderildi."; hata varsa anlaşılır mesaj + retry.

### ST-IOS-07 Payment history read-only

- Ön koşul: oturum açık.
- Aksiyon: Ana Sayfa ödeme özeti → Tüm ödemeler → ödeme detayı (+makbuz varsa).
- Beklenen sonuç: bakiye/geçmiş/makbuz salt-görünüm; ödeme BAŞLATMA butonu YOK.

### ST-IOS-08 Notifications

- Ön koşul: oturum açık.
- Aksiyon: zil ikonu → liste → sayfalama → bir bildirime dokun (okundu).
- Beklenen sonuç: gün grupları, boş durumda "Bildirim yok", hatada retry.

### ST-IOS-09 Logout

- Ön koşul: oturum açık.
- Aksiyon: Hesabım → Çıkış yap → onayla.
- Beklenen sonuç: login ekranına dönülür; geri tuşuyla korumalı ekrana girilemez.

### ST-IOS-10 Network error

- Ön koşul: oturum açık, Ana Sayfa.
- Aksiyon: uçak modunu aç → pull-to-refresh.
- Beklenen sonuç: "İnternet bağlantısı kurulamadı. Lütfen tekrar deneyin." + retry; beyaz ekran yok.

### ST-IOS-11 Küçük ekran layout

- Ön koşul: iPhone SE (veya en küçük hedef).
- Aksiyon: tüm sekmelerde kaydır, yatay taşma kontrolü.
- Beklenen sonuç: taşma/kesilme yok; dokunma hedefleri ≥44pt.

## 3. Android Student Smoke Test

ST-IOS-01–11'deki akışların Android doğrulaması (aynı madde ID'leriyle
`ST-AND-01`…`ST-AND-11` olarak kaydedilir). Ek Android notu: geri tuşu
davranışı (logout sonrası korumalı ekrana dönüş YOK) her maddede gözlemlenir.

## 4. iPhone Guardian Smoke Test

### GD-IOS-01 Login

- Ön koşul: oturum yok.
- Aksiyon: guardian hesabıyla giriş.
- Beklenen sonuç: veli Ana Sayfa + aktif öğrenci bağlamı (öğrenci adı) görünür.

### GD-IOS-02 Child context

- Ön koşul: oturum açık.
- Aksiyon: Çocuğum ekranını aç.
- Beklenen sonuç: aktif öğrenci kartı (ad, branş, öğretmen, paket);
  telefon/e-posta/internal ID GÖRÜNMEZ; çocuk seçici YOK (tek bağlam).

### GD-IOS-03 Child schedule

- Ön koşul: child context var.
- Aksiyon: Ders programı → hafta gezinme.
- Beklenen sonuç: öğrencinin programı read-only; öğretmen operasyonu butonu YOK.

### GD-IOS-04 Child lesson detail

- Ön koşul: programda ders var.
- Aksiyon: ders kartına dokun.
- Beklenen sonuç: detay salt-görünüm; yoklama alma/düzenleme CTA'sı YOK.

### GD-IOS-05 Homework read-only

- Ön koşul: oturum açık.
- Aksiyon: Ödevler → detay.
- Beklenen sonuç: "Teslim işlemi yalnızca öğrencinin kendi hesabından
  yapılabilir." mesajı; Teslim Et butonu YOK; fake upload alanı YOK.

### GD-IOS-06 Attendance read-only

- Ön koşul: oturum açık.
- Aksiyon: Yoklama özeti ekranını aç.
- Beklenen sonuç: katılım oranı + detay kartları; yoklama alma/düzenleme/
  silme/onay CTA'sı YOK; sıfır kayıtta "Henüz işlenmiş ders yok".

### GD-IOS-07 Payment history read-only

- Ön koşul: oturum açık.
- Aksiyon: Ödemeler → detay (+makbuz).
- Beklenen sonuç: salt-görünüm; ödeme başlatma/kart/banka/payout YOK.

### GD-IOS-08 Notifications

- Ön koşul: oturum açık.
- Aksiyon: bildirim merkezi → liste/okundu/boş/hata.
- Beklenen sonuç: ST-IOS-08 ile aynı davranış.

### GD-IOS-09 Logout

- Ön koşul: oturum açık.
- Aksiyon: Hesabım → Çıkış yap → onayla.
- Beklenen sonuç: login ekranı; geri tuşuyla dönüş YOK.

### GD-IOS-10 Missing child context

- Ön koşul: ilişkisiz guardian hesabı.
- Aksiyon: giriş yap → Ana Sayfa/Çocuğum.
- Beklenen sonuç: "Öğrenci bilgisi bulunamadı" empty state; crash/fake child YOK.

### GD-IOS-11 Relationship/scope doğrulaması

- Ön koşul: guardian oturumu açık.
- Aksiyon: (gözlem) yalnız bağlı öğrencinin verisi görünür.
- Beklenen sonuç: başka öğrenci adı/verisi HİÇBİR ekranda görünmez.

### GD-IOS-12 Küçük ekran layout

- Ön koşul: iPhone SE.
- Aksiyon: yoklama detay kartları + Çocuğum kartı kontrolü.
- Beklenen sonuç: 3'lü kart satırlarında taşma yok; hedefler ≥44pt.

### GD-IOS-13 Telafiler read-only

- Ön koşul: guardian oturumu açık.
- Aksiyon: Çocuğum → Telafiler; liste, boş durum, pull-to-refresh.
- Beklenen sonuç: bağlı öğrencinin telafi kayıtları (öğretmen, branş, tarih, durum rozeti); kayıt yoksa "Gösterilecek telafi dersi bulunmuyor."; oluşturma/onay/iptal/düzenleme butonu YOK; uçak modunda bağlantı hatası + retry.

## 5. Android Guardian Smoke Test

GD-IOS-01–13'nin Android doğrulaması (`GD-AND-01`…`GD-AND-13`).
Ek: geri tuşu + kill/restart her maddede gözlemlenir.

## 6. Teacher Smoke Test Referansı

Teacher UI bu turun sahipliğinde DEĞİLDİR — yalnız madde listesi:

- Login · Today lessons · Schedule · Lesson detail · Attendance
  · Double-submit denemesi · needsConfirmation dialog · Makeup screen
  · Earnings read-only · Logout.

## 7. Failure Tests

### FT-01 İnternet kesme

- Ön koşul: herhangi bir liste ekranı açık.
- Aksiyon: uçak modu → refresh.
- Beklenen sonuç: bağlantı hatası metni + retry; crash yok.

### FT-02 Yavaş ağ

- Ön koşul: zayıf hotspot.
- Aksiyon: Ana Sayfa aç.
- Beklenen sonuç: skeleton görünür kalır; zaman aşımında genel hata + retry.

### FT-03 401

- Ön koşul: geçersiz/süresi dolmuş oturum (test backend ile).
- Aksiyon: korumalı ekranı aç.
- Beklenen sonuç: "Oturumunuz sona erdi. Tekrar giriş yapın." → login.

### FT-04 403

- Ön koşul: yetkisiz kayıt denemesi.
- Aksiyon: ilgili ekranı aç.
- Beklenen sonuç: "Bu bilgiye erişim yetkiniz yok." (nötr ton, retry YOK).

### FT-05 404

- Ön koşul: silinmiş ders/ödev ID'si.
- Aksiyon: detay ekranını aç.
- Beklenen sonuç: "İstenen kayıt bulunamadı."

### FT-06 429

- Ön koşul: hız limiti tetiklenir (test backend).
- Aksiyon: hızlı ardışık refresh.
- Beklenen sonuç: "Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin."

### FT-07 5xx

- Ön koşul: backend hata modu (test ortamı).
- Aksiyon: liste ekranı aç.
- Beklenen sonuç: "Şu anda veriler yüklenemedi. Tekrar deneyin."; teknik detay YOK.

### FT-08 Session refresh failure

- Ön koşul: refresh token geçersiz.
- Aksiyon: 401 tetikle.
- Beklenen sonuç: oturum temizlenir → login; yarı-açık ekran YOK.

### FT-09 Logout sonrası geri tuşu (Android)

- Ön koşul: logout yapıldı.
- Aksiyon: sistem geri tuşu.
- Beklenen sonuç: uygulamadan çıkılır veya login'de kalınır; korumalı ekran AÇILMAZ.

### FT-10 Kill + restart

- Ön koşul: oturum açık, bir detay ekranında.
- Aksiyon: kill → yeniden aç.
- Beklenen sonuç: oturum korunur (ST-IOS-02) veya güvenli login; crash YOK.

### FT-11 Yanlış persona route denemesi

- Ön koşul: student oturumu.
- Aksiyon: parent-only alana erişim denemesi (derin bağlantı/menü).
- Beklenen sonuç: PersonaGuard yönlendirmesi; yetkisiz veri GÖRÜNMEZ.

### FT-12 Guardian ilişkisiz öğrenci denemesi

- Ön koşul: guardian oturumu.
- Aksiyon: bağlı olmayan öğrenci verisine erişim denemesi.
- Beklenen sonuç: 403/404 kullanıcı dostu metni; veri sızıntısı YOK.

## 8. Store Preflight

- [ ] App icon (tüm boyutlar, şeffaf logo beyaz kutuya alınmamış).
- [ ] Splash ekranı.
- [ ] Bundle identifier doğrulandı.
- [ ] Android package name doğrulandı.
- [ ] Version number + build number.
- [ ] Privacy Policy URL (yayında).
- [ ] Support URL.
- [ ] Terms URL.
- [ ] Review demo account (student + guardian, şifreler SADECE review notunda).
- [ ] Hesap silme politikası/akışı.
- [ ] Data Safety (Google) / App Privacy (Apple) formları.
- [ ] Screenshot listesi (iPhone + Android, TR metinler).
- [ ] EAS preview build alındı.
- [ ] TestFlight iç test.
- [ ] Google Internal Testing.

> Not: bu turda EAS build / TestFlight / Play upload YAPILMADI — maddeler
> insan aksiyonu olarak bekliyor.
