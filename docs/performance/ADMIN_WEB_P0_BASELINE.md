# Yönetici Paneli P0 Performans Taban Çizgisi (Yoklama Takvimi & Ders Programı)

**Tarih:** 2026-09-07 · **Branch:** `infra/vercel-test-environment` · **Ortam:** test
(Supabase `vxzewyiwfshobjizzetw`, `ap-south-1`), `STORE_MODE=db`.

Bu belge, owner UAT'sinde bildirilen "Yoklama Takvimi ve Ders Programı yavaş"
şikâyetinin **ölçülmüş** kök nedenlerini, yapılan düzeltmeleri ve düzeltme
sonrası ölçümleri kaydeder. Buradaki her sayı, bu turda gerçekten çalıştırılan
bir komuttan gelir; hiçbiri tahmin değildir.

---

## 1. Ölçüm yöntemi

Üç bağımsız katmanda ölçüldü — biri diğerinin bulgusunu doğrular:

| Katman | Araç | Ne ölçer |
|---|---|---|
| Sunucu içi (I/O) | `scripts/bench-admin-p0.ts` (bu turda eklendi, **salt okunur**) | DB ping, `readData()`, takvim tool'ları |
| HTTP | `curl -w %{time_total}` | RSC render'ı + API uç noktaları |
| Tarayıcı (uçtan uca) | Playwright (Chromium), gerçek oturum | "etkileşim → veri görünür", istek sayısı/süresi |

Tekrarlanabilir çalıştırma:

```bash
set -a && . ./.env.test && set +a
npx tsx scripts/bench-admin-p0.ts          # katman ölçümü (yazma YOK)
npm run build && PORT=3111 npm run start   # HTTP/tarayıcı ölçümü için
```

**Test verisi boyutu (test Supabase, `tenant_nilufer_acar`):**
83 öğrenci · 9 öğretmen · 37 ders · 13 ödeme · 19–20 yoklama kaydı.

**Ölçüm koşulu — dürüstlük notu:** ölçümler İzmir'deki bir geliştirici
makinesinden `ap-south-1` (Mumbai) Supabase pooler'ına yapıldı; ham DB
gidiş-dönüşü **~163 ms**. Vercel Preview'in bölgesi farklıysa mutlak süreler
farklı olur; **gidiş-dönüş SAYISI** (asıl kök neden) ortama bağlı değildir.
Bağlantı dizesi `connection_limit=1` taşır (pgbouncer önerisi), yani tek bir
Node süreci içinde tüm sorgular tek bağlantıda serileşir.

---

## 2. Taban çizgisi (düzeltme öncesi, HEAD `25a59c1`)

### 2.1 Sunucu içi katman

| Akış | n | min | med | p95 |
|---|---|---|---|---|
| DB ping (`SELECT 1`) | 5 | 162 | 163 | 1355 |
| `readData()` — tüm tenant | 5 | 831 | 834 | 1877 |
| `getAttendanceCalendarMonthTool` (tek ay) | 5 | 989 | 1030 | 1037 |
| **Takvim SERİ 10 ay (istemcinin yaptığı)** | 3 | **9960** | **9966** | **10018** |
| Takvim PARALEL 10 ay (karşılaştırma) | 3 | 2700 | 2745 | 2945 |
| Program sayfa verisi (`readData`) | 5 | 821 | 825 | 839 |

### 2.2 HTTP katmanı

| Uç nokta | 3 ölçüm |
|---|---|
| `GET /panel/yoklama?studentId=s2` (RSC) | 1.20 / 1.17 / 1.18 sn |
| `GET /api/v1/attendance-calendar/month` | 1.04 / 1.01 / 1.00 sn |
| **10 ay ardışık (istemci davranışı)** | **10.09 / 10.11 sn** |
| `GET /panel/program` (RSC) | 1.58 / 1.53 / 1.52 sn |

### 2.3 Tarayıcı (uçtan uca)

