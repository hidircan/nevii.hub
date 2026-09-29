# UAT — 2026-09-29: deneme statü adları, MEB opsiyonel, yoklama geri alma, hakediş politikası

Migration: `20260929180000_teacher_payout_policy` (additive: yeni tablo `TeacherPayoutPolicyPeriod`,
`TeacherPayout.pricingPolicy/pricingSnapshot` nullable). Test DB'ye push'tan önce uygulandı.

## 1. Deneme dersleri (`/panel/deneme`)
- "Devam edecek" → **Tekrar planlanacak**, "Devam etmeyecek" → **Kayıt olmayacak** (filtre, satır seçimi, silme özeti,
  ana sayfa deneme özeti). Saklanan değerler (`will_continue` / `will_not_continue`) değişmedi.
- Kayda dönüşmüş deneme artık "Kayda dönüştü" okunur (DB'de `will_continue` kalsa da "Tekrar planlanacak" görünmez).
- "Tekrar planlanacak" seçilince artık "kayda dönüştür?" sorusu açılmaz; ana sayfa takibi "Tekrar deneme planlanmadı" der.

## 2. Yeni öğrenci — MEB (`/panel/ogrenciler/yeni`)
- MEB seçili iken seviye/başlangıç/bitiş zorunlu değil (UI `required` kalktı, sunucu `validateMebFields` da).
- Girilirse doğrulama aynen: seviye 1–8, geçerli tarih, bitiş ≥ başlangıç, "Girdi" ⇒ sınav tarihi (geçmiş).
- Aynı kural öğrenci profil/MEB paneli düzenlemesinde de geçerli (tek sunucu kapısı).

## 3. Yoklama takvimi — statüyü geri alma (`/panel/yoklama`, ayrıca Ders Programı detayı)
- İşaretli butona (Geldi/İşlendi/Telafi) tekrar bas → açıklamalı onay kutusu → "Evet, geri al" / "Vazgeç".
- Geri alma: Geldi → yoklama satırı silinir; İşlendi → ders `scheduled`'a döner, hakedişten çıkar;
  Telafi → bekleyen telafi talebi iptal (hak iade). Ödeme kayıtlarına dokunulmaz.
- Reddedilen durumlar (Türkçe mesajla): telafi dersi planlanmış/yapılmış; İşlendi dersi kayıtlı/ödenmiş hakedişe dahil;
  ekrandaki statü eski (başka kullanıcı değiştirdi). Öğretmen rolü geri alamaz (işaretleyemediği gibi).
- Çift tıklama: istemci kilidi + sunucu "beklenen statü" koşullu yazım; ikinci istek no-op.

## 4. Hakediş politikası (`/panel/hakedisler`)
- Ay seçiciyle aya git → "Hakediş politikası — <Ay>" kartı: **Mevcut politika** veya **Süreye göre sabit ücret**
  (30/40/50 dk için 3 ayrı TL alanı, tüm öğretmenler ortak) → "Politikayı kaydet".
- Kural özeti:
  - Seçim yapılmamış ay = mevcut politika (geçmiş aylar kendiliğinden değişmez).
  - Seçim yalnız o takvim ayına, o aydaki tüm öğretmen/derslere uygulanır; ay içinde bölünmez.
  - Hakediş kaydı yokken istenildiği kadar değiştirilebilir (canlı yeniden hesap). O ayla kesişen **herhangi**
    bir hakediş kaydı (bekleyen/ödenmiş) oluşunca ay kilitlenir; tek ders düzeltmesi = mevcut revizyon.
  - Sabit ücrette 30/40/50 dışı süreli ders ücretlendirilmez → o öğretmenin hakedişi oluşturulamaz (uyarı + satırda rozet).
  - Tutarlar zorunlu, > 0, ≤ 100.000 TL; kuruşa yuvarlanır. Tutar alanları son kullanılan tutarlarla ön doldurulur.
  - Hakediş kaydı politikayı ve ay bazlı tutarları donmuş saklar (`pricingPolicy`, `pricingSnapshot`); değişiklik audit'te
    önce/sonra ile (`teacher_payout.policy`). Çift kayıt: mevcut `teacherId+dönem` tekilliği aynen.
- Yetki: SCHOOL_ADMIN/SUPER_ADMIN + kurum hakediş erişim politikası (ücret kurallarıyla aynı). "Tüm kurumlar" görünümünde salt okunur.

## UAT'de özellikle bakılacaklar
1. Deneme listesinde filtre + satır açılır menüsü + dönüştürülmüş satır etiketi.
2. MEB işaretli, MEB alanları boş yeni öğrenci kaydı; sonra geçersiz tarih (bitiş < başlangıç) hâlâ reddediliyor mu.
3. Yoklama: Geldi → tekrar bas → Vazgeç (değişmemeli) → tekrar bas → Evet (kutu rengi boşalmalı, sayfa yenileyince de boş).
   İşlendi'yi geri al; o ders Hakedişler'de düşmeli. Telafi'yi geri al; Telafi ekranında talep "iptal" olmalı.
4. Hakedişler: gelecek bir ay (kayıtsız) seç → sabit ücret + 3 tutar → öğretmen tutarları ders başı değişmeli;
   geçen ay değişmemeli. Bir öğretmen için hakediş kaydı oluştur → politika kartı kilitli yazmalı, değişiklik reddedilmeli.
   Mevcut politikaya geri dön (kayıtsız bir ayda) → eski dakika bazlı tutarlar geri gelmeli.
5. 45 dk gibi 30/40/50 dışı süreli ders olan öğretmende sabit ücret seçiliyken uyarı + "hakediş oluştur" pasif.

Bilinen sınırlar: yazdırma sayfası (`/ogretmen-hakedis-yazdir`) ve öğretmen portalı dakika ücretini (tutar/süre)
gösterir, politika adını göstermez. Hakediş kaydı silme yok (mevcut tasarım) — yanlış politikayla oluşturulan
kayıt revizyonla düzeltilir.
