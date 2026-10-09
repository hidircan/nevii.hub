# MOBILE NETWORK BUDGET

> Ekran sınıfı başına ağ bütçesi: beklenen istek sayısı, payload yaklaşımı,
> cache/TTL davranışı, tazelik kuralı ve izlenecek metrik. Sayılar istisnasız
> üst sınır değil, regresyon eşiğidir — aşım preflight/test ile yakalanır.

## 1. Bütçe tablosu

| Sınıf | Beklenen istek | Payload | Cache/TTL | Tazelik kuralı | Metrik |
|---|---|---|---|---|---|
| Cold start (oturum + ev) | ≤10 GET | Program 21g pencereli; ilk sayfalar | Miss → ağ; yazılır | Canlı sayılar 60sn sunucu cache'li (öğrenci/veli etkilenmez) | `cost_metric` route=`/api/v1/students/:id/*`, invocation/cihaz/gün |
| Warm cached start (TTL içi) | ≤2 GET (erişim doğrulama + miss) | Yalnız stale/miss | Fresh → ağ YOK; erişim verisi her zaman ağ | Stale rozeti ("Son güncelleme") | Mobil cache `freshHits/reads` oranı |
| Dashboard (admin özet) | 1 GET | Sayılardan ibaret (<5KB hedef) | Sunucu 60sn tenant cache | Özet sayıları ≤60sn gecikebilir; "canlı" etiketi yok | `cached` bayrağı + durationMs p95 |
| Schedule (haftalık) | 1 GET/hafta | Hafta penceresi | schedule/15dk | Hafta değişimi = 1 istek; TTL içi dönüşte istek yok | route=`*/schedule` çağrı/oturum |
| List/search (kişiler, yoklama) | Debounce başına ≤1 | limit≤50 (kişiler), ≤8 (yoklama) | Cache-dışı (taze sonuç) | ≥2 karakter eşiği; terk edilen istek iptal edilir | Arama isteği/tuş oranı (hedef <0.2) |
| Detail (öğrenci/öğretmen/ders) | Ekran fan-out'u (≤9 admin, ≤6 öğretmen) | Program from/limit sınırlı | Öğrenci programı 15dk; diğerleri ağ | Focus/foreground TTL-bilinçli (2sn dedupe) | Fan-out istek sayısı/ekran |
| Pull-to-refresh | Fan-out × 1 (zorla) | Aynı | Zorla ağ (TTL atlanır) | Kullanıcı kontrolü; 1sn spam kilidi | Manuel refresh sıklığı |
| Push revalidation | Etkilenen scope'lar (1–3) | Sayfa başı | Zorla ağ (sunucu "değişti" dedi) | Yalnız ilgili scope; global temizlik yok | Push başına istek (hedef ≤3) |
| Offline → online recovery | Açık ekran kapsamı | Sayfa başı | Stale gösterilir + sessiz tazeleme | Bağlantı dönüşünde kontrollü revalidate; retry fırtınası yok | Retry sayısı/kurtarma (hedef ≤2/uç) |

## 2. Kurallar (değişmez)

1. **Erişim verisi her zaman ağdan:** çocuk listesi, portal erişimi, rol/tenant
   bilgisi cache'e güvenmez; foreground'da zorla doğrulanır.
2. **Kritik mutation offline kuyruğa alınmaz:** finans, yoklama, erişim değişimi,
   duyuru, silme talebi — yazma hatası ekranda görünür, sahte başarı yok.
3. **401/403/revoke/logout/switch → purge:** eski hassas veri asla gösterilmez.
4. **Arama:** 400ms debounce + min 2 karakter + terk-iptali.
5. **Program:** penceresiz çekiş yasak (preflight kuralı `mobile.schedule-window`).
6. **Otomatik tetikleyiciler:** yalnız `autoRefresh` (preflight kuralı
   `mobile.auto-refresh`); manuel kanallar `refresh` kullanır.
7. **Fotoğraf/dosya:** liste satırlarında fotoğraf çekilmez; dosya yalnız
   açık kullanıcı dokunuşuyla indirilir (metadata-önce).
8. **Sayılar:** düşük-kardinalite listeler (duyuru, görev, ödev) sayfalamasız
   kalabilir — ölçümle doğrulanır, büyürse sayfalama eklenir.

## 3. Regresyon eşikleri (alarm değil, test/preflight kapısı)

- Ev ekranı mount (warm): >2 ağ isteği → test/preflight hatası (gelecek:
  e2e sayaç).
- Tuş başına >0.2 arama isteği (7 gün ortalaması) → debounce/eşik regresyonu.
- `truncated=true` oranlı program yanıtları (7 gün) → pencere stratejisi gözden geçirilir.
- Sunucu cache hit oranı (dashboard/finans): <%50 (7 gün) → TTL/anahtar gözden geçirilir.

## 4. Ölçüm kaynakları

- Sunucu: `cost_metric` tek-satır JSON logları (Vercel log drain).
- Mobil: oturum-içi cache sayaçları (`getCacheStats`, `__DEV__` + UAT).
- Cron: `notifications.tick` audit meta (`upcomingCreated`, `remindersDuplicate`,
  `paymentPending`, `leavePending`, `*TenantErrors`).
