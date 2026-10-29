# İzole Test Hazırlığı — SaaS Billing (R1)

Tarih: 2026-10-26 · Branch: `feat/saas-billing-v1` · Durum: credentials
BEKLENİYOR — bu rehberdeki kurulum adımları credentials GELMEDEN yapılabilir.
`test.neviihub.com` production'a yönlendiği sürece KULLANILMAZ.
Production DB veya gerçek kurum üzerinde UAT YAPILMAZ.

## 1. İzole DB + Preview kurulum rehberi

1. Supabase'de YENİ proje aç (örn. `neviihub-billing-test`). Mevcut test
   veya production projesini kullanma.
2. Yeni projenin `DATABASE_URL` (pooled) + `DIRECT_URL` değerlerini al.
3. Vercel'de Preview ortamına (SADECE Preview, production DEĞİL) §2'deki
   env'leri gir. Vercel → Project → Settings → Environment Variables →
   Environment: Preview.
4. `feat/saas-billing-v1` dalından Preview deploy al (otomatik PR preview
   veya `vercel --target preview`). Production branch'e merge YOK.
5. Migration'ı SADECE izole DB'ye uygula (owner onayı + hedef doğrulamasıyla):
   `DATABASE_URL=<izole> npx prisma migrate deploy`. Önce `npx prisma migrate
   status` ile hedefi kanıtla; `test.neviihub.com`'a bakarak karar verme.
6. Preview URL'ini doğrula: URL Vercel deployment'ına ait olmalı, 307 ile
   production domain'e DÖNMEMELİ (`curl -sI <preview-url> | head`).
7. PayTR panelinde Bildirim URL olarak Preview callback adresini gir:
   `<preview>/api/v1/billing/callbacks/paytr`.
8. Cron KAPALI başlar: `vercel.json`'daki saas-collections satırı Preview'de
   çalışmaz (Vercel cron'ları yalnızca production deployment'ta etkinleşir).
   Job testi §4'teki manuel `curl` ile yapılır (secret header'lı).

## 2. Env değişkenleri ve ortam aidiyeti

| Değişken | Preview (izole test) | Production (CANLI — onay yok) |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | İzole Supabase projesi | ❌ girilmedi |
| `PAYTR_MERCHANT_ID/KEY/SALT` | PayTR TEST merchant bilgileri | ❌ girilmedi |
| `PAYTR_TEST_MODE` | `1` (varsayılan) | (kilit ayrıca gerekir) |
| `PAYTR_CAP_DIRECT/CARD_STORAGE/NON3D` | PayTR onayına göre `true` | onay + kilit gerekir |
| `SAAS_BILLING_PROVIDER` | `paytr` | karar bekleniyor |
| `SAAS_BILLING_LIVE_CHARGES` | `false` / tanımsız | ❌ `true` YAPILMADI (ayrı onay) |
| `BILLING_CRON_SECRET` | 32+ bayt rastgele (Preview'e özel) | ❌ girilmedi |
| `CRON_SECRET` | Vercel otomatik (prod cron için) | kullanılmıyor (deploy yok) |
| `SAAS_EMAIL_LIVE` | tanımsız/`false` (test koruması) | karar bekleniyor |
| `IYZICO_*` | alternatif; girilmedikçe kapalı | ❌ girilmedi |

Kural: Preview'de `PAYTR_TEST_MODE=0` veya prod URL ASLA girilmez.
Kod ayrıca kilitler: canlı çekim `SAAS_BILLING_LIVE_CHARGES=true` +
`VERCEL_ENV=production` ister (`liveChargeGate`, `providers.ts`).

## 3. PayTR'ye sorulacak yetki soruları

0. (ÖNKOŞUL) Merchant hesabımızın o anki modu nedir (test / canlı)?
   Sandbox koşularından önce panelden test modu TEYİT edilecek; env
   değişkenindeki ad kanıt sayılmaz. Test işlemleri panelde e-posta ile
   aranarak doğrulanacak (İşlem & Rapor > İşlemler).

1. Merchant hesabımızda Direkt API (`/odeme`) aktif mi? Değilse aktivasyon
   adımları neler?
2. Kart saklama (`store_card=1`, CAPI LIST) yetkisi aktif mi? `utoken`/
   `ctoken` dönüş koşulları neler?
3. Kayıtlı kartla Non3D tekrarlayan ödeme (`non_3d=1`, `recurring_payment=1`)
   yetkisi aktif mi? Limit/koşul var mı?
4. Test ortamında Bildirim URL'e gönderim nasıl tetiklenir? (Test kartları,
   simülasyon paneli var mı?)
5. `wait_callback` hangi durumlarda döner? Bildirim gecikme beklentisi nedir?
6. Durum sorgu (`/odeme/durum-sorgu`) test ortamında hangi alanları döner?
   (`total_amount`, `payment_amount` alan adları)
