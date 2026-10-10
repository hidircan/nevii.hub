# Veri Kalıcılığı ve Canlıya Geçiş Runbook'u

**Tarih:** 2026-09-20 · **Sahip:** Helios (DevOps) + Prisma (Data)
**Amaç:** Test ortamında girilen **gerçek** kurum verisinin (öğrenci, sözleşme,
ödeme, evrak) canlıya geçişte **bozulmadan, eksilmeden, kaybolmadan** taşınması.

Bu belge bir taslak değil, **çalıştırılabilir bir prosedürdür**. Her adımın
karşılığı repo içinde bir komuttur.

> İlişkili belgeler: `docs/operations/TEST_TO_PRODUCTION_DATA_CUTOVER.md`
> (cutover kararları), `docs/PRODUCTION_DATABASE_SOURCE_OF_TRUTH.md`
> (hangi Supabase projesi neyi barındırıyor), `docs/TEST_DATABASE_SAFETY.md`
> (production'a yanlışlıkla yazmayı engelleyen guard).

---

## 0. En kritik bulgu — önce bunu okuyun

Veri kaybının **tek büyük kaynağı** yanlış `STORE_MODE`'dur:

| `STORE_MODE` | Nerede saklanır | Serverless'ta (Vercel) kalıcı mı? |
|---|---|---|
| `db` | PostgreSQL (Supabase) | **Evet** — tek güvenli seçenek |
| `json` | `resolveDataDir()` → Vercel'de **`/tmp/notaplan-data`** | **HAYIR** — her cold start ve her dağıtımda silinir |
| `memory` | Süreç belleği | **HAYIR** — diske hiç yazılmaz |

`src/lib/config.ts` → `resolveDataDir()`:

```ts
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  return "/tmp/notaplan-data";
}
```

**Kural:** Gerçek kullanıcı verisi girilen HER ortam (test dahil)
`STORE_MODE=db` çalışmak zorundadır. `test.neviihub.com` için hedef
`neviihub-test` (`vxzewyiwfshobjizzetw`) Supabase projesidir
(bkz. `docs/VERCEL_TEST_ENVIRONMENT_RUNBOOK.md` ortam matrisi).

Doğrulama:

```bash
npm run verify:durability
```

`[KRİTİK] runtime: STORE_MODE=json + serverless …` çıktısı alıyorsanız o
ortamda girilen veri **kalıcı değildir**; taşımaya çalışmadan önce ortam
düzeltilmelidir.

---

## 1. Veri sınıfları ve nerede tutulduğu (denetim)

| Veri | Modül | `db` modunda tablo | Serverless'ta kalıcı |
|---|---|---|---|
| Öğrenci, öğretmen, ders, seri, yoklama, ödeme, telafi | `store-db.ts` | `Student`, `Teacher`, `Lesson`, `LessonSeries`, `Attendance`, `Payment`, `MakeupRequest` | ✅ |
| **Sözleşmeler** | `contracts.ts` | `StudentContract` | ✅ |
| **Evraklar + dondurulmuş nüsha + imzalı dosya** | `documents/index.ts` | `DocumentInstance`, `DocumentTemplate` | ✅ |
| Çalışma günü istisnaları | `closed-day-overrides.ts` | `ClosedDay` | ✅ |
| Personel, bordro, avans, izin, masraf | `staff.ts`, `payroll.ts`, `staff-advance.ts`, `leave.ts`, `expense.ts` | ilgili tablolar | ✅ |
| İş takip görevleri | `tasks.ts` | `Task` | ✅ |
| Portal erişimi, rıza kayıtları, bildirim tercihleri | `student-portal-access.ts`, `kvkk-consent.ts`, `social-media-consent.ts`, `notification-preferences.ts` | ilgili tablolar | ✅ |
| Kullanıcı tercihleri (tema, panel varsayılan şubesi) | `user-preferences.ts` | `UserPreference` | ✅ |
| Workflow durumu, tahsilat vakaları | `workflows/state.ts`, `tahsilat/cases.ts` | ilgili tablolar | ✅ |
| **AI sohbet geçmişi** | `ai/conversations.ts` | **YOK — yalnız dosya** | ❌ |
| **AI metrikleri** | `ai/metrics.ts` | **YOK — yalnız dosya** | ❌ |
| **AI hafıza / vektör deposu (file backend)** | `ai/memory/store.ts`, `ai/memory/vector/file-vector-store.ts` | **YOK — yalnız dosya** (pgvector/Qdrant seçilirse kalıcı) | ❌ |

**Sonuç:** Operasyonel ve finansal verinin tamamı `db` modunda kalıcıdır.
Kalıcı olmayan üç modül yalnızca AI katmanına aittir; öğrenci/sözleşme/
ödeme/evrak verisini **etkilemez**. Bu bilinçli bir sınırdır, sürpriz değil —
`npm run verify:durability` bunu her çalıştırmada açıkça raporlar.

### "draft" statüsü riski — giderildi

`createDocumentInstance` varsayılanı `"draft"` idi; üretilmiş, referans
numarası almış ve arşivde kalıcı her belge (özellikle sözleşmeler) Evraklar
Merkezi'nde "Taslak" görünüyordu. Bu bir **veri kaybı değil**, ama kullanıcıda
"bu belge sonradan kaybolur mu?" endişesi yaratıyordu.

- Yeni varsayılan: `"issued"` ("Düzenlendi").
- Mevcut satırlar: `prisma/migrations/20260920120000_document_instance_issued_status`
  (yalnız `UPDATE … SET status='issued' WHERE status='draft'` — hiçbir satır
  silinmez, hiçbir alan kaybolmaz).
- Denetleyici, kalan `draft` satırlarını uyarı olarak raporlar.

---

## 2. Canlıya geçiş öncesi — zorunlu kontrol dizisi

Sırayla, **her biri yeşil olmadan bir sonrakine geçmeden**:

```bash
# 1) Kod sağlığı
npm run typecheck && npm run lint && npm test && npx prisma validate && npm run build

# 2) Hedef doğrulaması — yanlış projeye yazmayı engeller
npm run preflight:test-db          # DATABASE_URL gerçekten TEST mi?
npx prisma migrate status          # bekleyen migration var mı?

# 3) Şema doğrulaması (migration SONRASI)
npm run verify:test-schema

# 4) VERİ KALICILIĞI + BÜTÜNLÜK (bu turda eklendi)
npm run verify:durability
```

`verify:durability` şunları kontrol eder ve kritik bulguda **1 ile çıkar**
(CI'da pipeline'ı durdurur):

1. Ortam gerçekten kalıcı bir store'da mı (`STORE_MODE`)
2. Çekirdek tablolar mevcut mu, migration'lar uygulanmış mı
3. Satır sayıları (öğrenci / sözleşme / ödeme / evrak / ders)
4. Yetim kayıt yok mu (öğrencisiz ödeme, sözleşmesiz taksit, öğrencisiz sözleşme)
5. **Belge bütünlüğü** — her sözleşmenin dondurulmuş `DocumentInstance` nüshası
   duruyor mu; içeriği ve/veya yüklenmiş dosyası boş olan evrak var mı
6. **Para değişmezi** — aktif sözleşmelerde `totalContractAmount` = taksit toplamı
7. **Tenant izolasyonu** — bir kurumun ödemesi başka kurumun öğrencisine bağlı mı

---

## 3. Yedek alma ve yedeği DOĞRULAMA

Yedek almak yetmez; **geri yüklenebildiği kanıtlanmalıdır**.

```bash
# 3.1 — Tam mantıksal yedek (roller + şema + veri), Git DIŞINDA bir dizine
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
OUT=~/Backups/neviihub/$STAMP
mkdir -p "$OUT"

pg_dump "$DATABASE_URL_SESSION" --no-owner --format=custom --file "$OUT/full.dump"
pg_dump "$DATABASE_URL_SESSION" --no-owner --schema-only  --file "$OUT/schema.sql"

# 3.2 — Parmak izi (bozulma tespiti için)
shasum -a 256 "$OUT"/* > "$OUT/SHA256SUMS"

# 3.3 — YEDEĞİ DOĞRULA: boş, geçici bir veritabanına geri yükle
createdb neviihub_restore_check
pg_restore --no-owner --dbname=neviihub_restore_check "$OUT/full.dump"

# 3.4 — Geri yüklenen kopyada aynı bütünlük kontrollerini çalıştır
DATABASE_URL=postgres://localhost/neviihub_restore_check npm run verify:durability

# 3.5 — Temizlik
dropdb neviihub_restore_check
```

> `DATABASE_URL_SESSION` = **session pooler (5432)**. Transaction pooler
> (6543) üzerinde `pg_dump`/`migrate` asılı kalır (bkz. Vercel runbook).

**Kural:** 3.4 adımı çalıştırılmadan alınan yedek "doğrulanmış yedek"
sayılmaz. Go-live onayı bu adımın çıktısına bağlıdır.

---

## 4. Belge ve PDF kalıcılığı — ayrı doğrulama

Sözleşme PDF'i **dosya olarak saklanmaz**; iki kalıcı parçadan üretilir:

1. `DocumentInstance.renderedHtml` — sözleşme oluşturulduğu anda dondurulmuş
   HTML anlık görüntüsü (şablon sonradan değişse bile DEĞİŞMEZ).
2. `StudentContract.contractDataSnapshot` — tutar, taksit, imzacı, ek metinler.

İmzalı/taranmış nüsha ise `DocumentInstance.fileData` (base64) alanında,
yükleme geçmişi `signedVersions` içinde tutulur.

Bunun pratik sonucu: **PDF ayrı bir dosya deposuna bağımlı değildir**;
veritabanı yedeği alındıysa PDF'ler de yedeklenmiştir. `verify:durability`
şu iki senaryoyu ayrıca kontrol eder:

- sözleşmenin `documentInstanceId`'si var ama karşılığı olan belge yok → **KRİTİK**
- belgenin ne `renderedHtml`'i ne `fileData`'sı var → **KRİTİK**

Manuel doğrulama (UAT): her sözleşme türünden birer örnek için
`/sozlesme-yazdir/<contractId>` açılıp PDF çıktısı alınır.

---

## 5. Gerçek veri ↔ demo/test verisi ayrımı

Cutover'da **yalnız onaylı gerçek veri** taşınır. Ayrım isim tahminiyle
değil, veri üzerindeki işaretlerle yapılır:

| İşaret | Anlamı |
|---|---|
| `LessonSeries.demoTag` dolu | Demo/otomasyon serisi → taşınmaz |
| `Student.phone` `0555 000 00xx` deseni | Test fixture'ı (bkz. `scripts/uat-mobile-portal-fixtures.ts`) → taşınmaz |
| `AuditLog.actorId` = `ops_*` / `uat_*` | Otomasyon aktörü → veri taşınmaz |
| Yukarıdakilerin hiçbiri | Gerçek kurum verisi → **taşınır** |

Taşıma listesi çıkarıldıktan sonra **owner onayı** alınır; onaysız satır
taşınmaz.

---

## 6. Go-live kontrol listesi (sırayla işaretlenir)

- [ ] `STORE_MODE=db` — hem test hem production ortam değişkenlerinde doğrulandı
- [ ] `DATABASE_URL` production **transaction pooler (6543)**; migration için ayrı **session pooler (5432)**
- [ ] `npm run typecheck && npm run lint && npm test && npx prisma validate && npm run build` — hepsi yeşil
- [ ] `npx prisma migrate status` — "up to date"
- [ ] Bu turda eklenen migration'lar uygulandı:
      `20260920120000_document_instance_issued_status`,
      `20260920130000_user_preference_dashboard`,
      `20260920140000_student_lesson_schedule_text`,
      `20260920150000_lesson_series_contract_link`
      (hepsi **additive**; hiçbiri veri silmez — geri alma SQL'leri dosyaların içinde)
- [ ] `npm run verify:test-schema` — geçti
- [ ] **`npm run verify:durability` — 0 kritik bulgu**
- [ ] Yedek alındı **ve** boş bir veritabanına geri yüklenip doğrulandı (§3.4)
- [ ] Yedek Git dışında, ayrı bir konumda; `SHA256SUMS` dosyası mevcut
- [ ] Gerçek veri freeze zamanı owner ile belirlendi ve duyuruldu
- [ ] Freeze sonrası testte gerçek veri girişi durduruldu
- [ ] Demo seed guard aktif: production'da `assertNotProductionRuntime()` engelliyor
- [ ] `APP_BASE_URL`, `JWT_SECRET`, SMTP, AI ve ödeme anahtarları production değerlerinde (test değerleri **yok**)
- [ ] Geri dönüş (rollback) planı yazıldı: hangi yedek, hangi komut, kim çalıştırır

---

## 7. Veri kaybı riskini nasıl minimize ediyoruz — özet

1. **Ortam seviyesinde:** tek kalıcı store `db`; `json`/`memory` serverless'ta
   otomatik olarak **kritik bulgu** üretir. Sessizce ephemeral çalışma ihtimali
   kapatıldı.
2. **Şema seviyesinde:** bu turdaki dört migration da yalnızca kolon ekler veya
   etiket günceller; `DROP`/`DELETE` yoktur ve her birinin geri alma SQL'i
   dosyanın içindedir.
3. **Uygulama seviyesinde:** "Arşivle" hiçbir yerde silme değildir —
   `status='cancelled'` işaretidir; referans, içerik ve imzalı nüshalar kalır.
   Bu kullanıcıya da Evraklar ekranında açıkça yazılır.
4. **Bütünlük seviyesinde:** `verify:durability` yetim kayıtları, kayıp belge
   nüshalarını, boş belgeleri, para tutarsızlığını ve tenant sızıntısını
   çalıştırılabilir biçimde kontrol eder; CI'da kırılır.
5. **Yedek seviyesinde:** yedek **geri yüklenip aynı kontrollerden geçmeden**
   geçerli sayılmaz.
6. **Süreç seviyesinde:** cutover tek yönlü ve freeze'lidir; demo/test verisi
   işaretle ayrılır, tahminle değil.
