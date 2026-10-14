# MOBILE COST EFFICIENCY AUDIT

> **HEAD:** `116e08726869c8715b1a4b495370dec9a9b6d902` (`release/mobile-review`)
> **Tarih:** 2026-10-08 · **Kapsam:** `apps/mobile` (Expo) + `src/app/api/v1` + `src/lib/services` + storage + cron
> **İlke:** ölçüm tabanlı, hard-code limit varsayımı yok; güvenlik/RBAC/tenant izolasyonu asla gevşetilmez.

## 1. Yöntem

- Mobil API istemcisi (`apps/mobile/src/api/client.ts`), `useApiGet`, `useCachedApiGet`,
  cache anahtar/depo/invalidation, focus/foreground kancaları, push revalidation,
  arama ekranları ve fan-out ekranları dosya-satır seviyesinde okundu.
- Backend: 244 API route, `withApiHandler` merkezi sarmalayıcı, `admin-lists`,
  `student-ledgers`, `mobile-read`, `tools.ts` öğrenci okumaları, Supabase storage
  adaptörü, `workflows/tick` + `notifications/tick` cron yüzeyi incelendi.
- Her bulgu: tetikleyici (mount/focus/foreground/manual/push), çoğaltıcı riski,
  cache sınıfı/TTL, veri hassasiyeti, Vercel/Supabase etkisiyle tablolaştı.

## 2. Kritik bulgular (özet)

| # | Bulgu | Etki | Karar |
|---|-------|------|-------|
| F1 | `useCachedApiGet` TTL dolmamış olsa bile her mount'ta ağa çıkar (TTL yalnız rozet) | Her ekran açılışı N gereksiz GET | Mount'ta fresh-ise-atla |
| F2 | In-flight dedupe yok: aynı path'e eşzamanlı N istek (ev + zil + liste) | 2–3x çoğaltıcı | Path-bazlı in-flight birleştirme |
| F3 | Focus + foreground + mount aynı anda tetikleniyor (kısa aralık koruması yok) | 2–3x çoğaltıcı | Otomatik yenilemede 2 sn dedupe penceresi |
| F4 | Retry/backoff/timeout yok; hata anında kullanıcı spam'i fırtına yapar | Başarısızlıkta invocation artışı | Exp backoff+jitter, yalnız ağ/5xx, 4xx'te retry yok |
| F5 | Arama debounce yok (`kisiler`, `yoklama`): her tuş bir sunucu sorgusu | Tuş başına full-scan sorgu | 400 ms debounce + min 2 karakter eşiği |
| F6 | Ev ekranı 8 paralel GET; `schedule` penceresiz (tüm ders geçmişi) | En büyük mobil payload | Ev programı 7g–14g penceresi |
| F7 | Ders detayı tek ders için tüm programı çeker | Büyük payload | Cache + sunucu `limit` üst sınırı |
| F8 | `teachers` listesi sayfa başına skor hesaplar; dashboard her açılışta full-scan + tüm skorlar | Pahalı admin özetleri | Kısa TTL sunucu cache (tenant-scoped) |
| F9 | JSON API yanıtlarında `Cache-Control`/`Vary` yok | CDN yanlış-cache riski (şüphe) | Merkezi `private, no-store` + `Vary: Authorization` |
| F10 | Cron sweep'te tenant izolasyonu yok: bir tenant hatası tüm süpürmeyi durdurur | Kayıp bildirim + tekrar maliyeti | Tenant-bazlı try/catch + özet sayaçları |
| F11 | Maliyet metriği yok (invocation/süre/byte/cache-hit görünmez) | Ölçülemeyen kota | PII-safe örneklemeli metrik + preflight |

## 3. Ekran / endpoint matrisi

Legend — Çağrı anı: M=mount, F=focus, G=foreground, R=manuel refresh, P=push, D=deep-link.
Risk: H=yüksek, M=orta, L=düşük.

### 3.1 Öğrenci / Veli (student-scope)