| Akış | Süre | Notlar |
|---|---|---|
| Yoklama Takvimi ilk giriş | **11 395 ms** | 10 × `/month` = 10 126 ms |
| Öğrenci değişimi — 100 ms'de geri bildirim | **YOK** (`aria-busy=false`) | eski öğrencinin takvimi ekranda kalıyor |
| Ders Programı ilk yükleme | 1 971 ms | RSC 1 920 ms |
| Statü değiştirme (Geldi) → yerleşme | **5 255 ms** | `POST /ops` 3 714 ms + `/month` 1 154 ms + `router.refresh()` |

---

## 3. Kanıtlanmış kök nedenler

### KN-1 — Takvim, dönemin aylarını ARDIŞIK olarak çekiyordu (baskın neden)
`attendance-calendar-panel.tsx` içindeki `loadMonths`, `for (const m of months)
await fetch(...)` ile güz dönemi için **10 ardışık HTTP isteği** yapıyordu.
Ölçüm: 10 × ~1.0 sn = **~10 sn**. Paralelleştirme bile ~2.7 sn'de kalıyordu,
çünkü KN-2 hâlâ geçerliydi.

### KN-2 — Her ay isteği tenant'ın TÜM verisini yeniden okuyordu
`getAttendanceCalendarMonthTool` her çağrıda `readData()` çağırıyor; db modunda
bu, `School` + **12 ilişkinin** (`lessons`, `attendances`, `payments`, …) tamamı
+ `Package` + `DiscountCampaign` demek. Ölçülen: **831 ms**. Tek bir öğrencinin
tek bir ayı için tüm okulun verisi 10 kez okunuyordu.

Ek olarak bu üç sorgu **birbirinden bağımsız** olmasına rağmen ardışık
`await` ediliyordu → gereksiz 2 ekstra gidiş-dönüş.

### KN-3 — Öğrenci değişiminde BAYAT VERİ gösteriliyordu, geri bildirim yoktu
`byMonth` state'i öğrenci değişiminde temizlenmiyordu ve iskelet yalnızca harita
tamamen boşken gösteriliyordu. Sonuç: **yeni öğrencinin adı altında önceki
öğrencinin yoklama takvimi** ~10 sn boyunca ekranda kalıyordu. Ayrıca
`router.push` bir transition içinde değildi → tıklamadan sonra 100 ms'de
hiçbir görsel değişiklik yoktu (ölçüldü: `aria-busy=false`).

### KN-4 — Her mutasyon İKİ tam RSC render'ı tetikliyordu
Server action'lar `revalidateAll()` çağırıyor (17 yol + `revalidatePath("/", "layout")`).
Next dokümanı: *"Server Functions: Updates the UI immediately (if viewing the
affected path)"* — yani action yanıtı zaten tazelenmiş RSC ağacını taşır.
İstemci ayrıca `router.refresh()` çağırıyordu → **ikinci** bir tam
`/panel/program` render'ı (`readScopedData` + `listInstrumentCatalogTool`,
ölçülen 1.5 sn).

### KN-5 — Ders taşımada iyimser (optimistic) UI yoktu
Kart, sunucu cevabı gelene kadar eski yerinde duruyordu; kullanıcı "sürükleme
çalışmadı" hissi alıyordu.

### KN-7 — Ders taşıma tenant verisini BEŞ KEZ okuyordu
`updateLessonScheduleTool`: (1) kapalı gün kontrolü için `readData()`,
(2) "önceki başlangıç" için `readData()`, (3+4) `store-db.updateLessonSchedule`
kendi içinde iki kez, (5) sonucu okumak için bir kez daha. db modunda her
okuma ~520 ms → tek bir sürükle-bırak **~2.6 sn**'yi yalnız tekrarlanan
okumaya harcıyordu. Ayrıca ders taşıma bildirimleri (öğretmen/öğrenci/
yönetici) kullanıcıyı BLOKLAYAN yolda **ardışık** gönderiliyordu.

### KN-6 — Statü değişimi tenant verisini İKİ KEZ okuyor
`setLessonOpsFlagTool` → `readData()`, ardından `switchLessonOpsFlagLive` →
tekrar `readData()`. Ölçülen `POST /ops`: **3 714 ms**.

