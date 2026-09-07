# P0 UAT Raporu — PDF, Soğuk Route, Arama, Renk, Tooltip, Demo Login

**Tarih:** 2026-09-07/08 · **Branch:** `infra/vercel-test-environment`
**Ölçüm ortamı:** yerel production build (`next start`), `STORE_MODE=json`
(tek kullanımlık `/tmp/notaplan-data`), gerçek Chromium (Playwright).
**Test Supabase'e bu turda HİÇBİR yazma yapılmadı; ona hiç bağlanılmadı.**

---

## 1. PDF boş indirme — kök neden ve gerçek doğrulama

**Bulgu ilk olarak yanlış yerde arandı:** arayüzde bir "PDF" düğmesi YOK;
kullanıcının kastettiği akış `/sozlesme-yazdir/[contractId]` sayfasındaki
"Yazdır" → tarayıcının **PDF olarak kaydet**'i.

### Kanıtlanmış kök neden

Kullanıcı **koyu tema profilindeyken** (`data-theme-profile="obsidian"`),
baskı medyasında ölçülen hesaplanmış değerler:

| | Düzeltme öncesi | Düzeltme sonrası |
|---|---|---|
| Sözleşme yüzeyi zemini | `rgb(23, 23, 26)` (siyaha yakın) | `rgb(255, 255, 255)` |
| Başlık metni rengi | `rgba(245, 241, 232, .96)` (beyaza yakın) | `rgb(26, 26, 26)` |

Tarayıcıların yazdırma diyaloğunda **"arka plan grafikleri" varsayılan olarak
KAPALIDIR**: koyu zemin basılmaz, kağıt beyaz kalır — ama metin beyaz kalır.
**Beyaz kağıt üzerine beyaz metin = tamamen boş sayfa.**

### Ölçülen mürekkep oranı (beyaz kağıt üzerinde boyanan piksel yüzdesi)

| Durum | Mürekkep |
|---|---|
| Hata (koyu tema, gerçek baskı modellemesi) | **%0,39** — pratikte boş |
| Düzeltme sonrası | **%6,12** |

### Değişen dosyalar

- `src/lib/contract-print-theme.ts` (yeni) — baskı yüzeyinin **temadan
  bağımsız** paleti + sabitlenen değişken listesi.
- `src/app/sozlesme-yazdir/[contractId]/page.tsx` — yüzey tüm `--color-*`
  değişkenlerini bu palete SABİTLER (`color-scheme: light`), başlık/`th`
  renkleri açıkça verilir, `@media print` zemini beyaza zorlar, dış sarmalayıcı
  `print:bg-[var(--color-surface)]` → `print:bg-white`.

Düzeltme tek noktadadır: gömülü sözleşme HTML'indeki **bugünkü ve gelecekteki**
her `var(--color-*)` kullanımı otomatik olarak okunur bir renge çözülür.
Şablonun bilinçli gri tonları (#888/#555/#777) korunur. **Legal metne
DOKUNULMADI** — yalnız render/export hatası çözüldü.

### Gerçek PDF doğrulaması (Chromium, koyu tema)

```
zemin=rgb(255, 255, 255)  metin=rgb(26, 26, 26)
mürekkep=%6.12  PDF=445354 bayt  sayfa=6
PASS — sözleşme baskısı boş değil, koyu temada da okunur.
```

Beklenen sabitler baskı medyasında GERÇEKTEN boyanan DOM metninde doğrulandı:
"Öğrenci Kayıt Sözleşmesi", "KVKK", "Taksit".

**PDF'in İÇİNDEKİ metin ayrıştırılmadı** (dürüstlük notu): Chromium alt-küme
gömülü font kullandığı için metin hex-CMap'e kodlanır ve yeni bağımlılık
eklemeden güvenilir çıkarılamaz. Bunun yerine "boş sayfa" hatasını kesin
yakalayan iki ölçüt kullanıldı: **mürekkep oranı** + **baskı medyası DOM metni**.

### Regresyon koruması

- `src/lib/__tests__/contract-print-blank-pdf.test.ts` (8 test) — palet açık
  zemin/koyu metin, WCAG AA kontrast, tüm tema değişkenlerinin sabitlenmesi,
  `@media print` zorlaması. **Düzeltme geri alınarak 2 testin düştüğü
  kanıtlandı.**
- `scripts/verify-contract-print.mjs` — gerçek tarayıcı harness'ı (Playwright +
  çalışan sunucu ister, bu yüzden `npm test` kapsamında değildir). Kimlik
  bilgileri ortam değişkeniyle geçilir, dosyaya yazılmaz.