| Ekran / endpoint | An | Çoğaltıcı riski | Cache/TTL | Hassasiyet | Vercel | Supabase | Risk | Çözüm |
|---|---|---|---|---|---|---|---|---|
| Ev: `GET /students/:id` (profil) | M+F+G+R+P | F2+F3: 8'li fan-out'un parçası | reference/60dk | PII (ad, iletişim) | invocation | readData taraması | M | F1+F2+F3 |
| Ev: `GET /students/:id/schedule` (penceresiz) | M+F+G+R+P | F6: tüm ders geçmişi, en büyük payload | schedule/15dk | PII (program) | invocation+bandwidth | full-scan | H | Pencere (bugün−7g → +14g) + F1+F2 |
| Ev: `GET /students/:id/homework` | M+F+G+R+P | F2: liste ekranıyla aynı path | homework/15dk | düşük | invocation | readData | M | F1+F2+F3 |
| Ev: `GET /students/:id/attendance-summary` | M+F+G+R+P | F3 | attendance/30dk | düşük | invocation | full-scan sayaç | M | F1+F3 |
| Ev: `GET /assessments/:id` (cache-dışı) | M+F+G+R | F3; cache yok | yok | PII (değerlendirme) | invocation | sorgu | M | F3 (2sn penceresi); cache-dışı kalır |
| Ev: `GET /notifications` (ilk sayfa) | M+F+G+R+P | F2: zil (`useUnreadNotificationCount`) + merkez aynı path | notifications/5dk | PII (bildirim) | invocation | sayfa sorgusu | H | F1+F2; evde ilk 3 gösterim korunur |
| Ev: `GET /makeup-ledger?limit=50` | M+F+G+R | F3 | makeup/15dk | düşük | invocation | sayfalı | L | F1+F3 |
| Ev: `GET /students/:id/balance` | M+F+G+R | F3 | payments/15dk | finansal | invocation | ledger aggregate | M | F1+F3 |
| Dersler: `schedule?from&to` (haftalık) | M+F+R | Hafta değişimi başına 1 (normal) | schedule/15dk | PII | invocation | aralıklı scan | L | F1 (TTL-atlama) |
| Ders detayı: `schedule` (penceresiz, tek ders için) | M | F7: tüm geçmiş tek kayıt için | schedule/15dk | PII | invocation+bandwidth | full-scan | H | Sunucu `limit` üst sınırı + F1 |
| Ödev/detay, Telafi, Ödemeler, Gelişim, Yoklama raporu | M+F+G+R | F3 (focus+foreground çift) | sınıfına göre | karışık | invocation | readData/sorgu | M | F1+F2+F3 |
| Bildirim merkezi (cursor sayfalı) | M+P+R | P: yalnız `notifications` scope (iyi) | ilk sayfa/5dk | PII | invocation | sayfalı | L | Mevcut hedefli yapı korunur |
| Çocuk seçimi (`my-children`) | M+R+D | Seçim değişiminde tüm ekranlar yeniden kurulur (doğru) | yok (erişim verisi) | erişim kritik | invocation | sorgu | L | Değişiklik yok; revoke yolu korunur |

### 3.2 Öğretmen

| Ekran / endpoint | An | Çoğaltıcı riski | Cache/TTL | Hassasiyet | Vercel | Supabase | Risk | Çözüm |
|---|---|---|---|---|---|---|---|---|
| Bugün, Ödevlerim, Öğrencilerim, İş takip | M+F+G+R | F3; çoğu cache-dışı `useApiGet` | yok | PII | invocation | sorgu | M | F3 (2sn penceresi) + F4 |
| Öğrenci araması (istemci filtresi) | tuş | Ağ yok (yerel filtre) — maliyet yok | — | — | — | — | L | Değişiklik yok |
| Materyal yükleme/görüntü | R | Dosya baytı proxy üzerinden | no-store (iyi) | PII (dosya) | bandwidth | storage egress | M | Metadata-önce deseni korunur; lazy-load |

### 3.3 Admin

| Ekran / endpoint | An | Çoğaltıcı riski | Cache/TTL | Hassasiyet | Vercel | Supabase | Risk | Çözüm |
|---|---|---|---|---|---|---|---|---|
| Özet: `GET /dashboard/summary` | M+R | F8: full-scan + tüm öğretmen skorları + görev/tahsilat listeleri | yok | dahili | function duration | çoklu sorgu | H | 60sn tenant-scoped sunucu cache |
| Kişiler: `GET /students?q&limit`, `/teachers?q&limit` | tuş+M | F5: tuş başına istek, skor hesaplı satırlar | yok | PII | invocation+duration | scan+skor | H | F4+F5 (debounce+min karakter) |
| Öğrenci detayı (9 paralel GET) | M | Fan-out 9; her biri readData taraması | yok | PII+finans | invocation x9 | 9x tarama | H | F2+F3; aggregate endpoint YOK (yetki alanları karışmasın) |
| Program (`lessons?from&to`, ≤62g) | M+R | Aralık sınırlı (iyi) | yok | PII | invocation | aralıklı | L | Değişiklik yok |
| Yoklama araması (`students?q&limit=8`) | tuş | F5: tuş başına | yok | PII | invocation | scan | M | F5 |
| Tahsilat/finans özeti, İş takip, Duyurular, Silme talepleri | M+R | Tekil istekler | yok | finansal/PII | invocation | sorgu | L | F9 header'ları + metrik |
| Öğretmen detayı/hakediş/geri-bildirim | M | 2–4 paralel | yok | PII+finans | invocation | sorgu | M | F2+F3 |

