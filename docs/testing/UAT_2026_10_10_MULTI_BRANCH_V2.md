# UAT — Çoklu branş v2: bir öğrenci kimliği, birbirinden bağımsız eşit branş kayıtları (2026-10-10)

> Durum: KOD HAZIR, **hiçbir fonksiyonel test çalıştırılmadı** (yalnız `tsc` ve değişen dosyalarda `eslint`). Aşağıdaki her madde owner'ın
> canlı/test ortamında doğrulaması içindir. Commit/push/PR/merge/deploy yapılmadı.

## 1. Kök nedenler
1. Bir önceki sürümde yalnız **ek** branşlar kendi koşullarını taşıyordu; **ana kaydın** koşulları (tür, MEB, paket, ödeme, tarihler) öğrenci
   satırındaki eski alanlardaydı. Ek branşta MEB seçilse bile satır MEB alanlarını göstermiyor/kaydetmiyordu.
2. Üç ayrı form uygulaması vardı (ilk branş tam form, ek branş 6 alanlık satır, öğrenci sayfası kartı): kurallar üç yerde farklıydı.
3. Kayıt anı ilk tahsilat yalnız ilk branş içindi; ek branş eklemede tahsilat/ders günü/paket yoktu; kayıt "öğrenci + N ayrı çağrı"ydı
   (yarım kayıt mümkündü).
4. Çok branşlı öğrencide birçok tüketici (liste, MEB paneli, öğretmen ekranları, kota, CSV, materyal, banka seçimi…) öğrenci satırı aynasını
   "gerçek" sanıp ilk branşın değerini gösteriyordu.

## 2. Mimari (tek model)
- `Student.enrollments[]` kayıtları `termsVersion: 2` ile **kendi koşullarını** taşır; tek okuma kapısı `enrollmentTerms`.
- Öğrenci satırı yalnız **uyumluluk aynası**dır (`mirrorPatchFromEnrollments`): enstrüman/tür = aktif branşların birleşimi; diğer alanlar tek
  kaynak branştan (`primary` bayrağı **ayrıcalık değil**, yalnız "ayna hangi branştan okunsun" seçimidir; yoksa en eski aktif).
  Ayna hiçbir yerde başka branşın koşulu için kaynak olarak okunmaz.
- Tüm yazımlar tek kapıdan: `store.updateStudentProfile` cephesi branş koşulu yazımını hedef branşa yönlendirir; çok branşlıda hedef yoksa
  `EnrollmentRequiredError` (Türkçe mesaj) — **ilk branşa sessiz yazım yok**.
- Atomik/idempotent: `registerStudent` (öğrenci + tüm branşlar + her branşın ilk tahsilatı tek işlem, `registrationId` ile çift gönderim tek kayıt,
  advisory lock) ve `changeStudentEnrollments` (branş ekle/düzenle + ilk tahsilat tek işlem, kilit içinde "aynı enstrüman+öğretmen" engeli).
- Ortak form: `src/lib/enrollment-form.ts` (taslak, kararlı `key`, doğrulama, fiyat, önerilen ilk tahsilat — istemci ve sunucu aynı fonksiyon),
  `src/components/enrollment-form-fields.tsx` (tek bileşen: kayıt, branş ekle, branş düzenle).
- **Yeni migration YOK.** Önkoşul: `20261009120000_payment_enrollment_link` canlıda uygulanmış olmalı.

## 3. Eşlik matrisi (alan/davranış × iş akışı)
Durum: ✔ = artık aynı ortak form/doğrulama/tek kapı; (ö) = doğrulanmadı, owner testi gerekir.