---

## 2. Soğuk/ılık route ölçümü — TÜM ekranlardaki ortak yavaşlık

### Kök neden: font yükü (tek ekran sorunu DEĞİL, ortak)

Boş cache ("gizli sekme") ölçümünde her panel route'u **7 font dosyası,
toplam 4.747 KB** indiriyordu. Aynı sayfada JS 179-198 KB, CSS 21 KB.

| Dosya | Boyut |
|---|---|
| `RobotoSerif_Italic_VariableFont…ttf` | **2.357 KB** |
| `RobotoSerif_VariableFont…ttf` | **1.954 KB** |
| `PlayfairDisplay_VariableFont…ttf` | 137 KB |
| `PlayfairDisplay_Italic…ttf` | 132 KB |
| 3 × woff2 (Inter / Noto Sans) | 35–84 KB |

İki ağır aile `next/font/local` ile **ham TTF variable font** olarak
yükleniyordu — subset yok, woff2 yok. Düzgün işlenen Inter/Noto Sans ise
`next/font/google` üzerinden 35–84 KB.

**Düzeltme:** Roboto Serif ve Playfair Display de `next/font/google`'a taşındı
(AYNI build-time self-host — çalışma zamanında Google'a istek YOK; ek olarak
latin alt kümesi + woff2). Kullanılmayan 8,1 MB TTF ikilisi repodan silindi.

### Ölçüm — boş cache, gerçek Chromium

| Route | Font ÖNCE | Font SONRA | Sayfa toplam ÖNCE | SONRA |
|---|---|---|---|---|
| Panel özet | 4.746 KB | **339 KB** | 4.979 KB | **572 KB** |
| Ders Programı | 4.746 KB | **339 KB** | 4.999 KB | **590 KB** |
| Öğrenciler | 4.746 KB | **339 KB** | 5.001 KB | **594 KB** |
| Öğretmenler | 4.746 KB | **339 KB** | 4.992 KB | **584 KB** |
| Müfredat | 4.746 KB | **339 KB** | 4.987 KB | **576 KB** |
| Yoklama Takvimi | 4.746 KB | **339 KB** | 4.990 KB | **582 KB** |

**Font yükü −%93, sayfa toplamı −%88.** Kullanıcının bildirdiği "3–4 saniye"
ile tutarlı: 4,4 MB fazladan yük, tipik bir bağlantıda saniyeler eder ve
her route'ta tekrarlanır.

### Sunucu tarafı (yerel, json store)

| Route | TTFB | Toplam | domInteractive | İstek |
|---|---|---|---|---|
| Panel özet | 11–29 ms | 61 ms | 43 ms | 61 |
| Ders Programı | 11–16 ms | 60 ms | 86 ms | 62 |
| Öğrenciler | 10–14 ms | 75 ms | 60 ms | 75 |
| Öğretmenler | 10–12 ms | 70 ms | 63 ms | 71 |
| Müfredat | 10–13 ms | 59 ms | 22 ms | 62 |
| Yoklama Takvimi | 10–14 ms | 60 ms | 24 ms | 60 |

**Yapısal bulgu:** altı panel route'unun HER BİRİ tam olarak **1 adet
tam-tenant `readScopedData()`** yapıyor. Panel layout'u (sidebar/başlık) ise
ucuz: `getInstitutionContext` + `getUserById`, paralel, tam veri okumuyor —
yani ortak layout bir darboğaz DEĞİL.

**db modundaki maliyet (bu turda ölçülmedi, önceki turun ölçümünden):**
`readData()` = 14–15 sorgu, ~67 ms @20 ms RTT, ~499 ms @163 ms RTT. Yani
mevcut preview bölgesinde route başına ~0,5 sn sunucu maliyeti eklenir.

**HEDEF DURUMU — dürüst değerlendirme:** cold P95 ≤ 2 sn / warm ≤ 1 sn hedefi
**DAĞITILMIŞ ORTAMDA DOĞRULANAMADI** (Deployment Protection, §7). Yerel
ölçümde tüm route'lar hedefin çok altında; font düzeltmesi ortama bağlı
olmayan 4,4 MB'lık kısmı kaldırır. Kalan iki değişken bölge gecikmesi ve
route başına 1 tam-tenant okumasıdır (§7).

---

## 3. Öğrenci araması

### Kök neden (ölçüldü)

