# Bağımsız Sözleşme Merkezi — Uygulama Raporu

## Önceki durum (doğrulandı)

`src/app/panel/ogrenciler/[studentId]/page.tsx` içinde `<section id="sozlesme">` — `ContractPanel` bileşeni öğrenci detay sayfasının ORTASINA gömülüydü, erişim yalnızca `#sozlesme` çapa-kaydırması ile sağlanıyordu. Ayrı bir URL/rota YOKTU.

## Yeni durum

**Yeni rota:** `src/app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx`

- Kendi `<PageHeader title="Sözleşme Merkezi">` H1'i ile başlar (odak/erişilebilirlik: sayfa üstünden başlar, App Router her navigasyonda viewport'u sıfırlar).
- Aynı `ContractPanel` bileşenini yeniden kullanır — paralel bir sözleşme UI'ı İCAT EDİLMEDİ.
- Aynı yetkilendirme deseni: `requireSessionContext()` → `getInstitutionContext(session)` → `readScopedData(kurum.scope)` — mevcut `/panel/*` konvansiyonuyla birebir.
- `KurumScopeNote` (merkez/çoklu-kurum salt-okunur uyarısı) korunur.
- `BackButton` ile öğrenci detayına geri dönüş sağlanır — erişim öğrenci detayından da devam eder (aşağıya bkz.).

**Öğrenci detay sayfası (`[studentId]/page.tsx`):** Eski gömülü `ContractPanel` kaldırıldı, yerine kompakt bir özet kartı ("Sözleşmeler ve Belgeler" — güncel sözleşme numarası/durumu + kayıt sayısı) ve "Sözleşme Merkezi'ne Git →" linki eklendi. Bu, hem "erişim öğrenci detayından devam eder" hem "yalnızca stilize bir çapa-kaydırması değil, gerçek bir sayfa" gereksinimlerini karşılar.

**Kayıt sonrası yönlendirme (`src/lib/actions.ts actionAddStudent`):**

```
isFormalContractDuration(intendedDurationMonths)
  ? redirect(`/panel/ogrenciler/${id}/sozlesmeler?yeniKayit=1&sure=${months}`)
  : redirect(`/panel/ogrenciler/${id}?yeniKayit=1&sure=${months}`)
```

- **Formal (3-12 ay):** doğrudan Sözleşme Merkezi'ne yönlendirilir, form otomatik açılır (`autoOpenInitial`), "Formal sözleşme oluşturulmaya hazır" mesajı gösterilir. Otomatik üretim/yazdırma YOKTUR — yalnızca form açılır, personel gözden geçirip "Oluştur"a basmalıdır.
- **Tanışma paketi (1-2 ay):** öğrenci detayında kalır, "Tanışma Paketi — Formal sözleşme gerekmiyor" mesajı gösterilir, formal sözleşme üretim CTA'sı GÖSTERİLMEZ (`RegistrationSuccessPanel` zaten bu ayrımı yapıyordu, yalnızca hedef URL güncellendi).

**`RegistrationSuccessPanel`:** "Sözleşmeyi Gözden Geçir ve Oluştur" / "Ödeme Planını Görüntüle" CTA'ları artık `#sozlesme` yerine gerçek `/panel/ogrenciler/{id}/sozlesmeler` rotasına `<Link>` ile gider (Next.js client-side navigasyon, sayfa üstünden başlar).

## Testler

`src/lib/__tests__/write-scope-actions.test.ts` içine eklenen iki test, Next.js `redirect()`'in `error.digest`'i üzerinden hedef URL'i doğrular:

- 3 aylık kayıt → digest `/sozlesmeler?yeniKayit=1&sure=3` içerir.
- 1 aylık kayıt → digest `/sozlesmeler` İÇERMEZ, öğrenci detayında kalır.

## Kapsam dışı bırakılanlar (bilinçli, P1 değil — mevcut davranış zaten yeterli)

- Şablon/draft/activate yönetim ekranı ("Sözleşme Şablonları") DEĞİŞTİRİLMEDİ — zaten bağımsız bir rota, bu görevin kapsamı öğrenci-özel sözleşme merkeziydi.
- Sözleşme geçmişi listesi, durum rozetleri, PDF önizleme/yazdırma/imzalı-tarama-yükleme aksiyonları `ContractPanel` içinde ZATEN mevcuttu (önceki oturum) — yeniden inşa EDİLMEDİ, yalnızca bağımsız bir rotaya taşındı.