7. CAPI LIST yanıtındaki kart alanları (`ctoken`, `require_cvv` adları) nedir?
8. Test kartlarıyla ret/timeout/3D senaryoları nasıl simüle edilir?
   (Tablo: kart no → beklenen sonuç)
9. Bildirim imza formülü (`merchant_oid + salt + status + total_amount`)
   güncel mi? Değişiklik duyurusu kanalı nedir?
10. Durum-sorgu "bulunamadı" cevabı, o `merchant_oid` ile ücret
    ALINMADIĞININ garantisi midir? (Uzlaştırma varsayımımız buna dayanır;
    yazılı teyit isteniyor.)
11. `test_mode=1` istekleri fon hareketi yaratmaz ve mutabakata girmez,
    değil mi? Test işlemlerinin canlı raporlardan ayrımı nasıldır?

## 4. Test matrisi (izole Preview + PayTR test)

Job manuel tetikleme (cron yerine):
`curl -H "Authorization: Bearer $BILLING_CRON_SECRET" \
  "<preview>/api/v1/platform/jobs/saas-collections?dryRun=1&limit=5"`
Canlı çekim denemesi (`apply=1`) SADECE onaylı pencerede, limit=1 ile başlar.

| # | Senaryo | Adım | Beklenen |
|---|---|---|---|
| 1 | İlk ödeme (kart kaydı) | `/abonelik` → onaylar → PayTR sayfasında TEST kartı | Bildirim → active + paid-through; utoken/ctoken kayıtlı |
| 2 | Dönem yenileme (job) | Vade geçmiş test aboneliği + `apply=1&limit=1` | Tek çekim, dönem uzar, TEK attempt satırı |
| 3 | Paralel job | Aynı anda 2× `apply=1` | Biri charged, diğeri busy; TEK çekim (PayTR panelinden doğrula) |
| 4 | Kart reddi | Red veren test kartı (PayTR §3.8) | failed + past_due; erişim kısıtı (bayrak AÇIKSA) |
| 5 | Timeout | (Proxy ile yanıt geciktirme — bkz. §5) | uncertain; sorgu success → charged, yeni çekim YOK |
| 6 | Duplicate callback | Aynı bildirimi 2× POST et (imzalı) | İkincisi duplicate; tek hak |
| 7 | Sırasız callback | failure → sonra success (eski tarihli failure) | Geri döndürme yok (stale guard) |
| 8 | Yanlış tutar | Tutarı değiştirilmiş imzalı bildirim | Uygulanmaz (amount_mismatch), görünür failed |
| 9 | Kart yenileme (PayTR) | Checkout ile yeni kart + borç ödemesi | Yeni ctoken; non-retryable kapısı açılır |
| 10 | İptal | Dönem sonu iptal | canceled + paid-through korunur |
| 11 | Yeniden etkinleştirme | İptal sonrası checkout | pending (ödeme doğrulanmadan hak yok) |
| 12 | Manuel onay yarışı | Job çalışırken manuel onay | Tek dönem uzatması; çakışırsa CLASH_REVIEW |
| 13 | Dry-run | `apply` yok | attempt/subscription/e-posta değişmez |
| 14 | Yetkisiz job | Secretsiz `apply=1` | 401, işlem yok |
| 15 | Canlı kilit | `PAYTR_TEST_MODE=0` (izole) + `apply=1` | LIVE_LOCKED, çekim yok |

## 5. PayTR test ortamında simüle edilemeyen / belirsiz senaryolar

Aşağıdakiler mock ile KANITLANAMAZ; sandbox'ta doğrulanmadan
"test edildi" sayılmaz:

- Gerçek banka ret kodları ve `try_again` kombinasyonları (PayTR §3.8
  kart tablosu gelmeden bilinmiyor).
- `wait_callback` sonrası bildirimin GERÇEK gecikmesi ve banka tarafı
  bekleme davranışları.
- CAPI LIST yanıtının gerçek alan adları (kod savunmacı parse eder;
  `ctoken`/`require_cvv` adları sandbox'ta doğrulanacak).
- Durum sorgunun `total_amount` döndürüp döndürmediği (dönmezse tutar
  karşılaştırması atlanır — kod buna hazır).
- Ağ-seviyesi timeout'un PayTR tarafında ücrete dönüşüp dönüşmediği
  (uzlaştırma akışı bunu sorguyla kapatır, ama ilk kanıt sandbox'tan).
- 3D Secure banka ekranlarının yönlendirme süreleri (ok/fail URL
  zaman aşımları).

## 6. Yasaklar (bu fazda)

- `test.neviihub.com` kullanımı (prod redirect sürdükçe).
- Production DB'ye migration veya bağlantı.
- Gerçek kurum/kart ile deneme.
- `SAAS_BILLING_LIVE_CHARGES=true` veya `PAYTR_TEST_MODE=0` ile
  onaylı-olmayan çekim.
- Preview'e production secret girme.
- Cron'u etkinleştirme (deploy ile olur — deploy YOK).