### Kök neden OLMADIĞI kanıtlananlar (aranan ama bulunmayanlar)
- **Sidebar prefetch değil.** `Next-Router-Prefetch: 1` istekleri 2 ms /
  0 B dönüyor (20 paralel prefetch toplam 44 ms). İlk tarayıcı ölçümündeki
  yüksek istek sayısı prefetch'ti ama maliyeti ölçülebilir değil.
- **N+1 SQL sorgusu değil.** `readData()` tek `findFirst` + `include` kullanır;
  sorgu sayısı ay/öğrenci sayısıyla artmıyor. Sorun sorgu sayısı değil,
  **aynı büyük sorgunun tekrar tekrar çalıştırılmasıydı.**
- **Index eksikliği değil.** Bu tur hiçbir `EXPLAIN ANALYZE` kanıtı üretmedi;
  bu yüzden **hiçbir index/migration oluşturulmadı** (bkz. §7).

---

## 4. Yapılan düzeltmeler

| # | Kök neden | Düzeltme | Dosya |
|---|---|---|---|
| 1 | KN-1 | Dönemin tüm ayları **tek istekte**: `getAttendanceCalendarTermTool` + `GET /api/v1/attendance-calendar/term`. Tek ay uç noktası tekil tazeleme için KORUNDU. | `services/tools.ts`, `api/v1/attendance-calendar/term/route.ts`, `attendance-calendar-panel.tsx` |
| 2 | KN-2 | Ay hesabı `buildAttendanceCalendarMonth` saf yardımcısına çıkarıldı; dönem tool'u **tek** `readData()` + **tek** `listClosedDays()` ile 10 ayı üretir. | `services/tools.ts` |
| 3 | KN-2 | `readData()` içindeki 3 bağımsız sorgu `Promise.all` ile paralelleştirildi. | `store-db.ts` |
| 4 | KN-3 | Öğrenci/dönem/yıl değişiminde `byMonth` temizlenir → bayat veri yerine iskelet. | `attendance-calendar-panel.tsx` |
| 5 | KN-3 | Öğrenci seçimi `useTransition` içinde; `aria-busy` + "Öğrenci açılıyor…" anında görünür. | `student-attendance-picker.tsx` |
| 6 | KN-4/KN-5 | Ders taşıma/süre değiştirme **iyimser**; başarısızlıkta güvenli geri alma + Türkçe hata. Gereksiz `router.refresh()` kaldırıldı. | `program-studio.tsx` |
| 7 | KN-4 | `LessonOpsActions`: `onSettled` veren çağıran zaten tazelediği için `router.refresh()` atlanır. | `lesson-ops-actions.tsx` |
| 8 | KN-7 | Taşıma yolundaki 5 tam-tenant okuması **1**'e indi (yazma çağrısı zaten güncel `AppData` döndürüyordu). | `services/tools.ts` |
| 9 | KN-7 | ~~Ders taşıma bildirimlerini paralelleştir~~ **DENENDİ, GERİ ALINDI** — bkz. §7.9. | `lesson-notifications.ts` |
| 10 | — | Demo reset UI'dan kaldırıldı + sunucu tarafı fail-closed; `seedDatabase` FK silme sırası düzeltildi. | `panel/page.tsx`, `panel/kurulum/page.tsx`, `services/tools.ts`, `store-db.ts`, `config.ts` |

---

## 5. Düzeltme sonrası ölçümler

### 5.1 Sunucu içi katman

| Akış | Taban (med) | Final (med) | Değişim |
|---|---|---|---|
| DB ping | 163 | 174 | — (ağ tabanı) |
| `readData()` tüm tenant | 834 | **528** | −37 % |
| `getAttendanceCalendarMonthTool` (tek ay) | 1030 | **694** | −33 % |
| Takvim SERİ 10 ay (eski istemci yolu) | 9966 | 8712 | (artık kullanılmıyor) |
| **Takvim DÖNEM tek istek (10 ay)** | — | **693** (p95 1130) | **≈ 12.6× hızlı** |
| Program sayfa verisi | 825 | 810 | — |

### 5.2 HTTP katmanı

