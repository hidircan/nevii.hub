# P0 Mutasyon Performansı — Ders Taşıma & Statü Değiştirme

**Tarih:** 2026-09-07 · **Branch:** `infra/vercel-test-environment` ·
**Önceki tur:** `docs/performance/ADMIN_WEB_P0_BASELINE.md` (takvim/okuma yolu)

Bu belge, önceki turda **hedefin altında kalan** iki mutasyonun
(`ders taşıma` ~5.1 sn, `statü değiştirme` ~2.7 sn; hedef P95 < 1 sn)
kök nedenini store/repository düzeyinde ölçer ve düzeltir.

> **Test veritabanına bu turda HİÇBİR yazma yapılmadı.** Bütün mutasyon
> ölçümleri, bu tur oluşturulan **yerel tek kullanımlık** bir PostgreSQL
> veritabanında (`127.0.0.1:5432/notaplan_bench_p0`) yapıldı. Bkz. §6.

---

## 1. Ölçüm yöntemi

`scripts/bench-lesson-mutations.ts` (bu turda eklendi). İki şey ölçer:

1. **DB gidiş-dönüş SAYISI** — `pg` sürücüsünün `Client.prototype.query`'si
   sarmalanarak sayılır. Ortamdan bağımsız, tartışmasız metrik.
2. **Süre** — opsiyonel `BENCH_RTT_MS` ile her sorguya yapay gecikme
   eklenerek. Yerel DB'de RTT ~0.1 ms olduğu için gerçek dağıtımın
   davranışı ancak böyle modellenebilir.

Harness bir **guard** taşır: `DATABASE_URL` host'u `127.0.0.1`/`localhost`
DEĞİLSE veya veritabanı adı `bench`/`disposable` içermiyorsa **çalışmayı
reddeder** — test/production Supabase'e karşı çalıştırılamaz.

```bash
createdb notaplan_bench_p0
npx prisma db push --url 'postgresql://<user>@127.0.0.1:5432/notaplan_bench_p0'
STORE_MODE=db DATABASE_URL='postgresql://<user>@127.0.0.1:5432/notaplan_bench_p0' \
  BENCH_RTT_MS=163 npx tsx scripts/bench-lesson-mutations.ts
```

Karşılaştırma, `git worktree` ile `5688504` (önceki tur HEAD) checkout edilip
**aynı veritabanına, aynı harness'la** çalıştırılarak yapıldı.

### 1.1 Modelin doğrulanması (bu sayılar neden güvenilir)

Yapay RTT **163 ms** (önceki raporda ölçülen İzmir → Mumbai pooler gecikmesi)
ile çalıştırıldığında model, önceki turda GERÇEK tarayıcıda ölçülen değerleri
yeniden üretiyor:

| Akış | Önceki raporda GERÇEK ölçüm | Bu harness, RTT=163 ms simülasyonu |
|---|---|---|
| Ders taşıma (server action) | 5 100 ms | **5 233 ms** (med) |
| Statü `POST /ops` | 2 365 ms | **2 197 ms** (med) |
| `readData()` tam tenant | 528 ms | **499 ms** (med) |

Yani harness gerçeğin yerine geçmiyor; gerçeğe **kalibre edilmiş** durumda.

**Test verisi:** 78 öğrenci · 8 öğretmen · 20 ders (`createSeedData()` ile
tohumlanmış tek kullanımlık DB).

---

## 2. Mutation path audit (A)

### 2.1 Ders taşıma — call graph (düzeltme ÖNCESİ)

```
program-studio.tsx (iyimser UI, 80 ms)
  └─ actionUpdateLessonSchedule            (server action)
      ├─ updateLessonScheduleTool          (Tool Layer)
      │   ├─ readData()                    ← TAM TENANT · 14 sorgu   [kapalı gün + previousStartAt]
      │   └─ store.updateLessonSchedule
      │       ├─ readData()                ← TAM TENANT · 14 sorgu   [applyLessonScheduleUpdate]
      │       ├─ UPDATE Lesson             (BEGIN/UPDATE/COMMIT · 3)
      │       └─ readData()                ← TAM TENANT · 14 sorgu   [AppData sözleşmesi]
      ├─ notifyLessonRescheduled           ← 19 sorgu, TAMAMI ARDIŞIK (5 bildirim)
      └─ revalidateAll()                   ← 17 yol + revalidatePath("/", "layout")
```

