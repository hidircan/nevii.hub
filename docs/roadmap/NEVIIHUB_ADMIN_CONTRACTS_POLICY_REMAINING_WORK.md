# NeviiHub — Sözleşme/Politika Alanında Kalan İşler

Bu dosya, 2026-2027 sözleşme kaynağı görevinde bilinçli olarak kapsam dışı bırakılan veya sahibi/hukuk kararı bekleyen kalemleri takip eder.

## P1 — ID: PORTAL-CONTRACT-001

**Başlık:** Öğrenci/Veli Portalından Sözleşme ve İzin Belgelerine Erişim
**Öncelik:** P1
**Durum:** TAMAMLANDI (sözleşme + KVKK + fotoğraf/video rıza erişimi); yalnızca KVKK/foto-video *belgelerinin* (PDF) kendisi hâlâ P1

**Zaten mevcut ve doğrulanmış (bu görevden ÖNCE de vardı):**

- `/ogrenci/sozlesmelerim` (`/veli/sozlesmelerim` buraya yönlendirir — "Karma Öğrenci Portalı": ayrı bir PARENT rolü YOK, veli STUDENT rolüyle + `StudentPortalAccess.accessType="GUARDIAN"` ile giriş yapar) güncel VE geçmiş TÜM sözleşme sürümlerini, taksit takvimini, durumu listeler.
- Erişim `listStudentContractsTool`/`getContractHtmlTool` → `canAccessStudent` → `hasActiveStudentAccess` ile gerçek zamanlı doğrulanır (JWT'de cache'lenmez, erişim iptali bir sonraki istekte hemen etkilidir); öğretmen bu sayfalara HİÇ erişemez.
- `/sozlesme-yazdir/[contractId]` yetkilendirmesi URL GİZLİLİĞİNE değil, her istekte sunucu tarafı `canAccessStudent` kontrolüne dayanır — ID tahmin edilebilir olsa bile yetkisiz erişim reddedilir (doğru IDOR savunması: gizlilik değil, yetkilendirme).
- `/ogrenci/ayarlar/kvkk` — konu (öğrenci veya veli, `accessType`'a göre `subjectType` ayrımıyla) KENDİ KVKK rıza tarihçesini görür VE geri çekebilir (`actionWithdrawKvkkConsent`).

**Bu görevde TAMAMLANDI:**

- `/ogrenci/ayarlar/foto-video` — yeni portal sayfası, `/ogrenci/ayarlar/kvkk` ile AYNI desen: konu KENDİ fotoğraf/video rıza tarihçesini (5 kanal dahil) görür, "geleceğe etkili" geri çekebilir (`actionWithdrawSocialMediaConsent` → `withdrawSocialMediaConsentTool`).
- `getSocialMediaConsentTool`/`listSocialMediaConsentHistoryTool` STUDENT rolüne (kendi/veli sahipliği `assertStudentAccess` ile doğrulanarak) açıldı — daha önce yalnızca staff/öğretmen erişebiliyordu, öğrenci/veli KENDİ rızasını bile göremiyordu.
- Yeni `withdrawSocialMediaConsentTool` — bilinçli olarak DAR bir yüzey: konunun mevcut kaydını yalnızca `withdrawn` durumuna taşır, `setSocialMediaConsentTool`'un (staff-only) serbest representativeName/relationship/scopes girişini STUDENT rolüne AÇMAZ (bu, konunun kendi adına keyfi yeni bir rıza satırı uydurmasına izin verirdi).
- `/ogrenci/sozlesmelerim` sayfasına her iki rıza sayfasına (KVKK + foto-video) link eklendi — önceden `/ogrenci/ayarlar/kvkk` hiçbir yerden linklenmiyordu (yetim sayfa), şimdi ikisi de keşfedilebilir.
- 5 yeni test (`social-media-consent.test.ts`) — STUDENT self-erişim, yabancı öğrenciye erişim reddi, geri çekme, zaten-geri-çekilmiş/kayıt-yok hata yolları.
- **Yan bulgu, düzeltildi:** `socialMediaConsentSchema` (validation.ts) zod enum'u yeni 3 kanalı (`print_materials`/`digital_ads`/`in_house_board`) içermiyordu — `SocialMediaScope` TS tipine eklenmişti ama bu zod şeması güncellemeyi KAÇIRMIŞTI, bu yüzden `setSocialMediaConsentTool` bu kanallarla SESSİZCE `VALIDATION_ERROR` ile reddediyordu (test yazarken yakalandı, düzeltildi).

**Hâlâ eksik (gerçek P1 kapsamı, bu görevde YAPILMADI):**

- KVKK/Foto-Video *belgelerinin* (PDF) portaldan görüntülenmesi mümkün değil — çünkü bu iki belge türü henüz hiçbir akışa bağlı değil (bkz. aşağıdaki "KVKK/Foto-Video belge otomatik üretim wiring'i" — bu ikisi birbirine bağımlı: belge üretilmeden portal onu gösteremez). Portalda artık rıza KAYDI (kim/ne zaman/hangi kanal) görünüyor, ama imzalı/üretilmiş BELGENİN kendisi değil.
- **DOĞRULANDI (üçüncü artış, kod incelendi):** `session.studentId || "s1"` düşüşü GÜVENLİK açığı DEĞİL (`s1` fallback yalnızca `studentId` tamamen boşsa devreye girer, ki bu geçerli bir JWT için beklenmez — `jwt.ts`/`authenticate.ts` `claims.studentId`'yi `user.studentId`'den doğrudan taşır). Asıl bulunan gerçek kısıt: `StudentPortalAccess` modeli (bkz. `student-portal-access.ts`) bir kullanıcının BİRDEN FAZLA öğrenciye (ör. 2 çocuklu bir veli) aktif erişimini ZATEN destekliyor (`listAccessForUser(tenantId, userId)` TÜM aktif kayıtları döner) — AMA bu fonksiyon `src/app/` veya `src/components/` içinde HİÇBİR YERDE çağrılmıyor (grep ile doğrulandı, sıfır kullanım). Sonuç: tüm `/ogrenci/*` sayfaları (sözleşmeler, KVKK, foto-video, ödevler, müfredat — TAMAMI) `session.studentId` TEK bir öğrenciye sabittir; 2+ çocuklu bir veli PORTALDA ÇOCUK DEĞİŞTİREMEZ (yalnızca `user.studentId`'ye kayıtlı öğrenciyi görür, veri sızıntısı YOK, sadece erişilemeyen bir özellik). Bu, 2026-2027 sözleşme görevinin YENİ bir regresyonu DEĞİLDİR — portalın TÜMÜNÜ etkileyen, önceden var olan sistemik bir kısıttır; düzeltmesi (bir "öğrenci seçici" + TÜM `/ogrenci/*` sayfalarının `listAccessForUser` sonucuna göre çalışması) bu görevin kapsamının çok ötesinde, ayrı bir P1/P2 iş kalemidir.

## P1 — Şablon aktivasyon ekranında hukuki metin tutarsızlığı kontrolü

`docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`'de belgelenen telafi-süresi
uyuşmazlığı gibi durumlar için "Şablonu Aktifleştir" ekranı şu anda YAPISAL bir
kontrol yapmıyor (yalnızca placeholder eksikliğini kontrol ediyor,
metin/operasyonel-politika tutarlılığını DEĞİL). Bu görevde eklenmedi — ayrı bir
iş kalemi: aktivasyon öncesi bilinen hukuki tutarsızlık raporlarına (bu türden
dosyalara) karşı bir kontrol listesi/uyarı göstermek.

## P1 — KVKK/Foto-Video belge otomatik üretim wiring'i

`kvkk` ve `parent_social_media_consent` `DocumentTemplate` türlerinin varsayılan gövdeleri bu görevde kaynak metne göre güncellendi (bkz. `2026_2027_CONTRACT_DOCUMENT_TYPE_MAPPING.md`) ama hiçbir çağıran kod bu türler için otomatik `createDocumentInstance` ÇAĞIRMIYOR — yalnızca "Sözleşme Şablonları" ekranından manuel şablon düzenleme ile erişilebilirler. Öğrenci kaydı/sözleşme oluşturma akışına bu iki belgenin (önizleme + yazdırma + KVKK teslim/foto-video rıza durumuyla otomatik doldurma) bağlanması ayrı bir iş kalemidir.

## Sahibi/hukuk kararı — NİHAİLEŞTİRİLDİ (2026-08-29)

Aşağıdaki 4 madde, sahibinin "NEVIIHUB — FINAL OWNER POLICY DECISIONS" talimatıyla
**nihai olarak karara bağlandı** ve bu oturumda koda uygulandı. Aşağıda önceki
DECISION_REQUIRED metinleri, NİHAİ KARAR notuyla birlikte tarihsel referans için
korunuyor.

1. **Havale/nakit ödeme penceresi** — **NİHAİ KARAR: 1–15 dahil** (6-15 değil,
   "en geç 15" belirsizliği değil). Uygulandı: `resolveContractPaymentDueRule`
   (`src/lib/contracts.ts`) ve `describePaymentDueRule`
   (`src/lib/payment-due-rule-client.ts`) ruleText'i "Havale/EFT/nakit ödemeleri
   her ayın 1–15’i arasında yapılmalıdır." olarak güncellendi; pencere-içi
   kontrolü (`firstDueDay >= windowStartDay && firstDueDay <= windowEndDay`,
   zaten `windowStartDay=1` idi) davranışsal olarak DEĞİŞMEDİ — yalnızca
   kullanıcıya gösterilen METİN "en geç 15'ine kadar" belirsizliğinden "1–15
   arasında" netliğine hizalandı. `contract-panel.tsx` istisna hata metni de
   güncellendi. Tarihsel sözleşme snapshot'ları DOKUNULMADI.
2. **KDV varsayılanı** — **NİHAİ KARAR: tüm müşteriye-görünür fiyatlar HER ZAMAN
   KDV dahil.** Zaten varsayılan davranış buydu (`vatInclusive` undefined/true
   → "Dahil"); hiçbir yerde "+ KDV" gösterilmiyordu (doğrulandı, grep temiz) ve
   hiçbir oran icat edilmedi. Bu oturumda eklenen: sözleşme ödeme planı
   önizlemesine (`contract-panel.tsx`) açık "Tüm eğitim ücretleri KDV dahildir."
   metni eklendi. Sözleşmenin kendi hukuki MADDE 4 metni (kaynağın "KDV: Dahil ☐
   Hariç ☐" checkbox formatı) SESSİZCE değiştirilmedi — yalnızca `{{vatStatusText}}`
   placeholder'ı zaten "Dahil" değerini taşıyordu, bu korundu.
3. **Telafi kotası — dönem** — **NİHAİ KARAR: (A) — 2026-2027 eğitim yılının
   TAMAMI boyunca öğrenci başına toplam en fazla 2 hak**, Güz+Yaz AYRI AYRI 2+2
   DEĞİL. Uygulandı: `src/lib/makeup-quota.ts` `periodKeyForLesson`/
   `getStudentMakeupQuota` artık yalnızca `academicYearStart` kullanıyor,
   `term` (Güz/Yaz) bileşeni kota anahtarından TAMAMEN çıkarıldı; aynı değişiklik
   `src/lib/store-db.ts` `assertStudentMakeupQuotaTx`'e de uygulandı (üç store
   modu paritesi korundu). Zorunlu UI metni uygulandı: `formatMakeupQuotaLabel`
   artık `"<yıl>-<yıl+1> eğitim dönemi için kalan telafi hakkı: X / 2"` döner
   (yıl `resolveLessonAcademicPeriod`'dan DİNAMİK türetilir, hiçbir yerde sabit
   yazılmadı). Yenileme aynı eğitim yılı içindeyse kota SIFIRLANMAZ (kota zaten
   `academicYearStart`'a bağlı, sözleşme/yenileme olayına değil).
4. **Telafi süresi — 30 gün mü, ay içi mi** — **NİHAİ KARAR: 30 takvim günü,
   orijinal kaçırılan ders tarihinden.** Mevcut kod (`addDays(lesson.startAt,
   makeupWindowDays)`, üç store modunda) zaten bu kuralı uyguluyordu —
   DEĞİŞTİRİLMEDİ. Kaynak sözleşme metninin "iptalin gerçekleştiği ay içinde"
   ifadesiyle ÇELİŞTİĞİ resmi olarak belgelendi:
   `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`. Kaynak `.md` dosyası
   SESSİZCE değiştirilmedi; yeni taslak şablonun bu uyuşmazlık çözülmeden
   aktifleştirilmemesi gerektiği o raporda açıkça işaretlendi.

5. **Aynı gün öğrenci/veli iptali — güvenilir veri modeli (uygulanmadı, yalnızca tasarım, hâlâ P1)** — MADDE 8: *"Aynı gün içerisinde bildirilen ders iptalleri, zorunlu ve belgelendirilebilir bir mazeret bulunmadığı sürece, işlenmiş ders olarak kabul edilir ve telafi hakkı verilmez."* Önceki bir oturumda bunu `markedAt` (personelin yoklamayı İŞLEME zamanı) ile ders tarihini kıyaslayan bir heuristic ile uygulamaya çalıştım; test suite'i (`makeup-quota-concurrency.test.ts`) bunun NORMAL devamsızlık akışının TAMAMINI (yoklama neredeyse her zaman dersle aynı gün işlenir) yanlışlıkla telafi dışı bıraktığını kanıtladı, bu yüzden GERİ ALINDI. Kaynak metne göre doğru çözüm, "yoklama işaretlenmesi" ile "iptal BİLDİRİMİ" kavramlarını AYIRAN yeni bir veri modeli — kod YAZILMADI, yalnızca tasarım öneriliyor:
   - Yeni bir `LessonCancellationNotice` (veya `Attendance` üzerine ek alanlar) kaydı: `cancellationSource` (`student` \| `guardian` \| `teacher` \| `institution`), `reportedAt` (gerçek bildirim zaman damgası — personelin yoklamayı işleme zamanından AYRI, olay anında/olabildiğince yakın girilir), `institutionTimezone` sabit "Europe/Istanbul" (mevcut `src/lib/timezone.ts` ile paylaşılır), `recordedByUserId` (kaydı giren personel), `reason` (zorunlu, serbest metin), `evidenceDocumentId?` (mevcut güvenli belge ekleri pipeline'ına referans, ör. rapor/mazeret belgesi — Madde 8 "belgelenebilir mazeret" gerektirir), `auditLogId`.
   - Server-side kural: `toZonedYmd(reportedAt, tz) === toZonedYmd(lesson.startAt, tz)` VE `evidenceDocumentId` yoksa (zorunlu/belgelenebilir mazeret YOKSA) → `createsMakeupCredit = false`, açık Türkçe mesaj ("Aynı gün bildirilen iptaller, belgelenebilir zorunlu mazeret olmadan telafi hakkı doğurmaz — Madde 8"), ders/yoklama kaydı SİLİNMEZ.
   - UI: personel yoklama ekranında "Devamsız/İptal" işaretlerken AYRI bir "İptal ne zaman bildirildi?" alanı (varsayılan: şimdi, ama geriye dönük düzeltilebilir) + "Zorunlu/belgelenebilir mazeret var mı?" seçeneği (varsa belge yükleme) sunmalı — bu, mevcut `markAttendanceTool`/yoklama ekranına YENİ bir adım ekler, kapsamı bu oturumda GENİŞLETİLMEDİ.
   - Bu model kaynağın MADDE 8/7 gerekliliğini (aynı gün iptal = işlenmiş ders, zorunlu mazeret istisnası) heuristic/tahmin OLMADAN, güvenilir ve denetlenebilir şekilde karşılar. Uygulama ayrı bir iş kalemi olarak P1'e bırakılıyor.

## P1 — İlk ödeme ASIL kayıt sınırına taşındı (2026-08-30) — TAMAMLANDI

`createStudentTool` (`src/lib/services/tools.ts`) HER formal kayıt için `firstPaymentCollected`
zorunlu kılar — bkz. `docs/contracts/FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md` §0. Öğrenci
oluşturulur oluşturulmaz `paid` bir `Payment` (`source:"registration_first_payment"`) yazılır.

**Önceden burada "çözülmemiş" olarak işaretlenen çift-tahsilat riski AYRI bir P0 görevinde
ÇÖZÜLDÜ** (aşağıdaki eski metin — tarihsel referans için korunuyor — `createContract`'ın kendi
`firstPaymentCollected` zorunluluğunu KORUDUĞUNU varsayıyordu, bu artık DOĞRU DEĞİL):
`createContract`, `contractType==="initial"` için artık kendi `firstPaymentCollected` girdisini
KULLANMAZ — `getRegistrationFirstPayment(studentId)` ile kayıt anında zaten oluşturulmuş
`registration_first_payment` satırını BULUR, tutarını doğrular, ve `addContractInstallments`'a
`reuseFirstPaymentId` ile REFERANS verir (`store-json.ts`/`store-db.ts`/`store-memory.ts` — 1.
taksit için YENİ satır YARATMAZ, mevcut satırı `contractId`/`installmentSequence=1` ile GÜNCELLER).
Kayıt anı ile sözleşme anı arasında İKİ AYRI Payment satırı ARTIK OLUŞMAZ. Yenileme
(`contractType==="renewal"`) BİLİNÇLİ OLARAK bu davranışın DIŞINDA — kendi yeni tahsilat anını
temsil eder, kayıt anındaki ödemeden bağımsızdır (ürün kararı, DEĞİŞMEDİ).

Doğrulama: `docs/contracts/FIRST_PAYMENT_DUPLICATION_PREVENTION_REPORT.md` (2026-08-30, şablon
seçimi P0 işiyle aynı oturumda regresyon olarak yeniden doğrulandı) ve
`src/lib/__tests__/contracts.test.ts` "Owner policy (2026-08-30, final)" describe bloğu.

<details>
<summary>Eski metin (tarihsel referans — artık geçerli değil)</summary>

Çözülmemiş etkileşim — ayrı takip gerektirir: `createContract` (`src/lib/contracts.ts`) hâlâ
KENDİ `firstPaymentCollected` zorunluluğunu taşıyor (FORMAL initial/renewal, ≥3 ay). Bir öğrenci
artık kayıt anında zaten bir ilk ödeme tahsil etmiş olacağından, o öğrenci için formal sözleşme
oluşturulduğunda personel AYNI parayı ikinci kez "tahsil edildi" olarak girmek zorunda kalabilir —
bu gerçek bir çift tahsilat DEĞİL (iki ayrı `Payment` satırı oluşur, ikisi de gerçek olabilir ama
aynı gerçek-dünya ödemesini temsil ediyor olma ihtimali var) ama kafa karıştırıcı/hatalı veri
girişine açık. Önerilen çözüm (uygulanmadı): `createContract`, ilgili öğrenci için zaten bir
`source:"registration_first_payment"` kaydı varsa VE bu sözleşme o öğrencinin İLK (initial)
sözleşmesiyse, kendi `firstPaymentCollected` zorunluluğunu bu kayda referans vererek atlamalı.

</details>

## P1 — Aktif şablon seçimi sertleştirildi (2026-08-30) — TAMAMLANDI; kalan takip kalemleri

Ayrıntı: `docs/contracts/ACTIVE_TEMPLATE_SELECTION_P0_INCIDENT_REPORT.md`. Özet:
`selectActiveTemplateOfKind` artık `active===true` filtresini KENDİSİ garanti eder (çağırana
güvenmez); yeni `selectEligibleActiveTemplateForContract` tek, tipli giriş noktası eklendi
(uygun aktif+eksiksiz şablon yoksa standart Türkçe hata döner). Canlı çağrı yollarında (hepsi
`listTemplates()` ile önceden aktif-filtrelenmiş besleniyordu) bir yanlış-şablon OLAYI
GÖZLEMLENMEDİ — düzeltme, gelecekteki bir çağıranın bu ön koşulu unutmasına karşı mimari
sertleştirmedir.

**Kalan takip kalemleri (bu görevde bilinçli olarak kapsam dışı bırakıldı):**

- **Genel arşiv/geri-aç ucu exclusive değil:** `archiveDocumentTemplateTool`/`archiveTemplate`
  (tüm belge türleri için ortak uç nokta) "Geri Aç" işleminde `activateTemplateExclusive`'i
  KULLANMIYOR — teorik olarak aynı tür için 2. bir `active:true` satırı yeniden yaratabilir.
  Seçim artık sertleştirildiği için bu durumda YANLIŞ (inactive) bir şablon YİNE DE seçilmez,
  yalnızca "en son güncellenen active" belirsizliği geri gelebilir. Öneri: bu uç noktanın
  `active:true`'ya geçiş dalını da `activateTemplateExclusive` üzerinden yönlendirmek (yalnızca
  tek-aktif garantisi gereken türler için, ör. `student_enrollment_contract`).
- **UI netliği eksik:** "Evraklar → Sözleşme Şablonları" ekranında Aktif/Taslak/Arşivlendi/Geçersiz
  durumları için ayrı, görsel rozetler yok (şu an yalnızca metin içinde "· Arşivlendi" notu var);
  aktivasyon öncesi eski→yeni karşılaştırmalı onay diyaloğu yok; teknik template ID'ler birincil
  etiket olarak kullanılıyor (`document-template-manager.tsx`, `contract-template-diagnostics.tsx`).
  Kapsamlı bir UI/UX işi — ayrı bir P1/P2 iş kalemi.
- **Hukuki metin, "ilk ödeme kayıt anında alınır" politikasını açıkça YANSITMIYOR:** aktif şablon
  (`dtpl_jfpy6i01m1de`) gövdesinde "İlk ödeme"/"ilk taksit" ifadesi geçmiyor (yalnızca genel
  "kayıt sırasında bildirilen ödeme gününde... her ay düzenli olarak alınır" cümlesi var). Kod
  seviyesinde politika zaten zorunlu kılınıyor (`FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`)
  ama hukuki metin buna göre GÜNCELLENMEDİ — owner/hukuk kararı gerektirir, bu görevde hukuki
  metin DEĞİŞTİRİLMEDİ.
- **`titleSub` placeholder'ı registry'de eksik:** aktif şablon gövdesi `{{titleSub}}` kullanıyor
  ve `contracts.ts` bunu fiilen dolduruyor, ama `STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS`
  listesinde YOK — `findUnsupportedPlaceholders` bunu (yanlışlıkla) "desteklenmeyen" olarak
  işaretliyor. Küçük, düşük riskli bir kayıt-tamlığı düzeltmesi — bu görevde YAPILMADI (kapsam
  dışı, ayrı bir küçük PR'a bırakıldı).

## `assertOk`-throw deseni — TAMAMLANDI (2026-08-29, final güncelleme)

P0 "Invalid input" olayının kök nedeni (`assertOk` throw eder + form `useActionState` YOK bir `<form action=...>` ile bağlı → herhangi bir doğrulama hatası yakalanmamış runtime hatası olarak sızar) artık `src/lib/actions.ts`'teki TÜM GERÇEKTEN RİSKLİ çağrı yerlerinde düzeltildi: `actionAddStudent`, `actionAddTeacher`, `actionMarkAttendance`, `actionAddPayment`, `actionAddRoom`, `actionAddBranch`, `actionUpdateBranch`, `actionGenerateSuggestions`, `actionConfirmSlot`, `actionCancelMakeup`, `actionCreateTaskForm` (11 action). Ayrıca `actionMarkPaymentPaid` (aynı desen ama hiçbir UI'dan çağrılmıyordu — tamamen `actionMarkPaymentPaidDetailed`'in süperseti) ölü kod olarak SİLİNDİ.

**Kapsam dışı bırakılan, ama İNCELENİP GÜVENLİ olduğu doğrulanan 2 kalan `assertOk` kullanımı:** `actionResetDemo`/`actionResetToCleanTemplate` AYNI deseni taşıyor GİBİ görünüyordu ama incelemede ortaya çıktı ki bunlar `<form action=...>` ile DEĞİL, `SetupResetAction` bileşeninin `useTransition` + try/catch sarmalayıcısı üzerinden ÇAĞRILIYOR — bu sarmalayıcı zaten throw'u doğru şekilde yakalayıp `error` state'inde gösteriyor. Bu ikisi GERÇEKTEN risksiz, DÜZELTME GEREKMİYOR — düzeltme deseni HAZIR olsa da (paylaşılan `ToolValidationFailure`/`fieldErrorsFromZodFlatten` altyapısı) bu iki action'a uygulamak GEREKSİZ olurdu (ponytail: "bunun var olması gerekiyor mu?" — hayır).

**Uygulama genelinde nihai tarama (2026-08-29) — başka örnek YOK.** `grep -rn '<form\s*$\|<form action='` ile `src/app/` ve `src/components/` tamamı ikinci kez tarandı (30+ ek form: `crm/page.tsx`, `finans-ozeti/page.tsx`, `personel/*`, `ayarlar/kvkk`, `ogrenci/ayarlar/*`, `package-manager.tsx`, `staff-manager.tsx`, `instrument-catalog-manager.tsx`, `staff-detail-form.tsx`, `task-detail-panel.tsx`, `kvkk-consent-gate.tsx`, `sozlesmeler/page.tsx`). Her birinin bağlı olduğu action tek tek `actions.ts`'te okunarak doğrulandı: HİÇBİRİ throw etmiyor — hepsi zaten `{ok:false, message}` döndüren "graceful" desenle yazılmış (Faz 8+ döneminde eklenmiş modüller, `ToolValidationFailure` altyapısından ÖNCE de zaten doğru desendeydi). Bu, orijinal P0 hatasının kapsamının artık TAM OLARAK haritalandığını ve başka gizli örnek kalmadığını doğrular.

## Zaten doğru olduğu doğrulanmış (bu görevde dokunulmadı)

- Ödeme kuralı metni motoru (`resolveContractPaymentDueRule`), "İstisnai ilk ödeme tarihi gerekçesi" akışı.
- Yenileme borç kapısı (`computeOutstandingContractBalance`, `RenewalDebtBlockedError`).
- Draft/aktif şablon ayrımı, tek-aktif-şablon garantisi, aktivasyon audit'i.
- Sözleşme snapshot/versiyon zinciri, iptal/superseded koruması.
- Güvenli tarih ayrıştırma (`date-input.ts`) — boş tarih `toISOString()` çökmesi yok.
- Ödeme duraklatma (payment pause) veri modeli ve tool'ları (UI wiring'i hâlâ eksik — `NILUFER_ACAR_PAYMENT_MAKEUP_POLICY_IMPLEMENTATION_REPORT.md`'de zaten not edilmişti, bu görevin kapsamı dışında).

## Owner policy (2026-08-29, ayrı görev) — İlk ödeme her zaman kayıt esnasında alınacaktır — TAMAMLANDI

Ayrıntılı tasarım/uygulama: `docs/contracts/FIRST_PAYMENT_AT_REGISTRATION_POLICY_REPORT.md`. Özet:

- `createContract` (`src/lib/contracts.ts`) artık FORMAL (≥3 ay) initial/renewal sözleşmeler için
  `firstPaymentCollected` (yöntem/tutar/tarih/opsiyonel referans-not) ZORUNLU kılıyor — eksikse
  "İlk ödeme kayıt sırasında tahsil edilmeden kayıt tamamlanamaz." ile reddediliyor. Tutar, GERÇEK
  hesaplanan 1. taksitle eşleşmeli (sahte kayıt önlenir). Tarih varsayılan olarak kayıt tarihiyle
  aynı olmalı — farklıysa mevcut `firstPaymentExceptionReason` (yetkili personel gerekçesi)
  zorunlu — bu, ÖNCEDEN VAR OLAN "taksit vade penceresi" (kart 1–5/diğer 1–15) kontrolünden
  YAPISAL olarak AYRI tutuldu (aynı gerekçe alanını paylaşırlar ama tetikleyicileri bağımsızdır).
- Üç store modu (json/db/memory) paritesi korunarak `addContractInstallments` 1. taksiti doğrudan
  `paid` yaratıyor; `contract.first_payment_collected` audit olayı eklendi.
- `contract-panel.tsx`'e yeni "İlk Ödeme / Kayıt Anı Tahsilatı" grup alanı eklendi (yalnızca
  formal sözleşmelerde görünür).
- **Kapsam kararı (owner onayı istenebilir)**: zorunluluk yalnızca FORMAL (≥3 ay) initial/renewal
  sözleşmelere uygulandı; trial (1-2 ay) ve amendment kapsam DIŞI bırakıldı (gerekçe: görev
  talimatının kendisi "formal/paid enrollment" diyor; trial zaten ayrı, daha hafif bir rejime
  sahip). Owner trial için de zorunlu kılınmasını isterse tek satırlık bir koşul değişikliği
  yeterli (`isFormalContractDuration` kontrolünün kaldırılması).
- **Kalan iş kalemleri**: `Payment.reference`/`Payment.collectorNote` için ayrı Prisma
  kolonu/migration YOK (şu an yalnızca description metni + audit kaydında saklanıyor); PDF şablon
  gövdesine "ilk ödeme yöntemi/referansı" için ayrı placeholder eklenmedi (mevcut
  `{{taksit1Tutar}}`/`{{taksit1Tarih}}` zaten doğru veriyi taşıyor); mobil app dokunulmadı.

## P0 CONTRACT OPERABILITY / DOCX / PRINT paketi (2026-08-30) — TAMAMLANAN

Ayrıntılı raporlar: `REGISTRATION_DURATION_DATA_FLOW_REPORT.md`,
`TEMPLATE_EDITOR_AND_DOCX_WORKFLOW_REPORT.md`, `CONTRACT_PRINT_DESIGN_REPORT.md`,
`CONTRACT_FORM_STATE_PRESERVATION_REPORT.md`, `STUDENT_PORTAL_CONTRACT_ACCESS_CHECK.md`.

- Kayıt Süresi veri akışı uçtan uca doğrulandı — `Contract.durationMonths` zaten tek kalıcı
  doğruluk kaynağı, yapısal sorun YOKTU. 5/7/8/9/10/11 aylık planlar için 6 yeni uçtan uca test
  eklendi (`contracts.test.ts`), hepsi geçti.
- Şablon "Düzenle" ekranındaki blank-screen hatası (önceki turdan) tekrar doğrulandı; AYRICA yeni
  bir gerçek hata bulunup düzeltildi: aktif şablonlar artık PATCH ile yerinde
  değiştirilMİYOR — düzenleme her zaman yeni bir taslak (`active:false`) üretiyor.
- DOCX-öncelikli şablon iş akışı UYGULANDI: `mammoth` bağımlılığı eklendi, `DocumentTemplate`'e
  additive migration (`sourceFileData`/`sourceFileName`/`sourceMimeType`/`sourceUploadedAt`/
  `sourceUploadedById`, UYGULANMADI), `POST /api/v1/documents/templates/docx-upload` +
  `GET /api/v1/documents/templates/[templateId]/source-file`, UI (yükle/indir). `.doc` açıkça
  reddediliyor, PDF düzenlenebilir kaynak olarak sunulmuyor. **Gerçek bir .docx dosyasıyla canlı
  tarayıcı denemesi henüz yapılmadı** (ortam kısıtı — bkz. aşağı).
- Sözleşme yazdırma sayfasına A4/Times New Roman/8pt/tablo-kenarlık/imza CSS'i eklendi. Gerçek
  "Sayfa X / Y" footer'ı tarayıcı `window.print()` motorlarında (Puppeteer olmadan) mümkün
  DEĞİL — dürüstçe belgelendi, tarayıcı-native "Headers and footers" fallback'i önerildi. Gerçek
  çözüm (Puppeteer/headless Chromium) AYRI bir altyapı kararı olarak aşağıya işlendi.
- **Yeni bulunan, gerçek bir render hatası düzeltildi**: 12'den kısa süreli sözleşmelerde
  kullanılmayan taksit satırları PDF'de boş görünüyordu (`stripUnusedInstallmentRows`,
  `src/lib/documents/index.ts`) — testle kanıtlandı.
- **Yeni bulunan, DÜZELTİLMEYEN bir hukuki-metin uyuşmazlığı**: aktif şablonun taksit tablosunda
  kaynağın (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md` satır 49) sahip olduğu "Ödeme Şekli" kolonu
  eksik. Hukuki metin riski nedeniyle bu turda YERİNDE değiştirilmedi — owner/hukuk onayı bekliyor.
- Form-state korunumu (hata sonrası veri kaybı) yeniden doğrulandı — zaten doğru uygulanmıştı,
  bu turun yeni alanları aynı güvenli deseni bozmadı.
- Öğrenci/veli portal sözleşme erişimi denetlendi, SAĞLAM — sidebar'daki admin kısayolu
  kaldırılması portal işlevselliğini ETKİLEMEDİ.

### P1 — bu turda ertelenen altyapı/tasarım kararları

- **Gerçek "Sayfa X / Y" PDF footer'ı**: Puppeteer (veya benzeri headless-Chromium tabanlı) bir
  sunucu PDF motoru kurulması gerekiyor — paket boyutu (~300MB), Vercel serverless soğuk
  başlatma/zaman aşımı etkileri değerlendirilmeli. Owner onayı gerektiren ayrı bir görev.
- **Ödeme tablosuna "Ödeme Şekli" kolonu eklenmesi**: kaynak metinle uyum için gerekli, ama
  hukuki metin değişikliği sayıldığından owner/hukuk onayı sonrası, mevcut güvenli
  "Yeni Taslak Sürüm Oluştur" akışı üzerinden yapılmalı.
- **Görsel/tarayıcı doğrulaması**: bu ortamda Playwright/Chrome kurulumu `sudo` gerektirdiğinden
  yapılamadı (gerçek Google Chrome kurulumu istiyor, chromium değil) — sahibinin/bir sonraki
  oturumun birkaç örnek sözleşmeyi tarayıcıda manuel yazdırma önizlemesinden geçirmesi önerilir.
- **DOCX yükleme akışının gerçek bir dosyayla canlı denemesi**: kod yolu statik olarak doğrulandı
  (tip kontrolü, build, mevcut güvenlik yardımcılarının yeniden kullanımı) ama gerçek bir .docx
  dosyasıyla tarayıcıda uçtan uca deneme yapılmadı (aynı ortam kısıtı).