| Uç nokta | Taban | Final |
|---|---|---|
| `GET /panel/yoklama?studentId=s2` | 1.17 sn | **0.85 sn** |
| Takvim verisi (10 ay) | **10.09 sn** (10 istek) | **0.69 sn** (1 istek) |
| `GET /panel/program` | 1.53 sn | **1.20 sn** |

### 5.3 Tarayıcı (uçtan uca)

| Akış | Taban | Final | Hedef | Durum |
|---|---|---|---|---|
| Yoklama Takvimi ilk giriş (etkileşim→veri) | 11 395 ms | **1 603 ms** | — | ✅ 7.1× |
| Takvim verisi (10 ay) | 10 126 ms (10 istek) | **702 ms** (1 istek) | — | ✅ 14× |
| **Öğrenci değişimi → veri görünür** (n=5) | ≈ 11.3 sn¹ | med **1 553 ms** · **p95 1 565 ms** | p95 < 1500 ms | ⚠️ **65 ms üstünde** |
| Öğrenci seçiminde 100 ms geri bildirim | yok (`aria-busy=false`) | **`aria-busy=true` + "Öğrenci açılıyor…"** | < 100 ms | ✅ |
| Öğrenci değişiminde bayat veri | **eski öğrencinin takvimi görünüyordu** | iskelet | — | ✅ |
| Ders Programı ilk yükleme | 1 971 ms | **1 742 ms** | — | ✅ |
| **Ders taşıma — kartın görünür hareketi** | sunucu turunu bekliyordu | **80 ms** (iyimser) | anlık | ✅ |
| Ders taşıma — sunucu action'ının tamamlanması | 6 790 ms² | **5 100 ms**³ | p95 < 1000 ms | ⚠️ **hedefin üstünde** |
| Statü değiştirme → yerleşme | 5 255 ms | **2 721 ms** | p95 < 1000 ms | ⚠️ hedefin üstünde |
| Statü `POST /ops` | 3 714 ms | **2 365 ms** | — | ⚠️ |
| Statü butonunda anlık geri bildirim | var | **var** (120 ms'de `aria-pressed=true`) | anlık | ✅ |

¹ Öğrenci değişiminin TABAN değeri doğrudan ölçülemedi (taban ölçüm betiği,
bayat verinin ekranda kalması yüzünden yanlışlıkla erken "hazır" okuyordu —
bu, KN-3'ün kendisidir). Verilen değer, aynı iki bileşenin ÖLÇÜLEN
toplamıdır: 1 170 ms RSC gezinmesi + 10 126 ms ardışık takvim yükü. Aynı
bileşenlerin birlikte ölçüldüğü "ilk giriş" akışı **11 395 ms** verdi.

³ 4 474 ms'ye kadar inen bir ölçüm alındı ama o düzeltme (bildirim
paralelleştirmesi) veri kaybı riski yüzünden GERİ ALINDI — bkz. §7.9.
Raporlanan değer, ağaçta KALAN kodun değeridir.

² Ders taşımanın TABAN değeri, ilk düzeltme turundan sonraki ölçümdür
(6 790 ms); düzeltme öncesi uçtan uca ölçüm **8 029 ms**'ydi ama o
ölçümün ağ dökümü güvenilir çıkmadı (bkz. §6.1).

### 5.4 Kabul hedefleri karşısında durum

| Hedef | Sonuç |
|---|---|
| Öğrenci seçimi < 100 ms anlık geri bildirim | ✅ `aria-busy=true` + görünür metin, ilk 100 ms içinde |
| Takvim öğrenci değişimi P95 < 1.5 sn | ⚠️ **1 565 ms** — 65 ms üstünde (bkz. §7.6) |
| Ders sürükleme görünür biçimde anlık | ✅ kart 80 ms'de yeni yerinde; sunucu turu beklenmiyor |
| Taşıma/statü P95 < 1 sn | ❌ taşıma ~5 100 ms, statü 2 721 ms (bkz. §7.2/§7.3/§7.9) |
| Gereksiz tam sayfa/takvim reload yok | ✅ mutasyon başına 2 RSC render → 1; takvim 10 istek → 1 |
| Race condition yok | ✅ `shouldApplyMonthsResult` korunuyor + bayat veri temizleniyor |
| DB bağlantısı `STORE_MODE=db` altında | ✅ `/api/v1/ready` → `storeMode:db`, `database.reachable:true` |
| Tenant/RBAC izolasyonu bozulmadı | ✅ dönem uç noktası tek-ay ile AYNI `requireRole` + `assertStudentAccess` yolunu kullanır (test: `attendance-calendar-term-tool.test.ts`) |

---

## 6. Bilinen sınırlar (known limitations)

1. **Sürükle-bırak JESTİ otomatik ölçülemedi (§6.1).** Playwright (hem headless
   hem headed Chromium) bu ekrandaki native HTML5 DnD jestini tetiklemiyor;
   `mouse.down/move/up` ve `dragTo` denendi, ikisi de `onDrop`'a ulaşmadı.
   Ölçüm, jestten SONRAKİ akış (`onDragStart` → `onDrop` → `performMove` →
   server action → UI) için sentezlenmiş `DragEvent`'lerle yapıldı — yani
   üründeki gerçek React handler'ları çalıştı, yalnız tarayıcının jest
   simülasyonu atlandı. "Kart 80 ms'de hareket etti" ölçümü bu yolla alındı.
2. **Mutlak süreler bölgeye bağlı.** Mumbai pooler'ına ~163 ms ham gecikme
   var; Vercel Preview farklı bir bölgedeyse sayılar kayar. Gidiş-dönüş
   SAYISINDAKİ azalma (10→1, 2→1) ortamdan bağımsızdır.
3. **Mutasyon hedefleri (P95 < 1 sn) tutturulamadı.** Kalan maliyetin tamamı
   yazma yolunda HÂLÂ duran tam-tenant okumalarıdır (statüde 2×, taşımada
   store içinde 2×) + her mutasyondan sonra sayfanın RSC render'ı (~1.2 sn).
   Çözümü §7.2/§7.3'te; store sözleşmesini etkilediği için ayrı bir iştir.
5. **"Telafi" (sarı) kart dolgusu CANLI doğrulanamadı.** Test verisindeki tek
   iki telafi-işaretli ders Cts/Paz'a düşüyor ve yaz dönemi ızgarası o günleri
   tasarım gereği gizliyor. Eşleme birim testiyle (hesaplanarak) doğrulandı;
   Geldi/İşlendi/İptal/Planlandı canlı tarayıcıda hem açık hem koyu temada
   doğrulandı (bkz. §9).
4. Ölçümler tek bir `next start` sürecine karşı yapıldı; Vercel'in lambda
   başına ayrı bağlantı davranışı burada yok.

---

## 7. Önerilen, bu turda YAPILMAYAN işler (onay bekliyor)

1. **DB index / migration: YOK.** Bu turda hiçbir index ihtiyacı ölçümle
   kanıtlanmadı, bu yüzden **hiçbir migration oluşturulmadı**. Sorun sorgu
   planı değil, gidiş-dönüş sayısıydı. Gelecekte gerekirse önce
   `EXPLAIN ANALYZE` kanıtı üretilmeli.
2. **Ders taşıma (KN-7 kalanı)**: `store-db.updateLessonSchedule` kendi içinde
   hâlâ 2 tam-tenant okuması yapıyor (çakışma kontrolü + sonucu döndürmek).
   Sonuncusu, `StoreApi` sözleşmesi `AppData` döndürdüğü için var; sözleşme
   "yalnız güncellenen dersi döndür"e çevrilirse taşıma ~520 ms daha kısalır.
   Üç backend'i birden etkiler — ayrı iş.
3. **KN-6 (çift `readData`)**: `switchLessonOpsFlagLive`'a önceden okunmuş
   `AppData` geçirmek `POST /ops`'u ~500 ms kısaltır. Bu turda **bilinçli
   olarak yapılmadı**: `json`/`memory` backend'leri aynı okumayı bir KİLİT
   altında yapıyor (`persistLessonOpsUnderLock`) ve dışarıdan veri geçirmek
   mode parity sözleşmesini bozar. Doğru çözüm, tool'un tam `AppData` yerine
   dar bir sorgu (ders + öğrenci + ayarlar) kullanmasıdır — ayrı bir iş.
4. **`readData()`'nın kendisi hâlâ tüm tenant'ı okuyor** (~528 ms). Sayfa
   bazlı dar okumalar (ör. yalnız haftanın dersleri) en büyük kalan kazanç,
   ama tüm store sözleşmesini etkiler — ayrı sprint.
5. **`revalidateAll()` 17 yolu birden geçersiz kılıyor** (`revalidatePath("/", "layout")`
   dahil). Tüm sayfalar `force-dynamic` olduğu için sunucu maliyeti ölçülebilir
   değildi, ama istemci router cache'ini tamamen atıyor. Daraltılması önerilir.
7. **`StudentContract.studentId` FK'si cascade etmiyor ve `seedDatabase`'in
   silme listesinde yok** — sözleşmesi olan bir tenant'ta demo reset
   `Student` silmede takılır. Demo reset artık yalnız yerel geliştirmede
   çalıştığı için kullanıcı yolu değil; borç `seed-database-delete-order.test.ts`
   içinde açıkça kayıtlı.
9. **Bildirim yazımı paralelleştirilemiyor — önce kilit gerekiyor.**
   Ders taşımanın bloklayan yolunda üç ardışık bildirim gidiş-dönüşü var
   (öğretmen/öğrenci/yönetici). `Promise.allSettled` ile paralelleştirmek
   denendi ve ölçülen kazanç **~630 ms**'ydi (server action 5 100 → 4 474 ms),
   ancak **GERİ ALINDI**: `json`/`memory` modunda `createNotification`
   kilitsiz bir oku-değiştir-yaz'dır (`loadAll()` → `saveAll([...all, rec])`,
   `src/lib/notifications/index.ts:104`) ve eşzamanlı iki yazımdan biri
   SESSİZCE KAYBOLUYOR. `notification-center-v2.test.ts > "taşıma eski→yeni
   saat yazar"` bunu yakaladı — yani mevcut testler bu regresyonu tuttu.
   Ön koşul: bildirim dosyasına `store-json.ts`'teki gibi bir yazma kilidi.
   (Not: bu, bugün de var olan gizli bir hatadır — json modunda aynı anda
   iki istek bildirim yazarsa biri kaybolur.)