| Alan / davranış | Seviye | İlk branş (kayıt) | Ek branş (kayıt) | Mevcut öğrenciye branş ekle | Branş düzenle | Sözleşme oluştur/yenile/uzat |
|---|---|---|---|---|---|---|
| Enstrüman, öğretmen, şube | Branş | ✔ | ✔ | ✔ | enstrüman kilitli | branş seçimi zorunlu ✔ |
| Öğrenci türü | Branş | ✔ | ✔ | ✔ | ✔ | branş koşulundan ✔ |
| MEB alanları (seviye, dönem, sınav, durum) | Branş | ✔ | ✔ (önceden YOKTU) | ✔ | ✔ | branş koşulundan ✔ |
| Ders süresi, haftalık ders, ders günü/saati | Branş | ✔ | ✔ | ✔ | ✔ | ✔ |
| Paket, ücret, indirim, kampanya, elle ücret | Branş | ✔ | ✔ | ✔ | ✔ (kampanya yalnız eklemede) | dondurulmuş snapshot |
| Ödeme türü / günü | Branş | ✔ | ✔ | ✔ | ✔ (temizlenemez, bkz. açık kalan) | ✔ |
| Kayıt tarihi, ders başlangıcı, süre (ay) | Branş | ✔ | ✔ | ✔ | ✔ | ✔ |
| Kayıt anı ilk tahsilat (tutar, yöntem, tarih, gerekçe) | Branş | ✔ | ✔ (önceden YOKTU) | ✔ (önceden ertelenirdi) | — | çift tahsil yok (branşın ilk tahsilatı mahsup) |
| Kimlik, iletişim, veli, T.C., KVKK, portal | Kişi | tek kez | — | — | Bilgiler sekmesi | — |
| Hata mesajı | — | "Piyano — MEB sınav tarihi: …" | aynı | aynı | aynı | — |

## 4. Tüketici durumu (H)
Düzeltildi: öğrenci listesi/filtreleri/CSV (branş başına satır + yeni sütunlar), MEB paneli (branş başına satır; düzenleme `enrollmentId`),
öğrenci başlığı/Bilgiler/Ödemeler/Sözleşmeler/Program (branş seçici `?brans=`), kayıt başarı paneli (branş başına), ders/seri planlama
(branş seçimi zorunlu), telafi kotası (db modu artık branş başına — json/memory ile aynı), öğretmen ekranları (`isOwnStudent`), öğretmen performansı,
günlük özet, öğretmen silme kontrolü, materyal görünürlüğü, paket kullanım sayacı/silme etkisi, kampanya raporu, toplu müfredat sihirbazı,
WhatsApp ödeme hatırlatması banka seçimi, ödeme detay sayfası beklenen tutar, simülasyon aracı varsayılanları, evrak `paymentPlan`, ekstre
(ücret), CSV içe aktarma (çok branşlıda kişi alanı güncellenir, branş koşuluna dokunmaz).
Bilinen/kısmi: aşağıdaki "Açık kalan".

## 5. Veri güvenliği / geçiş (I)
- Uygulama tembelce v2'ye çıkarır (ilk branşa yönelik yazımda tüm kayıtlar ya hep ya hiç).
- `scripts/reconcile-enrollment-terms.ts` (yeni): varsayılan **kuru çalıştırma**; yalnız `Student.enrollments` yazar, öğrenci satırına dokunmaz;
  materialize öncesi/sonrası her branşın koşulları birebir eşit değilse o öğrenciyi **yazmaz**; iyimser kilit; `--backup` ile önceki değerler;
  tekrar çalıştırılabilir.
- `scripts/backfill-enrollment-links.ts` (güncellendi): tek branşlıda yalnız yapısal sahibi belli ödeme kaynakları otomatik bağlanır; elle
  girilmiş genel ödemeler "genel" kalır. "İkinci branş eklenmeden önce bağsız kayıtları bağla" davranışı da aynı kısıtla çalışır.
- Sıra: (1) `20261009120000` canlıda doğrula → (2) kod deploy → (3) iki betiği **kuru** çalıştır, raporu incele → (4) yedek (`--backup`, DB yedeği)
  → (5) `--apply`. Geri alma: yedek JSON'daki `enrollments` değerlerini geri yaz / DB yedeği.