**Ölçüm (düzeltme öncesi): 64 DB gidiş-dönüşü.** Dağılım kanıtlanmış SQL
dökümünden (harness `Client.query` log'u):

| Blok | Sorgu | Pay |
|---|---|---|
| `readData()` × 3 (tam tenant) | **42** | %66 |
| Yazma (`BEGIN`/`UPDATE Lesson`/`COMMIT`) | 3 | %5 |
| Bildirimler (5 bildirim × ~3 + 4 kullanıcı arama) | **19** | %30 |

### 2.2 Statü değiştirme — call graph (düzeltme ÖNCESİ)

```
lesson-ops-actions.tsx
  └─ POST /api/v1/lessons/[lessonId]/ops
      └─ setLessonOpsFlagTool
          ├─ readData()                    ← TAM TENANT · 14 sorgu  [ders + öğrenci + ayarlar + RBAC]
          ├─ listClosedDays()              ← 1 sorgu
          └─ store.switchLessonOpsFlagLive
              ├─ readData()                ← TAM TENANT · 14 sorgu  [switchLessonOpsFlag]
              ├─ UPDATE Lesson             (3)
              └─ readData()                ← TAM TENANT · 14 sorgu  [sonucu döndürmek için]
```

**Ölçüm (düzeltme öncesi): 46 DB gidiş-dönüşü** (statü gerçekten değişen
çağrıda; `alreadySet` dalında 29). **42'si (%91) tekrarlanan tam-tenant
okuması.**

### 2.3 Önceki raporun "5 tam-tenant okuması" bulgusunun doğrulanması

Önceki rapor (§KN-7) taşıma yolunda **5** tam okuma bildirmiş, sonra
"tool seviyesinde tek okumaya indi" demişti. Bu turda kaynak + ölçümle
doğrulandı: `5688504` HEAD'inde taşıma yolunda **3** tam okuma kalmıştı
(tool 1 + store 2), statüde de **3**. Yani önceki turun 5→3 indirimi
gerçekleşmiş; kalan 3'ü bu tur kaldırılıyor. Kanıt:
`src/lib/services/tools.ts:4881` (tool okuması), `src/lib/store-db.ts:1913`
ve `:1932` (store okumaları) — hepsi `5688504` satır numaralarıdır
(`git show 5688504:<dosya>` ile doğrulandı).

### 2.4 Revalidation ve side-effect

| Kalem | Öncesi | Sonrası |
|---|---|---|
| `revalidatePath` çağrısı (taşıma/iptal) | 17 + `("/", "layout")` | **9**, layout genelinde geçersizleme YOK |
| `router.refresh()` (istemci) | önceki turda kaldırılmıştı | yok (değişmedi) |
| Bildirim (taşıma) | 5 bildirim · 19 sorgu · ardışık | **değişmedi** (bkz. §5.1 — onay bekliyor) |
| Bildirim (statü) | yok (yalnız "İşlendi" dalında ödev/risk kontrolü) | değişmedi |

**UI iyimser davranışı başarı kriteri sayılmadı** — aşağıdaki tüm sayılar
sunucu tarafı mutasyon süresidir.

---

## 3. Yapılan dar-okuma / dar-yazma düzeltmeleri (B)

| # | Değişiklik | Dosya |
|---|---|---|
| 1 | **Dar dilim sözleşmesi**: tek ders mutasyonu için gereken en küçük `AppData` dilimi TEK yerde tanımlandı (`narrowLessonScope`/`mergeLessonScope`). | `src/lib/lesson-scope.ts` (yeni) |
| 2 | **db**: `readLessonScope()` — aynı dilimi FİLTRELENMİŞ Prisma `include`'larıyla üretir; kullanılmayan 3 ilişki + 2 tenant-çapı koleksiyon hiç sorgulanmaz. `mapSchoolToAppData` aynen yeniden kullanılır. | `src/lib/store-db.ts` |
| 3 | `updateLessonSchedule` artık **tam `AppData` DEĞİL** `{ lesson, previousStartAt }` döner (`LessonScheduleUpdateOutcome`). Yazma sonrası tam okuma KALKTI. | `store-db/json/memory`, `lesson-update.ts`, `store.ts` |
| 4 | Doğrulama hatası artık **fırlatmaz**, sonuç nesnesinde döner → tool `VALIDATION_ERROR` üretir (eskiden store `throw` edip tool `INTERNAL_ERROR`'a çeviriyordu). | `lesson-update.ts`, `tools.ts` |
| 5 | **Kapalı gün kuralı** tool'dan saf fonksiyona taşındı (`applyLessonScheduleUpdate`, kod `CLOSED_DAY`). Tool'un tam-tenant ön okuması TAMAMEN kalktı; kural artık store'a giren HER yolda uygulanır (önceden yalnız tek çağıranı korurdu). | `lesson-update.ts`, `tools.ts` |
| 6 | `persistLessonOpsResult` sonundaki tam `readData()` kaldırıldı — saf sonuç zaten DB'ye yazdığımız değerdir. | `store-db.ts` |
| 7 | `applyLessonOpsFlagLive`/`switchLessonOpsFlagLive` dar dilim okur. | `store-db.ts` |
| 8 | `setLessonOpsFlagTool` ön kontrolleri dar dilimle yapar. | `tools.ts` |
| 9 | **Mode parity**: `json`/`memory` de saf kuralları AYNI dar dilimle çalıştırır ve sonucu bütüne birleştirir — dilim yetersiz kalırsa json modunda koşan testler bunu YAKALAR. | `store-json.ts`, `store-memory.ts` |
| 10 | **json `updateLessonSchedule` artık kilit altında** (`mutateStoreUnderLock`). Eskiden `readData()`+`writeData()` kilitsizdi; eşzamanlı iki taşımadan biri sessizce kaybolabiliyordu (db modunda iyimser `updateMany` WHERE'i zaten koruyordu — parite açığıydı). | `store-json.ts` |
| 11 | **Bildirim dosyası yazımları kilit + atomik yazım altına alındı** — gerçek, bugün de var olan veri kaybı hatası. Bkz. §5.1. | `src/lib/notifications/index.ts` |
| 12 | **Dar revalidation**: ders mutasyonları 17 yol + kök layout yerine 9 ilgili yolu tazeler. | `src/lib/actions.ts` |
| 13 | Tenant kapsamı düzeltmesi: `persistLessonOpsResult` içindeki bir `prisma.lesson.findFirst` **`tenantId` filtresi taşımıyordu** — eklendi. | `src/lib/store-db.ts` |

`as any`, optional-chaining ile susturma, sessiz fallback veya tenant scope
bypass KULLANILMADI. `npx tsc --noEmit` temiz.

### 3.1 Dilimin tanımı (tek kaynak: `src/lib/lesson-scope.ts`)

| Koleksiyon | Dilime giren |
|---|---|
| `settings` | tam (şubeler dahil) |
| `teachers` | yalnız dersin öğretmeni |
| `rooms` | yalnız dersin odası |
| `students` | yalnız dersin öğrencisi |
| `lessons` | ders ∪ öğrencinin TÜM dersleri ∪ aynı öğretmen/odanın hedef gün(ler) ±1 gün penceresi |
| `attendances` | yalnız bu dersin |
| `makeupRequests` | yalnız bu öğrencinin (telafi kotası) |
| `payments` | yalnız bu derse bağlı |
| `lessonSeries`, `teacherFeeRules`, `teacherPayouts`, `packages`, `discountCampaigns` | **boş** — bu iki yolda hiç okunmuyor |

Öğrencinin TÜM dersleri gerekiyor çünkü telafi kotası
(`getStudentMakeupQuota` → `periodKeyForLesson`) her telafi talebinin
**kaynak dersini** çözmek zorunda.

---

## 4. Sonuçlar (E)

### 4.1 DB gidiş-dönüş sayısı (ortamdan bağımsız)

| Akış | Öncesi | Sonrası | Değişim |
|---|---|---|---|
| **Ders taşıma** | **64** | **32** | −%50 |
| — bunun tam-tenant okuması | 42 | **0** | −42 |
| — bunun bildirimi | 19 | 19 | değişmedi |
| **Statü değiştirme** | **46** | **25** | −%46 |
| — bunun tam-tenant okuması | 42 | **0** | −42 |
| `readData()` (karşılaştırma) | 14–15 | 14–15 | dokunulmadı |

### 4.2 Süre — yapay RTT ile (med / p95, ms)

| RTT | Akış | Öncesi | Sonrası | Hedef | Durum |
|---|---|---|---|---|---|
| **20 ms** | Ders taşıma | 714 / 913 | **575 / 578** | p95 < 1000 | ✅ |
| 20 ms | Statü değiştirme | 302 / 321 | **235 / 261** | p95 < 1000 | ✅ |
| **30 ms** | Ders taşıma | 1 019 / 1 034 | **823 / 829** | p95 < 1000 | ✅ |
| 30 ms | Statü değiştirme | 441 / 467 | **335 / 372** | p95 < 1000 | ✅ |
| **40 ms** | Ders taşıma | 1 335 / 1 344 | **1 090 / 1 104** | p95 < 1000 | ❌ |
| 40 ms | Statü değiştirme | 559 / 605 | **450 / 475** | p95 < 1000 | ✅ |
| **163 ms** (mevcut preview) | Ders taşıma | 5 233 / 6 295 | **4 159 / 4 164** | p95 < 1000 | ❌ |
| 163 ms | Statü değiştirme | 2 197 / 2 383 | **1 677 / 1 839** | p95 < 1000 | ❌ |

### 4.3 Kabul kriterleri karşısında dürüst durum

| Akış | Hedef | Sonuç |
|---|---|---|
| Ders taşıma UI geri bildirimi | Anlık, sunucu beklemeden | ✅ değişmedi (önceki turda 80 ms ölçüldü, iyimser yol korunuyor) |
| Ders taşıma server completion | P95 < 1 sn | ✅ RTT ≤ ~35 ms · ❌ RTT 163 ms (4.16 sn) |
| Statü update server completion | P95 < 1 sn | ✅ RTT ≤ ~80 ms · ❌ RTT 163 ms (1.84 sn) |
| Başarısız mutasyon | UI rollback + anlamlı hata | ✅ iyimser geri alma korunuyor; hata artık `VALIDATION_ERROR` + Türkçe mesaj (eskiden `INTERNAL_ERROR`) |
| Büyük tenant AppData okuma | Kritik mutasyon path'te YOK | ✅ ikisinde de **sıfır** |
| Geniş route refresh | Gereksiz yok | ✅ 17 yol + kök layout → 9 yol |
| Tenant/RBAC | Korunmuş | ✅ (§7) |
| Test DB write | Bu turda yok | ✅ (§6) |

**Bu bir PASS DEĞİL.** Kod tarafındaki tekrarlanan okuma tamamen bitti, ama
mevcut preview ortamının **163 ms DB gecikmesinde** hedef tutmuyor. Kalan
darboğazlar ve önerilen dar çözümler §5'te.

---

## 5. Kalan darboğazlar ve bir sonraki dar çözüm

### 5.1 (P0) Bildirimler — taşımanın kalan maliyetinin %75'i

`notifyLessonRescheduled` bloklayan yolda **19 ardışık** gidiş-dönüş yapar
(öğretmen kullanıcı araması + öğrenci/veli aramaları + her bildirim için
tercih kontrolü, dedupe okuması ve INSERT). RTT 163 ms'de ≈ **3.1 sn** —
taşımanın 4.16 sn'sinin baskın kalemi.

**Ön koşul BU TURDA KAPATILDI:** `createNotification` (ve `markNotificationRead`,
`clearNotifications`) json/memory yolunda **kilitsiz oku-değiştir-yaz**'dı;
eşzamanlı yazımdan biri sessizce kayboluyordu. Bu, önceki turda
paralelleştirmenin geri alınma sebebiydi (`ADMIN_WEB_P0_BASELINE.md` §7.9).
Artık `withFileLock` + `writeJsonFileAtomic` altında. Yeni test
(`notifications.test.ts > "aynı anda yazılan bildirimlerin HİÇBİRİ
kaybolmaz"`) kilit KALDIRILARAK doğrulandı: kilitsiz hâlde 12 eşzamanlı
yazımdan **11'i kayboluyor** (`expected 1 to be 12`), kilitle 12/12 kalıyor.

**Paralelleştirme BU TURDA UYGULANMADI** — talimat "kanıt ve onay olmadan
paralel yazma ekleme" diyor. Kanıt yukarıda; **onay bekliyor.** Beklenen
kazanç, önceki turda ölçülen ~630 ms'nin ötesinde: üç bağımsız hedefin
paralelleştirilmesi 19 ardışık turu ~7'ye indirir → RTT 163 ms'de taşıma
≈ **2.2 sn**, RTT 20 ms'de ≈ **340 ms**.

**Alternatif (daha büyük kazanç, daha büyük karar):** bildirimleri
mutasyonun bloklayan yolundan tamamen çıkarmak. Serverless'ta
"fire-and-forget" veri kaybı riskidir (lambda yanıt sonrası dondurulur);
güvenli biçimi kalıcı bir kuyruk/outbox satırı + mevcut workflow tick'inin
tüketmesidir. Bu, şema değişikliği gerektirir — ayrı iş, ayrı onay.

### 5.2 (P0, kod dışı) Bölge uyuşmazlığı

Preview lambda `iad1` (Washington DC), test Supabase pooler `ap-south-1`
(Mumbai) → ölçülen ~163 ms. §4.2'deki tabloya göre **aynı bölgede (≤ 30 ms)
her iki hedef de bugünkü kodla TUTUYOR.** Bölgeleri hizalamak, bu turda
yapılan hiçbir kod değişikliğinden daha büyük etkiye sahip. İnsan kararı.

### 5.3 (P1) Statü yolunda dilim İKİ kez okunuyor

`setLessonOpsFlagTool` ön kontroller için bir dar dilim okur, ardından
`switchLessonOpsFlagLive` kendi dilimini okur (json/memory'de yazma
kilidinin ALTINDA okumak zorunda — atomiklik). Toplam 25 sorgunun ~20'si bu.
Dar çözüm: tool'un ihtiyacı yalnız `lesson + student + settings` (3 sorgu);
ayrı ve daha dar bir store metodu bu yolu ~25'ten ~18 sorguya indirir.
Bu turda YAPILMADI — kazanç (RTT 163'te ~300 ms) yeni bir StoreApi metodunu
üç backend'e eklemenin maliyetini şu an haklı çıkarmıyor; §5.1/§5.2
çözülmeden hedefi zaten tutturmuyor.

### 5.4 (P1) `readData()` hâlâ tam tenant okuyor — sayfa render'ı

Mutasyon yolunda artık hiç kullanılmıyor, ama `revalidatePath` sonrası
sayfanın RSC render'ı hâlâ `readScopedData()` ile tüm tenant'ı okur
(ölçüm: 499 ms @163 ms RTT). Kullanıcının gördüğü "server action bitti"
süresine bu da dahildir. Sayfa bazlı dar okumalar ayrı bir sprint
(`ADMIN_WEB_P0_BASELINE.md` §7.4).

### 5.5 (P2) `cancelLessonTool` aynı deseni taşıyor

`store.cancelLesson` hâlâ iki tam `readData()` yapar. Bu turda bildirilen
akışlardan olmadığı için DOKUNULMADI; §3'teki aynı düzeltme birebir geçerli.

### 5.6 (P2) DB index

Bu turda da hiçbir index ihtiyacı ölçümle kanıtlanmadı — sorun sorgu planı
değil, gidiş-dönüş sayısıydı. **Hiçbir migration oluşturulmadı.**

---

## 6. Test verisi disiplini (C)

### 6.1 Bu turda test Supabase'e yazma: YOK

- `scripts/bench-lesson-mutations.ts` bir **guard** taşır: `DATABASE_URL`
  host'u yerel değilse veya db adı `bench`/`disposable` içermiyorsa
  çalışmayı reddeder.
- Bu turda çalıştırılan tek DDL, **yerel** `notaplan_bench_p0` üzerinde
  `prisma db push` idi; komut Prisma'nın AI guard'ı tarafından bloklandı ve
  **kullanıcıdan açık onay alınarak** çalıştırıldı.
- Test Supabase'e karşı ne migration, ne seed, ne reset, ne doğrudan SQL
  çalıştırıldı. `scripts/bench-admin-p0.ts` (önceki turun harness'ı) salt
  okunurdur ve bu turda hiç çalıştırılmadı.
- Yerel geliştirme veritabanına (`notaplan`) da yazma yapılmadı.

### 6.2 ÖNCEKİ turda test DB'de değişen demo kayıtları

Aşağıdaki liste `ADMIN_WEB_P0_BASELINE.md` §10'dan alınmıştır; bu turda
**doğrulanmadı** (doğrulamak için test DB'ye bağlanıp okumak gerekirdi;
salt okuma zararsız olurdu ama tur kapsamı "test DB'ye dokunma" olduğu için
yapılmadı — bu bir varsayım değil, kayıt aktarımıdır):

| Kayıt | Ne oldu | Neden |
|---|---|---|
| `l8` (Emir Çelik, 06.09.2026 13:00) | "Geldi" olarak işaretlendi | statü mutasyon ölçümü |
| "Defne Şahin · Keman" dersi | başlangıç saati kaydırıldı | taşıma ölçümü |
| "Lara Yıldız · Şan" dersi | başlangıç saati kaydırıldı | taşıma ölçümü |
| `l13` | başlangıç saati kaydırıldı | taşıma ölçümü |

Bunlar demo/test verisidir; production'a dokunulmamıştır.

### 6.3 Restore planı (UYGULANMADI — onay bekliyor)

İstenirse eski fixture durumu şöyle geri alınır. **Hiçbiri bu turda
çalıştırılmadı; seed/reset/cleanup ÇALIŞTIRILMADI.**

1. Önce **salt okunur** doğrulama: yukarıdaki 4 kaydın güncel
   `startAt`/`endAt`/ops bayrakları test DB'den okunur ve gerçek sapma
   listelenir (liste §6.2'de kayıt aktarımıdır, ölçüm değil).
2. Geri alma, uygulamanın KENDİ akışlarından yapılır — doğrudan SQL değil:
   - saat kaymaları: `updateLessonScheduleTool` ile orijinal saate taşıma
     (orijinal saatler `scripts/seed-demo-schedule.ts` / `src/lib/seed.ts`
     tohumundan okunur),
   - `l8` "Geldi" işareti: bu bayrağı **temizleyen** bir kullanıcı akışı
     bugün YOK (`switchLessonOpsFlag` yalnız başka bir statüye geçirir).
     Temizleme ya yeni bir tool gerektirir ya da operatör onaylı tek
     seferlik bir DB müdahalesi.
3. Alternatif ve daha temiz yol: test tenant'ını tamamen yeniden tohumlamak
   (`scripts/preflight-test-seed.ts`) — ama bu, test DB'deki **başka** el
   değişikliklerini de siler. Operatör kararı.

**Öneri:** bu kayıtlar demo verisidir ve hiçbir doğrulama akışını
bozmuyor; restore'un maliyeti faydasından yüksek görünüyor. Yine de karar
operatörün.

---

## 7. Tenant / RBAC etkisi

- `updateLessonScheduleTool` ve `setLessonOpsFlagTool`'un `requireRole`
  kapıları **değişmedi** (`SCHOOL_ADMIN|AI_AGENT|SUPER_ADMIN` ve
  `TEACHER|SCHOOL_ADMIN|SUPER_ADMIN`).
- `TEACHER` yalnız kendi dersinde işlem yapabilir kuralı **değişmedi**;
  artık dar dilimden okunan aynı `lesson.teacherId` ile kontrol ediliyor.
- `readLessonScope` (db) `requireTenantId()` ile çalışır; `School`
  `tenantId` ile bulunur ve **her ilişki filtresine ayrıca `tenantId`
  yazılır** (savunma derinliği).
- **Düzeltilen açık:** `persistLessonOpsResult` içindeki bir
  `prisma.lesson.findFirst` `tenantId` filtresi TAŞIMIYORDU — eklendi.
- Kapalı gün kuralı artık saf fonksiyonda olduğu için store'a giren HER
  yolda uygulanıyor; önceden yalnız tek çağıranı (tool) koruyordu — bu bir
  **daralma değil, genişleme**.

Kanıt testleri: `lesson-move-resize-flow.test.ts` (rol reddi + kapalı gün
store seviyesinde), `lesson-ops-absent-excused.test.ts` (öğretmenin başka
dersine erişememesi), `program-studio-flow.test.ts`.

---

## 8. Renk ve demo reset regresyonu (D)

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| "Demo verisini sıfırla" test/prod kullanıcı UI'ında YOK | ✅ | `demo-reset-gating.test.ts` "render noktaları" (kaynak seviyesinde `/panel` özetinde hiç yok, Kurulum'daki tek giriş `isLocalDevTooling()` koşullu) |
| Backend preview/prod'da fail-closed | ✅ | `demo-reset-gating.test.ts` — `SCHOOL_ADMIN` **ve** `SUPER_ADMIN` için `FORBIDDEN`, store'a dokunmadan |
| Geldi → yeşil · İşlendi → kırmızı · Telafi → sarı · İptal → koyu gri · Planlandı → nötr | ✅ | `attendance-calendar-colors.test.ts` (17 test, hesaplanan AA kontrastı dahil) + `program-studio-filters.test.ts` |
| TAM kart arka plan dolgusu (rozet/şerit değil) | ✅ | yeni: `program-studio.tsx` iki render yolunda da `...lessonCardFillStyle(statusVisual)` uyguluyor (kaynak seviyesi regresyon kilidi) |
| Ders Programı'nda AYRI Tailwind statü renk haritası YOK | ✅ | yeni regresyon testi (geçmişte gerçekten yaşanan regresyon) |
| Telafi sarısı | ✅ (hesaplanarak) | `lessonCardFillStyle("makeup")` = `ATTENDANCE_CALENDAR_COLORS.makeup`, metin rengi beyaz DEĞİL |

**Dürüstlük notu:** Telafi sarısı bu turda da **canlı tarayıcıda render
edilerek** doğrulanamadı — nedeni değişmedi (test verisindeki tek iki
telafi-işaretli ders hafta sonuna düşüyor ve yaz dönemi ızgarası o günleri
tasarım gereği gizliyor). Talimata uyularak **test fixture'ı DEĞİŞTİRİLMEDİ**.
Bu depoda DOM render testi altyapısı da yok (`vitest` `environment: "node"`,
jsdom/testing-library bağımlılığı yok) — yeni bir test bağımlılığı eklemek
yerine, bileşenin doğru kaynağı KULLANDIĞI kaynak seviyesinde kilitlendi ve
renk DEĞERİ birim testiyle doğrulandı. Gerçek tarayıcı doğrulaması için
gereken: telafi işaretli, hafta içine düşen bir ders (operatör kararı —
fixture değişikliği).

---

## 9. Çalıştırılan kapılar

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | ✅ temiz |
| `npm run lint` | ✅ **0 hata**, 24 eski uyarı |
| `npm test` | ✅ **2699 / 2699** (öncesi 2685; +14 yeni test) |
| `npx prisma validate` | ✅ `The schema at prisma/schema.prisma is valid` |
| `npm run build` | ✅ temiz, tüm rotalar üretildi |
| Store parity testleri | ✅ `lesson-scope.test.ts` (8 yeni test) — dar dilim tam veriyle AYNI kararı veriyor |
| Mutation benchmark harness | ✅ `scripts/bench-lesson-mutations.ts` (§1) |
| Tenant/RBAC negatif testleri | ✅ 58 test (§7) |

Yeni testler:
- `src/lib/__tests__/lesson-scope.test.ts` — 8 test (dilim sınırları + tam
  veriyle karar eşitliği + merge).
- `lesson-move-resize-flow.test.ts` — +2 (kapalı gün store seviyesinde;
  store'un tam `AppData` DÖNMEDİĞİ).
- `notifications.test.ts` — +1 (eşzamanlı yazımda kayıp yok; kilit
  kaldırılarak **düşmesi kanıtlandı**).
- `program-studio-filters.test.ts` — +3 (renk regresyon kilidi).

---

## 10. Commit / dağıtım

| Kalem | Değer |
|---|---|
| Commit | `33e4765fce514d7de8ff72579b266029f0ceefcf` |
| Branch | `origin/test` (yerel `infra/vercel-test-environment`) |
| Önceki HEAD | `5688504` |
| Vercel projesi | `neviihub` (`prj_hmg2Nu2GtPs0JrfEcllpeUIbWpIG`) |
| Preview deployment | `dpl_9THhWECYSLg3DHofbks2igUytMmf` — **READY** |
| Alias | `test.neviihub.com`, `neviihub-git-test-hidircans-projects.vercel.app` |
| Lambda bölgesi | `iad1` (bkz. §5.2) |

### Production'a DOKUNULMADI

Production ayrı bir Vercel projesidir (`notaplan`, `target: production`) ve
hâlâ `4ab2f3d` build'ini çalıştırıyor (`list_deployments` çıktısıyla
doğrulandı). Bu turda `main`'e commit/push YAPILMADI; `main` branch'ine hiç
dokunulmadı.

### Doğrulanamayan: dağıtılmış build üzerinde ölçüm

`test.neviihub.com/api/v1/ready` ve doğrudan deployment URL'si **302** ile
`vercel.com/sso-api`'ye yönleniyor — Vercel Deployment Protection hâlâ açık
(PROJECT_STATE'teki bilinen açık madde, önceki turda da aynıydı).

Bu yüzden **dağıtılmış build üzerinde ne `ready`/`storeMode`/`reachable`
teyidi ne de gerçek tarayıcı mutasyon ölçümü yapılabildi.** Erişim
bypass edilmeye ÇALIŞILMADI ve credential İSTENMEDİ.

İnsan aksiyonu gerekiyor (biri yeterli):
- test projesinde Deployment Protection'ı kapatmak, **veya**
- Protection Bypass for Automation token'ı üretmek, **veya**
- test branch'ini Production target'ına almak.

Bu çözülmeden §4.2'deki tablo, **kalibre edilmiş** (bkz. §1.1) yerel
simülasyondan gelen en iyi tahmindir — dağıtımdan alınmış ölçüm değildir.

---

## 11. Production blocker'ları (özet)

| # | Blocker | Tip | Sahip |
|---|---|---|---|
| 1 | **Bölge uyuşmazlığı**: lambda `iad1` ↔ Supabase `ap-south-1` (~163 ms). Bu gecikmede P95 < 1 sn hedefi hiçbir mutasyonda tutmuyor; ≤ 30 ms'de her ikisi de tutuyor. | Altyapı | Operatör |
| 2 | **Bildirimler bloklayan yolda, 19 ardışık gidiş-dönüş** — taşımanın kalan maliyetinin %75'i. Paralelleştirmenin ön koşulu (yazma kilidi) bu turda kapatıldı; uygulama ONAY BEKLİYOR. | Kod | Operatör onayı |
| 3 | **Vercel Deployment Protection** dağıtılmış build üzerinde hiçbir otomatik doğrulamaya izin vermiyor (§10). | Altyapı | Operatör |
| 4 | **Preview `DATABASE_URL`** (PROJECT_STATE "Open work" #1) — bu turda doğrulanamadı, çünkü #3 nedeniyle `/api/v1/ready` okunamıyor. | Altyapı | Operatör |
| 5 | Migration geçmişi squash kararı (PROJECT_STATE "Open work" #5) — bu turda **hiçbir migration oluşturulmadı/çalıştırılmadı**, durum değişmedi. | Veri | Operatör |