10. **`cancelLessonTool` aynı çoklu-okuma desenini taşıyor** (bu turda bildirilen
   akışlardan olmadığı için DOKUNULMADI). Aynı iki satırlık düzeltme geçerli.

---

## 8. Demo reset — ops prosedürü

"Demo verisini sıfırla" **test ve production kullanıcı arayüzünden kaldırıldı**
ve `resetDemoTool` yerel geliştirme dışında fail-closed (`FORBIDDEN`) döner
(bkz. `isLocalDevTooling()`, `src/lib/config.ts`). Test verisinin sıfırlanması
gerekiyorsa bu bir **ops prosedürüdür**: operatör onayıyla, hedef ortam açıkça
adlandırılarak, `scripts/preflight-test-*` akışı üzerinden yapılır. Uygulama
arayüzünden yapılamaz.

### React #441'in gerçek kök istisnası

Semptom: test ortamında butona basınca `Minified React error #441`. Bu kodun
metni: *"An error occurred in the Server Components render. The specific message
is omitted in production builds…"* — yani **gerçek hatayı gizleyen genel bir
sarmalayıcı**, hatanın kendisi değil.

Gerçek istisna, yerel ve tek kullanımlık bir PostgreSQL veritabanında
(test/production DB'ye DOKUNULMADAN) yeniden üretildi:

```
Invalid `prisma.attendance.deleteMany()` invocation in src/lib/store-db.ts:588
Foreign key constraint violated on the constraint: `MakeupRequest_attendanceId_fkey`
```

**Kök neden:** `seedDatabase`'in `prisma.$transaction([...])` listesi verilen
sırayla çalışır ve `Attendance`, ona **zorunlu** bir FK ile bağlı
`MakeupRequest`'ten ÖNCE siliniyordu. Boş bir tenant'ta fark edilmiyordu
(silinecek telafi kaydı yoktu); telafi verisi olan **her** tenant'ta —
yani test ortamında her zaman — patlıyordu.

**İkinci kat:** `resetDemoTool` hatayı düzgün bir `fail(...)` olarak dönüyor,
ama `actionResetDemo` bunu `assertOk` ile **throw**'a çeviriyor. Server
action'da yakalanmayan bir throw, istemciye ancak genel digest hatası olarak
ulaşır — kullanıcının gördüğü #441 buydu.

**Düzeltme:** silme sırası düzeltildi (`MakeupRequest` → `Attendance`) ve aynı
yerel probe'da iki ardışık reset artık `{ok:true}` dönüyor. Sıra, şemadan
türetilen bir testle korunuyor: `src/lib/__tests__/seed-database-delete-order.test.ts`.

### 7.6 Öğrenci değişiminde kalan 65 ms

Ölçülen 1 565 ms iki round trip'tir: **885 ms** `/panel/yoklama` RSC render'ı
(`readScopedData()` — 83 öğrenci + tüm dersler/ödemeler) + **670 ms** dönem
isteği (ayrı bir `readData()`). Aynı veri iki kez okunuyor.

Doğru çözüm, sunucu bileşeninin ilk dönem verisini `AttendanceCalendarPanel`'e
**prop olarak** geçmesi ve istemcinin ilk isteği hiç yapmaması (~1.05 sn).
Bu turda YAPILMADI, çünkü ucuz sürümü Tool Layer'ı atlamayı gerektiriyor
(`CLAUDE.md` §"Layered pipeline" — sayfa doğrudan store okuyup ay hesabı
yapamaz), tool'u sayfadan çağıran sürümü ise sayfanın TTFB'sini uzatıp
kazancın çoğunu geri veriyor. Kalıcı çözüm §7.4 ile birlikte (dar sayfa
okumaları) yapılmalı.

---

## 9. Renk doğrulaması (Faz 4)

TEK kaynak `ATTENDANCE_CALENDAR_COLORS` (`src/lib/attendance-calendar.ts`).
Ders Programı'ndaki ayrı Tailwind renk haritası (`bg-emerald-700` /
`bg-rose-700` / `bg-amber-400`) **kaldırıldı** — kart dolgusu artık takvim gün
kutusuyla aynı sözlükten, `lessonCardFillStyle()` üzerinden gelir.