Arama terimi YALNIZCA URL'de tutuluyordu (`searchParams.get("q")`) ve input
doğrudan ona bağlıydı. Her tuş `router.replace` → sayfa `force-dynamic` →
**sunucu RSC turu** → `readScopedData()` ile tenant'ın TÜM verisi. Ayrıca
input URL'den beslendiği için **yazılan karakter navigasyon bitene kadar
ekranda görünmüyordu**.

### Ölçüm (6 harflik "Zeynep" araması)

| | Önce | Sonra |
|---|---|---|
| Tuş başına input geri bildirimi | 30–34 ms | **4–20 ms** |
| `/panel/ogrenciler` isteği (toplam) | 12 | 6 |
| — bunun GERÇEK RSC turu | **6** | **1** |
| — ucuz prefetch | 6 | 5 |

Kalan tek RSC turu yazma bittikten 250 ms sonra tetiklenir; sonuçlar zaten
istemcide filtrelendiği için kullanıcı onu beklemez.

**Kabul:** input < 100 ms ✅ (en fazla 20 ms) · sonuç P95 ≤ 500 ms ✅ (istemci
içi filtre, sunucu turu yok) · eski sonucun yenisini ezmesi ✅ (yazarken
istek yok) · tenant izolasyonu ✅ (sunucu kapsamı değişmedi).

**İndeks:** gerekmedi — arama sunucuya hiç gitmiyor. Bu turda migration
oluşturulmadı/çalıştırılmadı.

---

## 4. Ders kartı statü rengi — gerçek tarayıcı doğrulaması

### Kök neden

`resolveLessonFinalStatus` (lesson-live-status.ts) **gelecekteki her ders için
koşulsuz `"planned"`** dönüyordu. Yöneticinin az önce işaretlediği statü
ekranda hiç görünmüyordu. Gerçek tarayıcıda üretildi: Geldi/İşlendi/Telafi
işaretli üç dersin kart arka planı da `#ffffff` kalıyordu.

### Çatışma ve çözümü

Dört mevcut test (`attendance-calendar-tools.test.ts`) **Yoklama Takvimi**'nin
gelecekteki günü nötr tutmasını BİLİNÇLİ olarak kilitliyor. Owner'ın UAT
talebi ise **Ders Programı kartı** hakkında. Paylaşılan semantiği bozmak
yerine karta özel `resolveLessonMarkedStatus` eklendi: insanın AÇIKÇA
işaretlediği bayraklar ve iptal her zaman gösterilir; yalnız ÇIKARIM yoluyla
gelen `status === "completed"` zamana bağlı kalır. Takvim davranışı
DEĞİŞMEDİ (dört test yeşil).

### Gerçek tarayıcı ölçümü (139×40 kart, TAM dolgu)

| Statü | Ölçülen arka plan | Metin | Beklenen |
|---|---|---|---|
| Geldi | `#15803d` | `#ffffff` | yeşil ✅ |
| İşlendi | `#b91c1c` | `#ffffff` | kırmızı ✅ |
| Telafi | `#ca8a04` | `#1c1503` | sarı ✅ |
| İptal | `#475569` | `#ffffff` | koyu gri ✅ |
| Planlandı | `#ffffff` | `#241c14` | nötr ✅ |

**Telafi sarısı bu turda İLK KEZ canlı doğrulandı** — önceki raporlarda
"canlı render edilemedi" olarak kalmıştı.

---

## 5. Tooltip takılı kalması

**Kök neden (kaynak okumasıyla):** hover kartının görünürlüğü saf CSS ile
sürülüyor ve kurallar arasında `group-focus-within:opacity-100` vardı.
`:focus-within` FARE ile gelen odağı da kapsar — kullanıcı bir ders kartına
tıkladığında kart (`role="button"`, `tabIndex=0`) odakta kalır, fare ayrılsa
bile tooltip görünür kalır.

**Düzeltme:** `group-focus-within` kaldırıldı; `group-hover` +
`group-focus-visible` (yalnız klavye) korundu — **klavye erişilebilirliği
bozulmadı**. Ayrıca kartta `Escape` klavye odağını bırakır.
Kapanma yolları: pointer leave, blur, Escape, route değişimi (unmount),
başka kartın hover'ı (aynı anda tek kart hover olabilir).