## 6. Owner manuel UAT kontrol listesi (kabul ölçütleri 1–12)
1. **Tek kimlik, iki branş**: Yeni Öğrenci → kimlik bir kez → Branş 1 (Piyano, MEB) + "Başka bir branş ekle" (Gitar, MEB değil) → ikisini de eksiksiz doldur → son kontrol tablosu iki satır → kaydet. Öğrenci tek kayıt, iki branş.
2. **MEB ikinci branşta**: Branş 1 MEB değil, Branş 2 MEB → ikinci kartta MEB alanları görünür; "Girdi" + sınav tarihi boş → hata "Gitar — MEB sınav tarihi" ve ikinci karta kayar; birinci kart etkilenmez.
3. **Bağımsız ücret/öğretmen**: iki branşta farklı paket/ücret/öğretmen; kaydet; Özet/Bilgiler/Ödemeler'de her biri kendi değerini gösterir; öğrenci başlığında tek öğretmen yazmaz.
4. **İlk tahsilat branş başına**: her kartta ayrı tutar/yöntem/tarih; önerilenden farklı tutarda gerekçe zorunlu; Ödemeler'de iki ayrı "İlk Ödeme" satırı, doğru branşta; toplam doğru.
5. **Çift gönderim**: Kaydet'e hızlıca iki kez bas / hata sonrası yeniden gönder → tek öğrenci, tek tahsilat seti.
6. **Mevcut öğrenciye branş ekle**: Özet → Branş kayıtları → "+ Branş kaydı ekle": aynı form (MEB, paket, ders günü, ilk tahsilat). Aynı enstrüman+öğretmen ikinci kez eklenemez. Önceki branşın sözleşme/ilk tahsilatı yeni branşa kaymaz; elle girilmiş genel ödeme otomatik bağlanmaz.
7. **Branş düzenle**: bir branşın türünü/MEB'ini/ücretini değiştir → diğer branş aynı kalır. MEB türünü kaldır → MEB bilgisi silinmez (uyarı notu), geri işaretleyince görünür.
8. **Sözleşme**: çok branşlıda branş seçmeden Sözleşme Merkezi branş seçtirir; sözleşme önizleme = oluşturma; PDF adı branşı içerir; ilk tahsilat aynı branşın; yenileme/uzatma/iptal yalnız o branşı etkiler.
9. **Ödemeler**: üstte Branş seçici → özet/borç/hareket seçili branşa daralır; yeni borç eklerken branş zorunlu, tutar boş gelir (3000 varsayılanı yok).
10. **Ders/yoklama/telafi**: Program'da çok branşlı öğrenci seçilince "Eğitim (branş)" seçilmeden ders/seri kaydedilmez; telafi hakkı branş başına; öğretmen yalnız kendi branşını görür (ogretmen/ogrenciler/…).
11. **MEB paneli**: iki MEB branşı iki satır; düzenleme yalnız o satırın branşını değiştirir; Gitar (MEB değil) satırı çıkmaz.
12. **Listeler**: Öğrenciler tablosunda öğretmen/paket/ücret/seviye tüm aktif branşları gösterir, filtre doğru; CSV dışa aktarma branş başına satır; branş sonlandırınca yalnız o branş pasif, diğeri sürer.

## 7. Açık kalan / doğrulanmamış (dürüst liste)
- Hiçbir fonksiyonel test, tarayıcı oturumu veya `npm test` çalıştırılmadı. Aşağıdaki testlerin güncellenmesi gerekebilir (doğrulanmadı):
  `institution-export`, `meb-list-query`, `meb-student-tools`, `student-enrollments`, `teacher-removal`, `teacher-portal-scope`, `csv-import*`,
  `student-input-only-fields`, `registration-*`, `student-package-pricing`, `collections-due`, `create-student-instrument-field-leak`.
  Yeni saf testler: `src/lib/__tests__/multi-branch-v2.test.ts` (çalıştırılmadı).
- Branş düzenlemede ödeme türü/günü **temizlenemez** (yalnız değiştirilir). `/ogrenci` ve `/veli` portalları sadece mevcut eğitim listesini gösterir (gözden geçirilmedi).
- Çok branşlı öğrencide AI/registry çağrıları `enrollmentId` vermezse güvenli şekilde reddedilir (tahmin yok).
- MEB paneli db modunda aday MEB öğrencilerini yükleyip bellekte sayfalar (egress kuralıyla gerilim; ölçülmedi).
- Öğrenci CSV dışa aktarma biçimi değişti (branş başına satır, yeni sütunlar) — bu dosyayı tüketen harici araç varsa uyarlanmalı.
- MEB alanları zorunlu DEĞİL (2026-09-29 owner kararı) — brief "mevcut zorunluluk kuralları" dediği için korundu.
- Brief'teki `/design-taste-frontend` ve `/frontend-design:frontend-design` becerileri bu ortamda yoktu; uydurulmadı.
