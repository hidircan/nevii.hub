# Yeni Öğrenci Kayıt Formu — Hata Sonrası Veri Korunumu

## DURUM: ZATEN DOĞRU UYGULANMIŞ — bu tur mimari + test kanıtı ile yeniden doğrulandı, yeni alanlar aynı desene uyumlu eklendi

## 1. Mimari

`src/components/new-student-form.tsx`, P0-2 (2026-08-29) düzeltmesinden bu
yana `useActionState` kullanıyor:

- `actionAddStudent` (`src/lib/actions.ts`) normal kullanıcı hatalarında
  (eksik/geçersiz alan, iş kuralı ihlali — ör. seçilen öğretmen bulunamadı,
  ödeme tutarı uyuşmuyor) **asla throw etmez**, tipli `NewStudentFormState`
  (`{ fieldErrors, formError }`) döner.
- Form elemanları **uncontrolled**'dur (`value=`/`onChange` YOK,
  `defaultValue`/doğrudan `name` ile). React, `useActionState` bir hata
  state'i döndürdüğünde formu YENİDEN MONTE ETMEZ — DOM'daki girilmiş
  değerler (input/select/checkbox) fiziksel olarak KORUNUR, yalnızca hata
  mesajları yeniden render edilir.
- Genel hata özeti üstte `role="alert"` ile gösterilir, `useEffect` odağı
  otomatik oraya taşır (`summaryRef.current?.focus()`); alan bazlı hatalar
  ilgili alanın hemen altında.
- `isPending` ile submit butonu devre dışı bırakılır — çift tıklama çift
  kayıt OLUŞTURMAZ.

## 2. Bu turda eklenen/değiştirilen alanların uyumu

Bu paket kapsamında forma eklenen/taşınan alanlar (Öğrenci Türü kartı,
genişletilmiş Kayıt Süresi seçici, salt-okunur ödeme günü politika metni)
AYNI uncontrolled desene uyularak eklendi — hiçbiri `value`/`onChange`
kullanmıyor (denetlendi, yalnızca `<option value=...>` gibi statik JSX
value'ları var, form state'iyle ilgisi yok). Yani bu turun form
değişiklikleri, mevcut hata-sonrası-korunum davranışını BOZMADI.

## 3. Test kanıtı (mevcut, bu turda tekrar doğrulandı)

`src/lib/__tests__/write-scope-actions.test.ts`:

- `describe("actionAddStudent — P0-2 zarif doğrulama hatası davranışı (throw YOK)")`
  — geçersiz girdilerde `actionAddStudent`'ın throw ETMEDİĞİNİ,
  `fieldErrors`/`formError` döndürdüğünü doğrudan test ediyor.
- Sunucu iş-kuralı hataları (ör. "Seçilen öğretmen bulunamadı") için de
  aynı — `formError` string olarak döner, exception fırlatılmaz.

`src/lib/__tests__/create-student-catalog-instrument.test.ts` — zod alan
bazlı hataların (`fieldErrors`) kaybolmadığını ayrıca doğruluyor.

`STORE_MODE=json VERCEL=1 npx vitest run
src/lib/__tests__/write-scope-actions.test.ts
src/lib/__tests__/create-student-catalog-instrument.test.ts` → tüm testler
GEÇTİ (bu tur tekrar çalıştırıldı).

## 4. Doğrulanamayan kısım — tarayıcı gözlemi

Görev, "gerçek kullanıcı davranışını doğrula, yalnızca birim testle
yetinme" diyor. Bu tur bunu tarayıcıda (Playwright) canlı olarak
GÖZLEMLEMEYE çalıştı ama ortamda gerçek bir Chrome kurulamadı (`sudo`
gerektiriyor, etkileşimsiz ortamda mümkün değil — ayrıntı
`CONTRACT_PRINT_DESIGN_REPORT.md` §6). Mimari (uncontrolled input +
`useActionState`) React'in belgelenmiş, kanıtlanmış davranışı olduğundan
ve action seviyesinde throw-etmeme testle kanıtlandığından, davranışın
DOĞRU olduğuna dair yüksek güven var — ama piksel-seviyesinde "form gerçekten
boşalmıyor" gözlemi bu turda YAPILAMADI. Bu, dürüstçe açık bırakılan tek
nokta.

## 5. Reset politikası

Kod incelendi: form yalnızca (a) başarılı kayıt sonrası (sunucu yönlendirme
yapar, sayfa değişir) veya (b) kullanıcı sayfadan ayrılırsa sıfırlanıyor.
Açık bir "Formu Temizle" butonu bu formda YOK — görev metninde "may reset
ONLY when... user explicitly clicks Formu Temizle" ifadesi bir İZİN
(reset yalnızca bu durumlarda olabilir) olarak okunmalı, ZORUNLULUK olarak
değil; buton eklemek küçük bir P2 UX iyileştirmesi olarak roadmap'e not
edildi, bu turda P0 kapsamına dahil edilmedi (kritik değil — form zaten
hatada sıfırlanmıyor, ki asıl kritik gereksinim buydu).

## 6. Sonuç

Hata-sonrası veri korunumu zaten doğru uygulanmıştı; bu tur (a) mimariyi ve
mevcut testleri yeniden doğruladı, (b) yeni eklenen alanların aynı güvenli
deseni bozmadığını denetledi, (c) tarayıcı-seviyesi gözlemin ortam kısıtı
nedeniyle yapılamadığını açıkça belirtti.