**DÜRÜSTLÜK NOTU:** takılı tooltip durumu bu turda gerçek tarayıcıda
**otomasyonla yeniden ÜRETİLEMEDİ** (hover kartı harness'ta güvenilir biçimde
hedeflenemedi; login rate-limit'i de denemeleri sınırladı). Düzeltme CSS
mekanizmasına ve kod okumasına dayanır. **10 saniyelik insan göz doğrulaması
önerilir.** Regresyon testi kaynak seviyesindedir.

---

## 6. Login'den demo kimlik bilgileri

**Bulunan:** `src/components/login-form.tsx` (`"use client"`) içinde 14 hesabın
e-postası ve **açık metin parolası** bir dizide duruyor, "Demo ile giriş"
düğmeleri olarak render ediliyordu. Client component olduğu için parolalar
ekranda gizlense bile **her ziyaretçiye giden JS paketinin içindeydi** —
koşullu gizleme bunu çözmezdi.

**Yapılan:** liste, tip, `onDemoSelect` ve demo bloğu TAMAMEN silindi;
e-posta/parola alanlarının ön-doldurulması kaldırıldı.

**Kanıt:**

| | Önce | Sonra |
|---|---|---|
| `login-form.tsx` içinde `password:` alanı | **16** | **0** |
| Derlenmiş `.next/static` içinde demo parola | (client component → paketteydi) | **bulunamadı** |
| `.next/static` içinde `niluferacar.com.tr` | — | **bulunamadı** |

`docs/testing/TEST_ACCOUNT_CATALOG.md` oluşturuldu: rol, güvenli hesap
etiketi, kullanım amacı, erişim prosedürü. **Parola/token İÇERMEZ** (doğrulandı).

---

## 7. Kalan production blocker'ları

| # | Blocker | Tip | Sahip |
|---|---|---|---|
| 1 | **`src/lib/auth/users.ts` kod içi yedek parolalar** (`process.env.AUTH_* \|\| "<sabit>"`). Sunucu tarafındadır (istemciye gitmez) ama preview/prod'da ilgili `AUTH_*` değişkenleri tanımlı DEĞİLSE bilinen varsayılanlar geçerli olur. Ayrıca eski demo parolaları git geçmişinde kalmıştır — ekrandan kaldırılmaları **rotasyon yerine geçmez**. | Güvenlik / ortam | Operatör |
| 2 | **Bölge uyuşmazlığı** (lambda `iad1` ↔ Supabase `ap-south-1`, ~163 ms). Route başına 1 tam-tenant okuması bu gecikmede ~0,5 sn eder. | Altyapı | Operatör |
| 3 | **Vercel Deployment Protection** — dağıtılmış build'de hiçbir otomatik doğrulama yapılamıyor; cold/warm route hedefleri dağıtımda ÖLÇÜLEMEDİ. | Altyapı | Operatör |
| 4 | Route başına 1 tam-tenant `readScopedData()` — sayfa bazlı dar okumalar ayrı sprint. | Kod (P1) | — |
| 5 | Tooltip düzeltmesinin canlı göz doğrulaması (§5). | Doğrulama | İnsan |
| 6 | Yoklama Takvimi, işaretli gelecek dersi hâlâ nötr gösteriyor (bilinçli, 4 testle kilitli). Ders Programı ile tutarlı olsun isteniyorsa **ayrı owner kararı** gerekir. | Ürün kararı | Owner |

---

## 8. Test veritabanı teyidi

- Test Supabase'e **hiçbir yazma yapılmadı**; bu turda ona hiç bağlanılmadı.
- Tüm ölçümler yerel production build + `STORE_MODE=json` + tek kullanımlık
  `/tmp/notaplan-data` üzerinde yapıldı.
- Yeni migration oluşturulmadı/çalıştırılmadı; seed/reset/cleanup
  çalıştırılmadı; fixture restore uygulanmadı.
- Gerçek test kullanıcılarıyla test DB'de veri değiştiren benchmark
  çalıştırılmadı.
- Deployment Protection kapatılmadı/bypass edilmedi; bölge değiştirilmedi;
  production'a hiçbir write/deploy yapılmadı.
- Raporda parola, çerez, JWT, `DATABASE_URL` veya API anahtarı YOK.

---

## 9. Çalıştırılan kapılar

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | ✅ temiz |
| `npm run lint` | ✅ **0 hata**, 24 eski uyarı |
| `npm test` | ✅ **2754 / 2754** (öncesi 2711; **+43 yeni test**) |
| `npx prisma validate` | ✅ geçerli |
| `npm run build` | ✅ temiz |
| PDF regresyon testi | ✅ 8 test (+ gerçek tarayıcı harness'ı PASS) |
| Font yükü bütçesi testi | ✅ 3 test |
| Arama yazma testi | ✅ 4 test |
| Statü/kart rengi testi | ✅ 12 test |
| Tooltip kapanma testi | ✅ 4 test |
| Login kimlik sızıntısı testi | ✅ 4 test |
