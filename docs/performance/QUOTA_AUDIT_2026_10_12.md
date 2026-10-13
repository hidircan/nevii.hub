# Vercel Active CPU + Supabase egress — kota denetimi (2026-10-12/13)

**Kod tabanı:** canlıdaki `origin/main` 174bb2b (yerel `main` cf12bc0 canlıdan 433 dosya gerideydi — denetim canlı koda göre).
**Dal:** `perf/quota-p1` · **Migration:** YOK · **Canlıya yazım:** YOK.
Etiketler: **DOĞRULANDI** (kod/doküman/araç çıktısı) · **GÜÇLÜ ADAY** (kod kanıtlı, üretim hacmi bilinmiyor) · **KANIT YETERSİZ**.
Üretim CPU/egress'i bu turda ölçülmedi; tüketim sayıları owner'ın panel değerleri ve owner'ın çalıştırdığı salt-okunur SQL.

## 1. Mevcut durum

| Tur | Ne yapıldı | Sonuç |
|---|---|---|
| 09-07 P0 raporları | Takvim ayları paralel, ders taşıma DB turları, font yükü | Gecikme odaklı |
| 09-30 tur 1+2 (`DB_EGRESS_2026_09_30.md`) | Dar dilimler, logo okunmuyor, bildirim zili `count`+`take`, 21 mutasyonda `return readData()` yok | Bench −83 % / −53 % |
| 10-01 Vercel CPU | Link prefetch kapalı, polling/canlı yenileme 5 dk, asistan lazy | Kodda doğrulandı |
| 10-08 mobil maliyet denetimi | İstemci dedupe/TTL/debounce, özetlerde 60 sn cache, `cost_metric` (yalnız API) | `admin-lists`/`student-ledgers` tam okuma bırakıldı |
| 10-10 PR #21 (`DB_EGRESS_2026_10_10.md`) | Sıcak mutasyon yolları −84…−98 % (bench), UserSession tek ifade + `after()` | Canlı ~10:42Z |
| 10-10/12 | pg pool max 5, cron canlıda seed yapmıyor (PR #22) | Canlı |

**İşe yaradı mı?** 1–10 Ekim ≈ 0,71 GB/gün; **11 Ekim tek başına 1,185 GB** (%100 Shared Pooler) — PR #21 sonrası ilk tam gün ve
düzeltme öncesinden YÜKSEK → PR #21'in üretim etkisi kanıtlanamıyor (**KANIT YETERSİZ**, tek gün). Açıklama adayları:
(a) 11 Ekim sürüm betikleri (`reconcile-enrollment-terms`, `backfill-enrollment-links` tenant başına tam satır okur; tek koşu birkaç MB;
`production-migration` iş akışı 11 Ekim'de koşmadı), (b) bench'in görmediği geniş satırlar (§2 #2), (c) normal Pazar trafiği.
Belirleyici veri: 12–14 Ekim günlük egress + aynı günlerin Vercel invocation sayısı + bu PR'ın tam-okuma ölçüm satırı (§5).

Vercel: 3 sa 53 dk / 4 sa. Hobby'de limit aşılırsa özellik "30 gün geçene kadar" kullanılamaz (vercel.com/docs/plans/hobby).
Pencere kayan 30 gün; 15–30 Eylül yoğun UAT günleri 15–30 Ekim'de düşer.

## 2. Riskler (owner SQL'i sonrası, 2026-10-13)

Owner SQL sonucu (canlı): HomeworkSubmission 0 · Homework 2 (0 B dosya) · TeachingMaterial 0 · TaskAttachment 0 ·
**DocumentInstance 126 satır / 2 591 kB** (fileData + renderedHtml) · DocumentTemplate 4 / 25 kB · StaffMember foto 0 B ·
**Student 233 satır, ort. 459 B (disk)**.

| # | Risk | Kanıt | Sınıf | Çözüm tipi |
|---|---|---|---|---|
| 1 | Vercel Active CPU 7 dk pay; aşılırsa 30 güne kadar site kapalı | Resmî doküman; tüm sayfalar dinamik | Limit DOĞRULANDI, neden KANIT YETERSİZ | firewall, canlı yenileme, gerekirse Pro |
| 2 | **Student geniş satırı her dilimde** | Referans dilimi tüm öğrencileri ~80 kolonla okur; 233 × 459 B ≈ 107 KB disk, telde kolon başına uzunluk öneki + metin biçimi ile ≈ 2 kat (hesap). Üretimde 10-10'a kadar ~6 646 Student okuması (~700/gün, sayaç başlangıcı ≈ 10-01 varsayımı) → **≈ 75–150 MB/gün** = Kasım bütçesinin (≈170 MB/gün) yarısı-tamamı | GÜÇLÜ ADAY (hesap) | sorgu daralt — Free'de kalmak için muhtemelen ZORUNLU |
| 3 | Kalan tam okumalar | Telafi (`panel/telafi/page.tsx:91`, bench 1,77 MB/görüntüleme, her filtre/sayfa yeni okuma), öğretmen detay 10 sekme (`_context.ts:23`), `/ogretmen/odevler`, Ders Düzeltme, raporlar, AI tool'ları (`tools.ts` 111 çağrı) | Kod DOĞRULANDI, sıklık KANIT YETERSİZ → §5 ölçümü | dilim |
| 4 | Evrak listeleri dosya + gövde HTML'ini okuyup atıyordu | `listDocumentInstances` / `listDocumentsForStudent` `select`/`omit` yok; 126 belge ≈ 2,6 MB / tam liste | **DOĞRULANDI → bu PR'da düzeltildi** | omit |
| 5 | Dört portal sayfası tam `readData()` | `ogrenci/degerlendirme`, `ogretmen/degerlendirme/[id]`, `ogretmen/ogrenciler/[id]`, `ogretmen/odevler`; çağrılan tool'lar zaten tek satır okuyor (`readStudentById`) → sayfa okuması tek tam okuma | **İlk üçü bu PR'da düzeltildi**; `odevler` öğretmen-ders dilimi ister, ölçüme göre | dilim |
| 6 | Mobil API'ler tam okuma (gizli) | `admin-lists.ts` 8, `student-ledgers.ts` 5 `readData()`; EAS'te build yok → bugün trafik 0 | Kod DOĞRULANDI | mağaza yayınından önce daralt |
| 7 | `notification-tick` (GitHub cron 10 dk) gizli | Secret'lar eksik, her koşu istek atmadan çıkıyor (Actions logu). Eklenirse `notification-sweeps.ts` tenant başına `readData()`: 144 × ≥1,8 MB ≈ **≥260 MB/gün** (hesap) | DOĞRULANDI | daraltmadan secret ekleme |
| 8 | Bot trafiği (dinamik genel sayfalar, `/` force-dynamic) | Hobby log 1 saat | KANIT YETERSİZ | Firewall |
| — | Ödev/materyal/görev eki dosya kolonları | Kodda aynı desen, canlıda 0 satır → bugün etkisi yok | Gizli | dosyalar büyürse omit |

## 3. Bu PR'da yapılanlar (`perf/quota-p1`)

| Değişiklik | Dosya | Beklenen etki | Doğrulama |
|---|---|---|---|
| Tam okuma ölçüm satırı `egress:readData:full` (sabit metin, PII yok) | `store-db.ts` `readData()` (slice geri düşüşleri ve store içi okumalar dahil, db modunda) | Hangi rotanın tam okuma yaptığı ilk kez sayılabilir | §5 |
| Evrak listeleri `omit: { fileData, renderedHtml }`; json modunda da liste yanıtından çıkar | `documents/index.ts` | Tam liste başına ≈ 2,6 MB → metadata (≈ birkaç KB); API liste JSON'u da küçülür. Detay/yazdırma/indirme `getDocumentInstance` ile aynen | Yeni test + mutasyonla kanıt (strip geri alınınca test kırıldı) |
| 3 portal sayfası `readStudentScope` | `ogrenci/degerlendirme`, `ogretmen/degerlendirme/[studentId]`, `ogretmen/ogrenciler/[studentId]` | Görüntüleme başına tam okuma (bench ≈ 1,8 MB) → tek öğrenci dilimi (bench 50–150 KB). Tüm süzgeçler zaten `studentId` ile | Kaynak kilidi testi; görünen içerik aynı (UAT) |

Yapılmayanlar ve nedeni: Telafi / öğretmen detayı / `odevler` / Student kolon daraltma → önce §5 ölçümüyle sıralanacak (hangisinin
gerçekten sık olduğu bilinmeden büyük yeniden yazım yok). Ödev/materyal dosya kolonları → canlıda 0 satır.

## 4. Özellik kısma seçenekleri (gerekirse)

| Özellik | Kısma | Kullanıcı etkisi | Kazanç | Risk |
|---|---|---|---|---|
| Öğretmenler listesindeki performans skoru | Düğmeyle veya yalnız detayda | Skor tek bakışta görünmez | Öğretmen sayısı × skor hesabı (CPU) | Düşük |
| Portal canlı yenileme | `NEVII_LIVE_REFRESH_MS=0` (sayfalar değeri sunucudan alır; redeploy) | Sekmeye dönünce yenilenir | Açık sekme başına 12 render/saat | Düşük |
| Telafi önerileri / öğretmen detay sekmeleri | Düğmeyle / yalnız özet varsayılan | Bir tık fazla | Tam okuma başına ≈ 1,8+ MB | Düşük |
| Mobil mağaza yayını | #6 bitene kadar ertele | Mobil gecikir | Gizli riski kapatır | — |
| PDF/makbuz/export | Kısma önerilmez | — | Düşük sıklık | — |

## 5. Ölçüm ve izleme (deploy sonrası)

1. Hafta içi okul saatinde (≈ 08:00–14:00Z) 2–3 kez: Vercel `get_runtime_logs` · `group_by: requestPath` · `query: "egress:readData:full"`
   · `since: "55m"` (Hobby 1 saat tutar). En çok tam okuma yapan 3 rota bir sonraki dilim işidir.
2. Supabase Usage → Egress günlük çubukları: 12–14 Ekim ve deploy sonrası ilk 2 tam gün; Vercel günlük invocation ile oran.
3. 1,185 GB ÷ tam okuma boyu ≈ günlük tam okuma sayısı (hesap) — aşağıdaki SQL'in Lesson/Payment boyutlarıyla ve 1. adımın sayımıyla karşılaştır.

Owner için ek salt-okunur SQL:
```sql
select 'Lesson' t, count(*) n, pg_size_pretty(coalesce(avg(pg_column_size(x.*)),0)::bigint) ort from "Lesson" x
union all select 'Payment', count(*), pg_size_pretty(coalesce(avg(pg_column_size(x.*)),0)::bigint) from "Payment" x
union all select 'Attendance', count(*), pg_size_pretty(coalesce(avg(pg_column_size(x.*)),0)::bigint) from "Attendance" x
union all select 'MakeupRequest', count(*), pg_size_pretty(coalesce(avg(pg_column_size(x.*)),0)::bigint) from "MakeupRequest" x;
```

## 6. Alternatif altyapı (özet)

Egress, istek başına MB'larca okumadan geliyor; ölçümlü her sağlayıcı (Neon Free da 5 GB egress) bunu tekrar eder → okuma daraltması
her senaryonun ön koşulu. Supabase fiilen yalnız PostgreSQL olarak kullanılıyor (kendi auth, Realtime yok, Storage yalnız duyuru ekleri).

| Seçenek | Özet (resmî sayfalar, 2026-10-12) | Sonuç |
|---|---|---|
| Neon Free | 100 CU-saat/proje, 1 GB, **5 GB egress**, 5 dk sonra uyku; limitte compute dönem sonuna kadar askıda | Şimdi değmez; yedek |
| Cloudflare Workers + Hyperdrive + OpenNext | Free: **10 ms CPU/istek**, 100 k istek/gün; Hyperdrive 100 k sorgu/gün; Paid $5/ay (10 M istek, 30 M CPU-ms). OpenNext Next 16'yı destekler; Prisma 7/`after()` uyumu doğrulanmadı | Yalnız hosting için, Vercel Pro alternatifi |
| Oracle Always Free + Docker | A1 2 OCPU / 12 GB, 200 GB, 10 TB/ay çıkış; 7 gün p95 < %20 kullanımda geri alınabilir | Kota yok ama operasyon/KVKK yükü; şimdi değil |
| MySQL / MSSQL / Turso / Firebase / Appwrite / PocketBase | Ham PG SQL (`pg_advisory_xact_lock`, `hashtext`), RLS'li PG migration'ları → yeniden yazım | Teorik, önerilmez |

Kota dışı not: Vercel Hobby "non-commercial, personal use only" (resmî). Supabase: grace sonrası tekrar aşımda ikinci grace yok
(billing FAQ); Pro $25/ay'dan, 250 GB egress, harcama sınırı varsayılan açık — 1 Kasım'da günlük egress ≲ 170 MB değilse tek hızlı yol.

Kaynaklar (2026-10-12): vercel.com/docs/plans/hobby · vercel.com/docs/bot-management · supabase.com/docs/guides/platform/manage-your-usage/egress ·
supabase.com/docs/guides/platform/billing-faq · supabase.com/pricing · neon.com/pricing · developers.cloudflare.com/workers/platform/limits ·
developers.cloudflare.com/workers/platform/pricing · developers.cloudflare.com/hyperdrive/platform/pricing · opennext.js.org/cloudflare ·
docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

Bu turdaki dış çağrılar (salt-okunur): Vercel deployment listesi + 55 dk runtime-log sayımı; GitHub Actions koşu listesi + bir log.
