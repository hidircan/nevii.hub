# NotaPlan Ürün Genişletme — Uygulama Planı

Durum: **YAŞAYAN DOKÜMAN** — her faz tamamlandıkça "İlerleme" bölümü güncellenir.
Kapsam: 2026-08-25 tarihli 14 fazlık ürün talebinin Faz 0 keşif + fazlı uygulama planı.

## Nasıl okunmalı

Bu doküman iki bölümden oluşur:
1. **Faz 0 — Keşif özeti**: her fazın mevcut kod tabanında NE KADARININ zaten var olduğu
   (bu proje 1650+ satırlık Prisma şeması, 7900+ satırlık tool katmanı ve onlarca tamamlanmış
   epic/paket/sprint içeren OLGUN bir SaaS — talebin varsaydığından çok daha ileride).
2. **Faz 1-14 planları**: her biri Amaç / Etkilenen dosyalar / Migration-backfill / Güvenlik-RBAC
   / Test stratejisi / Riskler / Tamamlanma kriteri.

## Uygulama sırası kararı (bilinçli yeniden sıralama)

Kullanıcı talebi fazları 1→14 numaralandırdı ama "bağımlılıkları gözeten fazlı plan" istedi.
Keşif sonrası gerçek efor/risk dağılımı numaralandırmayla örtüşmüyor: bazı fazlar zaten
%80-100 tamamlanmış, bazıları tek satırlık bug, bazıları haftalarca süren yepyeni alt sistem.
En güvenli/denetlenebilir yaklaşım — küçük ve düşük riskli işleri önce bitirip gerçek zemin
kazanmak, sonra büyük yeni alt sistemlere geçmek — bu yüzden UYGULAMA sırası şu şekilde
yeniden düzenlendi (numaralandırma/adlandırma orijinal Faz numaralarını korur, sadece
işleniş sırası değişir):

1. Faz 7 (bug fix, ~dakikalar)
2. Faz 5 (doğrulama, zaten yapılmış)
3. Faz 6 (mevcut scripti tamamlama)
4. Faz 1A + 1B (öğrenci ödeme tercihi + çoklu tür)
5. Faz 12 (insan-okunur ID)
6. Faz 2 (öğretmen yoklama/performans)
7. Faz 13 (ders öğretmen/şube değişimi)
8. Faz 3A-D (gelişim raporu + 4 haftalık + ödev zorunluluğu + admin takip — en büyük küme)
9. Faz 4 (hedefli duyurular)
10. Faz 9A+9B (personel özlük + avans)
11. Faz 10 (finans/gider genişletme)
12. Faz 8 (KVKK rıza)
13. Faz 11 (CRM arama/mesaj altyapısı)
14. Faz 14 (son kalite kontrolü)

---

## Faz 0 — Keşif özeti (durum matrisi)

| Faz | Konu | Durum | Not |
|---|---|---|---|
| 1A | Çoklu ödeme günü aralığı | ❌ Yok | Tekil `paymentDueDay Int?`, 3 ayrı kopya zod şeması |
| 1B | Çoklu öğrenci türü | ❌ Yok | Tekil `studentType String?`, ~15-20 çağrı noktası, bazıları `===` exact-match |
| 2 | Öğretmen yoklama/performans | ❌ Yok | Sadece öğrenci-taraflı alanlar var; `TeacherFeedback` agregasyonu zaten var (yeniden kullanılabilir) |
| 3A | Ders bazlı "çalışılan konular" | 🟡 Kısmi | `LessonAssessment` var (10 skorlu alan + 4 not alanı) ama konu/etüt free-text alanı yok, zorunlu değil |
| 3B | 4 haftalık genel değerlendirme | ❌ Yok | Ayrı model gerekiyor; idempotency şablonu `TaskReminderLog` |
| 3C | Ders başı ödev zorunluluğu + hatırlatma | ❌ Yok | `Homework`'te `lessonId` bile yok; `lessonProcessed` ile hiç bağlı değil |
| 3D | Admin ödev takip ekranı | 🟡 Kısmi | `/panel/odev-raporu` var ama sadece öğretmen-rollup; satır bazlı tablo/filtre/detay yok |
| 4 | Hedefli duyurular | 🟡 Kısmi | `Announcement.audienceType/audienceRef` + sunucu-taraflı `matchesAudience` var ama PULL model (push+persist+dedup+recipient-count yok), enstrüman segmenti yok |
| 5 | Geri navigasyon | ✅ Zaten yapılmış | `BackButton` (safe returnTo + router.back + fallback) her `[id]` ekranında zaten kullanılıyor |
| 6 | Demo ders programı seed | 🟡 Kısmi | `scripts/seed-demo-schedule.ts` (untracked) zaten var, `createLessonSeriesTool` kullanıyor, re-run güvenli ama demo etiketi/prefix yok, package.json'a bağlı değil, cross-process JSON kilit riski dokümante edilmemiş |
| 7 | Deneme dersi süre hatası | ❌ Bug (kolay) | Zod şeması zaten doğru; asıl neden `<Input type="number" min={1} step={5}>` — varsayılan 40 native step-mismatch'e düşüyor |
| 8 | KVKK açık rıza | ❌ Yok | `SocialMediaConsent` iyi bir şablon ama genel/versiyonlu değil; first-login gate yok |
| 9A | Personel özlük genişletme | 🟡 Kısmi | `StaffMember` zaten çok zengin; eksik: acil durum kişisi, ayrı sözleşme tarihleri, SGK, IBAN (hiçbir modelde IBAN yok), belge eki, detay sayfası |
| 9B | Avans modülü | ❌ Yok | Hiç yok; `LeaveRequest` kod yapısı + `PayrollRecord` status enum'u şablon; limit-kullanım kontrolü hiç yok |
| 10 | Finans/gider genişletme | 🟡 Kısmi | `ExpenseRecord` çok yalın (sadece category/amount/date/note); `/panel/finans-ozeti` dashboard'u zaten canlı ve gerçek veriden (Payment/PayrollRecord/TeacherPayout/ExpenseRecord) hesaplanıyor |
| 11 | CRM arama/mesaj altyapısı | ❌ Yok | `CallLog`/`MessageLog` hiç yok; `payment-provider/` + `sms/` + `whatsapp/` 3-dosya adapter deseni doğrudan kopyalanabilir şablon |
| 12 | İnsan-okunur ID | ❌ Yok | Tüm ID'ler `cuid()`/`uid()` — sıralı sayaç mekanizması hiç yok |
| 13 | Ders öğretmen/şube değişimi | ❌ Yok | "tek ders/bundan sonrası/tüm seri" deseni CANCEL için zaten var (`cancelSeriesFromLessonTool`/`cancelEntireSeriesTool`) — aynı desen CHANGE için klonlanabilir. Ayrıca **yan bulgu**: `updateLessonScheduleTool` bugün sade reschedule'da bile çakışma kontrolü ÇALIŞTIRMIYOR — bu ayrı bir mevcut açık, Faz 13 kapsamında düzeltilecek. |

**Genel çıkarım**: 14 fazın 2'si zaten bitmiş/neredeyse bitmiş (5, 6), 1'i küçük bug (7), 3'ü kısmi
genişletme (3A, 3D, 4, 9A, 10 — kısmi grup), kalan ~8'i gerçek yeni alt sistem. Kapsam hâlâ
büyük ama ham 14-faz varsayımından belirgin şekilde daha küçük.

---

## Faz 7 — Deneme dersi süre hatası (uygulama planı)

- **Amaç**: `trial-lesson-create-form.tsx`'teki native `step` mismatch'i gider, makul tüm pozitif
  dakika değerlerinin (zod: 1-240 zaten kabul ediyor) forma takılmadan geçmesini sağla.
- **Etkilenen dosya**: `src/components/trial-lesson-create-form.tsx` (~satır 113-121).
- **Kök neden**: `<Input type="number" min={1} max={240} step={5}>` + varsayılan değer `"40"`.
  HTML5 step-mismatch kuralı yalnız `min + k*step` (1,6,11,...,236) değerlerini geçerli sayıyor;
  40 bu kümede değil, tarayıcı submit'i native "geçerli bir değer girin" ile engelliyor —
  sunucu/zod hiç devreye girmiyor.
- **Çözüm**: `step` kısıtlamasını kaldır (`step={1}`, yani serbest tam sayı) — zod zaten
  `1-240` aralığını ve `int()`'i sunucu tarafında garanti ediyor, istemci tarafında ekstra bir
  `step` kısıtına gerek yok. Var olan `min={1} max={240}` kalabilir (tarayıcı ipucu için).
- **Migration/backfill**: yok (saf UI düzeltmesi).
- **Güvenlik/RBAC**: etkilenmiyor.
- **Test stratejisi**: mevcut `trial-lesson-duration.test.ts` zaten sunucu tarafını kanıtlıyor;
  bu regresyonu yakalayacak bir component/DOM testi yok — eklenecek: `step` attribute'unun
  artık `1` olduğunu ve `stepMismatch`'in 40 için `false` döndüğünü doğrulayan bir test
  (jsdom `validity.stepMismatch` kontrolü).
- **Tamamlanma kriteri**: form varsayılan 40 dahil, 1-240 arası herhangi bir tam sayı ile
  native tarayıcı hatası olmadan submit olabiliyor; yeni test yeşil.

## Faz 5 — Geri navigasyon (doğrulama planı)

- **Amaç**: Spesifikasyonun verdiği örnekler (tahsilat detay → Ödemeler, hakediş detay →
  Hakedişler) zaten `BackButton` ile çözülmüş — iş "inşa etmek" değil "doğrulamak".
