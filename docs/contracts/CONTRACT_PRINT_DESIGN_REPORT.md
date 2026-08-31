# Sözleşme PDF / Yazdırma Tasarımı — Profesyonel Kurumsal Görünüm

## DURUM: Tipografi/sayfa/tablo CSS UYGULANDI; sayfa numarası KISITLI (dürüstçe belgelendi, alt yapı kararı gerekli); görsel ekran görüntüsü doğrulaması ORTAM KISITI nedeniyle YAPILAMADI

## 1. Önceki durum (denetimle doğrulandı)

`src/app/sozlesme-yazdir/[contractId]/page.tsx` — tarayıcı `window.print()`
tabanlı, hiçbir PDF kütüphanesi (Puppeteer/react-pdf/pdfkit) kurulu değildi
(doğrulandı, `package.json`'da sıfır eşleşme). Önceki hâli: yalnızca
`@page { size: A4; margin: 16mm; }`, gövde Tailwind `prose prose-sm`
(varsayılan sans-serif, Times New Roman DEĞİL, 8pt DEĞİL), sayfa numarası
footer'ı HİÇ YOK, taksit/imza tablosu için özel CSS yok (tüm görünüm
şablonun ham `bodyHtml`'inden geliyordu).

## 2. Bu turda uygulanan CSS (A4/Times New Roman/8pt/tablo/imza)

`CONTRACT_PRINT_CSS` (`sozlesme-yazdir/[contractId]/page.tsx` içine
eklendi):

- **Yazı tipi**: `"Times New Roman", Times, "Liberation Serif", serif` —
  Türkçe karakterler (ş, ğ, ı, ö, ü, ç) standart Times New Roman ailesinde
  desteklenir, ek font yükleme gerekmez.
- **Boyut**: Ekranda 10.5pt (okunabilir önizleme), `@media print`
  içinde 8pt gövde — istenen "kompakt ama okunabilir" dengesini sağlar.
  Başlıklar (h1/h2/h3) orantılı küçültüldü.
- **Sayfa**: `@page { size: A4; margin: 16mm 14mm; }`.
- **Paragraf**: `text-align: justify`, `orphans/widows: 3` (tek satır
  kalan başlık/paragraf parçası engellenir).
- **Tablo**: `border-collapse`, tüm hücrelerde görünür `1pt solid #333`
  kenarlık, `thead` gri arka plan + kalın, tutar hücreleri sağa hizalı,
  `page-break-inside: avoid` (tablo/satır sayfa ortasında bölünmez).
- **İmza**: Mevcut şablon zaten 2 sütunlu (`KURUM` / `KURSİYER-VELİ`) ve
  ayrı tarih satırlı bir `<table>` kullanıyordu — yapı zaten sağlamdı,
  yalnızca kenarlık/boşluk/sayfa-bölünmeme CSS'i eklendi.

Bu kurallar TÜM tablo/imza bloklarına placeholder token'ından BAĞIMSIZ,
yapısal olarak uygulanır — hukuki metne DOKUNULMADI, yalnızca görsel
biçimlendirme eklendi.

## 3. Sayfa numarası ("Sayfa X / Y") — KISITLI, dürüstçe belgelendi

Görev talimatı açıkça izin veriyor: *"If exact total-pages support is
unavailable, do not fake it; implement a tested fallback and document it."*
Bu madde tam olarak o durumdadır:

- CSS Paged Media (`@page { @bottom-center: counter(page) " / "
  counter(pages) }`, `running()`/`element()`) HİÇBİR ana akım tarayıcının
  (Chrome, Edge, Firefox, Safari) `window.print()` motorunda
  DESTEKLENMEZ — bu, kütüphane eksikliği değil, tarayıcıların ortak
  sınırlamasıdır.
- Gerçek, güvenilir "Sayfa X / Y" metni yalnızca sunucu taraflı bir PDF
  motoruyla (ör. Puppeteer + headless Chromium) mümkündür. Bu, ~300MB'lık
  bir headless tarayıcı ikili dosyası eklemek, serverless (Vercel)
  ortamında soğuk başlatma/zaman aşımı/paket boyutu etkilerini
  değerlendirmek anlamına gelir — bu, tek bir görev turunda sessizce
  alınacak bir mühendislik kararı DEĞİL, ayrı bir altyapı onayı gerektirir.
- **Uygulanan dürüst geçici çözüm**: Tarayıcıların (Chrome/Edge) kendi
  yerleşik "Üstbilgiler ve altbilgiler" (Headers and footers) yazdırma
  seçeneği GERÇEK "1/3" biçiminde sayfa numarası ekler. Sayfa üzerinde
  (yazdırılmayan, `print:hidden`) bir Türkçe bilgi notu eklendi: bu
  seçeneği açık bırakmaları önerilir.
- Sahte bir sayaç (ör. JS ile "Sayfa 1 / 1" yazıp gerçek sayfa sayısını
  hesaplamadan basmak) KASITLI OLARAK YAPILMADI — bu, görevin "do not fake
  it" kısıtını ihlal ederdi.

**P1/altyapı kararı gerektiren madde**: Gerçek "Sayfa X / Y" footer'ı
istenirse, Puppeteer (veya benzeri headless render) tabanlı bir sunucu PDF
motoru kurulmalı — bu, ayrı bir görev/onay olarak roadmap'e işlendi.

## 4. Boş taksit satırı hatası — BULUNDU VE DÜZELTİLDİ

Taksit tablosu şablonda SABİT 12 satır olarak tasarlanmıştı (renderTemplate
`{{#each}}` desteklemiyor, bilinçli bir tasarım sınırı — bkz.
`documents/index.ts` üst yorum). 12'den kısa sürelerde (ör. 5 aylık)
kullanılmayan satırlar boş tarih + " TL" olarak GÖRÜNÜR KALIYORDU — bu,
Faz 3G'nin "boş, açıklanmamış satır" kabul kriterini AÇIKÇA ihlal ediyordu.

Düzeltme: yeni `stripUnusedInstallmentRows()` fonksiyonu
(`src/lib/documents/index.ts`), sözleşme oluşturulurken (`createContract`
→ `createDocumentInstance`) kullanılmayan `taksitN` satırlarını, render'dan
ÖNCE, placeholder token'ına göre HTML'den tamamen kaldırır. Şablon-yapısı
bağımsızdır (kolon sayısı/sırası değişse bile çalışır), yalnızca YENİ
oluşturulan belgeleri etkiler — geçmiş sözleşmelerin `renderedHtml`'i
DEĞİŞMEDEN kalır (immutable snapshot kuralı korunur).

**Test kanıtı**: `src/lib/__tests__/document-archive-faz2.test.ts`'e 4 yeni
birim testi + `contracts.test.ts`'teki 5/7/8/9/10/11 aylık uçtan uca
testler (bkz. `REGISTRATION_DURATION_DATA_FLOW_REPORT.md`) — hepsi
kullanılmayan satırların tamamen kaldırıldığını, kalan satır sayısının
tam olarak `installmentCount` kadar olduğunu doğruluyor.

## 5. Ödeme tablosu kolon uyuşmazlığı — BULGU, DÜZELTİLMEDİ (hukuki metin riski)

Aktif şablonun taksit tablosu kolonları: **HİZMET BEDELİ / Taksit / Tarih /
Tutar**. Kaynak `2026-2027-ogrenci-kayit-sozlesmesi-v1.md` (satır 49)
kolonları: **HİZMET BEDELİ / Taksit / Ödeme Şekli / Tarih / Tutar** —
aktif şablonda **"Ödeme Şekli" kolonu EKSİK**. Görev talimatındaki istenen
kolon seti (Taksit No/Dönem/Vade Tarihi/Ödeme Yöntemi/Tutar/Durum) ise
kaynak metinle TAM eşleşmiyor.

**Neden düzeltilmedi**: Bu tablo MADDE 4'ün (hukuki metin) parçasıdır.
Görev talimatı "do not silently alter legal text" ve "do not silently
activate a legal template" kısıtlarını AÇIKÇA koyuyor. Aktif şablonu bu
turda YERİNDE değiştirmek (kolon eklemek) bu kısıtları ihlal ederdi. Aynı
şekilde görev talimatının istediği kolon seti kaynak metinle birebir
uyuşmadığından, "hangi kolon seti doğru" sorusu da sahibi/hukuk onayı
gerektirir.

**Önerilen sonraki adım**: Mevcut güvenli "Yeni Taslak Sürüm Oluştur" akışı
(bu turda ayrıca sağlamlaştırıldı, bkz.
`TEMPLATE_EDITOR_AND_DOCX_WORKFLOW_REPORT.md`) kullanılarak, kaynağın
kendi "Ödeme Şekli" kolonunu ekleyen bir taslak oluşturulup sahibi/hukuk
onayına sunulmalı — bu görev turunda YAPILMADI (kapsam/risk nedeniyle
bilinçli olarak ertelendi), roadmap'e P1 olarak işlendi.

## 6. Görsel doğrulama — ORTAM KISITI

Görev talimatı, çeşitli senaryolar (reşit olmayan/yetişkin öğrenci, 3/5/11/12
aylık, kart/havale, ay sonu kayıt, uzun isimler) için "safe fixture
previews/PDFs" üretip GÖRSEL olarak incelenmesini istiyor. Bu, Playwright
ile tarayıcı ekran görüntüsü almayı gerektiriyordu:

- Playwright MCP aracı denendi — hem `chromium` hem `chrome` kanalı
  kuruluma çalıştı, ancak gerçek Google Chrome kurulumu `sudo` (root)
  yetkisi istiyor ve bu ortamda etkileşimli şifre girişi mümkün değil
  (`sudo: a terminal is required to read the password`). Bu bir kod/görev
  eksikliği değil, çalışma ortamının bir kısıtıdır.
- **Uygulanan alternatif doğrulama**: CSS/HTML yapısı doğrudan
  incelendi (kaynak dosya, gerçek aktif şablonun `bodyHtml`'i); asıl
  RİSKLİ mantık (boş satır kaldırma) gerçek birim ve uçtan uca testlerle
  kanıtlandı (§4); `tsc`/`eslint`/`next build` temiz.
- **Yapılamayan**: Times New Roman/8pt'nin GERÇEKTEN piksel-doğru
  göründüğü, tabloların sayfa sınırında gerçekten bozulmadığı, imza
  alanının gerçekten çakışmadığı — bunlar yalnızca gerçek bir tarayıcı
  render'ı ile kanıtlanabilir. Bu, dürüstçe **doğrulanmamış** olarak
  işaretleniyor; sahibinin/bir sonraki oturumun tarayıcıda birkaç örnek
  sözleşmeyi manuel yazdırma önizlemesinden geçirmesi önerilir.

## 7. KVKK/foto-video tek paket (Faz 3F)

Denetlendi: aktif şablon MADDE 19/20'de KVKK Aydınlatma Metni ve
Fotoğraf/Video Rıza Formu'nu BİLİNÇLİ OLARAK "işbu sözleşmeden ayrı bir
metin" olarak tanımlıyor (kaynağın kendi ifadesi) — bunlar ayrı `kvkk` ve
`parent_social_media_consent` şablon türleri olarak modelleniyor. Bu,
görevin "do not generate blank extra standalone KVKK/photo-video documents
in new flow" ve "retain historical standalone documents" kısıtlarıyla
UYUMLU — mevcut tasarım zaten doğru, değişiklik gerekmedi.

## 8. Sonuç özeti

| Alt madde | Durum |
|---|---|
| A4 / Times New Roman / 8pt CSS | Tamamlandı |
| Tablo kenarlık/hizalama CSS | Tamamlandı |
| İmza alanı CSS (yapı zaten sağlamdı) | Tamamlandı |
| Boş taksit satırı hatası | Tamamlandı, testle kanıtlandı |
| Sayfa numarası (gerçek "Sayfa X/Y") | Kısıtlı — tarayıcı native fallback uygulandı, gerçek çözüm için Puppeteer altyapı kararı gerekli (P1) |
| Ödeme tablosu "Ödeme Şekli" kolonu | Bulundu, hukuki metin riski nedeniyle YAPILMADI — taslak önerisi P1 |
| Görsel ekran görüntüsü doğrulaması | Ortam kısıtı (Chrome kurulamadı) — YAPILAMADI, alternatif test kanıtı sağlandı |
| KVKK/foto-video paketleme | Zaten doğru, değişiklik gerekmedi |