| Statü | Dolgu | Metin | Kontrast | Canlı doğrulama (Chromium, açık + koyu tema) |
|---|---|---|---|---|
| Geldi | `#15803d` yeşil | beyaz | 5.01:1 | ✅ `rgb(21,128,61)` — haftalık ızgara |
| İşlendi | `#b91c1c` kırmızı | beyaz | 6.47:1 | ✅ `rgb(185,28,28)` — haftalık ızgara |
| Telafi | `#ca8a04` sarı | koyu `#1c1503` | 6.22:1 | ⚠️ birim testiyle doğrulandı; canlı render edilemedi (§6.5) |
| İptal | `#475569` koyu gri | beyaz | 7.58:1 | ✅ `rgb(71,85,105)` — haftalık ızgara |
| Planlandı | `var(--color-surface)` nötr | `var(--color-text)` | tema | ✅ tema yüzeyi, her iki temada |

- **Tam kart arka planı**: haftalık ızgara + gün görünümü kartlarının TAMAMI
  boyanır (rozet/nokta/şerit değil).
- **Erişilebilirlik korundu**: statü metni, `LessonStatusBadge` rozeti ve
  `aria-label` (`lessonAccessibleLabel`) değişmedi.
- **Kontrast artık hesaplanıyor**: `attendanceCalendarTextColor` sabit
  "sarıysa koyu" kuralı yerine ölçülen kontrastı kullanır. Bu, üç mevcut
  erişilebilirlik hatasını da düzeltti — `planned` (#93c5fd) üzerinde beyaz
  metin **1.81:1**, `open` (#e5e7eb) üzerinde **1.26:1**'di; gün numaraları
  pratikte görünmüyordu.
- **Ton değişikliği**: `attended` green-600→green-700, `processed`
  red-600→red-700. Statü→renk AİLESİ eşlemesi (owner kararı) DEĞİŞMEDİ;
  eski tonlar 10–13 px metinle AA'yı geçmiyordu (3.30:1 ve 4.41:1).
- **Koyu tema**: dolgular tema-bağımsız sabit tonlardır ve metin rengi
  hesaplandığı için `data-theme-profile="obsidian"` altında da aynı
  kontrastı verir — canlı doğrulandı.
- **Hover/dragging/selected**: hover `brightness(1.10)` (renk kimliğini
  bozmadan), sürüklenen kart `opacity-60` + odak halkası, seçili gün
  `ring-2`. Devre dışı kart `opacity-90` ile korunur.
- Test kapsamı: `attendance-calendar-colors.test.ts` (17 test — hesaplanan
  AA kontrolü dahil), `program-studio-filters.test.ts` (ekranlar arası
  eşleme + nötr fallback).

---

## 10. Test ortamında değişen veriler (şeffaflık)

Ölçümler gerçek UI üzerinden, gerçek admin oturumuyla yapıldı; bu nedenle
**test veritabanında birkaç satır değişti**. Migration/seed/cleanup veya
doğrudan SQL yazımı YAPILMADI — değişiklikler yalnızca uygulamanın kendi
akışlarından geçti:

- `l8` (Emir Çelik, 06.09.2026 13:00) → "Geldi" işaretlendi (statü ölçümü).
- Ders taşıma ölçümlerinde birkaç demo dersi saat olarak kaydırıldı:
  "Defne Şahin · Keman" ve "Lara Yıldız · Şan" dersleri ile `l13`.

Bunlar demo/test verisidir, production'a dokunulmamıştır.

---

## 11. Preview dağıtımı ve doğrulanamayanlar

- Commit: `4b99514593b868148ae3710fd3d0b50ab9b85d08` → `origin/test`.
- Vercel Preview: proje `neviihub` (`prj_hmg2Nu2GtPs0JrfEcllpeUIbWpIG`),
  deployment `dpl_6mk6zZjawdhwUwRReQRVMJvgeg2R`,
  alias `neviihub-git-test-hidircans-projects.vercel.app` / `test.neviihub.com`.
- **Production'a DOKUNULMADI**: production ayrı bir Vercel projesidir
  (`notaplan`, `target: production`) ve hâlâ `4ab2f3d` build'ini çalıştırıyor.
  Bu turda `main`'e commit/push yapılmadı.

### Doğrulanamayan: dağıtılmış `/api/v1/ready`

`test.neviihub.com/api/v1/ready` ve doğrudan deployment URL'si **302** ile
`vercel.com/sso-api`'ye yönleniyor — Vercel Deployment Protection hâlâ açık
(PROJECT_STATE'teki bilinen açık madde). Bu yüzden **dağıtılmış** build üzerinde
`ready=true / storeMode=db / database.reachable=true` teyidi YAPILAMADI.

Bu üçlü, AYNI commit'in yerel production build'inde (`npm run build && npm start`,
`.env.test` ile, gerçek test Supabase'ine karşı) doğrulandı:

```json
{"ok":true,"data":{"service":"notaplan","ready":true,"storeMode":"db",
 "database":{"configured":true,"reachable":true},...}}
```

Dağıtım üzerinde teyit için insan aksiyonu gerekiyor: Deployment Protection'ı
test projesinde kapatmak **veya** Protection Bypass for Automation token'ı
üretmek.

### Bölge uyuşmazlığı (yeni bulgu, insan kararı)

Preview lambda bölgesi **`iad1`** (Washington DC), test Supabase pooler'ı ise
**`ap-south-1`** (Mumbai). Aradaki gidiş-dönüş, yerel ölçüm ortamındaki
~163 ms'den belirgin biçimde YÜKSEK olacaktır ve bu rapordaki her sunucu
süresi buna oranla ölçeklenir. Bu turdaki düzeltmeler gidiş-dönüş SAYISINI
azalttığı için kazanç bölgeden bağımsızdır, ancak mutlak süreler preview'da
daha kötü olacaktır. Öneri: Vercel bölgesini veritabanına yaklaştırmak
(veya tersi) — ölçüm gerektirir, bu turda değiştirilmedi.