### 3.4 Backend / platform

| Alan | Mevcut durum | Risk | Çözüm |
|---|---|---|---|
| `GET /students`, `/teachers` (admin) | Bellek-içi filtre+sayfa (limit≤100); tüm veri okunur | M (JSON-store mimarisi gereği) | Davranış korunur; DB modunda index önerisi runbook'ta |
| `GET /makeup` (STUDENT) | Öğrenci başına `canAccessStudent` (erişim kontrolü — kaldırılmaz) | L | Değişiklik yok (güvenlik > mikro maliyet) |
| Dosya uçları (`*/file`, foto, makbuz) | `private, max-age=0, no-store` (doğru) | L | Korunur |
| Supabase storage | Sunucu proxy ile indirir (yetki kontrolü için); bayt Vercel'den geçer | M | Model korunur (imzalı URL = yetki yüzeyi değişimi, bu turda yok); runbook'ta izleme |
| Realtime | Mobilde socket aboneliği yok; push→hedefli revalidation (doğru) | L | Soket eklenmez |
| `workflows/tick` | `workflows:manage` izinli; harici cron yok (manuel/planlı çağrı) | L | Yanıt sözleşmesi korunur; özet sayaçları runbook'ta |
| `notifications/tick` (10dk GitHub cron) | `dedupeKey` ile idempotent (iyi); tenant hatası tüm koşuyu durdurur | M | F10: tenant izolasyonu + sayaçlar |
| Auth refresh | Tek in-flight refresh + epoch koruması (iyi) | L | Korunur; gereksiz çağrı yok |

## 4. Cache sınıfları ve TTL kararları

Mevcut TTL'ler korunur (veri tazeliği gereksinimine uygun); değişen, TTL'nin
**uygulanmasıdır** (fresh-ise-ağ-atlanır):

| Sınıf | TTL | Kapsam | Tazelik kuralı |
|---|---|---|---|
| notifications | 5 dk | kullanıcı | Push'ta force-refresh; evde ilk 3 + rozet |
| schedule | 15 dk | kullanıcı+persona+öğrenci+query | Ders hatırlatma push'unda force-refresh |
| homework | 15 dk | kullanıcı+persona+öğrenci | Ödev push'unda force-refresh |
| payments | 15 dk | kullanıcı+persona+öğrenci | Ödeme push'unda force-refresh |
| makeup | 15 dk | kullanıcı+persona+öğrenci | Telafi kararında manuel refresh |
| attendance | 30 dk | kullanıcı+persona+öğrenci | Ders push'unda force-refresh |
| reference | 60 dk | kullanıcı+persona+öğrenci | Profil/müfredat; manuel refresh |

Güvenlik değişmezleri (testlerle kilitli): 401/403 → kayıt silinir; logout/persona/
tenant/account switch → kullanıcı cache'i tamamen temizlenir; kritik mutation'lar
offline kuyruğa alınmaz; `checkout/token/session/password/photo/download/presign`
ve ödeme-akış path'leri asla cache'lenmez.

## 5. Uygulanan çözümlerin test durumu

- `apps/mobile/src/api/__tests__/request-policy.test.ts` — retry/timeout/debounce/eşik kararları.
- `apps/mobile/src/api/__tests__/client-dedupe.test.ts` — in-flight birleştirme + session sonu temizlik.
- `apps/mobile/src/cache/__tests__/cost-hardening.test.ts` — TTL-atlama, hedefli invalidation, purge.
- `src/lib/__tests__/server-cache.test.ts` — tenant-scoped TTL cache davranışı.
- `src/lib/__tests__/cost-metrics.test.ts` — PII-safe metrik şekli + örnekleme.
- `src/lib/__tests__/notification-sweep-isolation.test.ts` — tenant izolasyonu.
- `npm run preflight:cost-efficiency` — statik maliyet kuralları (CI'da).

## 6. Bilinen sınırlar (ölçüm sonrası karar)

- `readData` tabanlı tam-okuma deseni bu turda değiştirilmedi: JSON-store modunda
  mimari gereği; DB modunda Prisma index planı `VERCEL_SUPABASE_COST_RUNBOOK.md`'de.
- Tek-ders GET ucu açılmadı (yeni yetki yüzeyi); ders detayı cache + `limit` ile sınırlandı.
- Mega aggregate endpoint kurulmadı: persona/tenant yetki alanları karışmasın diye
  bilinçli olarak reddedildi.
- ETag/304 uygulanmadı: tüm mobil JSON `private, no-store`; koşullu istek kazancı,
  TTL-atlama varken marjinal + yanlış-cache riski taşır.
