# Kayıt Süresi (Kayıt Planı) — Tam Veri Akışı Denetimi

## DURUM: DENETLENDİ, YAPISAL SORUN BULUNMADI — küçük UI düzeltmesi uygulandı

## 1. Soru

Önceki turdaki rapor, "Kayıt Planı" süre alanının yalnızca kayıt-sonrası
yönlendirme için kullanıldığını söylemişti. Sahibi bunun yeterli olmadığını,
sürenin gerçek bir "kanonik kalıcı iş değeri" olması gerektiğini, yalnızca
`?sure=X` URL parametresi olarak hayatta kalmaması gerektiğini belirtti. Bu
tur bu iddiayı uçtan uca doğruladı.

## 2. Gerçek veri akışı (kod okunarak doğrulandı)

```
Kayıt formu "Kayıt süresi" seçimi (intendedDurationMonths)
  → FormData → actionAddStudent (src/lib/actions.ts ~808-817)
  → SADECE: (a) kayıt-sonrası yönlendirme hedefini seçer (tanışma vs.
    formal → Sözleşme Merkezi), (b) Sözleşme Merkezi'ne ?sure=X olarak taşınır.
  → ContractPanel bu değeri yalnızca "süre" alanının BAŞLANGIÇ ön-dolgusu
    olarak okur (src/app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx).
  → Admin sözleşmeyi OLUŞTURDUĞUNDA gerçek kanonik değer
    Contract.durationMonths olarak createContract() (src/lib/contracts.ts)
    içinde KALICI OLARAK YAZILIR — 1-12 arası doğrulanır (contracts.ts:415).
  → Bu KALICI değer: toplam tutar (durationMonths × aylık ücret), taksit
    planı, taksit sayısı, tanışma/formal sınıflandırma, sözleşme başlığı,
    sözleşme PDF'i, yenileme bağlamı — HEPSİNİ doğrudan sürükler.
```

**Sonuç: Student modelinde AYRI bir "kayıt süresi" alanı YOKTUR ve
OLMAMALIDIR.** Kalıcı/kanonik tek doğruluk kaynağı zaten `Contract.durationMonths`
— bu, sözleşmenin kendisinin doğal ve doğru sahibi. Kayıt formundaki seçim,
adminin bir sonraki adımda (sözleşme oluşturma ekranı) neyle karşılaşacağını
önceden hazırlayan bir KOLAYLIK alanıdır — bu, hatalı bir tasarım değil,
doğru bir tasarımdır (aynı süreyi ayrı bir kalıcı sütunda ikinci kez
saklamak, iki değerin birbirinden sapması riskini YARATIRDI).

## 3. O halde neden ilk raporda "5/7/8/9/10/11 eksik" hatası vardı?

Kayıt formundaki `intendedDurationMonths` `<select>` alanı, kod olarak
YALNIZCA yönlendirme/ön-dolgu amaçlı olsa da, sahip/kullanıcı için görsel
olarak "kaç ay seçebiliyorum" sorusuna cevap veriyordu ve seçenek listesi
gerçekten eksikti (1, 2, 3, 4, 6, 12 — 5/7/8/9/10/11 yoktu). Bu, "veri akışı
bozuk" değil, "UI seçenek listesi eksik" sorunuydu — ama kullanıcı deneyimi
açısından gerçek bir hataydı ve önceki turda düzeltildi
(`src/components/new-student-form.tsx` — artık `Array.from({length:12})`
ile tam 1-12 üretir, kod tekrar denetlendi, hâlâ doğru).

Kanonik sözleşme oluşturma ekranındaki gerçek süre alanı
(`src/components/contract-panel.tsx:421`, `<Input type="number" min={1}
max={12}>`) zaten HER ZAMAN tam 1-12 aralığını destekliyordu — burada hiç
sorun yoktu.

## 4. Doğrulama — 5/7/8/9/10/11 aylık planlar

Yeni parametrize test eklendi:
`src/lib/__tests__/contracts.test.ts` → `describe("P0 (2026-08-30) — Kayıt
Süresi 5/7/8/9/10/11 aylık planlar (eksik ay kontrolü)")`. Her süre için:

- `Contract.durationMonths` girilen değerle eşleşir;
- `totalContractAmount === durationMonths × aylık ücret` (tam, kuruş
  sapması yok);
- `installments.length === installmentCount` (istenen ay sayısı kadar
  taksit, ne eksik ne fazla);
- taksit toplamının sözleşme toplamına TAM eşit olduğu;
- yazdırılan HTML'de KULLANILMAYAN taksit numaralarına ait hiçbir
  placeholder veya boş satır kalıntısı KALMADIĞI (bkz.
  `CONTRACT_PRINT_DESIGN_REPORT.md` — bu turda ayrıca bulunan ve düzeltilen
  gerçek bir hata).

Sonuç: **6/6 test geçti** (5, 7, 8, 9, 10, 11 ay) — `npx vitest run
src/lib/__tests__/contracts.test.ts` → 73/73 test geçti (bu 6'sı dahil).

## 5. Sonuç

- Yapısal bir "süre kalıcı değil" sorunu YOKTU — bu iddia denetimle
  **doğrulanamadı**, tam tersi doğrulandı: `Contract.durationMonths` zaten
  tek, kalıcı, doğru doğruluk kaynağı.
- Kayıt formundaki seçim alanı bilinçli olarak bir ön-dolgu/yönlendirme
  kolaylığıdır, ikinci bir kalıcı alan DEĞİLDİR — bunu ikiye bölmek (Student
  üzerinde de bir `durationMonths` kolonu açmak) veri tutarsızlığı riski
  yaratacağından YAPILMADI.
- Gerçek hata (1-12 arası eksik ay seçenekleri) önceki turda düzeltilmişti,
  bu turda tekrar doğrulandı.
- Yeni bulunan gerçek hata (kullanılmayan taksit satırlarının PDF'de boş
  görünmesi) bu turda düzeltildi ve testle kanıtlandı — ayrıntı
  `CONTRACT_PRINT_DESIGN_REPORT.md`.

## 6. Kalan iş

Yok — bu madde tamamlandı ve doğrulandı.