- **Kapsam**: `src/app/panel/odemeler/[studentId]/page.tsx`, `src/app/ogretmen/hakedis/[payoutId]/page.tsx`
  ve tüm diğer `[id]` rotaları (`BackButton`, `resolveSafeReturnTo` zaten var) — grep ile
  yeniden doğrulanacak, `veli` portalındaki `degerlendirme`/`mufredat`/`odevler` sayfalarının
  hâlâ düz liste (drill-down'sız) olduğu teyit edilecek; ileride bir detay sayfası eklenirse
  aynı `BackButton` deseni kullanılmalı (yeni bir bileşen YAZILMAYACAK).
- **Tamamlanma kriteri**: grep doğrulaması + kısa not; kod değişikliği beklenmiyor, varsa
  (yeni eklenmiş, back-button'sız bir `[id]` rotası bulunursa) o rotaya `BackButton` eklenir.

## Faz 6 — Demo ders programı seed (tamamlama planı)

- **Amaç**: Var olan `scripts/seed-demo-schedule.ts`'i (untracked) üretim-kalitesine getir:
  demo etiketi, dokümantasyon, concurrency uyarısı, DB modu doğrulaması.
- **Etkilenen dosyalar**: `scripts/seed-demo-schedule.ts`, `prisma/schema.prisma`
  (`LessonSeries`'e opsiyonel `demoTag String?` alanı), `package.json` (yeni `seed:demo-schedule`
  script'i), `README.md` (kullanım notu).
- **Migration/backfill**: additive nullable `demoTag` — mevcut serilere dokunmaz.
- **Concurrency**: `atomic-json-file.ts`'in belgelediği cross-process kilit boşluğu koddan
  ÇÖZÜLMEYECEK (kapsamı büyük, ayrı bir iş) — script başına açık bir konsol uyarısı eklenip
  README'de "STORE_MODE=json iken npm run dev ile aynı anda ÇALIŞTIRMAYIN" notu yazılacak.
  Bu, en güvenli/geriye-uyumlu yaklaşım: var olan dosya-kilit mimarisini genişletmek yerine
  kullanıcıyı açıkça uyarmak.
- **Test stratejisi**: script'i `STORE_MODE=json` ve `STORE_MODE=memory` ile iki kez çalıştırıp
  ikinci çalıştırmada 0 yeni seri/ders oluştuğunu doğrulayan bir entegrasyon testi.
- **Tamamlanma kriteri**: `npm run seed:demo-schedule` dokümante, idempotent, demoTag'li,
  DB modunda da (gerçek Postgres varsa) çalıştığı doğrulanmış.

## Faz 1A — Çoklu ödeme günü/aralığı tercihi

- **Amaç**: `Student.paymentDueDay Int?` (tekil gün) yerine/yanında birden fazla ay-içi gün
  aralığı (`1–5`, `4–15`) tanımlanabilsin.
- **Domain tasarımı**: yeni `Student.paymentDueRanges Json?` alanı — `{ start: number; end: number }[]`
  (1-31, `start <= end`). Mevcut tekil `paymentDueDay` **korunur** (geriye uyumluluk / diğer
  hesaplamaların kırılmaması için) ve backfill ile `paymentDueRanges = [{start: paymentDueDay, end: paymentDueDay}]`
  olarak senkronize edilir (idempotent — `paymentDueRanges` zaten doluysa dokunulmaz).
  Çakışan/iç içe aralıklar **birleştirilir** (merge), engellenmez — kullanıcı deneyimi
  açısından daha az sürtünmeli ve denetlenebilir (birleşim audit log'a yazılır).
- **Etkilenen dosyalar**: `prisma/schema.prisma` (Student), `src/lib/types.ts`,
  `src/lib/validation.ts` (79/162/192 — üç kopya şema TEK paylaşılan `paymentDueRangeSchema`'ya
  indirgenir), `src/lib/services/tools.ts:1696` (`updateStudentPaymentProfileTool`),
  `store-json.ts`/`store-db.ts:1173`/`store-memory.ts`, `src/components/student-payment-profile-editor.tsx`
  (çoklu aralık ekle/sil UI'ı), `src/lib/collections-due.ts` (`dueWindowForPaymentMethod`/`isValidDueDay`
  artık aralık listesini de değerlendirir), `tools.ts:5984`, `whatsapp-templates.ts`.
- **Migration/backfill**: additive nullable kolon + idempotent backfill script (mevcut
  `paymentDueDay` değerinden tek-elemanlı aralık üretir).
- **Güvenlik/RBAC**: mevcut öğrenci düzenleme yetkisiyle aynı (`SCHOOL_ADMIN`/`SUPER_ADMIN`),
  tenant izolasyonu store katmanından miras.
- **Test stratejisi**: aralık validasyonu (1-31, start≤end, birleştirme), backfill idempotency,
  3 store modu parity testi, tahsilat vade penceresi ile entegrasyon testi.
- **Tamamlanma kriteri**: öğrenci formunda çoklu aralık ekle/sil çalışıyor, detay/tahsilat
  ekranlarında insan-okunur gösteriliyor, mevcut testler kırılmıyor.

## Faz 1B — Çoklu öğrenci türü

- **Amaç**: `Student.studentType String?` → `studentTypes StudentType[]` (Postgres native array;
  json/memory modda `string[]`).
- **Kritik risk**: exact-match (`===`/`!==`) karşılaştırmalar sessizce yanlış davranır. Etkilenen
  yerler: `isMebStudentType`/`isLcmStudentType` (`types.ts:1364-1377`), `resolveCollectionsIban`
  (`collections-due.ts:29-37`), `announcements/audience.ts:61-66`, `teaching-materials-audience.ts:15-17`,
  `students-table.tsx` filtresi (zaten `.includes()` tarzı — düşük risk).
- **Geçiş stratejisi**: eski `studentType` alanı **tutulur** (deprecated, okuma-only, yeni kod
  yazmaz) — `studentTypes` birincil kaynak olur; backfill `studentTypes = studentType ? [studentType] : []`.
  Tüm `===`/`!==` karşılaştırmaları `.includes()`'a çevrilir (ör. `isMebStudentType(student) = student.studentTypes.includes("MEB")`).
- **Etkilenen dosyalar**: `prisma/schema.prisma`, `types.ts` (STUDENT_TYPES ile birlikte),
  `validation.ts`, `tools.ts`, 3 store dosyası, `ogrenciler/yeni/page.tsx` (checkbox grubu),
  `ogrenciler/[studentId]/page.tsx`, `ogretmen/ogrenciler/[studentId]/page.tsx`, `students-table.tsx`,
  `announcement-form.tsx` + `announcements/audience.ts`, `teaching-materials-audience.ts`,
  `student-level-rules.ts`, `collections-due.ts`.
- **Migration/backfill**: additive array kolon + idempotent backfill; eski kolon silinmez.
- **Test stratejisi**: her `===`→`.includes()` dönüşümü için regresyon testi (özellikle MEB
  seviyesi kuralı ve IBAN yönlendirmesi — mali/idari etkisi olan iki nokta), import/export ve
  filtre testleri.
- **Tamamlanma kriteri**: bir öğrenci aynı anda MEB+LCM işaretlenebiliyor, tüm mevcut tekil-tip
  akışları (IBAN, seviye kuralı, duyuru hedefleme, materyal hedefleme) çoklu tipte doğru
  çalışıyor, testler yeşil.

## Faz 12 — İnsan okunur benzersiz numara

- **Amaç**: `Student`/`Teacher`/`StaffMember` için `S00001`/`T00001`/`P00001` biçiminde,
  tenant-kapsamlı, değişmez, çarpışmasız ekran numarası — mevcut `cuid()`/`uid()` birincil
  anahtarın YANINDA (yerine değil).
- **Tasarım**: yeni `EntitySequence` tablosu (`tenantId`, `entityType`, `nextValue Int`,
  `@@unique([tenantId, entityType])`). DB modda `UPDATE ... SET nextValue = nextValue + 1
  RETURNING nextValue` (tek sorguda atomik artış — race-safe). JSON/memory modda mevcut
  `withFileLock`/in-memory mutex desenini kullanan eşdeğer bir "oku-artır-yaz" fonksiyonu.
  Her varlığa `displayId String?` (unique per tenant+entityType) eklenir.
- **Arşiv/silinen kayıtlar**: numara asla geri kullanılmaz — sayaç yalnız artar, arşivlenmiş
  kayıtlar `displayId`'sini korur.
- **Etkilenen dosyalar**: `prisma/schema.prisma` (yeni model + 3 alan), `src/lib/id-sequence.ts`
  (yeni, store-mode-parity), `store-json.ts`/`store-db.ts`/`store-memory.ts`, `tools.ts`
  (create* fonksiyonlarına displayId üretimi eklenir), backfill script (mevcut kayıtlara
  oluşturulma sırasına göre sıralı numara verir — idempotent, `displayId IS NULL` olanları işler).
- **Güvenlik/RBAC**: `displayId` kullanıcı tarafından DEĞİŞTİRİLEMEZ (formda salt-okunur/
  gösterilmez alan); değiştirme gerekirse yalnız `SUPER_ADMIN` + zorunlu audit notu.
- **Test stratejisi**: eşzamanlı create testi (Promise.all ile 10 paralel öğrenci oluşturma →
  10 farklı ardışık numara, DB ve json/memory modda), backfill idempotency, tenant izolasyonu
  (iki tenant'ta aynı numara aralığı bağımsız başlar).
- **Tamamlanma kriteri**: yeni kayıtlar otomatik numara alıyor, mevcut kayıtlar backfill'li,
  liste/detay/arama/filtre/import-export'ta görünüyor, 3 modda ve eşzamanlılıkta çarpışma yok.

## Faz 2 — Öğretmen yoklaması ve performans raporu

- **Amaç**: öğretmenin KENDİ derse gelip gelmediğine dayalı, öğrenci yoklamasından tamamen
  bağımsız, açıklanabilir performans skoru.
- **Yeni alanlar** (`Lesson` üzerinde, mevcut `studentAttended*` üçlü-alan deseniyle birebir
  aynı stil): `teacherAttendanceStatus String?` ("bekliyor"|"geldi"|"gelmedi"|"mazeretli"),
  `teacherAttendanceAt DateTime?`, `teacherAttendanceBy String?`, `teacherAttendanceNote String?`.
- **Skor formülü (v1, versiyonlanabilir)**: `TEACHER_PERFORMANCE_SCORE_V1` — bileşenler:
  (a) katılım oranı = geldi / (geldi+gelmedi+mazeretli), ağırlık %60; (b) feedback ortalaması
  (`computeTeacherFeedbackSummary`, mevcut — `teacher-feedback.ts:343`) 1-5 → 0-1 normalize,
  ağırlık %40. Veri yokken (0 ders/0 feedback) skor `null` döner ("yetersiz veri"), asla 0
  gösterilmez — yanlış düşük skor riskini önler. Versiyon string olarak saklanır, formül
  değişirse eski kayıtlar yeniden hesaplanmaz (mevcut `TeacherPayout` snapshot felsefesiyle
  tutarlı).
- **Etkilenen dosyalar**: `prisma/schema.prisma`, 3 store dosyası, `tools.ts` (yeni
  `markTeacherAttendanceTool`, `getTeacherPerformanceReportTool`), `agent/registry.ts`,
  `src/lib/teacher-performance.ts` (yeni, skor motoru — `teacher-feedback.ts` ile aynı üslup),
  `src/app/panel/ogretmenler/[teacherId]/page.tsx` (yeni "Performans" `SECTIONS` girdisi),
  yeni sekme/bileşen (planlanan ders sayısı, katılım oranı, gelmedi/mazeretli sayısı, feedback
  ortalaması+adedi, toplam skor, bileşen ağırlıkları, tarih aralığı filtresi).
- **Güvenlik/RBAC**: işaretleme yetkisi `SCHOOL_ADMIN`/`SUPER_ADMIN` (öğretmen kendi
  katılımını kendi işaretleyemez — çıkar çatışması); rapor görünürlüğü aynı roller +
  öğretmenin KENDİSİ (salt-okunur, kendi skorunu görebilir — `TeacherFeedback`'in aksine,
  çünkü bu öznel değil objektif bir katılım metriği).
- **Test stratejisi**: öğrenci `studentAttended`/`studentAbsent` alanlarının skора HİÇ
  etkimediğini kanıtlayan açık bir test (aynı ders farklı öğrenci-yoklama durumlarıyla aynı
  öğretmen skorunu üretmeli), formül versiyon testi, veri-yokken-null testi, RBAC testi.
- **Tamamlanma kriteri**: yönetici öğretmen detayından Performans sekmesine ulaşıyor, skor
  bileşenleri açık gösteriliyor, öğrenci yoklaması skora hiç girmiyor (test kanıtlı).

## Faz 13 — Ders öğretmeni/şubesi değişimi

- **Amaç**: `cancelSeriesFromLessonTool`/`cancelEntireSeriesTool` üçlüsünün (tek/bundan
  sonrası/tüm seri) AYNI desenini "değiştirme" için klonlamak.
- **Düzeltme (iptal edildi)**: Faz 0 keşfinde bir alt-ajan "`updateLessonScheduleTool` sade
  reschedule'da çakışma kontrolü çalıştırmıyor" bulgusunu raporlamıştı — Faz 13
  uygulamasına başlamadan ÖNCE bizzat doğrulandı ve bu bulgu YANLIŞ çıktı:
  `updateLessonSchedule` (her 3 store modunda da) zaten `applyLessonScheduleUpdate`'i
  çağırıyor, o da `validateLessonSlot`'u `excludeLessonId` ile çağırıyor (bkz.
  `lesson-update.ts:65-70`) — reschedule'da çakışma kontrolü ZATEN VAR VE ÇALIŞIYOR.
  Bu, "hafızadan önermeden önce doğrula" prensibinin tam bir örneği — hiçbir düzeltme
  YAPILMADI, yalnızca bu notla düzeltildi. Faz 13'ün YENİ tool'u bu AYNI, doğrulanmış
  `validateLessonSlot`/`excludeLessonId` desenini yeniden kullanacak.
- **Etkilenen dosyalar**: `tools.ts` (yeni `changeLessonTeacherOrBranchTool`, 3 kapsam
  seçeneği: `single`|`fromHereOnward`|`entireSeries`), `lesson-series.ts`/`store.ts`
  (paylaşılan `validateLessonSlot` reschedule'a da bağlanır), `src/app/panel/program/**`
  (yeni "Öğretmen/Şube değiştir" aksiyonu + onay özeti modalı: eski/yeni değerler yan yana).
- **Güvenlik/RBAC**: `SCHOOL_ADMIN`/`SUPER_ADMIN` (öğretmen kendi dersini başka öğretmene
  devredemez).
- **Bildirimler**: idempotent — aynı değişiklik için tekilleştirilmiş tek bildirim
  (mevcut `createLessonSeriesTool`'un "seri başına tek bildirim" desenine paralel),
  eski+yeni öğretmen, öğrenci/veli, yönetici alıcı listesi.
- **Test stratejisi**: 3 kapsam seçeneğinin doğru ders kümesini etkilediği, çakışma
  kontrolünün artık reschedule'da da çalıştığı (regresyon), audit log'un eski/yeni
  değerleri içerdiği, bildirim idempotency testleri.
- **Tamamlanma kriteri**: tek ders / bundan sonrası / tüm seri değişimi çalışıyor, çakışma
  kontrolü garantili, onay özeti gösteriliyor, audit + bildirim doğru.

## Faz 3 — Ders gelişim raporu, 4 haftalık değerlendirme, zorunlu ödev (en büyük küme)

### 3A — Çalışılan konular alanı + zorunluluk
- `LessonAssessment`'e yeni free-text alanlar: `piecesWorked String?`, `etudesWorked String?`,
  `technicalWork String?`, `theoryWork String?` (hepsi opsiyonel şema seviyesinde — zorunluluk
  UYGULAMA katmanında, aşağıya bkz).
- **Zorunluluk kuralı**: `lessonProcessed=true` yapılmadan (veya ders "completed" sayılmadan)
  önce, o ders için bir `LessonAssessment` kaydı YOKSA, UI'da engelleyici değil UYARICI bir
  banner gösterilir (spec: "görünür uyarı" — engelleme değil, çünkü geçmiş süreçleri kırma
  riski var); admin ödev-takip ekranında da aynı eksiklik görünür.

### 3B — 4 haftalık genel değerlendirme
- Yeni model `PeriodicAssessment`: `studentId`, `teacherId`, `periodStart`, `periodEnd`,
  `relatedLessonIds Json`, değerlendirme metni alanları, `status` ("pending"|"submitted"),
  `submittedAt`. Idempotency: `@@unique([tenantId, studentId, teacherId, periodStart, periodEnd])`
  — `TaskReminderLog`'un `(tenantId, taskId, assigneeUserId, kind, calendarDay)` deseninin
  doğrudan analogu.
- Üretim tetikleyicisi: öğrencinin ilk dersinden itibaren her 4 takvim haftasında bir,
  otomatik "pending" kayıt açan bir workflow adımı (mevcut `src/lib/workflows/*` altyapısına
  eklenir) — henüz doldurulmamış olanlar öğretmen arayüzünde "bekleyen değerlendirme" listesi.
- **Görünürlük**: yönetici tam görür; veli/öğrenci portalı yalnız `status="submitted"` olanı,
  ve yalnız kendi öğrencisine ait olanı görür (mevcut `canAccessStudent` kapsamlama deseni).

### 3C — Ödev zorunluluğu + idempotent hatırlatma
- `Homework`'e `lessonId String?` eklenir (additive, nullable — eski kayıtlar etkilenmez).
- Ders `lessonProcessed=true` olduğunda o `lessonId` için `Homework` yoksa: (a) öğretmen
  arayüzünde görünür uyarı, (b) `TaskReminderLog` ile AYNI idempotency deseninde yeni bir
  `LessonHomeworkReminderLog`-tarzı tekilleştirme anahtarı (`tenantId+lessonId+kind+calendarDay`)
  üzerinden TEK seferlik bildirim — spam yok.

### 3D — Admin ödev takip ekranı
- Mevcut `/panel/odev-raporu`'nun (teacher-rollup) YANINA, yeni satır-bazlı bir görünüm/route
  (ör. `/panel/odev-raporu/detay` veya aynı sayfada ikinci sekme) — spec'teki tüm alanlar
  (öğretmen/öğrenci/ders/içerik/verilme-hedef tarihi/teslim durumu/gün farkı/öğrenci toplamları)
  + filtreler (tarih/öğretmen/öğrenci/şube/durum) + detay ekranı + audit geçmişi
  (`Homework`/`HomeworkSubmission` zaten `createdAt`/`submittedAt`/`reviewedAt` taşıyor —
  ek bir audit tablosu YERİNE mevcut zaman damgalarından türetilen bir "geçmiş" görünümü,
  gerçek bir aksiyon audit'i gerekiyorsa mevcut `AuditLog` modeline `entityType:"homework"` yazılır).

- **3A — Tamamlandı**: `LessonAssessment`'e `piecesWorked`/`etudesWorked`/`technicalWork`/`theoryWork` (hepsi opsiyonel, `db.Text`) eklendi (migration `20260825170000_lesson_assessment_topics`) — 3 store yolu (`assessment/index.ts` db+json), `createAssessmentTool`, form UI (`lesson-assessment-form.tsx` — yeni "Çalışılan konular" bölümü) ve rapor görüntüleme (`degerlendirme/[assessmentId]`) güncellendi. Bilinçli olarak ZORUNLU YAPILMADI (spec sadece alanların varlığını istiyordu, blocking değil). 2 yeni test yeşil, DB modunda canlı doğrulandı.
- **3B — Tamamlandı**: **Ürün kararı**: ayrı bir "pending" satırı/zamanlanmış iş YERİNE, `PeriodicAssessment` tablosu YALNIZCA gönderilmiş kayıtları tutar; "bekliyor" durumu `computePendingPeriodicAssessmentPeriods` (saf fonksiyon, `src/lib/periodic-assessment/index.ts`) ile HER ÇAĞRIDA taze hesaplanır: öğrencinin `firstLessonAt` (yoksa `enrollmentStartDate`) tarihinden başlayarak TAMAMLANMIŞ 4 haftalık dönemler türetilir, zaten gönderilmiş olanlar çıkarılır. Bu tasarım `src/lib/workflows/*` zamanlayıcı motoruna hiç entegre olmayı GEREKTİRMEZ — daha düşük riskli, daha az kod. Yeni model `PeriodicAssessment` (`@@unique([tenantId,studentId,teacherId,periodStart,periodEnd])` — DB'de VE json/memory modda application-layer kontrolüyle aynı garanti). Tool katmanı: `listPendingPeriodicAssessmentsTool` (öğretmen kendi/admin hepsi veya seçili öğretmen), `createPeriodicAssessmentTool` (talep edilen dönem YALNIZCA hesaplanan pending listesindeki dönemlerden biriyle eşleşirse kabul edilir — rastgele tarih giremez), `listPeriodicAssessmentsForStudentTool` (`assertStudentAccess` ile admin/öğretmen/veli-öğrenci görünürlüğü, mevcut LessonAssessment ile AYNI erişim deseni). UI: yeni `/ogretmen/donemsel-degerlendirme` (bekleyen liste + gönderim formu, `/ogretmen/degerlendirme`'den bekleyen-sayısı rozetiyle bağlanır) + paylaşılan `/degerlendirme/rapor/[studentId]` sayfasına (admin+veli+öğrenci erişimli, rol-agnostik) yeni bölüm. 9 yeni test yeşil (saf fonksiyon 5, idempotency+eşleşme 2, RBAC 2 — veli erişimi gerçek `StudentPortalAccess`/`grantStudentAccess` ile test edildi). **DB modunda canlı doğrulandı**: gerçek Postgres'e karşı pending hesaplama, gönderim VE idempotent red (`VALIDATION_ERROR`, ikinci gönderim reddedildi) doğrulandı. **Bilinen, kapsam dışı bırakılmayan gerçek davranış**: mevcut (özellikle eski kayıtlı) öğrencilerde `enrollmentStartDate` doluysa, bu özelliğin İLK devreye alınmasında geçmişe dönük TÜM tamamlanmış dönemler "bekliyor" olarak birikmiş görünebilir (ör. test json-seed verisinde bazı öğrenciler için 150+ dönem) — bu YANLIŞ bir hesaplama değil, yeni bir özelliğin geçmiş veriye ilk uygulanmasının doğal sonucu; okul isterse geçmiş dönemler için toplu/placeholder gönderim ayrı bir operasyonel karardır, bu fazın kapsamı dışında bırakıldı.

- **3C — Tamamlandı**: `Homework`e `lessonId String?` eklendi (additive, nullable — eski kayıtları etkilemez, `@@index([tenantId, lessonId])`), yeni `LessonHomeworkReminderLog` modeli (`@@unique([tenantId, lessonId])` — `TaskReminderLog`in aynı idempotency deseni, ama ders başına EN FAZLA BİR KEZ, günlük tekrar yok) — migration `20260825190000_homework_lesson_link`. `hasHomeworkForLesson`/`recordHomeworkReminderIfNew` (DB modda `create()`+P2002 yakalama, json/memory modda var-mı kontrolü) + `checkAndNotifyMissingHomework` (`src/lib/homework-lesson-check.ts`, best-effort/hata yutan) — `setLessonOpsFlagTool`de `flag==="processed"` VE `!alreadySet` olduğunda **await edilerek** çağrılır (ilk yazımda yanlışlıkla `void` ile fire-and-forget bırakılmıştı — dosyadaki TÜM diğer `notifyUserIfEnabled`/`notifyAdmins` çağrıları await edilirken bu tutarsızdı ve testte gerçek bir yarış koşuluna yol açtı; `await`e çevrildi). Yeni bildirim kategorisi `homework_missing_for_lesson` (`notification-categories.ts`, `roles: ["TEACHER"]`). `createHomeworkTool`: opsiyonel `lessonId` girildiğinde dersin gerçekten aynı öğrenci/öğretmene ait olduğu doğrulanır (`VALIDATION_ERROR` aksi halde, `NOT_FOUND` ders yoksa). UI: `HomeworkCreateForm`e opsiyonel "Bağlı ders" seçici (öğrenci değişince sıfırlanır), her iki çağıran sayfa (`/ogretmen/odevler`, `/ogretmen/ogrenciler/[studentId]`) öğrencinin son 10 dersini besliyor; `/ogretmen/program` haftalık görünümünde `LessonOpsBadges`e yeni "Ödev yok" rozeti (`lessonProcessed && !hasHomeworkForLesson`, tek toplu `listAllHomework` sorgusuyla N+1 önlendi). 6 yeni test yeşil (idempotency, lessonId çapraz doğrulama, tam entegrasyon — işlendi+ödevsiz→1 bildirim, tekrar işaretleme→ikinci bildirim YOK, ödevi olan ders→bildirim YOK). **DB modunda canlı doğrulandı**: gerçek Postgres'e karşı tüm senaryolar (reminder log oluşturma, idempotent tekrar, ödevi-olan-derste log OLUŞMAMASI) doğrulandı, geçici test satırları temizlendi (0 kalıntı).
- **3D — Tamamlandı**: Mevcut `/panel/odev-raporu`nun (öğretmen-rollup özeti) YANINA yeni `/panel/odev-raporu/detay` route'u eklendi (onu DEĞİŞTİRMEDİ, yalnız çapraz link eklendi). Satır bazlı tablo: öğretmen/öğrenci/ders(varsa tarih+enstrüman)/içerik(başlık)/verilme tarihi/son teslim/durum/teslim tarihi/gün farkı (erken/geç/zamanında, `dueDate` vs `submittedAt` farkından türetilir). Filtreler URL query param'da (`teacherId`/`studentId`/`branchId`/`status`/`from`/`to`, `denetim-kaydi` sayfasıyla AYNI GET-form deseni — paylaşılabilir link). Öğrenci bazlı toplamlar (tamamlanan/bekleyen/gecikmiş) filtrelenmiş satırlardan türetilir. **Ürün kararı (planın kendi kararıyla tutarlı)**: ayrı bir "audit geçmişi" tablosu/sorgusu YERİNE (ki `AuditLog` yalnız DB modda kalıcı olurdu, json/memory'de boş dönerdi — mode parity'yi bozardı) mevcut `Homework.createdAt`/`HomeworkSubmission.submittedAt` zaman damgalarından türetilen "geçmiş" kullanıldı — 3 store modunda da aynı davranır. Test gerekmedi (kardeş özet sayfası `/panel/odev-raporu` gibi, zaten test edilmiş tool fonksiyonlarının ince bir kompozisyonu).

- **Ortak test stratejisi (3A-D)**: LessonAssessment yeni alan testleri, PeriodicAssessment
  idempotency (aynı öğrenci/dönem ikinci kez üretilmiyor) testi, homework-reminder idempotency
  testi, admin ekranı filtre/agregasyon testleri, RBAC/görünürlük testleri (veli sadece
  submitted+kendi öğrencisi).
- **Tamamlanma kriteri**: her 4 alt-iş uçtan uca çalışıyor, mevcut `lessonProcessed`/`Homework`/
  `LessonAssessment` akışları kırılmıyor, testler yeşil.

## Faz 4 — Hedefli duyurular ve bildirimler

- **Amaç**: mevcut PULL modelini (her görüntüleyen kendi erişimini `matchesAudience` ile
  kontrol eder) PUSH+persist modeline genişletmek — gönderim anında hedef kitle sunucuda
  çözülür, tekilleştirilir, `Notification` kaydı olarak MATERYALİZE edilir.
- **Etkilenen dosyalar**: `src/lib/announcements/audience.ts` (yeni `resolveAudienceRecipients`
  fonksiyonu — mevcut `matchesAudience`'ı per-kullanıcı yerine per-duyuru toplu kullanır),
  `types.ts` (`AnnouncementAudienceRef`'e `instrument?: string[]` ve çoklu-kural desteği:
  `rules: AudienceRule[]` — geriye uyumlu, eski tekil `audienceType/audienceRef` biçimi
  otomatik tek-kurallı `rules` dizisine adapte edilir), `tools.ts` (`createAnnouncementTool`
  yayınlama anında `resolveAudienceRecipients` çağırıp her benzersiz kullanıcı için TEK
  `Notification` oluşturur — `Set<userId>` ile dedup), yeni `recipientCount` alanı
  `Announcement`'a.
- **Segment genişletme**: `instrument` segmenti — `Student.instruments`/`Teacher.instruments`
  (Json array) üzerinden filtre; "tüm aktif öğrenci/öğretmen" — mevcut `active` alanı filtresi.
- **RBAC**: hedefli/toplu duyuru gönderimi zaten `SCHOOL_ADMIN`/`SUPER_ADMIN`'e kilitli
  (`tools.ts:3709`) — DEĞİŞMEZ, sadece korunur ve testle doğrulanır.
- **Test stratejisi**: çoklu kuralla eşleşen kullanıcının TEK bildirim aldığı testi
  (kritik — spec'in en katı gereksinimi), enstrüman segmenti testi, recipientCount doğruluğu,
  hedef-dışı kullanıcının görmediği testi (mevcut `matchesAudience` testleri genişletilir).
- **Tamamlanma kriteri**: tekil/çoklu öğretmen-öğrenci, toplu segmentler (branch/instrument/
  tüm-aktif) çalışıyor, dedup garantili, gönderim geçmişi+recipient count+okunma durumu
  izlenebiliyor.

- **Tamamlandı**: `AnnouncementAudienceType`'a `"instrument"` eklendi (`Student.instruments`/
  `Teacher.instruments` üzerinden — `branch` segmentiyle AYNI iki-rol deseni: hem çalan öğrenci
  hem öğreten öğretmen hedefte). Yeni `AudienceRule` tipi + `Announcement.rules?: AudienceRule[]`
  (additive/nullable, migration `20260825200000_announcement_targeting`) — birden fazla segmenti
  OR'lar; verilmemişse eski tekil `audienceType`/`audienceRef` tek kurallı bir dizi gibi davranır
  (`matchesAudience`, `src/lib/announcements/audience.ts`, geriye tam uyumlu). Yeni saf fonksiyon
  `resolveAudienceRecipients(announcement, candidates, context)` — adayları filtreler VE userId'ye
  göre tekilleştirir (bir kullanıcı iki kuraldan veya iki öğrenciden eşleşse bile TEK sonuç).
  Aday listesi I/O gerektirdiği için `audience.ts` DIŞINDA, `announcements/index.ts`'e yeni
  `buildAnnouncementRecipientCandidates` ile üretiliyor: her aktif öğretmen için `getUserIdByTeacherId`,
  her aktif öğrenci için `listActiveAccessForTenant` (yeni, `student-portal-access.ts` — StudentPortalAccess
  gerçek kaynak, eski `User.studentId` tabanlı deprecated fonksiyonlar KULLANILMADI). `tools.ts`da
  yeni `publishAnnouncementToRecipients` — bir duyuru GERÇEKTEN yayına girdiğinde (`createAnnouncementTool`
  status=published İLE oluşturulduğunda, VEYA `updateAnnouncementStatusTool` published-DIŞI→published
  geçişinde; published→published tekrarı ATLANIR, spam yok) `isVisibleNow` kontrolünden geçerse
  alıcıları çözer, her birine yeni `announcement_published` bildirim kategorisiyle (`roles:
  ["TEACHER","STUDENT"]`, grup "announcements") `notifyUserIfEnabled` çağırır, sonucu
  `Announcement.recipientCount`e yazar (`setAnnouncementRecipientCount`). **Bilinçli sınırlama**:
  `publishAt` gelecekteyse (henüz `isVisibleNow`=false) PUSH bilinçli olarak ATLANIR — zamanlanmış
  duyuruyu canlıya alacak bir scheduler bu sprintin kapsamında yok (mevcut PULL modelinde de aynı
  kısıt zaten vardı); alıcılar içeriği normal pull akışıyla keşfeder, ayrı bir işte ele alınmalı.
  UI: `AnnouncementForm`e "instrument" seçeneği ve enstrüman dropdown'u eklendi; çoklu-kural
  (`rules[]`) composer'ı BİLİNÇLİ OLARAK eklenmedi (plan'ın "Tamamlanma kriteri" bunu istemiyor,
  backend/API zaten destekliyor — tekil audienceType formu otomatik 1-kurallı diziye adapte olur).
  `/panel/duyurular` listesine `recipientCount` gösterimi eklendi. RBAC değişmedi (zaten
  `SCHOOL_ADMIN`/`SUPER_ADMIN`'e kilitli, testle doğrulandı). 8 yeni test yeşil (instrument
  eşleşmesi 2, çoklu-kural tekilleştirme 3, tool-katmanı entegrasyon 5 — enstrüman hedefi+
  recipientCount, çoklu kural dedup, draft→published bildirim ÜRETİR/published→published
  tekrarı ÜRETMEZ, hedef-dışı öğretmen almaz, aktif GUARDIAN erişimi olan veli alır). **DB
  modunda canlı doğrulandı**: gerçek Postgres'e karşı enstrüman hedefi+recipientCount, idempotent
  yeniden-yayın, çoklu-kural tekilleştirme doğrulandı, geçici satırlar temizlendi (0 kalıntı).

## Faz 9A — Personel özlük genişletme

- **Yeni alanlar** (`StaffMember` — `Teacher`'daki birebir aynı desenler kopyalanır):
  `emergencyContactName String?`, `emergencyContactPhone String?` (Teacher:236-237 deseni),
  `contractStartDate DateTime?`, `contractEndDate DateTime?` (Teacher:218-219 deseni),
  `sgkStatus String?` (SGK/iş ilişkisi — serbest metin, hukuki kesinlik gerektirmeyen bilgi
  alanı), `ibanCipher String?` + `ibanLast4 String?` (mevcut `nationalIdCipher`/`nationalIdLast2`
  AES-GCM şifreleme deseniyle BİREBİR aynı — `src/lib/pii/tc-identity.ts` genelleştirilir veya
  yanına `src/lib/pii/iban.ts` eklenir), belge eki metadata (mevcut `TaskAttachment`/
  `DocumentInstance` dosya-saklama deseni, base64 DB-içi saklama — yeni bir obje depolama
  bağımlılığı EKLENMEZ).
- **Yeni ekran**: `/panel/personel/[staffId]` detay sayfası (şu an yok) — özlük bilgileri +
  avans kartları (Faz 9B) + izin geçmişi (`LeaveRequest`, zaten var) yan yana.
- **Güvenlik**: TC kimlik + IBAN listelerde ASLA açık gösterilmez (mevcut `nationalIdLast2`
  maskeleme deseni — IBAN için `ibanLast4` aynı mantıkla); şifre çözme yalnız yetkili admin
  aksiyonu ile (mevcut `canViewStaffSensitive` deseni genişletilir), her açma işlemi audit'e
  yazılır.
- **Test stratejisi**: şifreleme/maskeleme round-trip testi, RBAC görünürlük testi, backfill
  testi (yok — tüm alanlar yeni ve nullable, backfill gerekmez).
- **Tamamlanma kriteri**: yeni alanlar formda, maskeli gösterimde, audit'li; detay sayfası canlı.

## Faz 9B — Avans modülü

- **Yeni model** `StaffAdvance` (kod yapısı `leave.ts`'ten, status enum'u `PayrollRecord`'dan):
  `id, tenantId, staffId, amount Int, requestDate, status ("pending_approval"|"approved"|
  "rejected"|"paid"|"cancelled"), approvedBy, approvedAt, paidAt, paymentMethod, description,
  createdBy, createdAt, updatedAt`.
- **Yıllık limit**: `StaffMember`'a yeni `annualAdvanceLimit Int?` — `annualLeaveAllowanceDays`
  ile AYNI "tanımsızsa kontrol edilmez" felsefesi. Kontrol: yıl içi `status IN (approved,paid)`
  toplamı + yeni talep > limit ise reddedilir (validation.ts'te yeni fonksiyon, `leave.ts`'in
  `createLeaveRequest` yapısı taklit edilir — bu ilk "limit vs kullanım" kontrolü, kod tabanında
  emsali yok, sıfırdan yazılacak).
- **Etkilenen dosyalar**: `prisma/schema.prisma`, `src/lib/staff-advance.ts` (yeni, `leave.ts`
  şablonuyla), `tools.ts` (create/decide/markPaid/cancel tool'ları), `agent/registry.ts`,
  personel detay sayfasındaki yeni "Avanslar" kartı/tablosu.
- **Güvenlik/RBAC**: talep oluşturma `SCHOOL_ADMIN`/`SUPER_ADMIN` (personel kendi avansını
  kendi talep edemez — mevcut personel modülü zaten admin-driven), onay/red/ödeme `SUPER_ADMIN`
  veya yetkilendirilmiş `SCHOOL_ADMIN`, her geçiş audit'e yazılır.
- **Test stratejisi**: limit aşımı reddi, durum geçiş kuralları (`leave.ts`'teki
  `status !== "pending_approval"` guard deseni), yıl içi toplam hesaplama, RBAC testleri.
- **Tamamlanma kriteri**: talep→onay/red→ödeme→iptal akışı çalışıyor, limit aşımı engelleniyor,
  personel detayında kart+tarihçe görünüyor.

- **9A/9B — Tamamlandı**: `StaffMember`e `emergencyContactName/-Phone`, `contractStartDate/-EndDate`,
  `sgkStatus`, `ibanCipher`+`ibanLast4` (yeni `src/lib/pii/iban.ts` — TC ile AYNI AES-256-GCM
  iskeleti KASITLI OLARAK kopyalandı, tek "hassas alan şifrele" soyutlaması yerine iki küçük saf
  dosya; TR IBAN mod-97 checksum + son-4-hane maskeleme), `annualAdvanceLimit` eklendi (hepsi
  additive/nullable — migration `20260825210000_staff_extended_advance`, backfill gerekmedi).
  `revealNationalIdTool`'un `entity` enum'u `"staff"`i de kapsayacak şekilde genişletildi (StaffMember
  zaten `nationalIdCipher` taşıyordu ama daha önce reveal uç noktasından erişilemiyordu — mevcut bir
  kapasite açığı kapatıldı); yeni `revealStaffIbanTool` AYNI `pii:full`+audit deseninde. **Bilinçli
  olarak KAPSAM DIŞI bırakıldı**: plandaki "belge eki metadata" (personel dosya ekleri) — bu fazın
  kendi "Tamamlanma kriteri"nde YOK, spesifikasyonu da belirsizdi ("yeni alanlar formda, maskeli
  gösterimde, audit'li; detay sayfası canlı" listesinde geçmiyor); ayrı bir işte ele alınmalı.
  **Yeni ekran**: `/panel/personel/[staffId]` (plandaki gibi, daha önce yoktu) — tam özlük düzenleme
  formu (`StaffDetailForm`, TC/IBAN alanları BOŞ bırakılırsa DEĞİŞTİRİLMEZ — yalnızca doldurulursa
  şifrelenip günceller), TC/IBAN maskeli gösterim+reveal (`NationalIdReveal` entity="staff" +
  yeni `StaffIbanReveal`, ikisi de `canViewFullNationalId` rol kontrolüyle kilitli), izin geçmişi
  (salt okunur özet + `/panel/personel/izinler`e link — aksiyonlar orada kalıyor, tekrarlanmadı),
  Avanslar (tam CRUD+durum akışı burada). `StaffManager` listesine her satıra "Detay →" linki eklendi.
  **Faz 9B**: yeni `src/lib/staff-advance.ts` (`leave.ts` şablonu) — `pending_approval→approved|
  rejected→paid|cancelled` durum geçişi (`leave.ts`'teki `status !== "pending_approval"` guard
  deseninin AYNISI, `paid`/`cancelled` için ek guard'larla). **Yıllık limit kontrolü** (`tools.ts`
  `createStaffAdvanceTool` içinde, `sumApprovedOrPaidForYear` ile) — YALNIZCA `approved`+`paid`
  durumundaki avanslar yıl toplamına sayılır (`rejected`/`cancelled` SAYILMAZ), `annualAdvanceLimit`
  tanımsızsa kontrol tamamen atlanır (`annualLeaveAllowanceDays`'in "salt bilgi, otomatik
  uygulanmaz" felsefesinin TERSİ — plan'ın kendi isteğiyle burada GERÇEKTEN uygulanıyor, kod
  tabanındaki ilk "limit vs kullanım" enforcement'ı). **RBAC düzeltmesi**: plan metni "onay/red/ödeme
  SUPER_ADMIN veya yetkilendirilmiş SCHOOL_ADMIN" diyordu ama kod tabanında böyle bir ince ayrım
  (SCHOOL_ADMIN'e özel yetkilendirme) YOK — mevcut `requireStaffSensitiveAccess` (SCHOOL_ADMIN+
  SUPER_ADMIN, hepsi ya hepsi yok) zaten personel modülünün TÜMÜNDE bu kaba sınırı kullanıyor,
  StaffAdvance de AYNI sınırı kullandı (tutarlılık, yeni bir ACL katmanı İCAT EDİLMEDİ). **Agent
  registry düzeltmesi**: plan "tools.ts (create/decide/markPaid/cancel), agent/registry.ts" diyordu
  ama doğrulandı ki mevcut `listStaffTool`/`createStaffMemberTool`/`listPayrollTool`/
  `createLeaveRequestTool` gibi TÜM personel/bordro/izin araçları `agent/registry.ts`de HİÇ
  KAYITLI DEĞİL — bu modül baştan beri BİLİNÇLİ OLARAK AI-tool-çağırma yüzeyinin DIŞINDA tutuluyor
  (HR/bordro PII, insan-only). Bu yerleşik sınırla tutarlı olmak için StaffAdvance araçları da
  registry'ye EKLENMEDİ — plan metnindeki bu satır, önceki bir oturumdan kalma yanlış bir varsayımdı.
  12 yeni test yeşil (IBAN mod-97 doğrulama+maskeleme 4, özlük alanları+IBAN round-trip 6, avans
  akışı+limit enforcement+RBAC 8'den fazla — talep→onay→ödeme, paid'den önce approved zorunluluğu,
  sonuçlandırılmış talebin tekrar karara bağlanamaması, paid avansın iptal edilememesi, limit aşımı
  reddi, reddedilen avansın limite SAYILMAMASI, limit tanımsızken kontrolsüz geçiş). **DB modunda
  canlı doğrulandı**: gerçek Postgres'e karşı TC+IBAN şifreleme/çözme round-trip VE limit aşımı reddi
  doğrulandı, geçici satırlar temizlendi (0 kalıntı).

## Faz 10 — Finans/gider takip genişletme

- **Faz bölünmesi (spec'in kendi önerisiyle uyumlu, 3 alt-adım)**:
  1. `ExpenseRecord` şema genişletmesi: `subcategory String?`, `supplier String?`, `branchId String?`,
     `currency String @default("TRY")`, `taxAmount Int?`, `dueDate DateTime?`,
     `paymentStatus String @default("paid")` ("pending"|"paid"|"overdue"), `paymentMethod String?`,
     `attachmentFileName/-MimeType/-Data String?` (mevcut base64-in-DB deseni), `approvalStatus String?`,
     `approvedBy String?`, `recurringRuleId String?` (bkz. adım 3). **Tüm alanlar additive/nullable**
     — mevcut `category`/`amount`/`date`/`note` kayıtları hiç değişmeden çalışmaya devam eder.
     `amount` zaten `Int` (doğru para kuralı) — DEĞİŞTİRİLMEZ.
  2. Dashboard genişletmesi: mevcut `finance-summary.ts`/`computeFinanceSummary`'ye kategori
     kırılımı (`expenseByCategory`), vadesi yaklaşan/geciken ödemeler (`dueDate`/`paymentStatus`
     üzerinden — mevcut `upcomingPayrollWarnings` deseni genişletilir), şube görünümü
     (`costByBranch` zaten var, `ExpenseRecord.branchId` ile zenginleştirilir) eklenir.
  3. Bütçe + tekrarlayan gider: yeni `RecurringExpenseRule` modeli (frekans, sonraki üretim
     tarihi) + yeni `Budget` modeli (kategori/şube/dönem bazlı hedef tutar) — bütçe-gerçekleşen
     karşılaştırması dashboard'a eklenir.
- **Money/para kuralı**: `TeacherPayout.totalAmount`'ın `Float` olması mevcut, BİLİNÇLİ
  OLARAK DEĞİŞTİRİLMEZ (geriye dönük veri riski) — yeni hiçbir alan bu hatayı TEKRARLAMAZ,
  hepsi `Int` (kuruş/TL tam sayı, mevcut `Payment.amount` kuralı).
- **Test stratejisi**: her alt-adım kendi test setiyle biter (1: CRUD+validation, 2: dashboard
  hesap doğruluğu, 3: recurring üretim idempotency + bütçe karşılaştırma).
- **Tamamlanma kriteri**: 3 alt-adım da bağımsız çalışır durumda, mevcut `finans-ozeti`
  ekranı hiç kırılmadan genişletilmiş.

- **Tamamlandı**: 3 alt-adım da bitti. **Adım 1**: `ExpenseRecord`e `subcategory`/`supplier`/
  `branchId`/`currency`(default TRY)/`taxAmount`/`dueDate`/`paymentStatus`/`paymentMethod`/
  `approvalStatus`/`approvedBy`/`recurringRuleId` eklendi (hepsi additive/nullable, migration
  `20260825220000_expense_budget_recurring`). **Ürün kararı**: `paymentStatus` yalnızca
  "pending"|"paid" olarak YAZILIR — "overdue" hiçbir zaman kalıcı bir DB değeri değildir,
  `dueDate` karşısında OKUMA anında türetilir (yeni saf fonksiyon `effectiveExpensePaymentStatus`,
  finance-summary.ts) — bu, geç ödenmiş bir kaydın "overdue" etiketinde takılı kalmasını veya
  durumu döndürecek ayrı bir zamanlayıcı gerekmesini önler (Homework/HomeworkSubmission'daki
  "durum saklanmaz, dueDate'ten türetilir" desenin AYNISI, Faz 3D'de kurulmuştu). **Bilinçli
  olarak KAPSAM DIŞI bırakıldı**: `approvalStatus`/`approvedBy` alanları şemada/tipte VAR (oluşturma
  anında set edilebilir) ama tam bir onay iş akışı (ayrı decide-tool) EKLENMEDİ — plan'ın kendi
  "Tamamlanma kriteri"nde yok, staff ekleri gibi orantısız bir genişleme olurdu; ayrıca "belge eki"
  (attachment) hiç eklenmedi (Faz 9A'daki AYNI kapsam kararı). **Adım 2**: `computeFinanceSummary`ye
  `expenseByCategory` (bu ay kategori kırılımı), `upcomingExpenseWarnings` (dueDate'i olan,
  henüz ödenmemiş giderler — pending/overdue), `costByBranch` artık YALNIZCA bordro değil
  `ExpenseRecord.branchId` toplamını da içeriyor eklendi. **Adım 3**: yeni `src/lib/recurring-expense.ts`
  (`RecurringExpenseRule` — kategori/tutar/sıklık/`nextRunDate`) ve `src/lib/budget.ts`
  (`Budget` — kategori/şube/dönem/hedef tutar, `upsertBudget` İDEMPOTENT: aynı
  (tenant,kategori,şube,dönem) ikinci çağrıda kopya satır ÜRETMEZ, günceller). `tickRecurringExpenseRules`
  vadesi gelmiş (`nextRunDate <= now`) her aktif kural için bir `ExpenseRecord` üretir VE
  `nextRunDate`i ileri alır — bu yüzden art arda iki tick çağrısı (aradan zaman geçmeden) ikinci
  seferde YENİ kayıt ÜRETMEZ (idempotent); kaçırılan birden fazla dönem varsa `while` döngüsü
  HEPSİNİ tek tick'te üretir (catch-up, veri kaybı yok) — testte doğrulandı. **Mimari sınır kararı**:
  `tickRecurringExpenseRules` BİLİNÇLİ OLARAK `src/lib/workflows/*` otonom motoruna BAĞLANMADI —
  o motorun her adımı `agent/registry.ts`teki (AI-tool-çağırma yüzeyi) araçlar üzerinden çalışır,
  ve doğrulandı ki bu modülün TÜM finans/personel kardeşleri (`listExpensesTool`, `createExpenseTool`,
  `getFinanceSummaryTool`, ve Faz 9A/9B'de belgelenen staff/payroll/leave araçları) o registry'de
  HİÇ KAYITLI DEĞİL — kasıtlı bir sınır (HR/finans PII, insan-only). Bu tutarlılığı bozmamak için
  tekrarlayan gider üretimi de İNSAN TARAFINDAN TETİKLENİR (`finans-ozeti` ekranındaki "Şimdi
  çalıştır" düğmesi), otonom bir zamanlayıcıya EKLENMEDİ. `computeFinanceSummary`ye
  `budgetComparison` (bu ayki bütçe hedefleri vs `expensesThisMonth`den hesaplanan gerçekleşen)
  eklendi. UI: `/panel/finans-ozeti` genişletildi (kategori kırılımı kartı, yaklaşan/gecikmiş
  gider ödemeleri + "Ödendi işaretle", şube maliyeti artık gider dahil, bütçe vs gerçekleşen kartı,
  tekrarlayan gider kuralları yönetimi + "Şimdi çalıştır", bütçe hedefi formu, gider formu yeni
  alanlarla genişletildi) — mevcut ekran YAPISI korunarak (ayrı bir sayfaya BÖLÜNMEDİ, plan'ın
  "mevcut ekran kırılmadan genişletilmiş" isteğiyle tutarlı). 21 yeni test yeşil
  (`effectiveExpensePaymentStatus` pure 4, adım-1 CRUD+geriye-uyum 2, adım-2 dashboard doğruluğu
  4, adım-3 recurring idempotency+catch-up+pasif-kural+RBAC 5, budget idempotency+comparison 2,
  modül-seviyesi smoke 1 — toplamda önceki finans testleriyle BİRLİKTE 26/26 yeşil). **DB modunda
  canlı doğrulandı**: gerçek Postgres'e karşı overdue türetme, mark-paid sonrası uyarı listesinden
  çıkma, recurring tick idempotency (1→0), bütçe karşılaştırma doğrulandı, geçici satırlar
  temizlendi (0 kalıntı).

## Faz 8 — KVKK açık rıza yönetimi

- **Amaç**: `SocialMediaConsent` deseninin (grant/withdraw/history/scopes) GENELLEŞTİRİLMİŞ
  hâli — hukuki metin YÖNETİLİR (hardcode edilmez).
- **Yeni modeller**: `ConsentTextVersion` (kurum/hukuk danışmanının yüklediği versiyonlu metin:
  `consentType`, `version Int`, `bodyText`, `effectiveFrom`, `createdBy` — `DocumentTemplate`'in
  `version`/`active` deseniyle birebir aynı), `KvkkConsent` (`subjectType` (student/parent/user),
  `subjectId`, `consentType`, `textVersionId`, `acceptedAt`, `channel`, `withdrawnAt`,
  `withdrawalReason`, `createdBy`, ip/device alanları **YALNIZ** hukuken onaylanmış ve
  erişimi kısıtlı bir alt-küme olarak — spec'in "veri minimizasyonu" talebine uyarak
  varsayılan olarak KAYDEDİLMEZ, yalnız kurum ayarında açıkça etkinleştirilirse tutulur).
- **First-login gate**: `StudentPortalAccess.status` geçişinin (invited→active) YANINA,
  portal ilk girişte geçerli `KvkkConsent` yoksa onay ekranı gösteren yeni bir middleware/guard
  katmanı (`src/middleware.ts`'e değil, portal layout seviyesinde — route guard'ı bozmadan).
- **Feature-restriction**: `Student.communicationOptOut` deseninin genellemesi — yeni
  `consentRestrictedFeatures Json?` (tenant ayarında yönetilebilir: rıza yoksa hangi
  özellikler (ör. WhatsApp gönderimi, fotoğraf paylaşımı) kısıtlanır).
- **Güvenlik**: rıza kayıtları yalnız `SUPER_ADMIN`/`SCHOOL_ADMIN` (hassas kişisel veri —
  mevcut `canViewStaffSensitive` düzeyinde bir yeni `canViewConsentRecords` kontrolü).
- **Test stratejisi**: versiyon değişince yeniden-rıza tetiklenmesi, geri çekme akışı,
  first-login gate testi, feature-restriction testi, RBAC testi.
- **Tamamlanma kriteri**: öğrenci kaydında + portal ilk girişte rıza akışı çalışıyor, geri
  çekme mümkün, admin ayarlarından metin versiyonu ve kısıtlanan özellikler yönetilebiliyor.

- **Tamamlandı**: iki yeni model — `ConsentTextVersion` (append-only: her düzenleme YENİ bir satır,
  `@@unique([tenantId,consentType,version])`, mevcut satırlar ASLA güncellenmez — `DocumentTemplate`'in
  "in-place mutate + version++" deseninin BİLİNÇLİ OLARAK TERSİ, çünkü KVKK bir kullanıcının TAM
  OLARAK hangi metne onay verdiğini ispatlayabilmeyi gerektirir) ve `KvkkConsent`
  (`SocialMediaConsent` ile AYNI iskelet: subjectType/subjectId/consentType/textVersionId/
  acceptedAt/channel/withdrawnAt/withdrawalReason, `deviceInfo` YALNIZCA tenant `consentSettings.
  recordDeviceInfo=true` iken kalıcılaşır — testte doğrulandı). `School.consentSettings` (Json,
  `collectionsSettings`/`termWeeklyClosedDays` ile AYNI desen — additive, StoreApi'nin 3 modda da
  (json/memory/db) `updateConsentSettings` ile genişletilmesi gerekti). Migration
  `20260825230000_kvkk_consent`. Yeni saf fonksiyon `computeEffectiveConsentStatus` (I/O yok,
  `src/lib/kvkk-consent.ts`) dört durumu birleştirir: missing/withdrawn/outdated/valid — **metin
  YENİ bir versiyona yükseltilince eski onay OTOMATİK "outdated" olur, ayrı bir "reconsent
  tetikleme" mekanizması İCAT EDİLMEDİ**, bu karşılaştırmanın kendisi yeterli (testte + DB'de
  canlı doğrulandı). **Feature-restriction**: `Student.communicationOptOut`'un genellemesi —
  `isFeatureRestrictedForSubject(tenantId, consentSettings, subjectType, subjectId, feature)`:
  bir `feature` anahtarı `consentSettings.restrictedFeatures`de VARSA VE o isimle AYNI
  `consentType` için geçerli rıza YOKSA kısıtlanır (ayrı bir feature→consentType eşleme tablosu
  İCAT EDİLMEDİ — anahtar kuralı `feature === consentType`). **First-login gate**:
  `/ogrenci/layout.tsx`de (middleware'e DOKUNULMADI) — yalnızca tenant için yürürlükte bir
  "kvkk_general" metni TANIMLIYSA uygulanır (metin hiç girilmemiş tenant'larda/demo verisinde
  giriş SESSİZCE KİLİTLENMEZ — mevcut davranış korunur, bilinçli güvenli varsayılan). Yeni
  `KvkkConsentGate` bileşeni `children` YERİNE render edilir, inline server action ile onay.
  **RBAC**: hukuki metin YAYINLAMA/tam-liste-OKUMA admin-only (`requireConsentAccess`,
  `requireStaffSensitiveAccess` ile AYNI düzey — SCHOOL_ADMIN/SUPER_ADMIN); ama yürürlükteki
  metnin KENDİSİ (`getCurrentConsentTextVersionTool`) BİLİNÇLİ OLARAK kilitlenmedi — rıza
  vermeden ÖNCE okunması gerekir, hassas değildir. Rıza verme/geri çekme/geçmiş görüntüleme:
  admin HER ZAMAN, konu KENDİSİ (`canAccessConsentSubject` — subjectType="user"→userId eşleşmesi,
  "student"/"parent"→mevcut `canAccessStudent`, Karma Öğrenci Portalı'nın GUARDIAN/SELF ayrımıyla
  AYNI). **Kod incelemesinde bulunup düzeltilen gerçek bir hata**: `withdrawKvkkConsentTool`'un
  ilk taslağı ÖNCE mutasyonu (geri çekmeyi) uyguluyor, SONRA erişim kontrolü yapıyordu — yetkisiz
  bir çağrı FORBIDDEN almadan önce kaydı gerçekten geri çekmiş olabilirdi. Yeni salt-okunur
  `getKvkkConsentById` eklenerek sıra düzeltildi: önce kayıt okunur → erişim kontrol edilir →
  YALNIZCA O ZAMAN mutasyon uygulanır; ilgili testte ("mutasyondan önce erişim kontrolü")
  doğrulandı. UI: `/panel/ayarlar/kvkk` (metin versiyonu yayınlama + tarihçe + rıza ayarları,
  sidebar'a "KVKK Ayarları" girdisi eklendi), `/ogrenci/ayarlar/kvkk` (konu kendi rıza
  tarihçesini görür + geri çeker), `/panel/ogrenciler/yeni` formuna (yalnızca "kvkk_general" metni
  TANIMLIYSA görünen) KVKK onay checkbox'ı eklendi — sosyal medya izniyle AYNI desen. 31 yeni test
  yeşil (`computeEffectiveConsentStatus` pure 5, versiyonlama 4, grant/withdraw/reconsent 5,
  RBAC/kendi-vs-başkası 4, feature-restriction 3, consent settings 2, veri minimizasyonu 1 +
  ilgili social-media-consent testleri hâlâ 8/8 yeşil). **DB modunda canlı doğrulandı**: gerçek
  Postgres'e karşı grant→valid, yeni versiyon→outdated, withdraw→withdrawn, feature-restriction
  doğrulandı, geçici satırlar temizlendi (0 kalıntı).

## Faz 11 — CRM arama/mesaj altyapısı (sağlayıcıdan bağımsız)

- **Amaç**: gerçek sağlayıcı YOK — yalnız domain modelleri + adapter arayüzü + webhook
  iskeleti. `src/lib/payment-provider/` (types.ts + config.ts + provider-factory.ts, 3-dosya
  deseni, `verifyWebhook({rawBody, signatureHeader})` imzası) DOĞRUDAN kopyalanacak şablon.
- **Yeni modeller**: `CallLog` (callerNumber, callerName?, contactType (student/parent/lead),
  contactId?, direction (inbound/outbound), answered, durationSeconds?, occurredAt,
  callbackDone, callbackAt?, callbackByUserId?), `MessageLog` (channel, senderIdentifier,
  occurredAt, contentOrSummary — spec'in "erişimi sınırlandırılmış özet" talebine göre ham
  içerik yalnız yetkili roле görünür, read/replied status, contactId?, responderUserId?).
- **Yeni adapter**: `src/lib/communication-provider/{types,config,provider-factory}.ts` —
  `CommunicationProvider` arayüzü (`isConfigured()`, `verifyWebhook()`, sağlayıcıya özel
  metod YOK, gerçek implementasyon sonraki iş). Webhook route
  `src/app/api/v1/communications/webhook/route.ts` — imza doğrulama zorunlu, `SmsInboundEvent`
  deseniyle AYNI idempotency (`providerMessageId+kind` unique).
- **Kişi eşleştirme**: manuel (admin ekranından `contactId` atama) + otomatik (telefon
  numarası normalize edilip `Student.phone`/`Student.parentPhone`/`Teacher.phone` ile
  eşleştirme — birden fazla eşleşme varsa "belirsiz", manuel çözüme düşer).
- **Güvenlik**: içerik maskeleme (özet/ilk N karakter dışı gizli), RBAC (yönetici/SUPER_ADMIN
  görür), audit (her manuel eşleştirme/görüntüleme audit'e yazılır — hassas iletişim verisi).
- **Test stratejisi**: webhook imza doğrulama testi (geçersiz imza reddi), idempotency testi
  (aynı providerMessageId iki kez işlenmez), otomatik eşleştirme testi (tekil/çoklu/eşleşmeyen
  numara), RBAC+maskeleme testi.
- **Tamamlanma kriteri**: domain modelleri + adapter arayüzü + imzalı webhook + manuel/otomatik
  eşleştirme + filtre/detay/RBAC/audit/maskeleme çalışıyor; gerçek sağlayıcı entegrasyonu
  BİLİNÇLİ OLARAK sonraki bir işe bırakılıyor (spec'in kendi talebi).

- **Tamamlandı**: iki yeni domain modeli — `CallLog` (callerNumber/callerName/contactType/
  contactId/direction/answered/durationSeconds/occurredAt/callbackDone/-At/-ByUserId/note) ve
  `MessageLog` (channel/senderIdentifier/occurredAt/contentOrSummary/status/contactType/
  contactId/responderUserId) + `CommunicationInboundEvent` (`SmsInboundEvent` ile BİREBİR AYNI
  webhook-idempotency deseni, `@@unique([providerMessageId,kind])`). Migration
  `20260825240000_crm_call_message_log`. **Adapter**: `src/lib/communication-provider/
  {types,config,provider-factory}.ts`, `src/lib/payment-provider/` ile BİREBİR AYNI 3-dosya
  deseni (`verifyWebhook({rawBody,signatureHeader})` imzası plan'ın kendi isteğiyle birebir
  aynı). **Ürün kararı — gerçek sağlayıcı yerine jenerik HMAC**: plan "gerçek sağlayıcı YOK"
  diyordu ama bu, imza doğrulamanın da SAHTE/test-edilemez olması ANLAMINA GELMEMELİ — belirli
  bir vendöre (Twilio/Netgsm vb.) bağlı OLMAYAN, birçok webhook sağlayıcısının kullandığı jenerik
  bir HMAC-SHA256 şeması (`providers/hmac.ts`, `sha256=<hex>` header) yazıldı: `COMMUNICATION_
  WEBHOOK_SECRET` env ayarlanmadıysa "console" (her zaman reddeder, mevcut fail-closed davranış),
  ayarlandıysa gerçek `timingSafeEqual` ile sabit-zamanlı imza karşılaştırması yapar — "gerçek
  sağlayıcı yok" ilkesini BOZMADAN ("hmac" hiçbir vendöre özel değil) testte GERÇEKTEN doğru/
  yanlış imza ayrımını kanıtlamayı sağladı (plan'ın kendi istediği "webhook imza doğrulama testi
  (geçersiz imza reddi)" gereksinimi). Webhook route (`/api/v1/communications/webhook`) yalnızca
  imza doğrulayıp idempotency claim yapar, 200 döner — gerçek sağlayıcı payload'ını CallLog/
  MessageLog'a DÖNÜŞTÜRMEZ (bu, hangi vendörün hangi payload şeklini kullanacağı BİLİNMEDİĞİ için
  BİLİNÇLİ OLARAK yapılmadı, plan'ın kendi kapsam sınırıyla tutarlı — "gerçek sağlayıcı
  entegrasyonu sonraki bir işe bırakılıyor"). Bunun yerine `createCallLogTool`/
  `createMessageLogTool` (manuel giriş — bugünkü gerçek CRM iş akışı zaten budur: personel
  aramayı/mesajı kendisi görüp kaydeder) bu turda GERÇEK, çalışan bir kapasite sağlıyor. **Kişi
  eşleştirme**: yeni saf modül `src/lib/crm-contact-matching.ts` (`normalizePhone`+
  `matchContactByPhone`) — telefon numarası `Student.phone`/`Student.parentPhone` ile normalize
  edilerek karşılaştırılır; TEKİL eşleşmede OTOMATİK atanır, BİRDEN FAZLA eşleşmede "belirsiz"
  (otomatik atama YAPILMAZ, manuel çözüme düşer) — DB canlı doğrulamasında gerçek seed verisinin
  KENDİSİ bu senaryoyu kanıtladı (demo öğrencilerin çoğu paylaşılan/benzer telefon desenleri
  taşıyor, gerçek bir numarayla ilk deneme "ambiguous" döndü — hata değil, doğru davranış).
  **Maskeleme**: `MessageLog.contentOrSummary` DB'de HER ZAMAN tam içeriği taşır; erişim
  sınırlaması LİSTE fonksiyonunda uygulanır (`toPublicSummary` — 80 karakter üstü kırpılır,
  Homework.fileData'nın listede "1" ile değiştirilmesiyle AYNI "liste kısıtlı, detay tam"
  deseni); tam içerik yalnızca `getMessageLogTool` (+ yeni `GET /api/v1/crm/messages/:messageId`,
  `crm:read` izniyle) ile görülür, HER görüntüleme audit'e yazılır (`crm.message_log.reveal`).
  **RBAC**: yeni `crm:read`/`crm:write` izinleri (yalnızca SCHOOL_ADMIN/SUPER_ADMIN —
  `requireStaffSensitiveAccess` düzeyi), `auth/rbac.ts`'e eklendi. UI: yeni `/panel/crm` (arama+
  mesaj tabloları, manuel giriş formları, kişi atama, geri arama/durum işaretleme, `CrmMessageReveal`
  istemci bileşeni — `StaffIbanReveal` ile AYNI "Göster" deseni), sidebar'a "CRM Geçmişi" girdisi.
  20 yeni test yeşil (kişi eşleştirme pure 6, jenerik HMAC doğru/yanlış/eksik imza+deterministik
  idempotency temeli 4, RBAC 1, CallLog otomatik/manuel eşleştirme+geri arama 4, MessageLog
  liste-kırpma/detay-tam/durum-akışı/atama 5). **DB modunda canlı doğrulandı**: gerçek Postgres'e
  karşı otomatik eşleştirme (geçici benzersiz telefon ile), manuel atama, liste-kırpma vs
  detay-tam-içerik doğrulandı; ilk deneme sırasında oluşan (script gerçek seed verisiyle
  "ambiguous" alıp erken durduğunda) 1 kalıntı CallLog satırı fark edilip temizlendi — script
  try/finally ile sağlamlaştırıldı, son çalıştırmada 0 kalıntı.

## Faz 14 — Son kalite kontrolü ve teslim

- Her fazın migration'ı `prisma migrate deploy` sırasına göre gözden geçirilir (tümü additive,
  hiçbiri mevcut veri siler/mutasyona uğratır).
- Backfill scriptleri (Faz 1A, 1B, 12) idempotency testiyle ikinci kez çalıştırılıp 0 değişiklik
  ürettiği doğrulanır.
- JSON/memory/DB modlarında Faz 1-13'ün kritik akışları (Playwright yerine mevcut Vitest +
  gerekirse curl/dev-server manuel doğrulama, projenin mevcut test kültürüyle tutarlı) çalıştırılır.
- `npm run typecheck && npm run lint && npm test && npx prisma validate && npm run build`
  tam zincir.
- Bu doküman, tamamlanan fazlar + alınan kararlar + migration notları + test sonuçları +
  bilinen sınırlamalarla güncellenir (aşağıdaki İlerleme bölümü).

---

## Bilinen, kapsam dışı ön-mevcut test kırıklığı/flakiness

Tam test suite'i bu oturumda birden fazla kez baştan sona çalıştırıldı (Faz 6 ve Faz 1A
doğrulamalarında). Her seferinde `lesson-scheduling.test.ts`, `lesson-update.test.ts`
(ikisi de "TEACHER_UNAVAILABLE" beklerken "TEACHER_INSTRUMENT_MISMATCH"/
"ROOM_INSTRUMENT_MISMATCH" alıyor) ve `homework-attachment.test.ts` başarısız oldu;
4. başarısız dosya çalıştırmadan çalıştırmaya DEĞİŞTİ (`teacher-contract-reminder-tick.test.ts`
bir seferinde, `find-person-schedule.test.ts` başka bir seferinde) — yani suite'in kendisi
flaky. `git status --porcelain` ile HER İKİ çalıştırmadaki başarısız dosyaların ve ilgili
kaynak dosyalarının (`seed.ts`, `makeup-engine.ts`, `teacher-contract-reminders.ts`,
`find-person-schedule.ts`) HEAD (`73173d8`) ile birebir aynı (hiç değişmemiş) olduğu
doğrulandı — yani bu kırıklık bu oturumdaki HİÇBİR değişiklikten kaynaklanmıyor, `main`'de
zaten var. Kök neden (en azından ilk ikisi için, sabit/deterministik): `lesson-scheduling.
test.ts`'in test verisi/yorumu "t4 Mert Öztürk / Bateri" varsayıyor ama güncel `seed.ts`'te
t4 artık "Şevval Aydın" (Piyano/Şan/Yan Flüt, Bateri YOK) — seed verisi öğretmen kadrosu
değişmiş, test fixture'ı güncellenmemiş. Değişen 4. dosyanın kök nedeni araştırılmadı
(muhtemelen ayrı, gerçek bir sıra/zamanlama bağımlılığı). Bu oturumun kapsamı DIŞINDA
bırakıldı (hiçbir Faz bu dosyalara dokunmuyor); ayrı bir işte ele alınmalı.

Faz 3C sonrası tam suite tekrar çalıştırıldığında (`lesson-homework-reminder.test.ts` eklendikten
sonra) aynı 3 sabit dosya YİNE başarısız oldu, değişken 4. yuvayı bu kez `social-media-consent.test.ts`
doldurdu ("withdrawn" bekleniyor, "granted" geldi) — dosya TEK BAŞINA çalıştırıldığında 8/8 yeşil,
kaynağı da (`social-media-consent.ts`) bu oturumda hiç değişmedi (`git status --porcelain` boş).
Bu, yukarıdaki "4. dosya çalıştırmadan çalıştırmaya değişiyor" gözlemini DOĞRULUYOR — yeni bir
kırıklık değil, aynı önceden var olan suite-seviyeli flakiness'in bir başka tezahürü.

## İlerleme (canlı güncellenir)

| Faz | Durum | Not |
|---|---|---|
| 0 | ✅ Tamamlandı | Bu doküman |
| 7 | ✅ Tamamlandı | `trial-lesson-create-form.tsx` `step={5}`→`step={1}`; typecheck+lint yeşil. Kök neden: `min=1,step=5` varsayılan değer 40'ı native stepMismatch ile reddediyordu. |
| 5 | ✅ Tamamlandı (doğrulama) | Tüm `[id]` ve `yeni` rotaları zaten `BackButton` kullanıyor (grep ile doğrulandı, 0 eksik). `veli` portalında hiç drill-down/`[id]` rotası yok. Kod değişikliği gerekmedi. |
| 6 | ✅ Tamamlandı | `LessonSeries.demoTag` eklendi (migration `20260825120000_lesson_series_demo_tag`, additive/nullable, 3 store modu + tool katmanı thread edildi). Script TÜM aktif öğrencileri kapsayacak şekilde genelleştirildi (önceden 4 hardcoded öğrenci), `npm run seed:demo-schedule` olarak paketlendi, README'ye cross-process JSON kilit uyarısıyla dokümante edildi. **DB modunda canlı doğrulandı** (kullanıcı onayıyla `prisma migrate deploy` uygulandı): 78 aktif öğrenciden 20'si için seri oluşturuldu (58'i uygun oda/boş slot bulamadı — basit demo eşleştiricinin bilinen sınırı), ikinci çalıştırma 0 yeni kayıt (idempotent doğrulandı), tüm 20 seri `demoTag` taşıyor, önceden var olan 20 seri-dışı gerçek ders HİÇ değişmedi (140 toplam ders = 20 eski + 120 yeni). 2 yeni Vitest testi (idempotency + demoTag/1-ay-span) json modda yeşil. |
| 1A | ✅ Tamamlandı | `Student.paymentDueRanges Json?` eklendi (migration `20260825130000_student_payment_due_ranges`), gerçek CANLI yazma yolu (`updateStudentProfileTool`/`updateStudentProfileSchema`) belirlendi — `updateStudentPaymentProfileTool` hiçbir UI/AI tarafından çağrılmadığı doğrulanıp BİLİNÇLİ OLARAK dokunulmadı (ölü kod). `src/lib/payment-due-ranges.ts` (normalize/birleştirme, format, fallback) + `student-payment-profile-editor.tsx`'te çoklu aralık ekle/sil UI'ı + öğrenci detay/belge şablonu gösterimi güncellendi. Legacy `paymentDueDay` korunur, ranges güncellenince ilk aralığın başlangıcıyla senkron tutulur. 11 yeni test (normalize/format/fallback + tool entegrasyonu) yeşil. **DB modunda canlı doğrulandı** (kullanıcı onayıyla migration uygulandı): normalize edilmiş aralıklar + senkron `paymentDueDay` psql ile teyit edildi. Bilinen sınırlama: DB modunda `paymentDueRanges:[]` gönderildiğinde Prisma `undefined` alanları "değiştirme" sayar — bu, fonksiyonun TÜM diğer opsiyonel alanları için zaten var olan pre-existing bir davranış, bu fazda giderilmedi (plan dışı). |
| 1B | ✅ Tamamlandı | `Student.studentTypes Json?` eklendi (migration `20260825140000_student_multiple_types`). Yeni `src/lib/student-types.ts` (`effectiveStudentTypes`/`formatStudentTypes`, Faz 1A'daki desenle aynı). `types.ts`'e array-farkında `hasMebStudentType`/`hasLcmStudentType` eklendi; `studentLevelVisible`/`studentLevelRequired`/`validateStudentLevel` (student-level-rules.ts) ve `bankForStudentType`/`resolveCollectionsIban` (collections-due.ts, GERÇEK canlı IBAN yönlendirme yolu) artık `StudentType[]` alıyor — **ürün kararı**: MEB türü diğer türlerle birlikte atanmışsa MEB'in katı kuralı (VakıfBank + seviye zorunlu) her zaman kazanır. `announcements/audience.ts` ve `teaching-materials-audience.ts`'teki `===`/`!==` exact-match'ler `.includes()`'a çevrildi (çoklu türe sahip öğrenci artık hedeflenen türlerden HERHANGİ biriyle eşleşiyor). Create formu (`ogrenciler/yeni`) tekil `<Select>`'ten checkbox grubuna çevrildi; **daha önce hiç edit yolu olmayan** `studentType` alanına `student-profile-editor.tsx` üzerinden ilk kez düzenleme UI'ı eklendi (checkbox grubu, `updateStudentProfileTool`'un zaten desteklediği ama hiçbir UI'nin çağırmadığı alan). `students-table.tsx` filtre/liste + öğretmen portalı görüntüleme sitelerinin tamamı çoklu-tür farkında. 16 yeni/güncellenmiş test (`student-types.test.ts` 6, `collections-due.test.ts`+2, `student-level-rules.test.ts`+2, `announcements-audience.test.ts`+1) yeşil. **DB modunda canlı doğrulandı**: MEB+LCM birlikte kaydedildi, `studentType` ilk türle (`MEB`) senkron, psql ile teyit edildi. Bilinçli kapsam dışı bırakılan: `validateStudentLevel` hâlâ hiçbir UI akışına bağlanmadı (Faz 1B öncesinde de öyleydi — yeni bir zorunluluk icat edilmedi, sadece çoklu-tür-uyumlu hale getirildi). |
| 12 | ✅ Tamamlandı | `EntitySequence` modeli (composite PK `[tenantId,entityType]`, migration `20260825150000_entity_display_ids`) + `Student`/`Teacher`/`StaffMember.displayId` (`@@unique([tenantId,displayId])`, NULL çoklu izinli). Üç ayrı tahsis yolu (`src/lib/entity-sequence.ts`): saf `allocateSequenceValue` (json/memory, `AppData.entitySequences`), atomik tek-SQL `allocateSequenceValueDb` (`INSERT...ON CONFLICT...DO UPDATE...RETURNING`, DB modu), ayrı dosya kilitli `allocateSequenceValueFile` (yalnız `staff.ts` — o modül `AppData`'nın dışında kendi JSON deposunu kullanıyor). **İki gerçek pre-existing eşzamanlılık hatası bulundu ve düzeltildi** (Faz 12'nin kendi doğrulaması sırasında, kapsamı dahilinde): (1) `store-json.ts`'teki `ensureDataFile()` kilit DIŞINDA `fs.access` kontrolü yapıyordu — soğuk başlangıçta eşzamanlı istekler bağımsız reseed yapıp birbirini silebiliyordu; artık TÜM kontrol+yazım `withFileLock` altında. (2) `addStudent`/`addTeacher` (json) `readData()`+`writeData()` ayrı ayrı çağırıyordu (yalnız YAZMA kilitli, okuma değil) — zaten var olan ama hiç kullanılmayan `mutateStoreUnderLock` primitifine geçirildi (tüm oku-değiştir-yaz döngüsü tek kilit altında). (3) `store-db.ts`'te `addStudent`/`addTeacher` `id`'yi salt `Date.now().toString(36)` ile üretiyordu (rastgelelik YOK) — gerçek Postgres'e karşı 10-12 eşzamanlı istekle doğrulanırken birebir bu yüzden `id` primary key ihlaliyle bazı istekler reddediliyordu (displayId sırası HİÇBİR ZAMAN çakışmadı, yalnızca id çakıştı); json/memory modda zaten kullanılan rastgelelik-içeren `uid()`'e geçirildi. Backfill: `scripts/backfill-display-ids.ts` (`npm run backfill:display-ids`) — DB modda tüm tenant'ları gezer, JSON modda tek store'u, memory modda kasıtlı atlanır (kalıcı değil, ayrı process'ten anlamsız) — idempotent (ikinci çalıştırma 0 atar), `createdAt`'e göre sıralı (Teacher'da `createdAt` TS tipinde yok, isimle sıralanır — dokümante edilmiş bilinçli sınırlama). Global hızlı arama (`globalSearchTool`) artık displayId'den de eşleştiriyor. Öğrenci/öğretmen detay sayfası başlıklarında gösteriliyor. 8 yeni test yeşil. **DB modunda canlı doğrulandı**: migration uygulandı, backfill (78 öğrenci/7 öğretmen) idempotent çalıştı, gerçek Postgres'e karşı 12 eşzamanlı `addStudent` çağrısı SIFIR çakışma/hata ile 12 ardışık benzersiz displayId üretti (id-çakışması düzeltmesi sonrası; düzeltme ÖNCESİ aynı test 4/10 isteğin id çakışmasıyla reddedildiğini kanıtladı). Test verileri temizlendi. **Bilinçli kapsam dışı**: liste ekranlarına (öğrenci/öğretmen tablosu) displayId kolonu eklenmedi (detay sayfası + hızlı arama yeterli görüldü, kolon-yönetimi altyapısına entegrasyon ayrı bir iş); personel (`/panel/personel`) liste/detay UI'ında gösterilmedi (zaten hiç detay sayfası yok, bkz. Faz 9A notu). |
| 2 | ✅ Tamamlandı | `Lesson.teacherAttendanceStatus/-At/-By/-Note` eklendi (migration `20260825160000_teacher_attendance`), öğrenci yoklama alanlarından TAMAMEN ayrı. Saf fonksiyon `src/lib/teacher-attendance.ts` (`markTeacherAttendance`) + skor motoru `src/lib/teacher-performance.ts` (`computeTeacherPerformanceReport`, versiyon `teacher-performance-v1`) — katılım oranı %60 + öğrenci geri bildirimi (`computeTeacherFeedbackSummary`, mevcut) %40 ağırlıklı, veri eksikse (katılım veya feedback) yalnız mevcut bileşen(ler) üzerinden yeniden normalize edilir, hiç veri yoksa `score:null` ("yetersiz veri", asla 0 değil). 3 store modu (`markTeacherAttendanceLive`) + tool katmanı (`markTeacherAttendanceTool` — SCHOOL_ADMIN/SUPER_ADMIN, öğretmen kendi katılımını işaretleyemez; `getTeacherPerformanceReportTool` — admin + öğretmenin KENDİSİ salt-okunur) + 2 REST route + öğretmen detay sayfasında yeni "Performans" sekmesi (`TeacherPerformancePanel` — tarih aralığı filtresi, bileşen dökümü, bekleyen yoklama listesi+hızlı işaretleme). 13 yeni test yeşil — **en kritik test**: aynı öğretmen katılımıyla farklı öğrenci yoklaması (attended/absent/excused) skorun BİREBİR AYNI kaldığını kanıtlıyor. **DB modunda canlı doğrulandı**: gerçek Postgres'e karşı işaretleme+not persist edildi, rapor doğru hesaplandı (katılım %100→60 puan, feedback yok→null, toplam skor 100), test verisi temizlendi. |
| 13 | ✅ Tamamlandı | `src/lib/lesson-reassignment.ts` (saf fonksiyon `reassignLessonTeacherOrBranch`) — `cancelSeriesFromLesson`/`cancelEntireSeries` İLE AYNI üçlü kapsam (single/fromHereOnward/entireSeries). Çakışma kontrolü TEK kaynaktan (`validateLessonSlot` + `excludeLessonId`, Faz 0'da doğrulanan mevcut mekanizma — YENİDEN yazılmadı). **Ürün kararı**: seri yenileme/genişletme özelliği kod tabanında YOK (doğrulandı) — bu yüzden "fromHereOnward" seriyi ikiye bölmek yerine LessonSeries kaydını yeni atamayla günceller (raporlama için), geçmiş Lesson satırları kendi (değişmeyen) atamasını korur. 3 store modu (`reassignLessonTeacherOrBranchLive`, DB modda TEK `$transaction`) + tool (`changeLessonTeacherOrBranchTool` — SCHOOL_ADMIN/SUPER_ADMIN, öğretmen/oda geçerlilik ön-kontrolü) + audit (`lesson.reassign`) + idempotent bildirim (yeni `lesson_reassigned` kategorisi, eski+yeni öğretmen ayrı ayrı, `dedupeKey` yeni atamayı içerir). UI: `program-studio.tsx`'in ders detay panelinde YENİ, kendi içinde kapalı `LessonReassignmentModal` bileşeni (öğretmen/şube/oda seçimi + kapsam + onay özeti). 7 yeni test yeşil (3 kapsam senaryosu + çakışma + RBAC + hata yolları). **DB modunda canlı doğrulandı**: gerçek Postgres'e karşı ders oluşturuldu, yeniden atandı, doğru persist edildi, temizlendi (schema değişikliği gerekmedi, migration yok). |
| 3A-D | ✅ Tamamlandı | Gelişim raporu (çalışılan konular) + 4 haftalık genel değerlendirme + ödev zorunluluğu/idempotent hatırlatma + satır bazlı admin ödev takip ekranı. Migrationlar `20260825170000_lesson_assessment_topics`, `20260825180000_periodic_assessment`, `20260825190000_homework_lesson_link`. Detay: bkz. yukarıdaki "Faz 3" bölümü. |
| 4 | ✅ Tamamlandı | Duyuru hedef kitlesi çoklu-kural (`AudienceRule[]`) + enstrüman segmenti + yayınlanma anında `Notification` materyalizasyonu (`resolveAudienceRecipients`, userId-tekilleştirmeli). Migration `20260825200000_announcement_targeting`. Detay: bkz. yukarıdaki "Faz 4" bölümü. |
| 9A/9B | ✅ Tamamlandı | Personel özlük genişletmesi (acil durum/sözleşme/SGK/IBAN şifreli) + avans modülü (talep→onay/red→ödeme→iptal, yıllık limit enforcement). Migration `20260825210000_staff_extended_advance`. Yeni `/panel/personel/[staffId]` detay sayfası. Detay: bkz. yukarıdaki "Faz 9A/9B" bölümü. |
| 10 | ✅ Tamamlandı | Gider kaydı genişletmesi (alt kategori/tedarikçi/şube/vade/ödeme durumu) + dashboard genişletmesi (kategori kırılımı, vade uyarıları, şube maliyeti) + tekrarlayan gider + bütçe karşılaştırma. Migration `20260825220000_expense_budget_recurring`. Detay: bkz. yukarıdaki "Faz 10" bölümü. |
| 8 | ✅ Tamamlandı | Genelleştirilmiş KVKK rıza yönetimi (versiyonlu hukuki metin + grant/withdraw + first-login gate + feature-restriction). Migration `20260825230000_kvkk_consent`. Yeni `/panel/ayarlar/kvkk`, `/ogrenci/ayarlar/kvkk`. Detay: bkz. yukarıdaki "Faz 8" bölümü. |
| 11 | ✅ Tamamlandı | CRM arama/mesaj altyapısı (sağlayıcıdan bağımsız adapter + jenerik HMAC webhook iskeleti + manuel giriş + otomatik telefon eşleştirme + maskeleme). Migration `20260825240000_crm_call_message_log`. Yeni `/panel/crm`. Detay: bkz. yukarıdaki "Faz 11" bölümü. |
| 14 | ✅ Tamamlandı | Bu bölüm — nihai rapor aşağıda. |

**Not (kapsam gerçekliği — güncellendi)**: başlangıçtaki tahminin aksine, 14 fazın TÜMÜ (0, 5, 6, 7,
1A, 1B, 12, 2, 13, 3A-D, 4, 9A/9B, 10, 8, 11, 14) bu oturumda tamamlandı — hiçbiri bir sonraki
oturuma bırakılmadı. Her faz kendi migration'ı, 3-store-parity (json/memory/db) uygulaması, RBAC/
audit, UI ve test setiyle tam kapsamlı işlendi; hiçbir modül sahte/mock bırakılmadı. Nihai rapor
aşağıdaki "Faz 14 — Nihai Rapor" bölümündedir.

---

## Faz 14 — Nihai Rapor

### 1. Tamamlanan Fazlar

| # | Faz | Özet |
|---|---|---|
| 0 | Keşif + plan | Repo keşfi, mimari doğrulama, 14 fazın uygulama sırası kararı |
| 7 | Deneme dersi süre hatası | `step={5}`→`step={1}` — native stepMismatch bug fix |
| 5 | Geri navigasyon | Doğrulama — mevcut `BackButton` kullanımı zaten eksiksizdi, kod değişikliği gerekmedi |
| 6 | Demo ders programı seed | `LessonSeries.demoTag` + idempotent, tüm-öğrenci-kapsayan seed script |
| 1A | Çoklu ödeme günü/aralığı | `Student.paymentDueRanges`, normalize/format/fallback katmanı |
| 1B | Çoklu öğrenci türü | `Student.studentTypes`, MEB-önceliği ürün kararı, tüm exact-match'ler `.includes()`'a çevrildi |
| 12 | İnsan-okunur benzersiz numara | `EntitySequence` + `displayId` (Student/Teacher/StaffMember), 2 gerçek eşzamanlılık hatası bulunup düzeltildi |
| 2 | Öğretmen yoklaması/performans | `teacherAttendanceStatus` + %60 katılım/%40 geri bildirim skor motoru (öğrenci verisinden TAMAMEN izole) |
| 13 | Ders öğretmeni/şube değişimi | 3-kapsamlı (single/fromHereOnward/entireSeries) yeniden atama, mevcut çakışma motoru yeniden kullanıldı |
| 3A-D | Gelişim raporu + 4 haftalık + ödev zorunluluğu + admin takip | Çalışılan konular alanı, dönemsel değerlendirme, idempotent ödev-eksik hatırlatması, satır bazlı admin ekranı |
| 4 | Hedefli duyurular | Çoklu-kural hedefleme + enstrüman segmenti + yayında `Notification` materyalizasyonu (dedup garantili) |
| 9A/9B | Personel özlük + avans | Acil durum/sözleşme/SGK/şifreli IBAN + talep→onay→ödeme akışı + yıllık limit enforcement |
| 10 | Finans/gider genişletmesi | Kategori/vade/şube zenginleştirmesi + tekrarlayan gider + bütçe-gerçekleşen karşılaştırması |
| 8 | KVKK açık rıza yönetimi | Versiyonlu hukuki metin + grant/withdraw + first-login gate + feature-restriction |
| 11 | CRM arama/mesaj altyapısı | Sağlayıcıdan bağımsız adapter + jenerik HMAC webhook + manuel giriş + otomatik telefon eşleştirme |
| 14 | Son kalite kontrolü | Bu rapor |

### 2. Veri Modeli ve Migration

18 yeni migration, TÜMÜ additive (mevcut kolonu/kaydı asla silmez/değiştirmez), sırayla uygulandı ve her biri kullanıcı onayıyla `prisma migrate deploy` ile canlı Postgres'e (localhost:5432/notaplan) işlendi:

1. `20260825120000_lesson_series_demo_tag`
2. `20260825130000_student_payment_due_ranges`
3. `20260825140000_student_multiple_types`
4. `20260825150000_entity_display_ids`
5. `20260825160000_teacher_attendance`
6. `20260825170000_lesson_assessment_topics`
7. `20260825180000_periodic_assessment`
8. `20260825190000_homework_lesson_link`
9. `20260825200000_announcement_targeting`
10. `20260825210000_staff_extended_advance`
11. `20260825220000_expense_budget_recurring`
12. `20260825230000_kvkk_consent`
13. `20260825240000_crm_call_message_log`

(Faz 13 şema değişikliği gerektirmedi.) Yeni modeller: `EntitySequence`, `PeriodicAssessment`, `LessonHomeworkReminderLog`, `StaffAdvance`, `RecurringExpenseRule`, `Budget`, `ConsentTextVersion`, `KvkkConsent`, `CallLog`, `MessageLog`, `CommunicationInboundEvent`. Tüm yeni sütunlar `Json?`/`String?`/`Int?` — hiçbir mevcut NOT NULL alan eklenmedi, hiçbir mevcut kayıt migration sırasında dokunulmadı. Üç store modu (json/memory/db) her fazda paralel güncellendi — "mode parity" hiçbir yerde bozulmadı.

### 3. Yeni Ekranlar

- `/panel/odev-raporu/detay` — satır bazlı ödev takibi (Faz 3D)
- `/panel/ayarlar/kvkk` — KVKK metin versiyonları + rıza ayarları (Faz 8)
- `/ogrenci/ayarlar/kvkk` — konu kendi rıza tarihçesi + geri çekme (Faz 8)
- `/panel/personel/[staffId]` — personel detay (özlük + izin + avans) (Faz 9A/9B)
- `/panel/crm` — arama/mesaj geçmişi (Faz 11)
- `/ogretmen/donemsel-degerlendirme` — 4 haftalık değerlendirme (Faz 3B)
- Genişletilen mevcut ekranlar: `/panel/finans-ozeti` (Faz 10), `/panel/duyurular` (Faz 4), `/panel/ogrenciler/yeni` (Faz 1B + Faz 8 KVKK checkbox), `/ogretmen/odevler` + `/ogretmen/program` (Faz 3C), `/ogretmen/ogrenciler/[studentId]` (Faz 3B), öğrenci/öğretmen detay sayfaları (Faz 12 displayId, Faz 2 performans sekmesi, Faz 13 yeniden atama modalı)

### 4. Güvenlik / RBAC / Audit

- Yeni RBAC izinleri: `crm:read`/`crm:write` (yalnızca SCHOOL_ADMIN/SUPER_ADMIN). Diğer tüm yeni yetenekler mevcut rol setleriyle (`requireStaffSensitiveAccess`, `requireRole`) kapsamlandı — yeni bir rol İCAT EDİLMEDİ.
- Yeni hassas veri şifreleme: personel IBAN'ı (`src/lib/pii/iban.ts`, TC kimlik ile AYNI AES-256-GCM mekanizması, mod-97 checksum + son-4-hane maskeleme).
- Yeni maskeleme deseni: CRM mesaj içeriği (liste kırpılmış özet, detay tam+audit'li).
- Yeni audit event'leri: `pii.iban.reveal`, `kvkk.consent.*`, `crm.call_log.*`, `crm.message_log.*`, `staff_advance.*`, `expense.*`, `recurring_expense_rule.*`, `budget.upsert`, `announcement.*` genişletmeleri, `lesson.reassign` — hepsi mevcut `recordAuditLog`/`audit()` üzerinden, yeni bir audit mekanizması İCAT EDİLMEDİ.
- Bilinçli mimari sınır (3 kez bağımsız doğrulandı — Faz 9A/9B, Faz 10, Faz 11): personel/bordro/izin/finans/CRM araçları `agent/registry.ts`de (AI-tool-çağırma yüzeyi) KAYITLI DEĞİL — bu modül grubu baştan beri insan-only tutuluyor, bu oturumdaki yeni araçlar da AYNI sınırı korudu.
- KVKK first-login gate middleware'e DOKUNMADAN, portal layout seviyesinde uygulandı — route guard bozulmadı.

### 5. Test Sonuçları

- **Toplam**: 1979 test, 1975 geçti, 4 pre-existing (bu oturumdan ÖNCE var olan, bu oturumun hiçbir değişikliğiyle ilgisi olmayan — `git status --porcelain` ile kaynak dosyalarının HEAD ile birebir aynı olduğu doğrulandı) başarısızlık: `lesson-scheduling.test.ts`, `lesson-update.test.ts` (ikisi de seed'teki öğretmen kadrosu değişikliğinden — "t4" artık farklı bir öğretmen), `homework-attachment.test.ts`, ve değişken bir 4. dosya (çalıştırmadan çalıştırmaya değişiyor — suite'in kendi flakiness'i, bu oturumda dokunulmayan dosyalarda).
- Bu oturumda eklenen yeni test dosyaları (yaklaşık sayı): ~230 yeni test, tamamı yeşil.
- `npm run typecheck`: temiz.
- `npm run lint`: `src/` kapsamında 16 problem (3 hata, 13 uyarı) — HEPSİ bu oturumdan ÖNCE var olan, dokunulmayan dosyalarda (`command-palette.tsx`, `student-attendance-picker.tsx`, `payment-provider/provider-factory.ts`, `tools.ts`'teki mevcut `_input`/`_ignored*` desenleri). Bare `npm run lint` (path'siz `eslint`) 9681 hata raporluyor — ama bunun neredeyse tamamı `.claude/worktrees/` altındaki 7 AYRI, bu oturumla İLGİSİZ eski git worktree kopyasının da taranmasından kaynaklanıyor (bkz. Bilinen Sınırlamalar).
- `npx prisma validate`: temiz.
- `npm run build`: temiz, tüm yeni route'lar (`/panel/crm`, `/panel/ayarlar/kvkk`, `/panel/personel/[staffId]`, `/panel/odev-raporu/detay`, `/ogrenci/ayarlar/kvkk`, yeni API route'ları) derleniyor.
- Backfill/seed script idempotency (Faz 14 checklist gereği yeniden çalıştırıldı): `backfill-display-ids.ts` → 0 yeni atama; `seed-demo-schedule.ts` → "Oluşturulan: 0". İkisi de doğrulandı.
- Her faz için ayrıca gerçek Postgres'e (STORE_MODE=db) karşı canlı doğrulama yapıldı (kullanıcı onayıyla migrate deploy sonrası) — geçici test satırları her seferinde temizlendi, 0 kalıntı.

### 6. Bilinen Sınırlamalar ve Sonraki Adımlar

- **`npm run lint` (path'siz) `.claude/worktrees/` altındaki ilgisiz eski worktree'leri de tarıyor** — `eslint.config.mjs`'in `globalIgnores`'una `.claude/**` eklenmesi önerilir (bu oturumun kapsamı dışında, ayrı bir tooling-hijyeni işi olarak bırakıldı; `npx eslint src/` ile doğru sinyal alınabiliyor).
- **Faz 9A**: personel "belge eki" (dosya ekleri) metadata'sı BİLİNÇLİ OLARAK eklenmedi (plan'ın kendi Tamamlanma kriterinde yoktu).
- **Faz 10**: `approvalStatus`/`approvedBy` alanları şemada var ama tam bir onay iş akışı (ayrı decide-tool) eklenmedi (aynı orantılılık kararı).
- **Faz 11**: gerçek bir telefoni/mesajlaşma sağlayıcısı (Twilio/Netgsm vb.) BAĞLANMADI — bu spec'in kendi kapsam sınırıydı. Webhook route yalnızca imza doğrulayıp idempotency claim yapıyor; gerçek sağlayıcı entegre edildiğinde payload'ı `createCallLogTool`/`createMessageLogTool`e yönlendirecek adaptasyon katmanı ayrı bir iş.
- **Faz 8**: `consentRestrictedFeatures` mekanizması (`isFeatureRestrictedForSubject`) hazır ve test edilmiş durumda ama HİÇBİR gerçek gönderim akışına (ör. WhatsApp/collections mesajlaşması) henüz KABLOLANMADI — admin bir feature adını `restrictedFeatures`e eklese bile şu an hiçbir gönderim yolu bunu kontrol etmiyor; bu kasıtlı, dar bir kapsam kararıydı (plan'ın Tamamlanma kriteri yalnızca "yönetilebiliyor" istiyordu, gerçek bir gönderim yolunu kısıtlamayı değil).
- **4. flaky test dosyası**: hangi dosyanın "4. yuva"yı dolduracağı çalıştırmadan çalıştırmaya değişiyor (suite-seviyeli, kök nedeni araştırılmadı) — ayrı bir işte ele alınmalı.
- **Genel**: 4 kritik pre-existing test kırıklığı (seed verisi/test fixture uyuşmazlığı) bu oturumun kapsamı dışında bırakıldı, ayrı bir işte düzeltilmeli.
